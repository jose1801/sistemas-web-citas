-- ============================================================
-- AGENDA DE CITAS — ESQUEMA COMPLETO PARA SUPABASE
-- ============================================================
-- Ejecutar este archivo completo en Supabase > SQL Editor.
-- Es seguro volver a ejecutarlo (usa IF NOT EXISTS / OR REPLACE).
-- ============================================================

-- Necesaria para el EXCLUDE constraint que evita citas duplicadas
create extension if not exists btree_gist;

-- ------------------------------------------------------------
-- 1. PROFILES
-- ------------------------------------------------------------
-- Un solo registro: la administradora. Se crea automáticamente
-- cuando se crea el usuario en Supabase Auth (ver trigger abajo).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null default 'Administradora',
  email text,
  created_at timestamptz not null default now()
);

-- Crea el perfil automáticamente al crear el usuario en Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nombre, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', 'Administradora'), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- 2. CLIENTES
-- ------------------------------------------------------------
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  email text,
  notas text,
  created_at timestamptz not null default now()
);

create index if not exists idx_clientes_nombre on public.clientes using gin (to_tsvector('spanish', nombre));

-- ------------------------------------------------------------
-- 3. SERVICIOS
-- ------------------------------------------------------------
create table if not exists public.servicios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  precio numeric(10,2) not null check (precio >= 0),
  duracion_minutos integer not null check (duracion_minutos > 0),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 4. HORARIOS DE ATENCIÓN
-- ------------------------------------------------------------
-- dia_semana: 0 = Domingo ... 6 = Sábado (igual que JS Date.getDay())
create table if not exists public.horarios (
  id uuid primary key default gen_random_uuid(),
  dia_semana smallint not null unique check (dia_semana between 0 and 6),
  hora_inicio time not null,
  hora_fin time not null,
  descanso_inicio time,
  descanso_fin time,
  activo boolean not null default true,
  check (hora_fin > hora_inicio),
  check (
    (descanso_inicio is null and descanso_fin is null)
    or (descanso_inicio is not null and descanso_fin is not null and descanso_fin > descanso_inicio)
  )
);

-- Pre-carga los 7 días (lunes a domingo activos 09:00-18:00 excepto sábado/domingo, editable luego)
insert into public.horarios (dia_semana, hora_inicio, hora_fin, activo)
values
  (1, '09:00', '18:00', true),  -- Lunes
  (2, '09:00', '18:00', true),  -- Martes
  (3, '09:00', '18:00', true),  -- Miércoles
  (4, '09:00', '18:00', true),  -- Jueves
  (5, '09:00', '18:00', true),  -- Viernes
  (6, '09:00', '14:00', true),  -- Sábado
  (0, '09:00', '14:00', false)  -- Domingo (inactivo)
on conflict (dia_semana) do nothing;

-- ------------------------------------------------------------
-- 5. CITAS
-- ------------------------------------------------------------
create table if not exists public.citas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete restrict,
  servicio_id uuid not null references public.servicios (id) on delete restrict,
  fecha date not null,
  hora_inicio time not null,
  hora_fin time not null,
  precio numeric(10,2) not null check (precio >= 0),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'confirmada', 'atendida', 'cancelada', 'no_asistio')),
  observaciones text,
  created_at timestamptz not null default now(),
  check (hora_fin > hora_inicio),
  -- Columna generada usada para detectar solapamientos de horario
  rango tsrange generated always as (
    tsrange((fecha + hora_inicio)::timestamp, (fecha + hora_fin)::timestamp, '[)')
  ) stored,
  -- Evita dos citas que se solapen en el tiempo, ignorando canceladas
  exclude using gist (rango with &&) where (estado <> 'cancelada')
);

create index if not exists idx_citas_fecha on public.citas (fecha);
create index if not exists idx_citas_cliente on public.citas (cliente_id);
create index if not exists idx_citas_estado on public.citas (estado);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- Sistema de una sola administradora: cualquier usuario autenticado
-- (solo ella tendrá cuenta, creada manualmente en Supabase) puede
-- leer y administrar todos los datos.

alter table public.profiles enable row level security;
alter table public.clientes enable row level security;
alter table public.servicios enable row level security;
alter table public.horarios enable row level security;
alter table public.citas enable row level security;

-- PROFILES: solo puede ver/editar su propio perfil
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- CLIENTES
drop policy if exists "clientes_all_authenticated" on public.clientes;
create policy "clientes_all_authenticated" on public.clientes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- SERVICIOS
drop policy if exists "servicios_all_authenticated" on public.servicios;
create policy "servicios_all_authenticated" on public.servicios
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- HORARIOS
drop policy if exists "horarios_all_authenticated" on public.horarios;
create policy "horarios_all_authenticated" on public.horarios
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- CITAS
drop policy if exists "citas_all_authenticated" on public.citas;
create policy "citas_all_authenticated" on public.citas
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============================================================
-- VISTA DE APOYO: citas con datos de cliente y servicio ya unidos
-- (simplifica las consultas desde el frontend)
-- ============================================================
create or replace view public.citas_detalle as
select
  c.id,
  c.fecha,
  c.hora_inicio,
  c.hora_fin,
  c.precio,
  c.estado,
  c.observaciones,
  c.created_at,
  c.cliente_id,
  cl.nombre as cliente_nombre,
  cl.telefono as cliente_telefono,
  c.servicio_id,
  s.nombre as servicio_nombre,
  s.duracion_minutos as servicio_duracion
from public.citas c
join public.clientes cl on cl.id = c.cliente_id
join public.servicios s on s.id = c.servicio_id;

-- ============================================================
-- CÓMO CREAR LA CUENTA DE LA ADMINISTRADORA
-- ============================================================
-- 1. Ir a Supabase > Authentication > Users > "Add user".
-- 2. Crear el usuario con su correo y contraseña (marcar "Auto Confirm User").
-- 3. El trigger on_auth_user_created creará su fila en "profiles" automáticamente.
-- 4. Ese correo y contraseña son los que usará en login.html.
-- ============================================================

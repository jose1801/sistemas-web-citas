// ============================================================
// CLIENTES.JS — CRUD de clientes, búsqueda e historial
// ============================================================

const clientesState = {
  lista: [],
  filtro: '',
};

function initClientes() {
  document.getElementById('btn-nuevo-cliente')?.addEventListener('click', () => abrirModalCliente());
  document.getElementById('form-cliente')?.addEventListener('submit', guardarCliente);

  const buscador = document.getElementById('clientes-buscador');
  if (buscador) {
    let t;
    buscador.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        clientesState.filtro = buscador.value.trim().toLowerCase();
        renderClientes();
      }, 250);
    });
  }

  cargarClientes();
}

async function cargarClientes() {
  const tbody = document.getElementById('clientes-tabla-body');
  const cards = document.getElementById('clientes-tarjetas');
  if (tbody) tbody.innerHTML = `<tr><td colspan="6"><div class="loading-row"><div class="spinner spinner-dark"></div> Cargando clientes...</div></td></tr>`;
  if (cards) cards.innerHTML = '';

  const { data: clientes, error } = await window.db
    .from('clientes')
    .select('*')
    .order('nombre', { ascending: true });

  if (error) {
    mostrarToast('No se pudieron cargar los clientes.', 'error');
    return;
  }

  const { data: citas } = await window.db
    .from('citas')
    .select('cliente_id, fecha')
    .order('fecha', { ascending: false });

  const statsPorCliente = {};
  (citas || []).forEach((c) => {
    if (!statsPorCliente[c.cliente_id]) statsPorCliente[c.cliente_id] = { total: 0, ultima: null };
    statsPorCliente[c.cliente_id].total += 1;
    if (!statsPorCliente[c.cliente_id].ultima) statsPorCliente[c.cliente_id].ultima = c.fecha;
  });

  clientesState.lista = clientes.map((c) => ({
    ...c,
    total_citas: statsPorCliente[c.id]?.total || 0,
    ultima_cita: statsPorCliente[c.id]?.ultima || null,
  }));

  renderClientes();
}

function renderClientes() {
  const tbody = document.getElementById('clientes-tabla-body');
  const cards = document.getElementById('clientes-tarjetas');
  const filtro = clientesState.filtro;

  const lista = clientesState.lista.filter((c) =>
    !filtro || c.nombre.toLowerCase().includes(filtro) || (c.telefono || '').includes(filtro)
  );

  if (!lista.length) {
    const vacio = `<div class="empty-state">
        <div class="empty-state-icon">👤</div>
        <div class="empty-state-title">No hay clientes que mostrar</div>
        <div>Registra un nuevo cliente o ajusta la búsqueda.</div>
      </div>`;
    if (tbody) tbody.innerHTML = `<tr><td colspan="6">${vacio}</td></tr>`;
    if (cards) cards.innerHTML = vacio;
    return;
  }

  if (tbody) {
    tbody.innerHTML = lista.map((c) => `
      <tr>
        <td><button class="link-like" onclick="verHistorialCliente('${c.id}')" style="font-weight:600;background:none;border:none;color:var(--color-text);cursor:pointer;text-align:left;">${escapeHtml(c.nombre)}</button></td>
        <td>${escapeHtml(c.telefono || '—')}</td>
        <td>${escapeHtml(c.email || '—')}</td>
        <td>${formatFecha(c.created_at?.slice(0, 10))}</td>
        <td>${c.ultima_cita ? formatFecha(c.ultima_cita) : '—'}</td>
        <td>${c.total_citas}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-icon btn-secondary" title="Editar" onclick="abrirModalCliente('${c.id}')">✎</button>
            <button class="btn btn-icon btn-danger" title="Eliminar" onclick="eliminarCliente('${c.id}')">🗑</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  if (cards) {
    cards.innerHTML = lista.map((c) => `
      <div class="data-card">
        <div class="data-card-top">
          <div class="data-card-title">${escapeHtml(c.nombre)}</div>
        </div>
        <div class="data-card-row"><span>Teléfono</span><span>${escapeHtml(c.telefono || '—')}</span></div>
        <div class="data-card-row"><span>Última cita</span><span>${c.ultima_cita ? formatFecha(c.ultima_cita) : '—'}</span></div>
        <div class="data-card-row"><span>Citas totales</span><span>${c.total_citas}</span></div>
        <div class="data-card-actions">
          <button class="btn btn-secondary btn-sm" onclick="verHistorialCliente('${c.id}')">Historial</button>
          <button class="btn btn-secondary btn-sm" onclick="abrirModalCliente('${c.id}')">Editar</button>
          <button class="btn btn-danger btn-sm" onclick="eliminarCliente('${c.id}')">Eliminar</button>
        </div>
      </div>
    `).join('');
  }
}

function abrirModalCliente(id = null) {
  const form = document.getElementById('form-cliente');
  form.reset();
  document.getElementById('cliente-id').value = '';
  document.getElementById('modal-cliente-titulo').textContent = id ? 'Editar cliente' : 'Nuevo cliente';

  if (id) {
    const cliente = clientesState.lista.find((c) => c.id === id);
    if (cliente) {
      document.getElementById('cliente-id').value = cliente.id;
      document.getElementById('cliente-nombre').value = cliente.nombre;
      document.getElementById('cliente-telefono').value = cliente.telefono || '';
      document.getElementById('cliente-email').value = cliente.email || '';
      document.getElementById('cliente-notas').value = cliente.notas || '';
    }
  }
  abrirModal('modal-cliente');
}

async function guardarCliente(e) {
  e.preventDefault();
  const id = document.getElementById('cliente-id').value;
  const nombre = document.getElementById('cliente-nombre').value.trim();
  const telefono = document.getElementById('cliente-telefono').value.trim();
  const email = document.getElementById('cliente-email').value.trim();
  const notas = document.getElementById('cliente-notas').value.trim();

  if (!nombre) {
    mostrarToast('El nombre es obligatorio.', 'error');
    return;
  }
  if (email && !validarEmail(email)) {
    mostrarToast('El correo no tiene un formato válido.', 'error');
    return;
  }
  if (telefono && !validarTelefono(telefono)) {
    mostrarToast('El teléfono debe contener solo números, espacios o guiones.', 'error');
    return;
  }

  const btnSubmit = document.getElementById('cliente-submit-btn');
  btnSubmit.disabled = true;

  const payload = { nombre, telefono: telefono || null, email: email || null, notas: notas || null };
  const query = id
    ? window.db.from('clientes').update(payload).eq('id', id).select().single()
    : window.db.from('clientes').insert(payload).select().single();

  const { data: clienteGuardado, error } = await query;
  btnSubmit.disabled = false;

  if (error) {
    mostrarToast('No se pudo guardar el cliente.', 'error');
    return;
  }

  mostrarToast(id ? 'Cliente actualizado.' : '✓ Cliente creado correctamente', 'success');
  cerrarModal('modal-cliente');
  await cargarClientes();

  if (!id && typeof alGuardarClienteDesdeOtroFlujo === 'function') {
    await alGuardarClienteDesdeOtroFlujo(clienteGuardado.id);
  }
}

async function eliminarCliente(id) {
  const ok = await confirmarAccion('¿Eliminar este cliente? Se borrarán también todas sus citas registradas. Esta acción no se puede deshacer.');
  if (!ok) return;

  const { error } = await window.db.from('clientes').delete().eq('id', id);
  if (error) {
    mostrarToast('No se pudo eliminar el cliente.', 'error');
    return;
  }
  mostrarToast('Cliente eliminado correctamente.', 'success');
  await cargarClientes();
}

async function verHistorialCliente(id) {
  const cliente = clientesState.lista.find((c) => c.id === id);
  if (!cliente) return;

  document.getElementById('historial-cliente-nombre').textContent = cliente.nombre;
  const cuerpo = document.getElementById('historial-cliente-body');
  cuerpo.innerHTML = `<div class="loading-row"><div class="spinner spinner-dark"></div> Cargando historial...</div>`;
  abrirModal('modal-historial-cliente');

  const { data, error } = await window.db
    .from('citas_detalle')
    .select('*')
    .eq('cliente_id', id)
    .order('fecha', { ascending: false });

  if (error || !data.length) {
    cuerpo.innerHTML = `<div class="empty-state">Este cliente aún no tiene citas registradas.</div>`;
    return;
  }

  cuerpo.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Fecha</th><th>Hora</th><th>Servicio</th><th>Precio</th><th>Estado</th></tr></thead>
        <tbody>
          ${data.map((c) => `
            <tr>
              <td>${formatFecha(c.fecha)}</td>
              <td>${formatHora(c.hora_inicio)}</td>
              <td>${escapeHtml(c.servicio_nombre)}</td>
              <td>${formatMoney(c.precio)}</td>
              <td><span class="badge badge-${c.estado}">${etiquetaEstado(c.estado)}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validarTelefono(telefono) {
  return /^[0-9+\-\s()]{6,}$/.test(telefono);
}
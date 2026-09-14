// ============================================================
// CITAS.JS — calendario, filtros y CRUD de citas
// (incluye la validación de horarios duplicados)
// ============================================================

const citasState = {
  vista: 'dia', // 'dia' | 'semana' | 'mes'
  fechaRef: fechaHoyISO(),
  filtroEstado: 'todos',
  cache: [], // citas cargadas para la vista actual
  clientesCache: [],
  serviciosCache: [],
};

function initCitas() {
  document.querySelectorAll('.js-tab-vista-citas').forEach((btn) => {
    btn.addEventListener('click', () => {
      citasState.vista = btn.dataset.vista;
      document.querySelectorAll('.js-tab-vista-citas').forEach((b) => b.classList.toggle('active', b === btn));
      renderVistaCitas();
    });
  });

  document.getElementById('citas-prev')?.addEventListener('click', () => moverFecha(-1));
  document.getElementById('citas-next')?.addEventListener('click', () => moverFecha(1));
  document.getElementById('citas-hoy')?.addEventListener('click', () => { citasState.fechaRef = fechaHoyISO(); renderVistaCitas(); });

  document.querySelectorAll('.js-filtro-cita').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.js-filtro-cita').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      citasState.filtroEstado = chip.dataset.filtro;
      renderVistaCitas();
    });
  });

  document.getElementById('btn-nueva-cita')?.addEventListener('click', () => abrirModalCita());
  document.getElementById('form-cita')?.addEventListener('submit', guardarCita);
  document.getElementById('cita-servicio')?.addEventListener('change', actualizarInfoServicioCita);
  document.getElementById('cita-nuevo-cliente-btn')?.addEventListener('click', () => {
    abrirModalCliente();
    document.getElementById('cliente-post-guardar-para-cita').value = '1';
  });

  renderVistaCitas();
}

function refrescarCitas() { renderVistaCitas(); }

function moverFecha(delta) {
  if (citasState.vista === 'dia') citasState.fechaRef = sumarDias(citasState.fechaRef, delta);
  if (citasState.vista === 'semana') citasState.fechaRef = sumarDias(citasState.fechaRef, delta * 7);
  if (citasState.vista === 'mes') citasState.fechaRef = moverMes(citasState.fechaRef, delta);
  renderVistaCitas();
}

function moverMes(fechaISO, delta) {
  const [y, m] = fechaISO.split('-').map(Number);
  const nueva = new Date(y, m - 1 + delta, 1);
  return `${nueva.getFullYear()}-${String(nueva.getMonth() + 1).padStart(2, '0')}-01`;
}

// ------------------------------------------------------------
// RENDER PRINCIPAL SEGÚN VISTA
// ------------------------------------------------------------
async function renderVistaCitas() {
  document.querySelectorAll('.citas-vista').forEach((v) => v.classList.add('hidden'));

  if (citasState.vista === 'dia') {
    document.getElementById('citas-vista-dia').classList.remove('hidden');
    await renderVistaDia();
  } else if (citasState.vista === 'semana') {
    document.getElementById('citas-vista-semana').classList.remove('hidden');
    await renderVistaSemana();
  } else {
    document.getElementById('citas-vista-mes').classList.remove('hidden');
    await renderVistaMes();
  }
}

function citaCoincideFiltro(cita) {
  if (citasState.filtroEstado === 'todos') return true;
  return cita.estado === citasState.filtroEstado;
}

// --- VISTA DÍA ---
async function renderVistaDia() {
  document.getElementById('citas-rango-label').textContent = capitalizar(
    parseFechaISO(citasState.fechaRef).toLocaleDateString('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  );

  const lista = document.getElementById('citas-dia-lista');
  lista.innerHTML = `<div class="loading-row"><div class="spinner spinner-dark"></div> Cargando citas...</div>`;

  const { data, error } = await window.db
    .from('citas_detalle')
    .select('*')
    .eq('fecha', citasState.fechaRef)
    .order('hora_inicio', { ascending: true });

  if (error) {
    lista.innerHTML = `<div class="empty-state">No se pudieron cargar las citas.</div>`;
    return;
  }

  const filtradas = data.filter(citaCoincideFiltro);

  if (!filtradas.length) {
    lista.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🗓️</div>
        <div class="empty-state-title">No hay citas para este día</div>
        <div>Usa "+ Nueva cita" para agendar una.</div>
      </div>`;
    return;
  }

  lista.innerHTML = filtradas.map(citaRowHtml).join('');
}

function citaRowHtml(cita) {
  return `
    <div class="appt-row">
      <div class="appt-time">${formatHora(cita.hora_inicio)}</div>
      <div class="appt-info">
        <div class="appt-client">${escapeHtml(cita.cliente_nombre)}</div>
        <div class="appt-service">${escapeHtml(cita.servicio_nombre)}</div>
        <div class="appt-phone">${escapeHtml(cita.cliente_telefono || '')}</div>
      </div>
      <div class="appt-price">
        ${formatMoney(cita.precio)}<br>
        <span class="badge badge-${cita.estado}">${etiquetaEstado(cita.estado)}</span>
      </div>
      <div class="appt-actions">
        ${botonesEstadoRapido(cita)}
        <button class="btn btn-icon btn-secondary" title="Editar" onclick="abrirModalCita('${cita.id}')">✎</button>
      </div>
    </div>`;
}

function botonesEstadoRapido(cita) {
  if (cita.estado === 'pendiente') {
    return `<button class="btn btn-icon btn-secondary" title="Confirmar" onclick="cambiarEstadoCita('${cita.id}','confirmada')">✓</button>`;
  }
  if (cita.estado === 'confirmada') {
    return `<button class="btn btn-icon btn-secondary" title="Marcar atendida" onclick="cambiarEstadoCita('${cita.id}','atendida')">★</button>`;
  }
  return '';
}

async function cambiarEstadoCita(id, estado) {
  const { error } = await window.db.from('citas').update({ estado }).eq('id', id);
  if (error) { mostrarToast('No se pudo actualizar el estado.', 'error'); return; }
  mostrarToast('Cita actualizada.', 'success');
  renderVistaCitas();
}

// --- VISTA SEMANA ---
async function renderVistaSemana() {
  const inicioSemana = obtenerLunesDeSemana(citasState.fechaRef);
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(inicioSemana, i));

  document.getElementById('citas-rango-label').textContent =
    `${formatFecha(dias[0])} – ${formatFecha(dias[6])}`;

  const grid = document.getElementById('citas-semana-grid');
  grid.innerHTML = dias.map((f) => `
    <div class="week-col" data-fecha="${f}">
      <div class="week-col-header ${f === fechaHoyISO() ? 'today' : ''}">${DIAS_SEMANA[parseFechaISO(f).getDay()].slice(0, 3)}<br>${f.split('-')[2]}</div>
      <div class="week-col-body"><div class="loading-row" style="padding:16px 0;"><div class="spinner spinner-dark"></div></div></div>
    </div>`).join('');

  const { data, error } = await window.db
    .from('citas_detalle')
    .select('*')
    .gte('fecha', dias[0])
    .lte('fecha', dias[6])
    .order('hora_inicio', { ascending: true });

  if (error) return;

  const filtradas = data.filter(citaCoincideFiltro);

  dias.forEach((f) => {
    const col = grid.querySelector(`.week-col[data-fecha="${f}"] .week-col-body`);
    const citasDelDia = filtradas.filter((c) => c.fecha === f);
    if (!citasDelDia.length) {
      col.innerHTML = `<div style="text-align:center;color:var(--color-text-soft);font-size:12px;padding:10px 0;">—</div>`;
      return;
    }
    col.innerHTML = citasDelDia.map((c) => `
      <div class="week-appt" onclick="abrirModalCita('${c.id}')">
        <div class="week-appt-time">${formatHora(c.hora_inicio)}</div>
        <div>${escapeHtml(c.cliente_nombre)}</div>
      </div>`).join('');
  });
}

function obtenerLunesDeSemana(fechaISO) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const fecha = new Date(y, m - 1, d);
  const dia = fecha.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  fecha.setDate(fecha.getDate() + diff);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

// --- VISTA MES ---
async function renderVistaMes() {
  const [y, m] = citasState.fechaRef.split('-').map(Number);
  document.getElementById('citas-rango-label').textContent = `${MESES[m - 1]} ${y}`;

  const primerDiaMes = new Date(y, m - 1, 1);
  const inicioGrid = new Date(primerDiaMes);
  const diaSemanaInicio = primerDiaMes.getDay() === 0 ? 6 : primerDiaMes.getDay() - 1; // lunes=0
  inicioGrid.setDate(primerDiaMes.getDate() - diaSemanaInicio);

  const celdas = Array.from({ length: 42 }, (_, i) => {
    const f = new Date(inicioGrid);
    f.setDate(inicioGrid.getDate() + i);
    return f;
  });

  const desde = toISO(celdas[0]);
  const hasta = toISO(celdas[41]);

  const { data } = await window.db
    .from('citas')
    .select('fecha, estado')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .neq('estado', 'cancelada');

  const conteoPorDia = {};
  (data || []).forEach((c) => { conteoPorDia[c.fecha] = (conteoPorDia[c.fecha] || 0) + 1; });

  const grid = document.getElementById('citas-mes-grid');
  const encabezados = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
    .map((d) => `<div class="calendar-weekday">${d}</div>`).join('');

  const dias = celdas.map((f) => {
    const iso = toISO(f);
    const esOtroMes = f.getMonth() !== m - 1;
    const esHoy = iso === fechaHoyISO();
    const cantidad = conteoPorDia[iso] || 0;
    return `
      <div class="calendar-day ${esOtroMes ? 'other-month' : ''} ${esHoy ? 'today' : ''}" onclick="irADiaDesdeCalendario('${iso}')">
        <div class="calendar-day-num">${f.getDate()}</div>
        <div class="calendar-day-dot">${Array.from({ length: Math.min(cantidad, 4) }).map(() => '<span></span>').join('')}</div>
      </div>`;
  }).join('');

  grid.innerHTML = encabezados + dias;
}

function toISO(fechaObj) {
  return `${fechaObj.getFullYear()}-${String(fechaObj.getMonth() + 1).padStart(2, '0')}-${String(fechaObj.getDate()).padStart(2, '0')}`;
}

function irADiaDesdeCalendario(iso) {
  citasState.fechaRef = iso;
  citasState.vista = 'dia';
  document.querySelectorAll('.js-tab-vista-citas').forEach((b) => b.classList.toggle('active', b.dataset.vista === 'dia'));
  renderVistaCitas();
}

// ------------------------------------------------------------
// FILTROS RÁPIDOS DE FECHA (sección 17)
// ------------------------------------------------------------
function filtroRapidoFecha(tipo) {
  const hoy = fechaHoyISO();
  if (tipo === 'hoy') { citasState.fechaRef = hoy; citasState.vista = 'dia'; }
  if (tipo === 'manana') { citasState.fechaRef = sumarDias(hoy, 1); citasState.vista = 'dia'; }
  if (tipo === 'semana') { citasState.fechaRef = hoy; citasState.vista = 'semana'; }
  if (tipo === 'mes') { citasState.fechaRef = hoy; citasState.vista = 'mes'; }
  document.querySelectorAll('.js-tab-vista-citas').forEach((b) => b.classList.toggle('active', b.dataset.vista === citasState.vista));
  renderVistaCitas();
}

// ------------------------------------------------------------
// MODAL DE CREAR / EDITAR CITA
// ------------------------------------------------------------
async function abrirModalCita(id = null) {
  const form = document.getElementById('form-cita');
  form.reset();
  document.getElementById('cita-id').value = '';
  document.getElementById('cita-error').classList.add('hidden');
  document.getElementById('modal-cita-titulo').textContent = id ? 'Editar cita' : 'Nueva cita';
  document.getElementById('cita-info-servicio').textContent = '';

  await Promise.all([cargarClientesEnSelect(), cargarServiciosEnSelect()]);

  if (id) {
    const { data: cita, error } = await window.db.from('citas').select('*').eq('id', id).single();
    if (!error && cita) {
      document.getElementById('cita-id').value = cita.id;
      document.getElementById('cita-cliente').value = cita.cliente_id;
      document.getElementById('cita-servicio').value = cita.servicio_id;
      document.getElementById('cita-fecha').value = cita.fecha;
      document.getElementById('cita-hora').value = cita.hora_inicio.slice(0, 5);
      document.getElementById('cita-precio').value = cita.precio;
      document.getElementById('cita-observaciones').value = cita.observaciones || '';
      document.getElementById('cita-estado').value = cita.estado;
      actualizarInfoServicioCita();
      document.getElementById('cita-eliminar-btn').classList.remove('hidden');
      document.getElementById('cita-eliminar-btn').onclick = () => eliminarCita(cita.id);
    }
  } else {
    document.getElementById('cita-fecha').value = citasState.vista !== 'mes' ? citasState.fechaRef : fechaHoyISO();
    document.getElementById('cita-estado').value = 'pendiente';
    document.getElementById('cita-eliminar-btn').classList.add('hidden');
  }

  abrirModal('modal-cita');
}

async function cargarClientesEnSelect() {
  const { data } = await window.db.from('clientes').select('id, nombre').order('nombre', { ascending: true });
  citasState.clientesCache = data || [];
  const select = document.getElementById('cita-cliente');
  const valorActual = select.value;
  select.innerHTML = `<option value="">Selecciona un cliente</option>` +
    citasState.clientesCache.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
  if (valorActual) select.value = valorActual;
}

async function cargarServiciosEnSelect() {
  const { data } = await window.db.from('servicios').select('*').eq('activo', true).order('nombre', { ascending: true });
  citasState.serviciosCache = data || [];
  const select = document.getElementById('cita-servicio');
  const valorActual = select.value;
  select.innerHTML = `<option value="">Selecciona un servicio</option>` +
    citasState.serviciosCache.map((s) => `<option value="${s.id}">${escapeHtml(s.nombre)}</option>`).join('');
  if (valorActual) select.value = valorActual;
}

function actualizarInfoServicioCita() {
  const id = document.getElementById('cita-servicio').value;
  const servicio = citasState.serviciosCache.find((s) => s.id === id);
  const info = document.getElementById('cita-info-servicio');
  if (!servicio) { info.textContent = ''; return; }
  info.textContent = `${formatMoney(servicio.precio)} · ${servicio.duracion_minutos} min`;
  if (!document.getElementById('cita-id').value || !document.getElementById('cita-precio').value) {
    document.getElementById('cita-precio').value = servicio.precio;
  }
}

// Llamado desde clientes.js después de guardar un cliente, si venía
// del flujo "+ Nuevo cliente" abierto desde el modal de citas.
async function alGuardarClienteDesdeOtroFlujo(clienteId) {
  const marcador = document.getElementById('cliente-post-guardar-para-cita');
  if (marcador && marcador.value === '1') {
    marcador.value = '';
    await cargarClientesEnSelect();
    document.getElementById('cita-cliente').value = clienteId;
    abrirModal('modal-cita');
  }
}

async function guardarCita(e) {
  e.preventDefault();

  const id = document.getElementById('cita-id').value || null;
  const clienteId = document.getElementById('cita-cliente').value;
  const servicioId = document.getElementById('cita-servicio').value;
  const fecha = document.getElementById('cita-fecha').value;
  const horaInicio = document.getElementById('cita-hora').value;
  const precio = parseFloat(document.getElementById('cita-precio').value);
  const observaciones = document.getElementById('cita-observaciones').value.trim();
  const estado = document.getElementById('cita-estado').value;
  const errorBox = document.getElementById('cita-error');
  errorBox.classList.add('hidden');

  if (!clienteId || !servicioId || !fecha || !horaInicio) {
    return mostrarErrorCita('Completa cliente, servicio, fecha y hora.');
  }
  if (isNaN(precio) || precio < 0) {
    return mostrarErrorCita('Ingresa un precio válido.');
  }

  const servicio = citasState.serviciosCache.find((s) => s.id === servicioId);
  const duracion = servicio ? servicio.duracion_minutos : 30;
  const horaFin = sumarMinutosAHora(horaInicio, duracion);

  const btnGuardar = document.getElementById('cita-submit-btn');
  btnGuardar.disabled = true;

  // 1) Validar contra el horario de atención configurado
  const horario = await obtenerHorarioParaFecha(fecha);
  if (!horario) {
    btnGuardar.disabled = false;
    return mostrarErrorCita('Ese día no está habilitado en tus horarios de atención.');
  }
  if (horaInicio < horario.hora_inicio.slice(0, 5) || horaFin > horario.hora_fin.slice(0, 5)) {
    btnGuardar.disabled = false;
    return mostrarErrorCita(`Ese horario está fuera de tu jornada (${horario.hora_inicio.slice(0, 5)} - ${horario.hora_fin.slice(0, 5)}).`);
  }
  if (horario.descanso_inicio && horario.descanso_fin) {
    const dIni = horario.descanso_inicio.slice(0, 5);
    const dFin = horario.descanso_fin.slice(0, 5);
    if (horaInicio < dFin && horaFin > dIni) {
      btnGuardar.disabled = false;
      return mostrarErrorCita(`Ese horario cae dentro de tu descanso (${dIni} - ${dFin}).`);
    }
  }

  // 2) Validar que no exista otra cita en el mismo horario (comprobación en Supabase)
  const { data: citasDelDia, error: errCitas } = await window.db
    .from('citas')
    .select('id, hora_inicio, hora_fin, estado')
    .eq('fecha', fecha)
    .neq('estado', 'cancelada');

  if (errCitas) {
    btnGuardar.disabled = false;
    return mostrarErrorCita('No se pudo verificar la disponibilidad. Intenta de nuevo.');
  }

  const haySolape = citasDelDia.some((c) => {
    if (id && c.id === id) return false;
    const cIni = c.hora_inicio.slice(0, 5);
    const cFin = c.hora_fin.slice(0, 5);
    return horaInicio < cFin && horaFin > cIni;
  });

  if (haySolape) {
    btnGuardar.disabled = false;
    return mostrarErrorCita('Este horario ya está ocupado.');
  }

  // 3) Guardar
  const payload = {
    cliente_id: clienteId,
    servicio_id: servicioId,
    fecha,
    hora_inicio: horaInicio,
    hora_fin: horaFin,
    precio,
    estado,
    observaciones: observaciones || null,
  };

  const query = id
    ? window.db.from('citas').update(payload).eq('id', id)
    : window.db.from('citas').insert(payload);

  const { error } = await query;
  btnGuardar.disabled = false;

  if (error) {
    if (error.code === '23P01') {
      return mostrarErrorCita('Este horario ya está ocupado.');
    }
    return mostrarErrorCita('No se pudo guardar la cita. Intenta de nuevo.');
  }

  mostrarToast(id ? 'Cita actualizada.' : '✓ Cita creada correctamente', 'success');
  cerrarModal('modal-cita');
  renderVistaCitas();
  if (app.currentSection === 'dashboard') refrescarDashboard();

  function mostrarErrorCita(msg) {
    errorBox.textContent = `⚠ ${msg}`;
    errorBox.classList.remove('hidden');
  }
}

function sumarMinutosAHora(horaStr, minutos) {
  const [h, m] = horaStr.split(':').map(Number);
  const total = h * 60 + m + minutos;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

async function eliminarCita(id) {
  const ok = await confirmarAccion('¿Cancelar esta cita? Se marcará como cancelada.', 'Cancelar cita');
  if (!ok) return;

  const { error } = await window.db.from('citas').update({ estado: 'cancelada' }).eq('id', id);
  if (error) { mostrarToast('No se pudo cancelar la cita.', 'error'); return; }

  mostrarToast('Cita cancelada.', 'success');
  cerrarModal('modal-cita');
  renderVistaCitas();
  if (app.currentSection === 'dashboard') refrescarDashboard();
}

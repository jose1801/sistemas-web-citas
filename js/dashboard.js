// ============================================================
// DASHBOARD.JS — resumen general y próximas citas del día
// ============================================================

async function initDashboard() {
  document.getElementById('dashboard-nueva-cita')?.addEventListener('click', () => abrirModalCita());
  await refrescarDashboard();
}

async function refrescarDashboard() {
  await Promise.all([cargarResumenDashboard(), cargarProximasCitas()]);
}

async function cargarResumenDashboard() {
  const hoy = fechaHoyISO();

  const [citasHoy, pendientes, confirmadas, clientes] = await Promise.all([
    window.db.from('citas').select('id', { count: 'exact', head: true }).eq('fecha', hoy).neq('estado', 'cancelada'),
    window.db.from('citas').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
    window.db.from('citas').select('id', { count: 'exact', head: true }).eq('estado', 'confirmada'),
    window.db.from('clientes').select('id', { count: 'exact', head: true }),
  ]);

  setTexto('resumen-citas-hoy', citasHoy.count ?? 0);
  setTexto('resumen-pendientes', pendientes.count ?? 0);
  setTexto('resumen-confirmadas', confirmadas.count ?? 0);
  setTexto('resumen-clientes', clientes.count ?? 0);
}

function setTexto(id, valor) {
  const el = document.getElementById(id);
  if (el) el.textContent = valor;
}

async function cargarProximasCitas() {
  const contenedor = document.getElementById('proximas-citas-lista');
  if (!contenedor) return;
  contenedor.innerHTML = `<div class="loading-row"><div class="spinner spinner-dark"></div> Cargando citas...</div>`;

  const hoy = fechaHoyISO();
  const { data, error } = await window.db
    .from('citas_detalle')
    .select('*')
    .eq('fecha', hoy)
    .neq('estado', 'cancelada')
    .order('hora_inicio', { ascending: true });

  if (error) {
    contenedor.innerHTML = `<div class="empty-state">No se pudieron cargar las citas de hoy.</div>`;
    return;
  }

  if (!data.length) {
    contenedor.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🗓️</div>
        <div class="empty-state-title">No hay citas para hoy</div>
        <div>Aprovecha para organizar tu agenda o registrar nuevos servicios.</div>
      </div>`;
    return;
  }

  contenedor.innerHTML = data.map((cita) => `
    <div class="appt-row">
      <div class="appt-time">${formatHora(cita.hora_inicio)}</div>
      <div class="appt-info">
        <div class="appt-client">${escapeHtml(cita.cliente_nombre)}</div>
        <div class="appt-service">${escapeHtml(cita.servicio_nombre)}</div>
        <div class="appt-phone">${escapeHtml(cita.cliente_telefono || '')}</div>
      </div>
      <div class="appt-price">${formatMoney(cita.precio)}<br><span class="badge badge-${cita.estado}">${etiquetaEstado(cita.estado)}</span></div>
      <div class="appt-actions">
        <button class="btn btn-icon btn-secondary" title="Editar" onclick="abrirModalCita('${cita.id}')">✎</button>
      </div>
    </div>
  `).join('');
}

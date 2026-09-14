// ============================================================
// APP.JS — núcleo de la aplicación: sesión, navegación y utilidades
// compartidas (toasts, modales, formato de fecha/dinero, confirmaciones)
// ============================================================

const ESTADOS_CITA = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'confirmada', label: 'Confirmada' },
  { value: 'atendida', label: 'Atendida' },
  { value: 'cancelada', label: 'Cancelada' },
  { value: 'no_asistio', label: 'No asistió' },
];

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const app = {
  currentSection: 'dashboard',
  initializedSections: new Set(),
};

// ------------------------------------------------------------
// ARRANQUE
// ------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  const session = await requireSession();
  if (!session) return;

  await cargarPerfil(session);
  wireNavegacion();
  wireLogout();
  wireModalesGlobales();
  wireBuscadorGlobal();
  irASeccion('dashboard');
  actualizarFechaHoy();
});

async function cargarPerfil(session) {
  const { data, error } = await window.db
    .from('profiles')
    .select('nombre')
    .eq('id', session.user.id)
    .single();

  const nombre = !error && data ? data.nombre : 'Administradora';
  document.querySelectorAll('.js-admin-nombre').forEach((el) => (el.textContent = nombre));
  const inicial = nombre.trim().charAt(0).toUpperCase() || 'A';
  document.querySelectorAll('.js-admin-inicial').forEach((el) => (el.textContent = inicial));
}

function actualizarFechaHoy() {
  const hoy = new Date();
  const texto = hoy.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  document.querySelectorAll('.js-fecha-hoy').forEach((el) => (el.textContent = capitalizar(texto)));
}

// ------------------------------------------------------------
// NAVEGACIÓN ENTRE SECCIONES
// ------------------------------------------------------------
function wireNavegacion() {
  document.querySelectorAll('[data-section]').forEach((btn) => {
    btn.addEventListener('click', () => irASeccion(btn.dataset.section));
  });
}

function irASeccion(seccion) {
  app.currentSection = seccion;

  document.querySelectorAll('.view-section').forEach((el) => {
    el.classList.toggle('hidden', el.dataset.view !== seccion);
  });

  document.querySelectorAll('[data-section]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.section === seccion);
  });

  document.querySelector('.fab')?.classList.toggle('hidden', seccion !== 'citas' && seccion !== 'dashboard');

  if (!app.initializedSections.has(seccion)) {
    app.initializedSections.add(seccion);
    switch (seccion) {
      case 'dashboard': initDashboard(); break;
      case 'citas': initCitas(); break;
      case 'clientes': initClientes(); break;
      case 'servicios': initServicios(); break;
      case 'horarios': initHorarios(); break;
    }
  } else {
    // Refrescar datos ligeros al volver a entrar a la sección
    if (seccion === 'dashboard') refrescarDashboard();
    if (seccion === 'citas') refrescarCitas();
  }
}

function wireLogout() {
  document.querySelectorAll('.js-logout').forEach((btn) => {
    btn.addEventListener('click', cerrarSesion);
  });
}

// ------------------------------------------------------------
// BUSCADOR GLOBAL
// ------------------------------------------------------------
function wireBuscadorGlobal() {
  const input = document.getElementById('buscador-global');
  if (!input) return;
  let timeout;
  input.addEventListener('input', () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => buscarGlobal(input.value.trim()), 300);
  });
}

async function buscarGlobal(texto) {
  const resultados = document.getElementById('resultados-busqueda-global');
  if (!resultados) return;

  if (!texto) {
    resultados.classList.add('hidden');
    resultados.innerHTML = '';
    return;
  }

  const [clientesRes, citasRes] = await Promise.all([
    window.db.from('clientes').select('id, nombre, telefono').ilike('nombre', `%${texto}%`).limit(5),
    window.db.from('citas_detalle').select('*').ilike('cliente_nombre', `%${texto}%`).order('fecha', { ascending: false }).limit(5),
  ]);

  const clientes = clientesRes.data || [];
  const citas = citasRes.data || [];

  if (!clientes.length && !citas.length) {
    resultados.innerHTML = `<div class="empty-state" style="padding:20px;">Sin resultados para "${escapeHtml(texto)}"</div>`;
    resultados.classList.remove('hidden');
    return;
  }

  let html = '';
  if (clientes.length) {
    html += `<div class="search-group-title">Clientes</div>`;
    clientes.forEach((c) => {
      html += `<button class="search-result-item" onclick="irASeccion('clientes'); cerrarBusquedaGlobal();">
        <strong>${escapeHtml(c.nombre)}</strong><span>${escapeHtml(c.telefono || '')}</span></button>`;
    });
  }
  if (citas.length) {
    html += `<div class="search-group-title">Citas</div>`;
    citas.forEach((c) => {
      html += `<button class="search-result-item" onclick="irASeccion('citas'); cerrarBusquedaGlobal();">
        <strong>${escapeHtml(c.cliente_nombre)}</strong><span>${formatFecha(c.fecha)} · ${c.hora_inicio.slice(0, 5)}</span></button>`;
    });
  }
  resultados.innerHTML = html;
  resultados.classList.remove('hidden');
}

function cerrarBusquedaGlobal() {
  const resultados = document.getElementById('resultados-busqueda-global');
  const input = document.getElementById('buscador-global');
  if (resultados) { resultados.classList.add('hidden'); resultados.innerHTML = ''; }
  if (input) input.value = '';
}

document.addEventListener('click', (e) => {
  const wrap = document.getElementById('buscador-global-wrap');
  if (wrap && !wrap.contains(e.target)) cerrarBusquedaGlobal();
});

// ------------------------------------------------------------
// MODALES (genérico, reutilizado por citas/clientes/servicios/horarios)
// ------------------------------------------------------------
function wireModalesGlobales() {
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cerrarModal(overlay.id);
    });
  });
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => cerrarModal(btn.dataset.closeModal));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach((m) => cerrarModal(m.id));
    }
  });
}

function abrirModal(id) {
  document.getElementById(id)?.classList.add('open');
}

function cerrarModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

// ------------------------------------------------------------
// CONFIRMACIÓN (reemplaza confirm() nativo, respeta el diseño)
// ------------------------------------------------------------
function confirmarAccion(mensaje, tituloBtn = 'Eliminar') {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-confirmar');
    document.getElementById('confirmar-mensaje').textContent = mensaje;
    const btnOk = document.getElementById('confirmar-btn-ok');
    btnOk.textContent = tituloBtn;

    const limpiar = (resultado) => {
      abrirModal('modal-confirmar'); // no-op guard
      cerrarModal('modal-confirmar');
      btnOk.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(resultado);
    };
    const onOk = () => limpiar(true);
    const onCancel = () => limpiar(false);
    const cancelBtn = document.getElementById('confirmar-btn-cancelar');

    btnOk.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    abrirModal('modal-confirmar');
  });
}

// ------------------------------------------------------------
// TOASTS
// ------------------------------------------------------------
function mostrarToast(mensaje, tipo = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const iconos = { success: '✓', error: '⚠', warning: '⚠' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  toast.innerHTML = `<span>${iconos[tipo] || ''}</span><span>${escapeHtml(mensaje)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    toast.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    setTimeout(() => toast.remove(), 220);
  }, 3200);
}

// ------------------------------------------------------------
// FORMATO
// ------------------------------------------------------------
function formatMoney(valor) {
  const n = Number(valor || 0);
  return `$${n.toFixed(2)}`;
}

function parseFechaISO(fechaIso) {
  const [y, m, d] = fechaIso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatFecha(fechaIso) {
  if (!fechaIso) return '';
  return parseFechaISO(fechaIso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatHora(horaStr) {
  if (!horaStr) return '';
  const [h, m] = horaStr.split(':').map(Number);
  const periodo = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${periodo}`;
}

function fechaHoyISO() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
}

function sumarDias(fechaISO, dias) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const fecha = new Date(y, m - 1, d);
  fecha.setDate(fecha.getDate() + dias);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function escapeHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

function etiquetaEstado(estado) {
  return ESTADOS_CITA.find((e) => e.value === estado)?.label || estado;
}

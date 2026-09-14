// ============================================================
// SERVICIOS.JS — CRUD de servicios de belleza (Horas/Minutos)
// ============================================================

const serviciosState = { lista: [] };

function initServicios() {
  document.getElementById('btn-nuevo-servicio')?.addEventListener('click', () => abrirModalServicio());
  document.getElementById('form-servicio')?.addEventListener('submit', guardarServicio);
  cargarServicios();
}

function formatearDuracion(totalMinutos) {
  if (!totalMinutos || totalMinutos <= 0) return '0 min';
  const hrs = Math.floor(totalMinutos / 60);
  const mins = totalMinutos % 60;

  if (hrs > 0 && mins > 0) return `${hrs} h ${mins} min`;
  if (hrs > 0) return `${hrs} h`;
  return `${mins} min`;
}

async function cargarServicios() {
  const cont = document.getElementById('servicios-grid');
  if (cont) cont.innerHTML = `<div class="loading-row"><div class="spinner spinner-dark"></div> Cargando servicios...</div>`;

  const { data, error } = await window.db.from('servicios').select('*').order('nombre', { ascending: true });

  if (error) {
    mostrarToast('No se pudieron cargar los servicios.', 'error');
    return;
  }

  serviciosState.lista = data;
  renderServicios();
}

function renderServicios() {
  const cont = document.getElementById('servicios-grid');
  if (!cont) return;

  if (!serviciosState.lista.length) {
    cont.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💅</div>
        <div class="empty-state-title">Aún no tienes servicios</div>
        <div>Agrega tu primer servicio, por ejemplo "Manicure".</div>
      </div>`;
    return;
  }

  cont.innerHTML = serviciosState.lista.map((s) => `
    <div class="data-card" style="${s.activo ? '' : 'opacity:.55;'}">
      <div class="data-card-top">
        <div class="data-card-title">${escapeHtml(s.nombre)}</div>
        <label class="switch" title="Activo/Inactivo">
          <input type="checkbox" ${s.activo ? 'checked' : ''} onchange="toggleServicioActivo('${s.id}', this.checked)">
          <span class="switch-slider"></span>
        </label>
      </div>
      ${s.descripcion ? `<div class="data-card-row" style="justify-content:flex-start;">${escapeHtml(s.descripcion)}</div>` : ''}
      <div class="data-card-row"><span>Precio</span><span>${formatMoney(s.precio)}</span></div>
      <div class="data-card-row"><span>Duración</span><span>${formatearDuracion(s.duracion_minutos)}</span></div>
      <div class="data-card-actions">
        <button class="btn btn-secondary btn-sm" onclick="abrirModalServicio('${s.id}')">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="eliminarServicio('${s.id}')">Eliminar</button>
      </div>
    </div>
  `).join('');
}

function abrirModalServicio(id = null) {
  const form = document.getElementById('form-servicio');
  form.reset();
  document.getElementById('servicio-id').value = '';
  document.getElementById('modal-servicio-titulo').textContent = id ? 'Editar servicio' : 'Nuevo servicio';
  document.getElementById('servicio-activo').checked = true;
  document.getElementById('servicio-duracion-horas').value = '0';
  document.getElementById('servicio-duracion-minutos').value = '30';

  if (id) {
    const s = serviciosState.lista.find((x) => x.id === id);
    if (s) {
      document.getElementById('servicio-id').value = s.id;
      document.getElementById('servicio-nombre').value = s.nombre;
      document.getElementById('servicio-descripcion').value = s.descripcion || '';
      document.getElementById('servicio-precio').value = s.precio;
      document.getElementById('servicio-activo').checked = s.activo;

      const totalMin = s.duracion_minutos || 0;
      const hrs = Math.floor(totalMin / 60);
      const mins = totalMin % 60;

      document.getElementById('servicio-duracion-horas').value = hrs.toString();
      document.getElementById('servicio-duracion-minutos').value = mins.toString();
    }
  }
  abrirModal('modal-servicio');
}

async function guardarServicio(e) {
  e.preventDefault();
  const id = document.getElementById('servicio-id').value;
  const nombre = document.getElementById('servicio-nombre').value.trim();
  const descripcion = document.getElementById('servicio-descripcion').value.trim();
  const precio = parseFloat(document.getElementById('servicio-precio').value);
  const hrs = parseInt(document.getElementById('servicio-duracion-horas').value, 10) || 0;
  const mins = parseInt(document.getElementById('servicio-duracion-minutos').value, 10) || 0;
  const activo = document.getElementById('servicio-activo').checked;

  const totalMinutos = (hrs * 60) + mins;

  if (!nombre) return mostrarToast('El nombre del servicio es obligatorio.', 'error');
  if (isNaN(precio) || precio < 0) return mostrarToast('Ingresa un precio válido.', 'error');
  if (totalMinutos <= 0) return mostrarToast('Selecciona una duración mayor a 0 minutos.', 'error');

  const btn = document.getElementById('servicio-submit-btn');
  btn.disabled = true;

  const payload = { nombre, descripcion: descripcion || null, precio, duracion_minutos: totalMinutos, activo };
  const query = id
    ? window.db.from('servicios').update(payload).eq('id', id)
    : window.db.from('servicios').insert(payload);

  const { error } = await query;
  btn.disabled = false;

  if (error) return mostrarToast('No se pudo guardar el servicio.', 'error');

  mostrarToast(id ? 'Servicio actualizado.' : 'Servicio creado correctamente.', 'success');
  cerrarModal('modal-servicio');
  await cargarServicios();
}

async function toggleServicioActivo(id, activo) {
  const { error } = await window.db.from('servicios').update({ activo }).eq('id', id);
  if (error) {
    mostrarToast('No se pudo actualizar el estado.', 'error');
    return;
  }
  const s = serviciosState.lista.find((x) => x.id === id);
  if (s) s.activo = activo;
  mostrarToast(activo ? 'Servicio activado.' : 'Servicio desactivado.', 'success');
}

async function eliminarServicio(id) {
  const ok = await confirmarAccion('¿Eliminar este servicio? Esta acción no se puede deshacer.');
  if (!ok) return;

  const { error } = await window.db.from('servicios').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') {
      mostrarToast('No se puede eliminar: el servicio tiene citas registradas. Desactívalo en su lugar.', 'error');
    } else {
      mostrarToast('No se pudo eliminar el servicio.', 'error');
    }
    return;
  }
  mostrarToast('Servicio eliminado.', 'success');
  await cargarServicios();
}
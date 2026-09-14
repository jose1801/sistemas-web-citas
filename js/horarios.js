// ============================================================
// HORARIOS.JS — configuración de horarios de atención semanales
// ============================================================

const horariosState = { lista: [] };
// Orden de despliegue: Lunes(1) a Domingo(0)
const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];

function initHorarios() {
  document.getElementById('btn-guardar-horarios')?.addEventListener('click', guardarTodosLosHorarios);
  cargarHorarios();
}

async function cargarHorarios() {
  const cont = document.getElementById('horarios-lista');
  if (cont) cont.innerHTML = `<div class="loading-row"><div class="spinner spinner-dark"></div> Cargando horarios...</div>`;

  const { data, error } = await window.db.from('horarios').select('*');
  if (error) {
    mostrarToast('No se pudieron cargar los horarios.', 'error');
    return;
  }

  horariosState.lista = data;
  renderHorarios();
}

function renderHorarios() {
  const cont = document.getElementById('horarios-lista');
  if (!cont) return;

  cont.innerHTML = ORDEN_DIAS.map((dia) => {
    const h = horariosState.lista.find((x) => x.dia_semana === dia);
    if (!h) return '';
    return `
      <div class="horario-row" data-dia="${dia}">
        <div class="horario-day-name">${DIAS_SEMANA[dia]}</div>
        <div class="horario-times">
          <div>
            <label class="form-label">Inicio</label>
            <input type="time" class="form-input js-hora-inicio" value="${h.hora_inicio?.slice(0, 5) || '09:00'}" ${h.activo ? '' : 'disabled'}>
          </div>
          <div>
            <label class="form-label">Fin</label>
            <input type="time" class="form-input js-hora-fin" value="${h.hora_fin?.slice(0, 5) || '18:00'}" ${h.activo ? '' : 'disabled'}>
          </div>
          <div>
            <label class="form-label">Descanso (opcional)</label>
            <div style="display:flex;gap:6px;">
              <input type="time" class="form-input js-descanso-inicio" value="${h.descanso_inicio?.slice(0, 5) || ''}" ${h.activo ? '' : 'disabled'}>
              <input type="time" class="form-input js-descanso-fin" value="${h.descanso_fin?.slice(0, 5) || ''}" ${h.activo ? '' : 'disabled'}>
            </div>
          </div>
        </div>
        <label class="switch">
          <input type="checkbox" class="js-dia-activo" ${h.activo ? 'checked' : ''} onchange="toggleDiaActivo(this)">
          <span class="switch-slider"></span>
        </label>
      </div>`;
  }).join('');
}

function toggleDiaActivo(checkbox) {
  const row = checkbox.closest('.horario-row');
  const activo = checkbox.checked;
  row.querySelectorAll('input[type="time"]').forEach((input) => (input.disabled = !activo));
}

async function guardarTodosLosHorarios() {
  const filas = document.querySelectorAll('.horario-row');
  const actualizaciones = [];
  let hayError = false;

  filas.forEach((row) => {
    const dia = parseInt(row.dataset.dia, 10);
    const activo = row.querySelector('.js-dia-activo').checked;
    const horaInicio = row.querySelector('.js-hora-inicio').value;
    const horaFin = row.querySelector('.js-hora-fin').value;
    const descansoInicio = row.querySelector('.js-descanso-inicio').value;
    const descansoFin = row.querySelector('.js-descanso-fin').value;

    if (activo) {
      if (!horaInicio || !horaFin || horaFin <= horaInicio) {
        hayError = true;
        mostrarToast(`Revisa el horario de ${DIAS_SEMANA[dia]}: la hora final debe ser mayor a la inicial.`, 'error');
      }
      if ((descansoInicio && !descansoFin) || (!descansoInicio && descansoFin)) {
        hayError = true;
        mostrarToast(`Completa ambas horas del descanso de ${DIAS_SEMANA[dia]} o déjalas vacías.`, 'error');
      }
      if (descansoInicio && descansoFin && descansoFin <= descansoInicio) {
        hayError = true;
        mostrarToast(`El descanso de ${DIAS_SEMANA[dia]} tiene un rango de horas inválido.`, 'error');
      }
    }

    actualizaciones.push({
      dia_semana: dia,
      hora_inicio: horaInicio || '09:00',
      hora_fin: horaFin || '18:00',
      descanso_inicio: descansoInicio || null,
      descanso_fin: descansoFin || null,
      activo,
    });
  });

  if (hayError) return;

  const btn = document.getElementById('btn-guardar-horarios');
  btn.disabled = true;

  const errores = [];
  for (const h of actualizaciones) {
    const { error } = await window.db
      .from('horarios')
      .update({
        hora_inicio: h.hora_inicio,
        hora_fin: h.hora_fin,
        descanso_inicio: h.descanso_inicio,
        descanso_fin: h.descanso_fin,
        activo: h.activo,
      })
      .eq('dia_semana', h.dia_semana);
    if (error) errores.push(h.dia_semana);
  }

  btn.disabled = false;

  if (errores.length) {
    mostrarToast('Algunos horarios no se pudieron guardar.', 'error');
  } else {
    mostrarToast('Horarios actualizados correctamente.', 'success');
  }
  await cargarHorarios();
}

/**
 * Utilidad usada por citas.js: obtiene el horario configurado para
 * una fecha determinada (o null si ese día está deshabilitado).
 */
async function obtenerHorarioParaFecha(fechaISO) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const diaSemana = new Date(y, m - 1, d).getDay();
  const { data, error } = await window.db.from('horarios').select('*').eq('dia_semana', diaSemana).single();
  if (error || !data || !data.activo) return null;
  return data;
}

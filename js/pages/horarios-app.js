/* ============================================================
   HORARIOS — Controlador de gestión de horarios
   Dependencias: firebase/config.js, auth.js, ui.js
   ============================================================ */

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const DIAS_LABEL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const TURNOS_OPTS = ['Libre', 'Mañana', 'Tarde', 'Noche', 'Todo el día'];

let sesion = null;
let trabajadores = [];
let horarioActual = null;
let trabajadorActualId = null;

async function init() {
  sesion = Auth.requireAdmin();
  if (!sesion) return;

  document.getElementById('sidebar-nombre').textContent = sesion.nombre || sesion.usuario;
  iniciarReloj('reloj');
  initModoOscuro('btn-modo');

  await cargarTrabajadores();
  await cargarResumenHorarios();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}
function cerrarSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

async function cargarTrabajadores() {
  try {
    const snap = await db.collection('usuarios').where('rol', '==', 'trabajador').get();
    trabajadores = [];
    snap.forEach(d => trabajadores.push({ id: d.id, ...d.data() }));
    trabajadores.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    const sel = document.getElementById('sel-trabajador');
    sel.innerHTML = '<option value="">-- Selecciona un trabajador --</option>';
    trabajadores.forEach(t => {
      sel.innerHTML += `<option value="${t.id}">${t.nombre || t.usuario}</option>`;
    });
  } catch (e) {
    console.error('Error cargando trabajadores:', e);
  }
}

async function cargarHorario() {
  const id = document.getElementById('sel-trabajador').value;
  if (!id) {
    document.getElementById('horario-wrap').style.display = 'none';
    return;
  }

  trabajadorActualId = id;
  const trabajador = trabajadores.find(t => t.id === id);
  document.getElementById('horario-titulo').textContent =
    `Horario semanal — ${trabajador?.nombre || trabajador?.usuario || 'Trabajador'}`;

  // Cargar horario existente
  try {
    const snap = await db.collection('horarios')
      .where('trabajadorId', '==', id).limit(1).get();
    horarioActual = snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch (e) {
    horarioActual = null;
  }

  const semana = horarioActual?.semana || {};

  // Construir tabla
  const tbody = document.getElementById('horario-tbody');
  tbody.innerHTML = `<tr>
    <td style="padding:10px 16px;font-size:0.82rem;font-weight:700;color:var(--text2)">
      Turno asignado
    </td>
    ${DIAS.map(dia => `
      <td style="padding:8px">
        <select id="hor-${dia}" class="form-input"
                style="padding:7px 8px;font-size:0.78rem;width:100%">
          ${TURNOS_OPTS.map(t =>
            `<option value="${t === 'Libre' ? '' : t}"
              ${(semana[dia] || '') === (t === 'Libre' ? '' : t) ? 'selected' : ''}>
              ${t}
            </option>`
          ).join('')}
        </select>
      </td>`).join('')}
  </tr>`;

  document.getElementById('horario-wrap').style.display = 'block';
}

async function guardarHorario() {
  if (!trabajadorActualId) return;

  const semana = {};
  DIAS.forEach(dia => {
    semana[dia] = document.getElementById(`hor-${dia}`)?.value || null;
  });

  const trabajador = trabajadores.find(t => t.id === trabajadorActualId);
  const btn = document.getElementById('btn-guardar-horario');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    if (horarioActual) {
      await db.collection('horarios').doc(horarioActual.id)
        .update({ semana, updatedAt: new Date() });
    } else {
      const ref = await db.collection('horarios').add({
        trabajadorId: trabajadorActualId,
        trabajador: trabajador?.nombre || trabajador?.usuario || '',
        semana,
        creadoEn: new Date()
      });
      horarioActual = { id: ref.id, trabajadorId: trabajadorActualId, semana };
    }
    mostrarToast('Horario guardado correctamente', 'success');
    await cargarResumenHorarios();
  } catch (e) {
    mostrarToast('Error al guardar horario', 'error');
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Guardar Horario';
  }
}

async function cargarResumenHorarios() {
  const contenedor = document.getElementById('resumen-horarios');
  contenedor.innerHTML = `<p style="color:var(--text3);font-size:0.85rem">Cargando...</p>`;

  try {
    const snap = await db.collection('horarios').get();
    const horarios = [];
    snap.forEach(d => horarios.push({ id: d.id, ...d.data() }));

    if (horarios.length === 0) {
      contenedor.innerHTML =
        `<p style="color:var(--text3);font-size:0.85rem">No hay horarios configurados.</p>`;
      return;
    }

    // Ordenar por nombre de trabajador (client-side)
    horarios.sort((a, b) => (a.trabajador || '').localeCompare(b.trabajador || ''));

    contenedor.innerHTML = `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
          <thead>
            <tr>
              <th style="padding:10px 12px;background:var(--bg3);color:var(--text3);
                         font-size:0.7rem;font-weight:800;letter-spacing:1.5px;
                         text-transform:uppercase;text-align:left;
                         border-bottom:1px solid var(--border)">
                Trabajador
              </th>
              ${DIAS_LABEL.map(d => `
                <th style="padding:10px 8px;background:var(--bg3);color:var(--text3);
                           font-size:0.65rem;font-weight:800;letter-spacing:1px;
                           text-transform:uppercase;text-align:center;
                           border-bottom:1px solid var(--border)">
                  ${d}
                </th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${horarios.map(h => `
              <tr style="border-bottom:1px solid rgba(51,64,96,0.4)">
                <td style="padding:10px 12px;font-weight:700;color:var(--text)">
                  ${h.trabajador || '—'}
                </td>
                ${DIAS.map(dia => {
                  const turno = h.semana?.[dia] || null;
                  const color = turno === 'Mañana'      ? 'var(--yellow)'
                              : turno === 'Tarde'       ? 'var(--accent)'
                              : turno === 'Noche'       ? 'var(--blue)'
                              : turno === 'Todo el día' ? 'var(--red)'
                              : 'var(--text3)';
                  const bg    = turno === 'Mañana'      ? 'var(--yellow-dim)'
                              : turno === 'Tarde'       ? 'var(--accent-dim)'
                              : turno === 'Noche'       ? 'var(--blue-dim)'
                              : turno === 'Todo el día' ? 'var(--red-dim)'
                              : 'transparent';
                  return `<td style="padding:8px;text-align:center">
                    ${turno
                      ? `<span style="background:${bg};color:${color};padding:3px 7px;
                                      border-radius:6px;font-size:0.7rem;font-weight:700">
                           ${turno}
                         </span>`
                      : `<span style="color:var(--text3);font-size:0.7rem">—</span>`
                    }
                  </td>`;
                }).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (e) {
    contenedor.innerHTML =
      `<p style="color:var(--red);font-size:0.85rem">Error al cargar resumen</p>`;
    console.error(e);
  }
}

init();

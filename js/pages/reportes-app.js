/* ============================================================
   REPORTES — Controlador de reportes por turno
   Dependencias: firebase/config.js, auth.js, ui.js,
                 turnos.js, reportes.js
   ============================================================ */

let sesion = null;
let turnosData = [];
let trabajadoresSet = new Set();

async function init() {
  sesion = Auth.requireAdmin();
  if (!sesion) return;

  document.getElementById('sidebar-nombre').textContent = sesion.nombre || sesion.usuario;
  iniciarReloj('reloj');
  initModoOscuro('btn-modo');
  await cargarTurnos();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}
function cerrarSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

async function cargarTurnos() {
  const contenedor = document.getElementById('lista-turnos');
  contenedor.innerHTML = `<p style="color:var(--text3)">Cargando...</p>`;
  try {
    turnosData = await Turnos.getTodos();

    // Poblar select de trabajadores
    trabajadoresSet = new Set();
    turnosData.forEach(t => { if (t.trabajador) trabajadoresSet.add(t.trabajador); });
    const selectTrabajador = document.getElementById('filtro-trabajador');
    const valorActual = selectTrabajador.value;
    selectTrabajador.innerHTML = '<option value="">Todos los trabajadores</option>';
    trabajadoresSet.forEach(t => {
      selectTrabajador.innerHTML +=
        `<option value="${t}" ${t === valorActual ? 'selected' : ''}>${t}</option>`;
    });

    aplicarFiltros();
  } catch (e) {
    contenedor.innerHTML = `<p style="color:var(--red)">Error al cargar turnos</p>`;
    console.error(e);
  }
}

function aplicarFiltros() {
  const trabajador = document.getElementById('filtro-trabajador').value;
  const estado = document.getElementById('filtro-estado').value;

  let filtrados = [...turnosData];
  if (trabajador) filtrados = filtrados.filter(t => t.trabajador === trabajador);
  if (estado) filtrados = filtrados.filter(t => t.estado === estado);

  renderizarTurnos(filtrados);
}

function renderizarTurnos(lista) {
  const contenedor = document.getElementById('lista-turnos');
  if (lista.length === 0) {
    contenedor.innerHTML = `
      <div style="text-align:center;padding:48px;color:var(--text3)">
        <div style="font-size:2.5rem;margin-bottom:12px">📋</div>
        <p>No se encontraron turnos.</p>
      </div>`;
    return;
  }

  contenedor.innerHTML = lista.map(t => {
    const inicio = formatFecha(t.inicio);
    const fin    = t.fin ? formatFecha(t.fin) : null;
    const fmt    = {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit'
    };
    const inicioStr   = inicio.toLocaleString('es-PE', fmt);
    const finStr      = fin ? fin.toLocaleString('es-PE', fmt) : 'En curso';
    const estadoClase = t.estado === 'activo'
      ? 'badge-estado-activo'
      : 'badge-estado-cerrado';
    const estadoTxt   = t.estado === 'activo' ? '🟢 ACTIVO' : '⚫ CERRADO';

    return `
      <div class="turno-card">
        <div class="turno-card-header">
          <div class="turno-card-info">
            <h4>👷 ${t.trabajador || 'Sin nombre'} — ${t.tipo}</h4>
            <p>Inicio: ${inicioStr}</p>
            <p>Fin: ${finStr}</p>
            <p><span class="${estadoClase}">${estadoTxt}</span></p>
          </div>
          <div class="turno-card-total" id="total-turno-${t.id}">
            <span class="turno-card-total-label">TOTAL</span>
            Cargando...
          </div>
        </div>
        <div class="turno-card-actions">
          <button class="btn btn-secondary no-print"
            onclick="verReporte('${t.id}')">👁️ Ver Reporte</button>
          <button class="btn btn-secondary no-print"
            onclick="imprimirReporte('${t.id}')">🖨️ Imprimir</button>
          <button class="btn btn-secondary no-print"
            onclick="descargarPDFTurno('${t.id}')">📄 PDF</button>
        </div>
      </div>`;
  }).join('');

  // Cargar totales en background
  lista.forEach(t => cargarTotalTurno(t));
}

async function cargarTotalTurno(turno) {
  try {
    const cobros = await Reportes.getByTurno(turno.id);
    const total  = Reportes.calcularTotal(cobros);
    const el     = document.getElementById(`total-turno-${turno.id}`);
    if (el) {
      el.innerHTML =
        `<span class="turno-card-total-label">TOTAL</span>S/ ${total.toFixed(2)}`;
    }
  } catch (e) {}
}

async function verReporte(turnoId) {
  const turno = turnosData.find(t => t.id === turnoId);
  if (!turno) return;

  try {
    const cobros = await Reportes.getByTurno(turnoId);
    const htmlReporte = Reportes.generarHTMLReporte(cobros, turno);
    mostrarModal(
      `📋 Reporte — ${turno.trabajador} (${turno.tipo})`,
      htmlReporte,
      [
        {
          texto: '🖨️ Imprimir',
          clase: 'btn-secondary no-print',
          accion: () => imprimirReporte(turnoId)
        },
        {
          texto: '📄 PDF',
          clase: 'btn-secondary no-print',
          accion: () => descargarPDFTurno(turnoId)
        },
        { texto: 'Cerrar', clase: 'btn-secondary no-print', accion: cerrarModal }
      ]
    );
  } catch (e) {
    mostrarToast('Error al cargar reporte', 'error');
    console.error(e);
  }
}

async function descargarPDFTurno(turnoId) {
  const turno = turnosData.find(t => t.id === turnoId);
  if (!turno) return;
  try {
    cerrarModal();
    mostrarToast('Generando PDF...', 'success');
    const cobros = await Reportes.getByTurno(turnoId);
    Reportes.descargarPDF(turno, cobros, null);
  } catch (e) {
    mostrarToast('Error al generar PDF', 'error');
    console.error(e);
  }
}

async function imprimirReporte(turnoId) {
  const turno = turnosData.find(t => t.id === turnoId);
  if (!turno) return;

  try {
    const cobros = await Reportes.getByTurno(turnoId);
    const htmlReporte = Reportes.generarHTMLReporte(cobros, turno);
    imprimirDocumento(htmlReporte);
  } catch (e) {
    mostrarToast('Error al preparar impresión', 'error');
    console.error(e);
  }
}

init();

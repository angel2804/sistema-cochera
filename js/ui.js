// ui.js — Funciones globales de interfaz

/**
 * Muestra un toast de notificación
 * @param {string} mensaje
 * @param {'success'|'error'|'warning'|'info'} tipo
 */
function mostrarToast(mensaje, tipo = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;

  const iconos = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  toast.innerHTML = `<span class="toast-icon">${iconos[tipo] || '✅'}</span><span class="toast-msg">${mensaje}</span>`;

  container.appendChild(toast);

  // Forzar reflow para animación
  toast.offsetHeight;
  toast.classList.add('toast-visible');

  setTimeout(() => {
    toast.classList.remove('toast-visible');
    toast.classList.add('toast-hide');
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

/**
 * Muestra un modal global
 * @param {string} titulo
 * @param {string} html — contenido interno
 * @param {Array<{texto, clase, accion}>} botones
 */
function mostrarModal(titulo, html, botones = []) {
  cerrarModal();

  const overlay = document.createElement('div');
  overlay.id = 'modal-global';
  overlay.className = 'modal-overlay';

  const botonesHTML = botones.map((b, i) =>
    `<button class="btn ${b.clase || 'btn-secondary'}" data-idx="${i}">${b.texto}</button>`
  ).join('');

  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3 class="modal-title">${titulo}</h3>
        <button class="modal-close" onclick="cerrarModal()">✕</button>
      </div>
      <div class="modal-body">${html}</div>
      ${botones.length ? `<div class="modal-actions">${botonesHTML}</div>` : ''}
    </div>
  `;

  // Asignar eventos a botones
  overlay.querySelectorAll('[data-idx]').forEach(btn => {
    const idx = parseInt(btn.dataset.idx);
    btn.addEventListener('click', () => {
      if (botones[idx] && typeof botones[idx].accion === 'function') {
        botones[idx].accion();
      }
    });
  });

  // Cerrar al click en overlay (fuera del modal)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cerrarModal();
  });

  document.body.appendChild(overlay);

  // Forzar reflow para animación
  overlay.offsetHeight;
  overlay.classList.add('modal-visible');
}

/**
 * Cierra el modal global
 */
function cerrarModal() {
  const modal = document.getElementById('modal-global');
  if (modal) modal.remove();
}

/**
 * Calcula tiempo transcurrido desde una fecha hasta ahora
 * @param {*} desde — timestamp Firestore o Date
 * @returns {string} "X min" o "Xh Ymin"
 */
function calcularTiempo(desde) {
  const inicio = formatFecha(desde);
  const ahora = new Date();
  const mins = Math.floor((ahora - inicio) / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}min`;
}

/**
 * Calcula tiempo entre dos fechas
 * @param {*} desde
 * @param {*} hasta
 * @returns {string}
 */
function calcularTiempoEntre(desde, hasta) {
  const inicio = formatFecha(desde);
  const fin = formatFecha(hasta);
  const mins = Math.floor((fin - inicio) / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}min`;
}

/**
 * Calcula el costo de la estadía con período de gracia y penalidad.
 * - Mínimo 1 día para estancias menores a 24h.
 * - Gracia: hasta 3h extra sin cargo adicional.
 * - Penalidad: más de 3h extra → se cobran todas las horas extra.
 * @param {*} fechaEntrada — timestamp Firestore, Date o string
 * @param {number} tarifaDiaria — costo por día en soles
 * @returns {{ dias, horasExtra, costoTotal, aplicaPenalidad }}
 */
function calcularCostoEstadia(fechaEntrada, tarifaDiaria) {
  const inicio      = formatFecha(fechaEntrada);
  const ahora       = new Date();
  const horasTotales = (ahora - inicio) / 3600000;

  let dias       = Math.floor(horasTotales / 24);
  let horasExtra = Math.floor(horasTotales % 24);

  // Mínimo 1 día para estancias de menos de 24 horas
  if (horasTotales < 24) {
    dias       = 1;
    horasExtra = 0;
  }

  const costoPorHora    = tarifaDiaria / 24;
  const aplicaPenalidad = horasExtra > 3;

  const costoTotal = aplicaPenalidad
    ? (dias * tarifaDiaria) + (horasExtra * costoPorHora)
    : (dias * tarifaDiaria);

  return { dias, horasExtra, costoTotal, aplicaPenalidad };
}

/**
 * Inicia un reloj en tiempo real en un elemento
 * @param {string} elementId
 */
function iniciarReloj(elementId) {
  function actualizar() {
    const el = document.getElementById(elementId);
    if (!el) return;
    const ahora = new Date();
    el.textContent = ahora.toLocaleTimeString('es-PE', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
  }
  actualizar();
  setInterval(actualizar, 1000);
}

/**
 * Inicializa el modo oscuro/claro
 * @param {string} btnId — id del botón toggle
 */
function initModoOscuro(btnId) {
  const savedMode = localStorage.getItem('darkMode');
  // Por defecto dark mode (no agregar light-mode)
  if (savedMode === 'light') {
    document.body.classList.add('light-mode');
  }

  const btn = document.getElementById(btnId);
  if (!btn) return;

  function actualizarBtn() {
    const isLight = document.body.classList.contains('light-mode');
    btn.textContent = isLight ? '🌙' : '☀️';
    btn.title = isLight ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro';
  }
  actualizarBtn();

  btn.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    localStorage.setItem('darkMode', isLight ? 'light' : 'dark');
    actualizarBtn();
  });
}

/**
 * Convierte un timestamp Firestore o Date/string a objeto Date
 * @param {*} ts
 * @returns {Date}
 */
function formatFecha(ts) {
  if (!ts) return new Date();
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

/**
 * Formatea una fecha a string legible en español
 * @param {*} ts
 * @param {boolean} soloHora
 * @returns {string}
 */
function fechaStr(ts, soloHora = false) {
  const d = formatFecha(ts);
  if (soloHora) return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/**
 * Formatea monto a string con símbolo de sol
 * @param {number} monto
 * @returns {string}
 */
function formatMonto(monto) {
  return `S/ ${(monto || 0).toFixed(2)}`;
}

/**
 * Renderiza el grid de tipos de vehículo en un contenedor
 * @param {string} containerId — id del div contenedor
 * @param {string} onclickFn  — nombre de la función que recibe el elemento
 */
function renderTipoVehiculoGrid(containerId, onclickFn) {
  const TIPOS = [
    { tipo: 'Auto',      icono: '🚗' },
    { tipo: 'Moto',      icono: '🏍️' },
    { tipo: 'Camioneta', icono: '🚙' },
    { tipo: 'Cisterna',  icono: '🚛' },
    { tipo: 'Tráiler',   icono: '🚜' },
    { tipo: 'Volquete',  icono: '🏗️' },
    { tipo: 'Bus',       icono: '🚌' },
    { tipo: 'Otro',      icono: '🚐' },
  ];
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = TIPOS.map((t, i) =>
    `<div class="tipo-vehiculo-btn${i === 0 ? ' selected' : ''}" data-tipo="${t.tipo}" onclick="${onclickFn}(this)">` +
    `<span class="tv-icon">${t.icono}</span><span class="tv-name">${t.tipo}</span></div>`
  ).join('');
}

/**
 * Imprime solo el HTML dado, ocultando el resto del DOM.
 * Evita hojas en blanco y superposiciones del fondo de la app.
 * @param {string} html — HTML a imprimir
 */
function imprimirDocumento(html) {
  cerrarModal();

  let printRoot = document.getElementById('print-root');
  if (!printRoot) {
    printRoot = document.createElement('div');
    printRoot.id = 'print-root';
    document.body.appendChild(printRoot);
  }
  printRoot.innerHTML = html;

  // Ocultar todos los hermanos de #print-root
  Array.from(document.body.children).forEach(el => {
    if (el.id !== 'print-root') el.classList.add('hide-for-print');
  });

  window.print();

  // Restaurar DOM
  document.querySelectorAll('.hide-for-print').forEach(el => {
    el.classList.remove('hide-for-print');
  });
  printRoot.remove();
}

/**
 * Abre el ticket en una nueva pestaña y lanza automáticamente el diálogo de impresión.
 * Incluye los estilos mínimos para que el ticket se vea correctamente sin depender de styles.css.
 * @param {string} htmlTicket — HTML generado por Reportes.generarHTMLTicket()
 */
function abrirTicketNuevaPestana(htmlTicket) {
  const win = window.open('', '_blank');
  if (!win) {
    mostrarToast('Permite ventanas emergentes para imprimir el ticket', 'warning');
    return;
  }
  win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Ticket — COCHERA POS</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', Courier, monospace; background: #fff; color: #111;
           display: flex; justify-content: center; padding: 24px; }
    .ticket-wrap { width: 300px; border: 1px dashed #aaa; border-radius: 8px; padding: 18px 16px; }
    .ticket-encabezado { text-align: center; margin-bottom: 8px; }
    .ticket-logo { font-size: 1.1rem; font-weight: 700; letter-spacing: 2px; }
    .ticket-num { font-size: 0.75rem; color: #555; margin-top: 2px; }
    .ticket-sep { text-align: center; font-size: 0.7rem; color: #bbb; margin: 8px 0; }
    .ticket-placa-grande { text-align: center; font-size: 1.8rem; font-weight: 700;
           letter-spacing: 4px; margin: 10px 0; padding: 8px;
           border: 2px solid #111; border-radius: 6px; }
    .ticket-filas { margin: 8px 0; }
    .ticket-fila { display: flex; justify-content: space-between; font-size: 0.75rem;
           padding: 3px 0; border-bottom: 1px dotted #ddd; }
    .ticket-lbl { color: #555; }
    .ticket-val { font-weight: 700; text-align: right; max-width: 60%; }
    .ticket-mono { font-family: 'Courier New', monospace; }
    .ticket-total-fila { display: flex; justify-content: space-between; align-items: center;
           margin-top: 8px; padding-top: 8px; border-top: 2px solid #111; }
    .ticket-total-lbl { font-size: 0.85rem; font-weight: 700; letter-spacing: 2px; }
    .ticket-total-val { font-size: 1.4rem; font-weight: 700; color: #007a5e; }
    .ticket-pie { text-align: center; font-size: 0.7rem; color: #888; margin-top: 12px; }
    @media print { body { padding: 0; } .ticket-wrap { border: none; } }
  </style>
</head>
<body>
  ${htmlTicket}
  <script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`);
  win.document.close();
}

/**
 * Emite un sonido de feedback usando Web Audio API.
 * No lanza errores si el navegador bloquea el audio (política de autoplay).
 * @param {'success'|'error'} tipo
 */
function beep(tipo = 'success') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (tipo === 'success') {
      // Dos tonos ascendentes: confirmación positiva
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.28);
    } else {
      // Tono grave descendente: error o advertencia
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.setValueAtTime(140, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch (e) {
    // Silencioso: el navegador puede requerir interacción previa para el audio
  }
}

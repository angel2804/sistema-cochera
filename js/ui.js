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
function imprimirTicketSilencioso(htmlTicket) {
  // 1. Crear un Iframe invisible
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);

  // 2. Extraer el documento del Iframe
  const win = iframe.contentWindow;
  const doc = win.document;

  // 3. Inyectar el HTML y el CSS del ticket
  doc.open();
  doc.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Ticket — COCHERA POS</title>
  <style>
    /* ── Tamaño de página térmica 80mm ── */
    @page { size: 80mm auto; margin: 3mm 1mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Courier New', Courier, monospace;
      background: #fff; color: #000;
      width: 80mm; margin: 0 auto; padding: 4mm 2mm;
      font-size: 9pt;
    }
    
    /* Layout y Utilidades */
    .ticket-wrap { width: 100%; border: none; }
    .ticket-encabezado { text-align: center; margin-bottom: 4px; }
    .ticket-logo  { font-size: 11pt; font-weight: 700; letter-spacing: 3px; }
    .ticket-num   { font-size: 8pt; color: #444; margin-top: 2px; }
    .ticket-sep   { text-align: center; font-size: 8pt; color: #666; margin: 5px 0; letter-spacing: 2px; }
    
    /* Placa y Datos */
    .ticket-placa-grande {
      text-align: center; font-size: 20pt; font-weight: 700;
      letter-spacing: 5px; border: 2px solid #000;
      border-radius: 3px; padding: 4px 2px; margin: 6px 0;
    }
    .ticket-filas { margin-bottom: 6px; }
    .ticket-fila  { display: flex; justify-content: space-between; font-size: 8.5pt; padding: 2px 0; border-bottom: 1px dashed #aaa; }
    .ticket-lbl   { color: #555; }
    .ticket-val   { font-weight: 700; text-align: right; max-width: 58%; }
    
    /* Total y Pie */
    .ticket-total-fila {
      display: flex; justify-content: space-between; align-items: center;
      margin-top: 6px; padding-top: 5px; border-top: 2.5px solid #000;
    }
    .ticket-total-lbl { font-size: 8pt; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
    .ticket-total-val { font-size: 17pt; font-weight: 700; }
    .ticket-pie { text-align: center; font-size: 7.5pt; color: #555; margin-top: 8px; padding-bottom: 4mm; }
  </style>
</head>
<body>
  ${htmlTicket}
</body>
</html>`);
  doc.close();

  // 4. Esperar a que el navegador procese el renderizado y lanzar la impresión
  setTimeout(() => {
    win.focus();
    win.print();
    
    // 5. Destruir el Iframe después de imprimir o cancelar para no saturar la memoria
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1000); 
  }, 250);
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

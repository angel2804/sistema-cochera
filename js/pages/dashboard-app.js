/* ============================================================
   DASHBOARD — Controlador SPA de administración
   Dependencias: firebase/config.js, auth.js, ui.js,
                 turnos.js, clientes.js, vehiculos.js, reportes.js
   ============================================================ */

// ══ ESTADO ══
let sesion = null;
let turnoActual = null;
let seccionActiva = 'dashboard';
let histFiltro = 'hoy';
let histDatos = [];           // datos cargados de Firestore (o página actual)
let histDatosFiltrados = [];  // después de aplicar búsqueda por placa
let histPagina = 1;
const HIST_PAGE_SIZE = 25;

// Cursor para paginación Firestore (solo aplica a filtro='todo')
let histLastDoc = null;       // último documento de la página actual
let histFirstDocs = [null];   // stack de firstDoc por página (para "Anterior")

let tipoVehiculoReg = 'Auto';
let clienteRegAC = null;

// ══ INIT ══
async function init() {
  sesion = Auth.requireAdmin();
  if (!sesion) return;

  document.getElementById('sidebar-nombre').textContent = sesion.nombre || sesion.usuario;
  iniciarReloj('reloj');
  initModoOscuro('btn-modo');

  // Grid de tipos de vehículo (sección registro)
  renderTipoVehiculoGrid('reg-tipo-grid', 'seleccionarTipoVehiculoReg');

  // Cargar turno activo
  try { turnoActual = await Turnos.getActivo(); } catch (e) {}

  await cargarDashboard();
  cargarContadorAlertas();
}

// ══ NAVEGACIÓN ══
function navegarA(seccion) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item[data-section]').forEach(n => n.classList.remove('active'));

  const sec = document.getElementById(`section-${seccion}`);
  if (sec) sec.classList.add('active');

  const nav = document.querySelector(`.nav-item[data-section="${seccion}"]`);
  if (nav) nav.classList.add('active');

  seccionActiva = seccion;
  cerrarSidebar();

  const titulos = {
    dashboard:    '🏠 Dashboard',
    registro:     '🚗 Entrada / Salida',
    historial:    '📋 Historial',
    estadisticas: '📊 Estadísticas',
    usuarios:     '👥 Usuarios',
    alertas:      '🔔 Alertas de Caja',
    config:       '⚙️ Configuración'
  };
  document.getElementById('page-title').textContent = titulos[seccion] || seccion;

  // Cargar datos según sección
  if (seccion === 'historial')    cargarHistorial();
  if (seccion === 'estadisticas') cargarEstadisticas();
  if (seccion === 'usuarios')     cargarUsuarios();
  if (seccion === 'registro') { actualizarBannerRegistro(); cargarListaRapidaAdmin(); }
  if (seccion === 'alertas') cargarAlertas();
  if (seccion === 'config') {
    cargarConfigEspacios();
    const cardDev = document.getElementById('card-dev');
    if (cardDev) {
      cardDev.style.display = sesion?.rol === 'desarrollador' ? 'block' : 'none';
    }
    if (sesion?.rol === 'desarrollador') cargarLogoActual();
  }
}

// ══ SIDEBAR ══
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}
function cerrarSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

// ══ MODO OSCURO ══
function toggleModoManual() {
  document.body.classList.toggle('light-mode');
  const isLight = document.body.classList.contains('light-mode');
  localStorage.setItem('darkMode', isLight ? 'light' : 'dark');
}

// ══ DASHBOARD ══
async function cargarDashboard() {
  try {
    // Autos en cochera
    const enCochera = await db.collection('autos').where('estado', '==', 'dentro').get();
    const totalEspacios = await Vehiculos.getTotalEspacios();
    const dentroCount = enCochera.size;
    const libres = Math.max(0, totalEspacios - dentroCount);
    document.getElementById('stat-autos').textContent = dentroCount;
    document.getElementById('stat-disponibles').textContent = libres;

    // Barra de ocupación
    const pct = totalEspacios > 0 ? Math.round((dentroCount / totalEspacios) * 100) : 0;
    document.getElementById('barra-espacios').style.width = pct + '%';
    document.getElementById('texto-espacios').textContent =
      `${dentroCount} / ${totalEspacios} (${pct}%)`;

    // Ingresos y atendidos hoy — query por fecha >= hoy
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    const cobrosHoySnap = await db.collection('cobros')
      .where('fechaCobro', '>=', hoy)
      .where('fechaCobro', '<', manana)
      .get();

    let totalHoy = 0;
    cobrosHoySnap.forEach(d => { totalHoy += d.data().monto || 0; });
    document.getElementById('stat-ingresos').textContent = `S/ ${totalHoy.toFixed(2)}`;

    // Atendidos hoy (autos con fecha hoy)
    const autosHoySnap = await db.collection('autos')
      .where('fecha', '>=', hoy)
      .where('fecha', '<', manana)
      .get();
    document.getElementById('stat-atendidos').textContent = autosHoySnap.size;

    // Banner turno
    mostrarBannerTurno();

  } catch (e) {
    console.error('Error cargando dashboard:', e);
  }
}

function mostrarBannerTurno() {
  const el = document.getElementById('banner-turno');
  if (!el) return;
  if (turnoActual) {
    const inicio = formatFecha(turnoActual.inicio);
    const hora = inicio.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    el.style.display = 'block';
    el.innerHTML = `
      <div class="turno-banner">
        <span class="turno-banner-info">
          🔄 Turno activo: <strong>${turnoActual.trabajador}</strong>
          — ${turnoActual.tipo} — desde ${hora}
        </span>
        <a href="reportes.html"
           style="font-size:0.78rem;color:var(--accent);font-weight:700;text-decoration:none">
          Ver reportes →
        </a>
      </div>`;
  } else {
    el.style.display = 'block';
    el.innerHTML = `
      <div class="turno-banner warning">
        <span class="turno-banner-info">⚠️ No hay turno activo en este momento</span>
      </div>`;
  }
}

// ══ REGISTRO ADMIN ══
function seleccionarTipoVehiculoReg(btn) {
  document.querySelectorAll('#reg-tipo-grid .tipo-vehiculo-btn')
    .forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  tipoVehiculoReg = btn.dataset.tipo;
}

function toggleMontoReg(checked) {
  const wrap = document.getElementById('reg-monto-wrap');
  wrap.classList.toggle('visible', checked);
  if (checked) {
    const tarifa = parseFloat(document.getElementById('reg-tarifa')?.value) || 0;
    const montoEl = document.getElementById('reg-monto');
    if (tarifa > 0 && !montoEl.value) montoEl.value = tarifa.toFixed(2);
  } else {
    document.getElementById('reg-monto').value = '';
  }
}

// Sincroniza el monto de ingreso con la tarifa si el toggle está activo
function sincronizarTarifaMontoReg() {
  if (!document.getElementById('reg-cobrar')?.checked) return;
  const tarifa = parseFloat(document.getElementById('reg-tarifa').value) || 0;
  document.getElementById('reg-monto').value = tarifa > 0 ? tarifa.toFixed(2) : '';
}

let acRegTimeout = null;
async function autocompletarClienteReg(placa) {
  clearTimeout(acRegTimeout);
  if (placa.length < 3) {
    document.getElementById('ac-reg-card').classList.remove('visible');
    clienteRegAC = null;
    return;
  }
  acRegTimeout = setTimeout(async () => {
    try {
      const c = await Clientes.buscarPorPlaca(placa);
      if (c) {
        clienteRegAC = c;
        document.getElementById('ac-reg-nombre').textContent = c.nombre;
        document.getElementById('ac-reg-celular').textContent = c.celular || 'Sin celular';
        document.getElementById('ac-reg-card').classList.add('visible');
      } else {
        clienteRegAC = null;
        document.getElementById('ac-reg-card').classList.remove('visible');
      }
    } catch (e) {}
  }, 400);
}

function usarClienteReg() {
  if (!clienteRegAC) return;
  document.getElementById('reg-nombre').value = clienteRegAC.nombre;
  document.getElementById('reg-celular').value = clienteRegAC.celular || '';
  document.getElementById('ac-reg-card').classList.remove('visible');
  clienteRegAC = null;
  mostrarToast('Cliente cargado', 'success');
}

function actualizarBannerRegistro() {
  const el = document.getElementById('banner-registro-turno');
  if (!el) return;
  if (turnoActual) {
    el.innerHTML = `
      <div style="background:var(--accent-dim);border:1px solid rgba(0,212,170,0.3);
                  border-radius:var(--radius);padding:11px 14px;font-size:0.82rem;
                  color:var(--accent);font-weight:700;margin-bottom:14px">
        ℹ️ Este registro se asignará al turno de
        <strong>${turnoActual.trabajador}</strong> (${turnoActual.tipo})
      </div>`;
  } else {
    el.innerHTML = `
      <div style="background:var(--yellow-dim);border:1px solid rgba(249,202,36,0.3);
                  border-radius:var(--radius);padding:11px 14px;font-size:0.82rem;
                  color:var(--yellow);font-weight:700;margin-bottom:14px">
        ⚠️ No hay turno activo. El auto no se asignará a ningún reporte de cobros.
      </div>`;
  }
}

async function registrarEntradaAdmin() {
  const placa = document.getElementById('reg-placa').value.trim();
  if (!placa) { mostrarToast('Ingresa la placa del vehículo', 'warning'); return; }

  const tarifa = parseFloat(document.getElementById('reg-tarifa').value) || 0;
  if (tarifa <= 0) {
    mostrarToast('Ingresa la tarifa pactada por día', 'warning');
    document.getElementById('reg-tarifa').focus();
    return;
  }

  const cobrar = document.getElementById('reg-cobrar').checked;
  const monto = parseFloat(document.getElementById('reg-monto').value) || 0;
  if (cobrar && monto <= 0) { mostrarToast('Ingresa el monto a cobrar', 'warning'); return; }

  const btn = document.getElementById('btn-reg-entrada');
  btn.disabled = true;
  btn.textContent = 'Registrando...';

  try {
    const datos = {
      placa,
      tipo: tipoVehiculoReg,
      clienteNombre: document.getElementById('reg-nombre').value.trim() || 'Sin nombre',
      clienteCelular: document.getElementById('reg-celular').value.trim(),
      cobradoAlIngreso: cobrar,
      montoIngreso: monto,
      tarifaPactada: tarifa,
      esPreRegistro: false
    };

    // Refrescar turno activo antes de registrar
    try { turnoActual = await Turnos.getActivo(); } catch (e) {}

    const resultado = await Vehiculos.registrarEntrada(datos, turnoActual, sesion);

    // Abrir ticket en nueva pestaña para impresión inmediata
    abrirTicketNuevaPestana(Reportes.generarHTMLTicket(resultado));

    mostrarToast(`✅ Entrada registrada: ${placa}`, 'success');

    // Limpiar form
    document.getElementById('reg-placa').value = '';
    document.getElementById('reg-nombre').value = '';
    document.getElementById('reg-celular').value = '';
    document.getElementById('reg-tarifa').value = '';
    document.getElementById('reg-cobrar').checked = false;
    document.getElementById('reg-monto').value = '';
    document.getElementById('reg-monto-wrap').classList.remove('visible');
    document.getElementById('ac-reg-card').classList.remove('visible');
    document.querySelectorAll('#reg-tipo-grid .tipo-vehiculo-btn')
      .forEach(b => b.classList.remove('selected'));
    document.querySelector('#reg-tipo-grid [data-tipo="Auto"]').classList.add('selected');
    tipoVehiculoReg = 'Auto';

    // Actualizar lista rápida de salida
    cargarListaRapidaAdmin();

  } catch (e) {
    if (e.message === 'duplicado') {
      mostrarToast(`⚠️ El vehículo ya está en cochera`, 'warning');
    } else if (e.message === 'sin_espacio') {
      mostrarToast('❌ Sin espacios disponibles', 'error');
    } else {
      mostrarToast('Error al registrar', 'error');
      console.error(e);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '🚗 Registrar Entrada';
  }
}

// ══ SALIDA ADMIN ══
// El cobro se asigna al turno activo del trabajador (turnoActual),
// igual que el registro de entrada del admin.

let autoParaSalidaAdmin = null;
let listaCocheraAdmin = [];

async function cargarListaRapidaAdmin() {
  try {
    listaCocheraAdmin = await Vehiculos.getEnCochera();
    filtrarListaRapidaAdmin(document.getElementById('adm-sal-placa')?.value || '');
  } catch (e) {
    console.error('Error cargando lista admin:', e);
  }
}

function filtrarListaRapidaAdmin(query) {
  const contenedor = document.getElementById('adm-lista-rapida');
  if (!contenedor) return;
  const texto = query.toUpperCase().trim();
  const lista  = texto
    ? listaCocheraAdmin.filter(a => a.placa.includes(texto))
    : listaCocheraAdmin;

  if (lista.length === 0) {
    contenedor.innerHTML = `<p class="lista-rapida-vacia">${texto ? 'Sin coincidencias' : 'Cochera vacía'}</p>`;
    return;
  }
  contenedor.innerHTML = lista.map(a => `
    <div class="lista-rapida-item" data-id="${a.id}"
      onclick="cargarAutoParaSalidaAdmin('${a.id}')">
      <span class="lista-rapida-placa">${a.placa}</span>
      <span class="lista-rapida-tipo">${a.tipo}</span>
      <span class="lista-rapida-tiempo">${calcularTiempo(a.horaEntrada)}</span>
    </div>
  `).join('');
}

function cargarAutoParaSalidaAdmin(autoId) {
  const auto = listaCocheraAdmin.find(a => a.id === autoId);
  if (!auto) return;
  autoParaSalidaAdmin = auto;
  document.getElementById('adm-sal-placa').value = auto.placa;
  mostrarAutoEncontradoAdmin(auto);
  document.querySelectorAll('#adm-lista-rapida .lista-rapida-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === autoId);
  });
}

function seleccionarPrimerResultadoAdmin() {
  const primer = document.querySelector('#adm-lista-rapida .lista-rapida-item');
  if (primer) primer.click();
  else buscarAutoSalidaAdmin();
}

async function buscarAutoSalidaAdmin() {
  const placa = document.getElementById('adm-sal-placa').value.trim();
  if (placa.length < 3) return;
  try {
    const snap = await db.collection('autos').where('placa', '==', placa).get();
    let auto = null;
    snap.forEach(d => { if (d.data().estado === 'dentro') auto = { id: d.id, ...d.data() }; });
    if (auto) {
      autoParaSalidaAdmin = auto;
      mostrarAutoEncontradoAdmin(auto);
    } else {
      autoParaSalidaAdmin = null;
      document.getElementById('adm-auto-encontrado').classList.remove('visible');
      document.getElementById('adm-sal-no-encontrado').style.display = 'block';
      document.getElementById('adm-sal-monto-wrap').style.display = 'none';
      document.getElementById('btn-adm-registrar-salida').style.display = 'none';
    }
  } catch (e) { console.error(e); }
}

function mostrarAutoEncontradoAdmin(auto) {
  document.getElementById('adm-sal-no-encontrado').style.display = 'none';
  document.getElementById('adm-sal-placa-display').textContent = auto.placa;
  document.getElementById('adm-sal-tipo').textContent = auto.tipo;
  document.getElementById('adm-sal-cliente').textContent = auto.clienteNombre;
  document.getElementById('adm-sal-celular').textContent = auto.clienteCelular || '—';
  document.getElementById('adm-sal-entrada').textContent =
    formatFecha(auto.horaEntrada).toLocaleString('es-PE', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  document.getElementById('adm-sal-tiempo').textContent = calcularTiempo(auto.horaEntrada);
  document.getElementById('adm-sal-cobrado-ingreso').textContent =
    auto.cobradoAlIngreso
      ? `S/ ${(auto.montoIngreso || 0).toFixed(2)} pagado`
      : 'Sin cobro al ingreso';

  const tarifa = auto.tarifaPactada || 0;
  const badge  = document.getElementById('adm-sal-tarifa-badge');
  if (tarifa > 0 && badge) {
    document.getElementById('adm-sal-tarifa-val').textContent = `S/ ${tarifa.toFixed(2)} / día`;
    badge.style.display = 'flex';
  } else if (badge) {
    badge.style.display = 'none';
  }

  document.getElementById('adm-sal-monto-wrap').style.display = tarifa > 0 ? 'none' : 'block';
  document.getElementById('adm-auto-encontrado').classList.add('visible');
  document.getElementById('btn-adm-registrar-salida').style.display = 'block';
}

function iniciarProcesoSalidaAdmin() {
  if (!autoParaSalidaAdmin) {
    mostrarToast('Busca un vehículo primero', 'warning');
    return;
  }
  const tarifa = autoParaSalidaAdmin.tarifaPactada || 0;
  if (tarifa > 0) {
    mostrarModalSalidaAdmin(autoParaSalidaAdmin, tarifa);
  } else {
    const monto = parseFloat(document.getElementById('adm-sal-monto').value) || 0;
    ejecutarRegistroSalidaAdmin(monto, monto, '');
  }
}

function mostrarModalSalidaAdmin(auto, tarifa) {
  const desglose      = calcularCostoEstadia(auto.horaEntrada, tarifa);
  const pagadoIngreso = auto.cobradoAlIngreso ? (auto.montoIngreso || 0) : 0;
  const saldoPendiente = Math.max(0, desglose.costoTotal - pagadoIngreso);

  const filaPenalidad = desglose.horasExtra > 0 ? `
    <div class="salida-fila ${desglose.aplicaPenalidad ? 'salida-fila-penalidad' : 'salida-fila-gracia'}">
      <span>Horas extra (${desglose.horasExtra}h)</span>
      <strong>${desglose.aplicaPenalidad
        ? `⚠️ +S/ ${((desglose.horasExtra * tarifa) / 24).toFixed(2)}`
        : '✓ Período de gracia (sin cargo)'}</strong>
    </div>` : '';

  const filaDescuento = pagadoIngreso > 0 ? `
    <div class="salida-fila salida-fila-descuento">
      <span>Ya pagado al ingreso</span>
      <strong>− S/ ${pagadoIngreso.toFixed(2)}</strong>
    </div>` : '';

  const turnoInfo = turnoActual
    ? `<div style="background:var(--accent-dim);border:1px solid rgba(0,212,170,0.3);
                  border-radius:var(--radius);padding:9px 13px;font-size:0.78rem;
                  color:var(--accent);font-weight:700;margin-bottom:12px">
        ℹ️ Se asignará al turno de <strong>${turnoActual.trabajador}</strong> (${turnoActual.tipo})
       </div>`
    : `<div style="background:var(--yellow-dim);border:1px solid rgba(249,202,36,0.3);
                  border-radius:var(--radius);padding:9px 13px;font-size:0.78rem;
                  color:var(--yellow);font-weight:700;margin-bottom:12px">
        ⚠️ No hay turno activo. No se generará cobro en ningún reporte.
       </div>`;

  const htmlModal = `
    <div class="salida-modal">
      ${turnoInfo}
      <div class="salida-modal-header">
        <span class="salida-modal-placa">${auto.placa}</span>
        <span class="salida-modal-cliente">${auto.clienteNombre}</span>
      </div>
      <div class="salida-desglose">
        <div class="salida-desglose-titulo">📊 Estadía</div>
        <div class="salida-fila">
          <span>Días completos</span>
          <strong>${desglose.dias} día(s)</strong>
        </div>
        ${filaPenalidad}
      </div>
      <div class="salida-finanzas">
        <div class="salida-fila">
          <span>Tarifa pactada</span>
          <strong>S/ ${tarifa.toFixed(2)} / día</strong>
        </div>
        <div class="salida-fila">
          <span>Total sistema</span>
          <strong data-valor="${desglose.costoTotal}">S/ ${desglose.costoTotal.toFixed(2)}</strong>
        </div>
        ${filaDescuento}
        <div class="salida-fila salida-fila-total">
          <span>Saldo pendiente</span>
          <strong>S/ ${saldoPendiente.toFixed(2)}</strong>
        </div>
      </div>
      <div class="salida-input-wrap">
        <label class="form-label">💰 SALDO A COBRAR AHORA (S/)</label>
        <input type="number" id="adm-modal-saldo"
          class="form-input salida-input-monto"
          value="${saldoPendiente.toFixed(2)}" min="0" step="0.50" />
      </div>
      <div id="adm-motivo-auditoria-wrap" style="display:none">
        <label class="form-label salida-auditoria-label">
          ⚠️ Motivo del cambio (Requerido para auditoría)
        </label>
        <textarea id="adm-modal-motivo"
          class="form-input salida-auditoria-textarea" rows="2"
          placeholder="Explica por qué modificaste el monto calculado..."></textarea>
      </div>
    </div>`;

  mostrarModal('🏁 Registrar Salida', htmlModal, [
    {
      texto: '✅ Confirmar y Registrar',
      clase: 'btn-warning',
      accion: () => confirmarSalidaModalAdmin(desglose.costoTotal, pagadoIngreso)
    },
    { texto: 'Cancelar', clase: 'btn-secondary', accion: cerrarModal }
  ]);

  setTimeout(() => {
    const inp = document.getElementById('adm-modal-saldo');
    if (!inp) return;
    inp.addEventListener('input', () => {
      const diff = Math.abs((parseFloat(inp.value) || 0) - saldoPendiente) > 0.01;
      const wrap = document.getElementById('adm-motivo-auditoria-wrap');
      if (wrap) wrap.style.display = diff ? 'block' : 'none';
    });
  }, 50);
}

async function confirmarSalidaModalAdmin(costoSistema, pagadoIngreso) {
  const inp = document.getElementById('adm-modal-saldo');
  const montoReal = parseFloat(inp?.value) || 0;
  const saldoPendiente = Math.max(0, costoSistema - pagadoIngreso);
  const hayDiff = Math.abs(montoReal - saldoPendiente) > 0.01;
  const motivo  = document.getElementById('adm-modal-motivo')?.value?.trim() || '';

  if (hayDiff && !motivo) {
    mostrarToast('Debes ingresar el motivo del cambio de precio', 'warning');
    document.getElementById('adm-modal-motivo')?.focus();
    return;
  }
  cerrarModal();
  await ejecutarRegistroSalidaAdmin(montoReal, costoSistema, motivo, pagadoIngreso);
}

async function ejecutarRegistroSalidaAdmin(montoReal, montoSistema, motivo, pagadoIngreso = 0) {
  const btn = document.getElementById('btn-adm-registrar-salida');
  btn.disabled    = true;
  btn.textContent = 'Registrando...';

  // Refrescar turno antes de registrar
  try { turnoActual = await Turnos.getActivo(); } catch (e) {}

  try {
    const resultado = await Vehiculos.registrarSalida(
      autoParaSalidaAdmin.id,
      montoReal,
      turnoActual,
      sesion,
      { montoCalculadoSistema: montoSistema, motivoModificacion: motivo, pagadoIngreso }
    );
    mostrarToast(`✅ Salida registrada: ${resultado.placa}`, 'success');
    limpiarFormSalidaAdmin();
    await cargarListaRapidaAdmin();
    await cargarDashboard();
  } catch (e) {
    if (e.message === 'ya_salio') {
      mostrarToast('Este vehículo ya registró salida', 'warning');
    } else {
      mostrarToast('Error al registrar salida', 'error');
      console.error(e);
    }
  } finally {
    btn.disabled    = false;
    btn.textContent = '🏁 Registrar Salida';
  }
}

function limpiarFormSalidaAdmin() {
  autoParaSalidaAdmin = null;
  document.getElementById('adm-sal-placa').value = '';
  document.getElementById('adm-sal-monto').value = '';
  document.getElementById('adm-auto-encontrado').classList.remove('visible');
  document.getElementById('adm-sal-no-encontrado').style.display = 'none';
  document.getElementById('adm-sal-monto-wrap').style.display = 'none';
  document.getElementById('btn-adm-registrar-salida').style.display = 'none';
}

// ══ HISTORIAL ══
function cambiarFiltroHist(filtro, btn) {
  histFiltro    = filtro;
  histPagina    = 1;
  histLastDoc   = null;
  histFirstDocs = [null];
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  cargarHistorial();
}

async function cargarHistorial() {
  const tbody = document.getElementById('tabla-historial');
  tbody.innerHTML =
    `<tr><td colspan="8" class="tabla-cargando">⏳ Cargando...</td></tr>`;

  try {
    if (histFiltro === 'todo') {
      // ── Paginación Firestore con cursor ───────────────────────────────────
      const startDoc = histFirstDocs[histPagina - 1]; // null = primera página
      let query = db.collection('autos')
        .where('estado', 'in', ['salido', 'anulado'])
        .limit(HIST_PAGE_SIZE + 1); // +1 para saber si hay siguiente página

      if (startDoc) query = query.startAfter(startDoc);

      const snap = await query.get();
      const docs = snap.docs;
      const hayMas = docs.length > HIST_PAGE_SIZE;

      histDatos = docs
        .slice(0, HIST_PAGE_SIZE)
        .map(d => ({ id: d.id, ...d.data(), _doc: d }));

      // Guardar cursor para página siguiente
      histLastDoc = histDatos.length > 0
        ? histDatos[histDatos.length - 1]._doc
        : null;
      if (hayMas && histFirstDocs.length <= histPagina) {
        histFirstDocs.push(histLastDoc);
      }

      actualizarPaginacion(hayMas);

    } else {
      // ── Carga por rango de fechas (sin cursor, client-side slice) ─────────
      const ahora = new Date();
      const desde = new Date();
      if (histFiltro === 'hoy') {
        desde.setHours(0, 0, 0, 0);
      } else if (histFiltro === 'semana') {
        desde.setDate(ahora.getDate() - 7);
        desde.setHours(0, 0, 0, 0);
      } else if (histFiltro === 'mes') {
        desde.setDate(ahora.getDate() - 30);
        desde.setHours(0, 0, 0, 0);
      }
      const snap = await db.collection('autos')
        .where('fecha', '>=', desde)
        .where('fecha', '<', new Date(ahora.getTime() + 86400000))
        .get();

      const todos = [];
      snap.forEach(d => {
        if (d.data().estado !== 'dentro') {
          todos.push({ id: d.id, ...d.data() });
        }
      });
      todos.sort((a, b) => formatFecha(b.fecha) - formatFecha(a.fecha));

      const inicio = (histPagina - 1) * HIST_PAGE_SIZE;
      histDatos = todos.slice(inicio, inicio + HIST_PAGE_SIZE);
      const hayMas = todos.length > inicio + HIST_PAGE_SIZE;
      actualizarPaginacion(hayMas, todos.length);
    }

    document.getElementById('hist-buscar').value = '';
    filtrarHistorial();

  } catch (e) {
    tbody.innerHTML =
      `<tr><td colspan="8" class="tabla-error">Error al cargar historial</td></tr>`;
    console.error(e);
  }
}

function actualizarPaginacion(hayMas, total) {
  const wrap = document.getElementById('hist-pagination');
  const info = document.getElementById('pag-info');
  const prev = document.getElementById('pag-prev');
  const next = document.getElementById('pag-next');

  wrap.style.display = (histPagina > 1 || hayMas) ? 'flex' : 'none';
  prev.disabled = histPagina <= 1;
  next.disabled = !hayMas;

  if (total !== undefined) {
    const inicio = ((histPagina - 1) * HIST_PAGE_SIZE) + 1;
    const fin    = Math.min(histPagina * HIST_PAGE_SIZE, total);
    info.textContent = `Mostrando ${inicio}–${fin} de ${total}`;
  } else {
    info.textContent = `Página ${histPagina}`;
  }
}

function cambiarPaginaHist(delta) {
  histPagina += delta;
  if (histPagina < 1) histPagina = 1;
  cargarHistorial();
}

function filtrarHistorial() {
  const buscar =
    (document.getElementById('hist-buscar')?.value || '').toUpperCase().trim();
  histDatosFiltrados =
    buscar ? histDatos.filter(a => a.placa?.includes(buscar)) : histDatos;
  renderizarHistorial(histDatosFiltrados);
}

function renderizarHistorial(datos) {
  const tbody = document.getElementById('tabla-historial');
  if (datos.length === 0) {
    tbody.innerHTML =
      `<tr><td colspan="8" class="tabla-vacia">No hay registros</td></tr>`;
    return;
  }
  const fmtOpts = { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' };
  tbody.innerHTML = datos.map(a => {
    const entrada  = formatFecha(a.horaEntrada);
    const salida   = a.horaSalida ? formatFecha(a.horaSalida) : null;
    const entStr   = entrada.toLocaleString('es-PE', fmtOpts);
    const salStr   = salida ? salida.toLocaleString('es-PE', fmtOpts) : '—';
    const monto    = (a.precioTotal || 0).toFixed(2);
    const anulado  = a.estado === 'anulado';
    const rowClass = anulado ? 'hist-row-anulado' : '';

    let btnAccion;
    if (anulado) {
      btnAccion = `<span class="badge-anulado">Anulado</span>`;
    } else if (a.estado === 'dentro') {
      btnAccion = `<span class="hist-trabajador">En cochera</span>`;
    } else {
      btnAccion = `
        <div class="accion-btns">
          <button class="btn btn-danger btn-sm-icon"
            onclick="anularAuto('${a.id}', '${a.placa}')">⛔</button>
          <button class="btn btn-secondary btn-sm-icon"
            onclick="reimprimirTicketHist('${a.id}')"
            title="Reimprimir ticket">🎫</button>
        </div>`;
    }

    return `
      <tr class="${rowClass}">
        <td>
          <span class="placa-badge ${anulado ? 'placa-anulada' : ''}">
            ${a.placa}
          </span>
        </td>
        <td><span class="badge-tipo">${a.tipo}</span></td>
        <td class="hist-cliente">${a.clienteNombre || '—'}</td>
        <td class="hist-mono">${entStr}</td>
        <td class="hist-mono">${salStr}</td>
        <td class="hist-monto">S/ ${monto}</td>
        <td class="hist-trabajador">${a.trabajadorEntrada || '—'}</td>
        <td>${btnAccion}</td>
      </tr>`;
  }).join('');
}

// ── Exportar historial visible como CSV ──────────────────────────────────
function exportarCSV() {
  const datos = histDatosFiltrados.length > 0 ? histDatosFiltrados : histDatos;
  if (datos.length === 0) {
    mostrarToast('No hay datos para exportar', 'warning');
    return;
  }

  const fmtOpts = {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  };
  // Delimitador ";" para compatibilidad con Excel en es-PE (Latinoamérica/España)
  const SEP = ';';
  const encabezado = [
    'Placa', 'Tipo', 'Cliente', 'Celular',
    'Entrada', 'Salida', 'Monto', 'Trabajador', 'Estado'
  ].join(SEP);
  const filas = datos.map(a => {
    const ent = formatFecha(a.horaEntrada).toLocaleString('es-PE', fmtOpts);
    const sal = a.horaSalida
      ? formatFecha(a.horaSalida).toLocaleString('es-PE', fmtOpts)
      : '';
    // Sanear: reemplaza saltos de línea y puntos y coma internos, escapa comillas
    const esc = v => {
      const s = (v || '').toString()
        .replace(/[\r\n]+/g, ' ')
        .replace(/;/g, ',')
        .replace(/"/g, '""');
      return `"${s}"`;
    };
    return [
      esc(a.placa),
      esc(a.tipo),
      esc(a.clienteNombre),
      esc(a.clienteCelular),
      esc(ent),
      esc(sal),
      (a.precioTotal || 0).toFixed(2),
      esc(a.trabajadorEntrada),
      esc(a.estado)
    ].join(SEP);
  });

  const csv = [encabezado, ...filas].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `historial-cochera-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  mostrarToast(`${datos.length} registros exportados`, 'success');
}

// ── Reimprimir ticket desde historial ────────────────────────────────────
async function reimprimirTicketHist(id) {
  const auto = histDatos.find(a => a.id === id) || await Vehiculos.getById(id);
  if (!auto) {
    mostrarToast('No se encontró el registro', 'error');
    return;
  }
  const htmlTicket = Reportes.generarHTMLTicket(auto);
  mostrarModal(`🎫 Ticket N° ${auto.ticketNumero || '—'}`, htmlTicket, [
    {
      texto: '🖨️ Imprimir',
      clase: 'btn-secondary',
      accion: () => imprimirDocumento(htmlTicket)
    },
    { texto: 'Cerrar', clase: 'btn-secondary', accion: cerrarModal }
  ]);
}

// Anular registro — nunca borra; marca estado='anulado' con auditoría completa
async function anularAuto(id, placa) {
  const sesion = Auth.get();
  mostrarModal('Anular Registro', `
    <div class="modal-confirm-center">
      <div class="modal-confirm-icon">⛔</div>
      <p class="modal-confirm-texto">
        ¿Anular el registro de <strong>${placa}</strong>?<br>
        Esta acción no borra el dato; lo marca como anulado
        y queda registrado quién y cuándo lo anuló.
      </p>
    </div>
  `, [
    {
      texto: '⛔ Sí, anular',
      clase: 'btn-danger',
      accion: async () => {
        cerrarModal();
        try {
          await Vehiculos.anularRegistro(id, sesion);
          mostrarToast(`Registro ${placa} anulado`, 'success');
          cargarHistorial();
        } catch (e) {
          mostrarToast('Error al anular el registro', 'error');
          console.error(e);
        }
      }
    },
    { texto: 'Cancelar', clase: 'btn-secondary', accion: cerrarModal }
  ]);
}

// ══ ESTADÍSTICAS ══
async function cargarEstadisticas() {
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    // Cobros hoy
    const cobrosHoySnap = await db.collection('cobros')
      .where('fechaCobro', '>=', hoy)
      .where('fechaCobro', '<', manana)
      .get();
    let totalHoy = 0;
    cobrosHoySnap.forEach(d => { totalHoy += d.data().monto || 0; });

    // Autos atendidos hoy (salidos + dentro)
    const autosHoySnap = await db.collection('autos')
      .where('fecha', '>=', hoy)
      .where('fecha', '<', manana)
      .get();

    let autos = 0, motos = 0, camionetas = 0, otros = 0;
    autosHoySnap.forEach(d => {
      const tipo = d.data().tipo || '';
      if (tipo === 'Auto')       autos++;
      else if (tipo === 'Moto')  motos++;
      else if (tipo === 'Camioneta') camionetas++;
      else otros++;
    });

    const cantHoy = autosHoySnap.size;
    const promedio = cantHoy > 0 ? (totalHoy / cantHoy) : 0;

    document.getElementById('est-total').textContent = `S/ ${totalHoy.toFixed(2)}`;
    document.getElementById('est-cantidad').textContent = cantHoy;
    document.getElementById('est-promedio').textContent = `S/ ${promedio.toFixed(2)}`;
    document.getElementById('est-tipo-auto').textContent = autos;
    document.getElementById('est-tipo-moto').textContent = motos;
    document.getElementById('est-tipo-camioneta').textContent = camionetas;
    document.getElementById('est-tipo-otros').textContent = otros;

    // Esta semana
    const semanaInicio = new Date();
    semanaInicio.setDate(semanaInicio.getDate() - 7);
    semanaInicio.setHours(0, 0, 0, 0);

    const cobrosSemanaSnap = await db.collection('cobros')
      .where('fechaCobro', '>=', semanaInicio)
      .where('fechaCobro', '<', new Date())
      .get();
    let totalSemana = 0;
    cobrosSemanaSnap.forEach(d => { totalSemana += d.data().monto || 0; });

    const autosSemanaSnap = await db.collection('autos')
      .where('fecha', '>=', semanaInicio)
      .where('fecha', '<', new Date())
      .get();

    document.getElementById('est-semana').textContent = `S/ ${totalSemana.toFixed(2)}`;
    document.getElementById('est-cant-semana').textContent = autosSemanaSnap.size;

  } catch (e) {
    console.error('Error cargando estadísticas:', e);
    mostrarToast('Error al cargar estadísticas', 'error');
  }
}

// ══ USUARIOS ══
async function cargarUsuarios() {
  const contenedor = document.getElementById('lista-usuarios');
  contenedor.innerHTML = `<p style="color:var(--text3)">Cargando...</p>`;
  try {
    const snap = await db.collection('usuarios').get();
    const lista = [];
    snap.forEach(d => lista.push({ id: d.id, ...d.data() }));
    // Sort client-side
    lista.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    if (lista.length === 0) {
      contenedor.innerHTML = `<p style="color:var(--text3)">No hay usuarios</p>`;
      return;
    }

    contenedor.innerHTML = `<div class="user-grid">${lista.map(u => `
      <div class="user-card">
        <div class="user-card-header">
          <div class="user-card-avatar">${u.rol === 'admin' ? '👑' : '👤'}</div>
          <div>
            <div class="user-card-name">${u.nombre || u.usuario}</div>
            <div class="user-card-usuario">@${u.usuario}</div>
          </div>
          <div style="margin-left:auto">
            <span style="background:${u.activo ? 'var(--accent-dim)' : 'var(--red-dim)'};
              color:${u.activo ? 'var(--accent)' : 'var(--red)'};
              padding:3px 8px;border-radius:6px;font-size:0.7rem;font-weight:700">
              ${u.activo ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;font-size:0.8rem;
                    color:var(--text3);margin-bottom:12px">
          <span style="background:var(--bg3);padding:3px 8px;border-radius:6px;font-weight:700">
            ${u.rol === 'admin' ? '👑 Admin' : '👷 Trabajador'}
          </span>
        </div>
        <div class="user-card-actions">
          <button class="btn btn-secondary" style="font-size:0.78rem;padding:7px 12px"
            onclick="abrirModalEditarUsuario('${u.id}')">✏️ Editar</button>
          ${u.id !== sesion.id ? `
            <button class="btn btn-danger" style="font-size:0.78rem;padding:7px 12px"
              onclick="eliminarUsuario('${u.id}', '${u.nombre || u.usuario}')">🗑️</button>
          ` : '<span style="font-size:0.72rem;color:var(--text3);padding:7px 4px">(tú)</span>'}
        </div>
      </div>`).join('')}</div>`;

  } catch (e) {
    contenedor.innerHTML = `<p style="color:var(--red)">Error al cargar usuarios</p>`;
    console.error(e);
  }
}

function abrirModalNuevoUsuario() {
  const html = `
    <div class="form-group-mb">
      <label class="form-label">Nombre completo</label>
      <input type="text" id="nu-nombre" class="form-input" placeholder="Nombre" />
    </div>
    <div class="form-group-mb">
      <label class="form-label">Usuario (login)</label>
      <input type="text" id="nu-usuario" class="form-input" placeholder="usuario"
        oninput="this.value=this.value.toLowerCase().replace(/\s/g,'')" />
    </div>
    <div class="form-group-mb">
      <label class="form-label">Contraseña</label>
      <input type="password" id="nu-password" class="form-input" placeholder="Contraseña" />
    </div>
    <div class="form-group-mb">
      <label class="form-label">Rol</label>
      <select id="nu-rol" class="form-input">
        <option value="trabajador">👷 Trabajador</option>
        <option value="admin">👑 Administrador</option>
      </select>
    </div>`;

  mostrarModal('➕ Nuevo Usuario', html, [
    {
      texto: '✅ Crear Usuario',
      clase: 'btn-success',
      accion: crearUsuario
    },
    { texto: 'Cancelar', clase: 'btn-secondary', accion: cerrarModal }
  ]);
}

async function crearUsuario() {
  const nombre   = document.getElementById('nu-nombre').value.trim();
  const usuario  = document.getElementById('nu-usuario').value.trim();
  const password = document.getElementById('nu-password').value;
  const rol      = document.getElementById('nu-rol').value;

  if (!nombre || !usuario || !password) {
    mostrarToast('Completa todos los campos', 'warning');
    return;
  }

  try {
    // Verificar que el usuario no exista
    const existeSnap = await db.collection('usuarios')
      .where('usuario', '==', usuario).limit(1).get();
    if (!existeSnap.empty) {
      mostrarToast('El nombre de usuario ya existe', 'error');
      return;
    }

    await db.collection('usuarios').add({
      nombre, usuario, password, rol,
      activo: true,
      creadoEn: new Date()
    });

    cerrarModal();
    mostrarToast('Usuario creado correctamente', 'success');
    cargarUsuarios();
  } catch (e) {
    mostrarToast('Error al crear usuario', 'error');
    console.error(e);
  }
}

async function abrirModalEditarUsuario(id) {
  const doc = await db.collection('usuarios').doc(id).get();
  if (!doc.exists) return;
  const u = doc.data();

  const html = `
    <div class="form-group-mb">
      <label class="form-label">Nombre completo</label>
      <input type="text" id="eu-nombre" class="form-input" value="${u.nombre || ''}" />
    </div>
    <div class="form-group-mb">
      <label class="form-label">Nueva contraseña (dejar vacío para no cambiar)</label>
      <input type="password" id="eu-password" class="form-input" placeholder="••••••••" />
    </div>
    <div class="form-group-mb">
      <label class="form-label">Rol</label>
      <select id="eu-rol" class="form-input">
        <option value="trabajador" ${u.rol === 'trabajador' ? 'selected' : ''}>
          👷 Trabajador
        </option>
        <option value="admin" ${u.rol === 'admin' ? 'selected' : ''}>
          👑 Administrador
        </option>
      </select>
    </div>
    <div class="form-group-mb">
      <label class="form-label">Estado</label>
      <select id="eu-activo" class="form-input">
        <option value="true" ${u.activo ? 'selected' : ''}>✅ Activo</option>
        <option value="false" ${!u.activo ? 'selected' : ''}>❌ Inactivo</option>
      </select>
    </div>`;

  mostrarModal('✏️ Editar Usuario', html, [
    {
      texto: '💾 Guardar',
      clase: 'btn-success',
      accion: () => guardarEdicionUsuario(id)
    },
    { texto: 'Cancelar', clase: 'btn-secondary', accion: cerrarModal }
  ]);
}

async function guardarEdicionUsuario(id) {
  const nombre   = document.getElementById('eu-nombre').value.trim();
  const password = document.getElementById('eu-password').value;
  const rol      = document.getElementById('eu-rol').value;
  const activo   = document.getElementById('eu-activo').value === 'true';

  if (!nombre) { mostrarToast('El nombre es requerido', 'warning'); return; }

  const data = { nombre, rol, activo };
  if (password) data.password = password;

  try {
    await db.collection('usuarios').doc(id).update(data);
    cerrarModal();
    mostrarToast('Usuario actualizado', 'success');
    cargarUsuarios();
  } catch (e) {
    mostrarToast('Error al actualizar', 'error');
    console.error(e);
  }
}

async function eliminarUsuario(id, nombre) {
  if (!confirm(`¿Eliminar al usuario "${nombre}"?`)) return;
  try {
    await db.collection('usuarios').doc(id).delete();
    mostrarToast('Usuario eliminado', 'success');
    cargarUsuarios();
  } catch (e) {
    mostrarToast('Error al eliminar', 'error');
  }
}

// ══ CONFIGURACIÓN ══
async function cargarConfigEspacios() {
  try {
    const doc = await db.collection('configuracion').doc('general').get();
    if (doc.exists) {
      document.getElementById('config-espacios').value = doc.data().totalEspacios || 30;
    }
  } catch (e) {}
}

async function guardarEspacios() {
  const val = parseInt(document.getElementById('config-espacios').value);
  if (!val || val < 1) { mostrarToast('Número de espacios inválido', 'warning'); return; }
  try {
    await db.collection('configuracion').doc('general')
      .set({ totalEspacios: val }, { merge: true });
    mostrarToast('Configuración guardada', 'success');
  } catch (e) {
    mostrarToast('Error al guardar', 'error');
  }
}

// ══ ALERTAS DE CAJA ══

async function cargarContadorAlertas() {
  try {
    const snap = await db.collection('cobros')
      .where('alertaAuditoria', '==', true).get();
    const count = snap.size;
    const badge = document.getElementById('nav-alertas-count');
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
  } catch (e) {
    console.warn('Error cargando contador alertas:', e);
  }
}

async function cargarAlertas() {
  const tbody = document.getElementById('tabla-alertas');
  if (!tbody) return;
  tbody.innerHTML =
    '<tr><td colspan="7" class="tabla-cargando">Cargando alertas...</td></tr>';

  try {
    const snap = await db.collection('cobros')
      .where('alertaAuditoria', '==', true).get();

    const alertas = [];
    snap.forEach(d => alertas.push({ id: d.id, ...d.data() }));

    // Ordenar por fecha descendente (client-side para evitar índice compuesto)
    alertas.sort((a, b) =>
      formatFecha(b.fechaCobro) - formatFecha(a.fechaCobro)
    );

    if (alertas.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="tabla-vacia">✅ Sin alertas de caja</td></tr>';
      return;
    }

    tbody.innerHTML = alertas.map(a => {
      const montoSistema = a.montoCalculadoSistema ?? 0;
      const montoCobrado = a.monto ?? 0;
      const diff         = montoSistema - montoCobrado;
      const esFaltante   = diff > 0.01;
      const esSobrante   = diff < -0.01;
      const diffCls      = esFaltante ? 'alerta-diff-faltante'
                         : esSobrante ? 'alerta-diff-sobrante'
                         : '';
      const diffLabel    = esFaltante ? `−S/ ${diff.toFixed(2)}`
                         : esSobrante ? `+S/ ${Math.abs(diff).toFixed(2)}`
                         : 'S/ 0.00';
      return `
        <tr>
          <td><span class="mono-placa">${a.placa || '—'}</span></td>
          <td>${a.trabajador || '—'}</td>
          <td>${fechaStr(a.fechaCobro)}</td>
          <td>S/ ${montoSistema.toFixed(2)}</td>
          <td>S/ ${montoCobrado.toFixed(2)}</td>
          <td class="${diffCls} alerta-diff-cel">${diffLabel}</td>
          <td class="alerta-motivo-cel">${a.motivoModificacion || '—'}</td>
        </tr>`;
    }).join('');

    // Actualizar badge con conteo
    const badge = document.getElementById('nav-alertas-count');
    if (badge) {
      badge.textContent = alertas.length;
      badge.style.display = alertas.length > 0 ? 'inline-flex' : 'none';
    }
  } catch (e) {
    tbody.innerHTML =
      '<tr><td colspan="7" style="color:var(--red);text-align:center">' +
      'Error al cargar alertas</td></tr>';
    console.error(e);
  }
}

// ══ HERRAMIENTAS DESARROLLADOR ══

/**
 * Muestra confirmación y limpia autos, turnos y cobros de Firestore.
 * Los usuarios, configuración, clientes y horarios se conservan.
 */
function limpiarBaseDatos() {
  mostrarModal('⚠️ Limpiar Base de Datos Completa', `
    <div class="modal-confirm-center">
      <div class="modal-confirm-icon" style="font-size:2.5rem">⚠️</div>
      <p class="modal-confirm-texto">
        Se eliminarán <strong>TODOS</strong> los datos operativos:<br>
        autos, bloqueos, turnos, cobros, clientes y horarios.<br>
        Solo se conservan los usuarios <strong>admin</strong>
        y <strong>desarrollador</strong>.
      </p>
      <p style="color:var(--red);font-size:0.82rem;font-weight:700;margin-top:10px">
        ⛔ Esta acción NO se puede deshacer.
      </p>
    </div>
  `, [
    {
      texto: '🗑️ Sí, limpiar todo',
      clase: 'btn-danger',
      accion: confirmarLimpiezaDB
    },
    { texto: 'Cancelar', clase: 'btn-secondary', accion: cerrarModal }
  ]);
}

async function confirmarLimpiezaDB() {
  cerrarModal();
  mostrarToast('Limpiando base de datos...', 'info');
  try {
    // Eliminar todas las colecciones operativas (incluyendo lock docs)
    const cols = [
      'autos', 'autos_activos', 'turnos', 'cobros', 'clientes', 'horarios'
    ];
    for (const col of cols) {
      let snap = await db.collection(col).limit(400).get();
      while (!snap.empty) {
        const batch = db.batch();
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        snap = await db.collection(col).limit(400).get();
      }
    }

    // Eliminar usuarios que NO sean admin ni desarrollador
    const usersSnap = await db.collection('usuarios').get();
    const batchUsers = db.batch();
    let hayEliminaciones = false;
    usersSnap.forEach(d => {
      const rol = d.data().rol;
      if (rol !== 'admin' && rol !== 'desarrollador') {
        batchUsers.delete(d.ref);
        hayEliminaciones = true;
      }
    });
    if (hayEliminaciones) await batchUsers.commit();

    // Resetear contador de ocupación
    await db.collection('configuracion').doc('ocupacion').set({ count: 0 });

    mostrarToast('Base de datos limpiada correctamente', 'success');
    await cargarDashboard();
    cargarContadorAlertas();
  } catch (e) {
    mostrarToast('Error al limpiar la base de datos', 'error');
    console.error(e);
  }
}

/**
 * Demo completo para probar TODAS las funcionalidades:
 * - Vehículos "dentro" con tarifaPactada y lock docs (autos_activos)
 * - Vehículos pre-registrados
 * - Historial de salidas (estado='salido')
 * - Cobros con alertaAuditoria: true (para probar panel de alertas)
 * - Turno activo asignado al primer trabajador disponible
 */
async function cargarDemoTurno() {
  mostrarToast('Cargando datos de demo...', 'info');
  try {
    // Crear usuario trabajador de demo si no existe
    const demoSnap = await db.collection('usuarios')
      .where('usuario', '==', 'trabajador1').limit(1).get();
    if (demoSnap.empty) {
      await db.collection('usuarios').add({
        usuario: 'trabajador1',
        nombre: 'Trabajador Demo',
        password: 'demo123',
        rol: 'trabajador',
        activo: true,
        creadoEn: new Date()
      });
    }

    const wSnap = await db.collection('usuarios')
      .where('rol', '==', 'trabajador').limit(1).get();
    const workerId   = wSnap.empty ? 'demo-id' : wSnap.docs[0].id;
    const workerName = wSnap.empty
      ? 'Trabajador Demo'
      : (wSnap.docs[0].data().nombre || wSnap.docs[0].data().usuario);

    const turnoRef = await db.collection('turnos').add({
      trabajadorId: workerId, trabajador: workerName,
      tipo: 'Tarde', estado: 'activo', inicio: new Date()
    });
    const turnoId = turnoRef.id;
    const ahora   = new Date();
    const batch   = db.batch();
    let ticket    = 100;

    // ── Vehículos DENTRO con tarifa (prueban el modal de salida) ──────────────
    // horasAtras: simula diferentes estadías para probar gracia/penalidad
    const DENTRO = [
      // < 24h → 1 día mínimo, gracia (2h extra ≤ 3)
      { placa: 'ABC-001', tipo: 'Auto',      nombre: 'Juan Pérez',
        cobrado: true,  monto: 15, tarifa: 15, horasAtras: 2  },
      // < 24h con penalidad (5h extra > 3)
      { placa: 'DEF-002', tipo: 'Moto',      nombre: 'María García',
        cobrado: true,  monto: 8,  tarifa: 8,  horasAtras: 5  },
      // > 24h sin cobro al ingreso
      { placa: 'GHI-003', tipo: 'Camioneta', nombre: 'Luis Torres',
        cobrado: false, monto: 0,  tarifa: 20, horasAtras: 26 },
      // > 48h (2 días completos)
      { placa: 'JKL-004', tipo: 'Auto',      nombre: 'Ana Ruiz',
        cobrado: false, monto: 0,  tarifa: 15, horasAtras: 49 },
      // < 24h sin cobro, para probar saldo pendiente
      { placa: 'MNO-005', tipo: 'Bus',       nombre: 'Carlos Díaz',
        cobrado: false, monto: 0,  tarifa: 35, horasAtras: 3  },
    ];

    for (const a of DENTRO) {
      const ref       = db.collection('autos').doc();
      const entrada   = new Date(ahora - a.horasAtras * 3600000);
      batch.set(ref, {
        placa: a.placa, tipo: a.tipo, clienteNombre: a.nombre,
        clienteCelular: '', estado: 'dentro',
        horaEntrada: entrada, horaSalida: null,
        cobradoAlIngreso: a.cobrado, montoIngreso: a.monto,
        tarifaPactada: a.tarifa,
        montoSalida: 0, precioTotal: a.monto,
        turnoEntradaId: turnoId, trabajadorEntrada: workerName,
        ticketNumero: ticket++, esPreRegistro: false
      });
      // Lock doc obligatorio para que el sistema reconozca el vehículo
      batch.set(db.collection('autos_activos').doc(a.placa),
        { placa: a.placa, autoId: ref.id, horaEntrada: entrada }
      );
      if (a.cobrado && a.monto > 0) {
        batch.set(db.collection('cobros').doc(), {
          autoId: ref.id, placa: a.placa, clienteNombre: a.nombre,
          tipo: 'ingreso', monto: a.monto,
          montoCalculadoSistema: a.monto, alertaAuditoria: false,
          turnoId, trabajadorId: workerId, trabajador: workerName,
          fechaCobro: entrada
        });
      }
    }

    // ── Pre-registros DENTRO ──────────────────────────────────────────────────
    const PREREG = [
      { placa: 'PRE-001', tipo: 'Auto',      nombre: 'Cliente Fijo A',
        tarifa: 15, horasAtras: 4  },
      { placa: 'PRE-002', tipo: 'Camioneta', nombre: 'Cliente Fijo B',
        tarifa: 20, horasAtras: 2  },
      { placa: 'PRE-003', tipo: 'Moto',      nombre: 'Cliente Fijo C',
        tarifa: 8,  horasAtras: 50 },
    ];

    for (const p of PREREG) {
      const ref     = db.collection('autos').doc();
      const entrada = new Date(ahora - p.horasAtras * 3600000);
      batch.set(ref, {
        placa: p.placa, tipo: p.tipo, clienteNombre: p.nombre,
        clienteCelular: '', estado: 'dentro',
        horaEntrada: entrada, horaSalida: null,
        cobradoAlIngreso: false, montoIngreso: 0,
        tarifaPactada: p.tarifa,
        montoSalida: 0, precioTotal: 0,
        turnoEntradaId: turnoId, trabajadorEntrada: workerName,
        ticketNumero: ticket++, esPreRegistro: true
      });
      batch.set(db.collection('autos_activos').doc(p.placa),
        { placa: p.placa, autoId: ref.id, horaEntrada: entrada }
      );
    }

    // ── Historial SALIDOS (prueban el ticket de reimpresión) ─────────────────
    const SALIDOS = [
      { placa: 'OLD-001', tipo: 'Auto',      nombre: 'Rosa López',
        tarifa: 15, montoSalida: 15, alerta: false, motivo: null  },
      { placa: 'OLD-002', tipo: 'Moto',      nombre: 'Pedro Soto',
        tarifa: 8,  montoSalida: 5,  alerta: true,
        motivo: 'Cliente conocido, se aplicó descuento' },
      { placa: 'OLD-003', tipo: 'Camioneta', nombre: 'Elena Mora',
        tarifa: 20, montoSalida: 20, alerta: false, motivo: null  },
    ];

    for (const s of SALIDOS) {
      const ref     = db.collection('autos').doc();
      const entrada = new Date(ahora - 7 * 3600000);
      const salida  = new Date(ahora - 1800000);
      batch.set(ref, {
        placa: s.placa, tipo: s.tipo, clienteNombre: s.nombre,
        clienteCelular: '', estado: 'salido',
        horaEntrada: entrada, horaSalida: salida,
        cobradoAlIngreso: false, montoIngreso: 0,
        tarifaPactada: s.tarifa,
        montoSalida: s.montoSalida, precioTotal: s.montoSalida,
        turnoEntradaId: turnoId, turnoSalidaId: turnoId,
        trabajadorEntrada: workerName, trabajadorSalida: workerName,
        ticketNumero: ticket++, esPreRegistro: false
      });
      batch.set(db.collection('cobros').doc(), {
        autoId: ref.id, placa: s.placa, clienteNombre: s.nombre,
        tipo: 'salida', monto: s.montoSalida,
        montoCalculadoSistema: s.tarifa,
        alertaAuditoria: s.alerta,
        motivoModificacion: s.motivo,
        turnoId, trabajadorId: workerId, trabajador: workerName,
        fechaCobro: salida
      });
    }

    // Actualizar contador de ocupación
    const totalDentro = DENTRO.length + PREREG.length;
    batch.set(
      db.collection('configuracion').doc('ocupacion'),
      { count: totalDentro }
    );

    await batch.commit();

    const msg = `Demo cargado: ${DENTRO.length} activos + ${PREREG.length} pre-reg ` +
      `+ ${SALIDOS.length} historial (incluye 1 alerta de auditoría)`;
    mostrarToast(msg, 'success');
    await cargarDashboard();
    cargarContadorAlertas();
  } catch (e) {
    mostrarToast('Error al cargar datos demo', 'error');
    console.error(e);
  }
}

// ══ LOGO DE EMPRESA (solo desarrollador) ══

let logoDataUrl = null;

async function cargarLogoActual() {
  try {
    const doc = await db.collection('configuracion').doc('general').get();
    const logoUrl = doc.exists ? doc.data().logoUrl : null;
    const img  = document.getElementById('dev-logo-img');
    const wrap = document.getElementById('dev-logo-preview');
    const btnBorrar = document.getElementById('btn-borrar-logo');
    if (logoUrl && img && wrap) {
      img.src = logoUrl;
      wrap.style.display = 'block';
      if (btnBorrar) btnBorrar.style.display = 'block';
    }
  } catch (e) {}
}

function previsualizarLogo(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    logoDataUrl = e.target.result;
    const img  = document.getElementById('dev-logo-img');
    const wrap = document.getElementById('dev-logo-preview');
    if (img && wrap) { img.src = logoDataUrl; wrap.style.display = 'block'; }
    const btn = document.getElementById('btn-guardar-logo');
    if (btn) btn.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

async function guardarLogo() {
  if (!logoDataUrl) return;
  try {
    await db.collection('configuracion').doc('general')
      .set({ logoUrl: logoDataUrl }, { merge: true });
    mostrarToast('Logo guardado correctamente', 'success');
    logoDataUrl = null;
    const btnG = document.getElementById('btn-guardar-logo');
    const btnB = document.getElementById('btn-borrar-logo');
    if (btnG) btnG.style.display = 'none';
    if (btnB) btnB.style.display = 'block';
  } catch (e) {
    mostrarToast('Error al guardar logo', 'error');
    console.error(e);
  }
}

async function borrarLogo() {
  try {
    await db.collection('configuracion').doc('general')
      .set({ logoUrl: null }, { merge: true });
    const img  = document.getElementById('dev-logo-img');
    const wrap = document.getElementById('dev-logo-preview');
    const btnB = document.getElementById('btn-borrar-logo');
    const inp  = document.getElementById('dev-logo-input');
    if (img)  { img.src = ''; }
    if (wrap) wrap.style.display = 'none';
    if (btnB) btnB.style.display = 'none';
    if (inp)  inp.value = '';
    logoDataUrl = null;
    mostrarToast('Logo eliminado', 'success');
  } catch (e) {
    mostrarToast('Error al eliminar logo', 'error');
    console.error(e);
  }
}

init();

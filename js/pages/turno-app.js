/* ============================================================
   TURNO — Controlador de pantalla de turno del trabajador
   Dependencias: firebase/config.js, auth.js, ui.js,
                 turnos.js, clientes.js, vehiculos.js, reportes.js
   ============================================================ */

// ══ ESTADO GLOBAL ══
let sesion = null;
let turnoActivo = null;
let tipoTurnoSeleccionado = null;
let tipoVehiculoSeleccionado = 'Auto';
let autoParaSalida = null;
let clienteAutocompletado = null;
let listaCocheraData = [];    // cache de vehículos en cochera para lista rápida
let metodoPagoIngreso = 'Efectivo';
let dejoLlave = false;
let metodoPagoSalida = 'Efectivo';

// ══ INIT ══
async function init() {
  sesion = Auth.requireWorker();
  if (!sesion) return;

  // Nombre en topbar
  document.getElementById('topbar-nombre').textContent = sesion.nombre || sesion.usuario;
  document.getElementById('init-nombre-trabajador').textContent =
    `Trabajador: ${sesion.nombre || sesion.usuario}`;

  // Reloj y modo oscuro
  iniciarReloj('reloj-worker');
  iniciarRelojEntrada();
  initModoOscuro('btn-modo-worker');

  // Grid de tipos de vehículo
  renderTipoVehiculoGrid('ent-tipo-grid', 'seleccionarTipoVehiculo');

  // Verificar turno activo
  try {
    turnoActivo = await Turnos.getActivoDelTrabajador(sesion.id);
  } catch (e) {
    console.error('Error cargando turno:', e);
  }

  if (turnoActivo) {
    mostrarPantallaTurno();
  } else {
    mostrarPantallaInit();
    await cargarTurnoAsignado();
  }
  setTimeout(mostrarNovedades, 800);
}

function mostrarPantallaInit() {
  document.getElementById('pantalla-init').style.display = 'flex';
  document.getElementById('pantalla-turno').style.display = 'none';
}

function mostrarPantallaTurno() {
  document.getElementById('pantalla-init').style.display = 'none';
  document.getElementById('pantalla-turno').style.display = 'block';
  actualizarBannerTurno();
  cargarListaRapida();
}

function actualizarBannerTurno() {
  if (!turnoActivo) return;
  const inicio = formatFecha(turnoActivo.inicio);
  const hora = inicio.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('banner-turno-info').textContent =
    `Turno ${turnoActivo.tipo} — Iniciado a las ${hora}`;
}

// ── Reloj de entrada ──
function iniciarRelojEntrada() {
  function tick() {
    const el = document.getElementById('hora-entrada-live');
    if (el) el.textContent = new Date().toLocaleTimeString('es-PE', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
  }
  tick();
  setInterval(tick, 1000);
}

// ══ SIDEBAR ══
function toggleSidebarWorker() {
  document.getElementById('worker-sidebar').classList.toggle('open');
  document.getElementById('worker-overlay').classList.toggle('open');
}
function cerrarSidebarWorker() {
  document.getElementById('worker-sidebar').classList.remove('open');
  document.getElementById('worker-overlay').classList.remove('open');
}

// ══ INICIAR TURNO ══
function seleccionarTipoTurno(tipo) {
  tipoTurnoSeleccionado = tipo;
  document.querySelectorAll('.turno-type-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.tipo === tipo);
  });
}

async function iniciarTurno() {
  if (!tipoTurnoSeleccionado) {
    const errEl = document.getElementById('error-init-turno');
    errEl.textContent = 'Selecciona un tipo de turno primero.';
    errEl.style.display = 'block';
    return;
  }
  const btn = document.getElementById('btn-iniciar-turno');
  btn.disabled = true;
  btn.textContent = 'Iniciando...';
  document.getElementById('error-init-turno').style.display = 'none';

  try {
    turnoActivo = await Turnos.iniciar(tipoTurnoSeleccionado, sesion);
    mostrarPantallaTurno();
    mostrarToast(`Turno ${tipoTurnoSeleccionado} iniciado`, 'success');
  } catch (e) {
    const errEl = document.getElementById('error-init-turno');
    if (e.message === 'ya_hay_turno') {
      errEl.textContent = '⚠️ Ya hay un turno activo de otro trabajador.';
    } else {
      errEl.textContent = 'Error al iniciar turno. Intenta de nuevo.';
    }
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = '✅ Iniciar Turno';
  }
}

// ══ CERRAR TURNO ══
async function confirmarCerrarTurno() {
  if (!turnoActivo) return;
  cerrarSidebarWorker();

  // Cargar cobros para el arqueo
  let cobros = [];
  try { cobros = await Reportes.getByTurno(turnoActivo.id); } catch (e) {}

  const totalIngresos = cobros
    .filter(c => c.tipo === 'ingreso')
    .reduce((s, c) => s + (c.monto || 0), 0);
  const totalSalidas = cobros
    .filter(c => c.tipo === 'salida')
    .reduce((s, c) => s + (c.monto || 0), 0);
  const totalGeneral = totalIngresos + totalSalidas;

  // Desglose por método (cobros sin método se tratan como Efectivo)
  const suma = (metodo) => cobros
    .filter(c => (c.metodoPago || 'Efectivo') === metodo)
    .reduce((s, c) => s + (c.monto || 0), 0);
  const totalEfectivo = suma('Efectivo');
  const totalYape     = suma('Yape');
  const totalVisa     = suma('Visa');

  const htmlArqueo = `
    <div class="modal-confirm-center">
      <div class="modal-confirm-icon">🔴</div>
      <p class="modal-confirm-texto">
        ¿Cerrar el turno <strong>${turnoActivo.tipo}</strong>?
      </p>
    </div>

    <div class="arqueo-box">
      <div class="arqueo-title">📊 Resumen del Turno</div>

      <div class="arqueo-fila">
        <span class="arqueo-fila-lbl">Cobros al ingreso</span>
        <span class="arqueo-fila-val">S/ ${totalIngresos.toFixed(2)}</span>
      </div>
      <div class="arqueo-fila">
        <span class="arqueo-fila-lbl">Cobros a la salida</span>
        <span class="arqueo-fila-val">S/ ${totalSalidas.toFixed(2)}</span>
      </div>
      <div class="arqueo-fila">
        <span class="arqueo-fila-lbl">Total registrado</span>
        <span class="arqueo-fila-val" style="color:var(--accent)">S/ ${totalGeneral.toFixed(2)}</span>
      </div>
      <div class="arqueo-fila">
        <span class="arqueo-fila-lbl">${cobros.length} cobro(s)</span>
        <span></span>
      </div>

      <!-- Desglose por método -->
      <div class="arqueo-seccion-lbl" style="margin-top:12px">Desglose por método</div>
      <div class="arqueo-metodos">
        <div class="arqueo-metodo-card efectivo">
          <span class="arqueo-metodo-icon">💵</span>
          <span class="arqueo-metodo-lbl">Efectivo</span>
          <span class="arqueo-metodo-val">S/ ${totalEfectivo.toFixed(2)}</span>
        </div>
        <div class="arqueo-metodo-card yape">
          <span class="arqueo-metodo-icon">💜</span>
          <span class="arqueo-metodo-lbl">Yape</span>
          <span class="arqueo-metodo-val">S/ ${totalYape.toFixed(2)}</span>
        </div>
        <div class="arqueo-metodo-card visa">
          <span class="arqueo-metodo-icon">💳</span>
          <span class="arqueo-metodo-lbl">Visa</span>
          <span class="arqueo-metodo-val">S/ ${totalVisa.toFixed(2)}</span>
        </div>
      </div>

      <div class="arqueo-efectivo-wrap">
        <label class="form-label">💵 Efectivo a entregar (S/)</label>
        <input type="number" id="arqueo-efectivo"
          class="form-input" placeholder="0.00" min="0" step="0.50"
          oninput="calcularArqueo(${totalEfectivo.toFixed(2)}, ${totalYape.toFixed(2)})" />
        <span class="campo-nota" style="font-size:0.72rem">
          Esperado en caja: S/ ${totalEfectivo.toFixed(2)}
        </span>
      </div>

      <div class="arqueo-diferencia exacto" id="arqueo-diferencia-box">
        <span class="arqueo-diferencia-lbl">Diferencia efectivo</span>
        <span class="arqueo-diferencia-val" id="arqueo-diferencia-val">S/ 0.00</span>
      </div>

      ${totalYape > 0 ? `
      <div class="arqueo-efectivo-wrap" style="margin-top:10px">
        <label class="form-label">💜 Yape recibido (S/)</label>
        <input type="number" id="arqueo-yape"
          class="form-input" placeholder="${totalYape.toFixed(2)}" min="0" step="0.50"
          oninput="calcularArqueo(${totalEfectivo.toFixed(2)}, ${totalYape.toFixed(2)})" />
        <span class="campo-nota" style="font-size:0.72rem">
          Yape registrado en sistema: S/ ${totalYape.toFixed(2)}
        </span>
      </div>
      <div class="arqueo-diferencia exacto" id="arqueo-yape-dif-box">
        <span class="arqueo-diferencia-lbl">Diferencia Yape</span>
        <span class="arqueo-diferencia-val" id="arqueo-yape-dif-val">S/ 0.00</span>
      </div>` : ''}
    </div>`;

  mostrarModal('🔴 Cerrar Turno — Arqueo', htmlArqueo, [
    {
      texto: '🔴 Confirmar cierre',
      clase: 'btn-danger',
      accion: async () => {
        const efectivo = parseFloat(document.getElementById('arqueo-efectivo')?.value) || 0;
        const yapeRecibido = parseFloat(document.getElementById('arqueo-yape')?.value) || 0;
        cerrarModal();
        await cerrarTurno(cobros, efectivo, totalGeneral, yapeRecibido);
      }
    },
    { texto: 'Cancelar', clase: 'btn-secondary', accion: cerrarModal }
  ]);
}

// Recalcula diferencia en tiempo real dentro del modal de arqueo
function calcularArqueo(totalEfEsperado, totalYapeEsperado = 0) {
  // — Efectivo —
  const efectivo = parseFloat(document.getElementById('arqueo-efectivo')?.value) || 0;
  const dEf = efectivo - totalEfEsperado;
  const box = document.getElementById('arqueo-diferencia-box');
  const val = document.getElementById('arqueo-diferencia-val');
  if (box && val) {
    box.className = 'arqueo-diferencia';
    if (dEf > 0.005)       { box.classList.add('sobrante'); val.textContent = `+S/ ${dEf.toFixed(2)} (sobrante)`; }
    else if (dEf < -0.005) { box.classList.add('faltante'); val.textContent = `-S/ ${Math.abs(dEf).toFixed(2)} (faltante)`; }
    else                   { box.classList.add('exacto');   val.textContent = 'S/ 0.00 ✓ Exacto'; }
  }
  // — Yape —
  if (totalYapeEsperado > 0) {
    const yape = parseFloat(document.getElementById('arqueo-yape')?.value) || 0;
    const dY = yape - totalYapeEsperado;
    const boxY = document.getElementById('arqueo-yape-dif-box');
    const valY = document.getElementById('arqueo-yape-dif-val');
    if (boxY && valY) {
      boxY.className = 'arqueo-diferencia';
      if (dY > 0.005)       { boxY.classList.add('sobrante'); valY.textContent = `+S/ ${dY.toFixed(2)} (sobrante)`; }
      else if (dY < -0.005) { boxY.classList.add('faltante'); valY.textContent = `-S/ ${Math.abs(dY).toFixed(2)} (faltante)`; }
      else                  { boxY.classList.add('exacto');   valY.textContent = 'S/ 0.00 ✓ Exacto'; }
    }
  }
}

async function cerrarTurno(cobros, efectivoEntregado, totalEsperado, yapeRecibido = 0) {
  try {
    await Turnos.cerrar(turnoActivo.id, {
      efectivoEntregado,
      yapeRecibido,
      totalEsperado,
      diferencia: efectivoEntregado - totalEsperado
    });

    const turnoData = { ...turnoActivo, fin: new Date() };
    const htmlReporte = Reportes.generarHTMLReporte(cobros, turnoData, {
      efectivoEntregado,
      yapeRecibido,
      totalEsperado,
      diferencia: efectivoEntregado - totalEsperado
    });

    turnoActivo = null; // Limpiar estado en memoria (ya cerrado en Firestore)

    mostrarModal('✅ Turno Cerrado — Reporte Final', htmlReporte, [
      {
        texto: '🖨️ Imprimir',
        clase: 'btn-secondary',
        accion: () => imprimirReporteA4(htmlReporte)
      },
      {
        texto: '📄 PDF',
        clase: 'btn-secondary',
        accion: () => Reportes.descargarPDF(
          turnoData, cobros, { efectivoEntregado, totalEsperado }
        )
      },
      {
        texto: 'Aceptar',
        clase: 'btn-success',
        accion: () => { cerrarModal(); Auth.logout(); }
      }
    ]);

    // Forzar logout también desde la X y el click al overlay
    // El turno YA está cerrado en Firestore, no tiene sentido quedarse
    setTimeout(() => {
      const overlay = document.getElementById('modal-global');
      if (!overlay) return;
      const xBtn = overlay.querySelector('.modal-close');
      if (xBtn) xBtn.onclick = () => { cerrarModal(); Auth.logout(); };
      overlay.addEventListener('click', e => {
        if (e.target === overlay) Auth.logout();
      });
    }, 30);

  } catch (e) {
    console.error('Error al cerrar turno:', e);
    mostrarToast('Error al cerrar turno', 'error');
  }
}

// ══ HORARIO ASIGNADO ══

// Mapeo getDay() (0=domingo) a clave de la colección horarios
const DIAS_JS_KEY = [
  'domingo', 'lunes', 'martes', 'miercoles',
  'jueves', 'viernes', 'sabado'
];
const DIAS_JS_LABEL = [
  'Lunes', 'Martes', 'Miércoles', 'Jueves',
  'Viernes', 'Sábado', 'Domingo'
];
const DIAS_ORDEN = [
  'lunes', 'martes', 'miercoles', 'jueves',
  'viernes', 'sabado', 'domingo'
];

/**
 * Consulta el horario del trabajador; si tiene turno hoy
 * muestra el banner y pre-selecciona el tipo de turno.
 */
async function cargarTurnoAsignado() {
  const diaHoy = DIAS_JS_KEY[new Date().getDay()];
  try {
    const snap = await db.collection('horarios')
      .where('trabajadorId', '==', sesion.id).limit(1).get();
    if (snap.empty) return;

    const semana = snap.docs[0].data().semana || {};
    const turnoHoy = semana[diaHoy] || '';
    if (!turnoHoy) return; // Libre o sin asignar

    const banner = document.getElementById('init-turno-asignado');
    banner.textContent = `📅 Turno asignado hoy: ${turnoHoy} — asignado por el administrador`;
    banner.style.display = 'block';
    seleccionarTipoTurno(turnoHoy);

    // Bloquear los botones que no correspondan al turno asignado
    document.querySelectorAll('.turno-type-btn').forEach(btn => {
      if (btn.dataset.tipo !== turnoHoy) {
        btn.classList.add('turno-bloqueado');
        btn.title = 'Tu turno fue asignado por el administrador';
      }
    });
  } catch (e) {
    console.error('Error cargando turno asignado:', e);
  }
}

/**
 * Muestra un modal con el horario semanal del trabajador.
 */
async function verMiHorario() {
  cerrarSidebarWorker();
  try {
    const snap = await db.collection('horarios')
      .where('trabajadorId', '==', sesion.id).limit(1).get();

    if (snap.empty) {
      mostrarModal('📅 Mi Horario', `
        <p class="horario-modal-vacio">No tienes horario asignado aún.</p>
      `);
      return;
    }

    const semana = snap.docs[0].data().semana || {};
    const filas = DIAS_ORDEN.map((dia, i) => {
      const turno = semana[dia] || 'Libre';
      const cls   = `horario-badge-${turno.replace(' ', '-').toLowerCase()}`;
      return `
        <tr>
          <td class="horario-modal-dia">${DIAS_JS_LABEL[i]}</td>
          <td class="horario-modal-turno">
            <span class="horario-badge ${cls}">${turno || 'Libre'}</span>
          </td>
        </tr>`;
    }).join('');

    mostrarModal('📅 Mi Horario Semanal', `
      <table class="horario-modal-tabla">
        <thead>
          <tr>
            <th>Día</th>
            <th>Turno</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    `, [{ texto: 'Cerrar', clase: 'btn-secondary', accion: cerrarModal }]);

  } catch (e) {
    mostrarToast('Error al cargar horario', 'error');
    console.error(e);
  }
}

// ══ TIPO VEHÍCULO ══
function seleccionarTipoVehiculo(btn) {
  document.querySelectorAll('#ent-tipo-grid .tipo-vehiculo-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  tipoVehiculoSeleccionado = btn.dataset.tipo;
}

// ══ AUTOCOMPLETE CLIENTE ══
let acTimeout = null;
async function autocompletarCliente(placa) {
  clearTimeout(acTimeout);
  if (placa.length < 3) {
    ocultarAutocomplete();
    return;
  }
  acTimeout = setTimeout(async () => {
    try {
      const cliente = await Clientes.buscarPorPlaca(placa);
      if (cliente) {
        clienteAutocompletado = cliente;
        document.getElementById('ac-nombre').textContent = cliente.nombre;
        document.getElementById('ac-celular').textContent = cliente.celular || 'Sin celular';
        document.getElementById('autocomplete-card').classList.add('visible');
      } else {
        ocultarAutocomplete();
      }
    } catch (e) {}
  }, 400);
}

function ocultarAutocomplete() {
  clienteAutocompletado = null;
  document.getElementById('autocomplete-card').classList.remove('visible');
}

function usarClienteAutocompletado() {
  if (!clienteAutocompletado) return;
  document.getElementById('ent-nombre').value = clienteAutocompletado.nombre;
  document.getElementById('ent-celular').value = clienteAutocompletado.celular || '';
  ocultarAutocomplete();
  mostrarToast('Cliente cargado', 'success');
}

// ══ COBRAR AL INGRESO ══
function toggleMontoIngreso(checked) {
  const wrap = document.getElementById('monto-ingreso-wrap');
  wrap.classList.toggle('visible', checked);
  if (checked) {
    const tarifa = parseFloat(document.getElementById('ent-tarifa')?.value) || 0;
    const montoEl = document.getElementById('ent-monto');
    if (tarifa > 0 && !montoEl.value) montoEl.value = tarifa.toFixed(2);
  } else {
    document.getElementById('ent-monto').value = '';
  }
}

// ══ MÉTODO DE PAGO (compartido: entrada y salida) ══
// grupo: 'ent' (entrada) | 'sal' (salida — dentro del modal)
function seleccionarMetodoPago(metodo, btn, grupo) {
  const contenedor = btn.closest('.metodo-pago-pills');
  if (!contenedor) return;
  contenedor.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  if (grupo === 'ent') metodoPagoIngreso = metodo;
  else metodoPagoSalida = metodo;
}

function toggleDejoLlave(btn) {
  dejoLlave = !dejoLlave;
  btn.classList.toggle('active', dejoLlave);
  btn.textContent = dejoLlave ? '🔑 Dejó llave ✓' : '🔑 Dejó llave';
}

// Sincroniza el monto de ingreso con la tarifa si el toggle está activo
function sincronizarTarifaMonto() {
  if (!document.getElementById('ent-cobrar')?.checked) return;
  const tarifa = parseFloat(document.getElementById('ent-tarifa').value) || 0;
  document.getElementById('ent-monto').value = tarifa > 0 ? tarifa.toFixed(2) : '';
}

// ══ REGISTRAR ENTRADA ══
// Regex permisiva: letras, números y guión, mínimo 3 caracteres.
// Bloquea basura (espacios, símbolos) pero acepta todos los formatos de placa.
const REGEX_PLACA = /^[A-Z0-9\-]{3,8}$/;

async function registrarEntrada() {
  const placa = document.getElementById('ent-placa').value.trim();

  if (!placa) {
    mostrarToast('Ingresa la placa del vehículo', 'warning');
    beep('error');
    return;
  }

  if (!REGEX_PLACA.test(placa)) {
    mostrarToast('Placa inválida — solo letras, números y guión (ej: ABC-123)', 'warning');
    beep('error');
    return;
  }

  const tarifa = parseFloat(document.getElementById('ent-tarifa').value) || 0;
  const cobrar = document.getElementById('ent-cobrar').checked;
  const monto  = parseFloat(document.getElementById('ent-monto').value) || 0;

  if (tarifa <= 0) {
    mostrarToast('Ingresa la tarifa pactada por día', 'warning');
    beep('error');
    document.getElementById('ent-tarifa').focus();
    return;
  }

  if (cobrar && monto <= 0) {
    mostrarToast('Ingresa el monto a cobrar al ingreso', 'warning');
    beep('error');
    return;
  }

  const btn = document.getElementById('btn-registrar-entrada');
  btn.disabled  = true;
  btn.textContent = 'Registrando...';

  try {
    const datos = {
      placa,
      tipo:             tipoVehiculoSeleccionado,
      clienteNombre:    document.getElementById('ent-nombre').value.trim() || 'Sin nombre',
      clienteCelular:   document.getElementById('ent-celular').value.trim(),
      cobradoAlIngreso: cobrar,
      montoIngreso:     monto,
      tarifaPactada:    tarifa,
      metodoPago:       cobrar ? metodoPagoIngreso : null,
      dejoLlave:        dejoLlave,
      esPreRegistro:    false
    };

    const resultado = await Vehiculos.registrarEntrada(datos, turnoActivo, sesion);

    beep('success');
    mostrarToast(`✅ Entrada registrada: ${placa}`, 'success');
    limpiarFormEntrada();
    await cargarListaRapida();
    document.getElementById('ent-placa').focus();

  } catch (e) {
    beep('error');
    if (e.message === 'duplicado') {
      mostrarToast(`⚠️ El vehículo ${placa} ya está en cochera`, 'warning');
    } else if (e.message === 'sin_espacio') {
      mostrarToast('❌ No hay espacios disponibles', 'error');
    } else {
      mostrarToast('Error al registrar entrada', 'error');
      console.error(e);
    }
  } finally {
    btn.disabled    = false;
    btn.textContent = '🚗 Registrar Entrada';
  }
}

function limpiarFormEntrada() {
  document.getElementById('ent-placa').value = '';
  document.getElementById('ent-nombre').value = '';
  document.getElementById('ent-celular').value = '';
  document.getElementById('ent-tarifa').value = '';
  document.getElementById('ent-cobrar').checked = false;
  document.getElementById('ent-monto').value = '';
  document.getElementById('monto-ingreso-wrap').classList.remove('visible');
  ocultarAutocomplete();
  // Resetear tipo a Auto
  document.querySelectorAll('#ent-tipo-grid .tipo-vehiculo-btn').forEach(b => b.classList.remove('selected'));
  document.querySelector('#ent-tipo-grid [data-tipo="Auto"]').classList.add('selected');
  tipoVehiculoSeleccionado = 'Auto';
  // Resetear método de pago y llave
  metodoPagoIngreso = 'Efectivo';
  dejoLlave = false;
  const pills = document.querySelectorAll('#metodo-ingreso-wrap .pill-btn');
  pills.forEach(b => b.classList.toggle('selected', b.dataset.metodo === 'Efectivo'));
  const btnLlave = document.getElementById('btn-dejo-llave');
  if (btnLlave) { btnLlave.classList.remove('active'); btnLlave.textContent = '🔑 Dejó llave'; }
}

// ══ LISTA RÁPIDA DE SALIDA ══

// Carga todos los vehículos en cochera en memoria y renderiza la lista
async function cargarListaRapida() {
  try {
    listaCocheraData = await Vehiculos.getEnCochera();
    filtrarListaRapida(document.getElementById('sal-placa')?.value || '');
  } catch (e) {
    console.error('Error cargando lista rápida:', e);
  }
}

// Filtra la lista visualmente según el texto del input de placa
function filtrarListaRapida(query) {
  const contenedor = document.getElementById('lista-rapida');
  if (!contenedor) return;

  const texto = query.toUpperCase().trim();
  const lista  = texto
    ? listaCocheraData.filter(a => a.placa.includes(texto))
    : listaCocheraData;

  if (lista.length === 0) {
    const msg = texto ? 'Sin coincidencias' : 'Cochera vacía';
    contenedor.innerHTML = `<p class="lista-rapida-vacia">${msg}</p>`;
    return;
  }

  contenedor.innerHTML = lista.map(a => `
    <div class="lista-rapida-item" data-id="${a.id}"
      onclick="cargarAutoParaSalida('${a.id}')">
      <span class="lista-rapida-placa">${a.placa}</span>
      <span class="lista-rapida-tipo">${a.tipo}</span>
      <span class="lista-rapida-tiempo">${calcularTiempo(a.horaEntrada)}</span>
    </div>
  `).join('');
}

// Carga un vehículo de la lista en el formulario de salida (sin Firestore)
function cargarAutoParaSalida(autoId) {
  const auto = listaCocheraData.find(a => a.id === autoId);
  if (!auto) return;

  autoParaSalida = auto;
  document.getElementById('sal-placa').value = auto.placa;
  mostrarAutoEncontrado(auto);

  document.querySelectorAll('.lista-rapida-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === autoId);
  });
}

// Selecciona el primer ítem visible al presionar Enter en el buscador
function seleccionarPrimerResultado() {
  const primer = document.querySelector('.lista-rapida-item');
  if (primer) {
    primer.click();
  } else {
    buscarAutoSalida();
  }
}

// ══ BUSCAR AUTO PARA SALIDA (Firestore — fallback para botón 🔍) ══
async function buscarAutoSalida() {
  const placa = document.getElementById('sal-placa').value.trim();
  if (placa.length < 3) return;

  try {
    const snap = await db.collection('autos').where('placa', '==', placa).get();
    let auto = null;
    snap.forEach(d => {
      if (d.data().estado === 'dentro') {
        auto = { id: d.id, ...d.data() };
      }
    });

    if (auto) {
      autoParaSalida = auto;
      mostrarAutoEncontrado(auto);
    } else {
      autoParaSalida = null;
      document.getElementById('auto-encontrado').classList.remove('visible');
      document.getElementById('sal-no-encontrado').style.display = 'block';
      document.getElementById('sal-monto-wrap').style.display = 'none';
      document.getElementById('btn-registrar-salida').style.display = 'none';
    }
  } catch (e) {
    console.error('Error buscando auto:', e);
  }
}

function mostrarAutoEncontrado(auto) {
  document.getElementById('sal-no-encontrado').style.display = 'none';
  document.getElementById('sal-placa-display').textContent = auto.placa;
  document.getElementById('sal-tipo').textContent = auto.tipo;
  document.getElementById('sal-cliente').textContent = auto.clienteNombre;
  document.getElementById('sal-celular').textContent = auto.clienteCelular || '-';
  document.getElementById('sal-entrada').textContent =
    formatFecha(auto.horaEntrada).toLocaleString('es-PE', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  document.getElementById('sal-tiempo').textContent = calcularTiempo(auto.horaEntrada);
  document.getElementById('sal-cobrado-ingreso').textContent =
    auto.cobradoAlIngreso
      ? `S/ ${(auto.montoIngreso || 0).toFixed(2)} pagado`
      : 'Sin cobro al ingreso';

  // Mostrar tarifa pactada si existe
  const tarifa = auto.tarifaPactada || 0;
  const tarifaBadge = document.getElementById('sal-tarifa-badge');
  if (tarifa > 0 && tarifaBadge) {
    document.getElementById('sal-tarifa-val').textContent =
      `S/ ${tarifa.toFixed(2)} / día`;
    tarifaBadge.style.display = 'flex';
  } else if (tarifaBadge) {
    tarifaBadge.style.display = 'none';
  }

  // Mostrar monto manual solo si no hay tarifa pactada (compatibilidad)
  document.getElementById('sal-monto-wrap').style.display =
    tarifa > 0 ? 'none' : 'block';

  document.getElementById('auto-encontrado').classList.add('visible');
  document.getElementById('btn-registrar-salida').style.display = 'block';
}

// ══ INICIAR PROCESO DE SALIDA (decide entre modal o flujo directo) ══
function iniciarProcesoSalida() {
  if (!autoParaSalida) {
    mostrarToast('Busca un vehículo primero', 'warning');
    beep('error');
    return;
  }

  const tarifa = autoParaSalida.tarifaPactada || 0;

  if (tarifa > 0) {
    mostrarModalSalida(autoParaSalida, tarifa);
  } else {
    // Compatibilidad: flujo manual sin tarifa pactada
    const monto = parseFloat(document.getElementById('sal-monto').value) || 0;
    ejecutarRegistroSalida(monto, monto, '');
  }
}

// ══ MODAL DE SALIDA CON CÁLCULO AUTOMÁTICO ══
function mostrarModalSalida(auto, tarifa) {
  const desglose     = calcularCostoEstadia(auto.horaEntrada, tarifa);
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

  const htmlModal = `
    <div class="salida-modal">
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
          <strong id="modal-total-sistema"
            data-valor="${desglose.costoTotal}">
            S/ ${desglose.costoTotal.toFixed(2)}
          </strong>
        </div>
        ${filaDescuento}
        <div class="salida-fila salida-fila-total">
          <span>Saldo pendiente</span>
          <strong>S/ ${saldoPendiente.toFixed(2)}</strong>
        </div>
      </div>

      ${auto.cobradoAlIngreso && auto.metodoPagoIngreso ? `
      <div style="margin-top:4px">
        <span class="metodo-badge-ing">
          ${auto.metodoPagoIngreso === 'Yape' ? '💜' : auto.metodoPagoIngreso === 'Visa' ? '💳' : '💵'}
          Ingreso pagado con ${auto.metodoPagoIngreso}
        </span>
      </div>` : ''}

      ${auto.dejoLlave ? `
      <div style="margin-top:4px">
        <span class="metodo-badge-ing">🔑 Dejó llave</span>
      </div>` : ''}

      <div class="salida-input-wrap">
        <label class="form-label">💰 SALDO A COBRAR AHORA (S/)</label>
        <input type="number" id="modal-saldo-cobrar"
          class="form-input salida-input-monto"
          value="${saldoPendiente.toFixed(2)}"
          min="0" step="0.50" />
      </div>

      ${saldoPendiente > 0 ? `
      <div class="metodo-pago-wrap" style="margin-top:6px">
        <div class="arqueo-seccion-lbl">Método de pago salida</div>
        <div class="metodo-pago-pills" id="sal-metodo-pills">
          <button class="pill-btn selected" data-metodo="Efectivo"
            onclick="seleccionarMetodoPago('Efectivo', this, 'sal')">💵 Efectivo</button>
          <button class="pill-btn pill-yape" data-metodo="Yape"
            onclick="seleccionarMetodoPago('Yape', this, 'sal')">💜 Yape</button>
          <button class="pill-btn pill-visa" data-metodo="Visa"
            onclick="seleccionarMetodoPago('Visa', this, 'sal')">💳 Visa</button>
        </div>
      </div>` : ''}

      <div id="motivo-auditoria-wrap" style="display:none">
        <label class="form-label salida-auditoria-label">
          ⚠️ Motivo del cambio (Requerido para auditoría)
        </label>
        <textarea id="modal-motivo-auditoria"
          class="form-input salida-auditoria-textarea"
          rows="2"
          placeholder="Explica por qué modificaste el monto calculado..."></textarea>
      </div>
    </div>`;

  mostrarModal('🏁 Registrar Salida', htmlModal, [
    {
      texto: '✅ Confirmar y Registrar',
      clase: 'btn-warning',
      accion: () => confirmarSalidaModal(desglose.costoTotal, pagadoIngreso)
    },
    { texto: 'Cancelar', clase: 'btn-secondary', accion: cerrarModal }
  ]);

  // Event listener de auditoría: aparece si se modifica el saldo calculado
  setTimeout(() => {
    const inputSaldo = document.getElementById('modal-saldo-cobrar');
    if (!inputSaldo) return;
    inputSaldo.addEventListener('input', () => {
      const ingresado = parseFloat(inputSaldo.value) || 0;
      const motivoWrap = document.getElementById('motivo-auditoria-wrap');
      if (!motivoWrap) return;
      const hayDiferencia = Math.abs(ingresado - saldoPendiente) > 0.01;
      motivoWrap.style.display = hayDiferencia ? 'block' : 'none';
    });
  }, 50);
}

// ══ CONFIRMAR SALIDA DESDE MODAL ══
async function confirmarSalidaModal(costoSistema, pagadoIngreso) {
  const inputSaldo = document.getElementById('modal-saldo-cobrar');
  const montoReal  = parseFloat(inputSaldo?.value) || 0;

  // saldoPendiente recalculado = costoSistema - pagadoIngreso
  const saldoPendiente = Math.max(0, costoSistema - pagadoIngreso);
  const hayDiferencia  = Math.abs(montoReal - saldoPendiente) > 0.01;

  const motivo = document.getElementById('modal-motivo-auditoria')?.value?.trim() || '';

  if (hayDiferencia && !motivo) {
    mostrarToast('Debes ingresar el motivo del cambio de precio', 'warning');
    document.getElementById('modal-motivo-auditoria')?.focus();
    return;
  }

  // Método de pago: si no hay saldo pendiente, no aplica método
  const metodo = saldoPendiente > 0 ? metodoPagoSalida : null;

  cerrarModal();
  // montoCalculadoSistema = costoSistema completo (ingreso + saldo)
  await ejecutarRegistroSalida(montoReal, costoSistema, motivo, pagadoIngreso, metodo);
}

// ══ EJECUTAR REGISTRO DE SALIDA (punto único de escritura a Firestore) ══
async function ejecutarRegistroSalida(
  montoRealCobrado, montoCalculadoSistema, motivoModificacion, pagadoIngreso = 0, metodoPago = null
) {
  const btn = document.getElementById('btn-registrar-salida');
  btn.disabled    = true;
  btn.textContent = 'Registrando...';

  try {
    const resultado = await Vehiculos.registrarSalida(
      autoParaSalida.id,
      montoRealCobrado,
      turnoActivo,
      sesion,
      { montoCalculadoSistema, motivoModificacion, pagadoIngreso, metodoPago }
    );
    beep('success');
    mostrarToast(`✅ Salida registrada: ${resultado.placa}`, 'success');
    limpiarFormSalida();
    await cargarListaRapida();
    document.getElementById('ent-placa').focus();

  } catch (e) {
    beep('error');
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

function limpiarFormSalida() {
  autoParaSalida = null;
  metodoPagoSalida = 'Efectivo';
  document.getElementById('sal-placa').value = '';
  document.getElementById('sal-monto').value = '';
  document.getElementById('auto-encontrado').classList.remove('visible');
  document.getElementById('sal-no-encontrado').style.display = 'none';
  document.getElementById('sal-monto-wrap').style.display = 'none';
  document.getElementById('btn-registrar-salida').style.display = 'none';
}

init();

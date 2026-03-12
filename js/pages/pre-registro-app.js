/* ============================================================
   PRE-REGISTRO — Controlador de pre-registro de vehículos
   Dependencias: firebase/config.js, auth.js, ui.js,
                 turnos.js, clientes.js, vehiculos.js
   ============================================================ */

let sesion = null;
let turnoActivo = null;
let tipoPR = 'Auto';
let clientePRAC = null;

async function init() {
  sesion = Auth.requireAdmin();
  if (!sesion) return;

  document.getElementById('sidebar-nombre').textContent = sesion.nombre || sesion.usuario;
  iniciarReloj('reloj');
  initModoOscuro('btn-modo');

  // Grid de tipos de vehículo
  renderTipoVehiculoGrid('pr-tipo-grid', 'seleccionarTipoPR');

  // Pre-llenar fecha con la hora actual
  inicializarFecha();

  // Buscar turno activo para asociarlo
  try { turnoActivo = await Turnos.getActivo(); } catch (e) {}

  await cargarPreRegistros();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}
function cerrarSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

function seleccionarTipoPR(btn) {
  document.querySelectorAll('#pr-tipo-grid .tipo-vehiculo-btn')
    .forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  tipoPR = btn.dataset.tipo;
}

let acPRTimeout = null;
async function autocompletarPR(placa) {
  clearTimeout(acPRTimeout);
  if (placa.length < 3) {
    document.getElementById('ac-pr-card').classList.remove('visible');
    clientePRAC = null;
    return;
  }
  acPRTimeout = setTimeout(async () => {
    try {
      const c = await Clientes.buscarPorPlaca(placa);
      if (c) {
        clientePRAC = c;
        document.getElementById('ac-pr-nombre').textContent = c.nombre;
        document.getElementById('ac-pr-celular').textContent = c.celular || 'Sin celular';
        document.getElementById('ac-pr-card').classList.add('visible');
      } else {
        clientePRAC = null;
        document.getElementById('ac-pr-card').classList.remove('visible');
      }
    } catch (e) {}
  }, 400);
}

function usarClientePR() {
  if (!clientePRAC) return;
  document.getElementById('pr-nombre').value = clientePRAC.nombre;
  document.getElementById('pr-celular').value = clientePRAC.celular || '';
  document.getElementById('ac-pr-card').classList.remove('visible');
  clientePRAC = null;
  mostrarToast('Cliente cargado', 'success');
}

// Pre-llena el campo de fecha con la hora actual al cargar la página
function inicializarFecha() {
  const inp = document.getElementById('pr-fecha');
  if (!inp) return;
  const now = new Date();
  // Ajustar a hora local en formato datetime-local (YYYY-MM-DDTHH:MM)
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  inp.value = now.toISOString().slice(0, 16);
}

async function preRegistrar() {
  const placa = document.getElementById('pr-placa').value.trim();
  if (!placa) { mostrarToast('Ingresa la placa del vehículo', 'warning'); return; }

  const fechaVal = document.getElementById('pr-fecha').value;
  if (!fechaVal) {
    mostrarToast('Ingresa la fecha y hora de ingreso', 'warning');
    document.getElementById('pr-fecha').focus();
    return;
  }
  const fechaIngreso = new Date(fechaVal);
  if (isNaN(fechaIngreso.getTime()) || fechaIngreso > new Date()) {
    mostrarToast('La fecha de ingreso no puede ser futura', 'warning');
    document.getElementById('pr-fecha').focus();
    return;
  }

  const tarifa = parseFloat(document.getElementById('pr-tarifa').value) || 0;
  if (tarifa <= 0) {
    mostrarToast('Ingresa la tarifa pactada por día', 'warning');
    document.getElementById('pr-tarifa').focus();
    return;
  }

  const btn = document.getElementById('btn-pre-registrar');
  btn.disabled = true;
  btn.textContent = 'Registrando...';

  try {
    const datos = {
      placa,
      tipo: tipoPR,
      clienteNombre: document.getElementById('pr-nombre').value.trim() || 'Sin nombre',
      clienteCelular: document.getElementById('pr-celular').value.trim(),
      cobradoAlIngreso: false,
      montoIngreso: 0,
      tarifaPactada: tarifa,
      horaEntrada: fechaIngreso,
      esPreRegistro: true
    };

    await Vehiculos.registrarEntrada(datos, turnoActivo, sesion);
    mostrarToast(`✅ Pre-registro exitoso: ${placa}`, 'success');

    // Limpiar form (mantener fecha y tarifa para agilizar múltiples registros)
    document.getElementById('pr-placa').value = '';
    document.getElementById('pr-nombre').value = '';
    document.getElementById('pr-celular').value = '';
    document.getElementById('ac-pr-card').classList.remove('visible');
    document.querySelectorAll('#pr-tipo-grid .tipo-vehiculo-btn')
      .forEach(b => b.classList.remove('selected'));
    document.querySelector('#pr-tipo-grid [data-tipo="Auto"]').classList.add('selected');
    tipoPR = 'Auto';

    await cargarPreRegistros();

  } catch (e) {
    if (e.message === 'duplicado') {
      mostrarToast('⚠️ El vehículo ya está registrado en cochera', 'warning');
    } else if (e.message === 'sin_espacio') {
      mostrarToast('❌ Sin espacios disponibles', 'error');
    } else {
      mostrarToast('Error al registrar', 'error');
      console.error(e);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '📦 Pre-registrar Vehículo';
  }
}

async function cargarPreRegistros() {
  const contenedor = document.getElementById('lista-pre-registros');
  contenedor.innerHTML =
    `<p style="color:var(--text3);font-size:0.85rem">Cargando...</p>`;

  try {
    // Obtener autos pre-registrados que están dentro
    const snap = await db.collection('autos').where('esPreRegistro', '==', true).get();
    const preRegs = [];
    snap.forEach(d => {
      if (d.data().estado === 'dentro') preRegs.push({ id: d.id, ...d.data() });
    });
    preRegs.sort((a, b) => formatFecha(a.horaEntrada) - formatFecha(b.horaEntrada));

    if (preRegs.length === 0) {
      contenedor.innerHTML = `
        <div style="text-align:center;padding:32px;color:var(--text3)">
          <div style="font-size:2rem;margin-bottom:8px">📦</div>
          <p style="font-size:0.85rem">No hay vehículos pre-registrados actualmente.</p>
        </div>`;
      return;
    }

    contenedor.innerHTML = preRegs.map(a => {
      const entrada = formatFecha(a.horaEntrada);
      const entStr = entrada.toLocaleString('es-PE', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });
      return `
        <div style="background:var(--surface);border:1px solid var(--border);
                    border-radius:var(--radius);padding:14px;margin-bottom:10px;
                    border-left:3px solid var(--yellow)">
          <div style="display:flex;align-items:center;justify-content:space-between;
                      margin-bottom:8px">
            <span style="font-family:var(--font-mono);font-size:1rem;
                         font-weight:700;letter-spacing:2px">${a.placa}</span>
            <span style="background:var(--yellow-dim);color:var(--yellow);
                         padding:3px 8px;border-radius:6px;font-size:0.7rem;
                         font-weight:700">PRE-REG</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;
                      font-size:0.78rem;color:var(--text2)">
            <span>🚗 ${a.tipo}</span>
            <span>👤 ${a.clienteNombre}</span>
            <span>⏰ ${entStr}</span>
            <span style="color:var(--yellow);font-weight:700">
              ⏱ ${calcularTiempo(a.horaEntrada)}
            </span>
            ${a.tarifaPactada > 0
              ? `<span style="color:var(--accent);font-weight:700">
                   💰 S/ ${a.tarifaPactada.toFixed(2)}/día
                 </span>`
              : '<span style="color:var(--red);font-size:0.7rem">Sin tarifa</span>'
            }
          </div>
        </div>`;
    }).join('');

  } catch (e) {
    contenedor.innerHTML =
      `<p style="color:var(--red);font-size:0.85rem">Error al cargar pre-registros</p>`;
    console.error(e);
  }
}

init();

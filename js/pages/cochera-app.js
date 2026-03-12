/* ============================================================
   COCHERA — Controlador de vista de vehículos en cochera
   Dependencias: firebase/config.js, auth.js, ui.js,
                 turnos.js, vehiculos.js, reportes.js
   ============================================================ */

let sesion = null;
let turnoActivo = null;
let autosData = [];
let totalEspacios = 30;

async function init() {
  sesion = Auth.requireAuth();
  if (!sesion) return;

  document.getElementById('topbar-nombre').textContent = sesion.nombre || sesion.usuario;
  iniciarReloj('reloj-cochera');
  initModoOscuro('btn-modo-cochera');

  // Link de regreso según rol
  const backWrap = document.getElementById('back-link-wrap');
  if (sesion.rol === 'admin') {
    backWrap.innerHTML = `<a class="back-link" href="dashboard.html">← Dashboard</a>`;
  } else {
    backWrap.innerHTML = `<a class="back-link" href="turno.html">← Volver al turno</a>`;
    // Trabajador necesita turno para procesar salidas
    try {
      turnoActivo = await Turnos.getActivoDelTrabajador(sesion.id);
    } catch (e) {}
  }

  // Para admin, buscar turno activo global para asignar cobros
  if (sesion.rol === 'admin') {
    try {
      turnoActivo = await Turnos.getActivo();
    } catch (e) {}
  }

  // Total espacios
  try {
    totalEspacios = await Vehiculos.getTotalEspacios();
  } catch (e) {}

  await cargarAutos();
}

async function cargarAutos() {
  const tbody = document.getElementById('tabla-cochera');
  tbody.innerHTML = `
    <tr><td colspan="8" class="tabla-cargando">⏳ Cargando...</td></tr>
  `;

  try {
    autosData = await Vehiculos.getEnCochera();
    const libres = totalEspacios - autosData.length;
    document.getElementById('stat-dentro').textContent = autosData.length;
    document.getElementById('stat-libres').textContent = Math.max(0, libres);
    document.getElementById('ultima-actualizacion').textContent =
      'Actualizado: ' + new Date().toLocaleTimeString('es-PE', {
        hour: '2-digit', minute: '2-digit'
      });
    renderizarTabla(autosData);
  } catch (e) {
    tbody.innerHTML = `
      <tr><td colspan="8" class="tabla-error">Error al cargar datos</td></tr>
    `;
    console.error(e);
  }
}

function renderizarTabla(autos) {
  const tbody = document.getElementById('tabla-cochera');
  if (autos.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="8">
        <div class="empty-state">
          <span class="es-icon">🅿️</span>
          <p>No hay vehículos en cochera en este momento.</p>
        </div>
      </td></tr>`;
    return;
  }

  tbody.innerHTML = autos.map(a => {
    const entrada    = formatFecha(a.horaEntrada);
    const entradaStr = entrada.toLocaleString('es-PE', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
    const tiempo    = calcularTiempo(a.horaEntrada);
    const preReg    = a.esPreRegistro
      ? `<span class="pre-reg-badge">PRE</span>`
      : '';
    const trabajador = a.trabajadorEntrada || '—';
    return `
      <tr>
        <td><span class="placa-badge">${a.placa}</span>${preReg}</td>
        <td><span class="tipo-badge">${a.tipo}</span></td>
        <td>${a.clienteNombre || '—'}</td>
        <td class="hist-mono">${a.clienteCelular || '—'}</td>
        <td class="hist-mono">${entradaStr}</td>
        <td><span class="tiempo-badge">${tiempo}</span></td>
        <td class="hist-trabajador">${trabajador}</td>
        <td>
          <button class="btn btn-secondary btn-sm-icon"
            onclick="reimprimirTicket('${a.id}')"
            title="Reimprimir ticket">
            🎫 Ticket
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function filtrarTabla() {
  const query = document.getElementById('inp-buscar-placa').value.toUpperCase().trim();
  if (!query) {
    renderizarTabla(autosData);
    return;
  }
  const filtrados = autosData.filter(a => a.placa.includes(query));
  renderizarTabla(filtrados);
}

async function abrirModalSalida(autoId) {
  const auto = autosData.find(a => a.id === autoId);
  if (!auto) return;

  const entrada = formatFecha(auto.horaEntrada);
  const entradaStr = entrada.toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  });
  const tiempo = calcularTiempo(auto.horaEntrada);
  const cobradoIngreso = auto.cobradoAlIngreso
    ? `S/ ${(auto.montoIngreso || 0).toFixed(2)}`
    : 'Sin cobro';

  const htmlModal = `
    <div style="margin-bottom:16px">
      <div style="font-family:var(--font-mono);font-size:1.5rem;font-weight:700;
                  letter-spacing:3px;color:var(--text);margin-bottom:10px">
        ${auto.placa}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;
                  font-size:0.82rem;margin-bottom:16px">
        <div>
          <span style="color:var(--text3);font-size:0.7rem;font-weight:800;
                       letter-spacing:1px;text-transform:uppercase">Tipo</span>
          <div style="font-weight:700;margin-top:2px">${auto.tipo}</div>
        </div>
        <div>
          <span style="color:var(--text3);font-size:0.7rem;font-weight:800;
                       letter-spacing:1px;text-transform:uppercase">Cliente</span>
          <div style="font-weight:700;margin-top:2px">${auto.clienteNombre}</div>
        </div>
        <div>
          <span style="color:var(--text3);font-size:0.7rem;font-weight:800;
                       letter-spacing:1px;text-transform:uppercase">Entrada</span>
          <div style="font-weight:700;margin-top:2px;font-family:var(--font-mono);
                      font-size:0.78rem">${entradaStr}</div>
        </div>
        <div>
          <span style="color:var(--text3);font-size:0.7rem;font-weight:800;
                       letter-spacing:1px;text-transform:uppercase">Tiempo</span>
          <div style="font-weight:700;margin-top:2px;color:var(--yellow)">${tiempo}</div>
        </div>
        <div>
          <span style="color:var(--text3);font-size:0.7rem;font-weight:800;
                       letter-spacing:1px;text-transform:uppercase">Cobrado ingreso</span>
          <div style="font-weight:700;margin-top:2px;color:var(--accent)">${cobradoIngreso}</div>
        </div>
        <div>
          <span style="color:var(--text3);font-size:0.7rem;font-weight:800;
                       letter-spacing:1px;text-transform:uppercase">Celular</span>
          <div style="font-weight:700;margin-top:2px">${auto.clienteCelular || '—'}</div>
        </div>
      </div>
      <div>
        <label style="display:block;font-size:0.72rem;font-weight:800;letter-spacing:1px;
                      text-transform:uppercase;color:var(--text3);margin-bottom:6px">
          Monto de salida (S/)
        </label>
        <input type="number" id="modal-monto-salida"
          style="width:100%;padding:12px 14px;background:var(--bg2);
                 border:1.5px solid var(--border);border-radius:var(--radius);
                 color:var(--text);font-size:1rem;font-family:var(--font-mono);
                 box-sizing:border-box"
          placeholder="0.00" min="0" step="0.50" value="0" />
        <span style="font-size:0.72rem;color:var(--text3);margin-top:4px;display:block">
          Dejar en 0 si no se cobra en la salida
        </span>
      </div>
    </div>`;

  mostrarModal(`🏁 Registrar Salida`, htmlModal, [
    {
      texto: '🏁 Confirmar Salida',
      clase: 'btn-warning',
      accion: async () => {
        const monto = parseFloat(document.getElementById('modal-monto-salida').value) || 0;
        cerrarModal();
        await procesarSalida(autoId, monto);
      }
    },
    { texto: 'Cancelar', clase: 'btn-secondary', accion: cerrarModal }
  ]);
}

async function procesarSalida(autoId, monto) {
  try {
    const resultado = await Vehiculos.registrarSalida(autoId, monto, turnoActivo, sesion);
    mostrarToast(`✅ Salida registrada: ${resultado.placa}`, 'success');
    await cargarAutos();
  } catch (e) {
    if (e.message === 'ya_salio') {
      mostrarToast('Este vehículo ya registró salida', 'warning');
    } else {
      mostrarToast('Error al registrar salida', 'error');
      console.error(e);
    }
    await cargarAutos();
  }
}

// ── Reimprimir Ticket ────────────────────────────────────────────────────
async function reimprimirTicket(autoId) {
  const auto = autosData.find(a => a.id === autoId)
    || await Vehiculos.getById(autoId);
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

init();

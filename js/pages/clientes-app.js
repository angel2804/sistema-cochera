/* ============================================================
   CLIENTES — Controlador de gestión de clientes
   Dependencias: firebase/config.js, auth.js, ui.js, clientes.js
   ============================================================ */

let sesion       = null;
let clientesData = [];        // todos los clientes cargados
let clientesPagina   = 1;
const CLIENTES_PAGE_SIZE = 20;

async function init() {
  sesion = Auth.requireAdmin();
  if (!sesion) return;

  document.getElementById('sidebar-nombre').textContent = sesion.nombre || sesion.usuario;
  iniciarReloj('reloj');
  initModoOscuro('btn-modo');
  await cargarClientes();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}
function cerrarSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

async function cargarClientes() {
  const contenedor = document.getElementById('clientes-grid');
  contenedor.innerHTML = `<p style="color:var(--text3)">Cargando...</p>`;
  try {
    clientesData = await Clientes.getAll();
    renderizarClientes(clientesData);
  } catch (e) {
    contenedor.innerHTML = `<p style="color:var(--red)">Error al cargar clientes</p>`;
    console.error(e);
  }
}

function filtrarClientes() {
  clientesPagina = 1;
  const q = document.getElementById('inp-buscar-cliente').value.toLowerCase().trim();
  if (!q) {
    renderizarClientes(clientesData);
    return;
  }
  const filtrados = clientesData.filter(c =>
    (c.nombre || '').toLowerCase().includes(q) ||
    (c.celular || '').includes(q)
  );
  renderizarClientes(filtrados);
}

function cambiarPaginaClientes(delta) {
  clientesPagina += delta;
  if (clientesPagina < 1) clientesPagina = 1;
  filtrarClientes();
}

function renderizarClientes(lista) {
  const contenedor = document.getElementById('clientes-grid');
  if (lista.length === 0) {
    contenedor.innerHTML = `
      <div style="text-align:center;padding:48px;color:var(--text3);grid-column:1/-1">
        <div style="font-size:2.5rem;margin-bottom:12px">👤</div>
        <p>No se encontraron clientes.</p>
      </div>`;
    actualizarPaginacionClientes(lista.length);
    return;
  }

  // Paginar
  const inicio = (clientesPagina - 1) * CLIENTES_PAGE_SIZE;
  const pagina = lista.slice(inicio, inicio + CLIENTES_PAGE_SIZE);

  contenedor.innerHTML = pagina.map(c => {
    const placas = (c.placas || []).map(p =>
      `<span class="badge badge-blue hist-mono">${p}</span>`
    ).join('');
    return `
      <div class="cliente-card">
        <div class="cliente-card-header">
          <div class="cliente-avatar">👤</div>
          <div style="flex:1">
            <div class="cliente-name">${c.nombre || 'Sin nombre'}</div>
            <div class="cliente-tel">${c.celular || 'Sin celular'}</div>
          </div>
        </div>
        <div class="cliente-placas">
          ${placas || '<span class="tabla-vacia">Sin placas registradas</span>'}
        </div>
        <div class="cliente-acciones">
          <button class="btn btn-secondary btn-sm-icon"
            onclick="abrirModalEditar('${c.id}')">✏️ Editar</button>
          <button class="btn btn-danger btn-sm-icon"
            onclick="eliminarCliente('${c.id}', '${(c.nombre || '').replace(/'/g, '')}')">
            🗑️
          </button>
        </div>
      </div>`;
  }).join('');

  actualizarPaginacionClientes(lista.length);
}

function actualizarPaginacionClientes(total) {
  const wrap = document.getElementById('clientes-pagination');
  const info = document.getElementById('clientes-pag-info');
  const prev = document.getElementById('clientes-pag-prev');
  const next = document.getElementById('clientes-pag-next');

  const hayPrev = clientesPagina > 1;
  const hayNext = clientesPagina * CLIENTES_PAGE_SIZE < total;
  wrap.style.display = (hayPrev || hayNext) ? 'flex' : 'none';
  prev.disabled = !hayPrev;
  next.disabled = !hayNext;

  const inicio = ((clientesPagina - 1) * CLIENTES_PAGE_SIZE) + 1;
  const fin    = Math.min(clientesPagina * CLIENTES_PAGE_SIZE, total);
  info.textContent = `${inicio}–${fin} de ${total} clientes`;
}

function abrirModalNuevoCliente() {
  const html = `
    <div class="form-group-mb">
      <label class="form-label">Nombre *</label>
      <input type="text" id="nc-nombre" class="form-input" placeholder="Nombre completo" />
    </div>
    <div class="form-group-mb">
      <label class="form-label">Celular</label>
      <input type="text" id="nc-celular" class="form-input" placeholder="Número de celular" />
    </div>
    <div class="form-group-mb">
      <label class="form-label">Placas (separadas por coma)</label>
      <input type="text" id="nc-placas" class="form-input" placeholder="ABC123, XYZ789"
        oninput="this.value=this.value.toUpperCase()" />
      <span style="font-size:0.72rem;color:var(--text3);margin-top:4px;display:block">
        Ejemplo: ABC123, DEF456
      </span>
    </div>`;

  mostrarModal('➕ Nuevo Cliente', html, [
    {
      texto: '✅ Crear',
      clase: 'btn-success',
      accion: crearCliente
    },
    { texto: 'Cancelar', clase: 'btn-secondary', accion: cerrarModal }
  ]);
}

async function crearCliente() {
  const nombre = document.getElementById('nc-nombre').value.trim();
  const celular = document.getElementById('nc-celular').value.trim();
  const placasStr = document.getElementById('nc-placas').value.trim();
  const placas = placasStr
    ? placasStr.split(',').map(p => p.trim().toUpperCase()).filter(Boolean)
    : [];

  if (!nombre) { mostrarToast('El nombre es requerido', 'warning'); return; }

  try {
    await Clientes.add({ nombre, celular, placas });
    cerrarModal();
    mostrarToast('Cliente creado', 'success');
    await cargarClientes();
  } catch (e) {
    mostrarToast('Error al crear cliente', 'error');
    console.error(e);
  }
}

async function abrirModalEditar(id) {
  const cliente = clientesData.find(c => c.id === id);
  if (!cliente) return;

  const html = `
    <div class="form-group-mb">
      <label class="form-label">Nombre *</label>
      <input type="text" id="ec-nombre" class="form-input" value="${cliente.nombre || ''}" />
    </div>
    <div class="form-group-mb">
      <label class="form-label">Celular</label>
      <input type="text" id="ec-celular" class="form-input" value="${cliente.celular || ''}" />
    </div>
    <div class="form-group-mb">
      <label class="form-label">Placas (separadas por coma)</label>
      <input type="text" id="ec-placas" class="form-input"
        value="${(cliente.placas || []).join(', ')}"
        oninput="this.value=this.value.toUpperCase()" />
    </div>`;

  mostrarModal('✏️ Editar Cliente', html, [
    {
      texto: '💾 Guardar',
      clase: 'btn-success',
      accion: () => guardarEdicionCliente(id)
    },
    { texto: 'Cancelar', clase: 'btn-secondary', accion: cerrarModal }
  ]);
}

async function guardarEdicionCliente(id) {
  const nombre = document.getElementById('ec-nombre').value.trim();
  const celular = document.getElementById('ec-celular').value.trim();
  const placasStr = document.getElementById('ec-placas').value.trim();
  const placas = placasStr
    ? placasStr.split(',').map(p => p.trim().toUpperCase()).filter(Boolean)
    : [];

  if (!nombre) { mostrarToast('El nombre es requerido', 'warning'); return; }

  try {
    await Clientes.update(id, { nombre, celular, placas });
    cerrarModal();
    mostrarToast('Cliente actualizado', 'success');
    await cargarClientes();
  } catch (e) {
    mostrarToast('Error al actualizar', 'error');
    console.error(e);
  }
}

async function eliminarCliente(id, nombre) {
  if (!confirm(`¿Eliminar al cliente "${nombre}"?`)) return;
  try {
    await Clientes.delete(id);
    mostrarToast('Cliente eliminado', 'success');
    await cargarClientes();
  } catch (e) {
    mostrarToast('Error al eliminar', 'error');
  }
}

init();

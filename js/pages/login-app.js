/* ============================================================
   LOGIN — Controlador de pantalla de acceso
   Dependencias: firebase/config.js, js/auth.js, js/ui.js
   ============================================================ */

// Al cargar: si hay sesión activa, redirigir según rol
(function () {
  const s = Auth.get();
  if (s) {
    const irDash = s.rol === 'admin' || s.rol === 'desarrollador';
    window.location.href = irDash ? 'dashboard.html' : 'turno.html';
  }
})();

// Verificar primer uso y crear admin por defecto si no hay usuarios
async function verificarPrimerUso() {
  try {
    const snap = await db.collection('usuarios').limit(1).get();
    if (snap.empty) {
      await db.collection('usuarios').add({
        usuario: 'admin',
        nombre: 'Administrador',
        password: 'admin123',
        rol: 'admin',
        activo: true,
        creadoEn: new Date()
      });
      document.getElementById('primer-uso-nota').classList.add('visible');
    }
  } catch (e) {
    console.warn('Error verificando primer uso:', e);
  }
}
verificarPrimerUso();
verificarUsuarioDesarrollador();
cargarLogoLogin();

// Carga el logo de la empresa desde Firestore y lo muestra en el login
async function cargarLogoLogin() {
  try {
    const doc = await db.collection('configuracion').doc('general').get();
    const logoUrl = doc.exists ? doc.data().logoUrl : null;
    if (logoUrl) {
      document.getElementById('login-logo-img').src = logoUrl;
      document.getElementById('login-logo-img-wrap').style.display = 'block';
      document.getElementById('login-logo-emoji').style.display = 'none';
    }
  } catch (e) {}
}

// Crea el usuario desarrollador si no existe (oculto del CRUD normal)
async function verificarUsuarioDesarrollador() {
  try {
    const snap = await db.collection('usuarios')
      .where('usuario', '==', 'angel').limit(1).get();
    if (snap.empty) {
      await db.collection('usuarios').add({
        usuario: 'angel',
        nombre: 'Desarrollador',
        password: 'angelccasa284',
        rol: 'desarrollador',
        activo: true,
        creadoEn: new Date()
      });
    }
  } catch (e) {
    console.warn('Error verificando usuario desarrollador:', e);
  }
}

function mostrarError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.classList.add('visible');
}
function ocultarError() {
  document.getElementById('login-error').classList.remove('visible');
}

async function handleLogin(e) {
  e.preventDefault();
  ocultarError();

  const usuario = document.getElementById('inp-usuario').value.trim();
  const password = document.getElementById('inp-password').value;

  if (!usuario || !password) {
    mostrarError('Por favor, completa todos los campos.');
    return;
  }

  const btn = document.getElementById('btn-login');
  const spinner = document.getElementById('login-spinner');
  const btnText = document.getElementById('login-btn-text');
  btn.disabled = true;
  spinner.classList.add('visible');
  btnText.textContent = 'Verificando...';

  try {
    // Dos equality where — permitido en Firestore
    const snap = await db.collection('usuarios')
      .where('usuario', '==', usuario)
      .where('activo', '==', true)
      .limit(1).get();

    if (snap.empty) {
      mostrarError('❌ Usuario no encontrado o inactivo.');
      return;
    }

    const doc = snap.docs[0];
    const data = doc.data();

    if (data.password !== password) {
      mostrarError('❌ Contraseña incorrecta.');
      return;
    }

    // Guardar sesión
    Auth.set({
      id: doc.id,
      usuario: data.usuario,
      nombre: data.nombre || data.usuario,
      rol: data.rol
    });

    // Redirigir según rol
    const irDashboard = data.rol === 'admin' || data.rol === 'desarrollador';
    window.location.href = irDashboard ? 'dashboard.html' : 'turno.html';

  } catch (err) {
    console.error('Error en login:', err);
    mostrarError('Error al conectar. Verifica tu conexión e intenta de nuevo.');
  } finally {
    btn.disabled = false;
    spinner.classList.remove('visible');
    btnText.textContent = 'Ingresar →';
  }
}

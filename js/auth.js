// Auth — Gestión de sesión sin Firebase Auth
const Auth = {
  KEY: 'cochera_session',

  get() {
    try {
      return JSON.parse(sessionStorage.getItem(this.KEY));
    } catch {
      return null;
    }
  },

  set(data) {
    sessionStorage.setItem(this.KEY, JSON.stringify(data));
  },

  clear() {
    sessionStorage.removeItem(this.KEY);
  },

  isAdmin() {
    return this.get()?.rol === 'admin';
  },

  // Requiere cualquier sesión activa; redirige a login si no hay.
  // Usa replace() para borrar la página protegida del historial del navegador
  // y evitar que el botón "Atrás" la recupere.
  requireAuth() {
    const s = this.get();
    if (!s) {
      window.location.replace('login.html');
      return null;
    }
    return s;
  },

  // Solo para admins y desarrollador; redirige a turno.html si el rol no coincide.
  requireAdmin() {
    const s = this.requireAuth();
    const esAdmin = s && (s.rol === 'admin' || s.rol === 'desarrollador');
    if (s && !esAdmin) {
      window.location.replace('turno.html');
      return null;
    }
    return s;
  },

  // Solo para trabajadores; redirige a dashboard si es admin/desarrollador.
  requireWorker() {
    const s = this.requireAuth();
    if (s && (s.rol === 'admin' || s.rol === 'desarrollador')) {
      window.location.replace('dashboard.html');
      return null;
    }
    return s;
  },

  // Cierra sesión: limpia sessionStorage y redirige sin dejar rastro en historial.
  logout() {
    this.clear();
    window.location.replace('login.html');
  }
};

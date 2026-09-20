// ============================================================
// AUTENTICACIÓN — Rutas limpias sin extensión .html
// ============================================================

// Definición directa de rutas limpias sin .html
const URL_LOGIN = "/login";
const URL_HOME = "/";

/**
 * Redirige al login si no hay sesión activa.
 */
async function requireSession() {
  const { data, error } = await window.db.auth.getSession();
  if (error || !data.session) {
    window.location.href = URL_LOGIN;
    return null;
  }
  return data.session;
}

/**
 * Si ya hay sesión activa y estamos en login, redirige al inicio (/).
 */
async function redirectIfLoggedIn() {
  const { data } = await window.db.auth.getSession();
  if (data.session) {
    window.location.href = URL_HOME;
  }
}

/**
 * Cierra la sesión activa y regresa al login (/login).
 */
async function cerrarSesion() {
  await window.db.auth.signOut();
  window.location.href = URL_LOGIN;
}

// ------------------------------------------------------------
// Lógica exclusiva de la pantalla de login
// ------------------------------------------------------------
function initLoginPage() {
  redirectIfLoggedIn();

  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const toggleBtn = document.getElementById('toggle-password');
  const errorBox = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit');
  const spinner = submitBtn?.querySelector('.spinner');
  const btnText = submitBtn?.querySelector('.btn-text');

  if (toggleBtn && passwordInput) {
    toggleBtn.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      toggleBtn.textContent = isPassword ? 'Ocultar' : 'Mostrar';
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (errorBox) {
        errorBox.classList.remove('visible');
        errorBox.textContent = '';
      }

      const email = emailInput ? emailInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';

      if (!email || !password) {
        mostrarErrorLogin('Completa tu correo y contraseña.');
        return;
      }

      setLoadingLogin(true);

      const { error } = await window.db.auth.signInWithPassword({ email, password });

      setLoadingLogin(false);

      if (error) {
        mostrarErrorLogin(traducirErrorLogin(error.message));
        return;
      }

      window.location.href = URL_HOME;
    });
  }

  function setLoadingLogin(loading) {
    if (!submitBtn) return;
    submitBtn.disabled = loading;
    if (spinner) spinner.classList.toggle('hidden', !loading);
    if (btnText) btnText.textContent = loading ? 'Ingresando...' : 'Iniciar sesión';
  }

  function mostrarErrorLogin(msg) {
    if (!errorBox) return;
    errorBox.textContent = msg;
    errorBox.classList.add('visible');
  }

  function traducirErrorLogin(msg) {
    if (!msg) return 'No se pudo iniciar sesión. Intenta de nuevo.';
    if (msg.includes('Invalid login credentials')) {
      return 'Correo o contraseña incorrectos.';
    }
    if (msg.includes('Email not confirmed')) {
      return 'Este correo aún no ha sido confirmado.';
    }
    return 'No se pudo iniciar sesión. Intenta de nuevo.';
  }
}

// Inicialización de event listeners cuando el DOM esté cargado
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('login-form')) {
    initLoginPage();
  }

  document.querySelectorAll('.js-logout').forEach((btn) => {
    btn.addEventListener('click', cerrarSesion);
  });
});
// ============================================================
// AUTENTICACIÓN — login.html y protección del dashboard
// ============================================================

/**
 * Redirige a login.html si no hay sesión activa.
 * Se llama al inicio de app.js (dashboard).
 * Devuelve la sesión si existe.
 */
async function requireSession() {
  const { data, error } = await window.db.auth.getSession();
  if (error || !data.session) {
    window.location.href = 'login.html';
    return null;
  }
  return data.session;
}

/**
 * Si ya hay sesión activa y estamos en login.html, mandar al dashboard.
 */
async function redirectIfLoggedIn() {
  const { data } = await window.db.auth.getSession();
  if (data.session) {
    window.location.href = 'index.html';
  }
}

/**
 * Cierra la sesión y regresa a login.html
 */
async function cerrarSesion() {
  await window.db.auth.signOut();
  window.location.href = 'login.html';
}

// ------------------------------------------------------------
// Lógica exclusiva de login.html
// ------------------------------------------------------------
function initLoginPage() {
  redirectIfLoggedIn();

  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const toggleBtn = document.getElementById('toggle-password');
  const errorBox = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit');
  const spinner = submitBtn.querySelector('.spinner');
  const btnText = submitBtn.querySelector('.btn-text');

  toggleBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    toggleBtn.textContent = isPassword ? 'Ocultar' : 'Mostrar';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.remove('visible');
    errorBox.textContent = '';

    const email = emailInput.value.trim();
    const password = passwordInput.value;

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

    window.location.href = 'index.html';
  });

  function setLoadingLogin(loading) {
    submitBtn.disabled = loading;
    spinner.classList.toggle('hidden', !loading);
    btnText.textContent = loading ? 'Ingresando...' : 'Iniciar sesión';
  }

  function mostrarErrorLogin(msg) {
    errorBox.textContent = msg;
    errorBox.classList.add('visible');
  }

  function traducirErrorLogin(msg) {
    if (msg.includes('Invalid login credentials')) {
      return 'Correo o contraseña incorrectos.';
    }
    if (msg.includes('Email not confirmed')) {
      return 'Este correo aún no ha sido confirmado.';
    }
    return 'No se pudo iniciar sesión. Intenta de nuevo.';
  }
}

if (document.getElementById('login-form')) {
  initLoginPage();
}

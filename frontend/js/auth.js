// Autenticacion contra auth service
const Auth = {

  async login(email, password) {
    const datos = await fetchAPI(`${API.auth}/login`, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    guardarSesion(datos.token, datos.usuario_id, datos.rol, email);
    return datos;
  },

  async registro(nombre, email, password) {
    const datos = await fetchAPI(`${API.auth}/registro`, {
      method: 'POST',
      body: JSON.stringify({ nombre, email, password }),
    });
    guardarSesion(datos.token, datos.usuario_id, datos.rol, email);
    return datos;
  },

  logout() {
    limpiarSesion();
    mostrarPagina('login');
    document.getElementById('nav').classList.add('hidden');
  },
};

// Handlers
document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';
  const datos = new FormData(e.target);
  try {
    await Auth.login(datos.get('email'), datos.get('password'));
    iniciarSesionUI();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById('form-registro').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('registro-error');
  errorEl.textContent = '';
  const datos = new FormData(e.target);
  try {
    await Auth.registro(datos.get('nombre'), datos.get('email'), datos.get('password'));
    iniciarSesionUI();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById('btn-logout').addEventListener('click', () => Auth.logout());

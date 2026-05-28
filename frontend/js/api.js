// URLs de microservicios (ajustar segun deployment)
const API = {
  auth:        'http://localhost:8001',
  space:       'http://localhost:8002',
  reservation: 'http://localhost:8003',
  billing:     'http://localhost:8004',
};

// Estado global
const Estado = {
  token: localStorage.getItem('token') || null,
  usuario_id: parseInt(localStorage.getItem('usuario_id')) || null,
  rol: localStorage.getItem('rol') || null,
  email: localStorage.getItem('email') || null,
};

function guardarSesion(token, usuario_id, rol, email) {
  Estado.token = token;
  Estado.usuario_id = usuario_id;
  Estado.rol = rol;
  Estado.email = email;
  localStorage.setItem('token', token);
  localStorage.setItem('usuario_id', usuario_id);
  localStorage.setItem('rol', rol);
  localStorage.setItem('email', email);
}

function limpiarSesion() {
  Estado.token = null;
  Estado.usuario_id = null;
  Estado.rol = null;
  Estado.email = null;
  localStorage.clear();
}

// Wrapper fetch con JWT
async function fetchAPI(url, opciones = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(opciones.headers || {}),
  };
  if (Estado.token) headers['Authorization'] = `Bearer ${Estado.token}`;

  const resp = await fetch(url, { ...opciones, headers });

  if (resp.status === 401) {
    limpiarSesion();
    mostrarPagina('login');
    throw new Error('Sesion expirada');
  }

  const texto = await resp.text();
  let datos;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }

  if (!resp.ok) {
    let msg = resp.statusText;
    if (datos) {
      // Spring Boot devuelve errors[] con defaultMessage en validacion
      if (Array.isArray(datos.errors) && datos.errors.length > 0) {
        msg = datos.errors.map(e => e.defaultMessage || e.message).filter(Boolean).join(', ');
      } else if (datos.detail) {
        // FastAPI usa detail (puede ser array de Pydantic)
        msg = Array.isArray(datos.detail)
          ? datos.detail.map(d => d.msg || JSON.stringify(d)).join(', ')
          : (typeof datos.detail === 'string' ? datos.detail : JSON.stringify(datos.detail));
      } else if (datos.message) {
        msg = datos.message;
      } else if (datos.error) {
        msg = datos.error;
      }
    }
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return datos;
}

// Modal de confirmacion custom - reemplaza window.confirm()
// Retorna Promise<boolean>. Opciones: { titulo, textoAceptar, textoCancelar, peligro }
function confirmar(mensaje, opciones = {}) {
  return new Promise((resolve) => {
    const modal      = document.getElementById('modal-confirmar');
    const tituloEl   = document.getElementById('modal-confirmar-titulo');
    const mensajeEl  = document.getElementById('modal-confirmar-mensaje');
    const btnOk      = document.getElementById('modal-confirmar-aceptar');
    const btnCancel  = document.getElementById('modal-confirmar-cancelar');

    tituloEl.textContent  = opciones.titulo || 'Confirmar';
    mensajeEl.textContent = mensaje;
    btnOk.textContent     = opciones.textoAceptar || 'Aceptar';
    btnCancel.textContent = opciones.textoCancelar || 'Cancelar';
    btnOk.className       = opciones.peligro ? 'btn-danger' : 'btn-primary';

    modal.classList.remove('hidden');
    btnOk.focus();

    function cerrar(resultado) {
      modal.classList.add('hidden');
      btnOk.removeEventListener('click', okHandler);
      btnCancel.removeEventListener('click', cancelHandler);
      modal.removeEventListener('click', backdropHandler);
      document.removeEventListener('keydown', keyHandler);
      resolve(resultado);
    }
    function okHandler()       { cerrar(true); }
    function cancelHandler()   { cerrar(false); }
    function backdropHandler(e){ if (e.target === modal) cerrar(false); }
    function keyHandler(e) {
      if (e.key === 'Escape') cerrar(false);
      if (e.key === 'Enter')  cerrar(true);
    }

    btnOk.addEventListener('click', okHandler);
    btnCancel.addEventListener('click', cancelHandler);
    modal.addEventListener('click', backdropHandler);
    document.addEventListener('keydown', keyHandler);
  });
}

// Toast helper
function toast(mensaje, tipo = '') {
  const t = document.getElementById('toast');
  t.textContent = mensaje;
  t.className = 'toast show ' + tipo;
  setTimeout(() => t.classList.remove('show'), 3000);
}

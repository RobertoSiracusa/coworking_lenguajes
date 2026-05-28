// Router y arranque

function mostrarPagina(nombre) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pagina = document.getElementById('page-' + nombre);
  if (pagina) pagina.classList.add('active');

  // Marcar link activo
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const link = document.querySelector(`.nav-link[data-page="${nombre}"]`);
  if (link) link.classList.add('active');

  // Cargar datos segun pagina
  if (nombre === 'espacios') cargarEspacios();
  if (nombre === 'reservas') cargarReservas();
  if (nombre === 'facturas') cargarFacturas();
  if (nombre === 'admin') cargarTabAdmin('admin-cola');
}

// Links en nav y links inline
document.querySelectorAll('[data-page]').forEach(el => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    mostrarPagina(el.dataset.page);
  });
});

function iniciarSesionUI() {
  document.getElementById('nav').classList.remove('hidden');
  document.getElementById('user-info').textContent = `${Estado.email} (${Estado.rol})`;

  // Mostrar tab admin solo si es admin
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = Estado.rol === 'admin' ? '' : 'none';
  });

  mostrarPagina('espacios');
}

// Arranque
if (Estado.token) {
  iniciarSesionUI();
} else {
  document.getElementById('nav').classList.add('hidden');
  mostrarPagina('login');
}

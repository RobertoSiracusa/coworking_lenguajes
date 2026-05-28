// Funciones de administracion
const Admin = {

  async cola() {
    return fetchAPI(`${API.reservation}/cola`);
  },

  async confirmarSiguiente() {
    return fetchAPI(`${API.reservation}/cola/confirmar`, { method: 'POST' });
  },

  async listarReservasConfirmadas() {
    return fetchAPI(`${API.reservation}/reservas?estado=CONFIRMADA&por_pagina=50`);
  },

  async completarReserva(id) {
    return fetchAPI(`${API.reservation}/reservas/${id}/completar`, { method: 'PATCH' });
  },

  async crearEspacio(datos) {
    return fetchAPI(`${API.space}/espacios`, {
      method: 'POST',
      body: JSON.stringify(datos),
    });
  },

  async resumenFacturas() {
    return fetchAPI(`${API.billing}/reportes/resumen`);
  },

  async reportePorEspacio() {
    return fetchAPI(`${API.billing}/reportes/por-espacio`);
  },

  async cacheAuth() {
    return fetchAPI(`${API.auth}/cache/estadisticas`);
  },

  async cacheSpace() {
    return fetchAPI(`${API.space}/cache/estadisticas`);
  },

  async cacheReservation() {
    return fetchAPI(`${API.reservation}/cache/estadisticas`);
  },

  async cacheBilling() {
    return fetchAPI(`${API.billing}/cache/estadisticas`);
  },

  // Gestion de usuarios
  async listarUsuarios() {
    return fetchAPI(`${API.auth}/usuarios`);
  },

  async crearUsuario(datos) {
    return fetchAPI(`${API.auth}/usuarios`, {
      method: 'POST',
      body: JSON.stringify(datos),
    });
  },

  async cambiarRolUsuario(id, rol) {
    return fetchAPI(`${API.auth}/usuarios/${id}/rol`, {
      method: 'PATCH',
      body: JSON.stringify({ rol }),
    });
  },

  async eliminarUsuario(id) {
    return fetchAPI(`${API.auth}/usuarios/${id}`, { method: 'DELETE' });
  },
};

// Tabs
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById(t.dataset.tab).classList.add('active');
    cargarTabAdmin(t.dataset.tab);
  });
});

async function cargarTabAdmin(tabId) {
  if (tabId === 'admin-cola') return cargarCola();
  if (tabId === 'admin-usuarios') return cargarUsuariosAdmin();
  if (tabId === 'admin-facturas') return cargarReporteAdmin();
  if (tabId === 'admin-cache') return cargarCache();
}

async function cargarUsuariosAdmin() {
  try {
    const usuarios = await Admin.listarUsuarios();
    const cont = document.getElementById('lista-usuarios');
    if (!usuarios || usuarios.length === 0) {
      cont.innerHTML = '<p style="color: var(--gris); padding: 1rem;">No hay usuarios</p>';
      return;
    }
    const miId = Estado.usuario_id;
    cont.innerHTML = usuarios.map(u => `
      <div class="lista-item">
        <div class="info">
          <h4>${escaparHTML(u.nombre)}
            <span class="badge ${u.rol === 'admin' ? 'badge-confirmada' : 'badge-pendiente'}">${u.rol}</span>
            ${u.id === miId ? '<span class="badge badge-disponible">tu</span>' : ''}
          </h4>
          <p>${escaparHTML(u.email)} - ID: ${u.id}</p>
        </div>
        <div class="acciones">
          ${u.id !== miId ? `
            <select data-cambiar-rol="${u.id}">
              <option value="usuario" ${u.rol === 'usuario' ? 'selected' : ''}>usuario</option>
              <option value="admin"   ${u.rol === 'admin'   ? 'selected' : ''}>admin</option>
            </select>
            <button class="btn-danger" data-eliminar-usr="${u.id}">Eliminar</button>
          ` : ''}
        </div>
      </div>
    `).join('');

    cont.querySelectorAll('[data-cambiar-rol]').forEach(sel => {
      const original = sel.value;
      sel.addEventListener('change', async () => {
        try {
          await Admin.cambiarRolUsuario(sel.dataset.cambiarRol, sel.value);
          toast(`Rol cambiado a ${sel.value}`, 'success');
        } catch (err) {
          sel.value = original;
          toast('Error: ' + err.message, 'error');
        }
      });
    });

    cont.querySelectorAll('[data-eliminar-usr]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await confirmar('Eliminar este usuario? Accion irreversible.', { titulo: 'Eliminar usuario', textoAceptar: 'Eliminar', peligro: true })) return;
        try {
          await Admin.eliminarUsuario(btn.dataset.eliminarUsr);
          toast('Usuario eliminado', 'success');
          cargarUsuariosAdmin();
        } catch (err) {
          toast('Error: ' + err.message, 'error');
        }
      });
    });
  } catch (err) {
    toast('Error al cargar usuarios: ' + err.message, 'error');
  }
}

// Form crear usuario
document.getElementById('form-crear-usuario').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await Admin.crearUsuario({
      nombre: fd.get('nombre'),
      email: fd.get('email'),
      password: fd.get('password'),
      rol: fd.get('rol'),
    });
    toast('Usuario creado', 'success');
    e.target.reset();
    cargarUsuariosAdmin();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
});

async function cargarCola() {
  try {
    const [datos, confirmadas] = await Promise.all([
      Admin.cola(),
      Admin.listarReservasConfirmadas().catch(() => ({ datos: [] })),
    ]);
    const cont = document.getElementById('lista-cola');
    const pendientes = datos.reservas || [];
    const reservasConf = confirmadas.datos || [];

    let html = `<h4 style="margin-top: 0;">Pendientes (cola): ${datos.total_en_cola}</h4>`;
    if (pendientes.length === 0) {
      html += '<p style="color: var(--gris); padding: 0.5rem;">Cola vacia</p>';
    } else {
      html += pendientes.map(r => `
        <div class="lista-item">
          <div class="info">
            <h4>${escaparHTML(r.nombreEspacio || 'Espacio')} <span class="badge badge-${r.prioridadNombre.toLowerCase()}">${r.prioridadNombre}</span></h4>
            <p>${formatearFecha(r.fechaInicio)} - ${formatearFecha(r.fechaFin)}</p>
            <p style="font-size: 0.8rem; color: var(--gris-2);">Usuario ID: ${r.usuarioId}</p>
          </div>
        </div>
      `).join('');
    }

    html += `<h4>Confirmadas (listas para completar): ${reservasConf.length}</h4>`;
    if (reservasConf.length === 0) {
      html += '<p style="color: var(--gris); padding: 0.5rem;">Ninguna confirmada</p>';
    } else {
      html += reservasConf.map(r => `
        <div class="lista-item">
          <div class="info">
            <h4>${escaparHTML(r.nombreEspacio || 'Espacio')} <span class="badge badge-confirmada">CONFIRMADA</span></h4>
            <p>${formatearFecha(r.fechaInicio)} - ${formatearFecha(r.fechaFin)}</p>
            <p style="font-size: 0.8rem; color: var(--gris-2);">
              Usuario: ${escaparHTML(r.usuarioNombre || r.usuarioId)}
              ${r.precioHora ? `- $${parseFloat(r.precioHora).toFixed(2)}/h` : ''}
            </p>
          </div>
          <div class="acciones">
            <button class="btn-primary" data-completar="${r.id}">Completar y facturar</button>
          </div>
        </div>
      `).join('');
    }

    cont.innerHTML = html;

    cont.querySelectorAll('[data-completar]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await confirmar('Completar reserva y generar factura?', { titulo: 'Completar reserva', textoAceptar: 'Completar' })) return;
        try {
          await Admin.completarReserva(btn.dataset.completar);
          toast('Reserva completada. Factura generada.', 'success');
          cargarCola();
        } catch (err) {
          toast('Error: ' + err.message, 'error');
        }
      });
    });
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

document.getElementById('btn-confirmar-cola').addEventListener('click', async () => {
  try {
    const r = await Admin.confirmarSiguiente();
    toast(`Confirmada: ${r.nombreEspacio || 'reserva #' + r.id}`, 'success');
    cargarCola();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
});

document.getElementById('form-crear-espacio').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await Admin.crearEspacio({
      nombre: fd.get('nombre'),
      descripcion: fd.get('descripcion'),
      capacidad: parseInt(fd.get('capacidad')),
      precio_por_hora: parseFloat(fd.get('precio_por_hora')),
    });
    toast('Espacio creado', 'success');
    e.target.reset();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
});

async function cargarReporteAdmin() {
  try {
    const resumen = await Admin.resumenFacturas();
    document.getElementById('admin-resumen').innerHTML = `
      <div class="stat-card">
        <div class="valor">${resumen.total_facturas}</div>
        <div class="etiqueta">Facturas totales</div>
      </div>
      <div class="stat-card">
        <div class="valor">$${resumen.total_ingresos.toFixed(2)}</div>
        <div class="etiqueta">Ingresos totales</div>
      </div>
      <div class="stat-card">
        <div class="valor">${resumen.facturas_hoy}</div>
        <div class="etiqueta">Facturas hoy</div>
      </div>
      <div class="stat-card">
        <div class="valor">${resumen.pendientes_pago}</div>
        <div class="etiqueta">Pendientes</div>
      </div>
      <div class="stat-card">
        <div class="valor">$${resumen.promedio_factura.toFixed(2)}</div>
        <div class="etiqueta">Promedio</div>
      </div>
    `;

    const porEsp = await Admin.reportePorEspacio();
    document.getElementById('reporte-espacios').innerHTML = (porEsp.espacios || []).map(e => `
      <div class="lista-item">
        <div class="info">
          <h4>${escaparHTML(e.nombre_espacio || 'Espacio #' + e.espacio_id)}</h4>
          <p>${e.total_facturas} facturas - ${e.total_horas}h totales</p>
        </div>
        <div class="acciones">
          <span class="precio">$${e.total_ingresos.toFixed(2)}</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

async function cargarCache() {
  const out = document.getElementById('cache-output');
  out.textContent = 'Cargando...';
  const resultados = {};
  const llamadas = [
    ['auth', Admin.cacheAuth()],
    ['space', Admin.cacheSpace()],
    ['reservation', Admin.cacheReservation()],
    ['billing', Admin.cacheBilling()],
  ];
  for (const [nombre, prom] of llamadas) {
    try {
      resultados[nombre] = await prom;
    } catch (err) {
      resultados[nombre] = { error: err.message };
    }
  }
  out.textContent = JSON.stringify(resultados, null, 2);
}

document.getElementById('btn-cargar-cache').addEventListener('click', cargarCache);

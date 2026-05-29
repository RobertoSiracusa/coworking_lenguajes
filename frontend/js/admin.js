// Funciones de administracion
const Admin = {

  async cola() {
    return fetchAPI(`${API.reservation}/cola`);
  },

  async confirmarSiguiente() {
    return fetchAPI(`${API.reservation}/cola/confirmar`, { method: 'POST' });
  },

  async listarReservas(estado) {
    const qs = estado ? `?estado=${estado}&por_pagina=100` : '?por_pagina=100';
    return fetchAPI(`${API.reservation}/reservas${qs}`);
  },

  async actualizarEstadoReserva(id, estado) {
    return fetchAPI(`${API.reservation}/reservas/${id}/estado`, {
      method: 'PATCH',
      body: JSON.stringify({ estado }),
    });
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

  async listarFacturas() {
    return fetchAPI(`${API.billing}/facturas?por_pagina=100`);
  },

  async actualizarEstadoFactura(id, estado) {
    return fetchAPI(`${API.billing}/facturas/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ estado }),
    });
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

  async resetearDatos() {
    await fetchAPI(`${API.billing}/facturas/reset`, { method: 'DELETE' });
    await fetchAPI(`${API.reservation}/reservas/reset`, { method: 'DELETE' });
    await fetchAPI(`${API.space}/espacios/reset`, { method: 'DELETE' });
    await fetchAPI(`${API.auth}/usuarios/reset`, { method: 'DELETE' });
    return { mensaje: 'Restablecimiento completo de datos finalizado con éxito.' };
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
  if (tabId === 'admin-reservas') return cargarReservasAdmin();
  if (tabId === 'admin-usuarios') return cargarUsuariosAdmin();
  if (tabId === 'admin-facturas') return cargarReporteAdmin();
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
    const [datos, pagadasResp] = await Promise.all([
      Admin.cola(),
      Admin.listarReservas('PAGADA').catch(() => ({ datos: [] })),
    ]);
    const cont = document.getElementById('lista-cola');
    const pendientes = datos.reservas || [];
    const reservasPagadas = pagadasResp.datos || [];

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

    html += `<h4>Pagadas (listas para completar): ${reservasPagadas.length}</h4>`;
    if (reservasPagadas.length === 0) {
      html += '<p style="color: var(--gris); padding: 0.5rem;">Ninguna pagada</p>';
    } else {
      html += reservasPagadas.map(r => `
        <div class="lista-item">
          <div class="info">
            <h4>${escaparHTML(r.nombreEspacio || 'Espacio')} <span class="badge badge-pagada">PAGADA</span></h4>
            <p>${formatearFecha(r.fechaInicio)} - ${formatearFecha(r.fechaFin)}</p>
            <p style="font-size: 0.8rem; color: var(--gris-2);">
              Usuario: ${escaparHTML(r.usuarioNombre || r.usuarioId)}
              ${r.precioHora ? `- $${parseFloat(r.precioHora).toFixed(2)}/h` : ''}
            </p>
          </div>
          <div class="acciones">
            <button class="btn-primary" data-completar="${r.id}">Completar</button>
          </div>
        </div>
      `).join('');
    }

    cont.innerHTML = html;

    cont.querySelectorAll('[data-completar]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await confirmar('Completar esta reserva?', { titulo: 'Completar reserva', textoAceptar: 'Completar' })) return;
        try {
          await Admin.completarReserva(btn.dataset.completar);
          toast('Reserva completada.', 'success');
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

async function cargarReservasAdmin() {
  try {
    const resp = await Admin.listarReservas();
    const reservas = resp.datos || [];
    const cont = document.getElementById('admin-lista-reservas');
    if (reservas.length === 0) {
      cont.innerHTML = '<p style="color: var(--gris); padding: 0.5rem;">No hay reservas</p>';
      return;
    }
    cont.innerHTML = reservas.map(r => `
      <div class="lista-item">
        <div class="info">
          <h4>${escaparHTML(r.nombreEspacio || 'Espacio')} <span class="badge badge-${r.estado.toLowerCase()}">${r.estado}</span></h4>
          <p>${formatearFecha(r.fechaInicio)} - ${formatearFecha(r.fechaFin)}</p>
          <p style="font-size: 0.8rem; color: var(--gris-2);">
            Usuario: ${escaparHTML(r.usuarioNombre || r.usuarioId)}
            ${r.precioHora ? `- $${parseFloat(r.precioHora).toFixed(2)}/h` : ''}
          </p>
        </div>
        <div class="acciones">
          <select data-estado-reserva="${r.id}">
            <option value="PENDIENTE" ${r.estado === 'PENDIENTE' ? 'selected' : ''}>PENDIENTE</option>
            <option value="CONFIRMADA" ${r.estado === 'CONFIRMADA' ? 'selected' : ''}>CONFIRMADA</option>
            <option value="PAGADA" ${r.estado === 'PAGADA' ? 'selected' : ''}>PAGADA</option>
            <option value="COMPLETADA" ${r.estado === 'COMPLETADA' ? 'selected' : ''}>COMPLETADA</option>
            <option value="CANCELADA" ${r.estado === 'CANCELADA' ? 'selected' : ''}>CANCELADA</option>
          </select>
          <button class="btn-primary" data-guardar-reserva="${r.id}">Guardar</button>
        </div>
      </div>
    `).join('');

    cont.querySelectorAll('[data-guardar-reserva]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.guardarReserva;
        const sel = cont.querySelector(`[data-estado-reserva="${id}"]`);
        try {
          await Admin.actualizarEstadoReserva(id, sel.value);
          toast('Estado de reserva actualizado', 'success');
          cargarReservasAdmin();
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
    await cargarFacturasAdmin();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

async function cargarFacturasAdmin() {
  const cont = document.getElementById('admin-lista-facturas');
  cont.innerHTML = '';
  const resp = await Admin.listarFacturas();
  const facturas = resp.facturas || resp || [];
  if (facturas.length === 0) {
    cont.innerHTML = '<p style="color: var(--gris); padding: 0.5rem;">No hay facturas</p>';
    return;
  }
  cont.innerHTML = facturas.map(f => {
    const estado = String(f.estado || '').trim().toLowerCase();
    return `
    <div class="lista-item">
      <div class="info">
        <h4>${escaparHTML(f.nombre_espacio || 'Factura #' + f.id)} <span class="badge badge-${estado}">${estado}</span></h4>
        <p>${formatearFecha(f.fecha_inicio)} - ${formatearFecha(f.fecha_fin)}</p>
        <p style="font-size: 0.8rem; color: var(--gris-2);">
          Usuario: ${escaparHTML(f.usuario_nombre || f.usuario_id)} - Reserva: ${f.reserva_id}
        </p>
      </div>
      <div class="acciones">
        <select data-estado-factura="${f.id}">
          <option value="pendiente" ${estado === 'pendiente' ? 'selected' : ''}>pendiente</option>
          <option value="pagada" ${estado === 'pagada' ? 'selected' : ''}>pagada</option>
          <option value="cancelada" ${estado === 'cancelada' ? 'selected' : ''}>cancelada</option>
        </select>
        <button class="btn-primary" data-guardar-factura="${f.id}">Guardar</button>
      </div>
    </div>
  `;}).join('');

  cont.querySelectorAll('[data-guardar-factura]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.guardarFactura;
      const sel = cont.querySelector(`[data-estado-factura="${id}"]`);
      try {
        await Admin.actualizarEstadoFactura(id, sel.value);
        toast('Estado de factura actualizado', 'success');
        cargarFacturasAdmin();
      } catch (err) {
        toast('Error: ' + err.message, 'error');
      }
    });
  });
}

// Mantenimiento - Restablecer Base de Datos
document.getElementById('btn-reset-db').addEventListener('click', async () => {
  const confirmacion1 = await confirmar('¿Estás seguro de que deseas eliminar TODOS los datos del sistema? Esta acción es irreversible.', {
    titulo: '⚠️ ZONA DE PELIGRO: Restablecimiento de Datos',
    textoAceptar: 'Sí, continuar',
    peligro: true
  });
  if (!confirmacion1) return;

  const confirmacion2 = await confirmar('CONFIRMACIÓN DE SEGURIDAD REQUERIDA:\nSe eliminarán todas las facturas, reservas, espacios y cuentas de usuario (excepto la tuya). ¿Quieres proceder con la destrucción de datos?', {
    titulo: '🛑 CONFIRMACIÓN FINAL',
    textoAceptar: 'Destruir todos los datos',
    peligro: true
  });
  if (!confirmacion2) return;

  try {
    toast('Iniciando restablecimiento de datos...', 'info');
    const res = await Admin.resetearDatos();
    toast(res.mensaje, 'success');
    
    // Recargar la página después de un breve delay para que la UI se actualice
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  } catch (err) {
    toast('Error en el restablecimiento: ' + err.message, 'error');
  }
});


// ============================================================
// SEED: cargar datos de prueba desde UI
// ============================================================

// Helper: login que retorna token sin tocar Estado.token global
async function _loginUserSeed(email, password) {
  const r = await fetch(`${API.auth}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`Login ${email} fallo`);
  const d = await r.json();
  return d.token;
}

// Helper: crear reserva con un token especifico
async function _crearReservaSeed(token, body) {
  const r = await fetch(`${API.reservation}/reservas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) return null;
  return await r.json();
}

// Helper: ISO local YYYY-MM-DDTHH:MM:SS
function _isoFechaSeed(diasDelta, hora, minuto) {
  const d = new Date();
  d.setDate(d.getDate() + diasDelta);
  d.setHours(hora, minuto, 0, 0);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

async function ejecutarSeed() {
  const out = document.getElementById('seed-output');
  out.style.display = 'block';
  out.textContent = '';
  const log = (msg) => { out.textContent += msg + '\n'; out.scrollTop = out.scrollHeight; };

  try {
    log('==> Reset previo');
    await Admin.resetearDatos();
    log('  ok');

    // Espacios
    log('\n==> Creando 8 espacios');
    const espaciosData = [
      { nombre: 'Sala Apolo',      descripcion: 'Sala de juntas con proyector',   capacidad: 8,  precio_por_hora: 25.00 },
      { nombre: 'Sala Hermes',     descripcion: 'Sala chica para entrevistas',    capacidad: 4,  precio_por_hora: 15.00 },
      { nombre: 'Salon Olimpo',    descripcion: 'Salon grande para eventos',      capacidad: 30, precio_por_hora: 80.00 },
      { nombre: 'Oficina Atenea',  descripcion: 'Oficina privada con escritorio', capacidad: 2,  precio_por_hora: 18.00 },
      { nombre: 'Sala Zeus',       descripcion: 'Sala ejecutiva con TV 4K',       capacidad: 12, precio_por_hora: 40.00 },
      { nombre: 'Open Space Iris', descripcion: 'Coworking abierto',              capacidad: 20, precio_por_hora: 10.00 },
      { nombre: 'Sala Hades',      descripcion: 'Sala oscura para podcast',       capacidad: 6,  precio_por_hora: 35.00 },
      { nombre: 'Cabina Eco',      descripcion: 'Cabina insonorizada',            capacidad: 1,  precio_por_hora:  8.00 },
    ];
    const espacioIds = [];
    for (const e of espaciosData) {
      const r = await Admin.crearEspacio(e);
      espacioIds.push(r.id);
      log(`  + id=${r.id} ${e.nombre}`);
    }

    // Usuarios
    log('\n==> Creando 5 usuarios');
    const usuariosData = [
      { nombre: 'Maria Lopez',  email: 'maria@test.com',  password: 'maria123',  rol: 'usuario' },
      { nombre: 'Juan Perez',   email: 'juan@test.com',   password: 'juan123',   rol: 'usuario' },
      { nombre: 'Ana Garcia',   email: 'ana@test.com',    password: 'ana123',    rol: 'usuario' },
      { nombre: 'Carlos Ruiz',  email: 'carlos@test.com', password: 'carlos123', rol: 'usuario' },
      { nombre: 'Sofia Diaz',   email: 'sofia@test.com',  password: 'sofia123',  rol: 'admin' },
    ];
    for (const u of usuariosData) {
      const r = await Admin.crearUsuario(u);
      log(`  + id=${r.id} ${u.nombre} (${u.rol})`);
    }

    // Reservas
    log('\n==> Creando reservas variadas');
    const tMaria  = await _loginUserSeed('maria@test.com',  'maria123');
    const tJuan   = await _loginUserSeed('juan@test.com',   'juan123');
    const tAna    = await _loginUserSeed('ana@test.com',    'ana123');
    const tCarlos = await _loginUserSeed('carlos@test.com', 'carlos123');

    const reservasDefs = [
      [tMaria,  0, _isoFechaSeed(1, 9, 0),   _isoFechaSeed(1, 11, 0),  2, 'Reunion equipo'],
      [tMaria,  2, _isoFechaSeed(2, 14, 0),  _isoFechaSeed(2, 17, 0),  1, 'Evento urgente'],
      [tMaria,  4, _isoFechaSeed(5, 10, 30), _isoFechaSeed(5, 12, 30), 2, 'Demo cliente'],
      [tJuan,   1, _isoFechaSeed(1, 15, 0),  _isoFechaSeed(1, 16, 0),  2, 'Entrevista'],
      [tJuan,   3, _isoFechaSeed(3, 9, 0),   _isoFechaSeed(3, 13, 0),  3, 'Trabajo focalizado'],
      [tJuan,   5, _isoFechaSeed(4, 10, 0),  _isoFechaSeed(4, 18, 0),  2, 'Dia de coworking'],
      [tAna,    6, _isoFechaSeed(2, 16, 0),  _isoFechaSeed(2, 19, 0),  1, 'Grabacion podcast'],
      [tAna,    7, _isoFechaSeed(6, 11, 0),  _isoFechaSeed(6, 12, 0),  3, 'Llamada cliente'],
      [tAna,    0, _isoFechaSeed(3, 14, 0),  _isoFechaSeed(3, 16, 0),  2, 'Reunion clientes'],
      [tCarlos, 0, _isoFechaSeed(7, 9, 0),   _isoFechaSeed(7, 11, 0),  2, 'Planning sprint'],
      [tCarlos, 4, _isoFechaSeed(8, 14, 0),  _isoFechaSeed(8, 17, 0),  1, 'Junta directiva'],
      [tCarlos, 2, _isoFechaSeed(10, 10, 0), _isoFechaSeed(10, 18, 0), 2, 'Conferencia anual'],
      [tCarlos, 6, _isoFechaSeed(9, 12, 0),  _isoFechaSeed(9, 14, 0),  3, 'Podcast solo'],
    ];
    const reservas = [];  // [{id, token}]
    for (const [tok, espIdx, ini, fin, prio, notas] of reservasDefs) {
      const body = {
        espacioId: espacioIds[espIdx],
        fechaInicio: ini, fechaFin: fin,
        prioridad: prio, notas,
      };
      const r = await _crearReservaSeed(tok, body);
      if (r && r.id) {
        reservas.push({ id: r.id, token: tok });
        log(`  + reserva id=${r.id} esp=${espacioIds[espIdx]} prio=${prio}`);
      } else {
        log(`  ! fallo esp=${espacioIds[espIdx]}`);
      }
    }

    // Confirmar (admin)
    log('\n==> Confirmando reservas (URGENTES primero)');
    for (let i = 0; i < 7; i++) {
      try {
        const r = await Admin.confirmarSiguiente();
        log(`  + confirmada id=${r.id} (${r.prioridadNombre})`);
      } catch (e) { break; }
    }

    // Pagar 4 (los usuarios pagan sus propias)
    log('\n==> Pagando 4 reservas');
    for (const r of reservas.slice(0, 4)) {
      try {
        const resp = await fetch(`${API.reservation}/reservas/${r.id}/pagar`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${r.token}` },
        });
        if (resp.ok) {
          const d = await resp.json();
          log(`  + reserva ${r.id} -> ${d.estadoPago}`);
        }
      } catch (e) {}
    }

    // Completar 2 (admin)
    log('\n==> Completando 2 reservas pagadas');
    for (const r of reservas.slice(0, 2)) {
      try {
        const x = await Admin.completarReserva(r.id);
        log(`  + reserva ${r.id} -> ${x.estado}`);
      } catch (e) {}
    }

    // Cancelar 2
    log('\n==> Cancelando 2 reservas');
    for (const r of reservas.slice(-2)) {
      try {
        const resp = await fetch(`${API.reservation}/reservas/${r.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${r.token}` },
        });
        if (resp.ok) log(`  + reserva ${r.id} cancelada`);
      } catch (e) {}
    }

    log('\n========= COMPLETADO =========');
    log('Credenciales de prueba:');
    log('  maria@test.com / maria123');
    log('  juan@test.com  / juan123');
    log('  ana@test.com   / ana123');
    log('  carlos@test.com / carlos123');
    log('  sofia@test.com / sofia123 (admin)');

    toast('Datos de prueba cargados', 'success');
  } catch (err) {
    log('\nERROR: ' + err.message);
    toast('Error en seed: ' + err.message, 'error');
  }
}

document.getElementById('btn-seed-db').addEventListener('click', async () => {
  if (!await confirmar('Esto borrara los datos actuales y cargara 8 espacios, 5 usuarios y 13 reservas. Continuar?', {
    titulo: 'Inicializar datos de prueba',
    textoAceptar: 'Inicializar',
  })) return;
  const btn = document.getElementById('btn-seed-db');
  btn.disabled = true;
  btn.textContent = 'Cargando...';
  try {
    await ejecutarSeed();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Inicializar datos de prueba';
  }
});

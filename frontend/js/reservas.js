// Gestion de reservas
const Reservas = {

  async crear(datos) {
    return fetchAPI(`${API.reservation}/reservas`, {
      method: 'POST',
      body: JSON.stringify(datos),
    });
  },

  async misReservas() {
    return fetchAPI(`${API.reservation}/reservas/mis-reservas`);
  },

  async misEstadisticas() {
    return fetchAPI(`${API.reservation}/reservas/mis-estadisticas`);
  },

  async cancelar(id) {
    return fetchAPI(`${API.reservation}/reservas/${id}`, { method: 'DELETE' });
  },

  async facturar(id) {
    return fetchAPI(`${API.reservation}/reservas/${id}/facturar`, { method: 'POST' });
  },
};

// Horario de operacion (modificable)
const HORARIO_INICIO = 8;   // 08:00
const HORARIO_FIN    = 22;  // 22:00 (ultima franja: 21:30 + 30min)

let espacioSeleccionado = null;
let slotSeleccionado = null;  // string "HH:MM"

function pad(n) { return String(n).padStart(2, '0'); }

// Generar lista de franjas validas para una fecha
function generarSlots(fechaStr) {
  const slots = [];
  for (let h = HORARIO_INICIO; h < HORARIO_FIN; h++) {
    slots.push(`${pad(h)}:00`);
    slots.push(`${pad(h)}:30`);
  }
  return slots;
}

// Construir Date desde fecha YYYY-MM-DD + hora HH:MM
function combinarFechaHora(fechaStr, horaStr) {
  const [h, m] = horaStr.split(':').map(Number);
  const d = new Date(fechaStr + 'T00:00:00');
  d.setHours(h, m, 0, 0);
  return d;
}

// Date a string ISO local YYYY-MM-DDTHH:MM:SS (sin zona)
function aIsoLocal(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

function abrirModalReserva(espacio) {
  espacioSeleccionado = espacio;
  slotSeleccionado = null;
  document.getElementById('espacio-seleccionado').innerHTML = `
    <strong>${escaparHTML(espacio.nombre)}</strong><br>
    <span style="color: var(--gris); font-size: 0.9rem;">
      Capacidad ${espacio.capacidad} - $${espacio.precio_por_hora.toFixed(2)}/h
    </span>
  `;
  document.getElementById('modal-reserva').classList.remove('hidden');
  document.getElementById('reserva-error').textContent = '';
  document.getElementById('form-reserva').reset();

  // Default fecha = hoy
  const hoy = new Date();
  const fechaInput = document.querySelector('#form-reserva [name="fecha"]');
  fechaInput.value = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`;
  fechaInput.min = fechaInput.value;

  document.querySelector('#form-reserva [name="duracion"]').value = '1';

  renderSlots();
  actualizarResumen();
}

// Renderizar grid de slots para la fecha actual
function renderSlots() {
  const fechaStr = document.querySelector('#form-reserva [name="fecha"]').value;
  if (!fechaStr) return;

  const cont = document.getElementById('slots-inicio');
  const ahora = new Date();
  const slots = generarSlots(fechaStr);

  cont.innerHTML = slots.map(hora => {
    const slotDate = combinarFechaHora(fechaStr, hora);
    const esPasado = slotDate <= ahora;
    return `<div class="slot ${esPasado ? 'deshabilitado' : ''}" data-hora="${hora}">${hora}</div>`;
  }).join('');

  cont.querySelectorAll('.slot').forEach(s => {
    s.addEventListener('click', () => {
      if (s.classList.contains('deshabilitado')) return;
      cont.querySelectorAll('.slot.activo').forEach(x => x.classList.remove('activo'));
      s.classList.add('activo');
      slotSeleccionado = s.dataset.hora;
      actualizarResumen();
    });
  });

  // Si la franja seleccionada sigue siendo valida, marcarla
  if (slotSeleccionado) {
    const sel = cont.querySelector(`.slot[data-hora="${slotSeleccionado}"]`);
    if (sel && !sel.classList.contains('deshabilitado')) {
      sel.classList.add('activo');
    } else {
      slotSeleccionado = null;
    }
  }
}

function actualizarResumen() {
  const fechaStr = document.querySelector('#form-reserva [name="fecha"]').value;
  const duracion = parseInt(document.querySelector('#form-reserva [name="duracion"]').value) || 1;
  const resumen = document.getElementById('resumen-reserva');

  if (!fechaStr || !slotSeleccionado) {
    resumen.textContent = 'Selecciona fecha y hora';
    resumen.classList.remove('completo');
    return;
  }

  const inicio = combinarFechaHora(fechaStr, slotSeleccionado);
  const fin = new Date(inicio.getTime() + duracion * 60 * 60 * 1000);
  const precio = espacioSeleccionado.precio_por_hora * duracion;

  resumen.innerHTML = `
    Reservar <strong>${pad(inicio.getHours())}:${pad(inicio.getMinutes())}</strong>
    a <strong>${pad(fin.getHours())}:${pad(fin.getMinutes())}</strong>
    (${duracion}h) - Total: <strong>$${precio.toFixed(2)}</strong>
  `;
  resumen.classList.add('completo');
}

// Listeners del formulario
document.querySelector('#form-reserva [name="fecha"]').addEventListener('change', () => {
  slotSeleccionado = null;
  renderSlots();
  actualizarResumen();
});

document.querySelector('#form-reserva [name="duracion"]').addEventListener('change', actualizarResumen);

document.getElementById('cerrar-modal-reserva').addEventListener('click', () => {
  document.getElementById('modal-reserva').classList.add('hidden');
});

document.getElementById('form-reserva').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('reserva-error');
  errorEl.textContent = '';

  const fd = new FormData(e.target);
  const fechaStr = fd.get('fecha');
  const duracion = parseInt(fd.get('duracion'));

  if (!fechaStr || !slotSeleccionado) {
    errorEl.textContent = 'Selecciona fecha y hora de inicio';
    return;
  }

  const inicio = combinarFechaHora(fechaStr, slotSeleccionado);
  const fin = new Date(inicio.getTime() + duracion * 60 * 60 * 1000);

  if (inicio <= new Date()) {
    errorEl.textContent = 'La fecha de inicio debe ser en el futuro';
    return;
  }

  try {
    await Reservas.crear({
      espacioId: espacioSeleccionado.id,
      fechaInicio: aIsoLocal(inicio),
      fechaFin: aIsoLocal(fin),
      prioridad: parseInt(fd.get('prioridad')),
      notas: fd.get('notas') || null,
    });
    toast('Reserva creada exitosamente', 'success');
    document.getElementById('modal-reserva').classList.add('hidden');
    if (document.getElementById('page-reservas').classList.contains('active')) {
      cargarReservas();
    }
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

// Cache local de mis reservas para filtrar sin re-fetch
let reservasCache = [];

// Calcular duracion en horas
function duracionHoras(r) {
  const di = new Date(r.fechaInicio);
  const df = new Date(r.fechaFin);
  return Math.round((df - di) / 3600000);
}

// Filtrar segun selects
function filtrarReservas(reservas) {
  const sala     = document.getElementById('filtro-sala').value;
  const estado   = document.getElementById('filtro-estado').value;
  const dia      = document.getElementById('filtro-dia').value;
  const duracion = document.getElementById('filtro-duracion').value;

  return reservas.filter(r => {
    if (sala && (r.nombreEspacio || '') !== sala) return false;
    if (estado && r.estado !== estado) return false;
    if (dia) {
      const diaR = new Date(r.fechaInicio).toISOString().slice(0, 10);
      if (diaR !== dia) return false;
    }
    if (duracion) {
      const h = duracionHoras(r);
      if (duracion === '5+') { if (h < 5) return false; }
      else if (h !== parseInt(duracion)) return false;
    }
    return true;
  });
}

// Poblar select de salas con las unicas de las reservas
function poblarSalasFiltro(reservas) {
  const select = document.getElementById('filtro-sala');
  const actual = select.value;
  const salas = [...new Set(reservas.map(r => r.nombreEspacio).filter(Boolean))].sort();
  select.innerHTML = '<option value="">Todas</option>' +
    salas.map(s => `<option value="${escaparHTML(s)}">${escaparHTML(s)}</option>`).join('');
  if (actual && salas.includes(actual)) select.value = actual;
}

function renderReservas() {
  const cont = document.getElementById('lista-reservas');
  const filtradas = filtrarReservas(reservasCache);
  if (filtradas.length === 0) {
    const msg = reservasCache.length === 0
      ? 'No tienes reservas aun'
      : 'Ninguna reserva coincide con los filtros';
    cont.innerHTML = `<p style="color: var(--gris); text-align: center; padding: 2rem;">${msg}</p>`;
    return;
  }
  cont.innerHTML = filtradas.map(r => {
    const horas = duracionHoras(r);
    const precioH = parseFloat(r.precioHora) || 0;
    const subtotal = horas * precioH;
    const total = subtotal * 1.16; // con IVA 16%
    const puedeCancelar = ['PENDIENTE', 'CONFIRMADA'].includes(r.estado);
    const puedeFacturar = r.estado !== 'CANCELADA';
    return `
    <div class="lista-item">
      <div class="info">
        <h4>${escaparHTML(r.nombreEspacio || 'Espacio')} <span class="badge badge-${r.estado.toLowerCase()}">${r.estado}</span></h4>
        <p>${formatearFecha(r.fechaInicio)} - ${formatearFecha(r.fechaFin)} (${horas}h)</p>
        <p style="font-size: 0.85rem; color: var(--gris-2);">
          Precio/h: <strong style="color: var(--azul-claro-2);">$${precioH.toFixed(2)}</strong>
          - Subtotal: $${subtotal.toFixed(2)}
          - Total con IVA: <strong style="color: var(--azul-claro-2);">$${total.toFixed(2)}</strong>
        </p>
        <p style="font-size: 0.8rem; color: var(--gris-2);">Prioridad: ${r.prioridadNombre || 'NORMAL'}</p>
      </div>
      <div class="acciones">
        ${puedeFacturar ? `<button class="btn-primary" data-facturar="${r.id}">Facturar</button>` : ''}
        ${puedeCancelar ? `<button class="btn-danger" data-cancelar="${r.id}">Cancelar</button>` : ''}
      </div>
    </div>
  `;}).join('');

  cont.querySelectorAll('[data-cancelar]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!await confirmar('Cancelar esta reserva?', { titulo: 'Cancelar reserva', textoAceptar: 'Cancelar reserva', textoCancelar: 'Volver', peligro: true })) return;
      try {
        await Reservas.cancelar(btn.dataset.cancelar);
        toast('Reserva cancelada', 'success');
        cargarReservas();
      } catch (err) {
        toast('Error: ' + err.message, 'error');
      }
    });
  });

  cont.querySelectorAll('[data-facturar]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!await confirmar('Generar factura para esta reserva?', { titulo: 'Generar factura', textoAceptar: 'Facturar' })) return;
      try {
        await Reservas.facturar(btn.dataset.facturar);
        toast('Factura generada', 'success');
      } catch (err) {
        toast('Error: ' + err.message, 'error');
      }
    });
  });
}

// Listeners de filtros
['filtro-sala', 'filtro-estado', 'filtro-dia', 'filtro-duracion'].forEach(id => {
  document.getElementById(id).addEventListener('change', renderReservas);
});
document.getElementById('btn-limpiar-filtros').addEventListener('click', () => {
  document.getElementById('filtro-sala').value = '';
  document.getElementById('filtro-estado').value = '';
  document.getElementById('filtro-dia').value = '';
  document.getElementById('filtro-duracion').value = '';
  renderReservas();
});

async function cargarReservas() {
  try {
    const [reservas, stats] = await Promise.all([
      Reservas.misReservas(),
      Reservas.misEstadisticas().catch(() => null),
    ]);

    if (stats) {
      document.getElementById('reservas-stats').innerHTML = `
        <div class="stat-card">
          <div class="valor">${stats.total_reservas}</div>
          <div class="etiqueta">Total</div>
        </div>
        <div class="stat-card">
          <div class="valor">${stats.pendientes}</div>
          <div class="etiqueta">Pendientes</div>
        </div>
        <div class="stat-card">
          <div class="valor">${stats.confirmadas}</div>
          <div class="etiqueta">Confirmadas</div>
        </div>
        <div class="stat-card">
          <div class="valor">${stats.completadas}</div>
          <div class="etiqueta">Completadas</div>
        </div>
        <div class="stat-card">
          <div class="valor">${stats.horas_totales}</div>
          <div class="etiqueta">Horas totales</div>
        </div>
      `;
    }

    reservasCache = reservas || [];
    poblarSalasFiltro(reservasCache);
    renderReservas();

  } catch (err) {
    toast('Error al cargar reservas: ' + err.message, 'error');
  }
}

function formatearFecha(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('es', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

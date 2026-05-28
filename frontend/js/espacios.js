// Gestion de espacios
const Espacios = {

  paginaActual: 1,
  porPagina: 9,

  async listar(filtros = {}) {
    const params = new URLSearchParams({
      pagina: this.paginaActual,
      por_pagina: this.porPagina,
      ...filtros,
    });
    return fetchAPI(`${API.space}/espacios?${params}`);
  },

  async buscar(query, algoritmo = 'binaria') {
    const params = new URLSearchParams({ q: query, algoritmo });
    return fetchAPI(`${API.space}/espacios/buscar?${params}`);
  },

  async sugerir(prefijo) {
    if (!prefijo || prefijo.length < 2) return { sugerencias: [] };
    const params = new URLSearchParams({ q: prefijo, max: 8 });
    return fetchAPI(`${API.space}/espacios/sugerir?${params}`);
  },

  async crear(datos) {
    return fetchAPI(`${API.space}/espacios`, {
      method: 'POST',
      body: JSON.stringify(datos),
    });
  },

  async obtenerPorID(id) {
    return fetchAPI(`${API.space}/espacios/${id}`);
  },
};

function renderEspacios(lista) {
  const cont = document.getElementById('lista-espacios');
  if (!lista || lista.length === 0) {
    cont.innerHTML = '<p style="color: var(--gris); text-align: center; padding: 2rem;">No se encontraron espacios</p>';
    return;
  }
  cont.innerHTML = lista.map(e => `
    <div class="espacio-card" data-id="${e.id}">
      <h3>${escaparHTML(e.nombre)}</h3>
      <p class="descripcion">${escaparHTML(e.descripcion || 'Sin descripcion')}</p>
      <div class="meta">
        <span class="precio">$${e.precio_por_hora.toFixed(2)}/h</span>
        <span class="capacidad">Capacidad: ${e.capacidad}</span>
      </div>
      <div style="margin-top: 0.8rem;">
        <span class="badge ${e.disponible ? 'badge-disponible' : 'badge-no-disponible'}">
          ${e.disponible ? 'Disponible' : 'No disponible'}
        </span>
      </div>
    </div>
  `).join('');

  // Click para reservar
  cont.querySelectorAll('.espacio-card').forEach(card => {
    card.addEventListener('click', async () => {
      const id = parseInt(card.dataset.id);
      const espacio = lista.find(e => e.id === id);
      if (espacio && espacio.disponible) {
        abrirModalReserva(espacio);
      } else {
        toast('Este espacio no esta disponible', 'error');
      }
    });
  });
}

async function cargarEspacios() {
  try {
    const filtros = obtenerFiltrosEspacios();
    const datos = await Espacios.listar(filtros);
    const lista = datos.datos || datos;
    renderEspacios(lista);
    document.getElementById('esp-paginacion-info').textContent =
      `Pagina ${datos.pagina} de ${datos.total_paginas} (${datos.total} total)`;
  } catch (err) {
    toast('Error al cargar espacios: ' + err.message, 'error');
  }
}

function obtenerFiltrosEspacios() {
  const f = {};
  const cap = document.getElementById('filtro-capacidad').value;
  const orden = document.getElementById('filtro-orden').value;
  if (cap) f.capacidad_min = cap;
  if (orden) f.orden = orden;
  return f;
}

// Autocomplete con Trie
let sugerirTimeout;
document.getElementById('buscar-espacios').addEventListener('input', (e) => {
  clearTimeout(sugerirTimeout);
  const val = e.target.value.trim();
  sugerirTimeout = setTimeout(async () => {
    const ul = document.getElementById('sugerencias');
    if (val.length < 2) {
      ul.innerHTML = '';
      return;
    }
    try {
      const datos = await Espacios.sugerir(val);
      ul.innerHTML = datos.sugerencias.map(s =>
        `<li data-sug="${escaparHTML(s)}">${escaparHTML(s)}</li>`
      ).join('');
      ul.querySelectorAll('li').forEach(li => {
        li.addEventListener('click', async () => {
          document.getElementById('buscar-espacios').value = li.dataset.sug;
          ul.innerHTML = '';
          buscarYRenderizar(li.dataset.sug);
        });
      });
    } catch {}
  }, 200);
});

document.getElementById('buscar-espacios').addEventListener('blur', () => {
  setTimeout(() => { document.getElementById('sugerencias').innerHTML = ''; }, 200);
});

async function buscarYRenderizar(query) {
  try {
    const datos = await Espacios.buscar(query);
    renderEspacios(datos.resultados || []);
    document.getElementById('esp-paginacion-info').textContent =
      `Busqueda "${query}" (${datos.total} resultados) - ${datos.algoritmo}`;
  } catch (err) {
    toast('Error al buscar: ' + err.message, 'error');
  }
}

document.getElementById('btn-buscar').addEventListener('click', () => {
  const query = document.getElementById('buscar-espacios').value.trim();
  if (query) {
    buscarYRenderizar(query);
  } else {
    Espacios.paginaActual = 1;
    cargarEspacios();
  }
});

document.getElementById('esp-anterior').addEventListener('click', () => {
  if (Espacios.paginaActual > 1) {
    Espacios.paginaActual--;
    cargarEspacios();
  }
});

document.getElementById('esp-siguiente').addEventListener('click', () => {
  Espacios.paginaActual++;
  cargarEspacios();
});

function escaparHTML(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

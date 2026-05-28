// Gestion de facturas
const Facturas = {

  async misFacturas() {
    return fetchAPI(`${API.billing}/facturas/mis-facturas`);
  },

  async misEstadisticas() {
    return fetchAPI(`${API.billing}/facturas/mis-estadisticas`);
  },

  async pagar(id) {
    return fetchAPI(`${API.billing}/facturas/${id}/pagar`, { method: 'PATCH' });
  },
};

async function cargarFacturas() {
  try {
    const [resp, stats] = await Promise.all([
      Facturas.misFacturas(),
      Facturas.misEstadisticas().catch(() => null),
    ]);

    if (stats) {
      document.getElementById('facturas-stats').innerHTML = `
        <div class="stat-card">
          <div class="valor">${stats.total_facturas}</div>
          <div class="etiqueta">Total facturas</div>
        </div>
        <div class="stat-card">
          <div class="valor">$${stats.total_gastado.toFixed(2)}</div>
          <div class="etiqueta">Total gastado</div>
        </div>
        <div class="stat-card">
          <div class="valor">$${stats.promedio_factura.toFixed(2)}</div>
          <div class="etiqueta">Promedio</div>
        </div>
        <div class="stat-card">
          <div class="valor">${stats.pendientes}</div>
          <div class="etiqueta">Pendientes</div>
        </div>
        <div class="stat-card">
          <div class="valor">${stats.pagadas}</div>
          <div class="etiqueta">Pagadas</div>
        </div>
      `;
    }

    const facturas = resp.facturas || resp || [];
    const cont = document.getElementById('lista-facturas');
    if (!facturas || facturas.length === 0) {
      cont.innerHTML = '<p style="color: var(--gris); text-align: center; padding: 2rem;">No tienes facturas aun</p>';
      return;
    }
    cont.innerHTML = facturas.map(f => `
      <div class="lista-item">
        <div class="info">
          <h4>${escaparHTML(f.nombre_espacio || 'Factura #' + f.id)} <span class="badge badge-${f.estado}">${f.estado}</span></h4>
          <p>${formatearFecha(f.fecha_inicio)} - ${formatearFecha(f.fecha_fin)}</p>
          <p style="font-size: 0.85rem; color: var(--gris-2);">
            ${parseFloat(f.horas).toFixed(2)}h x $${parseFloat(f.precio_hora).toFixed(2)} = $${parseFloat(f.subtotal).toFixed(2)}
            + IVA $${parseFloat(f.impuesto).toFixed(2)}
          </p>
        </div>
        <div class="acciones">
          <span class="precio">$${parseFloat(f.total).toFixed(2)}</span>
          ${f.estado === 'pendiente' ? `<button class="btn-primary" data-pagar="${f.id}" data-total="${f.total}">Pagar</button>` : ''}
        </div>
      </div>
    `).join('');

    cont.querySelectorAll('[data-pagar]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.pagar;
        const total = parseFloat(btn.dataset.total).toFixed(2);
        if (!await confirmar(`¿Deseas pagar esta factura por $${total}?`, { titulo: 'Pagar Factura', textoAceptar: 'Pagar' })) return;
        try {
          await Facturas.pagar(id);
          toast('Factura pagada con éxito', 'success');
          cargarFacturas();
        } catch (err) {
          toast('Error: ' + err.message, 'error');
        }
      });
    });

  } catch (err) {
    toast('Error al cargar facturas: ' + err.message, 'error');
  }
}

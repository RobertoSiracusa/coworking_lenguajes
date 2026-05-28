// Ordenar copia por campo numerico
function ordenar_facturas(facturas, campo = 'total', direccion = 'desc') {
  const copia = [...facturas];
  copia.sort((a, b) => {
    const va = parseFloat(a[campo]) || 0;
    const vb = parseFloat(b[campo]) || 0;
    return direccion === 'asc' ? va - vb : vb - va;
  });
  return copia;
}

// O(n) - agrupar por espacio_id con hash map
function agrupar_por_espacio(facturas) {
  const grupos = {};
  for (const f of facturas) {
    const key = f.espacio_id;
    if (!grupos[key]) {
      grupos[key] = {
        espacio_id:     f.espacio_id,
        nombre_espacio: f.nombre_espacio,
        total_facturas: 0,
        total_horas:    0,
        total_ingresos: 0,
        promedio_total: 0,
      };
    }
    grupos[key].total_facturas++;
    grupos[key].total_horas    += parseFloat(f.horas);
    grupos[key].total_ingresos += parseFloat(f.total);
  }
  return Object.values(grupos).map(g => ({
    ...g,
    total_horas:    Math.round(g.total_horas * 100) / 100,
    total_ingresos: Math.round(g.total_ingresos * 100) / 100,
    promedio_total: Math.round(g.total_ingresos / g.total_facturas * 100) / 100,
  }));
}

// O(n) - agrupar por usuario_id
function agrupar_por_usuario(facturas) {
  const grupos = {};
  for (const f of facturas) {
    const key = f.usuario_id;
    if (!grupos[key]) {
      grupos[key] = {
        usuario_id:     f.usuario_id,
        total_facturas: 0,
        total_gastado:  0,
        total_horas:    0,
      };
    }
    grupos[key].total_facturas++;
    grupos[key].total_gastado += parseFloat(f.total);
    grupos[key].total_horas   += parseFloat(f.horas);
  }
  return Object.values(grupos).map(g => ({
    ...g,
    total_gastado: Math.round(g.total_gastado * 100) / 100,
    total_horas:   Math.round(g.total_horas * 100) / 100,
  }));
}

// O(n) - ventana deslizante por mes
function ingresos_por_mes(facturas, meses = 6) {
  const ahora = new Date();
  const resultado = [];

  // Crear las m ventanas mensuales
  for (let i = meses - 1; i >= 0; i--) {
    const fecha = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    resultado.push({
      anio:           fecha.getFullYear(),
      mes:            fecha.getMonth() + 1,
      label:          fecha.toLocaleDateString('es', { month: 'short', year: 'numeric' }),
      total_facturas: 0,
      total_ingresos: 0,
    });
  }

  // Una sola pasada acumulando en la ventana correspondiente
  for (const f of facturas) {
    const fecha = new Date(f.creado_en);
    const anio  = fecha.getFullYear();
    const mes   = fecha.getMonth() + 1;
    const ventana = resultado.find(r => r.anio === anio && r.mes === mes);
    if (ventana) {
      ventana.total_facturas++;
      ventana.total_ingresos += parseFloat(f.total);
    }
  }

  return resultado.map(r => ({
    ...r,
    total_ingresos: Math.round(r.total_ingresos * 100) / 100,
  }));
}

// IVA 16%
const IVA = 0.16;

// O(1) - calcula horas, subtotal, impuesto, total
function calcular_factura({ fecha_inicio, fecha_fin, precio_hora }) {
  const inicio   = new Date(fecha_inicio);
  const fin      = new Date(fecha_fin);
  const horas    = (fin - inicio) / (1000 * 60 * 60);
  const subtotal = Math.round(horas * precio_hora * 100) / 100;
  const impuesto = Math.round(subtotal * IVA * 100) / 100;
  const total    = Math.round((subtotal + impuesto) * 100) / 100;
  return { horas: Math.round(horas * 100) / 100, subtotal, impuesto, total };
}

module.exports = {
  ordenar_facturas,
  agrupar_por_espacio,
  agrupar_por_usuario,
  ingresos_por_mes,
  calcular_factura,
};

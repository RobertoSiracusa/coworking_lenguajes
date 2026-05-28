const express = require('express');
const router  = express.Router();
const { pool } = require('../db');
const { solo_admin } = require('../middleware/auth');
const {
  agrupar_por_espacio,
  agrupar_por_usuario,
  ingresos_por_mes,
  ordenar_facturas,
} = require('../algorithm/reportes');
const { cache_reportes } = require('../estructuras/cache_lru');

// Helper para usar el cache LRU de reportes
async function _con_cache(clave, productor) {
  const cacheado = cache_reportes.get(clave);
  if (cacheado) return { datos: cacheado, cacheado: true };
  const datos = await productor();
  cache_reportes.put(clave, datos);
  return { datos, cacheado: false };
}

// GET /reportes/resumen - dashboard
router.get('/resumen', solo_admin, async (req, res) => {
  const result = await pool.query('SELECT * FROM facturas');
  const facturas = result.rows;

  const total_facturas = facturas.length;
  const total_ingresos = facturas.reduce((s, f) => s + parseFloat(f.total), 0);
  const facturas_hoy   = facturas.filter(f =>
    new Date(f.creado_en).toDateString() === new Date().toDateString()
  ).length;
  const pendientes = facturas.filter(f => f.estado === 'pendiente').length;

  res.json({
    total_facturas,
    total_ingresos:   Math.round(total_ingresos * 100) / 100,
    facturas_hoy,
    pendientes_pago:  pendientes,
    promedio_factura: total_facturas > 0
      ? Math.round((total_ingresos / total_facturas) * 100) / 100
      : 0,
  });
});

// GET /reportes/por-espacio - agrupar con cache LRU
router.get('/por-espacio', solo_admin, async (req, res) => {
  const { orden = 'total_ingresos', dir = 'desc' } = req.query;
  const clave = `por-espacio:${orden}:${dir}`;

  const { datos, cacheado } = await _con_cache(clave, async () => {
    const result = await pool.query('SELECT * FROM facturas');
    const agrupado = agrupar_por_espacio(result.rows);
    return ordenar_facturas(agrupado, orden, dir);
  });

  res.json({
    algoritmo:    'agrupamiento O(n) + ordenamiento O(n log n)',
    cacheado,
    total_grupos: datos.length,
    espacios:     datos,
  });
});

// GET /reportes/por-usuario - agrupar con cache LRU
router.get('/por-usuario', solo_admin, async (req, res) => {
  const { orden = 'total_gastado', dir = 'desc' } = req.query;
  const clave = `por-usuario:${orden}:${dir}`;

  const { datos, cacheado } = await _con_cache(clave, async () => {
    const result = await pool.query('SELECT * FROM facturas');
    const agrupado = agrupar_por_usuario(result.rows);
    return ordenar_facturas(agrupado, orden, dir);
  });

  res.json({
    algoritmo:      'agrupamiento O(n) + ordenamiento O(n log n)',
    cacheado,
    total_usuarios: datos.length,
    usuarios:       datos,
  });
});

// GET /reportes/ingresos-mensuales - ventana deslizante
router.get('/ingresos-mensuales', solo_admin, async (req, res) => {
  const meses = parseInt(req.query.meses) || 6;
  const result = await pool.query('SELECT * FROM facturas ORDER BY creado_en ASC');
  const datos = ingresos_por_mes(result.rows, meses);

  const ultimo    = datos[datos.length - 1]?.total_ingresos || 0;
  const penultimo = datos[datos.length - 2]?.total_ingresos || 0;
  const tendencia = penultimo > 0
    ? Math.round(((ultimo - penultimo) / penultimo) * 100)
    : 0;

  res.json({
    algoritmo:     'ventana deslizante O(n)',
    meses,
    tendencia_pct: tendencia,
    datos,
  });
});

// GET /reportes/top-espacios - top N rentables
router.get('/top-espacios', solo_admin, async (req, res) => {
  const top = parseInt(req.query.top) || 5;
  const result = await pool.query('SELECT * FROM facturas');
  const agrupado = agrupar_por_espacio(result.rows);
  const ordenado = ordenar_facturas(agrupado, 'total_ingresos', 'desc');
  const top_n = ordenado.slice(0, top);

  res.json({
    algoritmo: 'agrupamiento O(n) + ordenamiento O(n log n) + slice O(k)',
    top,
    espacios:  top_n,
  });
});

module.exports = router;

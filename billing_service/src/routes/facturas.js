const express = require('express');
const router  = express.Router();
const { pool } = require('../db');
const { solo_admin } = require('../middleware/auth');
const { calcular_factura, ordenar_facturas } = require('../algorithm/reportes');
const { busqueda_lineal, busqueda_binaria }  = require('../algorithm/busqueda');
const { validar_usuario_existe, enriquecer_facturas } = require('../servicios/auth_client');
const { marcar_reserva_pagada } = require('../servicios/reservation_client');

// Construir WHERE dinamico con filtros
function _construir_filtros(base_params, { estado, desde, hasta }) {
  const condiciones = [];
  const valores = [...base_params];
  let idx = base_params.length + 1;

  if (estado) {
    condiciones.push(`estado = $${idx++}`);
    valores.push(estado);
  }
  if (desde) {
    condiciones.push(`creado_en >= $${idx++}`);
    valores.push(desde);
  }
  if (hasta) {
    condiciones.push(`creado_en <= $${idx++}`);
    valores.push(hasta);
  }
  return { condiciones, valores };
}

// Paginar array en memoria
function _paginar(items, pagina, por_pagina) {
  const p = Math.max(1, parseInt(pagina) || 1);
  const pp = Math.max(1, Math.min(100, parseInt(por_pagina) || 20));
  const total = items.length;
  const total_paginas = Math.ceil(total / pp);
  const inicio = (p - 1) * pp;
  return {
    datos: items.slice(inicio, inicio + pp),
    meta: { pagina: p, por_pagina: pp, total, total_paginas },
  };
}

// POST /facturas - crear factura (admin o dueño de la reserva)
router.post('/', async (req, res) => {
  const {
    reserva_id, usuario_id, espacio_id,
    nombre_espacio, fecha_inicio, fecha_fin, precio_hora,
  } = req.body;

  if (!reserva_id || !usuario_id || !espacio_id || !fecha_inicio || !fecha_fin || !precio_hora) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  // Permitir si admin o si esta facturando su propia reserva
  const esAdmin = req.rol === 'admin';
  const esPropia = parseInt(usuario_id) === req.usuario_id;
  if (!esAdmin && !esPropia) {
    return res.status(403).json({ error: 'Solo puedes facturar tus propias reservas' });
  }

  // Validar usuario existe (solo si es admin, para evitar fetch costoso para user normal)
  if (esAdmin) {
    const existe = await validar_usuario_existe(usuario_id, req.token);
    if (!existe) {
      return res.status(404).json({ error: 'Usuario no existe en auth service' });
    }
  }

  const { horas, subtotal, impuesto, total } = calcular_factura({
    fecha_inicio, fecha_fin, precio_hora,
  });

  try {
    const result = await pool.query(
      `INSERT INTO facturas
        (reserva_id, usuario_id, espacio_id, nombre_espacio,
         fecha_inicio, fecha_fin, horas, precio_hora,
         subtotal, impuesto, total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [reserva_id, usuario_id, espacio_id, nombre_espacio,
       fecha_inicio, fecha_fin, horas, precio_hora,
       subtotal, impuesto, total]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Esta reserva ya tiene una factura' });
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /facturas/mis-facturas - filtros + paginacion
router.get('/mis-facturas', async (req, res) => {
  const { orden = 'creado_en', dir = 'desc', pagina, por_pagina, estado, desde, hasta } = req.query;

  const { condiciones, valores } = _construir_filtros([req.usuario_id], { estado, desde, hasta });
  const where_extra = condiciones.length > 0 ? ' AND ' + condiciones.join(' AND ') : '';

  const result = await pool.query(
    `SELECT * FROM facturas WHERE usuario_id = $1${where_extra}`,
    valores,
  );

  const ordenadas = ordenar_facturas(result.rows, orden, dir);
  const { datos, meta } = _paginar(ordenadas, pagina, por_pagina);
  res.json({ ...meta, facturas: datos });
});

// GET /facturas/mis-estadisticas - resumen del usuario autenticado
router.get('/mis-estadisticas', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM facturas WHERE usuario_id = $1',
    [req.usuario_id],
  );
  const facturas = result.rows;
  const total_facturas = facturas.length;
  const total_gastado  = facturas.reduce((s, f) => s + parseFloat(f.total), 0);
  const pendientes     = facturas.filter(f => f.estado === 'pendiente').length;
  const pagadas        = facturas.filter(f => f.estado === 'pagada').length;
  const canceladas     = facturas.filter(f => f.estado === 'cancelada').length;

  res.json({
    usuario_id:       req.usuario_id,
    total_facturas,
    total_gastado:    Math.round(total_gastado * 100) / 100,
    promedio_factura: total_facturas > 0
      ? Math.round((total_gastado / total_facturas) * 100) / 100
      : 0,
    pendientes,
    pagadas,
    canceladas,
  });
});

// GET /facturas/buscar-fecha - lineal vs binaria
router.get('/buscar-fecha', solo_admin, async (req, res) => {
  const { fecha, algoritmo = 'binaria' } = req.query;
  if (!fecha) return res.status(400).json({ error: 'Parametro fecha requerido' });

  const result = await pool.query('SELECT * FROM facturas');
  let resultados;
  let nombre_algoritmo;

  if (algoritmo === 'lineal') {
    resultados = busqueda_lineal(result.rows, fecha);
    nombre_algoritmo = 'lineal O(n)';
  } else {
    resultados = busqueda_binaria(result.rows, fecha);
    nombre_algoritmo = 'binaria O(n log n) sort + O(log n) busqueda';
  }

  res.json({
    fecha,
    algoritmo: nombre_algoritmo,
    total: resultados.length,
    resultados,
  });
});

// GET /facturas/:id - detalle (usuario ve solo las suyas, admin ve todas)
router.get('/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM facturas WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Factura no encontrada' });
  }
  const factura = result.rows[0];
  if (req.rol !== 'admin' && factura.usuario_id !== req.usuario_id) {
    return res.status(403).json({ error: 'No tienes permiso para ver esta factura' });
  }
  res.json(factura);
});

// GET /facturas - listar todas (admin) con filtros, paginacion y enriquecidas
router.get('/', solo_admin, async (req, res) => {
  const { orden = 'creado_en', dir = 'desc', pagina, por_pagina, estado, desde, hasta } = req.query;

  const { condiciones, valores } = _construir_filtros([], { estado, desde, hasta });
  const where_clause = condiciones.length > 0 ? 'WHERE ' + condiciones.join(' AND ') : '';

  const result = await pool.query(`SELECT * FROM facturas ${where_clause}`, valores);
  const ordenadas = ordenar_facturas(result.rows, orden, dir);
  const enriquecidas = await enriquecer_facturas(ordenadas, req.token);
  const { datos, meta } = _paginar(enriquecidas, pagina, por_pagina);
  res.json({ ...meta, facturas: datos });
});

// PUT /facturas/:id - editar campos de una factura
router.put('/:id', solo_admin, async (req, res) => {
  const actual = await pool.query('SELECT * FROM facturas WHERE id = $1', [req.params.id]);
  if (actual.rows.length === 0) {
    return res.status(404).json({ error: 'Factura no encontrada' });
  }
  const estadoAnterior = actual.rows[0].estado;

  const campos_validos = [
    'nombre_espacio', 'fecha_inicio', 'fecha_fin',
    'horas', 'precio_hora', 'subtotal', 'impuesto', 'total', 'estado',
  ];
  const updates = [];
  const valores = [];
  let idx = 1;

  for (const campo of campos_validos) {
    if (req.body[campo] !== undefined) {
      updates.push(`${campo} = $${idx++}`);
      valores.push(req.body[campo]);
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Nada para actualizar' });
  }

  valores.push(req.params.id);
  const result = await pool.query(
    `UPDATE facturas SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    valores,
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Factura no encontrada' });
  }
  const factura = result.rows[0];
  if (req.body.estado === 'pagada' && estadoAnterior !== 'pagada') {
    const ok = await marcar_reserva_pagada(factura.reserva_id, req.token);
    if (!ok) {
      await pool.query(
        'UPDATE facturas SET estado = $1 WHERE id = $2',
        [estadoAnterior, factura.id],
      ).catch(() => {});
      return res.status(502).json({ error: 'No se pudo actualizar la reserva como pagada' });
    }
  }
  res.json(factura);
});

// PATCH /facturas/:id/pagar - marcar como pagada
router.patch('/:id/pagar', async (req, res) => {
  const result = await pool.query('SELECT * FROM facturas WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Factura no encontrada' });
  }
  const factura = result.rows[0];
  const esAdmin = req.rol === 'admin';
  const esPropia = factura.usuario_id === req.usuario_id;
  if (!esAdmin && !esPropia) {
    return res.status(403).json({ error: 'No tienes permiso para pagar esta factura' });
  }
  if (factura.estado !== 'pendiente') {
    return res.status(409).json({ error: 'Solo se pueden pagar facturas pendientes' });
  }

  const actualizado = await pool.query(
    `UPDATE facturas SET estado = 'pagada' WHERE id = $1 RETURNING *`,
    [req.params.id],
  );
  const facturaPagada = actualizado.rows[0];

  const ok = await marcar_reserva_pagada(facturaPagada.reserva_id, req.token);
  if (!ok) {
    await pool.query(
      'UPDATE facturas SET estado = $1 WHERE id = $2',
      [factura.estado, facturaPagada.id],
    ).catch(() => {});
    return res.status(502).json({ error: 'No se pudo actualizar la reserva como pagada' });
  }
  res.json(facturaPagada);
});

// PATCH /facturas/:id/cancelar - marcar como cancelada
router.patch('/:id/cancelar', solo_admin, async (req, res) => {
  const result = await pool.query(
    `UPDATE facturas SET estado = 'cancelada' WHERE id = $1 RETURNING *`,
    [req.params.id],
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Factura no encontrada' });
  }
  res.json(result.rows[0]);
});

// DELETE /facturas/reset - admin deletes all invoices y vacia caches
router.delete('/reset', solo_admin, async (req, res) => {
  try {
    await pool.query('DELETE FROM facturas');
    // Invalidar caches: los reportes cacheados ya no son validos
    const { cache_usuarios, cache_reportes } = require('../estructuras/cache_lru');
    cache_reportes.vaciar();
    cache_usuarios.vaciar();
    res.json({ mensaje: 'Todas las facturas han sido eliminadas y caches vaciados' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /facturas/:id - borrado fisico
router.delete('/:id', solo_admin, async (req, res) => {
  const result = await pool.query(
    'DELETE FROM facturas WHERE id = $1 RETURNING *',
    [req.params.id],
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Factura no encontrada' });
  }
  res.json({ mensaje: 'Factura eliminada', factura: result.rows[0] });
});

module.exports = router;

// Comparar misma fecha (ignora hora)
function _misma_fecha(d1, d2) {
  const a = new Date(d1);
  const b = new Date(d2);
  return a.getUTCFullYear() === b.getUTCFullYear()
      && a.getUTCMonth()    === b.getUTCMonth()
      && a.getUTCDate()     === b.getUTCDate();
}

// O(n) - recorre todas las facturas
function busqueda_lineal(facturas, fecha) {
  const resultado = [];
  for (const f of facturas) {
    if (_misma_fecha(f.fecha_inicio, fecha)) resultado.push(f);
  }
  return resultado;
}

// Inicio del dia en UTC
function _inicio_dia(fecha) {
  const d = new Date(fecha);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
}

// Inicio del dia siguiente
function _inicio_dia_siguiente(fecha) {
  const d = _inicio_dia(fecha);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

// Primer indice >= objetivo
function _lower_bound(arr, objetivo) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (new Date(arr[mid].fecha_inicio) < objetivo) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// O(n log n) sort + O(log n) busqueda de rango
function busqueda_binaria(facturas, fecha) {
  if (facturas.length === 0) return [];
  // Copiar y ordenar por fecha_inicio
  const ordenadas = [...facturas].sort(
    (a, b) => new Date(a.fecha_inicio) - new Date(b.fecha_inicio)
  );
  const inicio = _inicio_dia(fecha);
  const fin    = _inicio_dia_siguiente(fecha);
  const idx_lo = _lower_bound(ordenadas, inicio);
  const idx_hi = _lower_bound(ordenadas, fin);
  return ordenadas.slice(idx_lo, idx_hi);
}

module.exports = { busqueda_lineal, busqueda_binaria };

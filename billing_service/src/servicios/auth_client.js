const axios = require('axios');
const { cache_usuarios } = require('../estructuras/cache_lru');

const AUTH_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:8001';

// Obtener usuario por id. Requiere JWT admin para listar.
async function obtener_usuario(id, jwt) {
  const cacheado = cache_usuarios.get(id);
  if (cacheado) return cacheado;

  try {
    const resp = await axios.get(`${AUTH_URL}/usuarios`, {
      headers: { Authorization: `Bearer ${jwt}` },
      timeout: 3000,
    });
    const usuarios = resp.data || [];
    // Cachear todos los usuarios devueltos
    for (const u of usuarios) cache_usuarios.put(u.id, u);
    return cache_usuarios.get(id);
  } catch (err) {
    console.error('Error al consultar auth service:', err.message);
    return null;
  }
}

// Validar existencia del usuario
async function validar_usuario_existe(id, jwt) {
  const u = await obtener_usuario(id, jwt);
  return u !== null && u !== undefined;
}

// Enriquecer facturas con nombre y email del usuario
async function enriquecer_facturas(facturas, jwt) {
  // Precargar usuarios faltantes con una sola llamada
  const faltantes = facturas.filter(f => !cache_usuarios.get(f.usuario_id));
  if (faltantes.length > 0) {
    await obtener_usuario(faltantes[0].usuario_id, jwt);
  }
  return facturas.map(f => {
    const u = cache_usuarios.get(f.usuario_id);
    return {
      ...f,
      usuario_nombre: u ? u.nombre : null,
      usuario_email:  u ? u.email  : null,
    };
  });
}

module.exports = { obtener_usuario, validar_usuario_existe, enriquecer_facturas };

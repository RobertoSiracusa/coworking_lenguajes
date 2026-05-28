const jwt = require('jsonwebtoken');

// Verifica el JWT autocontenido emitido por auth service
function verificar_jwt(req, res, next) {
  // Dejar pasar preflight CORS
  if (req.method === 'OPTIONS') return next();

  const header = req.headers['authorization'];

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const token = header.substring(7);

  try {
    const payload = jwt.verify(token, process.env.SECRET_KEY);
    req.usuario_id = parseInt(payload.sub);
    req.rol        = payload.rol;
    req.token      = token;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalido o expirado' });
  }
}

// Restringe acceso a rol admin
function solo_admin(req, res, next) {
  if (req.rol !== 'admin') {
    return res.status(403).json({
      error: 'Solo administradores pueden realizar esta accion'
    });
  }
  next();
}

module.exports = { verificar_jwt, solo_admin };

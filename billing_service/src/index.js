require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { inicializar_bd } = require('./db');
const { verificar_jwt, solo_admin } = require('./middleware/auth');
const facturas_router = require('./routes/facturas');
const reportes_router = require('./routes/reportes');
const { cache_usuarios, cache_reportes } = require('./estructuras/cache_lru');

const app  = express();
const PORT = process.env.PORT || 8004;

// Middleware global
app.use(cors());
app.use(express.json());

// Health publico
app.get('/health', (req, res) => {
  res.json({
    servicio: 'billing-service',
    estado:   'funcionando',
    puerto:   PORT,
  });
});

// JWT obligatorio para todo lo demas
app.use(verificar_jwt);

app.use('/facturas', facturas_router);
app.use('/reportes', reportes_router);

// Stats del cache LRU (admin)
app.get('/cache/estadisticas', solo_admin, (req, res) => {
  res.json({
    estructura: 'Cache LRU (doubly linked list + hash map)',
    complejidad: { get: 'O(1)', put: 'O(1)' },
    cache_usuarios: cache_usuarios.estadisticas(),
    cache_reportes: cache_reportes.estadisticas(),
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: `Ruta ${req.method} ${req.path} no encontrada` });
});

// Errores globales
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Error interno del servidor' });
});

async function arrancar() {
  try {
    await inicializar_bd();
    app.listen(PORT, () => {
      console.log(`Billing Service corriendo en :${PORT}`);
    });
  } catch (err) {
    console.error('Error al arrancar:', err.message);
    process.exit(1);
  }
}

arrancar();

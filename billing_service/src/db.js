const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Crear tabla si no existe
async function inicializar_bd() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS facturas (
      id             SERIAL PRIMARY KEY,
      reserva_id     INTEGER NOT NULL UNIQUE,
      usuario_id     INTEGER NOT NULL,
      espacio_id     INTEGER NOT NULL,
      nombre_espacio VARCHAR(100),
      fecha_inicio   TIMESTAMP NOT NULL,
      fecha_fin      TIMESTAMP NOT NULL,
      horas          DECIMAL(5,2) NOT NULL,
      precio_hora    DECIMAL(10,2) NOT NULL,
      subtotal       DECIMAL(10,2) NOT NULL,
      impuesto       DECIMAL(10,2) NOT NULL,
      total          DECIMAL(10,2) NOT NULL,
      estado         VARCHAR(20) DEFAULT 'pendiente',
      creado_en      TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('Tabla facturas lista');
}

module.exports = { pool, inicializar_bd };

const axios = require('axios');

const RESERVATION_URL = process.env.RESERVATION_SERVICE_URL || 'http://reservation-service:8003';

async function marcar_reserva_pagada(reserva_id, jwt) {
  try {
    await axios.patch(`${RESERVATION_URL}/reservas/${reserva_id}/pagar`, null, {
      headers: { Authorization: `Bearer ${jwt}` },
      timeout: 3000,
    });
    return true;
  } catch (err) {
    console.error('Error al actualizar reserva:', err.message);
    return false;
  }
}

module.exports = { marcar_reserva_pagada };

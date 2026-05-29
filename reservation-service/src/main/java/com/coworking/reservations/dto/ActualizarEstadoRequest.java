package com.coworking.reservations.dto;

import com.coworking.reservations.model.Reserva;
import jakarta.validation.constraints.NotNull;

public class ActualizarEstadoRequest {

    @NotNull(message = "El estado es obligatorio")
    private Reserva.EstadoReserva estado;

    public Reserva.EstadoReserva getEstado() { return estado; }
    public void setEstado(Reserva.EstadoReserva estado) { this.estado = estado; }
}

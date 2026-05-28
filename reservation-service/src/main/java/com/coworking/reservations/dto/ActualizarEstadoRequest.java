package com.coworking.reservations.dto;

import com.coworking.reservations.model.Reserva;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class ActualizarEstadoRequest {

    @NotNull(message = "El estado es obligatorio")
    private Reserva.EstadoReserva estado;
}

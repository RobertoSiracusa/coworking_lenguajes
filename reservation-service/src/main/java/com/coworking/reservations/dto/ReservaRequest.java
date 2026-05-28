package com.coworking.reservations.dto;

import jakarta.validation.constraints.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ReservaRequest {

    @NotNull(message = "El espacio es obligatorio")
    private Long espacioId;

    @NotNull(message = "La fecha de inicio es obligatoria")
    @Future(message = "La fecha de inicio debe ser en el futuro")
    private LocalDateTime fechaInicio;

    @NotNull(message = "La fecha de fin es obligatoria")
    private LocalDateTime fechaFin;

    @Min(value = 1, message = "Prioridad minima es 1 (URGENTE)")
    @Max(value = 3, message = "Prioridad maxima es 3 (FLEXIBLE)")
    private Integer prioridad = 2;

    private String notas;
}

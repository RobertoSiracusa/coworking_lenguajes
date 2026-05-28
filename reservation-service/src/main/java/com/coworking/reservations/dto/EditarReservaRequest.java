package com.coworking.reservations.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.Data;
import java.time.LocalDateTime;

@Data
public class EditarReservaRequest {

    private LocalDateTime fechaInicio;
    private LocalDateTime fechaFin;

    @Min(value = 1)
    @Max(value = 3)
    private Integer prioridad;

    private String notas;
}

package com.coworking.reservations.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.math.BigDecimal;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class EspacioDto {
    private Long id;
    private String nombre;
    private String descripcion;
    private Integer capacidad;

    @JsonProperty("precio_por_hora")
    private BigDecimal precioPorHora;

    private Boolean disponible;
}

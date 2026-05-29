package com.coworking.reservations.dto;

import com.coworking.reservations.model.Reserva;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class ReservaResponse {

    private Long id;
    private Long usuarioId;
    private String usuarioNombre;
    private String usuarioEmail;
    private Long espacioId;
    private String nombreEspacio;
    private BigDecimal precioHora;
    private LocalDateTime fechaInicio;
    private LocalDateTime fechaFin;
    private Reserva.EstadoReserva estado;
    private Reserva.EstadoPago estadoPago;
    private Integer prioridad;
    private String prioridadNombre;
    private LocalDateTime creadoEn;
    private String notas;

    // Factory: entidad a DTO
    public static ReservaResponse desde(Reserva r) {
        ReservaResponse dto = new ReservaResponse();
        dto.setId(r.getId());
        dto.setUsuarioId(r.getUsuarioId());
        dto.setEspacioId(r.getEspacioId());
        dto.setNombreEspacio(r.getNombreEspacio());
        dto.setPrecioHora(r.getPrecioHora());
        dto.setFechaInicio(r.getFechaInicio());
        dto.setFechaFin(r.getFechaFin());
        dto.setEstado(r.getEstado());
        dto.setEstadoPago(r.getEstadoPago());
        dto.setPrioridad(r.getPrioridad());
        dto.setPrioridadNombre(switch (r.getPrioridad()) {
            case 1  -> "URGENTE";
            case 2  -> "NORMAL";
            case 3  -> "FLEXIBLE";
            default -> "NORMAL";
        });
        dto.setCreadoEn(r.getCreadoEn());
        dto.setNotas(r.getNotas());
        return dto;
    }
}

package com.coworking.reservations.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "reservas")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Reserva {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "usuario_id", nullable = false)
    private Long usuarioId;

    @Column(name = "espacio_id", nullable = false)
    private Long espacioId;

    @Column(name = "nombre_espacio")
    private String nombreEspacio;

    // Precio por hora copiado del space service - usado por billing
    @Column(name = "precio_hora")
    private BigDecimal precioHora;

    @Column(name = "fecha_inicio", nullable = false)
    private LocalDateTime fechaInicio;

    @Column(name = "fecha_fin", nullable = false)
    private LocalDateTime fechaFin;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private EstadoReserva estado = EstadoReserva.PENDIENTE;

    // 1=URGENTE, 2=NORMAL, 3=FLEXIBLE (min-heap)
    @Column(nullable = false)
    private Integer prioridad = 2;

    @Column(name = "creado_en")
    private LocalDateTime creadoEn = LocalDateTime.now();

    @Column
    private String notas;

    public enum EstadoReserva {
        PENDIENTE,
        CONFIRMADA,
        PAGADA,
        CANCELADA,
        COMPLETADA
    }
}

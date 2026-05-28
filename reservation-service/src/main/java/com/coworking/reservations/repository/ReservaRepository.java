package com.coworking.reservations.repository;

import com.coworking.reservations.model.Reserva;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface ReservaRepository extends JpaRepository<Reserva, Long> {

    List<Reserva> findByUsuarioIdOrderByCreadoEnDesc(Long usuarioId);

    List<Reserva> findByEspacioIdOrderByFechaInicio(Long espacioId);

    List<Reserva> findByEstadoOrderByPrioridadAscCreadoEnAsc(Reserva.EstadoReserva estado);

    // Solapamiento simple (fallback si no se usa interval tree)
    @Query("""
        SELECT COUNT(r) > 0 FROM Reserva r
        WHERE r.espacioId = :espacioId
        AND r.estado IN ('PENDIENTE', 'CONFIRMADA')
        AND r.fechaInicio < :fin
        AND r.fechaFin > :inicio
        """)
    boolean existeConflicto(Long espacioId, LocalDateTime inicio, LocalDateTime fin);

    // Busqueda con filtros opcionales + paginacion
    @Query("""
        SELECT r FROM Reserva r
        WHERE (:usuarioId IS NULL OR r.usuarioId = :usuarioId)
        AND (:estado IS NULL OR r.estado = :estado)
        AND (:prioridad IS NULL OR r.prioridad = :prioridad)
        AND (:desde IS NULL OR r.fechaInicio >= :desde)
        AND (:hasta IS NULL OR r.fechaInicio <= :hasta)
        ORDER BY r.creadoEn DESC
        """)
    Page<Reserva> buscarConFiltros(
            @Param("usuarioId") Long usuarioId,
            @Param("estado") Reserva.EstadoReserva estado,
            @Param("prioridad") Integer prioridad,
            @Param("desde") LocalDateTime desde,
            @Param("hasta") LocalDateTime hasta,
            Pageable pageable);
}

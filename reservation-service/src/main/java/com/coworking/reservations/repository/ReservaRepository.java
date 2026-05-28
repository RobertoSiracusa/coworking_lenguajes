package com.coworking.reservations.repository;

import com.coworking.reservations.model.Reserva;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface ReservaRepository extends JpaRepository<Reserva, Long>,
                                            JpaSpecificationExecutor<Reserva> {

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
}

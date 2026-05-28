package com.coworking.reservations.service;

import com.coworking.reservations.algorithm.ColaPrioridad;
import com.coworking.reservations.algorithm.IntervalTree;
import com.coworking.reservations.algorithm.BusquedaFechas;
import com.coworking.reservations.dto.EditarReservaRequest;
import com.coworking.reservations.dto.EspacioDto;
import com.coworking.reservations.dto.PaginadoResponse;
import com.coworking.reservations.dto.ReservaRequest;
import com.coworking.reservations.dto.ReservaResponse;
import com.coworking.reservations.dto.UsuarioDto;
import com.coworking.reservations.model.Reserva;
import com.coworking.reservations.repository.ReservaRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ReservaService {

    private final ReservaRepository repo;
    private final ColaPrioridad cola;
    private final IntervalTree intervalTree = new IntervalTree();
    private final AuthClient authClient;
    private final EspacioClient espacioClient;

    // Reconstruir cola e interval tree al arrancar
    @PostConstruct
    public void inicializar() {
        List<Reserva> pendientes = repo.findByEstadoOrderByPrioridadAscCreadoEnAsc(
                Reserva.EstadoReserva.PENDIENTE);
        pendientes.forEach(cola::insertar);

        // Cargar reservas activas en el interval tree
        for (Reserva r : repo.findAll()) {
            if (r.getEstado() == Reserva.EstadoReserva.PENDIENTE
                    || r.getEstado() == Reserva.EstadoReserva.CONFIRMADA) {
                intervalTree.insertar(r);
            }
        }
        System.out.printf("Cola: %d pendientes. IntervalTree: %d activas%n",
                pendientes.size(), intervalTree.tamanio());
    }

    // Crear reserva con validacion HTTP a auth y space services
    public ReservaResponse crear(ReservaRequest req, Long usuarioId, String jwt) {
        if (!req.getFechaFin().isAfter(req.getFechaInicio())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "La fecha de fin debe ser posterior a la de inicio");
        }

        // Validar espacio existe en space service y obtener datos
        EspacioDto espacio = espacioClient.obtenerEspacio(req.getEspacioId(), jwt);
        if (espacio == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "El espacio no existe en space service");
        }
        if (Boolean.FALSE.equals(espacio.getDisponible())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "El espacio no esta disponible");
        }

        // Detectar conflicto con interval tree O(log n)
        boolean conflicto = intervalTree.haySolapamiento(
                req.getFechaInicio(), req.getFechaFin(), null);
        if (conflicto) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "El espacio ya tiene una reserva en ese horario");
        }

        Reserva reserva = new Reserva();
        reserva.setUsuarioId(usuarioId);
        reserva.setEspacioId(req.getEspacioId());
        reserva.setNombreEspacio(espacio.getNombre());
        reserva.setPrecioHora(espacio.getPrecioPorHora());
        reserva.setFechaInicio(req.getFechaInicio());
        reserva.setFechaFin(req.getFechaFin());
        reserva.setPrioridad(req.getPrioridad() != null ? req.getPrioridad() : 2);
        reserva.setNotas(req.getNotas());
        reserva.setEstado(Reserva.EstadoReserva.PENDIENTE);

        Reserva guardada = repo.save(reserva);
        cola.insertar(guardada);
        intervalTree.insertar(guardada);
        return ReservaResponse.desde(guardada);
    }

    // Editar reserva (solo si esta pendiente)
    public ReservaResponse editar(Long id, EditarReservaRequest req, Long usuarioId, boolean esAdmin) {
        Reserva reserva = repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Reserva no encontrada"));

        if (!esAdmin && !reserva.getUsuarioId().equals(usuarioId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Solo puedes editar tus propias reservas");
        }
        if (reserva.getEstado() != Reserva.EstadoReserva.PENDIENTE) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Solo se pueden editar reservas pendientes");
        }

        LocalDateTime nuevoInicio = req.getFechaInicio() != null ? req.getFechaInicio() : reserva.getFechaInicio();
        LocalDateTime nuevoFin = req.getFechaFin() != null ? req.getFechaFin() : reserva.getFechaFin();
        if (!nuevoFin.isAfter(nuevoInicio)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "La fecha de fin debe ser posterior a la de inicio");
        }

        // Si cambian fechas, verificar conflicto ignorando esta misma reserva
        if (req.getFechaInicio() != null || req.getFechaFin() != null) {
            if (intervalTree.haySolapamiento(nuevoInicio, nuevoFin, id)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Las nuevas fechas tienen conflicto con otra reserva");
            }
            intervalTree.eliminar(id);
            reserva.setFechaInicio(nuevoInicio);
            reserva.setFechaFin(nuevoFin);
        }

        if (req.getPrioridad() != null) {
            cola.eliminarPorId(id);
            reserva.setPrioridad(req.getPrioridad());
        }
        if (req.getNotas() != null) reserva.setNotas(req.getNotas());

        Reserva guardada = repo.save(reserva);

        if (req.getFechaInicio() != null || req.getFechaFin() != null) {
            intervalTree.insertar(guardada);
        }
        if (req.getPrioridad() != null) {
            cola.insertar(guardada);
        }
        return ReservaResponse.desde(guardada);
    }

    public ReservaResponse confirmarSiguiente() {
        return cola.extraerMax()
                .map(r -> {
                    r.setEstado(Reserva.EstadoReserva.CONFIRMADA);
                    return ReservaResponse.desde(repo.save(r));
                })
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "No hay reservas pendientes en la cola"));
    }

    // Marcar como completada (admin)
    public ReservaResponse completar(Long id) {
        Reserva reserva = repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Reserva no encontrada"));
        if (reserva.getEstado() != Reserva.EstadoReserva.CONFIRMADA) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Solo se pueden completar reservas confirmadas");
        }
        reserva.setEstado(Reserva.EstadoReserva.COMPLETADA);
        intervalTree.eliminar(id);
        return ReservaResponse.desde(repo.save(reserva));
    }

    public Map<String, Object> estadoCola() {
        List<Reserva> enCola = cola.verCola();
        Map<String, Object> resp = new HashMap<>();
        resp.put("total_en_cola", cola.tamanio());
        resp.put("siguiente", cola.verSiguiente().map(ReservaResponse::desde).orElse(null));
        resp.put("reservas", enCola.stream().map(ReservaResponse::desde).collect(Collectors.toList()));
        return resp;
    }

    public List<ReservaResponse> misReservas(Long usuarioId) {
        return repo.findByUsuarioIdOrderByCreadoEnDesc(usuarioId).stream()
                .map(ReservaResponse::desde)
                .collect(Collectors.toList());
    }

    public ReservaResponse cancelar(Long id, Long usuarioId, boolean esAdmin) {
        Reserva reserva = repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Reserva no encontrada"));
        if (!esAdmin && !reserva.getUsuarioId().equals(usuarioId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Solo puedes cancelar tus propias reservas");
        }
        reserva.setEstado(Reserva.EstadoReserva.CANCELADA);
        cola.eliminarPorId(id);
        intervalTree.eliminar(id);
        return ReservaResponse.desde(repo.save(reserva));
    }

    public List<ReservaResponse> listarTodas() {
        return repo.findAll().stream()
                .map(ReservaResponse::desde)
                .collect(Collectors.toList());
    }

    // Listar con filtros + paginacion + enriquecimiento
    public PaginadoResponse<ReservaResponse> listarPaginado(
            Long usuarioFiltro, Reserva.EstadoReserva estado, Integer prioridad,
            LocalDateTime desde, LocalDateTime hasta,
            int pagina, int porPagina, String jwt) {
        Pageable pageable = PageRequest.of(
                Math.max(0, pagina - 1),
                Math.min(100, Math.max(1, porPagina)),
                Sort.by(Sort.Direction.DESC, "creadoEn"));
        Page<Reserva> page = repo.buscarConFiltros(
                usuarioFiltro, estado, prioridad, desde, hasta, pageable);

        List<ReservaResponse> enriquecidas = page.getContent().stream()
                .map(r -> {
                    ReservaResponse dto = ReservaResponse.desde(r);
                    if (jwt != null) {
                        UsuarioDto u = authClient.obtenerUsuario(r.getUsuarioId(), jwt);
                        if (u != null) {
                            dto.setUsuarioNombre(u.getNombre());
                            dto.setUsuarioEmail(u.getEmail());
                        }
                    }
                    return dto;
                })
                .collect(Collectors.toList());

        return new PaginadoResponse<>(
                pagina, porPagina, page.getTotalElements(), page.getTotalPages(), enriquecidas);
    }

    // Estadisticas personales del usuario autenticado
    public Map<String, Object> misEstadisticas(Long usuarioId) {
        List<Reserva> reservas = repo.findByUsuarioIdOrderByCreadoEnDesc(usuarioId);
        long total = reservas.size();
        long pendientes = reservas.stream().filter(r -> r.getEstado() == Reserva.EstadoReserva.PENDIENTE).count();
        long confirmadas = reservas.stream().filter(r -> r.getEstado() == Reserva.EstadoReserva.CONFIRMADA).count();
        long completadas = reservas.stream().filter(r -> r.getEstado() == Reserva.EstadoReserva.COMPLETADA).count();
        long canceladas = reservas.stream().filter(r -> r.getEstado() == Reserva.EstadoReserva.CANCELADA).count();

        double horasTotales = reservas.stream()
                .filter(r -> r.getEstado() != Reserva.EstadoReserva.CANCELADA)
                .mapToDouble(r -> java.time.Duration.between(
                        r.getFechaInicio(), r.getFechaFin()).toMinutes() / 60.0)
                .sum();

        Map<String, Object> resp = new HashMap<>();
        resp.put("usuario_id", usuarioId);
        resp.put("total_reservas", total);
        resp.put("pendientes", pendientes);
        resp.put("confirmadas", confirmadas);
        resp.put("completadas", completadas);
        resp.put("canceladas", canceladas);
        resp.put("horas_totales", Math.round(horasTotales * 100.0) / 100.0);
        return resp;
    }

    // Buscar por fecha: lineal vs binaria
    public Map<String, Object> buscarPorFecha(LocalDate fecha, String algoritmo) {
        List<Reserva> todas = repo.findAll();
        List<Reserva> resultados;
        String nombreAlg;
        if ("lineal".equals(algoritmo)) {
            resultados = BusquedaFechas.busquedaLineal(todas, fecha);
            nombreAlg = "lineal O(n)";
        } else {
            resultados = BusquedaFechas.busquedaBinaria(todas, fecha);
            nombreAlg = "binaria O(n log n) sort + O(log n) busqueda";
        }
        Map<String, Object> resp = new HashMap<>();
        resp.put("fecha", fecha.toString());
        resp.put("algoritmo", nombreAlg);
        resp.put("total", resultados.size());
        resp.put("resultados", resultados.stream().map(ReservaResponse::desde).collect(Collectors.toList()));
        return resp;
    }

    public Map<String, Object> estadisticasCache() {
        Map<String, Object> resp = new HashMap<>();
        resp.put("cache_usuarios", authClient.estadisticas());
        resp.put("cache_espacios", espacioClient.estadisticas());
        resp.put("interval_tree_size", intervalTree.tamanio());
        resp.put("cola_size", cola.tamanio());
        return resp;
    }
}

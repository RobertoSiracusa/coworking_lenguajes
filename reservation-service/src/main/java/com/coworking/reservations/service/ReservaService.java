package com.coworking.reservations.service;

import com.coworking.reservations.algorithm.ColaPrioridad;
import com.coworking.reservations.algorithm.IntervalTree;
import com.coworking.reservations.algorithm.BusquedaFechas;
import com.coworking.reservations.algorithm.IndiceReservas;
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
import org.springframework.scheduling.annotation.Scheduled;
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
    private final BillingClient billingClient;
    private final IndiceReservas indice;

    // Reconstruir cola, interval tree e indice al arrancar
    @PostConstruct
    public void inicializar() {
        List<Reserva> pendientes = repo.findByEstadoOrderByPrioridadAscCreadoEnAsc(
                Reserva.EstadoReserva.PENDIENTE);
        pendientes.forEach(cola::insertar);

        // Cargar todas en el indice + activas en interval tree
        for (Reserva r : repo.findAll()) {
            indice.insertar(r);
            if (r.getEstado() == Reserva.EstadoReserva.PENDIENTE
                    || r.getEstado() == Reserva.EstadoReserva.CONFIRMADA) {
                intervalTree.insertar(r);
            }
        }
        System.out.printf("Cola: %d pendientes. IntervalTree: %d activas. Indice: %d reservas%n",
                pendientes.size(), intervalTree.tamanio(), indice.tamanio());
    }

    // Validar franja horaria: minutos en {0, 30}, sin segundos, duracion multiplo de 1 hora
    private void validarFranjaHoraria(LocalDateTime inicio, LocalDateTime fin) {
        if (inicio.getSecond() != 0 || inicio.getNano() != 0
                || (inicio.getMinute() != 0 && inicio.getMinute() != 30)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "La hora de inicio debe ser en punto (:00) o media hora (:30)");
        }
        if (fin.getSecond() != 0 || fin.getNano() != 0
                || (fin.getMinute() != 0 && fin.getMinute() != 30)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "La hora de fin debe ser en punto (:00) o media hora (:30)");
        }
        long minutos = java.time.Duration.between(inicio, fin).toMinutes();
        if (minutos <= 0 || minutos % 60 != 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "La duracion debe ser multiplo de 1 hora");
        }
    }

    private void actualizarEstructuras(Reserva reserva, Reserva.EstadoReserva nuevoEstado) {
        Long id = reserva.getId();
        if (nuevoEstado == Reserva.EstadoReserva.PENDIENTE) {
            cola.eliminarPorId(id);
            cola.insertar(reserva);
        } else {
            cola.eliminarPorId(id);
        }

        if (nuevoEstado == Reserva.EstadoReserva.PENDIENTE
                || nuevoEstado == Reserva.EstadoReserva.CONFIRMADA) {
            intervalTree.eliminar(id);
            intervalTree.insertar(reserva);
        } else {
            intervalTree.eliminar(id);
        }

        indice.actualizar(reserva);
    }

    // Crear reserva con validacion HTTP a auth y space services
    public ReservaResponse crear(ReservaRequest req, Long usuarioId, String jwt) {
        if (!req.getFechaFin().isAfter(req.getFechaInicio())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "La fecha de fin debe ser posterior a la de inicio");
        }

        validarFranjaHoraria(req.getFechaInicio(), req.getFechaFin());

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
                req.getEspacioId(), req.getFechaInicio(), req.getFechaFin(), null);
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
        indice.insertar(guardada);
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

        if (req.getFechaInicio() != null || req.getFechaFin() != null) {
            validarFranjaHoraria(nuevoInicio, nuevoFin);
        }

        // Si cambian fechas, verificar conflicto ignorando esta misma reserva
        if (req.getFechaInicio() != null || req.getFechaFin() != null) {
            if (intervalTree.haySolapamiento(reserva.getEspacioId(), nuevoInicio, nuevoFin, id)) {
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
        indice.actualizar(guardada);

        if (req.getFechaInicio() != null || req.getFechaFin() != null) {
            intervalTree.insertar(guardada);
        }
        if (req.getPrioridad() != null) {
            cola.insertar(guardada);
        }
        return ReservaResponse.desde(guardada);
    }

    public ReservaResponse confirmar(Long id, Long usuarioId, boolean esAdmin, String jwt) {
        Reserva reserva = repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Reserva no encontrada"));
        if (!esAdmin && !reserva.getUsuarioId().equals(usuarioId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Solo puedes confirmar tus propias reservas");
        }
        if (reserva.getEstado() != Reserva.EstadoReserva.PENDIENTE) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Solo se pueden confirmar reservas pendientes");
        }

        boolean ok = billingClient.generarFactura(reserva, jwt);
        if (!ok) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "No se pudo generar la factura al confirmar la reserva");
        }

        reserva.setEstado(Reserva.EstadoReserva.CONFIRMADA);
        actualizarEstructuras(reserva, Reserva.EstadoReserva.CONFIRMADA);
        return ReservaResponse.desde(repo.save(reserva));
    }

    public ReservaResponse confirmarSiguiente(String jwt) {
        Reserva reserva = cola.extraerMax().orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "No hay reservas pendientes en la cola"));
        boolean ok = billingClient.generarFactura(reserva, jwt);
        if (!ok) {
            cola.insertar(reserva);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "No se pudo generar la factura al confirmar la reserva");
        }
        reserva.setEstado(Reserva.EstadoReserva.CONFIRMADA);
        actualizarEstructuras(reserva, Reserva.EstadoReserva.CONFIRMADA);
        return ReservaResponse.desde(repo.save(reserva));
    }

    // Facturar reserva manualmente (admin o dueño)
    public Map<String, Object> facturar(Long id, Long usuarioId, boolean esAdmin, String jwt) {
        Reserva reserva = repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Reserva no encontrada"));
        if (!esAdmin && !reserva.getUsuarioId().equals(usuarioId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Solo puedes facturar tus propias reservas");
        }
        if (reserva.getEstado() == Reserva.EstadoReserva.CANCELADA) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "No se puede facturar una reserva cancelada");
        }
        if (reserva.getEstado() != Reserva.EstadoReserva.CONFIRMADA) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Solo se pueden facturar reservas confirmadas");
        }
        boolean ok = billingClient.generarFactura(reserva, jwt);
        if (!ok) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "No se pudo generar la factura (puede que ya este facturada o billing service no responde)");
        }
        Map<String, Object> resp = new HashMap<>();
        resp.put("mensaje", "Factura generada");
        resp.put("reserva_id", id);
        return resp;
    }


    // Marcar como completada (admin) - solo si estaba CONFIRMADA y PAGADA
    public ReservaResponse completar(Long id) {
        Reserva reserva = repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Reserva no encontrada"));
        if (reserva.getEstado() != Reserva.EstadoReserva.CONFIRMADA) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Solo se pueden completar reservas confirmadas");
        }
        if (reserva.getEstadoPago() != Reserva.EstadoPago.PAGADA) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "La reserva debe estar pagada antes de completar");
        }
        reserva.setEstado(Reserva.EstadoReserva.COMPLETADA);
        actualizarEstructuras(reserva, Reserva.EstadoReserva.COMPLETADA);
        return ReservaResponse.desde(repo.save(reserva));
    }

    public ReservaResponse actualizarEstadoAdmin(Long id, Reserva.EstadoReserva nuevoEstado) {
        Reserva reserva = repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Reserva no encontrada"));
        reserva.setEstado(nuevoEstado);
        actualizarEstructuras(reserva, nuevoEstado);
        return ReservaResponse.desde(repo.save(reserva));
    }

    // Pagar reserva (usuario o admin) - cambia estadoPago a PAGADA + genera factura
    public ReservaResponse pagar(Long id, Long usuarioId, boolean esAdmin, String jwt) {
        Reserva reserva = repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Reserva no encontrada"));

        if (!esAdmin && !reserva.getUsuarioId().equals(usuarioId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Solo puedes pagar tus propias reservas");
        }
        if (reserva.getEstado() == Reserva.EstadoReserva.CANCELADA) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "No se puede pagar una reserva cancelada");
        }
        if (reserva.getEstado() != Reserva.EstadoReserva.CONFIRMADA) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Solo se pueden pagar reservas confirmadas por el admin");
        }
        if (reserva.getEstadoPago() == Reserva.EstadoPago.PAGADA) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "La reserva ya esta pagada");
        }

        reserva.setEstadoPago(Reserva.EstadoPago.PAGADA);
        Reserva guardada = repo.save(reserva);
        indice.actualizar(guardada);

        // Trigger factura automatica al pagar
        boolean ok = billingClient.generarFactura(guardada, jwt);
        if (!ok) {
            System.err.println("Reserva " + id + " pagada pero factura fallo");
        }
        return ReservaResponse.desde(guardada);
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
        return misReservasConFiltros(usuarioId, null, null, null, null, null, null, null);
    }

    // Busqueda con filtros usando el IndiceReservas en memoria
    // Cada filtro restringe sobre un set indexado, AND entre todos los presentes
    public List<ReservaResponse> misReservasConFiltros(
            Long usuarioId,
            Reserva.EstadoReserva estado,
            Reserva.EstadoPago estadoPago,
            String sala,
            java.time.LocalDate dia,
            Integer duracion,
            java.time.LocalDate desde,
            java.time.LocalDate hasta) {
        List<Reserva> resultado = indice.buscar(
                usuarioId, estado, estadoPago, sala, dia, duracion, desde, hasta);
        return resultado.stream()
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
        Reserva guardada = repo.save(reserva);
        indice.actualizar(guardada);
        return ReservaResponse.desde(guardada);
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

        // Construir Specification dinamica: solo agrega filtros no nulos
        org.springframework.data.jpa.domain.Specification<Reserva> spec = (root, q, cb) -> {
            java.util.List<jakarta.persistence.criteria.Predicate> preds = new java.util.ArrayList<>();
            if (usuarioFiltro != null) preds.add(cb.equal(root.get("usuarioId"), usuarioFiltro));
            if (estado != null)        preds.add(cb.equal(root.get("estado"), estado));
            if (prioridad != null)     preds.add(cb.equal(root.get("prioridad"), prioridad));
            if (desde != null)         preds.add(cb.greaterThanOrEqualTo(root.get("fechaInicio"), desde));
            if (hasta != null)         preds.add(cb.lessThanOrEqualTo(root.get("fechaInicio"), hasta));
            return cb.and(preds.toArray(new jakarta.persistence.criteria.Predicate[0]));
        };

        Page<Reserva> page = repo.findAll(spec, pageable);

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
        long pagadas = reservas.stream().filter(r -> r.getEstadoPago() == Reserva.EstadoPago.PAGADA).count();
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
        resp.put("pagadas", pagadas);
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

    @Scheduled(fixedDelayString = "${reservas.autocomplete.delay.ms:60000}")
    public void completarPagadasPorHora() {
        LocalDateTime ahora = LocalDateTime.now();
        // Buscar reservas CONFIRMADAS+PAGADAS cuya fecha de inicio ya paso
        List<Reserva> paraCompletar = repo.findAll().stream()
                .filter(r -> r.getEstado() == Reserva.EstadoReserva.CONFIRMADA
                          && r.getEstadoPago() == Reserva.EstadoPago.PAGADA
                          && !r.getFechaInicio().isAfter(ahora))
                .collect(Collectors.toList());
        if (paraCompletar.isEmpty()) return;
        for (Reserva r : paraCompletar) {
            r.setEstado(Reserva.EstadoReserva.COMPLETADA);
            actualizarEstructuras(r, Reserva.EstadoReserva.COMPLETADA);
            repo.save(r);
        }
        System.out.printf("Reservas completadas automaticamente: %d%n", paraCompletar.size());
    }

    public Map<String, Object> estadisticasCache() {
        Map<String, Object> resp = new HashMap<>();
        resp.put("cache_usuarios", authClient.estadisticas());
        resp.put("cache_espacios", espacioClient.estadisticas());
        resp.put("interval_tree_size", intervalTree.tamanio());
        resp.put("cola_size", cola.tamanio());
        return resp;
    }

    public List<ReservaResponse> reservasPorEspacio(Long espacioId) {
        return repo.findByEspacioIdOrderByFechaInicio(espacioId).stream()
                .filter(r -> r.getEstado() == Reserva.EstadoReserva.PENDIENTE || r.getEstado() == Reserva.EstadoReserva.CONFIRMADA)
                .map(ReservaResponse::desde)
                .collect(Collectors.toList());
    }

    public void reset() {
        repo.deleteAll();
        cola.vaciar();
        intervalTree.vaciar();
        indice.vaciar();
    }
}

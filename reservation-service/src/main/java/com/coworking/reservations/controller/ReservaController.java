package com.coworking.reservations.controller;

import com.coworking.reservations.dto.ActualizarEstadoRequest;
import com.coworking.reservations.dto.EditarReservaRequest;
import com.coworking.reservations.dto.PaginadoResponse;
import com.coworking.reservations.dto.ReservaRequest;
import com.coworking.reservations.dto.ReservaResponse;
import com.coworking.reservations.model.Reserva;
import com.coworking.reservations.service.ReservaService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class ReservaController {

    private final ReservaService service;

    // Health publico
    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of(
                "servicio", "reservation-service",
                "estado", "funcionando",
                "puerto", "8003");
    }

    // POST /reservas - crear (valida usuario y espacio via HTTP)
    @PostMapping("/reservas")
    @ResponseStatus(HttpStatus.CREATED)
    public ReservaResponse crear(@Valid @RequestBody ReservaRequest req, HttpServletRequest httpReq) {
        Long usuarioId = (Long) httpReq.getAttribute("usuario_id");
        String token = (String) httpReq.getAttribute("token");
        return service.crear(req, usuarioId, token);
    }

    // GET /reservas/mis-reservas - filtros server-side usando IndiceReservas en memoria
    @GetMapping("/reservas/mis-reservas")
    public List<ReservaResponse> misReservas(
            @RequestParam(required = false) com.coworking.reservations.model.Reserva.EstadoReserva estado,
            @RequestParam(name = "estado_pago", required = false) com.coworking.reservations.model.Reserva.EstadoPago estadoPago,
            @RequestParam(required = false) String sala,
            @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate dia,
            @RequestParam(required = false) Integer duracion,
            @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate desde,
            @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate hasta,
            HttpServletRequest httpReq) {
        Long usuarioId = (Long) httpReq.getAttribute("usuario_id");
        return service.misReservasConFiltros(usuarioId, estado, estadoPago, sala, dia, duracion, desde, hasta);
    }

    // GET /reservas/mis-estadisticas - resumen del usuario
    @GetMapping("/reservas/mis-estadisticas")
    public Map<String, Object> misEstadisticas(HttpServletRequest httpReq) {
        Long usuarioId = (Long) httpReq.getAttribute("usuario_id");
        return service.misEstadisticas(usuarioId);
    }

    // GET /reservas/buscar-fecha?fecha=...&algoritmo=lineal|binaria
    @GetMapping("/reservas/buscar-fecha")
    public Map<String, Object> buscarPorFecha(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fecha,
            @RequestParam(defaultValue = "binaria") String algoritmo,
            HttpServletRequest httpReq) {
        verificarAdmin(httpReq);
        return service.buscarPorFecha(fecha, algoritmo);
    }

    @DeleteMapping("/reservas/{id:\\d+}")
    public ReservaResponse cancelar(@PathVariable Long id, HttpServletRequest httpReq) {
        Long usuarioId = (Long) httpReq.getAttribute("usuario_id");
        String rol = (String) httpReq.getAttribute("rol");
        return service.cancelar(id, usuarioId, "admin".equals(rol));
    }

    // PUT /reservas/{id} - editar (usuario solo las suyas)
    @PutMapping("/reservas/{id:\\d+}")
    public ReservaResponse editar(@PathVariable Long id,
                                   @Valid @RequestBody EditarReservaRequest req,
                                   HttpServletRequest httpReq) {
        Long usuarioId = (Long) httpReq.getAttribute("usuario_id");
        String rol = (String) httpReq.getAttribute("rol");
        return service.editar(id, req, usuarioId, "admin".equals(rol));
    }

    // POST /reservas/{id}/confirmar - confirmar reserva + generar factura
    @PostMapping("/reservas/{id}/confirmar")
    public ReservaResponse confirmar(@PathVariable Long id, HttpServletRequest httpReq) {
        Long usuarioId = (Long) httpReq.getAttribute("usuario_id");
        String rol = (String) httpReq.getAttribute("rol");
        String token = (String) httpReq.getAttribute("token");
        return service.confirmar(id, usuarioId, "admin".equals(rol), token);
    }

    // POST /reservas/{id}/facturar - facturar reserva (admin o dueño)
    @PostMapping("/reservas/{id}/facturar")
    public Map<String, Object> facturar(@PathVariable Long id, HttpServletRequest httpReq) {
        Long usuarioId = (Long) httpReq.getAttribute("usuario_id");
        String rol = (String) httpReq.getAttribute("rol");
        String token = (String) httpReq.getAttribute("token");
        return service.facturar(id, usuarioId, "admin".equals(rol), token);
    }

    // PATCH /reservas/{id}/completar - marcar completada (admin)
    @PatchMapping("/reservas/{id}/completar")
    public ReservaResponse completar(@PathVariable Long id, HttpServletRequest httpReq) {
        verificarAdmin(httpReq);
        return service.completar(id);
    }

    // PATCH /reservas/{id}/estado - cambiar estado (admin)
    @PatchMapping("/reservas/{id}/estado")
    public ReservaResponse cambiarEstado(@PathVariable Long id,
                                         @Valid @RequestBody ActualizarEstadoRequest req,
                                         HttpServletRequest httpReq) {
        verificarAdmin(httpReq);
        return service.actualizarEstadoAdmin(id, req.getEstado());
    }

    // PATCH /reservas/{id}/pagar - pagar reserva (cambia de PENDIENTE a CONFIRMADA)
    @PatchMapping("/reservas/{id}/pagar")
    public ReservaResponse pagar(@PathVariable Long id, HttpServletRequest httpReq) {
        Long usuarioId = (Long) httpReq.getAttribute("usuario_id");
        String rol = (String) httpReq.getAttribute("rol");
        String token = (String) httpReq.getAttribute("token");
        return service.pagar(id, usuarioId, "admin".equals(rol), token);
    }

    // GET /reservas/espacio/{espacioId} - obtener reservas de un espacio (para deshabilitar slots)
    @GetMapping("/reservas/espacio/{espacioId}")
    public List<ReservaResponse> reservasPorEspacio(@PathVariable Long espacioId) {
        return service.reservasPorEspacio(espacioId);
    }

    // GET /reservas - listar con filtros y paginacion (admin)
    @GetMapping("/reservas")
    public PaginadoResponse<ReservaResponse> listar(
            @RequestParam(required = false) Reserva.EstadoReserva estado,
            @RequestParam(required = false) Integer prioridad,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime desde,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime hasta,
            @RequestParam(defaultValue = "1") int pagina,
            @RequestParam(name = "por_pagina", defaultValue = "20") int porPagina,
            HttpServletRequest httpReq) {
        verificarAdmin(httpReq);
        String token = (String) httpReq.getAttribute("token");
        return service.listarPaginado(null, estado, prioridad, desde, hasta, pagina, porPagina, token);
    }

    @GetMapping("/cola")
    public Map<String, Object> estadoCola(HttpServletRequest httpReq) {
        verificarAdmin(httpReq);
        return service.estadoCola();
    }

    @PostMapping("/cola/confirmar")
    public ReservaResponse confirmarSiguiente(HttpServletRequest httpReq) {
        verificarAdmin(httpReq);
        String token = (String) httpReq.getAttribute("token");
        return service.confirmarSiguiente(token);
    }

    // GET /cache/estadisticas - stats de los LRU caches e interval tree
    @GetMapping("/cache/estadisticas")
    public Map<String, Object> estadisticasCache(HttpServletRequest httpReq) {
        verificarAdmin(httpReq);
        return service.estadisticasCache();
    }

    @DeleteMapping("/reservas/reset")
    public Map<String, String> reset(HttpServletRequest httpReq) {
        verificarAdmin(httpReq);
        service.reset();
        return Map.of("mensaje", "Todas las reservas han sido eliminadas y las estructuras de memoria han sido vaciadas.");
    }

    private void verificarAdmin(HttpServletRequest req) {
        String rol = (String) req.getAttribute("rol");
        if (!"admin".equals(rol)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "Solo administradores pueden realizar esta accion");
        }
    }
}

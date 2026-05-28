package com.coworking.reservations.controller;

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

    @GetMapping("/reservas/mis-reservas")
    public List<ReservaResponse> misReservas(HttpServletRequest httpReq) {
        Long usuarioId = (Long) httpReq.getAttribute("usuario_id");
        return service.misReservas(usuarioId);
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

    @DeleteMapping("/reservas/{id}")
    public ReservaResponse cancelar(@PathVariable Long id, HttpServletRequest httpReq) {
        Long usuarioId = (Long) httpReq.getAttribute("usuario_id");
        String rol = (String) httpReq.getAttribute("rol");
        return service.cancelar(id, usuarioId, "admin".equals(rol));
    }

    // PUT /reservas/{id} - editar (usuario solo las suyas)
    @PutMapping("/reservas/{id}")
    public ReservaResponse editar(@PathVariable Long id,
                                   @Valid @RequestBody EditarReservaRequest req,
                                   HttpServletRequest httpReq) {
        Long usuarioId = (Long) httpReq.getAttribute("usuario_id");
        String rol = (String) httpReq.getAttribute("rol");
        return service.editar(id, req, usuarioId, "admin".equals(rol));
    }

    // POST /reservas/{id}/facturar - facturar reserva (admin o dueño)
    @PostMapping("/reservas/{id}/facturar")
    public Map<String, Object> facturar(@PathVariable Long id, HttpServletRequest httpReq) {
        Long usuarioId = (Long) httpReq.getAttribute("usuario_id");
        String rol = (String) httpReq.getAttribute("rol");
        String token = (String) httpReq.getAttribute("token");
        return service.facturar(id, usuarioId, "admin".equals(rol), token);
    }

    // PATCH /reservas/{id}/completar - marcar completada (admin) + generar factura
    @PatchMapping("/reservas/{id}/completar")
    public ReservaResponse completar(@PathVariable Long id, HttpServletRequest httpReq) {
        verificarAdmin(httpReq);
        String token = (String) httpReq.getAttribute("token");
        return service.completar(id, token);
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
        return service.confirmarSiguiente();
    }

    // GET /cache/estadisticas - stats de los LRU caches e interval tree
    @GetMapping("/cache/estadisticas")
    public Map<String, Object> estadisticasCache(HttpServletRequest httpReq) {
        verificarAdmin(httpReq);
        return service.estadisticasCache();
    }

    private void verificarAdmin(HttpServletRequest req) {
        String rol = (String) req.getAttribute("rol");
        if (!"admin".equals(rol)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "Solo administradores pueden realizar esta accion");
        }
    }
}

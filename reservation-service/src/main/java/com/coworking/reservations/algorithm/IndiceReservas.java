package com.coworking.reservations.algorithm;

import com.coworking.reservations.model.Reserva;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

// Indice multi-campo en memoria. HashMaps O(1) + TreeMap por fecha O(log n).
// Busqueda con filtros = interseccion AND. Thread-safe con synchronized.
@Component
public class IndiceReservas {

    private final Map<Long,                     Set<Long>> porUsuario     = new HashMap<>();
    private final Map<Reserva.EstadoReserva,    Set<Long>> porEstado      = new HashMap<>();
    private final Map<Reserva.EstadoPago,       Set<Long>> porEstadoPago  = new HashMap<>();
    private final Map<String,                   Set<Long>> porSala        = new HashMap<>();
    private final Map<Integer,                  Set<Long>> porDuracion    = new HashMap<>();
    private final TreeMap<LocalDate,            Set<Long>> porFecha       = new TreeMap<>();
    private final Map<Long, Reserva>                        porId          = new HashMap<>();

    // Calcular duracion en horas (redondea hacia abajo)
    private static int duracionHoras(Reserva r) {
        long min = Duration.between(r.getFechaInicio(), r.getFechaFin()).toMinutes();
        return (int) (min / 60);
    }

    private static LocalDate dia(Reserva r) {
        return r.getFechaInicio().toLocalDate();
    }

    // Acceso defensivo a un set indexado
    private <K> Set<Long> bucket(Map<K, Set<Long>> mapa, K clave) {
        return mapa.computeIfAbsent(clave, k -> new HashSet<>());
    }

    // O(1) - inserta una reserva en todos los indices
    public synchronized void insertar(Reserva r) {
        Long id = r.getId();
        porId.put(id, r);
        bucket(porUsuario, r.getUsuarioId()).add(id);
        bucket(porEstado, r.getEstado()).add(id);
        bucket(porEstadoPago, r.getEstadoPago()).add(id);
        if (r.getNombreEspacio() != null) bucket(porSala, r.getNombreEspacio()).add(id);
        bucket(porDuracion, duracionHoras(r)).add(id);
        bucket(porFecha, dia(r)).add(id);
    }

    // O(1) - elimina de todos los indices
    public synchronized void eliminar(Long id) {
        Reserva r = porId.remove(id);
        if (r == null) return;
        removerDe(porUsuario, r.getUsuarioId(), id);
        removerDe(porEstado, r.getEstado(), id);
        removerDe(porEstadoPago, r.getEstadoPago(), id);
        if (r.getNombreEspacio() != null) removerDe(porSala, r.getNombreEspacio(), id);
        removerDe(porDuracion, duracionHoras(r), id);
        removerDe(porFecha, dia(r), id);
    }

    // Re-indexar (ej. al cambiar estado o pagar): elimina y reinserta
    public synchronized void actualizar(Reserva r) {
        if (porId.containsKey(r.getId())) eliminar(r.getId());
        insertar(r);
    }

    public synchronized void vaciar() {
        porUsuario.clear(); porEstado.clear(); porEstadoPago.clear();
        porSala.clear(); porDuracion.clear(); porFecha.clear(); porId.clear();
    }

    private <K> void removerDe(Map<K, Set<Long>> mapa, K clave, Long id) {
        Set<Long> s = mapa.get(clave);
        if (s == null) return;
        s.remove(id);
        if (s.isEmpty()) mapa.remove(clave);
    }

    // Set vacio inmutable cuando no hay coincidencias
    private Set<Long> vacio() { return Collections.emptySet(); }

    // Buscar con filtros. null = no aplica ese filtro.
    // Interseccion AND empezando por el set mas pequeno.
    public synchronized List<Reserva> buscar(
            Long usuarioId,
            Reserva.EstadoReserva estado,
            Reserva.EstadoPago estadoPago,
            String sala,
            LocalDate dia,
            Integer duracion,
            LocalDate desde,
            LocalDate hasta) {

        List<Set<Long>> conjuntos = new ArrayList<>();

        if (usuarioId  != null) conjuntos.add(porUsuario.getOrDefault(usuarioId,  vacio()));
        if (estado     != null) conjuntos.add(porEstado.getOrDefault(estado,     vacio()));
        if (estadoPago != null) conjuntos.add(porEstadoPago.getOrDefault(estadoPago, vacio()));
        if (sala       != null) conjuntos.add(porSala.getOrDefault(sala,         vacio()));
        if (duracion   != null) conjuntos.add(porDuracion.getOrDefault(duracion, vacio()));
        if (dia        != null) conjuntos.add(porFecha.getOrDefault(dia,         vacio()));

        // Rango de fechas: subMap O(log n) + union de los buckets del rango
        if (desde != null || hasta != null) {
            LocalDate lo = desde != null ? desde : LocalDate.MIN;
            LocalDate hi = hasta != null ? hasta : LocalDate.MAX;
            Set<Long> idsRango = new HashSet<>();
            // subMap es vista, no copia. O(log n) acceso, O(k) iterar
            for (Set<Long> s : porFecha.subMap(lo, true, hi, true).values()) {
                idsRango.addAll(s);
            }
            conjuntos.add(idsRango);
        }

        if (conjuntos.isEmpty()) {
            // Sin filtros, devolver todo
            List<Reserva> todas = new ArrayList<>(porId.values());
            todas.sort(Comparator.comparing(Reserva::getCreadoEn).reversed());
            return todas;
        }

        // Ordenar por tamano: empezar interseccion con el mas chico
        conjuntos.sort(Comparator.comparingInt(Set::size));
        Set<Long> resultado = new HashSet<>(conjuntos.get(0));
        for (int i = 1; i < conjuntos.size(); i++) {
            resultado.retainAll(conjuntos.get(i));
            if (resultado.isEmpty()) return Collections.emptyList();
        }

        // Hidratar ids a Reservas y ordenar
        List<Reserva> finales = new ArrayList<>(resultado.size());
        for (Long id : resultado) {
            Reserva r = porId.get(id);
            if (r != null) finales.add(r);
        }
        finales.sort(Comparator.comparing(Reserva::getCreadoEn).reversed());
        return finales;
    }

    public synchronized int tamanio() { return porId.size(); }

    public synchronized Map<String, Object> estadisticas() {
        Map<String, Object> s = new HashMap<>();
        s.put("total_reservas",      porId.size());
        s.put("usuarios_unicos",     porUsuario.size());
        s.put("salas_unicas",        porSala.size());
        s.put("duraciones_distintas", porDuracion.size());
        s.put("dias_con_reservas",   porFecha.size());
        s.put("estados_activos",     porEstado.size());
        return s;
    }
}

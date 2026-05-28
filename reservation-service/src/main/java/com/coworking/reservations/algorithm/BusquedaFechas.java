package com.coworking.reservations.algorithm;

import com.coworking.reservations.model.Reserva;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class BusquedaFechas {

    // O(n) - recorre todas las reservas
    public static List<Reserva> busquedaLineal(List<Reserva> reservas, LocalDate fecha) {
        List<Reserva> resultado = new ArrayList<>();
        for (Reserva r : reservas) {
            if (r.getFechaInicio().toLocalDate().equals(fecha)) resultado.add(r);
        }
        return resultado;
    }

    // O(n log n) sort + O(log n) busqueda de rango
    public static List<Reserva> busquedaBinaria(List<Reserva> reservas, LocalDate fecha) {
        if (reservas.isEmpty()) return new ArrayList<>();
        List<Reserva> ordenadas = new ArrayList<>(reservas);
        ordenadas.sort(Comparator.comparing(Reserva::getFechaInicio));

        LocalDateTime inicio = fecha.atStartOfDay();
        LocalDateTime fin = fecha.plusDays(1).atStartOfDay();
        int lo = lowerBound(ordenadas, inicio);
        int hi = lowerBound(ordenadas, fin);
        return new ArrayList<>(ordenadas.subList(lo, hi));
    }

    // Primer indice cuya fechaInicio >= objetivo
    private static int lowerBound(List<Reserva> arr, LocalDateTime objetivo) {
        int lo = 0, hi = arr.size();
        while (lo < hi) {
            int mid = (lo + hi) >>> 1;
            if (arr.get(mid).getFechaInicio().isBefore(objetivo)) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }
}

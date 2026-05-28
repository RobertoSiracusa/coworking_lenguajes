package com.coworking.reservations.algorithm;

import com.coworking.reservations.model.Reserva;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

// Interval Tree para detectar solapamiento de horarios en O(log n).
// Cada nodo guarda un intervalo (inicio, fin) y maxFin del subarbol.
public class IntervalTree {

    private static class Nodo {
        Reserva reserva;
        LocalDateTime inicio;
        LocalDateTime fin;
        LocalDateTime maxFin;
        Nodo izq;
        Nodo der;
        int altura;

        Nodo(Reserva r) {
            this.reserva = r;
            this.inicio = r.getFechaInicio();
            this.fin = r.getFechaFin();
            this.maxFin = r.getFechaFin();
            this.altura = 1;
        }
    }

    private Nodo raiz;
    private int tamanio = 0;

    // O(log n) - inserta intervalo
    public void insertar(Reserva r) {
        raiz = insertarRec(raiz, r);
        tamanio++;
    }

    // O(log n) - elimina por id de reserva
    public boolean eliminar(Long reservaId) {
        int antes = tamanio;
        raiz = eliminarRec(raiz, reservaId);
        return tamanio < antes;
    }

    // O(log n + k) - busca solapamientos con [inicio, fin) en un espacio especifico
    public List<Reserva> buscarSolapamientos(Long espacioId, LocalDateTime inicio, LocalDateTime fin, Long ignorarId) {
        List<Reserva> resultado = new ArrayList<>();
        buscarRec(raiz, espacioId, inicio, fin, ignorarId, resultado);
        return resultado;
    }

    // Existe algun solapamiento en el espacio dado
    public boolean haySolapamiento(Long espacioId, LocalDateTime inicio, LocalDateTime fin, Long ignorarId) {
        return !buscarSolapamientos(espacioId, inicio, fin, ignorarId).isEmpty();
    }

    public int tamanio() {
        return tamanio;
    }

    // Insertar con balanceo AVL
    private Nodo insertarRec(Nodo nodo, Reserva r) {
        if (nodo == null) return new Nodo(r);
        if (r.getFechaInicio().isBefore(nodo.inicio)) {
            nodo.izq = insertarRec(nodo.izq, r);
        } else {
            nodo.der = insertarRec(nodo.der, r);
        }
        actualizarAlturaYMax(nodo);
        return balancear(nodo);
    }

    private Nodo eliminarRec(Nodo nodo, Long id) {
        if (nodo == null) return null;
        if (nodo.reserva.getId().equals(id)) {
            tamanio--;
            if (nodo.izq == null) return nodo.der;
            if (nodo.der == null) return nodo.izq;
            // Buscar sucesor inorder
            Nodo sucesor = minimo(nodo.der);
            nodo.reserva = sucesor.reserva;
            nodo.inicio = sucesor.inicio;
            nodo.fin = sucesor.fin;
            tamanio++;
            nodo.der = eliminarRec(nodo.der, sucesor.reserva.getId());
        } else {
            nodo.izq = eliminarRec(nodo.izq, id);
            nodo.der = eliminarRec(nodo.der, id);
        }
        actualizarAlturaYMax(nodo);
        return balancear(nodo);
    }

    // Recorre el arbol descartando subarboles que no pueden tener solapamiento
    private void buscarRec(Nodo nodo, Long espacioId, LocalDateTime inicio, LocalDateTime fin,
                            Long ignorarId, List<Reserva> resultado) {
        if (nodo == null) return;
        if (nodo.maxFin.isBefore(inicio) || nodo.maxFin.isEqual(inicio)) return;
        if (nodo.izq != null) buscarRec(nodo.izq, espacioId, inicio, fin, ignorarId, resultado);
        boolean solapa = nodo.inicio.isBefore(fin) && nodo.fin.isAfter(inicio);
        boolean esIgnorado = ignorarId != null && nodo.reserva.getId().equals(ignorarId);
        boolean mismoEspacio = espacioId == null || nodo.reserva.getEspacioId().equals(espacioId);
        Reserva.EstadoReserva est = nodo.reserva.getEstado();
        boolean activa = est == Reserva.EstadoReserva.PENDIENTE
                       || est == Reserva.EstadoReserva.CONFIRMADA
                       || est == Reserva.EstadoReserva.PAGADA;
        if (solapa && !esIgnorado && activa && mismoEspacio) {
            resultado.add(nodo.reserva);
        }
        if (!nodo.inicio.isAfter(fin) && !nodo.inicio.isEqual(fin)) {
            if (nodo.der != null) buscarRec(nodo.der, espacioId, inicio, fin, ignorarId, resultado);
        }
    }

    private Nodo minimo(Nodo nodo) {
        while (nodo.izq != null) nodo = nodo.izq;
        return nodo;
    }

    private int alt(Nodo n) {
        return n == null ? 0 : n.altura;
    }

    private LocalDateTime maxFin(Nodo n) {
        return n == null ? null : n.maxFin;
    }

    private void actualizarAlturaYMax(Nodo nodo) {
        nodo.altura = 1 + Math.max(alt(nodo.izq), alt(nodo.der));
        LocalDateTime max = nodo.fin;
        if (nodo.izq != null && nodo.izq.maxFin.isAfter(max)) max = nodo.izq.maxFin;
        if (nodo.der != null && nodo.der.maxFin.isAfter(max)) max = nodo.der.maxFin;
        nodo.maxFin = max;
    }

    private int factorBalance(Nodo n) {
        return alt(n.izq) - alt(n.der);
    }

    // Rotaciones AVL
    private Nodo balancear(Nodo nodo) {
        int fb = factorBalance(nodo);
        if (fb > 1) {
            if (factorBalance(nodo.izq) < 0) nodo.izq = rotarIzquierda(nodo.izq);
            return rotarDerecha(nodo);
        }
        if (fb < -1) {
            if (factorBalance(nodo.der) > 0) nodo.der = rotarDerecha(nodo.der);
            return rotarIzquierda(nodo);
        }
        return nodo;
    }

    private Nodo rotarDerecha(Nodo y) {
        Nodo x = y.izq;
        y.izq = x.der;
        x.der = y;
        actualizarAlturaYMax(y);
        actualizarAlturaYMax(x);
        return x;
    }

    private Nodo rotarIzquierda(Nodo x) {
        Nodo y = x.der;
        x.der = y.izq;
        y.izq = x;
        actualizarAlturaYMax(x);
        actualizarAlturaYMax(y);
        return y;
    }
}

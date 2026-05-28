package com.coworking.reservations.algorithm;

import com.coworking.reservations.model.Reserva;
import org.springframework.stereotype.Component;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

// Min-heap de reservas. 1=URGENTE sale primero, 3=FLEXIBLE ultimo.
@Component
public class ColaPrioridad {

    private final List<Reserva> heap = new ArrayList<>();

    // O(log n) - inserta y sube
    public void insertar(Reserva reserva) {
        heap.add(reserva);
        subirUltimo();
    }

    // O(log n) - extrae raiz y baja
    public Optional<Reserva> extraerMax() {
        if (heap.isEmpty()) return Optional.empty();
        if (heap.size() == 1) return Optional.of(heap.remove(0));

        Reserva raiz = heap.get(0);
        heap.set(0, heap.remove(heap.size() - 1));
        bajarRaiz();
        return Optional.of(raiz);
    }

    // O(1) - ver siguiente sin extraer
    public Optional<Reserva> verSiguiente() {
        return heap.isEmpty() ? Optional.empty() : Optional.of(heap.get(0));
    }

    public List<Reserva> verCola() {
        List<Reserva> copia = new ArrayList<>(heap);
        copia.sort((a, b) -> Integer.compare(a.getPrioridad(), b.getPrioridad()));
        return copia;
    }

    public int tamanio() {
        return heap.size();
    }

    public boolean estaVacia() {
        return heap.isEmpty();
    }

    // Eliminar por id - O(n)
    public boolean eliminarPorId(Long id) {
        for (int i = 0; i < heap.size(); i++) {
            if (heap.get(i).getId().equals(id)) {
                heap.set(i, heap.remove(heap.size() - 1));
                if (i < heap.size()) {
                    bajarDesde(i);
                    subirDesde(i);
                }
                return true;
            }
        }
        return false;
    }

    // Heapify up del ultimo elemento
    private void subirUltimo() {
        subirDesde(heap.size() - 1);
    }

    private void subirDesde(int i) {
        while (i > 0) {
            int padre = (i - 1) / 2;
            if (heap.get(i).getPrioridad() < heap.get(padre).getPrioridad()) {
                intercambiar(i, padre);
                i = padre;
            } else {
                break;
            }
        }
    }

    private void bajarRaiz() {
        bajarDesde(0);
    }

    private void bajarDesde(int i) {
        int n = heap.size();
        while (true) {
            int menorIdx = i;
            int izq = 2 * i + 1;
            int der = 2 * i + 2;
            if (izq < n && heap.get(izq).getPrioridad() < heap.get(menorIdx).getPrioridad()) {
                menorIdx = izq;
            }
            if (der < n && heap.get(der).getPrioridad() < heap.get(menorIdx).getPrioridad()) {
                menorIdx = der;
            }
            if (menorIdx == i) break;
            intercambiar(i, menorIdx);
            i = menorIdx;
        }
    }

    private void intercambiar(int i, int j) {
        Reserva temp = heap.get(i);
        heap.set(i, heap.get(j));
        heap.set(j, temp);
    }
}

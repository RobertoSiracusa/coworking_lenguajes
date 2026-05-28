package com.coworking.reservations.algorithm;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.ArrayList;

// Cache LRU desde cero: lista doblemente enlazada + hash map. O(1) get/put.
public class CacheLRU<K, V> {

    // Nodo de la lista enlazada
    private static class Nodo<K, V> {
        K clave;
        V valor;
        Nodo<K, V> prev;
        Nodo<K, V> next;

        Nodo(K clave, V valor) {
            this.clave = clave;
            this.valor = valor;
        }
    }

    private final int capacidad;
    private final Map<K, Nodo<K, V>> mapa;
    private final Nodo<K, V> head;
    private final Nodo<K, V> tail;
    private long hits = 0;
    private long misses = 0;

    public CacheLRU(int capacidad) {
        this.capacidad = capacidad;
        this.mapa = new HashMap<>();
        // Dummy head y tail
        this.head = new Nodo<>(null, null);
        this.tail = new Nodo<>(null, null);
        head.next = tail;
        tail.prev = head;
    }

    // O(1) - retorna valor o null
    public synchronized V get(K clave) {
        Nodo<K, V> nodo = mapa.get(clave);
        if (nodo == null) {
            misses++;
            return null;
        }
        moverAlFrente(nodo);
        hits++;
        return nodo.valor;
    }

    // O(1) - inserta o actualiza
    public synchronized void put(K clave, V valor) {
        Nodo<K, V> existente = mapa.get(clave);
        if (existente != null) {
            existente.valor = valor;
            moverAlFrente(existente);
            return;
        }
        Nodo<K, V> nodo = new Nodo<>(clave, valor);
        mapa.put(clave, nodo);
        insertarAlFrente(nodo);

        // Evict el menos usado
        if (mapa.size() > capacidad) {
            Nodo<K, V> lru = tail.prev;
            remover(lru);
            mapa.remove(lru.clave);
        }
    }

    public synchronized boolean eliminar(K clave) {
        Nodo<K, V> nodo = mapa.get(clave);
        if (nodo == null) return false;
        remover(nodo);
        mapa.remove(clave);
        return true;
    }

    public synchronized int tamanio() {
        return mapa.size();
    }

    public synchronized Map<String, Object> estadisticas() {
        long total = hits + misses;
        double hitRate = total > 0 ? Math.round((hits * 10000.0 / total)) / 100.0 : 0.0;
        List<String> claves = new ArrayList<>();
        for (K k : mapa.keySet()) claves.add(String.valueOf(k));
        Map<String, Object> stats = new HashMap<>();
        stats.put("capacidad", capacidad);
        stats.put("tamanio", mapa.size());
        stats.put("hits", hits);
        stats.put("misses", misses);
        stats.put("hit_rate", hitRate);
        stats.put("claves", claves);
        return stats;
    }

    // Insertar nodo justo despues de head
    private void insertarAlFrente(Nodo<K, V> nodo) {
        nodo.next = head.next;
        nodo.prev = head;
        head.next.prev = nodo;
        head.next = nodo;
    }

    private void remover(Nodo<K, V> nodo) {
        nodo.prev.next = nodo.next;
        nodo.next.prev = nodo.prev;
    }

    private void moverAlFrente(Nodo<K, V> nodo) {
        remover(nodo);
        insertarAlFrente(nodo);
    }
}

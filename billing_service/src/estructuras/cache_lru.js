// Cache LRU con lista doblemente enlazada + hash map. O(1) get/put.

class Nodo {
  constructor(clave, valor) {
    this.clave = clave;
    this.valor = valor;
    this.prev  = null;
    this.next  = null;
  }
}

class CacheLRU {
  constructor(capacidad = 100) {
    this.capacidad = capacidad;
    this.mapa = new Map();
    // Dummy head y tail para simplificar inserciones
    this.head = new Nodo(null, null);
    this.tail = new Nodo(null, null);
    this.head.next = this.tail;
    this.tail.prev = this.head;
    this.hits = 0;
    this.misses = 0;
  }

  // Insertar nodo justo despues de head
  _insertar_al_frente(nodo) {
    nodo.next = this.head.next;
    nodo.prev = this.head;
    this.head.next.prev = nodo;
    this.head.next = nodo;
  }

  // Remover nodo de la lista
  _remover(nodo) {
    nodo.prev.next = nodo.next;
    nodo.next.prev = nodo.prev;
  }

  // Mover nodo existente al frente
  _mover_al_frente(nodo) {
    this._remover(nodo);
    this._insertar_al_frente(nodo);
  }

  // O(1) - retorna valor o null
  get(clave) {
    const nodo = this.mapa.get(clave);
    if (!nodo) {
      this.misses++;
      return null;
    }
    this._mover_al_frente(nodo);
    this.hits++;
    return nodo.valor;
  }

  // O(1) - inserta o actualiza
  put(clave, valor) {
    const existente = this.mapa.get(clave);
    if (existente) {
      existente.valor = valor;
      this._mover_al_frente(existente);
      return;
    }
    const nodo = new Nodo(clave, valor);
    this.mapa.set(clave, nodo);
    this._insertar_al_frente(nodo);

    // Evict el menos usado si excede capacidad
    if (this.mapa.size > this.capacidad) {
      const lru = this.tail.prev;
      this._remover(lru);
      this.mapa.delete(lru.clave);
    }
  }

  eliminar(clave) {
    const nodo = this.mapa.get(clave);
    if (!nodo) return false;
    this._remover(nodo);
    this.mapa.delete(clave);
    return true;
  }

  tamanio() {
    return this.mapa.size;
  }

  estadisticas() {
    const total = this.hits + this.misses;
    return {
      capacidad:  this.capacidad,
      tamanio:    this.mapa.size,
      hits:       this.hits,
      misses:     this.misses,
      hit_rate:   total > 0 ? Math.round((this.hits / total) * 10000) / 100 : 0,
      claves:     Array.from(this.mapa.keys()),
    };
  }

  // Vaciar completamente el cache (resetea contadores tambien)
  vaciar() {
    this.mapa.clear();
    this.head.next = this.tail;
    this.tail.prev = this.head;
    this.hits = 0;
    this.misses = 0;
  }
}

// Singletons compartidos
const cache_usuarios = new CacheLRU(100);
const cache_reportes = new CacheLRU(50);

module.exports = { CacheLRU, cache_usuarios, cache_reportes };

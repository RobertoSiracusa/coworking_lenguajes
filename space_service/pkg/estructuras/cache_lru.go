package estructuras

import "sync"

// Cache LRU desde cero: doubly linked list + map. O(1) get/put.

type nodo struct {
	clave interface{}
	valor interface{}
	prev  *nodo
	next  *nodo
}

type CacheLRU struct {
	capacidad int
	mapa      map[interface{}]*nodo
	head      *nodo
	tail      *nodo
	hits      int64
	misses    int64
	mu        sync.Mutex
}

func NewCacheLRU(capacidad int) *CacheLRU {
	head := &nodo{}
	tail := &nodo{}
	head.next = tail
	tail.prev = head
	return &CacheLRU{
		capacidad: capacidad,
		mapa:      make(map[interface{}]*nodo),
		head:      head,
		tail:      tail,
	}
}

// O(1)
func (c *CacheLRU) Get(clave interface{}) (interface{}, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	n, ok := c.mapa[clave]
	if !ok {
		c.misses++
		return nil, false
	}
	c.moverAlFrente(n)
	c.hits++
	return n.valor, true
}

// O(1)
func (c *CacheLRU) Put(clave, valor interface{}) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if n, ok := c.mapa[clave]; ok {
		n.valor = valor
		c.moverAlFrente(n)
		return
	}
	n := &nodo{clave: clave, valor: valor}
	c.mapa[clave] = n
	c.insertarAlFrente(n)

	// Evict el menos usado
	if len(c.mapa) > c.capacidad {
		lru := c.tail.prev
		c.remover(lru)
		delete(c.mapa, lru.clave)
	}
}

func (c *CacheLRU) Eliminar(clave interface{}) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	n, ok := c.mapa[clave]
	if !ok {
		return false
	}
	c.remover(n)
	delete(c.mapa, clave)
	return true
}

func (c *CacheLRU) Tamanio() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.mapa)
}

func (c *CacheLRU) Estadisticas() map[string]interface{} {
	c.mu.Lock()
	defer c.mu.Unlock()
	total := c.hits + c.misses
	var hitRate float64
	if total > 0 {
		hitRate = float64(c.hits) / float64(total) * 100
	}
	return map[string]interface{}{
		"capacidad": c.capacidad,
		"tamanio":   len(c.mapa),
		"hits":      c.hits,
		"misses":    c.misses,
		"hit_rate":  hitRate,
	}
}

// Insertar nodo justo despues de head
func (c *CacheLRU) insertarAlFrente(n *nodo) {
	n.next = c.head.next
	n.prev = c.head
	c.head.next.prev = n
	c.head.next = n
}

func (c *CacheLRU) remover(n *nodo) {
	n.prev.next = n.next
	n.next.prev = n.prev
}

func (c *CacheLRU) moverAlFrente(n *nodo) {
	c.remover(n)
	c.insertarAlFrente(n)
}

func (c *CacheLRU) Vaciar() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.mapa = make(map[interface{}]*nodo)
	c.head.next = c.tail
	c.tail.prev = c.head
	c.hits = 0
	c.misses = 0
}


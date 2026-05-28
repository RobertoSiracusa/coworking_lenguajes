package estructuras

import (
	"sort"
	"strings"
	"sync"
)

// Trie (arbol de prefijos) para autocomplete. Insertar O(L), buscar prefijo O(L+k).

type nodoTrie struct {
	hijos    map[rune]*nodoTrie
	fin      bool
	palabras []string
}

type Trie struct {
	raiz *nodoTrie
	mu   sync.RWMutex
}

func NewTrie() *Trie {
	return &Trie{
		raiz: &nodoTrie{hijos: make(map[rune]*nodoTrie)},
	}
}

// Insertar palabra. O(L) donde L = longitud.
func (t *Trie) Insertar(palabra string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	palabraLower := strings.ToLower(palabra)
	actual := t.raiz
	for _, c := range palabraLower {
		if _, ok := actual.hijos[c]; !ok {
			actual.hijos[c] = &nodoTrie{hijos: make(map[rune]*nodoTrie)}
		}
		actual = actual.hijos[c]
	}
	actual.fin = true
	actual.palabras = append(actual.palabras, palabra)
}

// Sugerencias por prefijo. O(L + k) donde k = sugerencias.
func (t *Trie) Sugerir(prefijo string, max int) []string {
	t.mu.RLock()
	defer t.mu.RUnlock()
	prefijoLower := strings.ToLower(prefijo)
	actual := t.raiz
	for _, c := range prefijoLower {
		nodo, ok := actual.hijos[c]
		if !ok {
			return []string{}
		}
		actual = nodo
	}
	var resultados []string
	t.recolectar(actual, &resultados, max)
	sort.Strings(resultados)
	return resultados
}

// DFS recolectando palabras desde el nodo
func (t *Trie) recolectar(nodo *nodoTrie, resultados *[]string, max int) {
	if len(*resultados) >= max {
		return
	}
	if nodo.fin {
		*resultados = append(*resultados, nodo.palabras...)
	}
	for _, hijo := range nodo.hijos {
		if len(*resultados) >= max {
			return
		}
		t.recolectar(hijo, resultados, max)
	}
}

func (t *Trie) Eliminar(palabra string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.eliminarRec(t.raiz, strings.ToLower(palabra), palabra, 0)
}

func (t *Trie) eliminarRec(nodo *nodoTrie, palabraLower, original string, depth int) bool {
	if depth == len(palabraLower) {
		if !nodo.fin {
			return false
		}
		// Remover original de palabras
		nuevas := nodo.palabras[:0]
		for _, p := range nodo.palabras {
			if p != original {
				nuevas = append(nuevas, p)
			}
		}
		nodo.palabras = nuevas
		if len(nodo.palabras) == 0 {
			nodo.fin = false
		}
		return true
	}
	c := rune(palabraLower[depth])
	hijo, ok := nodo.hijos[c]
	if !ok {
		return false
	}
	return t.eliminarRec(hijo, palabraLower, original, depth+1)
}

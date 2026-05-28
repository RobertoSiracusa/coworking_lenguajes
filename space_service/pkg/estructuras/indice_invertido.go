package estructuras

import (
	"strings"
	"sync"
	"unicode"
)

// Indice invertido: palabra -> set de ids. Busqueda por palabras clave O(palabras * k).

type IndiceInvertido struct {
	indice map[string]map[uint]bool
	mu     sync.RWMutex
}

func NewIndiceInvertido() *IndiceInvertido {
	return &IndiceInvertido{
		indice: make(map[string]map[uint]bool),
	}
}

// Tokenizar texto: minusculas + split por no-alfanumerico
func tokenizar(texto string) []string {
	texto = strings.ToLower(texto)
	tokens := strings.FieldsFunc(texto, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
	return tokens
}

// Indexar texto bajo un id
func (i *IndiceInvertido) Indexar(id uint, texto string) {
	i.mu.Lock()
	defer i.mu.Unlock()
	for _, palabra := range tokenizar(texto) {
		if _, ok := i.indice[palabra]; !ok {
			i.indice[palabra] = make(map[uint]bool)
		}
		i.indice[palabra][id] = true
	}
}

// Eliminar todas las apariciones de un id
func (i *IndiceInvertido) Eliminar(id uint) {
	i.mu.Lock()
	defer i.mu.Unlock()
	for palabra, ids := range i.indice {
		delete(ids, id)
		if len(ids) == 0 {
			delete(i.indice, palabra)
		}
	}
}

// Buscar ids que contengan TODAS las palabras (AND)
func (i *IndiceInvertido) Buscar(consulta string) []uint {
	i.mu.RLock()
	defer i.mu.RUnlock()
	palabras := tokenizar(consulta)
	if len(palabras) == 0 {
		return []uint{}
	}

	var resultado map[uint]bool
	for idx, palabra := range palabras {
		ids, ok := i.indice[palabra]
		if !ok {
			return []uint{}
		}
		if idx == 0 {
			resultado = make(map[uint]bool, len(ids))
			for id := range ids {
				resultado[id] = true
			}
		} else {
			// Interseccion AND
			for id := range resultado {
				if !ids[id] {
					delete(resultado, id)
				}
			}
		}
	}

	salida := make([]uint, 0, len(resultado))
	for id := range resultado {
		salida = append(salida, id)
	}
	return salida
}

func (i *IndiceInvertido) TotalPalabras() int {
	i.mu.RLock()
	defer i.mu.RUnlock()
	return len(i.indice)
}

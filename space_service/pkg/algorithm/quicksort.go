package algorithm

import (
	"strings"

	"github.com/coworking/space-service/internal/models"
)

// Quicksort manual con pivote mediana-de-tres. O(n log n) promedio, O(n^2) peor caso.

// OrdenarPor ordena espacios por el campo dado. Crea copia, no muta original.
func OrdenarPor(espacios []models.Espacio, campo string, ascendente bool) []models.Espacio {
	copia := make([]models.Espacio, len(espacios))
	copy(copia, espacios)
	if len(copia) > 1 {
		quicksort(copia, 0, len(copia)-1, comparador(campo, ascendente))
	}
	return copia
}

type comparar func(a, b models.Espacio) bool

// Retorna funcion de comparacion segun campo
func comparador(campo string, asc bool) comparar {
	switch campo {
	case "capacidad":
		return func(a, b models.Espacio) bool {
			if asc {
				return a.Capacidad < b.Capacidad
			}
			return a.Capacidad > b.Capacidad
		}
	case "nombre":
		return func(a, b models.Espacio) bool {
			la := strings.ToLower(a.Nombre)
			lb := strings.ToLower(b.Nombre)
			if asc {
				return la < lb
			}
			return la > lb
		}
	default: // precio
		return func(a, b models.Espacio) bool {
			if asc {
				return a.PrecioPorHora < b.PrecioPorHora
			}
			return a.PrecioPorHora > b.PrecioPorHora
		}
	}
}

func quicksort(arr []models.Espacio, lo, hi int, menor comparar) {
	if lo < hi {
		p := particionar(arr, lo, hi, menor)
		quicksort(arr, lo, p-1, menor)
		quicksort(arr, p+1, hi, menor)
	}
}

// Pivote mediana-de-tres para evitar O(n^2) en arrays ordenados
func particionar(arr []models.Espacio, lo, hi int, menor comparar) int {
	mid := lo + (hi-lo)/2
	if menor(arr[mid], arr[lo]) {
		arr[lo], arr[mid] = arr[mid], arr[lo]
	}
	if menor(arr[hi], arr[lo]) {
		arr[lo], arr[hi] = arr[hi], arr[lo]
	}
	if menor(arr[hi], arr[mid]) {
		arr[mid], arr[hi] = arr[hi], arr[mid]
	}
	pivote := arr[hi]
	i := lo - 1
	for j := lo; j < hi; j++ {
		if menor(arr[j], pivote) {
			i++
			arr[i], arr[j] = arr[j], arr[i]
		}
	}
	arr[i+1], arr[hi] = arr[hi], arr[i+1]
	return i + 1
}

// Compatibilidad con codigo viejo
func OrdenarPorPrecio(espacios []models.Espacio) []models.Espacio {
	return OrdenarPor(espacios, "precio", true)
}

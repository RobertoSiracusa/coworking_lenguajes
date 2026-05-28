package algorithm

import (
	"sort"
	"strings"

	"github.com/coworking/space-service/internal/models"
)

// O(n) - recorre todos los espacios
func BusquedaLineal(espacios []models.Espacio, query string) []models.Espacio {
	query = strings.ToLower(query)
	var resultado []models.Espacio
	for _, e := range espacios {
		if strings.Contains(strings.ToLower(e.Nombre), query) {
			resultado = append(resultado, e)
		}
	}
	return resultado
}

// O(n log n) sort + O(log n) busqueda + O(k) expansion
func BusquedaBinaria(espacios []models.Espacio, query string) []models.Espacio {
	if len(espacios) == 0 {
		return []models.Espacio{}
	}
	query = strings.ToLower(query)

	ordenados := make([]models.Espacio, len(espacios))
	copy(ordenados, espacios)
	sort.Slice(ordenados, func(i, j int) bool {
		return strings.ToLower(ordenados[i].Nombre) < strings.ToLower(ordenados[j].Nombre)
	})

	pos := sort.Search(len(ordenados), func(i int) bool {
		return strings.ToLower(ordenados[i].Nombre) >= query
	})

	var resultado []models.Espacio
	for i := pos; i < len(ordenados); i++ {
		if strings.Contains(strings.ToLower(ordenados[i].Nombre), query) {
			resultado = append(resultado, ordenados[i])
		}
	}
	for i := pos - 1; i >= 0; i-- {
		if strings.Contains(strings.ToLower(ordenados[i].Nombre), query) {
			resultado = append(resultado, ordenados[i])
		}
	}
	return resultado
}

// Filtrar disponibles con filtros opcionales
func FiltrarDisponibles(espacios []models.Espacio, filtros models.FiltrosEspacio) []models.Espacio {
	var resultado []models.Espacio
	for _, e := range espacios {
		if filtros.CapacidadMin > 0 && e.Capacidad < filtros.CapacidadMin {
			continue
		}
		if filtros.PrecioMax > 0 && e.PrecioPorHora > filtros.PrecioMax {
			continue
		}
		if filtros.Disponible != nil && e.Disponible != *filtros.Disponible {
			continue
		}
		resultado = append(resultado, e)
	}
	return resultado
}

// Paginar slice. Limite max 100.
func Paginar(espacios []models.Espacio, pagina, porPagina int) models.Paginado {
	if pagina < 1 {
		pagina = 1
	}
	if porPagina < 1 {
		porPagina = 20
	}
	if porPagina > 100 {
		porPagina = 100
	}
	total := len(espacios)
	totalPaginas := (total + porPagina - 1) / porPagina
	inicio := (pagina - 1) * porPagina
	fin := inicio + porPagina
	if inicio > total {
		inicio = total
	}
	if fin > total {
		fin = total
	}
	return models.Paginado{
		Pagina:       pagina,
		PorPagina:    porPagina,
		Total:        total,
		TotalPaginas: totalPaginas,
		Datos:        espacios[inicio:fin],
	}
}

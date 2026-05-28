package algorithm

import (
	"math"
	"sort"

	"github.com/coworking/space-service/internal/models"
)

// Recomienda espacios similares al de referencia.
// Distancia euclidiana normalizada entre capacidad y precio. O(n log n).

type puntuado struct {
	espacio   models.Espacio
	distancia float64
}

func Similares(referencia models.Espacio, candidatos []models.Espacio, top int) []models.Espacio {
	if top <= 0 {
		top = 5
	}
	// Calcular rangos para normalizar
	var maxCap, minCap int = 1, math.MaxInt32
	var maxPre, minPre float64 = 1, math.MaxFloat64
	for _, e := range candidatos {
		if e.Capacidad > maxCap {
			maxCap = e.Capacidad
		}
		if e.Capacidad < minCap {
			minCap = e.Capacidad
		}
		if e.PrecioPorHora > maxPre {
			maxPre = e.PrecioPorHora
		}
		if e.PrecioPorHora < minPre {
			minPre = e.PrecioPorHora
		}
	}
	rangoCap := float64(maxCap - minCap)
	if rangoCap == 0 {
		rangoCap = 1
	}
	rangoPre := maxPre - minPre
	if rangoPre == 0 {
		rangoPre = 1
	}

	var resultados []puntuado
	for _, e := range candidatos {
		if e.ID == referencia.ID {
			continue
		}
		dCap := float64(e.Capacidad-referencia.Capacidad) / rangoCap
		dPre := (e.PrecioPorHora - referencia.PrecioPorHora) / rangoPre
		distancia := math.Sqrt(dCap*dCap + dPre*dPre)
		resultados = append(resultados, puntuado{e, distancia})
	}

	sort.Slice(resultados, func(i, j int) bool {
		return resultados[i].distancia < resultados[j].distancia
	})

	if top > len(resultados) {
		top = len(resultados)
	}
	salida := make([]models.Espacio, top)
	for i := 0; i < top; i++ {
		salida[i] = resultados[i].espacio
	}
	return salida
}

// Estadisticas agregadas del catalogo
func Estadisticas(espacios []models.Espacio) map[string]interface{} {
	total := len(espacios)
	if total == 0 {
		return map[string]interface{}{
			"total": 0,
		}
	}
	var disponibles, capacidadTotal int
	var sumaPrecios float64
	var precioMin, precioMax float64 = math.MaxFloat64, 0
	for _, e := range espacios {
		if e.Disponible {
			disponibles++
		}
		capacidadTotal += e.Capacidad
		sumaPrecios += e.PrecioPorHora
		if e.PrecioPorHora < precioMin {
			precioMin = e.PrecioPorHora
		}
		if e.PrecioPorHora > precioMax {
			precioMax = e.PrecioPorHora
		}
	}
	return map[string]interface{}{
		"total":            total,
		"disponibles":      disponibles,
		"no_disponibles":   total - disponibles,
		"capacidad_total":  capacidadTotal,
		"precio_promedio":  math.Round(sumaPrecios/float64(total)*100) / 100,
		"precio_minimo":    precioMin,
		"precio_maximo":    precioMax,
	}
}

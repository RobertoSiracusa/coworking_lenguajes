package handlers

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/coworking/space-service/internal/models"
	"github.com/coworking/space-service/internal/repository"
	"github.com/coworking/space-service/internal/servicios"
	"github.com/coworking/space-service/pkg/algorithm"
	"github.com/coworking/space-service/pkg/estructuras"
)

type EspacioHandler struct {
	repo            *repository.EspacioRepository
	cacheLRU        *estructuras.CacheLRU
	trie            *estructuras.Trie
	indiceInvertido *estructuras.IndiceInvertido
	reservation     *servicios.ReservationClient
}

func NewEspacioHandler(repo *repository.EspacioRepository) *EspacioHandler {
	h := &EspacioHandler{
		repo:            repo,
		cacheLRU:        estructuras.NewCacheLRU(100),
		trie:            estructuras.NewTrie(),
		indiceInvertido: estructuras.NewIndiceInvertido(),
		reservation:     servicios.NewReservationClient(),
	}
	h.cargarIndices()
	return h
}

// Cargar trie e indice invertido al arrancar
func (h *EspacioHandler) cargarIndices() {
	espacios, err := h.repo.ObtenerTodos()
	if err != nil {
		return
	}
	for _, e := range espacios {
		h.trie.Insertar(e.Nombre)
		h.indiceInvertido.Indexar(e.ID, e.Nombre+" "+e.Descripcion)
	}
	fmt.Printf("Indices cargados: %d espacios\n", len(espacios))
}

// GET /espacios - listado con filtros y paginacion
func (h *EspacioHandler) Listar(c *gin.Context) {
	espacios, err := h.repo.ObtenerTodos()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	filtros := h.parsearFiltros(c)
	if filtros.CapacidadMin > 0 || filtros.PrecioMax > 0 || filtros.Disponible != nil {
		espacios = algorithm.FiltrarDisponibles(espacios, filtros)
	}

	orden := c.DefaultQuery("orden", "precio")
	dir := c.DefaultQuery("dir", "asc")
	espacios = algorithm.OrdenarPor(espacios, orden, dir == "asc")

	pagina, _ := strconv.Atoi(c.DefaultQuery("pagina", "1"))
	porPagina, _ := strconv.Atoi(c.DefaultQuery("por_pagina", "20"))
	paginado := algorithm.Paginar(espacios, pagina, porPagina)

	c.JSON(http.StatusOK, paginado)
}

// GET /espacios/buscar?q=&algoritmo=lineal|binaria|indice
func (h *EspacioHandler) Buscar(c *gin.Context) {
	query := c.Query("q")
	algoritmo := c.DefaultQuery("algoritmo", "binaria")

	espacios, err := h.repo.ObtenerTodos()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var resultado []models.Espacio
	var nombreAlg string

	switch algoritmo {
	case "lineal":
		resultado = algorithm.BusquedaLineal(espacios, query)
		nombreAlg = "lineal O(n)"
	case "indice":
		// Indice invertido por palabras clave
		ids := h.indiceInvertido.Buscar(query)
		mapa := make(map[uint]bool)
		for _, id := range ids {
			mapa[id] = true
		}
		for _, e := range espacios {
			if mapa[e.ID] {
				resultado = append(resultado, e)
			}
		}
		nombreAlg = "indice invertido O(palabras * k)"
	default:
		resultado = algorithm.BusquedaBinaria(espacios, query)
		nombreAlg = "binaria O(n log n) sort + O(log n) busqueda"
	}

	c.JSON(http.StatusOK, gin.H{
		"query":      query,
		"algoritmo":  nombreAlg,
		"resultados": resultado,
		"total":      len(resultado),
	})
}

// GET /espacios/sugerir?q=&max=10 - autocomplete via Trie
func (h *EspacioHandler) Sugerir(c *gin.Context) {
	prefijo := c.Query("q")
	max, _ := strconv.Atoi(c.DefaultQuery("max", "10"))
	sugerencias := h.trie.Sugerir(prefijo, max)
	c.JSON(http.StatusOK, gin.H{
		"prefijo":      prefijo,
		"estructura":   "Trie O(L + k)",
		"sugerencias":  sugerencias,
		"total":        len(sugerencias),
	})
}

// GET /espacios/disponibles - con filtros + orden
func (h *EspacioHandler) Disponibles(c *gin.Context) {
	capacidad, _ := strconv.Atoi(c.DefaultQuery("capacidad", "1"))
	orden := c.DefaultQuery("orden", "precio")

	espacios, err := h.repo.ObtenerTodos()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	disponible := true
	filtros := models.FiltrosEspacio{
		CapacidadMin: capacidad,
		Disponible:   &disponible,
	}
	filtrados := algorithm.FiltrarDisponibles(espacios, filtros)
	filtrados = algorithm.OrdenarPor(filtrados, orden, true)

	c.JSON(http.StatusOK, gin.H{
		"capacidad_minima": capacidad,
		"orden":            orden,
		"espacios":         filtrados,
		"total":            len(filtrados),
	})
}

// GET /espacios/estadisticas - resumen agregado
func (h *EspacioHandler) Estadisticas(c *gin.Context) {
	espacios, err := h.repo.ObtenerTodos()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, algorithm.Estadisticas(espacios))
}

// GET /espacios/:id
func (h *EspacioHandler) ObtenerPorID(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID invalido"})
		return
	}

	// Intentar cache primero
	if v, ok := h.cacheLRU.Get(uint(id)); ok {
		c.JSON(http.StatusOK, v)
		return
	}

	e, err := h.repo.ObtenerPorID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Espacio no encontrado"})
		return
	}
	h.cacheLRU.Put(uint(id), e)
	c.JSON(http.StatusOK, e)
}

// GET /espacios/:id/disponibilidad?fecha=YYYY-MM-DD - consulta reservation service
func (h *EspacioHandler) Disponibilidad(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID invalido"})
		return
	}
	fecha := c.Query("fecha")
	if fecha == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Parametro fecha requerido"})
		return
	}

	espacio, err := h.repo.ObtenerPorID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Espacio no encontrado"})
		return
	}

	token, _ := c.Get("token")
	disponible, _ := h.reservation.VerificarDisponibilidad(uint(id), fecha, token.(string))

	c.JSON(http.StatusOK, gin.H{
		"espacio_id":          espacio.ID,
		"nombre":              espacio.Nombre,
		"fecha":               fecha,
		"disponible_catalogo": espacio.Disponible,
		"sin_reservas":        disponible,
		"libre":               espacio.Disponible && disponible,
	})
}

// GET /espacios/:id/similares?top=5 - recomendacion por capacidad/precio
func (h *EspacioHandler) Similares(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID invalido"})
		return
	}
	top, _ := strconv.Atoi(c.DefaultQuery("top", "5"))

	ref, err := h.repo.ObtenerPorID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Espacio no encontrado"})
		return
	}
	candidatos, _ := h.repo.ObtenerTodos()
	similares := algorithm.Similares(*ref, candidatos, top)

	c.JSON(http.StatusOK, gin.H{
		"referencia": ref,
		"algoritmo":  "distancia euclidiana normalizada O(n log n)",
		"top":        top,
		"similares":  similares,
	})
}

// GET /espacios/enriquecidos - listado con conteo de reservas activas
func (h *EspacioHandler) Enriquecidos(c *gin.Context) {
	espacios, err := h.repo.ObtenerTodos()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	token, _ := c.Get("token")
	enriquecidos := make([]models.EspacioEnriquecido, 0, len(espacios))
	for _, e := range espacios {
		conteo := h.reservation.ConteoReservasActivas(e.ID, token.(string))
		enriquecidos = append(enriquecidos, models.EspacioEnriquecido{
			Espacio:         e,
			ReservasActivas: conteo,
		})
	}
	c.JSON(http.StatusOK, gin.H{
		"total":    len(enriquecidos),
		"espacios": enriquecidos,
	})
}

// POST /espacios - admin
func (h *EspacioHandler) Crear(c *gin.Context) {
	var req models.EspacioRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	e, err := h.repo.Crear(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// Actualizar indices
	h.trie.Insertar(e.Nombre)
	h.indiceInvertido.Indexar(e.ID, e.Nombre+" "+e.Descripcion)
	c.JSON(http.StatusCreated, e)
}

// PUT /espacios/:id - admin
func (h *EspacioHandler) Actualizar(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
	var req models.EspacioRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// Invalidar cache y reindexar
	h.cacheLRU.Eliminar(uint(id))
	h.indiceInvertido.Eliminar(uint(id))

	e, err := h.repo.Actualizar(uint(id), req)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Espacio no encontrado"})
		return
	}
	h.trie.Insertar(e.Nombre)
	h.indiceInvertido.Indexar(e.ID, e.Nombre+" "+e.Descripcion)
	c.JSON(http.StatusOK, e)
}

// PATCH /espacios/:id/disponibilidad
func (h *EspacioHandler) CambiarDisponibilidad(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
	var body struct {
		Disponible bool `json:"disponible"`
	}
	c.ShouldBindJSON(&body)
	h.cacheLRU.Eliminar(uint(id))
	e, err := h.repo.CambiarDisponibilidad(uint(id), body.Disponible)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Espacio no encontrado"})
		return
	}
	c.JSON(http.StatusOK, e)
}

// DELETE /espacios/:id - admin
func (h *EspacioHandler) Eliminar(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID invalido"})
		return
	}
	if err := h.repo.Eliminar(uint(id)); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Espacio no encontrado"})
		return
	}
	h.cacheLRU.Eliminar(uint(id))
	h.indiceInvertido.Eliminar(uint(id))
	c.JSON(http.StatusOK, gin.H{"mensaje": "Espacio eliminado", "id": id})
}

// DELETE /espacios/reset - admin
func (h *EspacioHandler) Reset(c *gin.Context) {
	if err := h.repo.Reset(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.cacheLRU.Vaciar()
	h.trie = estructuras.NewTrie()
	h.indiceInvertido = estructuras.NewIndiceInvertido()
	c.JSON(http.StatusOK, gin.H{"mensaje": "Todos los espacios han sido eliminados de la base de datos y memoria."})
}


// GET /cache/estadisticas - stats de todas las estructuras
func (h *EspacioHandler) EstadisticasCache(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"cache_lru":         h.cacheLRU.Estadisticas(),
		"cache_reservation": h.reservation.Estadisticas(),
		"trie_cargado":      true,
		"indice_palabras":   h.indiceInvertido.TotalPalabras(),
	})
}

// Parsear filtros desde query params
func (h *EspacioHandler) parsearFiltros(c *gin.Context) models.FiltrosEspacio {
	f := models.FiltrosEspacio{}
	if v, err := strconv.Atoi(c.Query("capacidad_min")); err == nil {
		f.CapacidadMin = v
	}
	if v, err := strconv.ParseFloat(c.Query("precio_max"), 64); err == nil {
		f.PrecioMax = v
	}
	if disp := c.Query("disponible"); disp != "" {
		b := disp == "true"
		f.Disponible = &b
	}
	return f
}

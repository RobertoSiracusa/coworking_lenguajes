package models

import "time"

type Espacio struct {
	ID            uint      `json:"id"              gorm:"primaryKey"`
	Nombre        string    `json:"nombre"          gorm:"not null"`
	Descripcion   string    `json:"descripcion"`
	Capacidad     int       `json:"capacidad"       gorm:"not null"`
	PrecioPorHora float64   `json:"precio_por_hora" gorm:"not null"`
	Disponible    bool      `json:"disponible"      gorm:"default:true"`
	CreadoEn      time.Time `json:"creado_en"       gorm:"autoCreateTime"`
}

type EspacioRequest struct {
	Nombre        string  `json:"nombre"          binding:"required,min=1"`
	Descripcion   string  `json:"descripcion"`
	Capacidad     int     `json:"capacidad"       binding:"required,min=1"`
	PrecioPorHora float64 `json:"precio_por_hora" binding:"required,min=0"`
}

// Espacio enriquecido con info de reservas
type EspacioEnriquecido struct {
	Espacio
	ReservasActivas int `json:"reservas_activas"`
}

// Filtros para listado
type FiltrosEspacio struct {
	CapacidadMin int
	PrecioMax    float64
	Disponible   *bool
}

// Respuesta paginada
type Paginado struct {
	Pagina       int         `json:"pagina"`
	PorPagina    int         `json:"por_pagina"`
	Total        int         `json:"total"`
	TotalPaginas int         `json:"total_paginas"`
	Datos        interface{} `json:"datos"`
}

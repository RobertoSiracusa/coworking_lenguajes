package servicios

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/coworking/space-service/pkg/estructuras"
)

// Cliente HTTP al reservation service. Consulta conteo de reservas activas por espacio.

type ReservationClient struct {
	urlBase string
	cliente *http.Client
	cache   *estructuras.CacheLRU
}

func NewReservationClient() *ReservationClient {
	url := os.Getenv("RESERVATION_SERVICE_URL")
	if url == "" {
		url = "http://reservation-service:8003"
	}
	return &ReservationClient{
		urlBase: url,
		cliente: &http.Client{Timeout: 3 * time.Second},
		cache:   estructuras.NewCacheLRU(100),
	}
}

// Conteo de reservas activas (PENDIENTE + CONFIRMADA) para un espacio
func (r *ReservationClient) ConteoReservasActivas(espacioID uint, jwt string) int {
	clave := fmt.Sprintf("conteo:%d", espacioID)
	if v, ok := r.cache.Get(clave); ok {
		return v.(int)
	}

	req, err := http.NewRequest("GET", r.urlBase+"/reservas?por_pagina=100", nil)
	if err != nil {
		return 0
	}
	req.Header.Set("Authorization", "Bearer "+jwt)

	resp, err := r.cliente.Do(req)
	if err != nil || resp.StatusCode != 200 {
		return 0
	}
	defer resp.Body.Close()

	cuerpo, _ := io.ReadAll(resp.Body)
	var datos struct {
		Datos []struct {
			EspacioID uint   `json:"espacioId"`
			Estado    string `json:"estado"`
		} `json:"datos"`
	}
	if err := json.Unmarshal(cuerpo, &datos); err != nil {
		return 0
	}

	conteo := 0
	for _, d := range datos.Datos {
		if d.EspacioID == espacioID &&
			(d.Estado == "PENDIENTE" || d.Estado == "CONFIRMADA") {
			conteo++
		}
	}
	r.cache.Put(clave, conteo)
	return conteo
}

// Verificar disponibilidad consultando si hay conflictos en una fecha
func (r *ReservationClient) VerificarDisponibilidad(espacioID uint, fecha, jwt string) (bool, error) {
	url := fmt.Sprintf("%s/reservas/buscar-fecha?fecha=%s", r.urlBase, fecha)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("Authorization", "Bearer "+jwt)

	resp, err := r.cliente.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		// Si no tiene permiso admin, asumir disponible
		return true, nil
	}

	cuerpo, _ := io.ReadAll(resp.Body)
	var datos struct {
		Resultados []struct {
			EspacioID uint   `json:"espacioId"`
			Estado    string `json:"estado"`
		} `json:"resultados"`
	}
	if err := json.Unmarshal(cuerpo, &datos); err != nil {
		return true, nil
	}

	for _, d := range datos.Resultados {
		if d.EspacioID == espacioID &&
			(strings.EqualFold(d.Estado, "PENDIENTE") || strings.EqualFold(d.Estado, "CONFIRMADA")) {
			return false, nil
		}
	}
	return true, nil
}

func (r *ReservationClient) Estadisticas() map[string]interface{} {
	return r.cache.Estadisticas()
}

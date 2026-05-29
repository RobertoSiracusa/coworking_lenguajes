package repository

import (
	"github.com/coworking/space-service/internal/models"
	"gorm.io/gorm"
)

type EspacioRepository struct {
	db *gorm.DB
}

func NewEspacioRepository(db *gorm.DB) *EspacioRepository {
	return &EspacioRepository{db: db}
}

func (r *EspacioRepository) Crear(req models.EspacioRequest) (*models.Espacio, error) {
	e := models.Espacio{
		Nombre:        req.Nombre,
		Descripcion:   req.Descripcion,
		Capacidad:     req.Capacidad,
		PrecioPorHora: req.PrecioPorHora,
		Disponible:    true,
	}
	return &e, r.db.Create(&e).Error
}

func (r *EspacioRepository) ObtenerTodos() ([]models.Espacio, error) {
	var espacios []models.Espacio
	return espacios, r.db.Find(&espacios).Error
}

func (r *EspacioRepository) ObtenerPorID(id uint) (*models.Espacio, error) {
	var e models.Espacio
	return &e, r.db.First(&e, id).Error
}

func (r *EspacioRepository) Actualizar(id uint, req models.EspacioRequest) (*models.Espacio, error) {
	e, err := r.ObtenerPorID(id)
	if err != nil {
		return nil, err
	}
	e.Nombre = req.Nombre
	e.Descripcion = req.Descripcion
	e.Capacidad = req.Capacidad
	e.PrecioPorHora = req.PrecioPorHora
	return e, r.db.Save(e).Error
}

func (r *EspacioRepository) CambiarDisponibilidad(id uint, disponible bool) (*models.Espacio, error) {
	e, err := r.ObtenerPorID(id)
	if err != nil {
		return nil, err
	}
	e.Disponible = disponible
	return e, r.db.Save(e).Error
}

// Eliminar borra el espacio fisicamente
func (r *EspacioRepository) Eliminar(id uint) error {
	return r.db.Delete(&models.Espacio{}, id).Error
}

func (r *EspacioRepository) Reset() error {
	return r.db.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&models.Espacio{}).Error
}


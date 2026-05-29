package main

import (
	"fmt"
	"log"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"github.com/coworking/space-service/internal/handlers"
	"github.com/coworking/space-service/internal/middleware"
	"github.com/coworking/space-service/internal/models"
	"github.com/coworking/space-service/internal/repository"
)

func main() {
	godotenv.Load()

	// Conectar BD
	db, err := gorm.Open(postgres.Open(os.Getenv("DATABASE_URL")), &gorm.Config{})
	if err != nil {
		log.Fatal("Error conectando a la BD:", err)
	}
	db.AutoMigrate(&models.Espacio{})
	fmt.Println("Space Service - BD conectada, tablas creadas")

	repo := repository.NewEspacioRepository(db)
	handler := handlers.NewEspacioHandler(repo)

	r := gin.Default()
	r.Use(middleware.CORS())

	// Health publico
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"servicio": "space-service",
			"estado":   "funcionando",
			"puerto":   "8002",
		})
	})

	// Rutas de consulta - cualquier usuario autenticado
	ver := r.Group("/espacios")
	ver.Use(middleware.VerificarJWT())
	{
		ver.GET("", handler.Listar)
		ver.GET("/buscar", handler.Buscar)
		ver.GET("/sugerir", handler.Sugerir)
		ver.GET("/disponibles", handler.Disponibles)
		ver.GET("/estadisticas", handler.Estadisticas)
		ver.GET("/enriquecidos", handler.Enriquecidos)
		ver.GET("/:id", handler.ObtenerPorID)
		ver.GET("/:id/disponibilidad", handler.Disponibilidad)
		ver.GET("/:id/similares", handler.Similares)
	}

	// Rutas admin
	admin := r.Group("/espacios")
	admin.Use(middleware.VerificarJWT(), middleware.SoloAdmin())
	{
		admin.POST("", handler.Crear)
		admin.PUT("/:id", handler.Actualizar)
		admin.PATCH("/:id/disponibilidad", handler.CambiarDisponibilidad)
		admin.DELETE("/reset", handler.Reset)
		admin.DELETE("/:id", handler.Eliminar)
	}

	// Stats de estructuras
	cache := r.Group("/cache")
	cache.Use(middleware.VerificarJWT(), middleware.SoloAdmin())
	{
		cache.GET("/estadisticas", handler.EstadisticasCache)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8002"
	}
	fmt.Printf("Corriendo en :%s\n", port)
	r.Run(":" + port)
}

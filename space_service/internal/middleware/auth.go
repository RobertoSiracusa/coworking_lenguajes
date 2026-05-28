package middleware

import (
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// Verifica JWT autocontenido emitido por auth service
func VerificarJWT() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "Token requerido",
			})
			return
		}

		tokenStr := strings.TrimPrefix(header, "Bearer ")
		secretKey := os.Getenv("SECRET_KEY")

		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			return []byte(secretKey), nil
		})

		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "Token invalido o expirado",
			})
			return
		}

		claims := token.Claims.(jwt.MapClaims)
		c.Set("usuario_id", claims["sub"])
		c.Set("rol", claims["rol"])
		c.Set("token", tokenStr)
		c.Next()
	}
}

// Restringe acceso a rol admin
func SoloAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		rol, _ := c.Get("rol")
		if rol != "admin" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "Solo administradores pueden realizar esta accion",
			})
			return
		}
		c.Next()
	}
}

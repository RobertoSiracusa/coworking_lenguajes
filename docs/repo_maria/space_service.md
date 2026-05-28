# Space Service (Servicio de Gestión de Espacios)

## Información General

| Campo | Valor |
|-------|-------|
| **Lenguaje** | Go 1.21 |
| **Framework** | Gin 1.9.1 |
| **Base de datos** | PostgreSQL 15 (GORM como ORM) |
| **Puerto** | 8002 |
| **Autenticación** | JWT (librería golang-jwt/v5, misma SECRET_KEY que Auth Service) |
| **Contenedorización** | Docker multi-stage (Go build + Alpine runtime) |

## Estructura de Archivos

```
space_service/
├── Dockerfile
├── docker-compose.yml
├── go.mod
├── .gitignore
├── cmd/
│   └── main.go                          # Punto de entrada
├── internal/
│   ├── handlers/
│   │   └── espacio_handler.go           # Controladores HTTP
│   ├── middleware/
│   │   └── auth.go                      # Middleware JWT y control de roles
│   ├── models/
│   │   └── espacio.go                   # Modelo de datos + DTO request
│   └── repository/
│       └── espacio_repo.go              # Acceso a datos con GORM
└── pkg/
    └── algorithm/
        └── busqueda.go                  # Algoritmos de búsqueda y ordenamiento
```

Sigue la estructura estándar de Go:
- `cmd/` — punto de entrada de la aplicación
- `internal/` — código privado del servicio (handlers, middleware, models, repository)
- `pkg/` — código reutilizable/exportable (algoritmos)

## Descripción de Archivos

### `go.mod`

Módulo `github.com/coworking/space-service` con Go 1.21. Dependencias:
- `gin-gonic/gin` — framework HTTP
- `golang-jwt/jwt/v5` — verificación JWT
- `joho/godotenv` — carga de `.env`
- `gorm.io/driver/postgres` + `gorm.io/gorm` — ORM para PostgreSQL

### `Dockerfile`

Build multi-stage:
1. **Etapa 1 (builder)**: `golang:1.21-alpine`. Descarga módulos, compila binario estático `space-service`.
2. **Etapa 2 (runtime)**: `alpine:latest`. Copia solo el binario. Puerto 8002.

### `docker-compose.yml`

Dos servicios:
- **db**: PostgreSQL 15-alpine, base `spacesdb`, usuario `coworking_user`, puerto externo `5433`.
- **space-service**: construye desde Dockerfile, puerto `8002`, espera a que la BD esté healthy.

### `cmd/main.go` — Punto de entrada

Flujo de arranque:
1. Carga variables de entorno con `godotenv`.
2. Conecta a PostgreSQL via GORM usando `DATABASE_URL`.
3. Ejecuta `AutoMigrate` para crear/actualizar la tabla `espacios`.
4. Inyecta dependencias: `EspacioRepository` → `EspacioHandler`.
5. Configura rutas Gin:
   - `/health` — público, sin autenticación.
   - `GET /espacios`, `GET /espacios/buscar`, `GET /espacios/disponibles`, `GET /espacios/:id` — requieren JWT (cualquier usuario autenticado).
   - `POST /espacios`, `PUT /espacios/:id`, `PATCH /espacios/:id/disponibilidad` — requieren JWT + rol admin.
6. Levanta el servidor en el puerto configurado.

### `internal/handlers/espacio_handler.go` — Controladores HTTP

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| `GET /espacios` | Usuario | Lista todos los espacios. |
| `GET /espacios/buscar` | Usuario | Búsqueda por nombre. Query params: `q` (término), `algoritmo` (`lineal` o `binaria`, default `binaria`). |
| `GET /espacios/disponibles` | Usuario | Filtra espacios disponibles. Query params: `capacidad` (min, default 1), `orden` (`precio`). |
| `GET /espacios/:id` | Usuario | Obtiene un espacio por ID. |
| `POST /espacios` | Admin | Crea un espacio nuevo. Recibe JSON con `EspacioRequest`. |
| `PUT /espacios/:id` | Admin | Actualiza un espacio existente. |
| `PATCH /espacios/:id/disponibilidad` | Admin | Cambia solo el campo `disponible` (true/false). |

### `internal/middleware/auth.go` — Autenticación JWT

Dos middlewares Gin:

- **`VerificarJWT()`**: extrae token del header `Authorization: Bearer <token>`, lo verifica con `SECRET_KEY` del entorno usando `jwt.Parse`. Guarda `usuario_id` y `rol` en el contexto Gin (`c.Set`). Retorna 401 si falta o es inválido.
- **`SoloAdmin()`**: lee `rol` del contexto Gin. Si no es `"admin"`, retorna 403.

### `internal/models/espacio.go` — Modelo de Datos

**Struct `Espacio`** (entidad GORM):
- `ID` (uint, PK auto-generado)
- `Nombre` (string, NOT NULL)
- `Descripcion` (string)
- `Capacidad` (int, NOT NULL)
- `PrecioPorHora` (float64, NOT NULL)
- `Disponible` (bool, default true)
- `CreadoEn` (time.Time, auto-generado)

**Struct `EspacioRequest`** (DTO de entrada):
- `Nombre` (required, min 1 char)
- `Descripcion`
- `Capacidad` (required, min 1)
- `PrecioPorHora` (required, min 0)

### `internal/repository/espacio_repo.go` — Acceso a Datos

Repository pattern con GORM. Métodos:

| Método | Descripción |
|--------|-------------|
| `Crear(EspacioRequest)` | Crea un espacio con `Disponible = true`. |
| `ObtenerTodos()` | Retorna todos los espacios. |
| `ObtenerPorID(uint)` | Busca por primary key. |
| `Actualizar(uint, EspacioRequest)` | Busca por ID, actualiza campos y guarda. |
| `CambiarDisponibilidad(uint, bool)` | Modifica solo el campo `Disponible`. |

### `pkg/algorithm/busqueda.go` — Algoritmos de Búsqueda

| Función | Complejidad | Descripción |
|---------|-------------|-------------|
| `BusquedaLineal(espacios, query)` | O(n) | Recorre todos los espacios y filtra por coincidencia parcial en el nombre (case-insensitive). |
| `BusquedaBinaria(espacios, query)` | O(n log n) sort + O(log n) search | Copia y ordena alfabéticamente. Usa `sort.Search` para encontrar punto de inserción, luego expande en ambas direcciones buscando matches parciales. |
| `FiltrarDisponibles(espacios, capacidadMin)` | O(n) | Retorna espacios con `Disponible == true` y `Capacidad >= capacidadMin`. |
| `OrdenarPorPrecio(espacios)` | O(n log n) | Copia y ordena por `PrecioPorHora` ascendente. Nunca muta el slice original. |

El endpoint `/espacios/buscar?algoritmo=lineal|binaria` permite comparar ambos algoritmos de búsqueda.

## Modelo de Datos

```
espacios
├── id               UINT (PK, auto-generado)
├── nombre           VARCHAR NOT NULL
├── descripcion      VARCHAR
├── capacidad        INTEGER NOT NULL
├── precio_por_hora  FLOAT NOT NULL
├── disponible       BOOLEAN (default: true)
└── creado_en        TIMESTAMP (auto-generado)
```

## Comunicación con Otros Microservicios

- Comparte `SECRET_KEY` con el **Auth Service** para verificar tokens JWT sin llamadas inter-servicio.
- El **Reservation Service** referencia `espacio_id` y `nombre_espacio` al crear reservas (no se comunica en tiempo real con Space Service).
- El **Billing Service** usa `espacio_id`, `nombre_espacio` y `precio_por_hora` para generar facturas.

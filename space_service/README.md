# Space Service

Gestion del catalogo de espacios del sistema de co-working. Implementa multiples algoritmos de busqueda comparables, estructuras de datos avanzadas (Trie, Indice Invertido, Cache LRU) y se integra con Reservation Service para verificar disponibilidad real.

## Descripcion

- CRUD completo de espacios (admin) + listado y busqueda (usuario).
- Tres modos de busqueda comparables: lineal, binaria, indice invertido.
- Autocompletado por prefijo con Trie.
- Recomendacion de espacios similares (distancia euclidiana normalizada).
- Filtros avanzados (capacidad minima, precio maximo, disponible) y paginacion.
- Estadisticas agregadas del catalogo.
- Verificacion de disponibilidad real consultando Reservation Service.
- Endpoint de mantenimiento para borrar todos los espacios.

## Tecnologias

- Go 1.23
- Gin 1.9
- GORM 1.25
- PostgreSQL 15
- golang-jwt/jwt v5
- Docker

## Variables de Entorno

| Variable | Descripcion | Valor por defecto |
|----------|-------------|-------------------|
| PORT | Puerto del servicio | 8002 |
| DATABASE_URL | URL PostgreSQL | (requerido) |
| SECRET_KEY | Compartida con Auth Service (>= 32 chars) | (requerido) |
| RESERVATION_SERVICE_URL | URL Reservation Service | http://reservation-service:8003 |

## Como Ejecutar

```
cp .env.example .env
docker compose up --build
```

Servicio en `http://localhost:8002`. BD en `localhost:5433`.

## Endpoints

| Metodo | Ruta | Acceso | Descripcion |
|--------|------|--------|-------------|
| GET | /health | Publico | Health check |
| GET | /espacios | Usuario | Lista con filtros, orden y paginacion |
| GET | /espacios/buscar | Usuario | `algoritmo=lineal\|binaria\|indice` |
| GET | /espacios/sugerir | Usuario | Autocompletado por prefijo (Trie) |
| GET | /espacios/disponibles | Usuario | Solo disponibles con capacidad minima |
| GET | /espacios/estadisticas | Usuario | Resumen agregado del catalogo |
| GET | /espacios/enriquecidos | Usuario | Lista con conteo de reservas activas (HTTP a Reservation) |
| GET | /espacios/:id | Usuario | Detalle de un espacio |
| GET | /espacios/:id/disponibilidad | Usuario | Verifica disponibilidad en fecha dada (HTTP a Reservation) |
| GET | /espacios/:id/similares | Usuario | Top N espacios similares |
| POST | /espacios | Admin | Crea espacio |
| PUT | /espacios/:id | Admin | Actualiza espacio |
| PATCH | /espacios/:id/disponibilidad | Admin | Cambia flag disponible |
| DELETE | /espacios/:id | Admin | Elimina fisicamente |
| DELETE | /espacios/reset | Admin | Mantenimiento: borra todos los espacios y vacia indices |
| GET | /cache/estadisticas | Admin | Stats de cache, Trie, Indice Invertido |

### Filtros y Paginacion

- `capacidad_min` - Capacidad minima
- `precio_max` - Precio maximo por hora
- `disponible` - true o false
- `orden` - precio, capacidad, nombre
- `dir` - asc o desc
- `pagina` - Numero de pagina (default 1)
- `por_pagina` - Resultados por pagina (default 20, max 100)

## Algoritmos y Estructuras

### Busqueda Lineal — O(n)
Recorre todos los espacios buscando substring en el nombre.

### Busqueda Binaria — O(n log n) + O(log n)
Ordena y usa `sort.Search` para encontrar punto de insercion, expande para matches parciales.

### Indice Invertido — O(palabras × k)
`palabra -> set de ids`. Tokeniza nombre + descripcion. Buscar hace interseccion AND.

### Trie — O(L + k)
Arbol de prefijos para autocompletado. Cada nodo representa un caracter.

### Quicksort manual con mediana de tres
Ordenamiento desde cero para varios campos (precio, capacidad, nombre).

### Cache LRU — O(1)
Doubly linked list + `map[interface{}]*nodo`. Thread-safe con `sync.Mutex`.

### Recomendacion por similitud — O(n log n)
Distancia euclidiana normalizada entre capacidad y precio.

## Estructura del Proyecto

```
space_service/
├── README.md
├── Dockerfile
├── docker-compose.yml
├── go.mod
├── .env.example
├── cmd/
│   └── main.go                          Punto de entrada
├── internal/
│   ├── handlers/
│   │   └── espacio_handler.go           Controladores HTTP
│   ├── middleware/
│   │   ├── auth.go                      JWT + rol admin
│   │   └── cors.go                      CORS abierto para desarrollo
│   ├── models/
│   │   └── espacio.go                   Modelo y DTOs
│   ├── repository/
│   │   └── espacio_repo.go              Acceso GORM (incluye Reset)
│   └── servicios/
│       └── reservation_client.go        Cliente HTTP al Reservation Service
└── pkg/
    ├── algorithm/
    │   ├── busqueda.go                  Lineal, binaria, filtros, paginacion
    │   ├── quicksort.go                 Quicksort con mediana de tres
    │   └── recomendacion.go             Similitud + estadisticas
    └── estructuras/
        ├── cache_lru.go                 Cache LRU desde cero
        ├── trie.go                      Arbol de prefijos
        └── indice_invertido.go          Indice invertido AND
```

## Integracion con Otros Servicios

### Auth Service
Verifica JWT con la misma `SECRET_KEY` (sin llamadas HTTP).

### Reservation Service
- Reenvia el JWT del usuario.
- `GET /espacios/:id/disponibilidad?fecha=` consulta `/reservas/buscar-fecha`.
- `GET /espacios/enriquecidos` cuenta reservas activas por espacio.
- Respuestas se cachean en LRU.

## CORS

Middleware abierto `*` en `internal/middleware/cors.go`. Maneja preflight OPTIONS.

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

## Notas

- Trie e Indice Invertido se cargan al arrancar leyendo todos los espacios.
- Al crear, actualizar o eliminar, los indices se sincronizan.
- El endpoint `/reset` borra BD y vacia cache, Trie e Indice Invertido.
- Paginacion limita el tamano maximo a 100 resultados.

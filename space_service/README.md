# Space Service

Servicio de gestion de espacios del sistema de Co-working. Mantiene el catalogo de oficinas, salas y escritorios compartidos. Implementa multiples algoritmos de busqueda y estructuras de datos avanzadas.

## Descripcion

Este microservicio se encarga de:

- Mantener el catalogo de espacios (nombre, capacidad, precio por hora, disponibilidad).
- Buscar espacios con tres algoritmos comparables: lineal, binaria e indice invertido.
- Autocompletar nombres de espacios con un Trie (arbol de prefijos).
- Recomendar espacios similares usando distancia euclidiana normalizada.
- Filtrar y paginar listados.
- Verificar disponibilidad real consultando al Reservation Service.
- Enriquecer espacios con el numero de reservas activas.
- Cachear consultas frecuentes con un Cache LRU implementado desde cero.

## Tecnologias

- Go 1.21
- Gin 1.9
- GORM 1.25 (ORM)
- PostgreSQL 15
- golang-jwt/jwt v5
- Docker y Docker Compose

## Requisitos Previos

- Go 1.21 o superior (para ejecucion local sin Docker)
- Docker y Docker Compose
- PostgreSQL 15 (si se ejecuta sin Docker)
- Auth Service corriendo (para autenticacion)
- Reservation Service corriendo (opcional, para verificar disponibilidad)

## Variables de Entorno

Copiar `.env.example` a `.env`:

| Variable | Descripcion | Valor por defecto |
|----------|-------------|-------------------|
| `PORT` | Puerto del servicio | `8002` |
| `DATABASE_URL` | URL de PostgreSQL | (requerido) |
| `SECRET_KEY` | Clave compartida con Auth Service | (requerido) |
| `RESERVATION_SERVICE_URL` | URL del Reservation Service | `http://reservation-service:8003` |

## Como Ejecutar

### Con Docker Compose

```
cp .env.example .env
docker-compose up --build
```

Servicio disponible en `http://localhost:8002`. Base de datos en `localhost:5433`.

### En Local sin Docker

```
cp .env.example .env
go mod download
go run cmd/main.go
```

## Endpoints

Todos los endpoints excepto `/health` requieren un JWT valido.

| Metodo | Ruta | Acceso | Descripcion |
|--------|------|--------|-------------|
| GET | `/health` | Publico | Verifica que el servicio este activo |
| GET | `/espacios` | Usuario | Lista espacios con filtros y paginacion |
| GET | `/espacios/buscar` | Usuario | Busca por nombre. `algoritmo=lineal\|binaria\|indice` |
| GET | `/espacios/sugerir` | Usuario | Autocompleta nombres usando Trie |
| GET | `/espacios/disponibles` | Usuario | Lista solo disponibles con capacidad minima |
| GET | `/espacios/estadisticas` | Usuario | Resumen agregado del catalogo |
| GET | `/espacios/enriquecidos` | Usuario | Lista con conteo de reservas activas |
| GET | `/espacios/:id` | Usuario | Detalle de un espacio |
| GET | `/espacios/:id/disponibilidad` | Usuario | Verifica disponibilidad en una fecha (consulta Reservation) |
| GET | `/espacios/:id/similares` | Usuario | Espacios similares por capacidad y precio |
| POST | `/espacios` | Admin | Crea espacio |
| PUT | `/espacios/:id` | Admin | Actualiza espacio |
| PATCH | `/espacios/:id/disponibilidad` | Admin | Cambia disponibilidad |
| DELETE | `/espacios/:id` | Admin | Elimina espacio fisicamente |
| GET | `/cache/estadisticas` | Admin | Metricas de las estructuras de datos |

### Filtros y Paginacion (GET /espacios)

- `capacidad_min` - Capacidad minima requerida
- `precio_max` - Precio maximo por hora
- `disponible` - `true` o `false`
- `orden` - Campo de ordenamiento (`precio`, `capacidad`, `nombre`)
- `dir` - Direccion (`asc` o `desc`)
- `pagina` - Numero de pagina (default 1)
- `por_pagina` - Resultados por pagina (default 20, max 100)

### Busqueda (GET /espacios/buscar)

- `q` - Termino de busqueda
- `algoritmo` - `lineal`, `binaria` (default) o `indice` (indice invertido)

### Autocomplete (GET /espacios/sugerir)

- `q` - Prefijo a buscar
- `max` - Maximo de sugerencias (default 10)

## Estructura del Proyecto

```
space_service/
├── README.md
├── Dockerfile
├── docker-compose.yml
├── go.mod
├── .env.example
├── cmd/
│   └── main.go                            Punto de entrada
├── internal/
│   ├── handlers/
│   │   └── espacio_handler.go             Controladores HTTP
│   ├── middleware/
│   │   └── auth.go                        Verificacion JWT y rol admin
│   ├── models/
│   │   └── espacio.go                     Modelo y DTOs
│   ├── repository/
│   │   └── espacio_repo.go                Acceso a datos con GORM
│   └── servicios/
│       └── reservation_client.go          Cliente HTTP al Reservation Service
└── pkg/
    ├── algorithm/
    │   ├── busqueda.go                    Busqueda lineal, binaria, filtros, paginacion
    │   ├── quicksort.go                   Quicksort manual con mediana-de-tres
    │   └── recomendacion.go               Similitud euclidiana y estadisticas
    └── estructuras/
        ├── cache_lru.go                   Cache LRU desde cero
        ├── trie.go                        Arbol de prefijos para autocomplete
        └── indice_invertido.go            Indice invertido para palabras clave
```

## Algoritmos y Estructuras de Datos

### Busqueda Lineal

Complejidad O(n). Recorre todos los espacios comparando substring del nombre. Simple pero ineficiente con muchos elementos.

### Busqueda Binaria

Complejidad O(n log n) por el ordenamiento previo mas O(log n) para encontrar el punto, mas O(k) para expandir matches parciales. La lista debe estar ordenada.

### Indice Invertido

Estructura: `palabra -> set de ids`. Tokeniza nombres y descripciones, indexa por palabra. La busqueda hace interseccion AND entre los conjuntos de cada palabra. Permite busqueda por palabras clave eficiente.

- `Indexar(id, texto)` - O(palabras del texto)
- `Buscar(consulta)` - O(palabras consulta * tamano del set mas pequeno)

### Trie (Arbol de Prefijos)

Estructura para autocompletar. Cada nodo representa un caracter. Las palabras se almacenan caracter por caracter formando un arbol.

- `Insertar(palabra)` - O(L) donde L es la longitud
- `Sugerir(prefijo, max)` - O(L + k) donde k es el numero de sugerencias

Se usa en `/espacios/sugerir` para mostrar nombres que comienzan con el prefijo dado.

### Quicksort Manual

Implementacion desde cero con seleccion de pivote por mediana-de-tres para evitar el peor caso O(n^2) en arrays ya ordenados. Crea una copia, nunca muta el original. Permite ordenar por nombre, capacidad o precio.

- Promedio: O(n log n)
- Peor caso: O(n^2)

### Recomendacion por Similitud

Calcula distancia euclidiana normalizada entre el espacio de referencia y cada candidato, considerando capacidad y precio. Normaliza por el rango para que ambas dimensiones tengan peso equivalente.

- Complejidad: O(n log n) por el ordenamiento final

### Cache LRU

Lista doblemente enlazada mas hash map (`map[interface{}]*nodo`). Operaciones get/put en O(1). Thread-safe con sync.Mutex.

- `Get(clave)` - O(1)
- `Put(clave, valor)` - O(1), evict del menos usado si excede capacidad
- `Estadisticas()` - hits, misses, hit rate, tamanio

El servicio usa dos caches:
- Cache de espacios individuales (capacidad 100)
- Cache del cliente Reservation (capacidad 100)

## Integracion con Otros Servicios

### Auth Service

- Verificacion de JWT autocontenido. Misma `SECRET_KEY`.
- No requiere llamadas HTTP - el token es autocontenido.

### Reservation Service

- Reenvia el JWT del usuario al consultar reservas.
- `GET /espacios/:id/disponibilidad?fecha=` consulta `/reservas/buscar-fecha` para detectar conflictos.
- `GET /espacios/enriquecidos` consulta `/reservas` para contar reservas activas por espacio.
- Las respuestas se cachean en el LRU para minimizar llamadas HTTP.

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

- El Trie y el indice invertido se cargan en memoria al arrancar leyendo desde la base de datos.
- Al crear, actualizar o eliminar espacios, los indices se actualizan automaticamente.
- La eliminacion fisica (`DELETE`) borra el espacio. Si solo se quiere desactivar, usar `PATCH /espacios/:id/disponibilidad`.
- La paginacion limita el tamanio maximo de pagina a 100 resultados.
- El cache LRU se invalida al modificar o eliminar un espacio.

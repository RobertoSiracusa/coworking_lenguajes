# Space Service — Upgrades

## Estado Anterior

Servicio en **Go 1.21 / Gin** que gestionaba el catalogo de espacios. Implementacion original:

- **Convencion**: Go idiomatic (PascalCase exportado, camelCase interno).
- **Comentarios**: medianos, en espanol.
- **Sin README**.
- **Sin integracion HTTP** con otros servicios.

### Endpoints originales

| Metodo | Ruta |
|--------|------|
| GET | /health |
| GET | /espacios |
| GET | /espacios/buscar |
| GET | /espacios/disponibles |
| GET | /espacios/:id |
| POST | /espacios |
| PUT | /espacios/:id |
| PATCH | /espacios/:id/disponibilidad |

### Algoritmos originales

- `BusquedaLineal` — O(n)
- `BusquedaBinaria` — O(n log n) + O(log n)
- `FiltrarDisponibles` — O(n)
- `OrdenarPorPrecio` — O(n log n) usando `sort.Slice` nativo

## Cambios Generales

- **Comentarios reducidos a 1 linea en espanol**.
- **README.md creado** en espanol, sin emojis.
- **Nueva variable de entorno**: `RESERVATION_SERVICE_URL`.
- **Nuevos paquetes**: `internal/servicios/` (cliente HTTP) y `pkg/estructuras/` (datos).
- **Carga de indices al arrancar**: trie e indice invertido se llenan leyendo todos los espacios desde la BD.

## Funciones Nuevas (12)

### 1. DELETE /espacios/:id (admin)

Borrado fisico de un espacio. Invalida cache y limpia indices.

### 2. Filtros avanzados en listados

Query params en `GET /espacios`:

- `capacidad_min` — capacidad minima
- `precio_max` — precio maximo por hora
- `disponible` — `true` o `false`
- `orden` — campo de ordenamiento (`precio`, `capacidad`, `nombre`)
- `dir` — `asc` o `desc`

### 3. Paginacion

`pagina` y `por_pagina` (max 100). Respuesta con metadata.

### 4. GET /espacios/estadisticas

Resumen agregado del catalogo:

```
{
  "total": 24,
  "disponibles": 20,
  "no_disponibles": 4,
  "capacidad_total": 180,
  "precio_promedio": 45.30,
  "precio_minimo": 15.00,
  "precio_maximo": 120.00
}
```

### 5. GET /espacios/:id/disponibilidad?fecha=

Verifica si el espacio esta libre en una fecha. Consulta al Reservation Service (`GET /reservas/buscar-fecha`) para detectar conflictos. Combina:

- `disponible_catalogo` — flag del espacio
- `sin_reservas` — no hay PENDIENTE ni CONFIRMADA en esa fecha
- `libre` — ambos

### 6. Cache LRU desde cero

Nueva clase `CacheLRU` en `pkg/estructuras/cache_lru.go`:

- Doubly linked list + `map[interface{}]*nodo`
- `Get`/`Put` en O(1)
- Thread-safe con `sync.Mutex`
- Eviction del menos usado al exceder capacidad
- Reporta hits, misses, hit_rate

Dos instancias:
- En `EspacioHandler` para cache de espacios individuales (capacidad 100)
- En `ReservationClient` para respuestas HTTP (capacidad 100)

### 7. Trie (arbol de prefijos) para autocomplete

Nueva clase `Trie` en `pkg/estructuras/trie.go`.

- Cada nodo representa un caracter
- `Insertar(palabra)` — O(L)
- `Sugerir(prefijo, max)` — O(L + k)
- Thread-safe con `sync.RWMutex`

Endpoint nuevo: `GET /espacios/sugerir?q=sal&max=10`. Retorna nombres que comienzan con el prefijo.

### 8. Quicksort manual con mediana-de-tres

Nuevo `pkg/algorithm/quicksort.go`. Reemplaza `sort.Slice` con implementacion propia:

- Pivote por mediana de 3 elementos (evita peor caso O(n^2) en arrays ordenados)
- `OrdenarPor(espacios, campo, ascendente)` — soporta `precio`, `capacidad`, `nombre`
- Crea copia, no muta original
- Promedio O(n log n), peor caso O(n^2)

### 9. Indice invertido

Nueva clase `IndiceInvertido` en `pkg/estructuras/indice_invertido.go`:

- Estructura: `palabra -> set de ids` (`map[string]map[uint]bool`)
- Tokeniza nombre + descripcion
- Busqueda con interseccion AND entre conjuntos
- `Indexar(id, texto)` y `Buscar(consulta)` rapidos

Tercer modo en `GET /espacios/buscar?algoritmo=indice`. Permite comparar:
- `lineal` — O(n)
- `binaria` — O(n log n) sort + O(log n)
- `indice` — O(palabras * tamano del set mas pequeno)

### 10. Recomendacion de espacios similares

Nuevo `pkg/algorithm/recomendacion.go`. Endpoint `GET /espacios/:id/similares?top=5`.

- Distancia euclidiana normalizada sobre capacidad y precio
- Normaliza cada dimension por su rango para igualar pesos
- Ordena por distancia ascendente, retorna top N
- Complejidad O(n log n)

### 11. GET /espacios/enriquecidos

Listado de espacios con campo extra `reservas_activas`, obtenido del Reservation Service via HTTP. Cachea respuestas.

### 12. Validacion JWT compartida (ya existente)

JWT verificado con `SECRET_KEY`. No requiere llamada HTTP. Sin cambios respecto al original.

## Endpoint Extra

`GET /cache/estadisticas` (admin) — Reporta stats del cache LRU, del cliente Reservation, y del indice invertido.

## Nuevos Archivos

```
internal/
└── servicios/
    └── reservation_client.go              NUEVO (cliente HTTP)

pkg/
├── algorithm/
│   ├── quicksort.go                       NUEVO (manual + mediana-de-tres)
│   └── recomendacion.go                   NUEVO (similitud + estadisticas)
└── estructuras/
    ├── cache_lru.go                       NUEVO (thread-safe)
    ├── trie.go                            NUEVO (autocomplete)
    └── indice_invertido.go                NUEVO

README.md                                  NUEVO
.env.example                               NUEVO
```

## Tabla de Comparacion de Endpoints

| Endpoint | Antes | Despues |
|----------|-------|---------|
| /espacios (GET) | Listar | + filtros + paginacion + orden por multiples campos |
| /espacios/buscar | lineal o binaria | + indice invertido como 3er modo |
| /espacios/sugerir | No existia | NUEVO (Trie) |
| /espacios/estadisticas | No existia | NUEVO |
| /espacios/enriquecidos | No existia | NUEVO (HTTP a Reservation) |
| /espacios/:id/disponibilidad | No existia | NUEVO (HTTP a Reservation) |
| /espacios/:id/similares | No existia | NUEVO (recomendacion) |
| /espacios/:id (DELETE) | No existia | NUEVO |
| /cache/estadisticas | No existia | NUEVO |

## Tabla de Comparacion de Algoritmos

| Algoritmo / Estructura | Antes | Despues |
|------------------------|-------|---------|
| Busqueda lineal | Si | Sin cambios |
| Busqueda binaria | Si | Sin cambios |
| Indice invertido | No | NUEVO |
| Trie | No | NUEVO |
| Cache LRU | No | NUEVO |
| Quicksort manual | No (usaba sort.Slice) | NUEVO |
| Recomendacion (distancia euclidiana) | No | NUEVO |
| Estadisticas agregadas | No | NUEVO |

## Carga de Indices al Arrancar

Al iniciar el servicio, `NewEspacioHandler` llama a `cargarIndices()` que:

1. Lee todos los espacios desde la BD
2. Inserta cada nombre en el Trie
3. Indexa nombre + descripcion en el Indice Invertido

Al crear, actualizar o eliminar un espacio, los indices se mantienen sincronizados:
- `Crear` -> inserta en Trie e Indice Invertido
- `Actualizar` -> elimina del Indice Invertido y reinserta
- `Eliminar` -> elimina de cache, Indice Invertido

## Resumen

Mejoras principales: **README en espanol**, **comentarios breves**, **3 estructuras de datos nuevas implementadas desde cero** (Cache LRU, Trie, Indice Invertido), **Quicksort manual** con mediana-de-tres, **recomendacion** por similitud euclidiana, **integracion HTTP con Reservation Service** (disponibilidad real + conteo de reservas activas), **CRUD ampliado** (eliminar), **paginacion y filtros avanzados**, **endpoint de estadisticas**, **autocomplete via Trie**.

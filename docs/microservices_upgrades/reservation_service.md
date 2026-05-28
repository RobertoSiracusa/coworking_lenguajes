# Reservation Service — Upgrades

## Estado Anterior

Servicio en **Java 17 / Spring Boot 3.2** que gestionaba reservas con cola de prioridad (min-heap). Implementacion original:

- **Convencion**: camelCase (estandar Java).
- **Comentarios**: extensos, JavaDoc, multi-linea.
- **Sin README**.
- **Sin integracion HTTP** con otros servicios.
- Deteccion de conflictos via query SQL O(n).

### Endpoints originales

| Metodo | Ruta |
|--------|------|
| GET | /health |
| POST | /reservas |
| GET | /reservas |
| GET | /reservas/mis-reservas |
| DELETE | /reservas/{id} |
| GET | /cola |
| POST | /cola/confirmar |

### Algoritmos originales

- `ColaPrioridad` — Min-heap manual O(log n) insertar/extraer

## Cambios Generales

- **camelCase mantenido** (convencion Java estandar).
- **Comentarios reducidos a 1 linea en espanol**. Sin JavaDoc largos.
- **README.md creado** en espanol, sin emojis.
- **Nuevas variables de entorno**: `AUTH_SERVICE_URL`, `SPACE_SERVICE_URL`.
- **Nuevo campo en BD**: `precio_hora` en tabla `reservas`. Se auto-popula desde Space Service al crear. Listo para que Billing genere facturas sin consultar Space.

## Funciones Nuevas (12)

### 1. PUT /reservas/{id} (usuario/admin)

Edita una reserva pendiente. Acepta cambios en `fechaInicio`, `fechaFin`, `prioridad`, `notas`. Si se cambian fechas, valida conflictos con el Interval Tree y actualiza la cola si cambia la prioridad.

### 2. PATCH /reservas/{id}/completar (admin)

Marca una reserva confirmada como `COMPLETADA`. La libera del Interval Tree (ya no participa en deteccion de conflictos). Queda lista para que Billing Service le genere factura.

### 3. Filtros en listado

Query params en `GET /reservas`:

- `estado` — PENDIENTE, CONFIRMADA, CANCELADA, COMPLETADA
- `prioridad` — 1, 2, 3
- `desde` — fecha minima
- `hasta` — fecha maxima

### 4. Paginacion

`pagina` y `por_pagina` (max 100). Usa `Pageable` de Spring Data. Respuesta tipada con `PaginadoResponse<T>`.

### 5. GET /reservas/mis-estadisticas (usuario)

Resumen del usuario autenticado:

```
{
  "usuario_id": 5,
  "total_reservas": 18,
  "pendientes": 3,
  "confirmadas": 4,
  "completadas": 10,
  "canceladas": 1,
  "horas_totales": 47.5
}
```

### 6. Cache LRU generico desde cero

Nueva clase generica `CacheLRU<K, V>` en `algorithm/CacheLRU.java`:

- HashMap + doubly linked list dummy head/tail
- `get`/`put` en O(1)
- Thread-safe con `synchronized`
- Reporta hits, misses, hit_rate, claves

Dos instancias:
- `AuthClient.cacheUsuarios` (capacidad 100)
- `EspacioClient.cacheEspacios` (capacidad 100)

### 7. GET /reservas/buscar-fecha?fecha=&algoritmo=lineal|binaria (admin)

Busca reservas en una fecha:

- Lineal O(n)
- Binaria O(n log n) sort + O(log n) con `lower_bound`

### 8. Interval Tree AVL para deteccion de conflictos

**Mejora algoritmica clave.** Nueva clase `algorithm/IntervalTree.java`. Reemplaza la query SQL `existeConflicto` por una estructura de datos en memoria.

- Arbol binario auto-balanceado (AVL) con rotaciones izquierda/derecha
- Cada nodo guarda intervalo `(fechaInicio, fechaFin)` y `maxFin` del subarbol
- `insertar(reserva)` — O(log n)
- `eliminar(reservaId)` — O(log n)
- `buscarSolapamientos(inicio, fin, ignorarId)` — O(log n + k) donde k = solapamientos
- Descarta subarboles cuando `maxFin < inicio` (poda crucial)

Se reconstruye al arrancar el servicio con todas las reservas PENDIENTE y CONFIRMADA.

### 9. Validacion de usuario via Auth Service (HTTP)

Nuevo `service/AuthClient.java`. Reenvia el JWT del usuario para consultar `GET /usuarios`. Usa cache LRU.

### 10. Enriquecimiento con datos de usuario

`GET /reservas` ahora incluye `usuarioNombre` y `usuarioEmail` por cada reserva, obtenidos del Auth Service y cacheados.

### 11. Validacion de espacio via Space Service (HTTP)

Nuevo `service/EspacioClient.java`. Al crear una reserva (`POST /reservas`):

- Consulta `GET /espacios/{id}` en Space Service
- Si no existe -> 404
- Si `disponible: false` -> 409
- Copia `nombre` y `precio_por_hora` a la reserva

### 12. Auto-poblar precio_hora desde Space Service

Nuevo campo `precio_hora` en la entidad `Reserva`. Se llena automaticamente al crear la reserva con el precio actual del espacio. Billing Service puede generar la factura sin necesidad de consultar a Space.

## Endpoints Adicionales

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | /cache/estadisticas (admin) | Stats de los caches LRU y tamano del Interval Tree |

## Nuevos Archivos

```
src/main/java/com/coworking/reservations/
├── algorithm/
│   ├── CacheLRU.java                    NUEVO
│   ├── IntervalTree.java                NUEVO (AVL self-balancing)
│   └── BusquedaFechas.java              NUEVO
├── config/
│   └── RestTemplateConfig.java          NUEVO (cliente HTTP)
├── dto/
│   ├── EditarReservaRequest.java        NUEVO
│   ├── UsuarioDto.java                  NUEVO
│   ├── EspacioDto.java                  NUEVO
│   └── PaginadoResponse.java            NUEVO
└── service/
    ├── AuthClient.java                  NUEVO
    └── EspacioClient.java               NUEVO

README.md                                NUEVO
.env.example                             NUEVO
```

## Mejora del Modelo de Datos

```
reservas
├── ...campos previos
└── precio_hora     DECIMAL              NUEVO
```

## Tabla de Comparacion de Endpoints

| Endpoint | Antes | Despues |
|----------|-------|---------|
| /reservas (POST) | Crear | + valida usuario y espacio HTTP, auto-popular precio |
| /reservas (GET) | Listar | + filtros + paginacion + enriquecido |
| /reservas/mis-estadisticas | No existia | NUEVO |
| /reservas/buscar-fecha | No existia | NUEVO |
| /reservas/{id} (PUT) | No existia | NUEVO |
| /reservas/{id}/completar | No existia | NUEVO |
| /cola, /cola/confirmar | Existian | Sin cambios |
| /cache/estadisticas | No existia | NUEVO |

## Tabla de Comparacion de Algoritmos

| Algoritmo | Antes | Despues |
|-----------|-------|---------|
| Min-Heap (ColaPrioridad) | Si | + metodo `eliminarPorId` O(n) para cancelaciones/ediciones |
| Deteccion de conflictos | Query SQL O(n) | Interval Tree AVL O(log n + k) |
| Cache | No existia | CacheLRU generico O(1) |
| Busqueda por fecha | No existia | Lineal O(n) y binaria O(n log n) + O(log n) |

## Resumen

Mejoras principales: **README en espanol**, **comentarios breves**, **Interval Tree AVL** para conflictos en O(log n + k), **CacheLRU generico**, **integracion HTTP con Auth y Space**, **auto-poblar precio_hora** (preparado para Billing), **CRUD ampliado** (editar, completar), **paginacion y filtros**, **estadisticas personales**, **busqueda binaria por fecha**.

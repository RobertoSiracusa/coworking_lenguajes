# Billing Service — Upgrades

## Estado Anterior

Servicio en **Node.js 20 / Express** que gestionaba facturas y reportes. Implementacion original:

- **Convencion**: camelCase para funciones y variables (`verificarJWT`, `calcularFactura`, `agruparPorEspacio`).
- **Comentarios**: extensos, multi-linea, con bloques JSDoc.
- **Sin README**.
- **Sin integracion HTTP** con otros servicios.

### Endpoints originales

| Metodo | Ruta |
|--------|------|
| GET | /health |
| POST | /facturas |
| GET | /facturas |
| GET | /facturas/mis-facturas |
| GET | /facturas/:id |
| PATCH | /facturas/:id/pagar |
| GET | /reportes/resumen |
| GET | /reportes/por-espacio |
| GET | /reportes/por-usuario |
| GET | /reportes/ingresos-mensuales |
| GET | /reportes/top-espacios |

### Algoritmos originales

- `calcularFactura` — O(1)
- `ordenarFacturas` — O(n log n)
- `agruparPorEspacio` — O(n) hash map
- `agruparPorUsuario` — O(n) hash map
- `ingresosPorMes` — O(n) ventana deslizante

## Cambios Generales

- **Todo el codigo migrado a snake_case**: `verificar_jwt`, `solo_admin`, `calcular_factura`, `agrupar_por_espacio`, `ordenar_facturas`, `ingresos_por_mes`, `facturas_router`, `reportes_router`, `inicializar_bd`. Variables locales y parametros tambien.
- **Comentarios reducidos a 1 linea** en espanol. Sin JSDoc, sin explicaciones largas.
- **README.md creado** en espanol, sin emojis.
- **Nuevas dependencias**: `axios` para llamadas HTTP al Auth Service.
- **Nuevas variables de entorno**: `AUTH_SERVICE_URL`.

## Funciones Nuevas (10)

### 1. PATCH /facturas/:id/cancelar (admin)

Marca una factura como `cancelada`. Antes solo se podia eliminar fisicamente o marcarla como pagada.

### 2. DELETE /facturas/:id (admin)

Borrado fisico de la factura.

### 3. PUT /facturas/:id (admin)

Edita campos de una factura existente. Acepta cualquier subconjunto de: `nombre_espacio`, `fecha_inicio`, `fecha_fin`, `horas`, `precio_hora`, `subtotal`, `impuesto`, `total`, `estado`.

### 4. Filtros en listados

Query params en `GET /facturas` y `GET /facturas/mis-facturas`:

- `estado` — `pendiente`, `pagada`, `cancelada`
- `desde` — fecha inicio del rango
- `hasta` — fecha fin del rango

Filtros aplicados a nivel SQL (no en memoria).

### 5. Paginacion

`pagina` y `por_pagina` (max 100). Respuesta incluye metadata:

```
{
  "pagina": 1,
  "por_pagina": 20,
  "total": 145,
  "total_paginas": 8,
  "facturas": [...]
}
```

### 6. GET /facturas/mis-estadisticas (usuario)

Resumen personal del usuario autenticado:

```
{
  "usuario_id": 5,
  "total_facturas": 12,
  "total_gastado": 2340.50,
  "promedio_factura": 195.04,
  "pendientes": 2,
  "pagadas": 9,
  "canceladas": 1
}
```

### 7. Enriquecimiento de listados con Auth Service

`GET /facturas` ahora agrega `usuario_nombre` y `usuario_email` a cada factura, obtenidos via HTTP del Auth Service. Las respuestas se cachean para evitar llamadas repetidas.

### 8. Validacion de usuario al crear factura

`POST /facturas` consulta al Auth Service para verificar que `usuario_id` existe antes de insertar. Retorna 404 si el usuario no existe.

### 9. Cache LRU implementado desde cero

Nueva clase `CacheLRU` en `src/estructuras/cache_lru.js`:

- Doubly linked list + Map de JavaScript
- `get(clave)` y `put(clave, valor)` en O(1)
- Eviction del menos usado al exceder capacidad
- Reporta hits, misses, hit rate, claves activas

Dos instancias singleton:
- `cache_usuarios` (capacidad 100) — para datos del Auth Service
- `cache_reportes` (capacidad 50) — para resultados de reportes pesados

### 10. GET /facturas/buscar-fecha?fecha=&algoritmo=lineal|binaria (admin)

Busca facturas en una fecha especifica. Permite comparar:

- **Lineal O(n)** — recorre todas las facturas y compara.
- **Binaria O(n log n) sort + O(log n) busqueda** — ordena por `fecha_inicio` y usa dos `lower_bound` para encontrar el rango de un dia completo.

Mismo patron didactico que `/espacios/buscar` en Space Service.

## Endpoint Extra

`GET /cache/estadisticas` (admin) — Reporta metricas de ambos caches LRU.

## Nuevos Archivos

```
src/
├── estructuras/
│   └── cache_lru.js              NUEVO
├── algorithm/
│   └── busqueda.js               NUEVO (lineal y binaria por fecha)
└── servicios/
    └── auth_client.js            NUEVO (cliente HTTP)

README.md                         NUEVO
.env.example                      NUEVO (con AUTH_SERVICE_URL)
```

## Tabla de Comparacion de Endpoints

| Endpoint | Antes | Despues |
|----------|-------|---------|
| /facturas (POST) | Crear | Crear + validar usuario via auth |
| /facturas (GET) | Listar | Listar + filtros + paginacion + enriquecido |
| /facturas/mis-facturas | Listar | + filtros + paginacion |
| /facturas/mis-estadisticas | No existia | NUEVO |
| /facturas/buscar-fecha | No existia | NUEVO |
| /facturas/:id (PUT) | No existia | NUEVO |
| /facturas/:id/cancelar | No existia | NUEVO |
| /facturas/:id (DELETE) | No existia | NUEVO |
| /reportes/* | Existian | + uso de cache LRU para reportes pesados |
| /cache/estadisticas | No existia | NUEVO |

## Resumen

Cambios principales: **snake_case completo**, **comentarios breves en espanol**, **README en espanol**, **integracion HTTP con Auth Service**, **Cache LRU implementado desde cero**, **busqueda binaria por fecha**, **paginacion y filtros**, **endpoint de estadisticas personales**, **CRUD ampliado** (editar, cancelar, eliminar).

# Billing Service

Servicio de facturacion y reportes del sistema de co-working. Recibe peticiones desde Reservation Service (trigger automatico al pagar una reserva) o desde el usuario/admin (manual). Calcula montos con IVA y produce reportes financieros para administradores.

## Descripcion

- CRUD completo de facturas: crear, listar (con filtros + paginacion), editar, eliminar, marcar pagada/cancelada.
- Calculo automatico de horas, subtotal, IVA 16%, total.
- Trigger automatico desde Reservation Service al pagar una reserva.
- Acceso del usuario (puede facturar sus propias reservas) o admin (puede facturar cualquiera).
- Reportes agregados: dashboard, por espacio, por usuario, ingresos mensuales, top espacios.
- Estadisticas personales del usuario autenticado.
- Busqueda lineal vs binaria por fecha (comparacion didactica).
- Cache LRU implementado desde cero para usuarios y reportes pesados.
- Endpoint de mantenimiento para borrar todas las facturas + vaciar caches.

## Tecnologias

- Node.js 20
- Express 4
- PostgreSQL 15 (cliente `pg`)
- jsonwebtoken
- axios (HTTP al Auth Service)

## Variables de Entorno

| Variable | Descripcion | Valor por defecto |
|----------|-------------|-------------------|
| PORT | Puerto del servicio | 8004 |
| DATABASE_URL | URL PostgreSQL | (requerido) |
| SECRET_KEY | Compartida (>= 32 chars) | (requerido) |
| AUTH_SERVICE_URL | URL Auth Service | http://auth-service:8001 |

## Como Ejecutar

```
cp .env.example .env
docker compose up --build
```

Servicio en `http://localhost:8004`. BD en `localhost:5435`.

## Endpoints

| Metodo | Ruta | Acceso | Descripcion |
|--------|------|--------|-------------|
| GET | /health | Publico | Health check |
| POST | /facturas | Admin / Dueno | Crea factura. Si rol=usuario solo permite usuario_id propio. Valida via Auth Service si admin. |
| GET | /facturas | Admin | Lista todas con filtros, paginacion y enriquecidas con nombre/email del usuario |
| GET | /facturas/mis-facturas | Usuario | Lista propias |
| GET | /facturas/mis-estadisticas | Usuario | Resumen personal (gasto total, promedio, conteos por estado) |
| GET | /facturas/buscar-fecha | Admin | `algoritmo=lineal\|binaria` |
| GET | /facturas/:id | Usuario / Admin | Detalle (usuario solo las suyas) |
| PUT | /facturas/:id | Admin | Edita campos arbitrarios |
| PATCH | /facturas/:id/pagar | Admin | Marca como pagada |
| PATCH | /facturas/:id/cancelar | Admin | Marca como cancelada |
| DELETE | /facturas/:id | Admin | Borra fisicamente |
| DELETE | /facturas/reset | Admin | Mantenimiento: borra todas las facturas + vacia caches LRU |
| GET | /reportes/resumen | Admin | Dashboard (total facturas, ingresos, hoy, pendientes, promedio) |
| GET | /reportes/por-espacio | Admin | Ingresos agrupados por espacio (cached) |
| GET | /reportes/por-usuario | Admin | Gasto agrupado por usuario (cached) |
| GET | /reportes/ingresos-mensuales | Admin | Ventana deslizante por mes con tendencia % |
| GET | /reportes/top-espacios | Admin | Top N espacios mas rentables |
| GET | /cache/estadisticas | Admin | Stats de los caches LRU |

### Filtros y Paginacion

- `estado` - pendiente, pagada, cancelada
- `desde`, `hasta` - rango por `creado_en`
- `orden` - campo (default `creado_en`)
- `dir` - asc o desc
- `pagina`, `por_pagina` (max 100)

## Algoritmos y Estructuras

### Calculo de Factura — O(1)

```
horas    = (fecha_fin - fecha_inicio) / 3.600.000 ms
subtotal = horas * precio_hora
impuesto = subtotal * 0.16    (IVA 16%)
total    = subtotal + impuesto
```

### Agrupamiento por Hash Map — O(n)
Objeto JavaScript como tabla hash. Una sola pasada acumula por `espacio_id` o `usuario_id`.

### Ventana Deslizante — O(n)
Genera N ventanas mensuales vacias y acumula totales en cada una.

### Busqueda Lineal vs Binaria por Fecha
- Lineal: O(n)
- Binaria: O(n log n) sort + O(log n) con dos lower_bound para rango del dia

### Ordenamiento — O(n log n)
`Array.sort` nativo (TimSort) sobre copia.

### Cache LRU — O(1)
Doubly linked list + Map de JavaScript.

- `cache_usuarios` (capacidad 100) - datos del Auth Service
- `cache_reportes` (capacidad 50) - resultados de reportes pesados

Soporta operaciones `get`, `put`, `eliminar`, `tamanio`, `estadisticas` y **`vaciar()`** (invalida todo el cache cuando se hace reset).

## Estructura del Proyecto

```
billing_service/
├── README.md
├── Dockerfile
├── docker-compose.yml
├── package.json
├── .env.example
└── src/
    ├── index.js                Punto de entrada Express + CORS
    ├── db.js                   Pool PostgreSQL + inicializar_bd
    ├── middleware/
    │   └── auth.js             verificar_jwt, solo_admin (deja pasar OPTIONS)
    ├── routes/
    │   ├── facturas.js         CRUD + reset + busqueda
    │   └── reportes.js         Reportes con cache
    ├── algorithm/
    │   ├── reportes.js         Calculo, agrupamiento, ventana deslizante
    │   └── busqueda.js         Lineal y binaria por fecha
    ├── estructuras/
    │   └── cache_lru.js        CacheLRU desde cero + metodo vaciar()
    └── servicios/
        └── auth_client.js      Cliente HTTP al Auth Service
```

## Integracion con Otros Servicios

### Auth Service
- Si admin crea factura, valida que `usuario_id` exista.
- Si lista facturas como admin, enriquece con nombre y email del usuario.
- Respuestas cacheadas en LRU.

### Reservation Service (entrada automatica)
- Cuando un usuario paga (`PATCH /reservas/{id}/pagar` en Reservation), Reservation hace POST automatico a `/facturas` con los datos de la reserva. Si la factura ya existe (constraint UNIQUE en `reserva_id`), retorna 409.

## CORS

`app.use(cors())` global + `verificar_jwt` deja pasar OPTIONS para preflight.

## Modelo de Datos

```
facturas
├── id              SERIAL PRIMARY KEY
├── reserva_id      INTEGER NOT NULL UNIQUE
├── usuario_id      INTEGER NOT NULL
├── espacio_id      INTEGER NOT NULL
├── nombre_espacio  VARCHAR(100)
├── fecha_inicio    TIMESTAMP NOT NULL
├── fecha_fin       TIMESTAMP NOT NULL
├── horas           DECIMAL(5,2)
├── precio_hora     DECIMAL(10,2)
├── subtotal        DECIMAL(10,2)
├── impuesto        DECIMAL(10,2)
├── total           DECIMAL(10,2)
├── estado          VARCHAR(20) DEFAULT 'pendiente'
└── creado_en       TIMESTAMP DEFAULT NOW()
```

## Notas

- IVA fijado en 16% (modificable en `src/algorithm/reportes.js` constante `IVA`).
- Constraint UNIQUE en `reserva_id` impide facturar dos veces la misma reserva (responde 409).
- El endpoint `/reset` vacia BD y caches LRU para que reportes no muestren datos stale.
- Las rutas literales (`/reset`) deben declararse ANTES que `/:id` en el router para evitar matching incorrecto.
- snake_case en todo el codigo (variables, funciones, JSON fields).

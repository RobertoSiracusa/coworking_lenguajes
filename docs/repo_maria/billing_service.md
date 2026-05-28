# Billing Service (Servicio de Facturación y Reportes)

## Información General

| Campo | Valor |
|-------|-------|
| **Lenguaje** | JavaScript (Node.js 20) |
| **Framework** | Express 4.18 |
| **Base de datos** | PostgreSQL 15 (driver `pg`) |
| **Puerto** | 8004 |
| **Autenticación** | JWT (misma SECRET_KEY que Auth Service) |
| **Contenedorización** | Docker + docker-compose |

## Estructura de Archivos

```
billing_service/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── .gitignore
└── src/
    ├── index.js                  # Punto de entrada
    ├── db.js                     # Conexión a BD y creación de tablas
    ├── middleware/
    │   └── auth.js               # Middleware JWT y control de roles
    ├── routes/
    │   ├── facturas.js           # CRUD de facturas
    │   └── reportes.js           # Endpoints de reportes/dashboard
    └── algorithm/
        └── reportes.js           # Algoritmos de cálculo y agrupamiento
```

## Descripción de Archivos

### `package.json`

Define el proyecto `billing-service` v1.0.0. Dependencias principales: `express` (servidor HTTP), `pg` (driver PostgreSQL), `jsonwebtoken` (verificación JWT), `dotenv` (variables de entorno), `cors`. Usa `nodemon` en desarrollo.

### `Dockerfile`

Imagen multi-stage basada en `node:20-alpine`. Copia `package.json` primero para aprovechar cache de Docker, instala dependencias en modo producción, copia el código fuente y expone puerto 8004.

### `docker-compose.yml`

Levanta dos servicios:
- **db**: PostgreSQL 15-alpine con base de datos `billingdb`, usuario `coworking_user`, puerto externo `5435`.
- **billing-service**: construye desde el Dockerfile, puerto `8004`, depende de que la BD esté healthy.

### `src/index.js` — Punto de entrada

Configura la aplicación Express:
1. Carga variables de entorno con `dotenv`.
2. Aplica middlewares globales: `cors()` y `express.json()`.
3. Expone `/health` como endpoint público (sin JWT).
4. Aplica `verificarJWT` como middleware global para todas las rutas siguientes.
5. Monta las rutas `/facturas` y `/reportes`.
6. Define manejadores de ruta no encontrada (404) y errores globales (500).
7. Función `arrancar()`: inicializa la BD y levanta el servidor.

### `src/db.js` — Conexión y esquema de BD

- Crea un pool de conexiones PostgreSQL usando `DATABASE_URL` del entorno.
- Función `inicializarBD()`: ejecuta `CREATE TABLE IF NOT EXISTS facturas` con los campos:
  - `id` (SERIAL PK), `reserva_id` (UNIQUE), `usuario_id`, `espacio_id`, `nombre_espacio`
  - `fecha_inicio`, `fecha_fin`, `horas`, `precio_hora`
  - `subtotal`, `impuesto` (16% IVA), `total`
  - `estado` (pendiente/pagada/cancelada), `creado_en`
- Exporta `pool` e `inicializarBD`.

### `src/middleware/auth.js` — Autenticación JWT

Dos middlewares:

- **`verificarJWT`**: extrae el token del header `Authorization: Bearer <token>`, lo verifica con `SECRET_KEY`, guarda `req.usuarioId` y `req.rol` en el request. Retorna 401 si falta o es inválido.
- **`soloAdmin`**: verifica que `req.rol === 'admin'`. Retorna 403 si no lo es.

### `src/routes/facturas.js` — CRUD de Facturas

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| `POST /facturas` | Usuario/Admin | Crea factura para una reserva confirmada. Calcula montos con `calcularFactura()`. Detecta duplicados (constraint UNIQUE en `reserva_id`). |
| `GET /facturas/mis-facturas` | Usuario | Lista facturas del usuario autenticado. Ordena en memoria con `ordenarFacturas()`. Query params: `orden`, `dir`. |
| `GET /facturas/:id` | Usuario/Admin | Detalle de una factura. Usuarios solo ven las suyas, admin ve cualquiera. |
| `GET /facturas` | Admin | Lista todas las facturas. Soporta ordenamiento por query params. |
| `PATCH /facturas/:id/pagar` | Usuario/Admin | Marca una factura como `pagada` y notifica al Reservation Service. |

### `src/routes/reportes.js` — Dashboard y Reportes

Todos los endpoints requieren rol admin.

| Método | Ruta | Descripción | Algoritmo |
|--------|------|-------------|-----------|
| `GET /reportes/resumen` | Dashboard general: total facturas, ingresos totales, facturas hoy, pendientes, promedio. | Reducción O(n) |
| `GET /reportes/por-espacio` | Ingresos agrupados por espacio. Query params: `orden`, `dir`. | Agrupamiento O(n) + ordenamiento O(n log n) |
| `GET /reportes/por-usuario` | Gasto agrupado por usuario. Query params: `orden`, `dir`. | Agrupamiento O(n) + ordenamiento O(n log n) |
| `GET /reportes/ingresos-mensuales` | Ingresos por mes. Query param: `meses` (default 6). Calcula tendencia porcentual. | Ventana deslizante O(n) |
| `GET /reportes/top-espacios` | Top N espacios más rentables. Query param: `top` (default 5). | Agrupamiento O(n) + sort O(n log n) + slice O(k) |

### `src/algorithm/reportes.js` — Algoritmos

| Función | Complejidad | Descripción |
|---------|-------------|-------------|
| `ordenarFacturas(facturas, campo, direccion)` | O(n log n) | Ordena una copia del array por campo numérico, ascendente o descendente. |
| `agruparPorEspacio(facturas)` | O(n) | Agrupa facturas por `espacio_id` usando hash map (objeto JS). Calcula total facturas, horas, ingresos y promedio por espacio. |
| `agruparPorUsuario(facturas)` | O(n) | Agrupa facturas por `usuario_id`. Calcula total facturas, gasto total y horas por usuario. |
| `ingresosPorMes(facturas, meses)` | O(n) | Genera ventanas mensuales (últimos N meses) y acumula ingresos en una sola pasada. Las facturas deben estar ordenadas por fecha ASC. |
| `calcularFactura({fechaInicio, fechaFin, precioHora})` | O(1) | Calcula horas entre fechas, subtotal, impuesto (16% IVA) y total. |

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
├── impuesto        DECIMAL(10,2)   -- 16% IVA
├── total           DECIMAL(10,2)
├── estado          VARCHAR(20)     -- pendiente | pagada | cancelada
└── creado_en       TIMESTAMP
```

## Comunicación con Otros Microservicios

- Recibe datos de reservas confirmadas desde el **Reservation Service** (reserva_id, usuario_id, espacio_id, fechas, precio).
- Al pagar una factura, notifica al **Reservation Service** para marcar la reserva como PAGADA.
- Comparte la misma `SECRET_KEY` que el **Auth Service** para verificar tokens JWT sin necesidad de comunicarse con él.

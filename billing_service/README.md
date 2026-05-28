# Billing Service

Servicio de Facturacion y Reportes del sistema de Co-working. Genera facturas a partir de reservas completadas, gestiona estados de pago y produce reportes financieros para administradores.

## Descripcion

Este microservicio se encarga de:

- Crear, editar, cancelar y eliminar facturas.
- Calcular automaticamente subtotales, impuestos (IVA del 16 por ciento) y totales.
- Listar facturas con filtros (estado, rango de fechas) y paginacion.
- Generar reportes agregados: ingresos por espacio, gasto por usuario, ingresos mensuales y ranking de espacios.
- Validar que los usuarios existan consultando al servicio de autenticacion.
- Enriquecer las respuestas con datos de usuario (nombre, email) obtenidos del Auth Service.
- Buscar facturas por fecha con dos algoritmos comparables: lineal y binaria.
- Cachear datos pesados en memoria con un Cache LRU implementado desde cero.

## Tecnologias

- Node.js 20
- Express 4
- PostgreSQL 15
- JSON Web Tokens (verificacion con `jsonwebtoken`)
- Axios (cliente HTTP hacia el Auth Service)
- Docker y Docker Compose

## Requisitos Previos

- Node.js 20 o superior (para ejecucion local sin Docker)
- Docker y Docker Compose
- PostgreSQL 15 (si se ejecuta sin Docker)
- Servicio de autenticacion corriendo y accesible

## Variables de Entorno

Copiar `.env.example` a `.env` y ajustar segun el entorno:

| Variable | Descripcion | Valor por defecto |
|----------|-------------|-------------------|
| `PORT` | Puerto donde escucha el servicio | `8004` |
| `DATABASE_URL` | Cadena de conexion a PostgreSQL | `postgresql://coworking_user:coworking_pass@db:5432/billingdb` |
| `SECRET_KEY` | Clave compartida con el Auth Service para verificar JWT | (requerido) |
| `AUTH_SERVICE_URL` | URL base del Auth Service | `http://auth-service:8001` |

La `SECRET_KEY` debe ser exactamente la misma que usa el Auth Service para firmar los tokens. De lo contrario la verificacion fallara.

## Como Ejecutar

### Con Docker Compose

```
cp .env.example .env
docker-compose up --build
```

El servicio queda disponible en `http://localhost:8004` y la base de datos PostgreSQL en `localhost:5435`.

### En Local sin Docker

```
cp .env.example .env
npm install
npm run dev
```

Para conexion local ajustar `DATABASE_URL` a `postgresql://coworking_user:coworking_pass@localhost:5435/billingdb`.

## Endpoints

Todos los endpoints excepto `/health` requieren un JWT valido en el header `Authorization: Bearer <token>`.

| Metodo | Ruta | Acceso | Descripcion |
|--------|------|--------|-------------|
| GET | `/health` | Publico | Verifica que el servicio este activo |
| POST | `/facturas` | Admin | Crea una factura. Valida que el usuario exista en Auth Service |
| GET | `/facturas` | Admin | Lista todas las facturas con filtros, paginacion y datos enriquecidos |
| GET | `/facturas/mis-facturas` | Usuario | Lista las facturas del usuario autenticado con filtros y paginacion |
| GET | `/facturas/mis-estadisticas` | Usuario | Resumen personal del usuario autenticado |
| GET | `/facturas/buscar-fecha` | Admin | Busca facturas en una fecha. Acepta `algoritmo=lineal` o `algoritmo=binaria` |
| GET | `/facturas/:id` | Usuario / Admin | Detalle de una factura (el usuario solo ve las suyas) |
| PUT | `/facturas/:id` | Admin | Edita campos de una factura |
| PATCH | `/facturas/:id/pagar` | Admin | Marca la factura como pagada |
| PATCH | `/facturas/:id/cancelar` | Admin | Marca la factura como cancelada |
| DELETE | `/facturas/:id` | Admin | Elimina fisicamente una factura |
| GET | `/reportes/resumen` | Admin | Dashboard con totales generales |
| GET | `/reportes/por-espacio` | Admin | Ingresos agrupados por espacio |
| GET | `/reportes/por-usuario` | Admin | Gasto agrupado por usuario |
| GET | `/reportes/ingresos-mensuales` | Admin | Ingresos mensuales con tendencia |
| GET | `/reportes/top-espacios` | Admin | Top N espacios mas rentables |
| GET | `/cache/estadisticas` | Admin | Metricas de los caches LRU |

### Filtros y Paginacion

Los listados de facturas aceptan los siguientes query params:

- `estado` - Filtra por estado (`pendiente`, `pagada`, `cancelada`)
- `desde` - Fecha de inicio del rango (formato ISO)
- `hasta` - Fecha de fin del rango (formato ISO)
- `orden` - Campo por el cual ordenar (default `creado_en`)
- `dir` - Direccion del ordenamiento (`asc` o `desc`)
- `pagina` - Numero de pagina (default 1)
- `por_pagina` - Resultados por pagina (default 20, maximo 100)

## Estructura del Proyecto

```
billing_service/
├── README.md
├── Dockerfile
├── docker-compose.yml
├── package.json
├── .env.example
└── src/
    ├── index.js                Punto de entrada y configuracion Express
    ├── db.js                   Conexion a PostgreSQL e inicializacion de tablas
    ├── middleware/
    │   └── auth.js             Verificacion de JWT y control de rol admin
    ├── routes/
    │   ├── facturas.js         Endpoints CRUD de facturas
    │   └── reportes.js         Endpoints de reportes y analitica
    ├── algorithm/
    │   ├── reportes.js         Algoritmos de calculo, agrupamiento y ventana deslizante
    │   └── busqueda.js         Busqueda lineal y binaria por fecha
    ├── estructuras/
    │   └── cache_lru.js        Implementacion desde cero del Cache LRU
    └── servicios/
        └── auth_client.js      Cliente HTTP para el Auth Service
```

## Algoritmos y Estructuras de Datos

### Calculo de Factura

Complejidad O(1). Calcula horas entre dos fechas, aplica el precio por hora, calcula el IVA del 16 por ciento y suma el total.

### Ordenamiento

Complejidad O(n log n). Usa el algoritmo nativo de JavaScript (TimSort) sobre una copia del array, nunca muta el original.

### Agrupamiento por Espacio y por Usuario

Complejidad O(n). Una sola pasada sobre las facturas, usando un objeto JavaScript como tabla hash. El acceso a las claves es O(1) en promedio.

### Ventana Deslizante (Ingresos Mensuales)

Complejidad O(n). Se crean N ventanas vacias (una por mes) y se recorre la lista de facturas una sola vez, acumulando los totales en la ventana correspondiente. Evita ejecutar una consulta por cada mes.

### Busqueda Lineal vs Binaria

- Lineal: O(n). Recorre todas las facturas comparando fechas.
- Binaria: O(n log n) por el ordenamiento previo mas O(log n) por la busqueda. Usa dos busquedas tipo `lower_bound` para encontrar el rango de un dia completo.

El endpoint `/facturas/buscar-fecha` permite comparar ambos algoritmos pasando `algoritmo=lineal` o `algoritmo=binaria`.

### Cache LRU

Implementacion desde cero con lista doblemente enlazada mas hash map (Map de JavaScript).

- `get(clave)` - O(1). Si la clave existe, mueve el nodo al frente.
- `put(clave, valor)` - O(1). Inserta o actualiza. Si excede la capacidad, elimina el nodo menos usado (el de la cola).
- `eliminar(clave)` - O(1).
- `estadisticas()` - Retorna hits, misses, hit rate, tamanio actual y capacidad.

El servicio mantiene dos instancias:

- `cache_usuarios` con capacidad 100, para datos obtenidos del Auth Service.
- `cache_reportes` con capacidad 50, para resultados de reportes pesados.

## Integracion con Auth Service

El Billing Service se comunica con el Auth Service via HTTP para dos casos:

1. **Validacion al crear facturas**: antes de insertar una factura, llama a `GET /usuarios` en el Auth Service para confirmar que el `usuario_id` existe. Si no existe, retorna 404.

2. **Enriquecimiento de listados**: al listar facturas como admin, agrega los campos `usuario_nombre` y `usuario_email` consultando al Auth Service. Los datos se cachean en el LRU para minimizar llamadas HTTP.

El JWT del usuario autenticado se reenvia al Auth Service en cada llamada (`Authorization: Bearer <token>`). Como `GET /usuarios` en el Auth Service requiere rol admin, esta integracion funciona cuando un administrador realiza la operacion.

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

- El IVA esta fijado en 16 por ciento. Para cambiarlo, modificar la constante `IVA` en `src/algorithm/reportes.js`.
- La paginacion limita el tamanio maximo de pagina a 100 resultados.
- Los reportes que usan cache invalidan automaticamente al expirar las entradas LRU por capacidad. No hay invalidacion explicita por modificacion de datos.

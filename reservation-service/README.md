# Reservation Service

Motor de reservas del sistema de Co-working. Gestiona el ciclo de vida completo de las reservas de espacios, prioriza con una cola de prioridad (min-heap) y detecta conflictos de horarios con un Interval Tree.

## Descripcion

Este microservicio se encarga de:

- Crear, editar, cancelar y completar reservas de espacios.
- Priorizar reservas pendientes con una cola de prioridad (min-heap).
- Detectar solapamientos de horarios en O(log n) con un Interval Tree balanceado (AVL).
- Listar reservas con filtros y paginacion, enriquecidas con datos de usuario.
- Validar la existencia y disponibilidad de espacios consultando al Space Service.
- Validar usuarios contra el Auth Service.
- Buscar reservas por fecha con dos algoritmos comparables: lineal y binaria.
- Cachear datos de usuarios y espacios en memoria con un Cache LRU implementado desde cero.

## Tecnologias

- Java 17
- Spring Boot 3.2
- Spring Data JPA / Hibernate
- PostgreSQL 15
- JJWT 0.11 (verificacion de tokens)
- Lombok
- Docker y Docker Compose

## Requisitos Previos

- Java 17 (para ejecucion local sin Docker)
- Maven 3.9 o superior
- Docker y Docker Compose
- PostgreSQL 15 (si se ejecuta sin Docker)
- Auth Service y Space Service corriendo y accesibles

## Variables de Entorno

Copiar `.env.example` a `.env`:

| Variable | Descripcion | Valor por defecto |
|----------|-------------|-------------------|
| `PORT` | Puerto del servicio | `8003` |
| `DATABASE_URL` | URL JDBC de PostgreSQL | (requerido) |
| `SECRET_KEY` | Clave compartida con Auth Service | (requerido) |
| `AUTH_SERVICE_URL` | URL del Auth Service | `http://auth-service:8001` |
| `SPACE_SERVICE_URL` | URL del Space Service | `http://space-service:8002` |
| `BILLING_SERVICE_URL` | URL del Billing Service | `http://billing-service:8004` |

## Como Ejecutar

### Con Docker Compose

```
cp .env.example .env
docker-compose up --build
```

Servicio disponible en `http://localhost:8003`. Base de datos en `localhost:5434`.

### En Local sin Docker

```
cp .env.example .env
mvn spring-boot:run
```

## Endpoints

Todos los endpoints excepto `/health` requieren un JWT valido.

| Metodo | Ruta | Acceso | Descripcion |
|--------|------|--------|-------------|
| GET | `/health` | Publico | Verifica que el servicio este activo |
| POST | `/reservas` | Usuario | Crea reserva. Valida usuario y espacio via HTTP |
| GET | `/reservas` | Admin | Lista todas las reservas con filtros, paginacion y datos enriquecidos |
| GET | `/reservas/mis-reservas` | Usuario | Lista las reservas del usuario autenticado |
| GET | `/reservas/mis-estadisticas` | Usuario | Resumen personal: totales por estado, horas totales |
| GET | `/reservas/buscar-fecha` | Admin | Busca reservas en una fecha. `algoritmo=lineal` o `algoritmo=binaria` |
| PUT | `/reservas/{id}` | Usuario / Admin | Edita reserva pendiente (fechas, prioridad, notas) |
| POST | `/reservas/{id}/confirmar` | Usuario / Admin | Confirma reserva pendiente y genera factura |
| PATCH | `/reservas/{id}/pagar` | Usuario / Admin | Marca reserva como pagada |
| DELETE | `/reservas/{id}` | Usuario / Admin | Cancela reserva |
| PATCH | `/reservas/{id}/completar` | Admin | Marca reserva pagada como completada |
| PATCH | `/reservas/{id}/estado` | Admin | Cambia estado directamente |
| GET | `/cola` | Admin | Estado de la cola de prioridad |
| POST | `/cola/confirmar` | Admin | Confirma la siguiente reserva de mayor prioridad |
| GET | `/cache/estadisticas` | Admin | Metricas de los caches LRU y tamano del Interval Tree |

### Filtros y Paginacion (GET /reservas)

- `estado` - Filtra por estado (`PENDIENTE`, `CONFIRMADA`, `PAGADA`, `CANCELADA`, `COMPLETADA`)
- `prioridad` - Filtra por prioridad (1, 2, 3)
- `desde` - Fecha inicio del rango (ISO date-time)
- `hasta` - Fecha fin del rango (ISO date-time)
- `pagina` - Numero de pagina (default 1)
- `por_pagina` - Resultados por pagina (default 20, maximo 100)

## Estructura del Proyecto

```
reservation-service/
├── README.md
├── Dockerfile
├── docker-compose.yml
├── pom.xml
├── .env.example
└── src/main/
    ├── resources/
    │   └── application.properties
    └── java/com/coworking/reservations/
        ├── ReservationServiceApplication.java
        ├── algorithm/
        │   ├── ColaPrioridad.java         Min-heap de reservas
        │   ├── CacheLRU.java              Cache LRU generico desde cero
        │   ├── IntervalTree.java          Interval Tree AVL para solapamientos
        │   └── BusquedaFechas.java        Busqueda lineal y binaria
        ├── config/
        │   ├── SecurityConfig.java        Registro del filtro JWT
        │   └── RestTemplateConfig.java    Configuracion del cliente HTTP
        ├── controller/
        │   └── ReservaController.java     Endpoints REST
        ├── dto/
        │   ├── ReservaRequest.java
        │   ├── ReservaResponse.java
        │   ├── ActualizarEstadoRequest.java
        │   ├── EditarReservaRequest.java
        │   ├── UsuarioDto.java
        │   ├── EspacioDto.java
        │   └── PaginadoResponse.java
        ├── model/
        │   └── Reserva.java               Entidad JPA
        ├── repository/
        │   └── ReservaRepository.java     Queries JPA derivados y custom
        ├── security/
        │   └── JwtFilter.java             Filtro de verificacion de JWT
        └── service/
            ├── ReservaService.java        Logica de negocio
            ├── AuthClient.java            Cliente HTTP al Auth Service
            └── EspacioClient.java         Cliente HTTP al Space Service
```

## Algoritmos y Estructuras de Datos

### Cola de Prioridad (Min-Heap)

Implementada desde cero con un ArrayList y operaciones de heapify-up y heapify-down.

- `insertar` - O(log n). Agrega al final y sube.
- `extraerMax` - O(log n). Extrae la raiz y baja.
- `verSiguiente` - O(1). Lee la raiz sin extraer.
- `eliminarPorId` - O(n). Util al cancelar o editar prioridad.

Prioridades: 1=URGENTE, 2=NORMAL, 3=FLEXIBLE. El menor numero sale primero.

### Interval Tree (AVL balanceado)

Detecta solapamientos de horarios en O(log n + k). Cada nodo guarda un intervalo (fechaInicio, fechaFin) y el maximo `fin` de su subarbol, lo que permite descartar ramas completas durante la busqueda.

- `insertar` - O(log n) con rotaciones AVL.
- `eliminar` - O(log n).
- `buscarSolapamientos(inicio, fin, ignorarId)` - O(log n + k) donde k es el numero de solapamientos.

 Reemplaza la query SQL original `existeConflicto` para verificaciones en memoria mas rapidas. El arbol se reconstruye al arrancar el servicio con todas las reservas activas (PENDIENTE, CONFIRMADA o PAGADA).

### Cache LRU

Lista doblemente enlazada mas HashMap. Operaciones get/put en O(1). Generico tipado: `CacheLRU<K, V>`.

- `cacheUsuarios` - Capacidad 100, para datos del Auth Service.
- `cacheEspacios` - Capacidad 100, para datos del Space Service.

Cada cache reporta hits, misses, hit rate y claves activas.

### Busqueda por Fecha (lineal vs binaria)

- Lineal: O(n). Recorre todas las reservas.
- Binaria: O(n log n) sort + O(log n) busqueda con `lower_bound` para encontrar el rango de un dia completo.

El endpoint `/reservas/buscar-fecha?algoritmo=lineal|binaria` permite comparar ambos.

## Integracion con Otros Servicios

### Auth Service

- Reenvia el JWT del usuario al Auth Service al obtener datos de usuario.
- Cachea las respuestas en el LRU.
- Se usa al listar reservas como admin (enriquece con nombre y email).

### Space Service

- Al crear una reserva, consulta `GET /espacios/{id}` para validar que existe y esta disponible.
- Copia el nombre del espacio y el precio por hora a la reserva, evitando llamadas posteriores.
- El campo `precioHora` queda disponible para que el Billing Service genere facturas sin consultar al Space Service.

## Modelo de Datos

```
reservas
├── id              BIGINT (PK, auto-generado)
├── usuario_id      BIGINT NOT NULL
├── espacio_id      BIGINT NOT NULL
├── nombre_espacio  VARCHAR
├── precio_hora     DECIMAL
├── fecha_inicio    TIMESTAMP NOT NULL
├── fecha_fin       TIMESTAMP NOT NULL
├── estado          VARCHAR NOT NULL (PENDIENTE | CONFIRMADA | PAGADA | CANCELADA | COMPLETADA)
├── prioridad       INTEGER NOT NULL (1, 2, 3)
├── creado_en       TIMESTAMP
└── notas           VARCHAR
```

## Notas

- La cola de prioridad y el Interval Tree son estructuras en memoria. Se reconstruyen al arrancar el servicio leyendo desde la base de datos.
- Las reservas COMPLETADAS y CANCELADAS no participan en la deteccion de conflictos.
- Al confirmar una reserva se genera la factura automaticamente; al pagar se marca como PAGADA y al inicio de la franja se completa.
- La paginacion limita el tamanio maximo de pagina a 100 resultados.

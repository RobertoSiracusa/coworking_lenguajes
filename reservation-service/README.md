# Reservation Service

Motor de reservas del sistema de co-working. Gestiona el ciclo de vida completo (por confirmar -> confirmada -> pagada -> completada o cancelada), prioriza con cola de prioridad (min-heap), detecta solapamientos con Interval Tree balanceado y dispara la generacion de facturas automaticamente al pago.

## Flujo de una Reserva

```
1. Usuario crea reserva
   estado = PENDIENTE (por confirmar)
   estadoPago = NO_PAGADA
   -> insertar en min-heap (cola de prioridad)
   -> insertar en Interval Tree

2. Admin abre tab Cola, click "Confirmar siguiente"
   POST /cola/confirmar
   -> extraerMax() del heap (mayor prioridad)
   estado = CONFIRMADA, estadoPago = NO_PAGADA

3. Usuario paga
   PATCH /reservas/{id}/pagar
   estadoPago = PAGADA
   -> trigger HTTP a Billing Service: factura automatica

4. Admin completa (o se auto-completa por hora)
   PATCH /reservas/{id}/completar
   estado = COMPLETADA (require CONFIRMADA + PAGADA)
```

Dos estados independientes:

- **estado**: PENDIENTE, CONFIRMADA, COMPLETADA, CANCELADA
- **estadoPago**: NO_PAGADA, PAGADA, REEMBOLSADA

## Tecnologias

- Java 17
- Spring Boot 3.2
- Spring Data JPA / Hibernate
- PostgreSQL 15
- JJWT 0.11.5
- Lombok

## Variables de Entorno

| Variable | Descripcion | Valor por defecto |
|----------|-------------|-------------------|
| PORT | Puerto del servicio | 8003 |
| DATABASE_URL | URL JDBC PostgreSQL | (requerido) |
| SECRET_KEY | Compartida (>= 32 caracteres por requisito JJWT) | (requerido) |
| AUTH_SERVICE_URL | URL Auth Service | http://auth-service:8001 |
| SPACE_SERVICE_URL | URL Space Service | http://space-service:8002 |
| BILLING_SERVICE_URL | URL Billing Service (trigger facturas) | http://billing-service:8004 |

## Como Ejecutar

```
cp .env.example .env
docker compose up --build
```

Servicio en `http://localhost:8003`. BD en `localhost:5434`.

## Endpoints

| Metodo | Ruta | Acceso | Descripcion |
|--------|------|--------|-------------|
| GET | /health | Publico | Health check |
| POST | /reservas | Usuario | Crea reserva (valida usuario y espacio via HTTP, auto-popular precio_hora) |
| GET | /reservas | Admin | Lista con filtros, paginacion y datos enriquecidos del usuario |
| GET | /reservas/mis-reservas | Usuario | Lista propias |
| GET | /reservas/mis-estadisticas | Usuario | Resumen personal por estado y horas |
| GET | /reservas/buscar-fecha | Admin | `algoritmo=lineal\|binaria` |
| GET | /reservas/espacio/{espacioId} | Usuario | Reservas activas de un espacio (para deshabilitar slots) |
| PUT | /reservas/{id} | Usuario / Admin | Edita reserva pendiente |
| DELETE | /reservas/{id} | Usuario / Admin | Cancela reserva |
| PATCH | /reservas/{id}/pagar | Usuario / Admin | Cambia estadoPago a PAGADA + dispara factura |
| POST | /reservas/{id}/facturar | Usuario / Admin | Factura manual |
| PATCH | /reservas/{id}/completar | Admin | Marca COMPLETADA (require CONFIRMADA + PAGADA) |
| PATCH | /reservas/{id}/estado | Admin | Cambia estado arbitrariamente |
| GET | /cola | Admin | Estado de la cola de prioridad |
| POST | /cola/confirmar | Admin | Extrae siguiente del heap (cambio a CONFIRMADA) |
| DELETE | /reservas/reset | Admin | Mantenimiento: borra todas las reservas + vacia heap e Interval Tree |
| GET | /cache/estadisticas | Admin | Stats LRU + tamano Interval Tree |

### Filtros y Paginacion (GET /reservas)

- `estado` - PENDIENTE, CONFIRMADA, COMPLETADA, CANCELADA
- `prioridad` - 1 (urgente), 2 (normal), 3 (flexible)
- `desde`, `hasta` - rango de fechas
- `pagina`, `por_pagina` (max 100)

## Algoritmos y Estructuras

### Cola de Prioridad (Min-Heap)
Implementacion manual con ArrayList. Insertar/extraer en O(log n). Niveles 1=URGENTE, 2=NORMAL, 3=FLEXIBLE.

### Interval Tree AVL — O(log n + k)
Detecta solapamientos en O(log n + k). Cada nodo guarda intervalo + `maxFin` del subarbol, lo que permite descartar ramas completas durante la busqueda.

### Cache LRU generico — O(1)
HashMap + doubly linked list, thread-safe. Tipado `CacheLRU<K, V>`. Dos instancias: usuarios y espacios.

### Busqueda Lineal vs Binaria por Fecha
- Lineal: O(n)
- Binaria: O(n log n) sort + O(log n) busqueda con lower_bound

### JpaSpecificationExecutor (filtros dinamicos)
Reemplaza @Query con OR-NULL que fallaba en PostgreSQL. Solo agrega predicados para filtros no nulos.

### Generacion automatica de facturas
Al pagar, `BillingClient` hace POST HTTP a billing con datos snake_case. Si falla, log warning sin romper el flujo.

### Tarea programada — auto-completar
`@Scheduled` cada 60s busca reservas CONFIRMADAS + PAGADAS cuya fecha de inicio ya paso y las marca COMPLETADA.

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
        │   ├── ColaPrioridad.java         Min-heap manual
        │   ├── CacheLRU.java              Cache LRU generico
        │   ├── IntervalTree.java          AVL para solapamientos
        │   └── BusquedaFechas.java        Lineal y binaria
        ├── config/
        │   ├── SecurityConfig.java        Registro JwtFilter
        │   ├── CorsConfig.java            CorsFilter con HIGHEST_PRECEDENCE
        │   └── RestTemplateConfig.java    Cliente HTTP
        ├── controller/
        │   └── ReservaController.java     Endpoints REST
        ├── dto/
        │   ├── ReservaRequest.java
        │   ├── ReservaResponse.java       Incluye estado + estadoPago
        │   ├── EditarReservaRequest.java
        │   ├── ActualizarEstadoRequest.java
        │   ├── UsuarioDto.java
        │   ├── EspacioDto.java
        │   └── PaginadoResponse.java
        ├── model/
        │   └── Reserva.java               Entity + EstadoReserva + EstadoPago
        ├── repository/
        │   └── ReservaRepository.java     JpaSpecificationExecutor
        ├── security/
        │   └── JwtFilter.java             Filtro JWT
        └── service/
            ├── ReservaService.java        Logica de negocio
            ├── AuthClient.java            HTTP a Auth Service
            ├── EspacioClient.java         HTTP a Space Service
            └── BillingClient.java         HTTP a Billing (trigger facturas)
```

## Integracion con Otros Servicios

| Servicio | Cuando |
|----------|--------|
| Auth | Al listar reservas como admin (enriquecimiento usuario_nombre/email) |
| Space | Al crear reserva (valida espacio existe + copia precio_por_hora) |
| Billing | Al pagar reserva (POST /facturas automatico) |

## CORS

`CorsConfig.java` registra `CorsFilter` con `HIGHEST_PRECEDENCE`. Corre antes que JwtFilter y agrega headers incluso a respuestas 401.

## Modelo de Datos

```
reservas
├── id              BIGINT (PK)
├── usuario_id      BIGINT NOT NULL
├── espacio_id      BIGINT NOT NULL
├── nombre_espacio  VARCHAR
├── precio_hora     DECIMAL
├── fecha_inicio    TIMESTAMP NOT NULL
├── fecha_fin       TIMESTAMP NOT NULL
├── estado          VARCHAR NOT NULL
├── estado_pago     VARCHAR NOT NULL
├── prioridad       INTEGER NOT NULL
├── creado_en       TIMESTAMP
└── notas           VARCHAR
```

## Notas

- Cola e Interval Tree son en memoria. Se reconstruyen al arrancar leyendo PENDIENTES y CONFIRMADAS de la BD.
- COMPLETADAS y CANCELADAS no participan en deteccion de conflictos.
- `server.error.include-message=always` activado para que el frontend reciba el mensaje de validacion en respuestas 4xx.
- DELETE `/reservas/{id}` usa regex `{id:\\d+}` para evitar colision con `/reset`.
- TZ configurado a `America/Caracas` en docker-compose para alinear `@Future` validation con el reloj del host.

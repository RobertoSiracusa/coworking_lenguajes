# Reservation Service (Motor de Reservas)

## Información General

| Campo | Valor |
|-------|-------|
| **Lenguaje** | Java 17 |
| **Framework** | Spring Boot 3.2.0 |
| **Base de datos** | PostgreSQL 15 (Spring Data JPA / Hibernate) |
| **Puerto** | 8003 |
| **Autenticación** | JWT (librería jjwt 0.11.5, misma SECRET_KEY que Auth Service) |
| **Contenedorización** | Docker multi-stage (Maven build + JRE runtime) |

## Estructura de Archivos

```
reservation-service/
├── Dockerfile
├── docker-compose.yml
├── pom.xml
└── src/main/
    ├── resources/
    │   └── application.properties
    └── java/com/coworking/reservations/
        ├── ReservationServiceApplication.java     # Punto de entrada
        ├── algorithm/
        │   └── ColaPrioridad.java                 # Min-Heap para priorizar reservas
        ├── config/
        │   └── SecurityConfig.java                # Registro del filtro JWT
        ├── controller/
        │   └── ReservaController.java             # Endpoints REST
        ├── dto/
        │   ├── ReservaRequest.java                # DTO de entrada
        │   └── ReservaResponse.java               # DTO de salida
        ├── model/
        │   └── Reserva.java                       # Entidad JPA
        ├── repository/
        │   └── ReservaRepository.java             # Acceso a datos (Spring Data)
        ├── security/
        │   └── JwtFilter.java                     # Filtro de autenticación JWT
        └── service/
            └── ReservaService.java                # Lógica de negocio
```

## Descripción de Archivos

### `pom.xml`

Proyecto Maven con Spring Boot 3.2.0 como parent. Dependencias:
- `spring-boot-starter-web` — endpoints REST
- `spring-boot-starter-data-jpa` — acceso a BD con JPA/Hibernate
- `spring-boot-starter-validation` — validación con `@Valid`
- `postgresql` — driver de BD
- `jjwt-api/impl/jackson` (0.11.5) — verificación de tokens JWT
- `lombok` — reduce boilerplate (getters, setters, constructores)
- `spring-boot-starter-test` — tests

### `Dockerfile`

Build multi-stage:
1. **Etapa 1 (builder)**: `maven:3.9-eclipse-temurin-17`. Descarga dependencias primero (`dependency:go-offline` para cache), luego compila con `mvn package -DskipTests`.
2. **Etapa 2 (runtime)**: `eclipse-temurin:17-jre-alpine`. Copia el JAR y lo ejecuta. Puerto 8003.

### `docker-compose.yml`

Dos servicios:
- **db**: PostgreSQL 15-alpine, base `reservationsdb`, usuario `coworking_user`, puerto externo `5434`.
- **reservation-service**: construye desde Dockerfile, puerto `8003`, espera a que la BD esté healthy.

### `application.properties`

Configuración de Spring Boot:
- Puerto configurable via `PORT` (default 8003).
- `DATABASE_URL` para conexión PostgreSQL.
- Hibernate `ddl-auto=update` (crea/actualiza tablas automáticamente).
- `jwt.secret` lee de `SECRET_KEY` del entorno.

### `ReservationServiceApplication.java` — Punto de entrada

Clase principal con `@SpringBootApplication`. Ejecuta `SpringApplication.run()` para arrancar el contexto de Spring Boot.

### `algorithm/ColaPrioridad.java` — Cola de Prioridad (Min-Heap)

Implementación manual de un Min-Heap usando un `ArrayList<Reserva>`.

**Concepto**: árbol binario completo donde el padre siempre tiene menor o igual prioridad que sus hijos. Prioridad 1 (URGENTE) sale primero, prioridad 3 (FLEXIBLE) sale último.

**Representación en array**:
- `parent(i) = (i - 1) / 2`
- `leftChild(i) = 2 * i + 1`
- `rightChild(i) = 2 * i + 2`

| Método | Complejidad | Descripción |
|--------|-------------|-------------|
| `insertar(Reserva)` | O(log n) | Agrega al final y ejecuta heapify-up. |
| `extraerMax()` | O(log n) | Extrae la raíz (mayor prioridad), mueve el último a la raíz y ejecuta heapify-down. |
| `verSiguiente()` | O(1) | Retorna la raíz sin extraerla. |
| `verCola()` | O(n log n) | Copia y ordena para mostrar estado de la cola. |
| `tamanio()` | O(1) | Cantidad de elementos. |
| `estaVacia()` | O(1) | Si la cola está vacía. |

Métodos internos:
- `subirUltimo()` (heapify-up): compara con padre, sube si tiene mayor prioridad.
- `bajarRaiz()` (heapify-down): compara con hijos, baja con el de mayor prioridad.
- `intercambiar(i, j)`: swap de dos posiciones.

### `config/SecurityConfig.java` — Configuración de Seguridad

Clase `@Configuration` que registra `JwtFilter` como `FilterRegistrationBean` aplicado a todas las URLs (`/*`), con orden 1.

### `controller/ReservaController.java` — Endpoints REST

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| `GET /health` | Público | Health check del servicio. |
| `POST /reservas` | Usuario | Crea reserva. El `usuarioId` se obtiene del JWT (no del body). |
| `POST /reservas/{id}/confirmar` | Usuario/Admin | Confirma una reserva pendiente y genera factura. |
| `GET /reservas/mis-reservas` | Usuario | Lista reservas del usuario autenticado. |
| `PATCH /reservas/{id}/pagar` | Usuario/Admin | Marca reserva como PAGADA (pago confirmado). |
| `DELETE /reservas/{id}` | Usuario/Admin | Cancela reserva. Usuarios solo pueden cancelar las suyas. |
| `GET /reservas` | Admin | Lista todas las reservas. |
| `PATCH /reservas/{id}/estado` | Admin | Cambia estado directamente (PENDIENTE/CONFIRMADA/PAGADA/COMPLETADA/CANCELADA). |
| `GET /cola` | Admin | Estado de la cola de prioridad: total, siguiente, lista ordenada. |
| `POST /cola/confirmar` | Admin | Confirma la siguiente reserva de mayor prioridad (extrae del heap). |

### `dto/ReservaRequest.java` — DTO de Entrada

Campos con validación:
- `espacioId` (`@NotNull`)
- `nombreEspacio`
- `fechaInicio` (`@NotNull`, `@Future`)
- `fechaFin` (`@NotNull`)
- `prioridad` (`@Min(1)`, `@Max(3)`, default 2) — 1=URGENTE, 2=NORMAL, 3=FLEXIBLE
- `notas`

### `dto/ReservaResponse.java` — DTO de Salida

Campos: `id`, `usuarioId`, `espacioId`, `nombreEspacio`, `fechaInicio`, `fechaFin`, `estado`, `prioridad`, `prioridadNombre` (texto legible), `creadoEn`, `notas`, `posicionEnCola`.

Método factory `desde(Reserva)`: convierte la entidad JPA al DTO, mapeando la prioridad numérica a nombre con switch expression de Java 17.

### `model/Reserva.java` — Entidad JPA

Entidad mapeada a tabla `reservas`. Campos:
- `id` (IDENTITY, auto-generado)
- `usuarioId`, `espacioId`, `nombreEspacio`
- `fechaInicio`, `fechaFin`
- `estado` (enum `EstadoReserva`: PENDIENTE, CONFIRMADA, PAGADA, CANCELADA, COMPLETADA)
- `prioridad` (1=URGENTE, 2=NORMAL, 3=FLEXIBLE, default 2)
- `creadoEn`, `notas`

Usa Lombok: `@Data`, `@NoArgsConstructor`, `@AllArgsConstructor`.

### `repository/ReservaRepository.java` — Acceso a Datos

Interface que extiende `JpaRepository<Reserva, Long>`. Queries derivados:

| Método | Descripción |
|--------|-------------|
| `findByUsuarioIdOrderByCreadoEnDesc(Long)` | Reservas de un usuario, más recientes primero. |
| `findByEspacioIdOrderByFechaInicio(Long)` | Reservas de un espacio, por fecha. |
| `findByEstadoOrderByPrioridadAscCreadoEnAsc(EstadoReserva)` | Reservas pendientes por prioridad (para reconstruir la cola). |
| `existeConflicto(Long, LocalDateTime, LocalDateTime)` | Query JPQL que detecta solapamiento de horarios para un espacio. |

### `security/JwtFilter.java` — Filtro JWT

Extiende `OncePerRequestFilter`. Flujo:
1. Si la URI es `/health`, deja pasar sin token.
2. Extrae token del header `Authorization: Bearer <token>`.
3. Verifica firma con `SECRET_KEY` usando HMAC.
4. Guarda `usuario_id` y `rol` como atributos del request.
5. Retorna 401 si el token falta o es inválido.

### `service/ReservaService.java` — Lógica de Negocio

| Método | Descripción |
|--------|-------------|
| `inicializarCola()` | `@PostConstruct`: al arrancar, reconstruye la cola de prioridad con reservas PENDIENTES de la BD. La cola sobrevive reinicios. |
| `crear(ReservaRequest, Long)` | Valida fechas, verifica conflictos de horario, guarda en BD, inserta en la cola — O(log n). |
| `confirmar(id)` | Confirma una reserva pendiente y genera factura. |
| `confirmarSiguiente()` | Extrae la reserva de mayor prioridad de la cola — O(log n). Cambia estado a CONFIRMADA y genera factura. |
| `completarPagadasPorHora()` | Tarea programada: marca como COMPLETADA las reservas PAGADAS cuya hora de inicio ya ocurrió. |
| `estadoCola()` | Retorna mapa con: total en cola, siguiente reserva, lista completa ordenada. |
| `misReservas(Long)` | Lista reservas de un usuario. |
| `cancelar(Long, Long, boolean)` | Cancela reserva. Usuarios solo pueden cancelar las suyas, admin cualquiera. |
| `listarTodas()` | Lista todas las reservas (admin). |

## Modelo de Datos

```
reservas
├── id              BIGINT (PK, auto-generado)
├── usuario_id      BIGINT NOT NULL
├── espacio_id      BIGINT NOT NULL
├── nombre_espacio  VARCHAR
├── fecha_inicio    TIMESTAMP NOT NULL
├── fecha_fin       TIMESTAMP NOT NULL
├── estado          VARCHAR NOT NULL (PENDIENTE | CONFIRMADA | PAGADA | CANCELADA | COMPLETADA)
├── prioridad       INTEGER NOT NULL (1=URGENTE, 2=NORMAL, 3=FLEXIBLE)
├── creado_en       TIMESTAMP
└── notas           VARCHAR
```

## Comunicación con Otros Microservicios

- Comparte `SECRET_KEY` con el **Auth Service** para verificar tokens JWT sin llamadas inter-servicio.
- Las facturas se generan al confirmar la reserva; el **Billing Service** notifica el pago para marcar la reserva como PAGADA.
- Referencia `espacio_id` y `nombre_espacio` del **Space Service** (almacena copia local, no consulta en tiempo real).

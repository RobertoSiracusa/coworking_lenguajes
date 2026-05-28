# Sistema de Gestión de Co-working — Arquitectura de Microservicios

## 1. Introducción

Este documento describe la arquitectura, funcionamiento e interconexión de los tres microservicios que componen el sistema de gestión de espacios de co-working. El sistema permite a los usuarios buscar y reservar espacios de trabajo (oficinas, salas de reuniones, escritorios compartidos), y a los administradores gestionar dichos espacios, confirmar reservas y generar reportes de facturación.

Cada microservicio está implementado en un **lenguaje de programación diferente**, lo cual demuestra cómo la arquitectura de microservicios permite que equipos independientes elijan la tecnología más adecuada para su dominio, siempre que respeten los contratos de comunicación establecidos.

| Microservicio | Lenguaje | Framework | Puerto | Responsabilidad |
|---------------|----------|-----------|--------|-----------------|
| **Space Service** | Go 1.21 | Gin | 8002 | Gestión del catálogo de espacios |
| **Reservation Service** | Java 17 | Spring Boot 3.2 | 8003 | Motor de reservas con cola de prioridad |
| **Billing Service** | JavaScript (Node.js 20) | Express | 8004 | Facturación y reportes financieros |

## 2. Visión General de la Arquitectura

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENTES                                  │
│                  (Frontend / Postman / curl)                         │
└──────────┬──────────────────┬──────────────────┬────────────────────┘
           │                  │                  │
           │ JWT              │ JWT              │ JWT
           ▼                  ▼                  ▼
   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
   │ Space Service │  │  Reservation  │  │   Billing     │
   │   (Go/Gin)    │  │   Service     │  │   Service     │
   │   :8002       │  │ (Java/Spring) │  │  (Node/Express)│
   │               │  │   :8003       │  │   :8004       │
   └───────┬───────┘  └───────┬───────┘  └───────┬───────┘
           │                  │                  │
           ▼                  ▼                  ▼
   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
   │  PostgreSQL   │  │  PostgreSQL   │  │  PostgreSQL   │
   │   spacesdb    │  │ reservationsdb│  │   billingdb   │
   │   :5433       │  │   :5434       │  │   :5435       │
   └───────────────┘  └───────────────┘  └───────────────┘
```

### 2.1 Principio de Base de Datos por Servicio

Cada microservicio posee su **propia base de datos PostgreSQL**, ejecutándose en puertos distintos (5433, 5434, 5435). Este es un principio fundamental de la arquitectura de microservicios conocido como *Database per Service*:

- Cada servicio es dueño exclusivo de sus datos.
- Ningún servicio accede directamente a la base de datos de otro.
- La comunicación entre servicios se realiza únicamente a través de sus APIs REST.
- Si un servicio necesita datos de otro, almacena una copia local de los campos relevantes (por ejemplo, `nombre_espacio` se copia en la tabla `reservas` y en `facturas`).

Esta separación permite que cada servicio evolucione su esquema de forma independiente sin romper a los demás.

### 2.2 Contenedorización con Docker

Cada microservicio incluye un `Dockerfile` y un `docker-compose.yml` que levanta el servicio junto con su base de datos. Los tres Dockerfiles siguen el patrón **multi-stage build**:

1. **Etapa de compilación**: usa una imagen pesada con todas las herramientas de build (Maven, Go compiler, o npm).
2. **Etapa de ejecución**: usa una imagen mínima (Alpine) que contiene solo el binario/runtime necesario.

Esto reduce drásticamente el tamaño de la imagen final y mejora la seguridad al no incluir herramientas de desarrollo en producción.

## 3. Autenticación Compartida — JWT

Los tres microservicios comparten el mismo mecanismo de autenticación basado en **JSON Web Tokens (JWT)**. Existe un Auth Service externo (no incluido en estos tres) que genera los tokens. Los microservicios solo **verifican** esos tokens.

### 3.1 ¿Cómo funciona?

```
┌──────────┐     POST /login      ┌──────────────┐
│ Cliente   │ ──────────────────► │ Auth Service  │
│           │ ◄────────────────── │ (genera JWT)  │
│           │     { token: "..." }└──────────────┘
│           │                           │
│           │   GET /espacios           │  Misma SECRET_KEY
│           │   Authorization:          │  compartida
│           │   Bearer <token>          ▼
│           │ ──────────────────► ┌──────────────┐
│           │                     │ Space Service │
│           │ ◄────────────────── │ (verifica JWT)│
│           │   [lista de espacios]└──────────────┘
└──────────┘
```

1. El cliente se autentica contra el Auth Service y recibe un JWT.
2. El JWT contiene en su payload: `sub` (ID del usuario) y `rol` (admin o usuario).
3. En cada request a cualquier microservicio, el cliente envía el token en el header `Authorization: Bearer <token>`.
4. El microservicio verifica la firma del token usando la **misma `SECRET_KEY`** que usó el Auth Service para firmarlo.
5. No hay necesidad de que los microservicios se comuniquen con el Auth Service en cada request — el token es **autocontenido**.

### 3.2 Implementación en cada lenguaje

Aunque el mecanismo es idéntico, cada servicio lo implementa con las herramientas de su ecosistema:

| Servicio | Librería | Mecanismo |
|----------|----------|-----------|
| Space Service (Go) | `golang-jwt/jwt/v5` | Middleware Gin (`VerificarJWT()`) que parsea el token y guarda `usuario_id` y `rol` en el contexto Gin con `c.Set()`. |
| Reservation Service (Java) | `jjwt 0.11.5` | Filtro `OncePerRequestFilter` registrado en `SecurityConfig`. Guarda datos en `request.setAttribute()`. |
| Billing Service (Node.js) | `jsonwebtoken` | Middleware Express que llama a `jwt.verify()` y guarda datos en `req.usuarioId` y `req.rol`. |

### 3.3 Control de acceso por rol

Los tres servicios implementan un segundo nivel de autorización basado en el campo `rol` del JWT:

- **Usuarios autenticados**: pueden ver espacios, crear reservas, ver sus propias facturas.
- **Administradores** (`rol: "admin"`): pueden crear/modificar espacios, confirmar reservas, generar facturas, ver reportes.

Cada servicio tiene su propio middleware de verificación de rol (respectivamente `SoloAdmin()` en Go, `verificarAdmin()` en Java, y `soloAdmin()` en Node.js).

## 4. Space Service (Go) — Gestión de Espacios

### 4.1 Responsabilidad

Es el catálogo del sistema. Gestiona los espacios de co-working: oficinas, salas de reuniones, escritorios compartidos. Almacena nombre, descripción, capacidad, precio por hora y disponibilidad de cada espacio.

### 4.2 Flujo de operaciones

```
Usuario autenticado                      Administrador
       │                                       │
       ├── GET /espacios                       ├── POST /espacios
       │   (listar todos)                      │   (crear espacio)
       │                                       │
       ├── GET /espacios/buscar?q=sala         ├── PUT /espacios/:id
       │   (buscar por nombre)                 │   (actualizar espacio)
       │                                       │
       ├── GET /espacios/disponibles           ├── PATCH /espacios/:id/disponibilidad
       │   ?capacidad=5&orden=precio           │   (habilitar/deshabilitar)
       │                                       │
       └── GET /espacios/:id                   │
           (detalle de un espacio)              │
```

### 4.3 Algoritmos implementados

El Space Service implementa dos algoritmos de búsqueda con fines didácticos. El endpoint `/espacios/buscar` acepta un query parameter `algoritmo` que permite alternar entre ambos:

**Búsqueda Lineal — O(n)**
```
Para cada espacio en la lista:
    Si el nombre contiene el término de búsqueda:
        Agregarlo al resultado
```
Recorre todos los elementos uno por uno. Sencillo pero ineficiente para grandes volúmenes.

**Búsqueda Binaria — O(n log n) + O(log n)**
```
1. Ordenar la lista alfabéticamente por nombre     → O(n log n)
2. Buscar el punto de inserción con sort.Search     → O(log n)
3. Expandir desde ese punto buscando coincidencias  → O(k)
```
Requiere ordenar previamente, pero la búsqueda en sí es logarítmica. Con 1,000 espacios: la búsqueda lineal hace ~1,000 comparaciones, la binaria hace ~10.

**Nota**: en este caso, como se buscan coincidencias parciales (substring) y se ordena previamente, la ventaja real de la binaria se manifiesta cuando la lista ya está ordenada y se realizan múltiples búsquedas consecutivas.

### 4.4 Patrón de diseño

El servicio sigue una arquitectura en capas típica de Go:

```
Handler (HTTP) → Repository (datos) → GORM (ORM) → PostgreSQL
                        ↑
                  Algorithm (búsqueda/filtro)
```

- **Handler**: recibe requests HTTP, valida parámetros, delega al repository o al algoritmo.
- **Repository**: encapsula el acceso a datos con GORM.
- **Algorithm**: funciones puras de búsqueda y ordenamiento, separadas del acceso a datos.

## 5. Reservation Service (Java) — Motor de Reservas

### 5.1 Responsabilidad

Gestiona el ciclo de vida completo de las reservas: creación, validación de conflictos, priorización mediante cola de prioridad, confirmación y cancelación.

### 5.2 Ciclo de vida de una reserva

```
                     ┌──────────┐
      POST /reservas │          │
     ───────────────►│ PENDIENTE│──── DELETE /reservas/:id ───► CANCELADA
                     │          │
                     └────┬─────┘
                          │
             POST /reservas/{id}/confirmar
             (usuario confirma)
                          │
                     ┌────▼─────┐
                     │CONFIRMADA│──── PATCH /facturas/:id/pagar ───► PAGADA
                     └────┬─────┘
                          │
                   (inicio de la franja)
                          │
                     ┌────▼─────┐
                     │COMPLETADA│
                     └──────────┘
```

1. Un usuario crea una reserva → estado **PENDIENTE** → se inserta en la cola de prioridad.
2. El usuario confirma su reserva → estado **CONFIRMADA** → se genera factura.
3. El usuario paga la factura → estado **PAGADA**.
4. Al inicio de la franja → estado **COMPLETADA**.

### 5.3 Algoritmo: Cola de Prioridad (Min-Heap)

La estructura de datos central de este servicio es un **Min-Heap** implementado manualmente (no usa `PriorityQueue` de Java).

**¿Qué es un Heap?**

Un heap es un árbol binario completo que cumple una propiedad: en un min-heap, cada nodo padre tiene un valor menor o igual que sus hijos. Esto garantiza que el elemento de mayor prioridad (menor valor numérico) siempre está en la raíz.

**Representación en array:**

```
Niveles del árbol:          Representación en array:

         [1]                 índice:  0  1  2  3  4  5
        /   \                valor:  [1, 2, 3, 2, 3, 3]
      [2]   [3]
      / \    /               parent(i)     = (i - 1) / 2
    [2] [3] [3]              leftChild(i)  = 2 * i + 1
                             rightChild(i) = 2 * i + 2
```

**Niveles de prioridad:**

| Valor | Nombre | Significado |
|-------|--------|-------------|
| 1 | URGENTE | Sale primero del heap |
| 2 | NORMAL | Prioridad intermedia |
| 3 | FLEXIBLE | Sale último |

**Operaciones:**

| Operación | Complejidad | Proceso |
|-----------|-------------|---------|
| Insertar | O(log n) | Se agrega al final del array y "sube" (heapify-up) comparando con su padre hasta encontrar su posición. |
| Extraer máximo | O(log n) | Se extrae la raíz, se coloca el último elemento en la raíz y "baja" (heapify-down) comparando con sus hijos. |
| Ver siguiente | O(1) | Se lee el índice 0 sin modificar el heap. |

**Ejemplo de inserción (heapify-up):**

```
Estado inicial: [1, 2, 3]     Insertar reserva con prioridad 1:

Paso 1: agregar al final       Paso 2: comparar con padre
[1, 2, 3, 1]                   heap[3]=1 < heap[1]=2 → swap
         ↑ nuevo                [1, 1, 3, 2]

Paso 3: comparar con padre     Resultado:
heap[1]=1 < heap[0]=1 → NO     [1, 1, 3, 2]
(igual, no sube más)            La reserva urgente quedó arriba
```

### 5.4 Persistencia de la cola

La cola de prioridad vive en memoria (es un `ArrayList`), pero se reconstruye automáticamente al reiniciar el servicio. En `ReservaService.inicializarCola()` (anotado con `@PostConstruct`), se consultan todas las reservas con estado `PENDIENTE` ordenadas por prioridad y se insertan en el heap. Esto asegura que la cola sobrevive reinicios del servidor.

### 5.5 Detección de conflictos de horario

Antes de crear una reserva, el sistema verifica que no exista solapamiento de horarios para el mismo espacio. La query JPQL:

```sql
SELECT COUNT(r) > 0 FROM Reserva r
WHERE r.espacioId = :espacioId
AND r.estado IN ('PENDIENTE', 'CONFIRMADA')
AND r.fechaInicio < :fin
AND r.fechaFin > :inicio
```

Dos intervalos de tiempo se solapan si y solo si uno empieza antes de que el otro termine y viceversa. Si existe conflicto, se rechaza la reserva con HTTP 409 (Conflict).

### 5.6 Patrón de diseño

Sigue la arquitectura en capas estándar de Spring Boot:

```
Controller (HTTP) → Service (lógica) → Repository (datos) → JPA/Hibernate → PostgreSQL
                        ↑
                  ColaPrioridad (heap en memoria)
```

- **Controller**: recibe requests, extrae datos del JWT, delega al Service.
- **Service**: orquesta la lógica de negocio, coordina entre Repository y ColaPrioridad.
- **Repository**: interface JPA con queries derivados y JPQL personalizado.
- **ColaPrioridad**: estructura de datos en memoria, inyectada como componente Spring.

## 6. Billing Service (Node.js) — Facturación y Reportes

### 6.1 Responsabilidad

Genera facturas a partir de reservas completadas y produce reportes financieros para los administradores: ingresos por espacio, por usuario, tendencias mensuales, y ranking de espacios más rentables.

### 6.2 Flujo de facturación

```
Reserva COMPLETADA                    Admin
(datos enviados                         │
desde Reservation Service)              │
        │                               │
        ▼                               │
  POST /facturas ◄──────────────────────┘
  (admin crea factura)
        │
        ▼
  ┌─────────────────┐
  │ calcularFactura  │
  │ horas = (fin-ini)│
  │ subtotal = h × p │
  │ IVA = 16%        │
  │ total = sub + IVA │
  └────────┬──────────┘
           │
           ▼
     Estado: PENDIENTE ──── PATCH /facturas/:id/pagar ──── Estado: PAGADA
```

### 6.3 Algoritmos implementados

#### Cálculo de factura — O(1)

```
horas    = (fecha_fin - fecha_inicio) / 3,600,000 ms
subtotal = horas × precio_por_hora
impuesto = subtotal × 0.16  (IVA 16%)
total    = subtotal + impuesto
```

Todos los valores se redondean a 2 decimales.

#### Agrupamiento con Hash Map — O(n)

Para los reportes "por espacio" y "por usuario", se usa un **objeto JavaScript como tabla hash**:

```
Entrada: [factura1, factura2, factura3, ...]

Para cada factura:
    clave = factura.espacio_id  (o usuario_id)
    Si la clave no existe en el hash:
        Crear entrada con contadores en 0
    Acumular: total_facturas++, total_ingresos += factura.total

Salida: Object.values(hash) → array de grupos
```

El acceso a un objeto JavaScript por clave es O(1) en promedio (internamente usa tabla hash), por lo que una sola pasada sobre todas las facturas es suficiente para agrupar — **O(n) total**.

#### Ventana deslizante — O(n)

Para el reporte de ingresos mensuales, en vez de hacer una query por cada mes (lo que sería O(n × m) queries a la BD), se usa una **ventana deslizante**:

```
1. Crear m "ventanas" vacías (una por cada mes)
2. Recorrer todas las facturas UNA sola vez:
   - Determinar en qué mes cae cada factura
   - Acumular en la ventana correspondiente
3. Resultado: ingresos por mes en O(n)
```

Adicionalmente se calcula la **tendencia porcentual**: variación entre el último y penúltimo mes.

#### Ordenamiento — O(n log n)

Todas las funciones de ordenamiento crean una copia del array antes de ordenar (nunca mutan el original). Usan `Array.sort()` nativo de JavaScript, que implementa TimSort con complejidad O(n log n).

### 6.4 Endpoints de reportes

| Endpoint | Qué muestra | Algoritmos |
|----------|-------------|------------|
| `GET /reportes/resumen` | Dashboard: total facturas, ingresos, facturas hoy, pendientes, promedio | Reducción O(n) |
| `GET /reportes/por-espacio` | Ingresos desglosados por espacio | Hash map O(n) + sort O(n log n) |
| `GET /reportes/por-usuario` | Gasto desglosado por usuario | Hash map O(n) + sort O(n log n) |
| `GET /reportes/ingresos-mensuales` | Tendencia mensual (últimos N meses) | Ventana deslizante O(n) |
| `GET /reportes/top-espacios` | Ranking de N espacios más rentables | Hash map O(n) + sort O(n log n) + slice O(k) |

## 7. Comunicación entre Microservicios

### 7.1 Flujo completo del sistema

El siguiente diagrama muestra cómo un usuario interactúa con los tres microservicios en un flujo típico:

```
┌──────────┐
│ USUARIO  │
└────┬─────┘
     │
     │ 1. Buscar espacios disponibles
     │    GET /espacios/disponibles?capacidad=4
     ▼
┌──────────────┐
│Space Service │ → Responde con lista de espacios
│   (Go)       │   [{ id:1, nombre:"Sala A", precio:50.00 }, ...]
└──────────────┘
     │
     │ 2. Crear reserva para el espacio elegido
     │    POST /reservas
     │    { espacioId:1, nombreEspacio:"Sala A",
     │      fechaInicio:"...", fechaFin:"...", prioridad:1 }
     ▼
┌──────────────┐
│ Reservation  │ → Verifica conflictos de horario
│ Service      │ → Guarda reserva (estado: PENDIENTE)
│  (Java)      │ → Inserta en cola de prioridad — O(log n)
└──────────────┘
     │
     │ 3. Usuario confirma su reserva
     │    POST /reservas/{id}/confirmar
     ▼
┌──────────────┐
│ Reservation  │ → Genera factura en Billing Service
│ Service      │ → Cambia estado a CONFIRMADA
└──────────────┘
     │
     │ 4. Usuario paga la factura
     │    PATCH /facturas/:id/pagar
     ▼
┌──────────────┐
│  Billing     │ → Estado: PAGADA
│  Service     │ → Notifica a Reservation Service
│  (Node.js)   │ → Reserva pasa a PAGADA
└──────────────┘
     │
     │ 5. Al inicio de la reserva, cambia a COMPLETADA
     ▼
┌──────────────┐
│ Reservation  │ → Reserva COMPLETADA
│ Service      │ → Disponible en reportes
└──────────────┘
```

### 7.2 Datos compartidos entre servicios

Los microservicios no se comunican directamente entre sí en tiempo real. En su lugar, los datos fluyen a través del **cliente** (o un orquestador) que extrae información de un servicio y la envía a otro:

```
Space Service                Reservation Service              Billing Service
┌────────────┐               ┌──────────────────┐             ┌───────────────┐
│ espacios   │               │ reservas         │             │ facturas      │
│            │  espacio_id   │                  │ reserva_id  │               │
│ id ────────┼──────────────►│ espacio_id       │────────────►│ reserva_id    │
│ nombre ────┼──────────────►│ nombre_espacio   │────────────►│ nombre_espacio│
│ precio ────┼───────────────┼──────────────────┼────────────►│ precio_hora   │
│            │               │ usuario_id ──────┼────────────►│ usuario_id    │
│            │               │ fecha_inicio ────┼────────────►│ fecha_inicio  │
│            │               │ fecha_fin ───────┼────────────►│ fecha_fin     │
└────────────┘               └──────────────────┘             └───────────────┘
```

Este patrón se conoce como **desnormalización**: cada servicio almacena una copia de los datos que necesita de otros servicios (como `nombre_espacio`). Esto evita llamadas inter-servicio para resolver datos, a costa de posible inconsistencia si el nombre del espacio cambia en el Space Service pero no se actualiza en las reservas o facturas existentes.

### 7.3 Seguridad compartida

```
                    SECRET_KEY (variable de entorno)
                    ─────────────────────────────────
                    │              │              │
              ┌─────▼────┐  ┌─────▼────┐  ┌─────▼────┐
              │  Space   │  │Reservation│  │ Billing  │
              │ Service  │  │ Service   │  │ Service  │
              │ (Go)     │  │ (Java)    │  │ (Node.js)│
              └──────────┘  └──────────┘  └──────────┘
```

Los tres servicios confían en el mismo secreto para verificar tokens. Esto es un patrón llamado **verificación descentralizada de JWT**: cada servicio puede verificar de forma independiente la autenticidad e integridad de un token sin necesidad de consultar al Auth Service. El JWT es autocontenido — lleva consigo la identidad (`sub`) y los permisos (`rol`) del usuario.

## 8. Tabla de Puertos y Servicios

| Servicio | Puerto App | Puerto BD | Base de Datos |
|----------|-----------|-----------|---------------|
| Space Service | 8002 | 5433 | spacesdb |
| Reservation Service | 8003 | 5434 | reservationsdb |
| Billing Service | 8004 | 5435 | billingdb |

## 9. Resumen de Algoritmos y Estructuras de Datos

| Servicio | Algoritmo/Estructura | Complejidad | Uso |
|----------|---------------------|-------------|-----|
| Space | Búsqueda lineal | O(n) | Buscar espacios por nombre |
| Space | Búsqueda binaria | O(n log n) + O(log n) | Buscar espacios (optimizado) |
| Space | Filtrado + ordenamiento | O(n) + O(n log n) | Espacios disponibles por precio |
| Reservation | Min-Heap (cola de prioridad) | Inserción O(log n), extracción O(log n) | Priorizar reservas pendientes |
| Reservation | Detección de conflictos | O(1) query indexada | Evitar solapamiento de horarios |
| Billing | Cálculo de factura | O(1) | Computar horas, subtotal, IVA, total |
| Billing | Agrupamiento con hash map | O(n) | Reportes por espacio y por usuario |
| Billing | Ventana deslizante | O(n) | Ingresos mensuales |
| Billing | Ordenamiento (TimSort) | O(n log n) | Ordenar resultados de reportes |

## 10. Tecnologías Utilizadas

| Categoría | Space Service | Reservation Service | Billing Service |
|-----------|--------------|--------------------|-----------------| 
| Lenguaje | Go 1.21 | Java 17 | JavaScript (Node.js 20) |
| Framework HTTP | Gin 1.9.1 | Spring Boot 3.2.0 | Express 4.18 |
| ORM / Driver BD | GORM 1.25 | Spring Data JPA / Hibernate | pg 8.11 (driver nativo) |
| Librería JWT | golang-jwt/v5 | jjwt 0.11.5 | jsonwebtoken 9.0.2 |
| Base de datos | PostgreSQL 15 | PostgreSQL 15 | PostgreSQL 15 |
| Contenedor | Docker (Alpine) | Docker (Temurin JRE Alpine) | Docker (Node Alpine) |
| Gestión deps | Go Modules | Maven | npm |

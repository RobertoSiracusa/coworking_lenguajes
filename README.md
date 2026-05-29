# Co-working Lenguajes

Sistema de coworking basado en microservicios para la materia Lenguajes de Programacion. Cada microservicio esta implementado en un lenguaje distinto, demostrando que la arquitectura de microservicios permite usar el stack mas adecuado para cada dominio mientras se mantiene interoperabilidad via REST + JWT.

## Microservicios

| Servicio | Lenguaje | Framework | Puerto | Rol |
|----------|----------|-----------|--------|-----|
| **Auth Service** | Python 3.13 | FastAPI | 8001 | Autenticacion, emision de JWT, gestion de usuarios |
| **Space Service** | Go 1.23 | Gin | 8002 | Catalogo de espacios, busqueda con multiples algoritmos |
| **Reservation Service** | Java 17 | Spring Boot 3.2 | 8003 | Motor de reservas con cola de prioridad e Interval Tree |
| **Billing Service** | Node.js 20 | Express | 8004 | Facturacion, reportes financieros, cache LRU |
| **Frontend** | HTML / CSS / JS vanilla | — | 3000 | SPA que consume los 4 servicios |

## Algoritmos y Estructuras Implementados

Todo desde cero, sin librerias externas:

| Servicio | Algoritmo / Estructura | Complejidad |
|----------|------------------------|-------------|
| Auth | Tabla Hash con DJB2 + separate chaining | O(1) promedio |
| Space | Trie (autocompletado) | O(L + k) |
| Space | Indice invertido | O(palabras × k) |
| Space | Busqueda binaria | O(n log n) + O(log n) |
| Space | Quicksort con mediana de tres | O(n log n) |
| Space | Cache LRU thread-safe | O(1) |
| Reservation | Min-Heap (cola de prioridad) | O(log n) |
| Reservation | Interval Tree AVL | O(log n + k) |
| Reservation | Cache LRU generico | O(1) |
| Billing | Hash map agrupamiento | O(n) |
| Billing | Ventana deslizante | O(n) |
| Billing | Cache LRU | O(1) |

Cada servicio (excepto Auth) expone el mismo patron `?algoritmo=lineal|otro` para comparar lineal vs optimizado sobre la misma data.

## Arquitectura

```
                  ┌─────────────┐
                  │  Frontend   │ (HTML+JS, puerto 3000)
                  └──────┬──────┘
                         │
        ┌────────────────┼────────────────┬────────────────┐
        │                │                │                │
        ▼                ▼                ▼                ▼
   ┌─────────┐    ┌──────────┐    ┌─────────────┐   ┌──────────┐
   │  Auth   │    │  Space   │    │ Reservation │   │ Billing  │
   │ :8001   │    │  :8002   │    │   :8003     │   │  :8004   │
   └────┬────┘    └─────┬────┘    └──────┬──────┘   └────┬─────┘
        │              │                  │               │
        ▼              ▼                  ▼               ▼
   ┌─────────┐    ┌──────────┐    ┌─────────────┐   ┌──────────┐
   │ auth_db │    │ space_db │    │reservation_ │   │billing_db│
   │ :5432   │    │  :5433   │    │   db :5434  │   │  :5435   │
   └─────────┘    └──────────┘    └─────────────┘   └──────────┘

Comunicacion HTTP entre servicios (todos en red docker coworking_net):
- Space -> Reservation (disponibilidad real, conteo reservas activas)
- Reservation -> Auth (validar usuarios, enriquecer respuestas)
- Reservation -> Space (validar espacio existe + copiar precio_hora)
- Reservation -> Billing (trigger automatico al pagar)
- Billing -> Auth (validar usuario al crear factura, enriquecer)
```

## Autenticacion compartida

Los 4 servicios comparten una `SECRET_KEY` y verifican tokens JWT (HS256) emitidos por Auth Service de forma independiente — sin necesidad de llamadas HTTP. Claims requeridos: `sub` (id usuario como string) y `rol`.

## Como Ejecutar

### Pre-requisitos
- Docker + Docker Compose
- Puertos libres: 3000, 5432-5435, 8001-8004

### 1. Crear la red docker compartida

```
docker network create coworking_net
```

### 2. Configurar .env en cada servicio

```
cp auth_service/.env.example         auth_service/.env
cp space_service/.env.example        space_service/.env
cp reservation-service/.env.example  reservation-service/.env
cp billing_service/.env.example      billing_service/.env
```

**Importante:** los 4 `.env` deben tener la **misma** `SECRET_KEY` (minimo 32 caracteres por requisito de JJWT en Reservation Service).

### 3. Levantar los 4 servicios

En 4 terminales (o con `-d`):

```
cd auth_service          && docker compose up --build -d && cd ..
cd space_service         && docker compose up --build -d && cd ..
cd reservation-service   && docker compose up --build -d && cd ..
cd billing_service       && docker compose up --build -d && cd ..
```

### 4. Crear el primer admin

```
curl -X POST http://localhost:8001/registro \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Admin","email":"admin@test.com","password":"admin123"}'

docker exec -it auth_db psql -U coworking_user -d authdb \
  -c "UPDATE usuarios SET rol='admin' WHERE email='admin@test.com';"
```

### 5. Levantar el frontend

```
cd frontend
python3 -m http.server 3000
```

Abrir `http://localhost:3000` y login con `admin@test.com / admin123`.

### 6. Cargar datos de prueba (opcional)

Desde el panel admin: **Mantenimiento → Inicializar datos de prueba**. Crea 8 espacios, 5 usuarios y 13 reservas en distintos estados con facturas automaticas.

## Flujo de una Reserva

```
1. Usuario crea reserva → estado=PENDIENTE, estadoPago=NO_PAGADA
2. Admin extrae de cola de prioridad → estado=CONFIRMADA
3. Usuario paga → estadoPago=PAGADA + factura automatica via HTTP
4. Admin marca completada (o se auto-completa) → estado=COMPLETADA
```

Dos estados independientes en la entidad Reserva: **estado** (PENDIENTE / CONFIRMADA / COMPLETADA / CANCELADA) y **estadoPago** (NO_PAGADA / PAGADA / REEMBOLSADA).

## Estructura del Proyecto

```
coworking_lenguajes/
├── README.md                      Este archivo
├── seed.sh                        Script bash equivalente al seed de UI
├── .gitignore
│
├── auth_service/                  Python / FastAPI
├── space_service/                 Go / Gin
├── reservation-service/           Java / Spring Boot
├── billing_service/               Node.js / Express
├── frontend/                      HTML / CSS / JS vanilla
│
└── docs/
    ├── repo_maria/
    │   ├── auth_service.md                     Doc detallada por servicio
    │   ├── space_service.md
    │   ├── reservation_service.md
    │   ├── billing_service.md
    │   ├── explicacion_microservicios.md       Vision academica general
    │   └── algoritmos_busqueda.md              Cada algoritmo + archivos + lineas
    └── microservices_upgrades/                 Changelog conceptual por servicio
```

## Documentacion

| Documento | Contenido |
|-----------|-----------|
| `docs/repo_maria/explicacion_microservicios.md` | Vision academica general del sistema |
| `docs/repo_maria/<servicio>.md` | Doc detallada por servicio (estructura + endpoints + algoritmos) |
| `docs/repo_maria/algoritmos_busqueda.md` | Cada algoritmo con archivo + linea exacta + endpoint |
| `docs/microservices_upgrades/<servicio>.md` | Changelog de mejoras por servicio |
| `auth_service/README.md` | Documentacion operacional del Auth Service |
| `space_service/README.md` | Documentacion operacional del Space Service |
| `reservation-service/README.md` | Documentacion operacional del Reservation Service |
| `billing_service/README.md` | Documentacion operacional del Billing Service |
| `frontend/README.md` | Documentacion del frontend |

## Caracteristicas Destacadas

### Patron didactico de algoritmos
Tres servicios exponen `?algoritmo=lineal|optimizado` sobre la misma data para comparar complejidad O(n) vs O(log n) / O(1) en vivo. Util para demos academicas.

### Estados duales en Reservation
Separa estado de la reserva (workflow) del estado de pago (transaccion). Permite que admin confirme antes de cobrar.

### Trigger automatico de facturas
Al pagar una reserva, Reservation Service invoca Billing Service via HTTP. Si billing esta caido, la reserva igual pasa a pagada y se log el warning.

### Cache LRU implementado desde cero
Tres servicios usan Cache LRU manual (doubly linked list + hash map) con O(1) get/put. El metodo `vaciar()` se invoca en endpoints `/reset` para invalidar reportes stale.

### Validacion de franjas horarias
Frontend muestra grid visual de slots :00 y :30 (08:00-22:00). Backend valida los mismos invariantes (minutos en {0, 30}, duracion multiplo de 60min).

### CORS y errores legibles
Los 4 servicios habilitan CORS para desarrollo local. Frontend extrae mensajes de error de Spring (`errors[].defaultMessage`), FastAPI (`detail`) y Express (`error`) en lugar de mostrar "Bad Request" generico.

## Credenciales de Demo

Despues de ejecutar el seed:

```
admin@test.com   / admin123    (admin)
sofia@test.com   / sofia123    (admin secundario)
maria@test.com   / maria123
juan@test.com    / juan123
ana@test.com     / ana123
carlos@test.com  / carlos123
```

## Mantenimiento

Desde el panel admin del frontend:
- **Borrar todos los datos**: vacia BD + caches LRU + Tabla Hash. Preserva el admin actual.
- **Inicializar datos de prueba**: equivalente a ejecutar `seed.sh` desde la UI con log en vivo.

## Notas Tecnicas

- **TZ**: los 4 containers usan `America/Caracas` (configurado en docker-compose) para alinear `LocalDateTime` con el reloj del host. Si el host esta en otra zona, ajustar en cada `docker-compose.yml`.
- **SECRET_KEY**: minimo 32 caracteres por requisito de la libreria JJWT en Reservation Service. Cualquier valor mas corto causa fallo silencioso al verificar tokens.
- **Hostnames de BD**: cada `.env` apunta al `container_name` unico de su propia BD (`auth_db`, `space_db`, `reservation_db`, `billing_db`) porque el alias `db` colisionaria en la red compartida.
- **Rutas con regex**: Reservation usa `@DeleteMapping("/reservas/{id:\\d+}")` para evitar que Spring matchee `/reservas/reset` como `id=reset`.

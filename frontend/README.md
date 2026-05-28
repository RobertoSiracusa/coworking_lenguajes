# Frontend Co-working

Frontend minimalista que consume los 4 microservicios del sistema de co-working. Hecho con HTML, CSS y JavaScript vanilla. Sin build, sin frameworks, sin dependencias.

## Caracteristicas

- Single Page Application (SPA) por mostrar/ocultar secciones
- Tema oscuro con paleta de azul oscuro, azul claro y destellos blancos
- Autenticacion con JWT persistente en `localStorage`
- Autocompletado de espacios usando el endpoint Trie del Space Service
- Estadisticas personales de reservas y facturas
- Panel de administracion (visible solo para usuarios con rol `admin`)
- Visualizacion de metricas de los caches LRU y Tabla Hash

## Paleta de Colores

| Color | Hex | Uso |
|-------|-----|-----|
| Azul oscuro | `#0a1929` | Fondo principal |
| Azul medio | `#102a43` | Fondo gradiente |
| Azul card | `#14304d` | Tarjetas y elementos elevados |
| Azul claro | `#4dabf7` | Botones, acentos primarios |
| Azul claro brillante | `#6cc3ff` | Destellos, hovers |
| Blanco | `#ffffff` | Texto principal |

## Estructura

```
frontend/
├── index.html
├── styles.css
├── README.md
└── js/
    ├── api.js              Wrapper fetch + estado + URLs
    ├── auth.js             Login y registro
    ├── espacios.js         Listar, buscar, autocomplete
    ├── reservas.js         Crear y listar reservas
    ├── facturas.js         Mis facturas y estadisticas
    ├── admin.js            Panel de administracion
    └── app.js              Router y arranque
```

## Como Ejecutar

### Opcion 1: servidor estatico simple

```
cd frontend
python3 -m http.server 3000
```

Abrir `http://localhost:3000`.

### Opcion 2: con cualquier servidor HTTP

Sirve la carpeta `frontend/` con cualquier servidor estatico.

### Pre-requisitos

Los 4 microservicios deben estar corriendo:

| Servicio | Puerto |
|----------|--------|
| Auth | 8001 |
| Space | 8002 |
| Reservation | 8003 |
| Billing | 8004 |

Editar `js/api.js` si los puertos o URLs son diferentes:

```js
const API = {
  auth:        'http://localhost:8001',
  space:       'http://localhost:8002',
  reservation: 'http://localhost:8003',
  billing:     'http://localhost:8004',
};
```

## Flujo de Uso

1. **Registro** o **Login** -> obtiene JWT del Auth Service.
2. **Espacios** -> Space Service. Listado paginado con filtros. Autocomplete via Trie.
3. **Click en espacio** -> abre modal para crear reserva. Reservation Service valida usuario via Auth y espacio via Space.
4. **Mis Reservas** -> Reservation Service. Estadisticas personales + lista con cancelar.
5. **Mis Facturas** -> Billing Service. Estadisticas personales + listado.
6. **Admin** (solo rol admin):
   - Cola de prioridad (Reservation Service) - confirmar siguiente
   - Crear espacio (Space Service)
   - Reportes de facturacion (Billing Service)
   - Cache de los 4 servicios

## Endpoints Utilizados

### Auth Service (8001)
- `POST /registro`
- `POST /login`
- `GET /cache/estadisticas` (admin)

### Space Service (8002)
- `GET /espacios` con filtros y paginacion
- `GET /espacios/buscar` (binaria por defecto)
- `GET /espacios/sugerir` (Trie autocomplete)
- `GET /espacios/:id`
- `POST /espacios` (admin)
- `GET /cache/estadisticas` (admin)

### Reservation Service (8003)
- `POST /reservas`
- `GET /reservas/mis-reservas`
- `GET /reservas/mis-estadisticas`
- `DELETE /reservas/:id`
- `GET /cola` (admin)
- `POST /cola/confirmar` (admin)
- `GET /cache/estadisticas` (admin)

### Billing Service (8004)
- `GET /facturas/mis-facturas`
- `GET /facturas/mis-estadisticas`
- `GET /reportes/resumen` (admin)
- `GET /reportes/por-espacio` (admin)
- `GET /cache/estadisticas` (admin)

## CORS

Los microservicios deben permitir CORS desde el origen del frontend. El Billing Service ya usa `cors()` en Express. Auth Service (FastAPI), Space Service (Gin) y Reservation Service (Spring Boot) pueden requerir configuracion adicional si se sirven en dominios distintos.

Para desarrollo local, sirviendo desde `localhost:3000` y consumiendo `localhost:800X`, lo mas comun es:

- Permitir todos los origenes en desarrollo.
- O servir el frontend con un proxy reverso (nginx) que mapee `/api/auth/*` -> `8001`, etc.

## Notas

- El JWT se guarda en `localStorage`. Si el token expira, el wrapper `fetchAPI` redirige automaticamente al login.
- El boton **Admin** del nav solo aparece si el `rol` del JWT es `admin`. Para crear un admin, registrar un usuario y luego actualizar manualmente el campo `rol` en la base de datos del Auth Service.
- Las paginas usan animaciones suaves al cambiar. El boton de autocompletado consume el Trie del Space Service, demostrando autocompletado en O(L + k) en tiempo real.
- El panel de cache muestra metricas en vivo de:
  - Tabla Hash (DJB2, separate chaining) del Auth Service
  - Cache LRU (doubly linked list + map) de los demas servicios
  - Tamano del Interval Tree del Reservation Service

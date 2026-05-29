# Frontend Co-working

Single Page Application minimalista que consume los 4 microservicios del sistema de co-working. HTML, CSS y JavaScript vanilla. Sin build, sin frameworks, sin dependencias.

## Caracteristicas

- SPA con secciones mostradas/ocultadas por JS.
- Tema oscuro con paleta azul oscuro + azul claro + destellos blancos.
- Autenticacion JWT persistente en `localStorage`.
- Modal de reservas con selector de fecha + grid de franjas (slots :00 y :30) + selector de duracion.
- Validacion client-side de franjas (espejo de la validacion backend).
- Filtros en Mis Reservas: sala, estado, dia, duracion.
- Botones contextuales segun estado: Pagar, Cancelar.
- Mostrar precio/hora, subtotal e IVA por reserva.
- Modal de confirmacion custom (reemplaza window.confirm) con tema visual coherente.
- Panel admin completo: cola, usuarios, espacios, facturas, mantenimiento.
- Seed de datos de prueba ejecutable desde la UI.
- Reset completo de bases de datos desde la UI (preserva admin actual).
- Autocompletado de espacios en tiempo real consumiendo el endpoint Trie.

## Paleta de Colores

| Color | Hex | Uso |
|-------|-----|-----|
| Azul oscuro | `#0a1929` | Fondo principal |
| Azul medio | `#102a43` | Fondo gradiente |
| Azul card | `#14304d` | Tarjetas y elementos elevados |
| Azul claro | `#4dabf7` | Botones, acentos primarios |
| Azul brillante | `#6cc3ff` | Destellos, hovers |
| Blanco | `#ffffff` | Texto principal |
| Verde | `#51cf66` | Estados positivos (pagada, completada) |
| Rojo | `#ff6b6b` | Acciones destructivas, errores |

## Estructura

```
frontend/
├── README.md
├── index.html               SPA con todas las secciones + modales
├── styles.css               Paleta, layout, badges, slots, modales
└── js/
    ├── api.js               Wrapper fetch + Estado + URLs + confirmar() + toast()
    ├── auth.js              Login y registro
    ├── espacios.js          Listar, buscar, autocomplete
    ├── reservas.js          Modal de slots + crear + listar + filtros + pagar
    ├── facturas.js          Mis facturas y estadisticas
    ├── admin.js             Panel admin: cola, usuarios, espacios, facturas, mantenimiento, seed
    └── app.js               Router y arranque
```

## Como Ejecutar

```
cd frontend
python3 -m http.server 3000
```

Abrir `http://localhost:3000`.

### Pre-requisitos

Los 4 microservicios corriendo:

| Servicio | Puerto |
|----------|--------|
| Auth | 8001 |
| Space | 8002 |
| Reservation | 8003 |
| Billing | 8004 |

Editar `js/api.js` si los puertos son diferentes:

```js
const API = {
  auth:        'http://localhost:8001',
  space:       'http://localhost:8002',
  reservation: 'http://localhost:8003',
  billing:     'http://localhost:8004',
};
```

## Secciones

### Login / Registro
Pantalla inicial. Persistente en localStorage. Si el token expira, el wrapper `fetchAPI` redirige al login automaticamente.

### Espacios
Listado con filtros (capacidad minima, orden por precio/capacidad/nombre) y paginacion. Autocompletado de busqueda en tiempo real consumiendo el endpoint Trie del Space Service. Click en un espacio abre modal de reserva.

### Modal de Reserva
- Selector de fecha (date input, minimo hoy)
- Grid de franjas horarias en :00 y :30, desde 08:00 a 22:00
- Slots pasados o ocupados se muestran tachados y deshabilitados
- Selector de duracion: 1h, 2h, 3h, 4h, 6h, 8h
- Resumen en vivo con precio total calculado
- Validacion antes de enviar (espejo de la del backend)

### Mis Reservas
- Estadisticas personales (total, por estado, horas totales)
- 4 filtros: sala, estado, dia, duracion (cache local, sin re-fetch)
- Cada item muestra: nombre espacio, badge combinado (estado + estado de pago), fechas, duracion, precio/h, subtotal, IVA, total
- Botones contextuales:
  - PENDIENTE: Cancelar
  - CONFIRMADA + NO_PAGADA: Pagar / Cancelar
  - CONFIRMADA + PAGADA: (espera completar)
  - COMPLETADA / CANCELADA: solo lectura

### Mis Facturas
Listado con estadisticas personales (gasto total, promedio, por estado).

### Panel Admin (solo rol admin)

| Tab | Funcionalidad |
|-----|---------------|
| Cola | Pendientes (cola de prioridad) + Confirmadas listas para completar. Boton "Confirmar siguiente" extrae del heap. |
| Usuarios | Crear usuario con rol explicito + listar + cambiar rol + eliminar (no a si mismo) |
| Espacios | Crear espacios |
| Facturas | Dashboard de reportes + listado de facturas |
| Mantenimiento | Boton rojo para borrar TODOS los datos (preserva admin actual). Boton azul para cargar seed de prueba (8 espacios, 5 usuarios, 13 reservas, varios estados). |

## Componentes Reusables

### `confirmar(mensaje, opciones)`
Modal custom que reemplaza `window.confirm()`. Retorna Promise<boolean>.

Opciones:
- `titulo` - texto del header
- `textoAceptar`, `textoCancelar` - labels de botones
- `peligro` (boolean) - boton rojo si true

Soporta:
- Click backdrop = cancelar
- ESC = cancelar
- Enter = aceptar

### `toast(mensaje, tipo)`
Notificacion temporal abajo-derecha. Tipos: `''` (azul), `'success'` (verde), `'error'` (rojo).

### `fetchAPI(url, opciones)`
Wrapper de fetch con:
- JWT automatico en header `Authorization`
- 401 -> logout + redirect a login
- Extraccion de mensajes de error de Spring (`errors[].defaultMessage`), FastAPI (`detail`), Express (`error`)

## Algoritmos Usados Visualmente

| Algoritmo | Donde |
|-----------|-------|
| Trie | Autocompletado de espacios (`/espacios/sugerir`) |
| Min-heap | Tab Cola admin (`/cola`, `/cola/confirmar`) |
| Estadisticas hash | Mis estadisticas (reservas y facturas) |
| Validacion de franjas | Modal de reserva (espejo del backend) |
| Filtros client-side | Mis Reservas (sin re-fetch) |
| Recomendacion | (Pendiente expose en UI) |

## Endpoints Utilizados

### Auth Service (8001)
- POST /registro
- POST /login
- GET /usuarios, POST /usuarios, PATCH /usuarios/:id/rol, DELETE /usuarios/:id (admin)
- DELETE /usuarios/reset (admin)

### Space Service (8002)
- GET /espacios (filtros, paginacion)
- GET /espacios/buscar, /espacios/sugerir
- POST /espacios, DELETE /espacios/reset (admin)

### Reservation Service (8003)
- POST /reservas, GET /reservas/mis-reservas, /mis-estadisticas
- DELETE /reservas/:id, PATCH /reservas/:id/pagar
- GET /cola, POST /cola/confirmar (admin)
- PATCH /reservas/:id/completar (admin)
- DELETE /reservas/reset (admin)
- GET /reservas/espacio/:id (slots ocupados en modal)

### Billing Service (8004)
- GET /facturas/mis-facturas, /facturas/mis-estadisticas
- GET /reportes/resumen, /reportes/por-espacio (admin)
- DELETE /facturas/reset (admin)

## Seed desde la UI

Panel admin -> Mantenimiento -> "Inicializar datos de prueba":

1. Reset previo (preserva admin actual)
2. Crea 8 espacios (Sala Apolo, Hermes, Olimpo, etc.)
3. Crea 5 usuarios (maria, juan, ana, carlos, sofia/admin)
4. Login a cada usuario y crea 13 reservas en sus nombres
5. Admin confirma 7 (URGENTES primero por min-heap)
6. Usuarios pagan 4 (genera facturas automaticamente)
7. Admin completa 2
8. Cancela 2

Log en vivo dentro de la UI.

## Notas

- El token JWT se guarda en `localStorage`. Borrarlo con `localStorage.clear(); location.reload()` si el SECRET_KEY cambia entre sesiones.
- El boton Admin solo aparece para usuarios con `rol === 'admin'`.
- El modal de reserva pre-llena con la proxima franja valida si el slot esta libre.
- El panel admin Mantenimiento incluye 2 cards: peligro (rojo) para borrar y constructivo (azul) para seed.
- Las reservas y facturas se cachean en memoria del browser para filtrar sin re-fetch.

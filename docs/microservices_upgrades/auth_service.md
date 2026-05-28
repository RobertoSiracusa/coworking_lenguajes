# Auth Service — Microservicio Nuevo

## Estado Anterior

**No existia.** El sistema original (Space, Reservation, Billing) verificaba tokens JWT compartiendo una `SECRET_KEY`, pero no habia ningun servicio que los emitiera. Los demas servicios asumian que un Auth Service externo generaba los tokens.

Este servicio se creo desde cero para llenar ese vacio.

## Como Funciona

Auth Service es la fuente unica de identidad del sistema. Implementado en **Python 3.13 con FastAPI**, expone endpoints publicos de registro y login que emiten tokens JWT firmados con HS256. Los demas microservicios verifican esos tokens de forma independiente con la misma `SECRET_KEY`, sin necesidad de llamadas HTTP al Auth Service para autenticar.

### Flujo de Autenticacion

```
Cliente                                          Auth Service
   |                                                  |
   |--- POST /registro ----------------------------->|
   |    { nombre, email, password }                  |
   |                                                  | hash bcrypt
   |                                                  | INSERT usuario
   |                                                  | generar JWT (sub, rol, exp)
   |                                                  | cachear en Tabla Hash
   |<-- 201 { token, usuario_id, rol } ---------------|
   |                                                  |
   |--- GET /espacios (a Space Service) ------------>| (no pasa por aqui)
   |    Authorization: Bearer <token>                | Space verifica con SECRET_KEY
```

### Estructura del JWT

| Claim | Valor |
|-------|-------|
| `sub` | ID del usuario como string |
| `rol` | `usuario` o `admin` |
| `iat` | Issued at |
| `exp` | Expiracion (24h default) |
| Algoritmo | HS256 |

Este formato es exactamente el que esperan Space Service (Go), Reservation Service (Java) y Billing Service (Node.js).

## Componentes

### Capa de aplicacion

- `app/main.py` — FastAPI app, lifespan, monta routers
- `app/config.py` — Variables de entorno
- `app/database.py` — SQLAlchemy async + asyncpg, init_db
- `app/models.py` — Modelo SQLAlchemy `Usuario`
- `app/schemas.py` — Pydantic: RegistroRequest, LoginRequest, TokenResponse, UsuarioResponse
- `app/auth.py` — Generacion de JWT y hashing bcrypt

### Rutas

- `app/routes/auth_routes.py` — POST /registro, POST /login
- `app/routes/usuarios_routes.py` — GET /usuarios, GET /usuarios/buscar

### Middleware

- `app/middleware/jwt_middleware.py` — Dependencies `verificar_jwt` y `solo_admin`

### Algoritmos y Estructuras

- `app/algorithm/tabla_hash.py` — Tabla Hash implementada desde cero

## Endpoints

| Metodo | Ruta | Acceso | Descripcion |
|--------|------|--------|-------------|
| GET | /health | Publico | Health check |
| POST | /registro | Publico | Registra usuario nuevo, retorna JWT |
| POST | /login | Publico | Autentica y retorna JWT |
| GET | /usuarios | Admin | Lista todos los usuarios |
| GET | /usuarios/buscar | Admin | Busca por email/nombre con hash O(1) o lineal O(n) |
| GET | /cache/estadisticas | Admin | Metricas de la Tabla Hash |

## Tabla Hash (Algoritmo principal)

### Diseno

Implementacion desde cero con **encadenamiento separado**. Cada bucket es una lista de tuplas `(clave, valor, timestamp)`.

### Funcion hash DJB2

```
h = 5381
para cada caracter c en la clave:
    h = h * 33 + ord(c)
retornar h % capacidad
```

El factor 33 produce buena distribucion estadistica. El valor 5381 (numero primo) reduce colisiones.

### Operaciones

| Operacion | Complejidad |
|-----------|-------------|
| `insertar(clave, valor)` | O(1) promedio |
| `buscar(clave)` | O(1) promedio |
| `eliminar(clave)` | O(1) promedio |
| `_redimensionar()` | O(n) — al superar factor de carga 0.75 |
| `estadisticas()` | O(n) |

### Caracteristicas

- **TTL configurable** por entrada (default 3600 segundos). Las entradas expiradas se eliminan en el siguiente acceso.
- **Redimensionamiento automatico** cuando el factor de carga supera 0.75. Duplica capacidad y rehashea. Costo amortizado O(1).
- **Estadisticas** completas: capacidad, elementos, factor de carga, colisiones, buckets vacios, cadena mas larga.

### Uso en el servicio

- `email:<email>` -> datos del usuario
- `token:<id>` -> ultimo token emitido

Reduce consultas a la base de datos en logins repetidos.

## Seguridad

- **bcrypt** con salt aleatorio para hashear passwords (cost factor por defecto = 12).
- **HS256** para firmar JWT. La `SECRET_KEY` se comparte con todos los servicios consumidores.
- **Email UNIQUE** a nivel BD para evitar duplicados.
- **Validacion Pydantic**: email valido, password minimo 6 caracteres, nombre minimo 1 caracter.

## Modelo de Datos

```
usuarios
├── id              INTEGER (PK, auto-generado)
├── nombre          VARCHAR(100) NOT NULL
├── email           VARCHAR(150) UNIQUE NOT NULL
├── password_hash   VARCHAR(255) NOT NULL
├── rol             VARCHAR(20) DEFAULT 'usuario'
└── creado_en       TIMESTAMP DEFAULT NOW()
```

## Integracion con Otros Servicios

| Servicio | Interaccion |
|----------|-------------|
| Space Service | Verifica JWT emitido aqui (mismo SECRET_KEY) |
| Reservation Service | Verifica JWT. Tambien llama `GET /usuarios` para validar y enriquecer datos |
| Billing Service | Verifica JWT. Tambien llama `GET /usuarios` para validar usuario al crear factura y enriquecer listados |

## Resumen

El Auth Service es completamente **nuevo**. Sus aportes:

- Fuente unica de identidad del sistema.
- Generacion de JWT compatible con los 3 servicios existentes.
- Tabla Hash implementada desde cero (DJB2 + separate chaining + TTL + redimensionamiento).
- Hash de contrasenas con bcrypt.
- 4to lenguaje del proyecto: Python 3.13 / FastAPI.

# Auth Service (Servicio de Autenticación)

## Información General

| Campo | Valor |
|-------|-------|
| **Lenguaje** | Python 3.13 |
| **Framework** | FastAPI 0.115 |
| **Base de datos** | PostgreSQL 15 (SQLAlchemy async + asyncpg) |
| **Puerto** | 8001 |
| **Autenticación** | Genera tokens JWT (HS256) con PyJWT |
| **Contenedorización** | Docker multi-stage (python:3.13-slim) |

## Estructura de Archivos

```
auth_service/
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── .gitignore
├── .env.example
└── app/
    ├── __init__.py
    ├── main.py                  # Aplicación FastAPI, startup, health, routers
    ├── config.py                # Configuración desde variables de entorno
    ├── database.py              # SQLAlchemy async engine + init_db()
    ├── models.py                # Modelo SQLAlchemy: Usuario
    ├── schemas.py               # Pydantic: RegistroRequest, LoginRequest, TokenResponse, UsuarioResponse
    ├── auth.py                  # Generación JWT + hashing bcrypt
    ├── routes/
    │   ├── __init__.py
    │   ├── auth_routes.py       # POST /registro, POST /login
    │   └── usuarios_routes.py   # GET /usuarios, GET /usuarios/buscar
    ├── middleware/
    │   ├── __init__.py
    │   └── jwt_middleware.py    # Dependencies: verificar_jwt, solo_admin
    └── algorithm/
        ├── __init__.py
        └── tabla_hash.py        # Tabla hash implementada desde cero
```

## Descripción de Archivos

### `requirements.txt`

Dependencias del proyecto:
- `fastapi` — framework HTTP asíncrono con validación automática
- `uvicorn` — servidor ASGI para ejecutar FastAPI
- `sqlalchemy[asyncio]` + `asyncpg` — ORM asíncrono con driver PostgreSQL
- `pyjwt` — generación y verificación de tokens JWT
- `bcrypt` — hashing de contraseñas
- `pydantic[email]` — validación de datos y emails
- `python-dotenv` — carga de variables de entorno desde `.env`

### `Dockerfile`

Build multi-stage:
1. **Etapa 1 (builder)**: `python:3.13-slim`. Instala dependencias con pip en un prefijo separado.
2. **Etapa 2 (runtime)**: `python:3.13-slim` limpia. Copia solo los paquetes instalados y el código fuente. Puerto 8001.

Comando de ejecución: `uvicorn app.main:app --host 0.0.0.0 --port 8001`.

### `docker-compose.yml`

Dos servicios:
- **db**: PostgreSQL 15-alpine, base `authdb`, usuario `coworking_user`, puerto externo `5432`.
- **auth-service**: construye desde Dockerfile, puerto `8001`, espera a que la BD esté healthy.

### `app/config.py` — Configuración

Lee variables de entorno con `python-dotenv`:
- `SECRET_KEY` — clave secreta compartida con los otros microservicios para firmar/verificar JWT.
- `DATABASE_URL` — cadena de conexión PostgreSQL (esquema `postgresql+asyncpg://`).
- `PORT` — puerto del servidor (default 8001).
- `JWT_EXP_HOURS` — horas de expiración del token (default 24).

### `app/database.py` — Conexión a BD

- Crea un engine asíncrono de SQLAlchemy usando `asyncpg` como driver.
- `AsyncSessionLocal`: factory de sesiones asíncronas.
- `Base`: clase base declarativa para modelos.
- `init_db()`: crea la tabla `usuarios` si no existe (equivalente a `AutoMigrate` en GORM o `CREATE TABLE IF NOT EXISTS` en Node).
- `get_db()`: generador asíncrono que provee sesiones de BD como dependency de FastAPI.

### `app/models.py` — Modelo de Datos

Modelo SQLAlchemy `Usuario`, mapeado a la tabla `usuarios`:
- `id` (Integer, PK, autoincrement)
- `nombre` (String 100, NOT NULL)
- `email` (String 150, UNIQUE, NOT NULL)
- `password_hash` (String 255, NOT NULL)
- `rol` (String 20, default "usuario")
- `creado_en` (DateTime, server_default NOW)

### `app/schemas.py` — Schemas Pydantic

| Schema | Tipo | Campos |
|--------|------|--------|
| `RegistroRequest` | Entrada | `nombre` (min 1, max 100), `email` (EmailStr), `password` (min 6) |
| `LoginRequest` | Entrada | `email` (EmailStr), `password` |
| `TokenResponse` | Salida | `token`, `tipo` ("Bearer"), `usuario_id`, `rol` |
| `UsuarioResponse` | Salida | `id`, `nombre`, `email`, `rol`, `creado_en` (sin password_hash) |

### `app/auth.py` — JWT y Hashing

| Función | Descripción |
|---------|-------------|
| `hash_password(password)` | Hashea con bcrypt + salt aleatorio. |
| `verify_password(password, hashed)` | Verifica password contra hash bcrypt. |
| `crear_token(user_id, rol)` | Genera JWT con claims: `sub` (string del user_id), `rol`, `iat`, `exp`. Algoritmo HS256, firmado con `SECRET_KEY`. |

El token generado es compatible con los 3 microservicios consumidores:
- Space Service (Go) lee `claims["sub"]` y `claims["rol"]`
- Reservation Service (Java) hace `Long.parseLong(claims.getSubject())` y `claims.get("rol")`
- Billing Service (Node.js) hace `parseInt(payload.sub)` y `payload.rol`

### `app/middleware/jwt_middleware.py` — Autenticación

Dos dependencies de FastAPI:

- **`verificar_jwt`**: extrae token del header `Authorization: Bearer <token>`, decodifica con PyJWT usando `SECRET_KEY` y HS256. Retorna dict con `usuario_id` (int) y `rol` (str). Lanza HTTPException 401 si falta, expiró o es inválido.
- **`solo_admin`**: depende de `verificar_jwt`. Lanza HTTPException 403 si `rol != "admin"`.

### `app/routes/auth_routes.py` — Registro y Login

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| `POST /registro` | Público | Registra usuario nuevo. Verifica email no duplicado (409). Hashea password con bcrypt. Genera JWT. Cachea en tabla hash. Retorna 201. |
| `POST /login` | Público | Busca usuario por email (primero en cache, luego en BD). Verifica password con bcrypt. Genera JWT. Cachea. Retorna token. |

### `app/routes/usuarios_routes.py` — Gestión de Usuarios

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| `GET /usuarios` | Admin | Lista todos los usuarios ordenados por fecha de creación descendente. |
| `GET /usuarios/buscar` | Admin | Busca usuarios. Query params: `q` (término), `algoritmo` (`hash` o `lineal`). Compara búsqueda O(1) en tabla hash vs O(n) lineal. |

### `app/algorithm/tabla_hash.py` — Tabla Hash (Componente Algorítmico)

Implementación manual de una **tabla hash con encadenamiento separado** (separate chaining).

**Estructura interna**: array de buckets, donde cada bucket es una lista de tuplas `(clave, valor, timestamp)`. Cuando dos claves producen el mismo índice (colisión), se agregan a la misma lista.

**Función hash DJB2**:
```
h = 5381
para cada carácter c en la clave:
    h = h * 33 + código_ASCII(c)
retornar h % capacidad
```

| Operación | Complejidad | Descripción |
|-----------|-------------|-------------|
| `insertar(clave, valor)` | O(1) promedio | Calcula hash, agrega al bucket. Si la clave existe, actualiza. |
| `buscar(clave)` | O(1) promedio | Calcula hash, recorre el bucket. Verifica TTL; elimina entradas expiradas. |
| `eliminar(clave)` | O(1) promedio | Encuentra y remueve la entrada del bucket. |
| `_redimensionar()` | O(n) | Se ejecuta cuando factor de carga > 0.75. Duplica capacidad y reubica todos los elementos. |
| `estadisticas()` | O(n) | Retorna métricas: capacidad, elementos, factor de carga, colisiones, buckets vacíos/ocupados, cadena más larga. |

**Características adicionales**:
- **TTL**: cada entrada tiene timestamp; las búsquedas eliminan entradas expiradas (default 1 hora).
- **Redimensionamiento automático**: cuando el factor de carga supera 0.75, duplica la capacidad y rehashea todo. Costo amortizado O(1).
- **Singleton `cache`**: instancia global compartida en toda la aplicación.

**Integración con el servicio**:
- En login/registro, se cachean tokens y datos de usuario.
- El endpoint `/usuarios/buscar?algoritmo=hash` usa la tabla para búsqueda O(1).
- El endpoint `/cache/estadisticas` expone métricas de la tabla (útil para demostración académica).

### `app/main.py` — Punto de Entrada

Configura la aplicación FastAPI:
1. `lifespan`: al arrancar ejecuta `init_db()` para crear tablas.
2. Health check en `GET /health` (público, sin JWT).
3. Monta routers: `auth_router` (registro/login) y `usuarios_router` (gestión).
4. Endpoint `GET /cache/estadisticas` (admin) que expone métricas de la tabla hash.

## Modelo de Datos

```
usuarios
├── id              INTEGER (PK, auto-generado)
├── nombre          VARCHAR(100) NOT NULL
├── email           VARCHAR(150) UNIQUE NOT NULL
├── password_hash   VARCHAR(255) NOT NULL
├── rol             VARCHAR(20)    -- "usuario" | "admin"
└── creado_en       TIMESTAMP (auto-generado)
```

## Endpoints

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| GET | /health | Público | Health check |
| POST | /registro | Público | Registrar usuario nuevo → JWT |
| POST | /login | Público | Autenticarse → JWT |
| GET | /usuarios | Admin | Listar todos los usuarios |
| GET | /usuarios/buscar | Admin | Buscar usuarios (hash O(1) vs lineal O(n)) |
| GET | /cache/estadisticas | Admin | Métricas de la tabla hash |

## Comunicación con Otros Microservicios

- **Genera tokens JWT** que los otros 3 servicios verifican de forma independiente.
- Comparte `SECRET_KEY` con Space Service (Go), Reservation Service (Java) y Billing Service (Node.js).
- No necesita comunicarse con los otros servicios en tiempo real — el JWT es autocontenido.
- Los claims `sub` (ID como string) y `rol` son el contrato que los consumidores esperan.

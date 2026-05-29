# Auth Service

Servicio de autenticacion y gestion de usuarios. Emite tokens JWT que los demas microservicios verifican de forma independiente con la misma `SECRET_KEY`. Implementa una Tabla Hash desde cero (DJB2 + separate chaining) como cache de tokens y usuarios.

## Descripcion

- Registro y login de usuarios con bcrypt.
- Emision de JWT firmados con HS256 (claims `sub` y `rol`).
- Gestion completa de usuarios desde panel admin (crear, listar, cambiar rol, eliminar).
- Cache de usuarios y tokens en Tabla Hash con TTL y redimensionamiento automatico.
- Endpoint de mantenimiento para borrar todos los usuarios (preserva al admin que lo invoca).

## Tecnologias

- Python 3.13
- FastAPI 0.115 (async)
- SQLAlchemy 2.0 asincrono + asyncpg
- PostgreSQL 15
- PyJWT 2.9 (firma HS256)
- bcrypt 4.2
- Pydantic v2

## Variables de Entorno

Copiar `.env.example` a `.env`:

| Variable | Descripcion | Valor por defecto |
|----------|-------------|-------------------|
| `SECRET_KEY` | Clave HS256 compartida (minimo 32 caracteres) | (requerido) |
| `DATABASE_URL` | URL PostgreSQL para SQLAlchemy async | (requerido) |
| `PORT` | Puerto del servicio | 8001 |
| `JWT_EXP_HOURS` | Horas hasta expirar el token | 24 |

La `SECRET_KEY` debe ser identica en los 4 servicios.

## Como Ejecutar

```
cp .env.example .env
docker compose up --build
```

Servicio en `http://localhost:8001`. Docs Swagger en `/docs`.

## Endpoints

| Metodo | Ruta | Acceso | Descripcion |
|--------|------|--------|-------------|
| GET | /health | Publico | Health check |
| POST | /registro | Publico | Registra usuario (rol fijo "usuario") |
| POST | /login | Publico | Autentica y retorna JWT |
| GET | /usuarios | Admin | Lista todos los usuarios |
| GET | /usuarios/buscar | Admin | Busca por email/nombre. `algoritmo=hash` (default) o `lineal` |
| POST | /usuarios | Admin | Crea usuario con rol explicito (usuario o admin) |
| PATCH | /usuarios/{id}/rol | Admin | Cambia rol (no se permite cambiar el propio) |
| DELETE | /usuarios/{id} | Admin | Elimina usuario (no se permite eliminarse a si mismo) |
| DELETE | /usuarios/reset | Admin | Mantenimiento: borra todos los usuarios excepto el admin actual |
| GET | /cache/estadisticas | Admin | Metricas de la Tabla Hash |

## Formato del JWT

| Claim | Tipo | Descripcion |
|-------|------|-------------|
| sub | string | ID del usuario como string (lo parsean los 3 servicios consumidores) |
| rol | string | "usuario" o "admin" |
| iat | timestamp | Issued at |
| exp | timestamp | Expiracion |
| algoritmo | HS256 | HMAC-SHA256 |

## Estructura del Proyecto

```
auth_service/
├── README.md
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── .env.example
└── app/
    ├── main.py                  FastAPI app, lifespan, CORSMiddleware
    ├── config.py                Variables de entorno
    ├── database.py              Engine async + init_db
    ├── models.py                Modelo Usuario
    ├── schemas.py               Pydantic: RegistroRequest, LoginRequest, TokenResponse,
    │                             UsuarioResponse, CrearUsuarioRequest, CambiarRolRequest
    ├── auth.py                  JWT + hashing bcrypt
    ├── routes/
    │   ├── auth_routes.py       POST /registro, POST /login
    │   └── usuarios_routes.py   CRUD admin + /reset + /buscar
    ├── middleware/
    │   └── jwt_middleware.py    Dependencies verificar_jwt, solo_admin
    └── algorithm/
        └── tabla_hash.py        Tabla Hash con DJB2 + separate chaining
```

## Algoritmo: Tabla Hash

Implementacion desde cero en `app/algorithm/tabla_hash.py`. Encadenamiento separado: cada bucket es una lista de tuplas `(clave, valor, timestamp)`.

Funcion hash DJB2:

```
h = 5381
para cada caracter c en clave:
    h = h * 33 + ord(c)
retornar h % capacidad
```

Operaciones:

| Operacion | Complejidad |
|-----------|-------------|
| insertar | O(1) promedio |
| buscar | O(1) promedio (verifica TTL) |
| eliminar | O(1) promedio |
| _redimensionar | O(n) cuando factor de carga > 0.75 |

Caracteristicas:

- TTL de 3600 segundos por entrada (configurable).
- Redimensionamiento automatico cuando factor de carga > 0.75.
- Reporte de estadisticas: capacidad, elementos, factor de carga, colisiones, cadena mas larga.

Uso:

- `email:<email>` -> datos del usuario
- `token:<id>` -> ultimo token emitido

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

## CORS

Habilitado para `*` en desarrollo local (`CORSMiddleware` en `app/main.py`).

## Notas

- Los demas servicios verifican el JWT sin contactar al Auth Service (autocontenido).
- El primer admin se crea manualmente con `UPDATE usuarios SET rol='admin' WHERE email=...` o desde el panel admin via POST /usuarios.
- El endpoint `/reset` vacia tambien la Tabla Hash.
- `SECRET_KEY` debe ser >= 32 caracteres por requisito de la libreria JJWT en Reservation Service.

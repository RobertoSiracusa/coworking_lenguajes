# Auth Service

Servicio de autenticacion del sistema de Co-working. Genera tokens JWT que los demas microservicios verifican de forma independiente. Implementa una Tabla Hash desde cero como cache de tokens y usuarios.

## Descripcion

Este microservicio se encarga de:

- Registrar nuevos usuarios con contrasenas hasheadas con bcrypt.
- Autenticar usuarios y emitir tokens JWT firmados con HS256.
- Listar usuarios y buscar por email o nombre.
- Cachear usuarios y tokens recientes en una Tabla Hash implementada desde cero.
- Servir como unica fuente de verdad para la identidad y el rol de los usuarios.

Los tokens JWT generados son consumidos por Space Service, Reservation Service y Billing Service, que los verifican con la misma `SECRET_KEY`.

## Tecnologias

- Python 3.13
- FastAPI 0.115
- SQLAlchemy asincrono con asyncpg
- PostgreSQL 15
- PyJWT (firma HS256)
- bcrypt (hash de contrasenas)
- Pydantic v2 (validacion)
- Docker y Docker Compose

## Requisitos Previos

- Python 3.13 o superior (para ejecucion local sin Docker)
- Docker y Docker Compose
- PostgreSQL 15 (si se ejecuta sin Docker)

## Variables de Entorno

Copiar `.env.example` a `.env`:

| Variable | Descripcion | Valor por defecto |
|----------|-------------|-------------------|
| `SECRET_KEY` | Clave HS256 compartida con todos los demas servicios | (requerido) |
| `DATABASE_URL` | URL de PostgreSQL para SQLAlchemy async | (requerido) |
| `PORT` | Puerto del servicio | `8001` |
| `JWT_EXP_HOURS` | Horas hasta expirar el token | `24` |

La `SECRET_KEY` debe ser exactamente la misma en todos los microservicios. De lo contrario la verificacion fallara.

## Como Ejecutar

### Con Docker Compose

```
cp .env.example .env
docker-compose up --build
```

Servicio disponible en `http://localhost:8001`. Base de datos en `localhost:5432`. Documentacion automatica de FastAPI en `http://localhost:8001/docs`.

### En Local sin Docker

```
cp .env.example .env
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

## Endpoints

| Metodo | Ruta | Acceso | Descripcion |
|--------|------|--------|-------------|
| GET | `/health` | Publico | Verifica que el servicio este activo |
| POST | `/registro` | Publico | Registra un nuevo usuario y retorna token |
| POST | `/login` | Publico | Autentica al usuario y retorna token |
| GET | `/usuarios` | Admin | Lista todos los usuarios |
| GET | `/usuarios/buscar` | Admin | Busca usuarios. `algoritmo=hash\|lineal` |
| GET | `/cache/estadisticas` | Admin | Metricas de la Tabla Hash |

### Formato del JWT generado

Algoritmo: `HS256`. Claims:

| Claim | Tipo | Descripcion |
|-------|------|-------------|
| `sub` | string | ID del usuario como string |
| `rol` | string | `usuario` o `admin` |
| `iat` | timestamp | Issued at (Unix) |
| `exp` | timestamp | Expiracion (Unix) |

Los servicios consumidores leen `sub` y lo convierten a entero, y leen `rol` para autorizacion.

### POST /registro

Cuerpo:

```
{
  "nombre": "Juan Perez",
  "email": "juan@example.com",
  "password": "secreto123"
}
```

Validaciones:
- `nombre` minimo 1 caracter
- `email` formato valido
- `password` minimo 6 caracteres

Retorna 201 con el token. 409 si el email ya esta registrado.

### POST /login

Cuerpo:

```
{
  "email": "juan@example.com",
  "password": "secreto123"
}
```

Retorna 200 con token, `usuario_id` y `rol`. 401 si las credenciales son invalidas.

### GET /usuarios/buscar

Parametros:
- `q` - Termino de busqueda
- `algoritmo` - `hash` (default, O(1) promedio) o `lineal` (O(n))

## Estructura del Proyecto

```
auth_service/
├── README.md
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── .env.example
└── app/
    ├── __init__.py
    ├── main.py                          Aplicacion FastAPI, lifespan, routers
    ├── config.py                        Variables de entorno
    ├── database.py                      Engine async + init_db
    ├── models.py                        Modelo SQLAlchemy Usuario
    ├── schemas.py                       Schemas Pydantic
    ├── auth.py                          JWT (PyJWT) + hashing bcrypt
    ├── routes/
    │   ├── auth_routes.py               POST /registro y POST /login
    │   └── usuarios_routes.py           GET /usuarios y /usuarios/buscar
    ├── middleware/
    │   └── jwt_middleware.py            Dependencies verificar_jwt y solo_admin
    └── algorithm/
        └── tabla_hash.py                Tabla Hash desde cero (DJB2 + separate chaining)
```

## Algoritmos y Estructuras de Datos

### Tabla Hash con Encadenamiento Separado

Implementacion desde cero en `app/algorithm/tabla_hash.py`. Cada bucket es una lista de tuplas `(clave, valor, timestamp)`. Las colisiones se resuelven con encadenamiento (separate chaining).

Funcion hash DJB2:

```
h = 5381
para cada caracter c en la clave:
    h = h * 33 + ord(c)
retornar h % capacidad
```

Operaciones:

| Operacion | Complejidad | Descripcion |
|-----------|-------------|-------------|
| `insertar(clave, valor)` | O(1) promedio | Calcula hash, agrega al bucket o actualiza |
| `buscar(clave)` | O(1) promedio | Verifica TTL y retorna |
| `eliminar(clave)` | O(1) promedio | Remueve del bucket |
| `_redimensionar()` | O(n) | Duplica capacidad cuando factor de carga supera 0.75 |
| `estadisticas()` | O(n) | Reporta carga, colisiones, distribucion |

Caracteristicas:

- TTL configurable por entrada (default 3600 segundos). Las entradas expiradas se eliminan en el siguiente acceso.
- Redimensionamiento automatico al superar el factor de carga 0.75. Costo amortizado O(1) por insercion.
- Reporte de estadisticas: capacidad, total de elementos, factor de carga, colisiones, buckets vacios, cadena mas larga.

Se usa como:

- Cache de tokens emitidos por usuario (`token:<id>`)
- Cache de datos de usuario por email (`email:<email>`)

### Hashing de Contrasenas con bcrypt

Cada contrasena se hashea con bcrypt al registrarse, con salt aleatorio generado automaticamente. La verificacion compara el hash almacenado contra el password en texto plano usando `bcrypt.checkpw`.

### Firma JWT con HS256

Firma simetrica con HMAC-SHA256. Misma `SECRET_KEY` para firmar y verificar. Los demas servicios verifican el token sin contactar al Auth Service.

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

El Auth Service es la fuente unica de la identidad. No se comunica con otros servicios. Los demas se conectan a el:

- **Space Service**, **Reservation Service** y **Billing Service** comparten la `SECRET_KEY` y verifican los tokens emitidos aqui sin necesidad de llamadas HTTP.
- **Reservation Service** llama a `GET /usuarios` con un JWT admin para validar la existencia de usuarios y enriquecer respuestas.
- **Billing Service** llama a `GET /usuarios` con un JWT admin para validar usuarios al crear facturas y enriquecer listados.

## Notas

- Para crear el primer usuario `admin`, se puede actualizar manualmente el campo `rol` en la base de datos despues del registro.
- El JWT tiene una duracion fija configurable por `JWT_EXP_HOURS`. No hay endpoint de refresh - el cliente debe volver a hacer login.
- La Tabla Hash es un singleton en memoria. Se vacia al reiniciar el servicio.
- La documentacion interactiva de FastAPI esta disponible en `/docs` (Swagger UI) y `/redoc`.

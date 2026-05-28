from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from app.config import PORT
from app.database import init_db
from app.routes.auth_routes import router as auth_router
from app.routes.usuarios_routes import router as usuarios_router
from app.middleware.jwt_middleware import solo_admin
from app.algorithm.tabla_hash import cache


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    print(f"Auth Service corriendo en :{PORT}")
    yield


app = FastAPI(
    title="Auth Service",
    description="Servicio de Autenticacion — Sistema de Co-working",
    lifespan=lifespan,
)

# CORS abierto para desarrollo local
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Health check publico ---

@app.get("/health")
async def health():
    return {
        "servicio": "auth-service",
        "estado":   "funcionando",
        "puerto":   PORT,
    }


# --- Rutas ---

app.include_router(auth_router)
app.include_router(usuarios_router)


# --- Estadisticas de la tabla hash (admin) ---

@app.get("/cache/estadisticas")
async def estadisticas_cache(admin: dict = Depends(solo_admin)):
    stats = cache.estadisticas()
    stats["claves_activas"] = cache.listar_claves()
    return {
        "algoritmo": "Tabla Hash con encadenamiento separado",
        "funcion_hash": "DJB2 (h * 33 + c)",
        **stats,
    }

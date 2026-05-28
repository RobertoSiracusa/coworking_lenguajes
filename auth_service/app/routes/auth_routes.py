from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Usuario
from app.schemas import RegistroRequest, LoginRequest, TokenResponse
from app.auth import hash_password, verify_password, crear_token
from app.algorithm.tabla_hash import cache

router = APIRouter()


@router.post("/registro", status_code=201, response_model=TokenResponse)
async def registro(req: RegistroRequest, db: AsyncSession = Depends(get_db)):
    # Verificar si el email ya existe
    resultado = await db.execute(select(Usuario).where(Usuario.email == req.email))
    if resultado.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="El email ya esta registrado")

    # Crear usuario
    usuario = Usuario(
        nombre=req.nombre,
        email=req.email,
        password_hash=hash_password(req.password),
        rol="usuario",
    )
    db.add(usuario)
    await db.commit()
    await db.refresh(usuario)

    # Generar token
    token = crear_token(usuario.id, usuario.rol)

    # Cachear en la tabla hash
    cache.insertar(f"email:{usuario.email}", {
        "id": usuario.id,
        "nombre": usuario.nombre,
        "email": usuario.email,
        "rol": usuario.rol,
    })
    cache.insertar(f"token:{usuario.id}", token)

    return TokenResponse(
        token=token,
        usuario_id=usuario.id,
        rol=usuario.rol,
    )


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    # Intentar buscar en cache primero — O(1)
    usuario_cache = cache.buscar(f"email:{req.email}")

    if usuario_cache:
        # Encontrado en cache, pero necesitamos el hash para verificar password
        resultado = await db.execute(select(Usuario).where(Usuario.id == usuario_cache["id"]))
    else:
        # No esta en cache — buscar en BD
        resultado = await db.execute(select(Usuario).where(Usuario.email == req.email))

    usuario = resultado.scalar_one_or_none()
    if not usuario:
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")

    if not verify_password(req.password, usuario.password_hash):
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")

    # Generar token
    token = crear_token(usuario.id, usuario.rol)

    # Actualizar cache
    cache.insertar(f"email:{usuario.email}", {
        "id": usuario.id,
        "nombre": usuario.nombre,
        "email": usuario.email,
        "rol": usuario.rol,
    })
    cache.insertar(f"token:{usuario.id}", token)

    return TokenResponse(
        token=token,
        usuario_id=usuario.id,
        rol=usuario.rol,
    )

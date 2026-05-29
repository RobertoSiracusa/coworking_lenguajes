from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Usuario
from app.schemas import UsuarioResponse, CrearUsuarioRequest, CambiarRolRequest
from app.middleware.jwt_middleware import solo_admin
from app.algorithm.tabla_hash import cache
from app.auth import hash_password

router = APIRouter(prefix="/usuarios")


# DELETE /usuarios/reset - borra todos los usuarios menos el admin que llama
@router.delete("/reset")
async def reset_usuarios(
    admin: dict = Depends(solo_admin),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(delete(Usuario).where(Usuario.id != admin["usuario_id"]))
    await db.commit()
    # Limpiar cache (mantener solo al admin actual)
    cache.buckets = [[] for _ in range(cache.capacidad)]
    cache.total_elementos = 0
    cache.total_colisiones = 0
    return {
        "mensaje": "Usuarios reseteados",
        "eliminados": res.rowcount,
        "preservado_id": admin["usuario_id"],
    }


# POST /usuarios - admin crea usuario con rol explicito
@router.post("", status_code=201, response_model=UsuarioResponse)
async def crear_usuario(
    req: CrearUsuarioRequest,
    admin: dict = Depends(solo_admin),
    db: AsyncSession = Depends(get_db),
):
    # Verificar email duplicado
    existente = await db.execute(select(Usuario).where(Usuario.email == req.email))
    if existente.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="El email ya esta registrado")

    usuario = Usuario(
        nombre=req.nombre,
        email=req.email,
        password_hash=hash_password(req.password),
        rol=req.rol,
    )
    db.add(usuario)
    await db.commit()
    await db.refresh(usuario)

    # Cachear
    cache.insertar(f"email:{usuario.email}", {
        "id": usuario.id, "nombre": usuario.nombre,
        "email": usuario.email, "rol": usuario.rol,
    })
    return UsuarioResponse.model_validate(usuario)


# PATCH /usuarios/{id}/rol - cambiar rol
@router.patch("/{id}/rol", response_model=UsuarioResponse)
async def cambiar_rol(
    id: int,
    req: CambiarRolRequest,
    admin: dict = Depends(solo_admin),
    db: AsyncSession = Depends(get_db),
):
    if id == admin["usuario_id"]:
        raise HTTPException(status_code=400, detail="No puedes cambiar tu propio rol")

    resultado = await db.execute(select(Usuario).where(Usuario.id == id))
    usuario = resultado.scalar_one_or_none()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    usuario.rol = req.rol
    await db.commit()
    await db.refresh(usuario)

    # Invalidar cache (el rol cambio)
    cache.eliminar(f"email:{usuario.email}")
    return UsuarioResponse.model_validate(usuario)


# DELETE /usuarios/reset
@router.delete("/reset")
async def reset_usuarios(
    admin: dict = Depends(solo_admin),
    db: AsyncSession = Depends(get_db),
):
    admin_id = admin["usuario_id"]
    # Obtener todos los usuarios menos el admin actual
    resultado = await db.execute(select(Usuario).where(Usuario.id != admin_id))
    usuarios_a_eliminar = resultado.scalars().all()
    for u in usuarios_a_eliminar:
        cache.eliminar(f"email:{u.email}")
        cache.eliminar(f"token:{u.id}")
        await db.delete(u)
    await db.commit()
    return {"mensaje": "Todos los usuarios han sido eliminados excepto el administrador actual", "eliminados": len(usuarios_a_eliminar)}


# DELETE /usuarios/{id}
@router.delete("/{id}")
async def eliminar_usuario(
    id: int,
    admin: dict = Depends(solo_admin),
    db: AsyncSession = Depends(get_db),
):
    if id == admin["usuario_id"]:
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")

    resultado = await db.execute(select(Usuario).where(Usuario.id == id))
    usuario = resultado.scalar_one_or_none()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    cache.eliminar(f"email:{usuario.email}")
    cache.eliminar(f"token:{usuario.id}")
    await db.delete(usuario)
    await db.commit()
    return {"mensaje": "Usuario eliminado", "id": id}


@router.get("", response_model=list[UsuarioResponse])
async def listar_usuarios(
    admin: dict = Depends(solo_admin),
    db: AsyncSession = Depends(get_db),
):
    resultado = await db.execute(select(Usuario).order_by(Usuario.creado_en.desc()))
    usuarios = resultado.scalars().all()
    return [UsuarioResponse.model_validate(u) for u in usuarios]


@router.get("/buscar")
async def buscar_usuarios(
    q: str = Query(min_length=1),
    algoritmo: str = Query(default="hash", pattern="^(lineal|hash)$"),
    admin: dict = Depends(solo_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Busca usuarios por email.
    ?algoritmo=hash  → busca en la tabla hash custom — O(1) promedio
    ?algoritmo=lineal → carga todos y recorre uno por uno — O(n)
    """
    if algoritmo == "hash":
        # Busqueda O(1) en la tabla hash
        encontrado = cache.buscar(f"email:{q}")
        resultados = [encontrado] if encontrado else []
        return {
            "query": q,
            "algoritmo": "hash — O(1) promedio",
            "resultados": resultados,
            "total": len(resultados),
        }

    # Busqueda lineal O(n) — cargar todos y filtrar
    resultado = await db.execute(select(Usuario))
    todos = resultado.scalars().all()

    q_lower = q.lower()
    encontrados = [
        UsuarioResponse.model_validate(u)
        for u in todos
        if q_lower in u.email.lower() or q_lower in u.nombre.lower()
    ]

    return {
        "query": q,
        "algoritmo": "lineal — O(n)",
        "resultados": encontrados,
        "total": len(encontrados),
    }

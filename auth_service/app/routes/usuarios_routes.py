from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Usuario
from app.schemas import UsuarioResponse
from app.middleware.jwt_middleware import solo_admin
from app.algorithm.tabla_hash import cache

router = APIRouter(prefix="/usuarios")


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

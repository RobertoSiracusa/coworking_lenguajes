from fastapi import Depends, HTTPException, Request

import jwt

from app.config import SECRET_KEY


async def verificar_jwt(request: Request) -> dict:
    header = request.headers.get("Authorization")

    if not header or not header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token requerido")

    token = header[7:]

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return {
            "usuario_id": int(payload["sub"]),
            "rol":        payload["rol"],
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except (jwt.InvalidTokenError, KeyError):
        raise HTTPException(status_code=401, detail="Token invalido")


async def solo_admin(usuario: dict = Depends(verificar_jwt)) -> dict:
    if usuario["rol"] != "admin":
        raise HTTPException(
            status_code=403,
            detail="Solo administradores pueden realizar esta accion",
        )
    return usuario

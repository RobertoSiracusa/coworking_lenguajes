from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config import SECRET_KEY, JWT_EXP_HOURS


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def crear_token(user_id: int, rol: str) -> str:
    """
    Genera un JWT compatible con los 3 microservicios consumidores.
    Claims: sub (string), rol, iat, exp. Algoritmo: HS256.
    """
    ahora = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "rol": rol,
        "iat": ahora,
        "exp": ahora + timedelta(hours=JWT_EXP_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")

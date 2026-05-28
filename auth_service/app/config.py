import os
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY    = os.getenv("SECRET_KEY", "clave_por_defecto")
DATABASE_URL  = os.getenv("DATABASE_URL", "postgresql+asyncpg://coworking_user:coworking_pass@localhost:5432/authdb")
PORT          = int(os.getenv("PORT", "8001"))
JWT_EXP_HOURS = int(os.getenv("JWT_EXP_HOURS", "24"))

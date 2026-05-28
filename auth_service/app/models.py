from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, func

from app.database import Base


class Usuario(Base):
    __tablename__ = "usuarios"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    nombre        = Column(String(100), nullable=False)
    email         = Column(String(150), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    rol           = Column(String(20), default="usuario")
    creado_en     = Column(DateTime, server_default=func.now())

from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class RegistroRequest(BaseModel):
    nombre:   str = Field(min_length=1, max_length=100)
    email:    EmailStr
    password: str = Field(min_length=6)


class LoginRequest(BaseModel):
    email:    EmailStr
    password: str


class TokenResponse(BaseModel):
    token:      str
    tipo:       str = "Bearer"
    usuario_id: int
    rol:        str


class UsuarioResponse(BaseModel):
    id:        int
    nombre:    str
    email:     str
    rol:       str
    creado_en: datetime | None = None

    model_config = {"from_attributes": True}


# Admin crea usuario con rol explicito
class CrearUsuarioRequest(BaseModel):
    nombre:   str = Field(min_length=1, max_length=100)
    email:    EmailStr
    password: str = Field(min_length=6)
    rol:      str = Field(pattern="^(usuario|admin)$")


# Admin cambia rol de usuario existente
class CambiarRolRequest(BaseModel):
    rol: str = Field(pattern="^(usuario|admin)$")

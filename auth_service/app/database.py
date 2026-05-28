from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import DATABASE_URL

engine = create_async_engine(DATABASE_URL, echo=False)

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db():
    async with engine.begin() as conn:
        from app.models import Usuario  # noqa: F401
        await conn.run_sync(Base.metadata.create_all)
    print("Auth Service — BD conectada, tabla usuarios creada")


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

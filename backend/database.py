import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
try:
    from config import settings
except Exception:
    settings = None

SQLALCHEMY_DATABASE_URL = os.environ.get("DATABASE_URL") or (settings.database_url if settings else "sqlite:///./foodnova.db")
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in SQLALCHEMY_DATABASE_URL else {},
    echo=bool(getattr(settings, "sqlalchemy_echo", False))
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

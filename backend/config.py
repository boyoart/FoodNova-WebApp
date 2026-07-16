from dotenv import load_dotenv
from pydantic_settings import BaseSettings

load_dotenv()

class Settings(BaseSettings):
    app_name: str = "FoodNova"
    app_version: str = "0.1.0"
    
    # Database
    database_url: str = "sqlite:///./foodnova.db"
    sqlalchemy_echo: bool = False
    
    # Security
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    # CORS
    cors_origins: list = ["*"]
    
    # File upload
    max_upload_size: int = 5 * 1024 * 1024  # 5MB
    upload_directory: str = "uploads"
    
    class Config:
        env_file = ".env"

settings = Settings()

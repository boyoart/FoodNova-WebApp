from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from config import settings
from database import Base, engine
from routes import auth, products, packs, orders, admin

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Fresh food delivery API"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for uploads
os.makedirs(settings.upload_directory, exist_ok=True)
app.mount(f"/{settings.upload_directory}", StaticFiles(directory=settings.upload_directory), name=settings.upload_directory)

# Include routers
app.include_router(auth.router)
app.include_router(products.router)
app.include_router(packs.router)
app.include_router(orders.router)
app.include_router(admin.router)

@app.get("/")
def read_root():
    return {
        "message": f"Welcome to {settings.app_name}",
        "version": settings.app_version,
        "api_docs": "/docs"
    }

@app.get("/health")
def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

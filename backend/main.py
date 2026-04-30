from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="FoodNova API")


# =========================
# CORS
# =========================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://food-nova-web-app.vercel.app",
        "https://foodnova-webapp.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# OPTIONAL DATABASE INIT
# This will not crash if database files/models are different.
# =========================
try:
    from database import Base, engine

    Base.metadata.create_all(bind=engine)
except Exception as e:
    print("DATABASE INIT SKIPPED:", str(e))


# =========================
# OPTIONAL ROUTERS
# These are loaded only if they do not crash.
# This prevents one bad router/model from killing the whole API.
# =========================
try:
    from routes import auth

    app.include_router(auth.router)
except Exception as e:
    print("AUTH ROUTER SKIPPED:", str(e))


try:
    from routes import orders

    app.include_router(orders.router)
except Exception as e:
    print("ORDERS ROUTER SKIPPED:", str(e))


try:
    from routes import admin

    app.include_router(admin.router)
except Exception as e:
    print("ADMIN ROUTER SKIPPED:", str(e))


# =========================
# BASIC ROUTES
# =========================
@app.get("/")
def root():
    return {
        "message": "FoodNova API is running",
        "status": "ok",
    }


@app.head("/")
def root_head():
    return None


@app.get("/health")
def health():
    return {"status": "ok"}


# =========================
# PUBLIC FOODNOVA DATA
# Safe static data for frontend display
# =========================
@app.get("/categories")
def list_categories():
    return [
        {"id": 1, "name": "Rice"},
        {"id": 2, "name": "Oil"},
        {"id": 3, "name": "Pasta & Noodles"},
        {"id": 4, "name": "Beans"},
        {"id": 5, "name": "Garri"},
        {"id": 6, "name": "Spices & Seasoning"},
        {"id": 7, "name": "Sugar & Sweeteners"},
    ]


@app.get("/products")
def list_products():
    return [
        {
            "id": 1,
            "name": "Rice 5kg",
            "price": 8500,
            "stock_qty": 100,
            "category": "Rice",
            "image_url": "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=800",
            "is_active": True,
        },
        {
            "id": 2,
            "name": "Palm Oil 1L",
            "price": 2500,
            "stock_qty": 100,
            "category": "Oil",
            "image_url": "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=800",
            "is_active": True,
        },
        {
            "id": 3,
            "name": "Indomie Pack",
            "price": 1500,
            "stock_qty": 200,
            "category": "Pasta & Noodles",
            "image_url": "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?w=800",
            "is_active": True,
        },
        {
            "id": 4,
            "name": "Beans 3kg",
            "price": 6000,
            "stock_qty": 100,
            "category": "Beans",
            "image_url": "https://images.unsplash.com/photo-1515543904379-3d757afe72e4?w=800",
            "is_active": True,
        },
        {
            "id": 5,
            "name": "Garri 5kg",
            "price": 4500,
            "stock_qty": 100,
            "category": "Garri",
            "image_url": "https://images.unsplash.com/photo-1606787366850-de6330128bfc?w=800",
            "is_active": True,
        },
    ]


@app.get("/packs")
def list_packs():
    return [
        {
            "id": 1,
            "name": "Starter Pack",
            "description": "Weekly Survival Pack for singles, students, and light household needs.",
            "price": 12000,
            "is_active": True,
            "items": ["Rice", "Palm Oil", "Noodles"],
            "image_url": "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800",
        },
        {
            "id": 2,
            "name": "Family Pack",
            "description": "Monthly Core Pack for family foodstuff restocking.",
            "price": 25000,
            "is_active": True,
            "items": ["Rice", "Beans", "Garri", "Oil"],
            "image_url": "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800",
        },
        {
            "id": 3,
            "name": "Premium Pack",
            "description": "Hustler Bulk Pack for larger homes, vendors, and bulk buyers.",
            "price": 75000,
            "is_active": True,
            "items": ["Rice", "Beans", "Garri", "Oil", "Noodles", "Spices"],
            "image_url": "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800",
        },
    ]


@app.get("/packs/{pack_id}")
def get_pack(pack_id: int):
    packs = list_packs()

    for pack in packs:
        if pack["id"] == pack_id:
            return pack

    return {"detail": "Pack not found"}
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine, SessionLocal
from models import Product, Pack
from routes import auth, orders, admin


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
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# HELPERS
# =========================
def model_has_column(model, column_name: str) -> bool:
    return column_name in model.__table__.columns.keys()


def clean_model_data(model, data: dict) -> dict:
    allowed_columns = model.__table__.columns.keys()
    return {key: value for key, value in data.items() if key in allowed_columns}


def get_active_query(db, model):
    query = db.query(model)

    if model_has_column(model, "is_active"):
        query = query.filter(model.is_active == True)

    return query


# =========================
# DATABASE INIT + SAFE SEED
# =========================
def seed_database():
    db = SessionLocal()

    try:
        Base.metadata.create_all(bind=engine)

        existing_product = db.query(Product).first()
        if existing_product:
            return

        # Products seed
        product_items = [
            {
                "name": "Rice 5kg",
                "price": 8500,
                "stock_qty": 100,
                "stock": 100,
                "category": "Rice",
                "category_name": "Rice",
                "image_url": "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=800",
                "is_active": True,
            },
            {
                "name": "Palm Oil 1L",
                "price": 2500,
                "stock_qty": 100,
                "stock": 100,
                "category": "Oil",
                "category_name": "Oil",
                "image_url": "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=800",
                "is_active": True,
            },
            {
                "name": "Indomie Pack",
                "price": 1500,
                "stock_qty": 200,
                "stock": 200,
                "category": "Pasta & Noodles",
                "category_name": "Pasta & Noodles",
                "image_url": "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?w=800",
                "is_active": True,
            },
            {
                "name": "Beans 3kg",
                "price": 6000,
                "stock_qty": 100,
                "stock": 100,
                "category": "Beans",
                "category_name": "Beans",
                "image_url": "https://images.unsplash.com/photo-1515543904379-3d757afe72e4?w=800",
                "is_active": True,
            },
            {
                "name": "Garri 5kg",
                "price": 4500,
                "stock_qty": 100,
                "stock": 100,
                "category": "Garri",
                "category_name": "Garri",
                "image_url": "https://images.unsplash.com/photo-1606787366850-de6330128bfc?w=800",
                "is_active": True,
            },
        ]

        for item in product_items:
            db.add(Product(**clean_model_data(Product, item)))

        # Packs seed
        pack_items = [
            {
                "name": "Starter Pack",
                "description": "Weekly Survival Pack for singles, students, and light household needs.",
                "price": 12000,
                "is_active": True,
            },
            {
                "name": "Family Pack",
                "description": "Monthly Core Pack for family foodstuff restocking.",
                "price": 25000,
                "is_active": True,
            },
            {
                "name": "Premium Pack",
                "description": "Hustler Bulk Pack for larger homes, vendors, and bulk buyers.",
                "price": 75000,
                "is_active": True,
            },
        ]

        for item in pack_items:
            db.add(Pack(**clean_model_data(Pack, item)))

        db.commit()

    except Exception as e:
        db.rollback()
        print("SEED ERROR:", str(e))

    finally:
        db.close()


@app.on_event("startup")
def startup_event():
    seed_database()


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
# PUBLIC ROUTES
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
    ]


@app.get("/products")
def list_products():
    db = SessionLocal()

    try:
        return get_active_query(db, Product).all()
    finally:
        db.close()


@app.get("/packs")
def list_packs():
    db = SessionLocal()

    try:
        return get_active_query(db, Pack).all()
    finally:
        db.close()


# =========================
# OTHER ROUTERS
# =========================
app.include_router(auth.router)
app.include_router(orders.router)
app.include_router(admin.router)
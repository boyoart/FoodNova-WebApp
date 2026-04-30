from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine, SessionLocal
from models import Category, Product, Pack
from routes import auth, products, packs, orders, admin


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
# DATABASE INIT + SEED
# =========================
def seed_database():
    db = SessionLocal()

    try:
        Base.metadata.create_all(bind=engine)

        existing_product = db.query(Product).first()
        if existing_product:
            return

        # Categories
        rice = Category(name="Rice")
        oil = Category(name="Oil")
        noodles = Category(name="Pasta & Noodles")
        beans = Category(name="Beans")
        garri = Category(name="Garri")
        spices = Category(name="Spices & Seasoning")

        db.add_all([rice, oil, noodles, beans, garri, spices])
        db.commit()

        db.refresh(rice)
        db.refresh(oil)
        db.refresh(noodles)
        db.refresh(beans)
        db.refresh(garri)
        db.refresh(spices)

        # Products
        products_seed = [
            Product(
                name="Rice 5kg",
                price=8500,
                stock_qty=100,
                category_id=rice.id,
                image_url="https://images.unsplash.com/photo-1586201375761-83865001e31c?w=800",
                is_active=True,
            ),
            Product(
                name="Palm Oil 1L",
                price=2500,
                stock_qty=100,
                category_id=oil.id,
                image_url="https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=800",
                is_active=True,
            ),
            Product(
                name="Indomie Pack",
                price=1500,
                stock_qty=200,
                category_id=noodles.id,
                image_url="https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?w=800",
                is_active=True,
            ),
            Product(
                name="Beans 3kg",
                price=6000,
                stock_qty=100,
                category_id=beans.id,
                image_url="https://images.unsplash.com/photo-1515543904379-3d757afe72e4?w=800",
                is_active=True,
            ),
            Product(
                name="Garri 5kg",
                price=4500,
                stock_qty=100,
                category_id=garri.id,
                image_url="https://images.unsplash.com/photo-1606787366850-de6330128bfc?w=800",
                is_active=True,
            ),
        ]

        db.add_all(products_seed)

        # Packs
        packs_seed = [
            Pack(
                name="Starter Pack",
                description="Weekly Survival Pack for singles, students, and light household needs.",
                is_active=True,
            ),
            Pack(
                name="Family Pack",
                description="Monthly Core Pack for family foodstuff restocking.",
                is_active=True,
            ),
            Pack(
                name="Premium Pack",
                description="Hustler Bulk Pack for larger homes, vendors, and bulk buyers.",
                is_active=True,
            ),
        ]

        db.add_all(packs_seed)
        db.commit()

    finally:
        db.close()


@app.on_event("startup")
def startup_event():
    seed_database()


# =========================
# ROUTERS
# =========================
app.include_router(auth.router)
app.include_router(products.router)
app.include_router(packs.router)
app.include_router(orders.router)
app.include_router(admin.router)


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
# DIRECT PUBLIC FALLBACK ROUTES
# These prevent 404 / empty frontend issues
# =========================
@app.get("/categories")
def list_categories():
    db = SessionLocal()
    try:
        return db.query(Category).all()
    finally:
        db.close()


@app.get("/products")
def list_products_direct():
    db = SessionLocal()
    try:
        return db.query(Product).filter(Product.is_active == True).all()
    finally:
        db.close()


@app.get("/packs")
def list_packs_direct():
    db = SessionLocal()
    try:
        return db.query(Pack).filter(Pack.is_active == True).all()
    finally:
        db.close()
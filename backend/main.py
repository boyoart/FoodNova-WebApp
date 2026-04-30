from datetime import datetime
from typing import Dict, List, Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr


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
# TEMP STORAGE
# This keeps the app working while we later rebuild real DB auth.
# =========================
USERS: Dict[str, dict] = {}
TOKENS: Dict[str, str] = {}
ORDERS: List[dict] = []


# Default admin
ADMIN_EMAIL = "admin@foodnova.com"
ADMIN_PASSWORD = "Admin123!"

USERS[ADMIN_EMAIL] = {
    "id": 1,
    "full_name": "FoodNova Admin",
    "email": ADMIN_EMAIL,
    "phone": "",
    "password": ADMIN_PASSWORD,
    "role": "admin",
}


# =========================
# SCHEMAS
# =========================
class RegisterPayload(BaseModel):
    full_name: Optional[str] = None
    fullName: Optional[str] = None
    name: Optional[str] = None
    email: EmailStr
    phone: Optional[str] = ""
    password: str
    confirm_password: Optional[str] = None
    confirmPassword: Optional[str] = None


class LoginPayload(BaseModel):
    email: EmailStr
    password: str


class OrderPayload(BaseModel):
    items: Optional[list] = []
    total: Optional[float] = 0
    total_amount: Optional[float] = 0
    delivery_address: Optional[str] = ""
    address: Optional[str] = ""
    phone: Optional[str] = ""
    payment_method: Optional[str] = "bank"


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
# PUBLIC DATA
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
    for pack in list_packs():
        if pack["id"] == pack_id:
            return pack

    raise HTTPException(status_code=404, detail="Pack not found")


# =========================
# AUTH ROUTES
# =========================
@app.post("/auth/register")
def register(payload: RegisterPayload):
    email = payload.email.lower()

    if email in USERS:
        raise HTTPException(status_code=400, detail="Email already registered")

    confirm = payload.confirm_password or payload.confirmPassword

    if confirm and confirm != payload.password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    full_name = payload.full_name or payload.fullName or payload.name or "FoodNova Customer"

    user = {
        "id": len(USERS) + 1,
        "full_name": full_name,
        "email": email,
        "phone": payload.phone or "",
        "password": payload.password,
        "role": "customer",
    }

    USERS[email] = user

    token = f"token-{uuid4()}"
    TOKENS[token] = email

    return {
        "message": "Registration successful",
        "access_token": token,
        "token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "full_name": user["full_name"],
            "email": user["email"],
            "phone": user["phone"],
            "role": user["role"],
        },
    }


@app.post("/auth/login")
def login(payload: LoginPayload):
    email = payload.email.lower()
    user = USERS.get(email)

    if not user or user["password"] != payload.password:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = f"token-{uuid4()}"
    TOKENS[token] = email

    return {
        "message": "Login successful",
        "access_token": token,
        "token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "full_name": user["full_name"],
            "email": user["email"],
            "phone": user.get("phone", ""),
            "role": user["role"],
        },
    }


@app.get("/auth/me")
def me():
    return {
        "message": "Auth check available",
        "note": "Temporary auth active for FoodNova testing",
    }


# =========================
# ORDER ROUTES
# =========================
@app.post("/orders")
def create_order(payload: OrderPayload):
    order = {
        "id": len(ORDERS) + 1,
        "items": payload.items or [],
        "total_amount": payload.total_amount or payload.total or 0,
        "delivery_address": payload.delivery_address or payload.address or "",
        "phone": payload.phone or "",
        "payment_method": payload.payment_method or "bank",
        "status": "pending",
        "created_at": datetime.utcnow().isoformat(),
        "receipt": None,
    }

    ORDERS.append(order)

    return {
        "message": "Order created successfully",
        "order": order,
    }


@app.get("/orders/my")
def my_orders():
    return ORDERS


@app.get("/orders/{order_id}")
def get_order(order_id: int):
    for order in ORDERS:
        if order["id"] == order_id:
            return order

    raise HTTPException(status_code=404, detail="Order not found")


@app.post("/orders/{order_id}/receipt")
async def upload_receipt(order_id: int, file: UploadFile = File(...)):
    for order in ORDERS:
        if order["id"] == order_id:
            order["receipt"] = {
                "filename": file.filename,
                "status": "submitted",
                "uploaded_at": datetime.utcnow().isoformat(),
            }

            return {
                "message": "Receipt uploaded successfully",
                "receipt": order["receipt"],
            }

    raise HTTPException(status_code=404, detail="Order not found")


# =========================
# ADMIN ROUTES
# =========================
@app.get("/admin/orders")
def admin_orders():
    return ORDERS


@app.get("/admin/products")
def admin_products():
    return list_products()


@app.patch("/admin/orders/{order_id}")
def update_order(order_id: int, payload: dict):
    for order in ORDERS:
        if order["id"] == order_id:
            order.update(payload)
            return {
                "message": "Order updated successfully",
                "order": order,
            }

    raise HTTPException(status_code=404, detail="Order not found")
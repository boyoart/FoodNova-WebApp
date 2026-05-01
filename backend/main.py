from datetime import datetime
from typing import Dict, List, Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr

app = FastAPI(title="FoodNova API")

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

USERS: Dict[str, dict] = {}
TOKENS: Dict[str, str] = {}
ORDERS: List[dict] = []

ADMIN_EMAIL = "admin@foodnova.com"
ADMIN_PASSWORD = "Admin123!"

USERS[ADMIN_EMAIL] = {
    "id": 1,
    "full_name": "FoodNova Admin",
    "fullName": "FoodNova Admin",
    "name": "FoodNova Admin",
    "email": ADMIN_EMAIL,
    "phone": "",
    "password": ADMIN_PASSWORD,
    "role": "admin",
}


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
    customer_name: Optional[str] = ""
    customer_email: Optional[str] = ""
    customer_phone: Optional[str] = ""
    payment_method: Optional[str] = "bank_transfer"


def public_user(user: dict) -> dict:
    full_name = user.get("full_name") or user.get("fullName") or user.get("name") or "FoodNova User"
    return {
        "id": user["id"],
        "full_name": full_name,
        "fullName": full_name,
        "name": full_name,
        "email": user["email"],
        "phone": user.get("phone", ""),
        "role": user.get("role", "customer"),
    }


def auth_response(message: str, user: dict, token: str) -> dict:
    user_data = public_user(user)
    return {
        "success": True,
        "message": message,
        "access_token": token,
        "accessToken": token,
        "token": token,
        "jwt": token,
        "token_type": "bearer",
        "user": user_data,
        "data": {
            "access_token": token,
            "accessToken": token,
            "token": token,
            "jwt": token,
            "user": user_data,
        },
    }


def normalize_order_items(items: list) -> list:
    normalized = []

    for item in items or []:
        qty = item.get("quantity") or item.get("qty") or 1
        price = item.get("price") or item.get("unit_price") or 0
        name = item.get("name") or item.get("product_name") or f"Product #{item.get('product_id') or item.get('id') or ''}"

        normalized.append({
            "id": item.get("id") or item.get("product_id"),
            "product_id": item.get("product_id") or item.get("id"),
            "name": name,
            "product_name": name,
            "price": price,
            "unit_price": price,
            "quantity": qty,
            "qty": qty,
            "line_total": price * qty,
        })

    return normalized


@app.get("/")
def root():
    return {"message": "FoodNova API is running", "status": "ok"}


@app.head("/")
def root_head():
    return None


@app.get("/health")
def health():
    return {"status": "ok"}


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
    return [
        {
            "id": 1,
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
            "id": 2,
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
            "id": 3,
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
            "id": 4,
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
            "id": 5,
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


@app.get("/products/{product_id}")
def get_product(product_id: int):
    for product in list_products():
        if product["id"] == product_id:
            return product

    raise HTTPException(status_code=404, detail="Product not found")


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


@app.post("/auth/register")
def register(payload: RegisterPayload):
    email = payload.email.lower().strip()

    if email in USERS:
        raise HTTPException(status_code=400, detail="Email already registered")

    confirm = payload.confirm_password or payload.confirmPassword

    if confirm and confirm != payload.password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    full_name = payload.full_name or payload.fullName or payload.name or "FoodNova Customer"

    user = {
        "id": len(USERS) + 1,
        "full_name": full_name,
        "fullName": full_name,
        "name": full_name,
        "email": email,
        "phone": payload.phone or "",
        "password": payload.password,
        "role": "customer",
    }

    USERS[email] = user

    token = f"token-{uuid4()}"
    TOKENS[token] = email

    return auth_response("Registration successful", user, token)


@app.post("/auth/login")
def login(payload: LoginPayload):
    email = payload.email.lower().strip()
    user = USERS.get(email)

    if not user or user["password"] != payload.password:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = f"token-{uuid4()}"
    TOKENS[token] = email

    return auth_response("Login successful", user, token)


@app.post("/register")
def register_fallback(payload: RegisterPayload):
    return register(payload)


@app.post("/login")
def login_fallback(payload: LoginPayload):
    return login(payload)


@app.get("/auth/me")
def me():
    return {"success": True, "message": "Temporary auth active"}


@app.post("/orders")
def create_order(payload: OrderPayload):
    normalized_items = normalize_order_items(payload.items or [])

    order = {
        "id": len(ORDERS) + 1,
        "order_code": f"FN-{len(ORDERS) + 1:05d}",
        "items": normalized_items,
        "total_amount": payload.total_amount or payload.total or sum(item["line_total"] for item in normalized_items),
        "delivery_address": payload.delivery_address or payload.address or "",
        "phone": payload.phone or payload.customer_phone or "",
        "customer_name": payload.customer_name or "FoodNova Customer",
        "customer_email": payload.customer_email or "",
        "payment_method": payload.payment_method or "bank_transfer",
        "status": "pending_payment",
        "created_at": datetime.utcnow().isoformat(),
        "receipt": None,
    }

    ORDERS.append(order)

    return {
        "success": True,
        "message": "Order created successfully",
        "order": order,
        "data": order,
    }


@app.get("/orders/my")
def my_orders():
    return {"success": True, "orders": ORDERS, "data": ORDERS}


@app.get("/orders")
def all_orders():
    return {"success": True, "orders": ORDERS, "data": ORDERS}


@app.get("/orders/{order_id}")
def get_order(order_id: int):
    for order in ORDERS:
        if order["id"] == order_id:
            return {"success": True, "order": order, "data": order}

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
            order["status"] = "receipt_submitted"

            return {
                "success": True,
                "message": "Receipt uploaded successfully",
                "receipt": order["receipt"],
                "data": order["receipt"],
            }

    raise HTTPException(status_code=404, detail="Order not found")


@app.get("/admin/orders")
def admin_orders():
    return {"success": True, "orders": ORDERS, "data": ORDERS}


@app.get("/admin/orders/{order_id}")
def admin_get_order(order_id: int):
    for order in ORDERS:
        if order["id"] == order_id:
            return {"success": True, "order": order, "data": order}

    raise HTTPException(status_code=404, detail="Order not found")


@app.patch("/admin/orders/{order_id}")
def update_order(order_id: int, payload: dict):
    for order in ORDERS:
        if order["id"] == order_id:
            order.update(payload)
            return {
                "success": True,
                "message": "Order updated successfully",
                "order": order,
                "data": order,
            }

    raise HTTPException(status_code=404, detail="Order not found")


@app.get("/admin/products")
def admin_products():
    products = list_products()
    return {"success": True, "products": products, "data": products}


@app.post("/admin/products")
def admin_create_product(payload: dict):
    return {
        "success": True,
        "message": "Temporary product creation endpoint active",
        "product": payload,
        "data": payload,
    }


@app.patch("/admin/products/{product_id}")
def admin_update_product(product_id: int, payload: dict):
    updated_product = {"id": product_id, **payload}
    return {
        "success": True,
        "message": "Temporary product update endpoint active",
        "product": updated_product,
        "data": updated_product,
    }
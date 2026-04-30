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
        "https://foodnova-webapp.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# TEMPORARY IN-MEMORY STORAGE
# This keeps the deployed app working while database auth/order flow
# is rebuilt properly later.
# =========================
USERS: Dict[str, dict] = {}
TOKENS: Dict[str, str] = {}
ORDERS: List[dict] = []


# =========================
# DEFAULT ADMIN USER
# =========================
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
# HELPERS
# =========================
def public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "full_name": user.get("full_name", user.get("name", "FoodNova User")),
        "fullName": user.get("fullName", user.get("full_name", user.get("name", "FoodNova User"))),
        "name": user.get("name", user.get("full_name", "FoodNova User")),
        "email": user["email"],
        "phone": user.get("phone", ""),
        "role": user.get("role", "customer"),
    }


def auth_response(message: str, user: dict, token: str) -> dict:
    user_data = public_user(user)

    return {
        "success": True,
        "message": message,

        # Common token formats
        "access_token": token,
        "accessToken": token,
        "token": token,
        "jwt": token,
        "token_type": "bearer",

        # Common user formats
        "user": user_data,

        # Nested data format for frontend compatibility
        "data": {
            "access_token": token,
            "accessToken": token,
            "token": token,
            "jwt": token,
            "user": user_data,
        },
    }


def find_user_by_token(token: Optional[str]) -> Optional[dict]:
    if not token:
        return None

    email = TOKENS.get(token)

    if not email:
        return None

    return USERS.get(email)


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
# PUBLIC PRODUCT DATA
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
            "stock": 100,
            "category": "Rice",
            "category_name": "Rice",
            "image_url": "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=800",
            "is_active": True,
        },
        {
            "id": 2,
            "name": "Palm
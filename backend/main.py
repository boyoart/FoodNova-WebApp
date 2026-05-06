from datetime import datetime
from typing import Dict, List, Optional
from uuid import uuid4
import json
import os
import random

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr
from sqlalchemy import inspect, text

from database import Base, SessionLocal, engine
from models import (
    Address as DBAddress,
    AdminAuditLog as DBAdminAuditLog,
    Broadcast as DBBroadcast,
    Notification as DBNotification,
    Order as DBOrder,
    OrderItem as DBOrderItem,
    Pack as DBPack,
    Product as DBProduct,
    Profile as DBProfile,
    User as DBUser,
)

try:
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
except Exception:
    pwd_context = None

app = FastAPI(title="FoodNova API")
UPLOAD_DIR = "uploads"
AVATAR_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "avatars")
PRODUCT_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "products")
PACK_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "packs")
os.makedirs(AVATAR_UPLOAD_DIR, exist_ok=True)
os.makedirs(PRODUCT_UPLOAD_DIR, exist_ok=True)
os.makedirs(PACK_UPLOAD_DIR, exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://food-nova-web-app.vercel.app",
        "https://foodnova-webapp.vercel.app",
        *([os.environ.get("FRONTEND_ORIGIN")] if os.environ.get("FRONTEND_ORIGIN") else []),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if not any(getattr(route, "path", None) == "/uploads" for route in app.routes):
    app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

USERS: Dict[str, dict] = {}
TOKENS: Dict[str, str] = {}
ORDERS: List[dict] = []
PRODUCTS: List[dict] = []
PACKS: List[dict] = []
USER_PROFILES: Dict[str, dict] = {}
USER_ADDRESSES: Dict[str, List[dict]] = {}
ORDER_NOTIFICATIONS: Dict[str, List[dict]] = {}
BROADCAST_MESSAGES: List[dict] = []

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

# Initialize products
PRODUCTS.extend([
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
        "stock_qty": 150,
        "stock": 150,
        "category": "Beans",
        "category_name": "Beans",
        "image_url": "https://images.unsplash.com/photo-1551468747-954d2a9b6b6b?w=800",
        "is_active": True,
    },
    {
        "id": 5,
        "name": "Garri 2kg",
        "price": 3000,
        "stock_qty": 80,
        "stock": 80,
        "category": "Garri",
        "category_name": "Garri",
        "image_url": "https://images.unsplash.com/photo-1574484284002-952d92456975?w=800",
        "is_active": True,
    },
])

# Initialize packs
PACKS.extend([
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
])


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


class ChangePasswordPayload(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str


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
    delivery_method: Optional[str] = "delivery"
    pickup_note: Optional[str] = ""
    delivery_method: Optional[str] = "delivery"
    pickup_note: Optional[str] = ""
    delivery_address_id: Optional[int] = None
    delivery_address_snapshot: Optional[dict] = None
    delivery_notes: Optional[str] = ""


class ProfileUpdatePayload(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = ""


class AddressPayload(BaseModel):
    label: Optional[str] = ""
    recipient_name: Optional[str] = ""
    phone: Optional[str] = ""
    address_line: Optional[str] = ""
    street: Optional[str] = ""
    area: Optional[str] = ""
    city: Optional[str] = ""
    lga: Optional[str] = ""
    state: Optional[str] = ""
    country: Optional[str] = "Nigeria"
    landmark: Optional[str] = ""
    postal_code: Optional[str] = ""
    google_place_id: Optional[str] = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_default: Optional[bool] = False


class BroadcastPayload(BaseModel):
    title: str
    message: str
    type: Optional[str] = "broadcast"
    audience: Optional[str] = "all"
    is_active: Optional[bool] = True


class BroadcastUpdatePayload(BaseModel):
    title: Optional[str] = None
    message: Optional[str] = None
    type: Optional[str] = None
    audience: Optional[str] = None
    is_active: Optional[bool] = None
    resend: Optional[bool] = False


class NotificationUpdatePayload(BaseModel):
    is_read: Optional[bool] = None


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


def _get_user_from_token(authorization: Optional[str]) -> Optional[dict]:
    if not authorization:
        return None
    token = authorization.replace("Bearer ", "").strip()
    email = TOKENS.get(token)
    if not email:
        return None
    db = SessionLocal()
    try:
        user = get_db_user_by_email(db, email)
        return db_user_to_dict(user) if user else None
    finally:
        db.close()


def require_user(request: Request):
    user = _get_user_from_token(request.headers.get("authorization"))
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user


def require_admin(request: Request):
    user = require_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def create_admin_audit_log(
    request: Optional[Request],
    admin: dict,
    action: str,
    entity_type: str = "",
    entity_id: str = "",
    description: str = "",
    metadata: dict = None,
):
    db = SessionLocal()
    try:
        log = DBAdminAuditLog(
            admin_id=admin.get("id"),
            admin_name=admin.get("full_name") or admin.get("fullName") or admin.get("name") or "Admin",
            admin_email=admin.get("email") or "",
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id or ""),
            description=description,
            metadata_json=json.dumps(metadata or {}),
            ip_address=request.client.host if request and request.client else "",
            user_agent=request.headers.get("user-agent", "") if request else "",
        )
        db.add(log)
        db.commit()
    except Exception as error:
        print("AUDIT LOG ERROR:", repr(error))
    finally:
        db.close()


def _password_matches(plain_password: str, stored_password: str) -> bool:
    if not stored_password:
        return False

    if pwd_context and str(stored_password).startswith(("$2a$", "$2b$", "$2y$")):
        try:
            return pwd_context.verify(plain_password, stored_password)
        except Exception:
            return False

    return stored_password == plain_password


def _hash_new_password(password: str) -> str:
    if pwd_context:
        try:
            return pwd_context.hash(password)
        except Exception:
            pass

    return password


def auth_response(message: str, user: dict, token: str) -> dict:
    user_data = public_user(user)
    response = {
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
    if user_data.get("role") == "admin":
        response["admin"] = user_data
        response["data"]["admin"] = user_data
    return response




def _get_next_notification_id(email: str) -> int:
    """Get next notification ID for a user."""
    db = SessionLocal()
    try:
        latest = (
            db.query(DBNotification)
            .filter(DBNotification.user_email == str(email).strip().lower())
            .order_by(DBNotification.id.desc())
            .first()
        )
        return (latest.id + 1) if latest else 1
    finally:
        db.close()


def _create_user_notification(email: str, title: str, message: str, notif_type: str = "service", 
                              category: str = "service", order: dict = None) -> dict:
    """Create a general user notification."""
    if not email:
        return None
    email = str(email).strip().lower()
    db = SessionLocal()
    try:
        notif = DBNotification(
            order_id=order.get("id") if order else None,
            order_code=order.get("order_code") if order else None,
            user_email=email,
            customer_email=email,
            title=title,
            message=message,
            type=notif_type,
            category=category,
            is_read=False,
        )
        db.add(notif)
        db.commit()
        db.refresh(notif)
        return notification_to_dict(notif)
    finally:
        db.close()


def _create_order_notification(order: dict, title: str, message: str, notif_type: str = "order_update", 
                              category: str = "order") -> dict:
    """Create an order-related notification."""
    email = order.get("customer_email") or order.get("user_email")
    if not email:
        return None
    return _create_user_notification(email, title, message, notif_type, category, order)


def _create_broadcast_notification(title: str, message: str, notif_type: str = "broadcast", 
                                   audience: str = "all") -> int:
    """Create broadcast notification for all customers."""
    db = SessionLocal()
    try:
        customer_emails = {
            user.email.strip().lower()
            for user in db.query(DBUser).filter(DBUser.role == "customer").all()
            if user.email
        }
        order_emails = db.query(DBOrder.customer_email).filter(DBOrder.customer_email != "").all()
        for (email,) in order_emails:
            email = str(email or "").strip().lower()
            if not email:
                continue
            user = get_db_user_by_email(db, email)
            if user and user.role != "customer":
                continue
            customer_emails.add(email)

        recipient_count = 0
        for email in customer_emails:
            db.add(DBNotification(
                user_email=email,
                customer_email=email,
                title=title,
                message=message,
                type=notif_type,
                category="broadcast",
                is_read=False,
            ))
            recipient_count += 1
        db.commit()
        return recipient_count
    finally:
        db.close()


def _create_notification(order: dict, notif_type: str, title: str, message: str):
    """Legacy notification creation - delegates to new system."""
    return _create_order_notification(order, title, message, notif_type, "order")

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


def iso(value):
    return value.isoformat() if value else None


def json_load(value, fallback=None):
    if value is None or value == "":
        return fallback
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except Exception:
        return fallback


def json_dump(value):
    if value is None:
        return None
    return json.dumps(value)


async def save_uploaded_image(file: UploadFile, folder: str, prefix: str) -> str:
    allowed_types = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }
    if not file:
        return ""
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, or WEBP images are allowed")

    contents = await file.read()
    max_size = 5 * 1024 * 1024
    if len(contents) > max_size:
        raise HTTPException(status_code=400, detail="Image must be 5MB or smaller")

    os.makedirs(folder, exist_ok=True)
    ext = allowed_types[file.content_type]
    filename = f"{prefix}-{uuid4().hex}{ext}"
    file_path = os.path.join(folder, filename)
    with open(file_path, "wb") as image_file:
        image_file.write(contents)
    public_folder = os.path.relpath(folder, UPLOAD_DIR).replace("\\", "/")
    return f"/uploads/{public_folder}/{filename}"


def db_user_to_dict(user: DBUser) -> dict:
    full_name = user.full_name or "FoodNova User"
    return {
        "id": user.id,
        "full_name": full_name,
        "fullName": full_name,
        "name": full_name,
        "email": user.email,
        "phone": user.phone or "",
        "password": user.password,
        "role": user.role or "customer",
        "created_at": iso(user.created_at),
        "updated_at": iso(user.updated_at),
    }


def product_to_dict(product: DBProduct) -> dict:
    return {
        "id": product.id,
        "name": product.name,
        "price": product.price or 0,
        "stock_qty": product.stock_qty or 0,
        "stock": product.stock if product.stock is not None else (product.stock_qty or 0),
        "category": product.category or "",
        "category_name": product.category_name or product.category or "",
        "image_url": product.image_url or "",
        "description": product.description or "",
        "is_active": bool(product.is_active),
        "active": bool(product.is_active),
        "created_at": iso(product.created_at),
        "updated_at": iso(product.updated_at),
    }


def pack_to_dict(pack: DBPack) -> dict:
    return {
        "id": pack.id,
        "name": pack.name,
        "description": pack.description or "",
        "price": pack.price or 0,
        "is_active": bool(pack.is_active),
        "items": json_load(pack.items, []),
        "image_url": pack.image_url or "",
        "created_at": iso(pack.created_at),
        "active": bool(pack.is_active),
        "updated_at": iso(pack.updated_at),
    }


def profile_to_dict(profile: DBProfile, user: DBUser = None) -> dict:
    user = user or profile.user
    return {
        "user_id": profile.user_id,
        "full_name": profile.full_name or (user.full_name if user else ""),
        "email": user.email if user else "",
        "phone": profile.phone or (user.phone if user else ""),
        "avatar_url": profile.avatar_url or "",
        "default_address_id": profile.default_address_id,
        "created_at": iso(profile.created_at),
        "updated_at": iso(profile.updated_at),
    }


def address_to_dict(address: DBAddress) -> dict:
    return {
        "id": address.id,
        "user_id": address.user_id,
        "label": address.label or "",
        "recipient_name": address.recipient_name or "",
        "phone": address.phone or "",
        "address_line": address.address_line or "",
        "street": address.street or "",
        "area": address.area or "",
        "city": address.city or "",
        "lga": address.lga or "",
        "state": address.state or "",
        "country": address.country or "Nigeria",
        "landmark": address.landmark or "",
        "postal_code": address.postal_code or "",
        "google_place_id": address.google_place_id or "",
        "latitude": address.latitude,
        "longitude": address.longitude,
        "is_default": bool(address.is_default),
        "created_at": iso(address.created_at),
        "updated_at": iso(address.updated_at),
    }


def order_item_to_dict(item: DBOrderItem) -> dict:
    return {
        "id": item.id,
        "product_id": item.product_id,
        "name": item.name or item.product_name or "",
        "product_name": item.product_name or item.name or "",
        "price": item.price or 0,
        "unit_price": item.unit_price or item.price or 0,
        "quantity": item.quantity or item.qty or 1,
        "qty": item.qty or item.quantity or 1,
        "line_total": item.line_total or 0,
    }


def order_to_dict(order: DBOrder) -> dict:
    try:
        items = [order_item_to_dict(item) for item in (order.items or [])]
    except Exception:
        items = []
    return {
        "id": order.id,
        "order_code": order.order_code,
        "items": items,
        "total_amount": order.total_amount or 0,
        "delivery_address": order.delivery_address or "",
        "delivery_address_id": order.delivery_address_id,
        "delivery_address_snapshot": json_load(order.delivery_address_snapshot, None),
        "phone": order.phone or order.customer_phone or "",
        "customer_name": order.customer_name or "",
        "customer_email": order.customer_email or "",
        "customer_phone": order.customer_phone or "",
        "payment_method": order.payment_method or "bank_transfer",
        "delivery_method": order.delivery_method or "delivery",
        "pickup_note": order.pickup_note or "",
        "delivery_notes": order.delivery_notes or "",
        "status": order.status or "pending_payment",
        "payment_status": order.payment_status or "pending_payment",
        "order_status": order.order_status or "order_placed",
        "fulfillment_status": order.fulfillment_status or "order_placed",
        "delivery_code": order.delivery_code,
        "delivery_code_created_at": iso(order.delivery_code_created_at),
        "delivery_confirmed_at": iso(order.delivery_confirmed_at),
        "receipt": json_load(order.receipt, None),
        "admin_note": order.admin_note or "",
        "service_note": order.service_note or "",
        "created_at": iso(order.created_at),
        "updated_at": iso(order.updated_at),
    }


def notification_to_dict(notification: DBNotification) -> dict:
    return {
        "id": notification.id,
        "order_id": notification.order_id,
        "order_code": notification.order_code,
        "user_email": notification.user_email,
        "customer_email": notification.customer_email,
        "title": notification.title,
        "message": notification.message,
        "type": notification.type,
        "category": notification.category,
        "is_read": bool(notification.is_read),
        "created_at": iso(notification.created_at),
    }


def broadcast_to_dict(broadcast: DBBroadcast) -> dict:
    return {
        "id": broadcast.id,
        "title": broadcast.title,
        "message": broadcast.message,
        "type": broadcast.type,
        "audience": broadcast.audience,
        "is_active": bool(broadcast.is_active),
        "recipient_count": broadcast.recipient_count or 0,
        "created_by": broadcast.created_by or "",
        "created_at": iso(broadcast.created_at),
        "updated_at": iso(broadcast.updated_at),
    }


def audit_log_to_dict(log: DBAdminAuditLog) -> dict:
    return {
        "id": log.id,
        "admin_id": log.admin_id,
        "admin_name": log.admin_name or "Admin",
        "admin_email": log.admin_email or "",
        "action": log.action,
        "entity_type": log.entity_type or "",
        "entity_id": log.entity_id or "",
        "description": log.description or "",
        "metadata": json_load(log.metadata_json, {}),
        "ip_address": log.ip_address or "",
        "user_agent": log.user_agent or "",
        "created_at": iso(log.created_at),
    }


def get_db_user_by_email(db, email: str):
    return db.query(DBUser).filter(DBUser.email == str(email).strip().lower()).first()


def ensure_profile(db, user: DBUser) -> DBProfile:
    profile = db.query(DBProfile).filter(DBProfile.user_id == user.id).first()
    if profile:
        return profile
    profile = DBProfile(user_id=user.id, full_name=user.full_name, phone=user.phone or "", avatar_url="")
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def ensure_database_compatibility():
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    table_columns = {
        table_name: {column["name"]: column for column in inspector.get_columns(table_name)}
        for table_name in existing_tables
    }

    column_specs = {
        "users": {
            "full_name": "VARCHAR(150) DEFAULT 'FoodNova User'",
            "phone": "VARCHAR(50) DEFAULT ''",
            "password": "VARCHAR(255) DEFAULT ''",
            "role": "VARCHAR(30) DEFAULT 'customer'",
            "updated_at": "TIMESTAMP",
        },
        "products": {
            "stock_qty": "INTEGER DEFAULT 0",
            "stock": "INTEGER DEFAULT 0",
            "category_name": "VARCHAR(100) DEFAULT ''",
            "image_url": "TEXT DEFAULT ''",
            "description": "TEXT DEFAULT ''",
            "is_active": "BOOLEAN DEFAULT TRUE",
            "updated_at": "TIMESTAMP",
        },
        "orders": {
            "order_code": "VARCHAR(30)",
            "customer_name": "VARCHAR(150) DEFAULT ''",
            "customer_email": "VARCHAR(150) DEFAULT ''",
            "customer_phone": "VARCHAR(50) DEFAULT ''",
            "delivery_address": "TEXT DEFAULT ''",
            "delivery_address_id": "INTEGER",
            "delivery_address_snapshot": "TEXT",
            "phone": "VARCHAR(50) DEFAULT ''",
            "payment_method": "VARCHAR(80) DEFAULT 'bank_transfer'",
            "delivery_method": "VARCHAR(80) DEFAULT 'delivery'",
            "pickup_note": "TEXT DEFAULT ''",
            "delivery_notes": "TEXT DEFAULT ''",
            "total_amount": "FLOAT DEFAULT 0",
            "payment_status": "VARCHAR(80) DEFAULT 'pending_payment'",
            "order_status": "VARCHAR(80) DEFAULT 'order_placed'",
            "fulfillment_status": "VARCHAR(80) DEFAULT 'order_placed'",
            "delivery_code": "VARCHAR(20)",
            "delivery_code_created_at": "TIMESTAMP",
            "delivery_confirmed_at": "TIMESTAMP",
            "receipt": "TEXT",
            "admin_note": "TEXT DEFAULT ''",
            "service_note": "TEXT DEFAULT ''",
            "updated_at": "TIMESTAMP",
        },
        "order_items": {
            "product_id": "INTEGER",
            "name": "VARCHAR(150) DEFAULT ''",
            "product_name": "VARCHAR(150) DEFAULT ''",
            "price": "FLOAT DEFAULT 0",
            "unit_price": "FLOAT DEFAULT 0",
            "quantity": "INTEGER DEFAULT 1",
            "qty": "INTEGER DEFAULT 1",
            "line_total": "FLOAT DEFAULT 0",
        },
    }

    with engine.begin() as connection:
        is_postgres = engine.dialect.name.startswith("postgres")
        for table_name, specs in column_specs.items():
            if table_name not in existing_tables:
                continue
            existing_columns = set(table_columns.get(table_name, {}).keys())
            for column_name, sql_type in specs.items():
                if column_name not in existing_columns:
                    connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {sql_type}"))

        if "users" in existing_tables:
            if is_postgres:
                for column_name in ["name", "password_hash"]:
                    if column_name in table_columns.get("users", {}) and not table_columns["users"][column_name].get("nullable", True):
                        connection.execute(text(f"ALTER TABLE users ALTER COLUMN {column_name} DROP NOT NULL"))
            if "name" in table_columns.get("users", {}):
                connection.execute(text("UPDATE users SET full_name = COALESCE(NULLIF(full_name, ''), name, 'FoodNova User') WHERE full_name IS NULL OR full_name = ''"))
            else:
                connection.execute(text("UPDATE users SET full_name = COALESCE(NULLIF(full_name, ''), 'FoodNova User') WHERE full_name IS NULL OR full_name = ''"))
            if "password_hash" in table_columns.get("users", {}):
                connection.execute(text("UPDATE users SET password = COALESCE(NULLIF(password, ''), password_hash, '') WHERE password IS NULL OR password = ''"))
            else:
                connection.execute(text("UPDATE users SET password = COALESCE(NULLIF(password, ''), '') WHERE password IS NULL OR password = ''"))
            connection.execute(text("UPDATE users SET role = COALESCE(NULLIF(role, ''), 'customer') WHERE role IS NULL OR role = ''"))
        if "products" in existing_tables:
            connection.execute(text("UPDATE products SET stock_qty = COALESCE(stock_qty, stock, 0), stock = COALESCE(stock, stock_qty, 0)"))
            connection.execute(text("UPDATE products SET category_name = COALESCE(NULLIF(category_name, ''), category, '') WHERE category_name IS NULL OR category_name = ''"))
            if "image" in table_columns.get("products", {}):
                connection.execute(text("UPDATE products SET image_url = COALESCE(NULLIF(image_url, ''), image, '') WHERE image_url IS NULL OR image_url = ''"))
            else:
                connection.execute(text("UPDATE products SET image_url = COALESCE(NULLIF(image_url, ''), '') WHERE image_url IS NULL OR image_url = ''"))
        if "orders" in existing_tables:
            if is_postgres:
                if "customer_id" in table_columns.get("orders", {}) and not table_columns["orders"]["customer_id"].get("nullable", True):
                    connection.execute(text("ALTER TABLE orders ALTER COLUMN customer_id DROP NOT NULL"))
                if "status" in table_columns.get("orders", {}):
                    connection.execute(text("ALTER TABLE orders ALTER COLUMN status TYPE VARCHAR(80) USING status::text"))
                connection.execute(text("UPDATE orders SET order_code = COALESCE(NULLIF(order_code, ''), 'FN-' || LPAD(id::text, 5, '0')) WHERE order_code IS NULL OR order_code = ''"))
            else:
                connection.execute(text("UPDATE orders SET order_code = COALESCE(NULLIF(order_code, ''), 'FN-' || printf('%05d', id)) WHERE order_code IS NULL OR order_code = ''"))
            connection.execute(text("UPDATE orders SET payment_status = COALESCE(NULLIF(payment_status, ''), status, 'pending_payment') WHERE payment_status IS NULL OR payment_status = ''"))
            connection.execute(text("UPDATE orders SET order_status = COALESCE(NULLIF(order_status, ''), 'order_placed') WHERE order_status IS NULL OR order_status = ''"))
            connection.execute(text("UPDATE orders SET fulfillment_status = COALESCE(NULLIF(fulfillment_status, ''), order_status, 'order_placed') WHERE fulfillment_status IS NULL OR fulfillment_status = ''"))
        if "order_items" in existing_tables:
            if is_postgres:
                if "product_id" in table_columns.get("order_items", {}) and not table_columns["order_items"]["product_id"].get("nullable", True):
                    connection.execute(text("ALTER TABLE order_items ALTER COLUMN product_id DROP NOT NULL"))
            connection.execute(text("UPDATE order_items SET name = COALESCE(NULLIF(name, ''), product_name, 'FoodNova Item') WHERE name IS NULL OR name = ''"))
            connection.execute(text("UPDATE order_items SET unit_price = COALESCE(unit_price, price, 0), qty = COALESCE(qty, quantity, 1), line_total = COALESCE(line_total, price * quantity, 0)"))


def seed_database():
    try:
        Base.metadata.create_all(bind=engine)
        ensure_database_compatibility()
        db = SessionLocal()
        admin = get_db_user_by_email(db, ADMIN_EMAIL)
        if not admin:
            admin = DBUser(
                full_name="FoodNova Admin",
                email=ADMIN_EMAIL,
                phone="",
                password=ADMIN_PASSWORD,
                role="admin",
            )
            db.add(admin)
        elif not admin.full_name or admin.full_name == "FoodNova User":
            admin.full_name = "FoodNova Admin"
            admin.updated_at = datetime.utcnow()

        if db.query(DBProduct).count() == 0:
            for product in PRODUCTS:
                db.add(DBProduct(
                    name=product.get("name", ""),
                    price=product.get("price", 0),
                    stock_qty=product.get("stock_qty", product.get("stock", 0)),
                    stock=product.get("stock", product.get("stock_qty", 0)),
                    category=product.get("category", ""),
                    category_name=product.get("category_name", product.get("category", "")),
                    image_url=product.get("image_url", ""),
                    description=product.get("description", ""),
                    is_active=product.get("is_active", True),
                ))

        if db.query(DBPack).count() == 0:
            for pack in PACKS:
                db.add(DBPack(
                    name=pack.get("name", ""),
                    description=pack.get("description", ""),
                    price=pack.get("price", 0),
                    image_url=pack.get("image_url", ""),
                    items=json_dump(pack.get("items", [])),
                    is_active=pack.get("is_active", True),
                ))
        db.commit()
        db.close()
    except Exception as error:
        print("DATABASE SEED ERROR:", repr(error))


@app.on_event("startup")
def on_startup():
    seed_database()


@app.get("/")
def root():
    return {"message": "FoodNova API is running", "status": "ok"}


@app.head("/")
def root_head():
    return None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/debug/db")
def debug_db():
    db = SessionLocal()
    try:
        return {
            "success": True,
            "database_url_prefix": engine.url.get_backend_name(),
            "users_count": db.query(DBUser).count(),
            "products_count": db.query(DBProduct).count(),
            "packs_count": db.query(DBPack).count(),
            "orders_count": db.query(DBOrder).count(),
            "notifications_count": db.query(DBNotification).count(),
            "broadcasts_count": db.query(DBBroadcast).count(),
        }
    except Exception as error:
        return {
            "success": False,
            "database_url_prefix": engine.url.get_backend_name(),
            "error": repr(error),
        }
    finally:
        db.close()


@app.get("/categories")
def list_categories():
    db = SessionLocal()
    try:
        products = db.query(DBProduct).all()
        categories = sorted({p.category or p.category_name for p in products if p.category or p.category_name})
        return [{"id": idx + 1, "name": category} for idx, category in enumerate(categories)]
    finally:
        db.close()


@app.get("/products")
def list_products(search: Optional[str] = None):
    db = SessionLocal()
    try:
        products = [product_to_dict(product) for product in db.query(DBProduct).all()]
        if not search:
            return products

        search_lower = search.lower()
        return [
            product for product in products
            if search_lower in product.get("name", "").lower()
            or search_lower in product.get("category", "").lower()
            or search_lower in product.get("category_name", "").lower()
        ]
    except Exception as error:
        print("PRODUCTS LOAD ERROR:", repr(error))
        return []
    finally:
        db.close()


@app.get("/products/{product_id}")
def get_product(product_id: int):
    db = SessionLocal()
    try:
        product = db.query(DBProduct).filter(DBProduct.id == product_id).first()
        if product:
            return product_to_dict(product)
    finally:
        db.close()

    raise HTTPException(status_code=404, detail="Product not found")


@app.get("/packs")
def list_packs(search: Optional[str] = None):
    db = SessionLocal()
    try:
        packs = [pack_to_dict(pack) for pack in db.query(DBPack).all()]
        if not search:
            return packs

        search_lower = search.lower()
        return [
            pack for pack in packs
            if search_lower in pack.get("name", "").lower()
            or search_lower in pack.get("description", "").lower()
            or any(search_lower in str(item).lower() for item in pack.get("items", []))
        ]
    except Exception as error:
        print("PACKS LOAD ERROR:", repr(error))
        return []
    finally:
        db.close()


@app.get("/packs/{pack_id}")
def get_pack(pack_id: int):
    db = SessionLocal()
    try:
        pack = db.query(DBPack).filter(DBPack.id == pack_id).first()
        if pack:
            return pack_to_dict(pack)
    finally:
        db.close()

    raise HTTPException(status_code=404, detail="Pack not found")


@app.post("/auth/register")
def register(payload: RegisterPayload):
    email = payload.email.lower().strip()
    db = SessionLocal()
    try:
        if get_db_user_by_email(db, email):
            raise HTTPException(status_code=400, detail="Email already registered")

        confirm = payload.confirm_password or payload.confirmPassword

        if confirm and confirm != payload.password:
            raise HTTPException(status_code=400, detail="Passwords do not match")

        full_name = payload.full_name or payload.fullName or payload.name or "FoodNova Customer"

        user = DBUser(
            full_name=full_name,
            email=email,
            phone=payload.phone or "",
            password=_hash_new_password(payload.password),
            role="customer",
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        db.add(DBProfile(
            user_id=user.id,
            full_name=full_name,
            phone=user.phone or "",
            avatar_url="",
            default_address_id=None,
        ))
        db.commit()

        token = f"token-{uuid4()}"
        TOKENS[token] = email

        return auth_response("Registration successful", db_user_to_dict(user), token)
    finally:
        db.close()


@app.post("/auth/login")
def login(payload: LoginPayload, request: Request):
    email = payload.email.lower().strip()
    db = SessionLocal()
    try:
        user = get_db_user_by_email(db, email)

        if not user or not _password_matches(payload.password, user.password):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        ensure_profile(db, user)
        token = f"token-{uuid4()}"
        TOKENS[token] = email

        user_data = db_user_to_dict(user)
        if user_data.get("role") == "admin":
            create_admin_audit_log(
                request,
                user_data,
                "admin_login",
                "admin",
                user_data.get("id"),
                "Admin logged in",
            )
        return auth_response("Login successful", user_data, token)
    finally:
        db.close()


@app.post("/register")
def register_fallback(payload: RegisterPayload):
    return register(payload)


@app.post("/login")
def login_fallback(payload: LoginPayload, request: Request):
    return login(payload, request)


@app.post("/auth/change-password")
def change_password(request: Request, payload: ChangePasswordPayload):
    user = require_user(request)

    if user.get("role") == "admin":
        raise HTTPException(status_code=403, detail="Admins cannot use customer password changes")

    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="New passwords do not match")

    if len(payload.new_password or "") < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")

    email = user.get("email")
    db = SessionLocal()
    try:
        db_user = get_db_user_by_email(db, email)
        if not db_user or not _password_matches(payload.current_password, db_user.password):
            raise HTTPException(status_code=400, detail="Current password is incorrect")

        db_user.password = _hash_new_password(payload.new_password)
        db_user.updated_at = datetime.utcnow()
        db.commit()
    finally:
        db.close()

    return {"success": True, "message": "Password changed successfully"}


@app.get("/auth/me")
def me(request: Request):
    user = require_user(request)
    return {"success": True, "user": public_user(user), "data": public_user(user)}


@app.get("/profile")
def get_profile(request: Request):
    user = require_user(request)
    db = SessionLocal()
    try:
        db_user = get_db_user_by_email(db, user.get("email"))
        if not db_user:
            raise HTTPException(status_code=401, detail="Unauthorized")
        profile = ensure_profile(db, db_user)
        addresses = db.query(DBAddress).filter(DBAddress.user_id == db_user.id).all()
        profile_data = profile_to_dict(profile, db_user)
        address_data = [address_to_dict(address) for address in addresses]
        return {"success": True, "profile": profile_data, "addresses": address_data, "data": {"profile": profile_data, "addresses": address_data}}
    finally:
        db.close()


@app.patch("/profile")
def update_profile(request: Request, payload: ProfileUpdatePayload):
    user = require_user(request)
    db = SessionLocal()
    try:
        db_user = get_db_user_by_email(db, user.get("email"))
        if not db_user:
            raise HTTPException(status_code=401, detail="Unauthorized")
        profile = ensure_profile(db, db_user)
        if payload.full_name:
            profile.full_name = payload.full_name
            db_user.full_name = payload.full_name
        if payload.phone is not None:
            profile.phone = payload.phone
            db_user.phone = payload.phone
        if payload.avatar_url is not None:
            profile.avatar_url = payload.avatar_url
        profile.updated_at = datetime.utcnow()
        db_user.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(profile)
        profile_data = profile_to_dict(profile, db_user)
        return {"success": True, "profile": profile_data, "data": profile_data}
    finally:
        db.close()


@app.post("/profile/avatar")
async def upload_profile_avatar(request: Request, file: UploadFile = File(...)):
    user = require_user(request)
    avatar_url = await save_uploaded_image(file, AVATAR_UPLOAD_DIR, f"avatar-{user.get('id')}")
    db = SessionLocal()
    try:
        db_user = get_db_user_by_email(db, user.get("email"))
        if not db_user:
            raise HTTPException(status_code=401, detail="Unauthorized")
        profile = ensure_profile(db, db_user)
        profile.avatar_url = avatar_url
        profile.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(profile)
        profile_data = profile_to_dict(profile, db_user)
        return {
            "success": True,
            "avatar_url": avatar_url,
            "profile": profile_data,
            "data": {
                "avatar_url": avatar_url,
                "profile": profile_data,
            },
        }
    finally:
        db.close()


@app.get("/profile/addresses")
def get_addresses(request: Request):
    user = require_user(request)
    db = SessionLocal()
    try:
        db_user = get_db_user_by_email(db, user.get("email"))
        addresses = [address_to_dict(address) for address in db.query(DBAddress).filter(DBAddress.user_id == db_user.id).all()]
        return {"success": True, "addresses": addresses, "data": addresses}
    finally:
        db.close()


@app.post("/profile/addresses")
def create_address(request: Request, payload: AddressPayload):
    user = require_user(request)
    db = SessionLocal()
    try:
        db_user = get_db_user_by_email(db, user.get("email"))
        profile = ensure_profile(db, db_user)
        data = payload.dict()
        if data.get("is_default"):
            db.query(DBAddress).filter(DBAddress.user_id == db_user.id).update({"is_default": False})
        address = DBAddress(user_id=db_user.id, **data)
        db.add(address)
        db.commit()
        db.refresh(address)
        if address.is_default:
            profile.default_address_id = address.id
            profile.updated_at = datetime.utcnow()
            db.commit()
        addr = address_to_dict(address)
        return {"success": True, "address": addr, "data": addr}
    finally:
        db.close()


@app.patch("/profile/addresses/{address_id}")
def update_address(address_id: int, request: Request, payload: AddressPayload):
    user = require_user(request)
    db = SessionLocal()
    try:
        db_user = get_db_user_by_email(db, user.get("email"))
        address = db.query(DBAddress).filter(DBAddress.id == address_id, DBAddress.user_id == db_user.id).first()
        if not address:
            raise HTTPException(status_code=404, detail="Address not found")
        data = payload.dict()
        for key, value in data.items():
            if value is not None:
                setattr(address, key, value)
        if address.is_default:
            db.query(DBAddress).filter(DBAddress.user_id == db_user.id, DBAddress.id != address.id).update({"is_default": False})
            profile = ensure_profile(db, db_user)
            profile.default_address_id = address.id
        address.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(address)
        updated = address_to_dict(address)
        return {"success": True, "address": updated, "data": updated}
    finally:
        db.close()


@app.delete("/profile/addresses/{address_id}")
def delete_address(address_id: int, request: Request):
    user = require_user(request)
    db = SessionLocal()
    try:
        db_user = get_db_user_by_email(db, user.get("email"))
        address = db.query(DBAddress).filter(DBAddress.id == address_id, DBAddress.user_id == db_user.id).first()
        if not address:
            raise HTTPException(status_code=404, detail="Address not found")
        removed = address_to_dict(address)
        profile = ensure_profile(db, db_user)
        if profile.default_address_id == address_id:
            profile.default_address_id = None
        db.delete(address)
        db.commit()
        return {"success": True, "address": removed, "data": removed}
    finally:
        db.close()


@app.patch("/profile/addresses/{address_id}/default")
def set_default_address(address_id: int, request: Request):
    user = require_user(request)
    db = SessionLocal()
    try:
        db_user = get_db_user_by_email(db, user.get("email"))
        address = db.query(DBAddress).filter(DBAddress.id == address_id, DBAddress.user_id == db_user.id).first()
        if not address:
            raise HTTPException(status_code=404, detail="Address not found")
        db.query(DBAddress).filter(DBAddress.user_id == db_user.id).update({"is_default": False})
        address.is_default = True
        profile = ensure_profile(db, db_user)
        profile.default_address_id = address_id
        profile.updated_at = datetime.utcnow()
        db.commit()
        return {"success": True, "default_address_id": address_id, "data": {"default_address_id": address_id}}
    finally:
        db.close()




@app.get("/notifications")
def get_notifications(request: Request):
    user = require_user(request)
    email = user.get("email")
    db = SessionLocal()
    try:
        items = [
            notification_to_dict(notification)
            for notification in db.query(DBNotification)
            .filter(DBNotification.user_email == email, DBNotification.deleted_at.is_(None))
            .order_by(DBNotification.created_at.desc(), DBNotification.id.desc())
            .all()
        ]
        return {"success": True, "notifications": items, "data": items}
    except Exception as error:
        print("NOTIFICATIONS LOAD ERROR:", repr(error))
        return {"success": True, "notifications": [], "data": []}
    finally:
        db.close()


@app.get("/notifications/unread-count")
def unread_count(request: Request):
    user = require_user(request)
    email = user.get("email")
    db = SessionLocal()
    try:
        count = db.query(DBNotification).filter(
            DBNotification.user_email == email,
            DBNotification.deleted_at.is_(None),
            DBNotification.is_read.is_(False),
        ).count()
        return {"success": True, "count": count, "data": {"count": count}}
    finally:
        db.close()


@app.patch("/notifications/{notification_id}/read")
def mark_notification_read(notification_id: int, request: Request):
    user = require_user(request)
    email = user.get("email")
    db = SessionLocal()
    try:
        notification = db.query(DBNotification).filter(
            DBNotification.id == notification_id,
            DBNotification.user_email == email,
            DBNotification.deleted_at.is_(None),
        ).first()
        if not notification:
            raise HTTPException(status_code=404, detail="Notification not found")
        notification.is_read = True
        db.commit()
        db.refresh(notification)
        data = notification_to_dict(notification)
        return {"success": True, "notification": data, "data": data}
    finally:
        db.close()


@app.patch("/notifications/read-all")
def mark_all_notifications_read(request: Request):
    user = require_user(request)
    email = user.get("email")
    db = SessionLocal()
    try:
        db.query(DBNotification).filter(
            DBNotification.user_email == email,
            DBNotification.deleted_at.is_(None),
        ).update({"is_read": True})
        db.commit()
        return {"success": True, "message": "Notifications marked as read"}
    finally:
        db.close()


@app.delete("/notifications/{notification_id}")
def delete_notification(notification_id: int, request: Request):
    user = require_user(request)
    email = user.get("email")
    db = SessionLocal()
    try:
        notification = db.query(DBNotification).filter(
            DBNotification.id == notification_id,
            DBNotification.user_email == email,
            DBNotification.deleted_at.is_(None),
        ).first()
        if not notification:
            raise HTTPException(status_code=404, detail="Notification not found")
        notification.deleted_at = datetime.utcnow()
        db.commit()
        data = notification_to_dict(notification)
        return {
            "success": True,
            "message": "Notification deleted",
            "notification": data,
            "data": data,
        }
    finally:
        db.close()


@app.delete("/notifications")
def clear_notifications(request: Request):
    user = require_user(request)
    email = user.get("email")
    db = SessionLocal()
    try:
        db.query(DBNotification).filter(
            DBNotification.user_email == email,
            DBNotification.deleted_at.is_(None),
        ).update({"deleted_at": datetime.utcnow()})
        db.commit()
        return {"success": True, "message": "Notifications cleared", "data": []}
    finally:
        db.close()

@app.post("/orders")
def create_order(payload: OrderPayload, request: Request):
    normalized_items = normalize_order_items(payload.items or [])
    # Attempt to enrich with user/profile data when available
    auth = request.headers.get("authorization")
    current_user = _get_user_from_token(auth)
    customer_name = payload.customer_name or (current_user.get("full_name") if current_user else "FoodNova Customer")
    customer_email = payload.customer_email or (current_user.get("email") if current_user else "")
    customer_phone = payload.customer_phone or (current_user.get("phone") if current_user else "")

    db = SessionLocal()
    try:
        next_id = (db.query(DBOrder).order_by(DBOrder.id.desc()).first().id + 1) if db.query(DBOrder).first() else 1
        order = DBOrder(
            order_code=f"FN-{next_id:05d}",
            total_amount=payload.total_amount or payload.total or sum(item["line_total"] for item in normalized_items),
            delivery_address=payload.delivery_address or payload.address or "",
            delivery_address_id=payload.delivery_address_id if getattr(payload, 'delivery_address_id', None) else None,
            delivery_address_snapshot=json_dump(payload.delivery_address_snapshot) if payload.delivery_address_snapshot else None,
            phone=payload.phone or customer_phone or "",
            customer_name=customer_name,
            customer_email=(customer_email or "").strip().lower(),
            customer_phone=customer_phone or "",
            payment_method=payload.payment_method or "bank_transfer",
            delivery_method=payload.delivery_method or "delivery",
            pickup_note=payload.pickup_note or "",
            delivery_notes=payload.delivery_notes or "",
            status="pending_payment",
            payment_status="pending_payment",
            order_status="order_placed",
            fulfillment_status="order_placed",
        )
        db.add(order)
        db.commit()
        db.refresh(order)

        for item in normalized_items:
            db.add(DBOrderItem(
                order_id=order.id,
                product_id=item.get("product_id"),
                name=item.get("name", ""),
                product_name=item.get("product_name", ""),
                price=item.get("price", 0),
                unit_price=item.get("unit_price", item.get("price", 0)),
                quantity=item.get("quantity", 1),
                qty=item.get("qty", item.get("quantity", 1)),
                line_total=item.get("line_total", 0),
            ))
        db.commit()
        db.refresh(order)
        order_data = order_to_dict(order)
    finally:
        db.close()

    if order_data.get("customer_email"):
        _create_order_notification(
            order_data,
            "Order Placed",
            f"Your order {order_data.get('order_code')} has been placed successfully. Use your order code as payment narration, then upload your receipt.",
            "order_update",
            "order",
        )

    return {
        "success": True,
        "message": "Order created successfully",
        "order": order_data,
        "data": order_data,
    }


@app.get("/orders/my")
def my_orders(request: Request):
    user = require_user(request)
    email = user.get("email")
    db = SessionLocal()
    try:
        orders = [
            order_to_dict(order)
            for order in db.query(DBOrder).filter(DBOrder.customer_email == email).order_by(DBOrder.created_at.desc(), DBOrder.id.desc()).all()
        ]
        return {"success": True, "orders": orders, "data": orders}
    except Exception as error:
        print("CUSTOMER ORDERS LOAD ERROR:", repr(error))
        return {"success": True, "orders": [], "data": []}
    finally:
        db.close()


@app.get("/orders")
def all_orders():
    db = SessionLocal()
    try:
        orders = [order_to_dict(order) for order in db.query(DBOrder).order_by(DBOrder.created_at.desc(), DBOrder.id.desc()).all()]
        return {"success": True, "orders": orders, "data": orders}
    except Exception as error:
        print("ORDERS LOAD ERROR:", repr(error))
        return {"success": True, "orders": [], "data": []}
    finally:
        db.close()


@app.get("/orders/{order_id}")
def get_order(order_id: int):
    db = SessionLocal()
    try:
        order = db.query(DBOrder).filter(DBOrder.id == order_id).first()
        if order:
            data = order_to_dict(order)
            return {"success": True, "order": data, "data": data}
    finally:
        db.close()

    raise HTTPException(status_code=404, detail="Order not found")


@app.post("/orders/{order_id}/receipt")
async def upload_receipt(order_id: int, file: UploadFile = File(...)):
    db = SessionLocal()
    try:
        order = db.query(DBOrder).filter(DBOrder.id == order_id).first()
        if order:
            receipt = {
                "filename": file.filename,
                "status": "submitted",
                "uploaded_at": datetime.utcnow().isoformat(),
            }
            order.receipt = json_dump(receipt)
            order.status = "receipt_submitted"
            order.payment_status = "receipt_submitted"
            order.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(order)
            order_data = order_to_dict(order)

            _create_order_notification(
                order_data,
                "Receipt Received",
                f"Your payment receipt for order {order_data.get('order_code')} has been received and is awaiting approval.",
                "payment_update",
                "payment"
            )

            return {
                "success": True,
                "message": "Receipt uploaded successfully",
                "receipt": receipt,
                "data": receipt,
            }
    finally:
        db.close()

    raise HTTPException(status_code=404, detail="Order not found")


@app.get("/admin/orders")
def admin_orders(request: Request):
    require_admin(request)
    db = SessionLocal()
    try:
        orders = [order_to_dict(order) for order in db.query(DBOrder).order_by(DBOrder.created_at.desc(), DBOrder.id.desc()).all()]
        return {"success": True, "orders": orders, "data": orders}
    except Exception as error:
        print("ADMIN ORDERS LOAD ERROR:", repr(error))
        return {"success": True, "orders": [], "data": []}
    finally:
        db.close()


@app.get("/admin/orders/{order_id}")
def admin_get_order(order_id: int, request: Request):
    require_admin(request)
    db = SessionLocal()
    try:
        order = db.query(DBOrder).filter(DBOrder.id == order_id).first()
        if order:
            data = order_to_dict(order)
            return {"success": True, "order": data, "data": data}
    finally:
        db.close()

    raise HTTPException(status_code=404, detail="Order not found")


@app.patch("/admin/orders/{order_id}")
def update_order(order_id: int, payload: dict, request: Request):
    admin = require_admin(request)
    db = SessionLocal()
    try:
        order = db.query(DBOrder).filter(DBOrder.id == order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        old_status = order.status
        old_payment_status = order.payment_status
        old_order_status = order.order_status
        old_fulfillment_status = order.fulfillment_status
        old_admin_note = order.admin_note
        old_service_note = order.service_note

        generated_delivery_code = False
        new_status = payload.get("status") or payload.get("order_status") or payload.get("fulfillment_status")
        if new_status == "out_for_delivery" and order.delivery_method == "delivery" and not order.delivery_code:
            order.delivery_code = "{:06d}".format(random.randint(0, 999999))
            order.delivery_code_created_at = datetime.utcnow()
            generated_delivery_code = True

        allowed_fields = {
            "customer_name", "customer_email", "customer_phone", "delivery_address", "delivery_address_id",
            "phone", "payment_method", "delivery_method", "pickup_note", "delivery_notes", "total_amount",
            "status", "payment_status", "order_status", "fulfillment_status", "admin_note", "service_note",
        }
        for key, value in payload.items():
            if key in allowed_fields:
                setattr(order, key, value)
            elif key == "delivery_address_snapshot":
                order.delivery_address_snapshot = json_dump(value)
            elif key == "receipt":
                order.receipt = json_dump(value)
        order.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(order)
        order_data = order_to_dict(order)

        if order_data.get("customer_email"):
            notified_statuses = set()
            notified_payment_statuses = set()
            order_code = order_data.get("order_code")

            def notify_payment_status(status_value: str):
                if not status_value or status_value in notified_payment_statuses:
                    return
                notified_payment_statuses.add(status_value)
                if status_value == "receipt_submitted":
                    _create_order_notification(order_data, "Receipt Submitted",
                        f"Your receipt for order {order_code} has been submitted and is awaiting review.",
                        "payment_update", "payment")
                elif status_value == "payment_confirmed":
                    _create_order_notification(order_data, "Payment Confirmed",
                        f"Your payment for order {order_code} has been confirmed.",
                        "payment_update", "payment")
                elif status_value == "payment_rejected":
                    _create_order_notification(order_data, "Payment Rejected",
                        f"Your payment for order {order_code} was rejected. Please upload a clearer receipt or contact support.",
                        "payment_update", "payment")

            def notify_order_status(status_value: str):
                if not status_value or status_value in notified_statuses:
                    return
                notified_statuses.add(status_value)
                if status_value == "processing":
                    _create_order_notification(order_data, "Order Processing",
                        f"Your order {order_code} is now being processed.",
                        "order_update", "order")
                elif status_value == "ready_for_pickup":
                    _create_order_notification(order_data, "Ready for Pickup",
                        f"Your order {order_code} is ready for pickup.",
                        "order_update", "order")
                elif status_value == "out_for_delivery":
                    _create_order_notification(order_data, "Out for Delivery",
                        f"Your order {order_code} is out for delivery. The dispatch rider will provide the delivery confirmation code when they arrive. Enter it in the app only after you have received your order.",
                        "delivery_update", "delivery")
                elif status_value == "delivered":
                    _create_order_notification(order_data, "Order Delivered",
                        f"Your order {order_code} has been marked as delivered.",
                        "delivery_update", "delivery")

            if order.payment_status != old_payment_status:
                notify_payment_status(order.payment_status)
            if order.order_status != old_order_status:
                notify_order_status(order.order_status)
            if order.fulfillment_status != old_fulfillment_status:
                notify_order_status(order.fulfillment_status)
            if order.status != old_status:
                notify_payment_status(order.status)
                notify_order_status(order.status)
            if order.service_note and order.service_note != old_service_note:
                _create_order_notification(order_data, "FoodNova Service Update",
                    f"Your order {order_code} update: {order.service_note}",
                    "service_update", "service")
            if order.admin_note and order.admin_note != old_admin_note:
                _create_order_notification(order_data, "FoodNova Service Update",
                    f"Your order {order_code} update: {order.admin_note}",
                    "service_update", "service")

        changed_fields = {}
        for field, old_value, new_value in [
            ("status", old_status, order.status),
            ("payment_status", old_payment_status, order.payment_status),
            ("order_status", old_order_status, order.order_status),
            ("fulfillment_status", old_fulfillment_status, order.fulfillment_status),
            ("admin_note", old_admin_note, order.admin_note),
            ("service_note", old_service_note, order.service_note),
        ]:
            if old_value != new_value:
                changed_fields[field] = {"old": old_value, "new": new_value}

        if changed_fields:
            create_admin_audit_log(
                request,
                admin,
                "order_updated",
                "order",
                order.id,
                f"Admin updated order {order.order_code}",
                {"order_code": order.order_code, "changes": changed_fields},
            )
        if order.payment_status != old_payment_status and order.payment_status == "payment_confirmed":
            create_admin_audit_log(request, admin, "payment_confirmed", "order", order.id, f"Admin confirmed payment for order {order.order_code}", {"order_code": order.order_code})
        if order.payment_status != old_payment_status and order.payment_status == "payment_rejected":
            create_admin_audit_log(request, admin, "payment_rejected", "order", order.id, f"Admin rejected payment for order {order.order_code}", {"order_code": order.order_code})
        if generated_delivery_code:
            create_admin_audit_log(request, admin, "delivery_code_generated", "order", order.id, f"Admin generated delivery code for order {order.order_code}", {"order_code": order.order_code})

        return {
            "success": True,
            "message": "Order updated successfully",
            "order": order_data,
            "data": order_data,
        }
    finally:
        db.close()


@app.post("/orders/{order_id}/confirm-delivery")
def confirm_delivery(order_id: int, payload: dict):
    db = SessionLocal()
    try:
        order = db.query(DBOrder).filter(DBOrder.id == order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        delivery_code = str(payload.get("delivery_code", "")).strip()
        stored_code = str(order.delivery_code or "").strip()

        if not stored_code:
            raise HTTPException(status_code=400, detail="No delivery code generated for this order")

        if delivery_code != stored_code:
            raise HTTPException(status_code=400, detail="Invalid delivery confirmation code")

        order.status = "delivered"
        order.order_status = "delivered"
        order.fulfillment_status = "delivered"
        order.delivery_confirmed_at = datetime.utcnow()
        order.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(order)
        data = order_to_dict(order)
        return {
            "success": True,
            "message": "Delivery confirmed successfully",
            "order": data,
            "data": data,
        }
    finally:
        db.close()


@app.get("/admin/products")
def admin_products(request: Request):
    require_admin(request)
    products = list_products()
    return {"success": True, "products": products, "data": products}


@app.post("/admin/products")
async def admin_create_product(
    request: Request,
    name: str = Form(""),
    price: float = Form(0),
    stock_qty: int = Form(0),
    category: str = Form(""),
    is_active: bool = Form(True),
    active: Optional[bool] = Form(None),
    description: str = Form(""),
    image: Optional[UploadFile] = File(None),
):
    admin = require_admin(request)
    image_url = await save_uploaded_image(image, PRODUCT_UPLOAD_DIR, "product") if image else ""
    db = SessionLocal()
    try:
        product = DBProduct(
            name=name,
            price=float(price or 0),
            stock_qty=stock_qty,
            stock=stock_qty,
            category=category,
            category_name=category,
            image_url=image_url,
            description=description,
            is_active=is_active if active is None else active,
        )
        db.add(product)
        db.commit()
        db.refresh(product)
        data = product_to_dict(product)
        create_admin_audit_log(request, admin, "product_created", "product", product.id, f"Admin created product {product.name}", {"product": data})
        return {
            "success": True,
            "message": "Product created successfully",
            "product": data,
            "data": data,
        }
    finally:
        db.close()


@app.patch("/admin/products/{product_id}")
async def admin_update_product(
    product_id: int,
    request: Request,
    name: Optional[str] = Form(None),
    price: Optional[float] = Form(None),
    stock_qty: Optional[int] = Form(None),
    category: Optional[str] = Form(None),
    is_active: Optional[bool] = Form(None),
    active: Optional[bool] = Form(None),
    description: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
):
    admin = require_admin(request)
    db = SessionLocal()
    try:
        product = db.query(DBProduct).filter(DBProduct.id == product_id).first()
        if product:
            old_data = product_to_dict(product)
            if name is not None:
                product.name = name
            if category is not None:
                product.category = category
                product.category_name = category
            if description is not None:
                product.description = description
            if price is not None:
                product.price = float(price or 0)
            if stock_qty is not None:
                product.stock_qty = int(stock_qty or 0)
                product.stock = int(stock_qty or 0)
            if is_active is not None or active is not None:
                product.is_active = is_active if active is None else active
            if image:
                product.image_url = await save_uploaded_image(image, PRODUCT_UPLOAD_DIR, "product")
            product.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(product)
            data = product_to_dict(product)
            create_admin_audit_log(request, admin, "product_updated", "product", product.id, f"Admin updated product {product.name}", {"before": old_data, "after": data})
            return {
                "success": True,
                "message": "Product updated successfully",
                "product": data,
                "data": data,
            }
    finally:
        db.close()

    raise HTTPException(status_code=404, detail="Product not found")


@app.delete("/admin/products/{product_id}")
def admin_delete_product(product_id: int, request: Request):
    admin = require_admin(request)
    db = SessionLocal()
    try:
        product = db.query(DBProduct).filter(DBProduct.id == product_id).first()
        if product:
            data = product_to_dict(product)
            db.delete(product)
            db.commit()
            create_admin_audit_log(request, admin, "product_deleted", "product", product_id, f"Admin deleted product {data.get('name')}", {"product": data})
            return {
                "success": True,
                "message": "Product deleted successfully",
                "product": data,
                "data": data,
            }
    finally:
        db.close()

    raise HTTPException(status_code=404, detail="Product not found")


@app.get("/admin/packs")
def admin_packs(request: Request):
    require_admin(request)
    packs = list_packs()
    return {"success": True, "packs": packs, "data": packs}


@app.post("/admin/packs")
async def admin_create_pack(
    request: Request,
    name: str = Form(""),
    price: float = Form(0),
    description: str = Form(""),
    items: str = Form("[]"),
    is_active: bool = Form(True),
    active: Optional[bool] = Form(None),
    image: Optional[UploadFile] = File(None),
):
    admin = require_admin(request)
    image_url = await save_uploaded_image(image, PACK_UPLOAD_DIR, "pack") if image else ""
    parsed_items = json_load(items, None)
    if parsed_items is None:
        parsed_items = [item.strip() for item in str(items).split(",") if item.strip()]
    db = SessionLocal()
    try:
        pack = DBPack(
            name=name,
            description=description,
            price=float(price or 0),
            is_active=is_active if active is None else active,
            items=json_dump(parsed_items),
            image_url=image_url,
        )
        db.add(pack)
        db.commit()
        db.refresh(pack)
        data = pack_to_dict(pack)
        create_admin_audit_log(request, admin, "pack_created", "pack", pack.id, f"Admin created pack {pack.name}", {"pack": data})
        return {
            "success": True,
            "message": "Pack created successfully",
            "pack": data,
            "data": data,
        }
    finally:
        db.close()


@app.patch("/admin/packs/{pack_id}")
async def admin_update_pack(
    pack_id: int,
    request: Request,
    name: Optional[str] = Form(None),
    price: Optional[float] = Form(None),
    description: Optional[str] = Form(None),
    items: Optional[str] = Form(None),
    is_active: Optional[bool] = Form(None),
    active: Optional[bool] = Form(None),
    image: Optional[UploadFile] = File(None),
):
    admin = require_admin(request)
    db = SessionLocal()
    try:
        pack = db.query(DBPack).filter(DBPack.id == pack_id).first()
        if pack:
            old_data = pack_to_dict(pack)
            if name is not None:
                pack.name = name
            if description is not None:
                pack.description = description
            if price is not None:
                pack.price = float(price or 0)
            if items is not None:
                parsed_items = json_load(items, None)
                if parsed_items is None:
                    parsed_items = [item.strip() for item in str(items).split(",") if item.strip()]
                pack.items = json_dump(parsed_items)
            if is_active is not None or active is not None:
                pack.is_active = is_active if active is None else active
            if image:
                pack.image_url = await save_uploaded_image(image, PACK_UPLOAD_DIR, "pack")
            pack.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(pack)
            data = pack_to_dict(pack)
            create_admin_audit_log(request, admin, "pack_updated", "pack", pack.id, f"Admin updated pack {pack.name}", {"before": old_data, "after": data})
            return {
                "success": True,
                "message": "Pack updated successfully",
                "pack": data,
                "data": data,
            }
    finally:
        db.close()

    raise HTTPException(status_code=404, detail="Pack not found")


@app.delete("/admin/packs/{pack_id}")
def admin_delete_pack(pack_id: int, request: Request):
    admin = require_admin(request)
    db = SessionLocal()
    try:
        pack = db.query(DBPack).filter(DBPack.id == pack_id).first()
        if pack:
            data = pack_to_dict(pack)
            db.delete(pack)
            db.commit()
            create_admin_audit_log(request, admin, "pack_deleted", "pack", pack_id, f"Admin deleted pack {data.get('name')}", {"pack": data})
            return {
                "success": True,
                "message": "Pack deleted successfully",
                "pack": data,
                "data": data,
            }
    finally:
        db.close()

    raise HTTPException(status_code=404, detail="Pack not found")


@app.get("/admin/customers")
def admin_customers(request: Request):
    require_admin(request)

    db = SessionLocal()
    try:
        customers = db.query(DBUser).filter(DBUser.role == "customer").all()
        result = []

        for customer in customers:
            profile = db.query(DBProfile).filter(DBProfile.user_id == customer.id).first()
            addresses = db.query(DBAddress).filter(DBAddress.user_id == customer.id).all()
            default_address = None

            if profile and profile.default_address_id:
                default_address = (
                    db.query(DBAddress)
                    .filter(
                        DBAddress.id == profile.default_address_id,
                        DBAddress.user_id == customer.id,
                    )
                    .first()
                )

            if not default_address and addresses:
                default_address = next((a for a in addresses if a.is_default), addresses[0])

            orders = (
                db.query(DBOrder)
                .filter(DBOrder.customer_email == customer.email)
                .order_by(DBOrder.created_at.desc())
                .all()
            )

            total_spent = sum(float(order.total_amount or 0) for order in orders)
            last_order = orders[0] if orders else None

            address_data = address_to_dict(default_address) if default_address else None

            result.append({
                "id": customer.id,
                "full_name": customer.full_name or "Customer",
                "name": customer.full_name or "Customer",
                "email": customer.email,
                "phone": customer.phone or (profile.phone if profile else "") or "",
                "address": address_data,
                "delivery_address": address_data,
                "addresses": [address_to_dict(address) for address in addresses],
                "orders_count": len(orders),
                "total_orders": len(orders),
                "total_spent": total_spent,
                "revenue": total_spent,
                "last_order_at": iso(last_order.created_at) if last_order else None,
                "last_order_code": last_order.order_code if last_order else "",
                "created_at": iso(customer.created_at),
                "updated_at": iso(customer.updated_at),
            })

        return {
            "success": True,
            "customers": result,
            "data": result,
        }
    except Exception as error:
        print("ADMIN CUSTOMERS LOAD ERROR:", repr(error))
        return {"success": True, "customers": [], "data": []}
    finally:
        db.close()


# ============================================
# BROADCAST ENDPOINTS
# ============================================

@app.post("/admin/broadcasts")
def create_broadcast(payload: BroadcastPayload, request: Request):
    """Create and send a broadcast message to all customers."""
    user = require_admin(request)
    
    title = payload.title.strip()
    message = payload.message.strip()
    notif_type = (payload.type or "broadcast").strip() or "broadcast"
    audience = (payload.audience or "all").strip() or "all"
    
    if not title or not message:
        raise HTTPException(status_code=400, detail="Title and message are required")
    
    db = SessionLocal()
    try:
        broadcast = DBBroadcast(
            title=title,
            message=message,
            type=notif_type,
            audience=audience,
            is_active=payload.is_active is not False,
            recipient_count=0,
            created_by=user.get("email"),
        )
        db.add(broadcast)
        db.commit()
        db.refresh(broadcast)

        recipient_count = _create_broadcast_notification(title, message, notif_type, audience)
        broadcast.recipient_count = recipient_count
        broadcast.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(broadcast)
        broadcast_data = broadcast_to_dict(broadcast)
        create_admin_audit_log(
            request,
            user,
            "broadcast_sent",
            "broadcast",
            broadcast.id,
            f"Admin sent broadcast {title}",
            {"broadcast": broadcast_data, "recipient_count": recipient_count},
        )
    finally:
        db.close()
    
    return {
        "success": True,
        "message": "Broadcast sent successfully",
        "broadcast": broadcast_data,
        "recipient_count": recipient_count,
        "data": broadcast_data,
    }


@app.get("/admin/broadcasts")
def get_broadcasts(request: Request):
    """Get all broadcast messages."""
    require_admin(request)
    db = SessionLocal()
    try:
        broadcasts = [
            broadcast_to_dict(broadcast)
            for broadcast in db.query(DBBroadcast).order_by(DBBroadcast.created_at.desc(), DBBroadcast.id.desc()).all()
        ]
        return {
            "success": True,
            "broadcasts": broadcasts,
            "data": broadcasts,
        }
    except Exception as error:
        print("BROADCASTS LOAD ERROR:", repr(error))
        return {"success": True, "broadcasts": [], "data": []}
    finally:
        db.close()


@app.get("/admin/audit-logs")
def get_admin_audit_logs(
    request: Request,
    limit: int = 100,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    admin_email: Optional[str] = None,
):
    require_admin(request)
    db = SessionLocal()
    try:
        query = db.query(DBAdminAuditLog)
        if action:
            query = query.filter(DBAdminAuditLog.action == action)
        if entity_type:
            query = query.filter(DBAdminAuditLog.entity_type == entity_type)
        if admin_email:
            query = query.filter(DBAdminAuditLog.admin_email == admin_email.strip().lower())

        safe_limit = max(1, min(int(limit or 100), 500))
        logs = [
            audit_log_to_dict(log)
            for log in query.order_by(DBAdminAuditLog.created_at.desc(), DBAdminAuditLog.id.desc()).limit(safe_limit).all()
        ]
        return {"success": True, "logs": logs, "data": logs}
    except Exception as error:
        print("AUDIT LOGS LOAD ERROR:", repr(error))
        return {"success": True, "logs": [], "data": []}
    finally:
        db.close()


@app.patch("/admin/broadcasts/{broadcast_id}")
def update_broadcast(broadcast_id: int, payload: BroadcastUpdatePayload, request: Request):
    """Update a broadcast message."""
    admin = require_admin(request)
    updates = payload.dict(exclude_unset=True)
    db = SessionLocal()
    try:
        broadcast = db.query(DBBroadcast).filter(DBBroadcast.id == broadcast_id).first()
        if broadcast:
            old_data = broadcast_to_dict(broadcast)
            for field in ["title", "message", "type", "is_active", "audience"]:
                if field in updates and updates[field] is not None:
                    value = updates[field]
                    if isinstance(value, str):
                        value = value.strip()
                        if field in ["title", "message"] and not value:
                            raise HTTPException(status_code=400, detail="Title and message are required")
                    setattr(broadcast, field, value)

            if updates.get("resend"):
                recipient_count = _create_broadcast_notification(
                    broadcast.title,
                    broadcast.message,
                    broadcast.type or "broadcast",
                    broadcast.audience or "all",
                )
                broadcast.recipient_count = recipient_count
            broadcast.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(broadcast)
            data = broadcast_to_dict(broadcast)
            create_admin_audit_log(request, admin, "broadcast_updated", "broadcast", broadcast.id, f"Admin updated broadcast {broadcast.title}", {"before": old_data, "after": data})
            return {
                "success": True,
                "message": "Broadcast updated successfully",
                "broadcast": data,
                "data": data,
            }
    finally:
        db.close()
    
    raise HTTPException(status_code=404, detail="Broadcast not found")


@app.delete("/admin/broadcasts/{broadcast_id}")
def delete_broadcast(broadcast_id: int, request: Request):
    """Delete a broadcast record without removing customer notification history."""
    admin = require_admin(request)
    db = SessionLocal()
    try:
        broadcast = db.query(DBBroadcast).filter(DBBroadcast.id == broadcast_id).first()
        if broadcast:
            data = broadcast_to_dict(broadcast)
            db.delete(broadcast)
            db.commit()
            create_admin_audit_log(request, admin, "broadcast_deleted", "broadcast", broadcast_id, f"Admin deleted broadcast {data.get('title')}", {"broadcast": data})
            return {
                "success": True,
                "message": "Broadcast deleted successfully",
                "broadcast": data,
                "data": data,
            }
    finally:
        db.close()
    
    raise HTTPException(status_code=404, detail="Broadcast not found")

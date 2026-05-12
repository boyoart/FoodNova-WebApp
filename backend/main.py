from datetime import datetime, timedelta
from typing import Dict, List, Optional
from uuid import uuid4
import base64
import csv
import hashlib
import hmac
import io
import json
import os
import random
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, inspect, or_, text

from database import Base, SessionLocal, engine
from email_service import (
    send_admin_order_email,
    send_customer_order_email,
    send_low_stock_alert,
)
from models import (
    Address as DBAddress,
    AdminAuditLog as DBAdminAuditLog,
    Announcement as DBAnnouncement,
    Broadcast as DBBroadcast,
    CancellationRequest as DBCancellationRequest,
    Notification as DBNotification,
    Order as DBOrder,
    OrderItem as DBOrderItem,
    Pack as DBPack,
    PaymentApprovalLog as DBPaymentApprovalLog,
    Product as DBProduct,
    Profile as DBProfile,
    DeliveryRider as DBDeliveryRider,
    User as DBUser,
)

try:
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
except Exception:
    pwd_context = None

try:
    import cloudinary
    import cloudinary.uploader
except Exception:
    cloudinary = None

app = FastAPI(title="FoodNova API")
UPLOAD_DIR = "uploads"
AVATAR_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "avatars")
PRODUCT_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "products")
PACK_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "packs")
ANNOUNCEMENT_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "announcements")
RECEIPT_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "receipts")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(AVATAR_UPLOAD_DIR, exist_ok=True)
os.makedirs(PRODUCT_UPLOAD_DIR, exist_ok=True)
os.makedirs(PACK_UPLOAD_DIR, exist_ok=True)
os.makedirs(ANNOUNCEMENT_UPLOAD_DIR, exist_ok=True)
os.makedirs(RECEIPT_UPLOAD_DIR, exist_ok=True)

CLOUDINARY_CLOUD_NAME = os.environ.get("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.environ.get("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.environ.get("CLOUDINARY_API_SECRET")
CLOUDINARY_ENABLED = bool(CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET and cloudinary)

if CLOUDINARY_ENABLED:
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET,
        secure=True,
    )
elif any([CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET]):
    print("Cloudinary is not fully configured. Falling back to local uploads.")

allowed_origins = [
    "capacitor://localhost",
    "ionic://localhost",
    "http://localhost",
    "https://foodnova.com.ng",
    "https://www.foodnova.com.ng",
    "https://food-nova-web-app.vercel.app",
    "https://foodnova-webapp.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
]
for origin in [os.environ.get("FRONTEND_URL"), os.environ.get("FRONTEND_ORIGIN")]:
    clean_origin = str(origin or "").strip().rstrip("/")
    if clean_origin and clean_origin not in allowed_origins:
        allowed_origins.append(clean_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if not any(getattr(route, "path", None) == "/uploads" for route in app.routes):
    app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.exception_handler(HTTPException)
async def foodnova_http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "detail": exc.detail},
        headers=exc.headers,
    )

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
JWT_SECRET = os.environ.get("JWT_SECRET") or "foodnova-dev-secret-change-me"
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "10080"))

if not os.environ.get("JWT_SECRET"):
    print("WARNING: JWT_SECRET is not set. Using development secret.")

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
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    auth_method: Optional[str] = None
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


class TrackOrderPayload(BaseModel):
    order_code: Optional[str] = ""
    phone_or_email: Optional[str] = ""


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


class AnnouncementPayload(BaseModel):
    title: str
    message: str
    display_type: Optional[str] = "top_bar"
    button_text: Optional[str] = None
    button_link: Optional[str] = None
    image_url: Optional[str] = None
    theme: Optional[str] = "green"
    priority: Optional[int] = 0
    is_active: Optional[bool] = True
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class AnnouncementUpdatePayload(BaseModel):
    title: Optional[str] = None
    message: Optional[str] = None
    display_type: Optional[str] = None
    button_text: Optional[str] = None
    button_link: Optional[str] = None
    image_url: Optional[str] = None
    theme: Optional[str] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class NotificationUpdatePayload(BaseModel):
    is_read: Optional[bool] = None


class AdminUserPayload(BaseModel):
    full_name: Optional[str] = None
    name: Optional[str] = None
    fullName: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = ""
    password: str
    confirm_password: Optional[str] = None
    confirmPassword: Optional[str] = None
    admin_role: Optional[str] = "viewer"
    permissions: Optional[list] = None
    permissions_json: Optional[object] = None
    is_active: Optional[bool] = True


class AdminUserUpdatePayload(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    admin_role: Optional[str] = None
    permissions: Optional[list] = None
    is_active: Optional[bool] = None


class RiderPayload(BaseModel):
    full_name: str
    phone: str
    email: Optional[str] = ""
    vehicle_type: Optional[str] = ""
    vehicle_number: Optional[str] = ""
    status: Optional[str] = "active"
    notes: Optional[str] = ""


class RiderUpdatePayload(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    vehicle_type: Optional[str] = None
    vehicle_number: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class AssignRiderPayload(BaseModel):
    rider_id: int
    delivery_note: Optional[str] = ""
    mark_out_for_delivery: Optional[bool] = False


class CancellationRequestPayload(BaseModel):
    request_type: Optional[str] = "cancellation"
    reason: str


class CancellationReviewPayload(BaseModel):
    admin_note: Optional[str] = ""
    rejection_reason: Optional[str] = ""
    refund_status: Optional[str] = None


class AdminPasswordResetPayload(BaseModel):
    new_password: str
    confirm_password: Optional[str] = None


ADMIN_ROLE_PERMISSIONS = {
    "super_admin": [
        "dashboard:view", "orders:view", "orders:update", "orders:delivery",
        "payments:view", "payments:approve", "stock:view", "stock:manage",
        "broadcasts:view", "broadcasts:send", "announcements:view", "announcements:manage", "customers:view", "audit:view",
        "admins:view", "admins:manage", "delivery:manage",
        "cancellations:view", "cancellations:manage", "exports:view", "exports:download",
        "reports:view", "orders:delete",
    ],
    "orders_manager": ["dashboard:view", "orders:view", "orders:update", "orders:delivery", "delivery:manage", "cancellations:view", "cancellations:manage", "customers:view"],
    "stock_manager": ["dashboard:view", "stock:view", "stock:manage"],
    "payment_manager": ["dashboard:view", "orders:view", "payments:view", "payments:approve", "cancellations:view", "cancellations:manage", "customers:view"],
    "broadcast_manager": ["dashboard:view", "broadcasts:view", "broadcasts:send", "announcements:view", "announcements:manage"],
    "customer_support": ["dashboard:view", "orders:view", "orders:update", "cancellations:view", "customers:view"],
    "viewer": ["dashboard:view", "orders:view", "stock:view", "customers:view"],
}


def normalize_admin_role(value: Optional[str]) -> str:
    role = str(value or "super_admin").strip().lower().replace("-", "_").replace(" ", "_")
    return role or "super_admin"


def get_admin_permissions(admin_user) -> List[str]:
    role = normalize_admin_role(
        getattr(admin_user, "admin_role", None) if not isinstance(admin_user, dict) else admin_user.get("admin_role")
    )
    raw_permissions = (
        getattr(admin_user, "permissions_json", None)
        if not isinstance(admin_user, dict)
        else admin_user.get("permissions_json") or admin_user.get("permissions")
    )
    parsed = json_load(raw_permissions, None) if isinstance(raw_permissions, str) else raw_permissions
    if isinstance(parsed, list) and parsed:
        return sorted({str(permission) for permission in parsed if permission})
    return ADMIN_ROLE_PERMISSIONS.get(role, ADMIN_ROLE_PERMISSIONS["super_admin"] if role == "super_admin" else [])


def has_permission(admin_user, permission: str) -> bool:
    role = normalize_admin_role(
        getattr(admin_user, "admin_role", None) if not isinstance(admin_user, dict) else admin_user.get("admin_role")
    )
    return role == "super_admin" or permission in get_admin_permissions(admin_user)


def require_permission(request: Request, permission: str):
    admin = require_admin(request)
    if not has_permission(admin, permission):
        raise HTTPException(status_code=403, detail="You do not have permission to perform this action.")
    return admin


def require_any_permission(request: Request, permissions: List[str]):
    admin = require_admin(request)
    if not any(has_permission(admin, permission) for permission in permissions):
        raise HTTPException(status_code=403, detail="You do not have permission to perform this action.")
    return admin


def validate_assignable_permissions(current_admin: dict, target_role: Optional[str], permissions: Optional[list]) -> tuple[str, List[str]]:
    admin_role = normalize_admin_role(target_role)
    selected = permissions if isinstance(permissions, list) and permissions else ADMIN_ROLE_PERMISSIONS.get(admin_role, [])
    selected = sorted({str(permission) for permission in selected if permission})
    if not has_permission(current_admin, "admins:manage"):
        raise HTTPException(status_code=403, detail="You do not have permission to perform this action.")
    if normalize_admin_role(current_admin.get("admin_role")) != "super_admin":
        current_permissions = set(get_admin_permissions(current_admin))
        if any(permission not in current_permissions for permission in selected):
            raise HTTPException(status_code=403, detail="You cannot grant permissions you do not have.")
        if admin_role == "super_admin":
            raise HTTPException(status_code=403, detail="Only Super Admins can create Super Admin accounts.")
    return admin_role, selected


def public_user(user: dict) -> dict:
    full_name = user.get("full_name") or user.get("fullName") or user.get("name") or "FoodNova User"
    data = {
        "id": user["id"],
        "full_name": full_name,
        "fullName": full_name,
        "name": full_name,
        "email": user["email"],
        "phone": user.get("phone", ""),
        "role": user.get("role", "customer"),
        "is_active": user.get("is_active", True),
    }
    if data["role"] == "admin":
        data["admin_role"] = normalize_admin_role(user.get("admin_role"))
        data["permissions"] = get_admin_permissions(user)
    return data


def create_access_token(user) -> str:
    email = getattr(user, "email", None) if not isinstance(user, dict) else user.get("email")
    user_id = getattr(user, "id", None) if not isinstance(user, dict) else user.get("id")
    role = getattr(user, "role", None) if not isinstance(user, dict) else user.get("role")
    admin_role = getattr(user, "admin_role", None) if not isinstance(user, dict) else user.get("admin_role")
    full_name = (
        getattr(user, "full_name", None)
        if not isinstance(user, dict)
        else user.get("full_name") or user.get("fullName") or user.get("name")
    )
    expiry = datetime.utcnow() + timedelta(minutes=JWT_EXPIRE_MINUTES)
    payload = {
        "sub": email,
        "user_id": user_id,
        "role": role or "customer",
        "admin_role": normalize_admin_role(admin_role) if (role or "") == "admin" else "",
        "permissions": get_admin_permissions(user) if (role or "") == "admin" else [],
        "name": full_name or "",
        "exp": expiry,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return None


def _get_user_from_token(authorization: Optional[str]) -> Optional[dict]:
    if not authorization:
        return None
    token = authorization.replace("Bearer ", "").strip()
    payload = decode_access_token(token)
    email = payload.get("sub") if payload else None
    if not email:
        return None
    db = SessionLocal()
    try:
        user = get_db_user_by_email(db, email)
        if not user:
            return None
        if (user.role or "") == "admin" and not getattr(user, "is_active", True):
            return None
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

    if str(stored_password).startswith("pbkdf2_sha256$"):
        try:
            _, iterations, salt_b64, digest_b64 = str(stored_password).split("$", 3)
            salt = base64.b64decode(salt_b64.encode("utf-8"))
            expected = base64.b64decode(digest_b64.encode("utf-8"))
            actual = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), salt, int(iterations))
            return hmac.compare_digest(actual, expected)
        except Exception:
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

    iterations = 260000
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return "pbkdf2_sha256${}${}${}".format(
        iterations,
        base64.b64encode(salt).decode("utf-8"),
        base64.b64encode(digest).decode("utf-8"),
    )


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


def safe_email_call(label: str, func, *args, **kwargs):
    try:
        return func(*args, **kwargs)
    except Exception as error:
        print(f"EMAIL EVENT ERROR [{label}]:", repr(error))
        return None


def normalize_order_items(items: list) -> list:
    normalized = []

    for item in items or []:
        qty = item.get("quantity") or item.get("qty") or 1
        price = item.get("price") or item.get("unit_price") or 0
        name = item.get("name") or item.get("product_name") or f"Product #{item.get('product_id') or item.get('id') or ''}"

        normalized.append({
            "id": item.get("id") or item.get("product_id"),
            "product_id": item.get("product_id") or item.get("id"),
            "item_type": item.get("item_type") or item.get("type") or ("pack" if item.get("items") else "product"),
            "name": name,
            "product_name": name,
            "price": price,
            "unit_price": price,
            "quantity": qty,
            "qty": qty,
            "line_total": price * qty,
        })

    return normalized


def find_order_product_for_stock(db, item: dict) -> Optional[DBProduct]:
    if str(item.get("item_type") or "").lower() == "pack":
        return None

    product = None
    product_id = item.get("product_id")
    if product_id:
        try:
            product = db.query(DBProduct).filter(DBProduct.id == int(product_id)).first()
        except Exception:
            product = None

    if not product:
        item_name = str(item.get("name") or item.get("product_name") or "").strip().lower()
        if item_name:
            product = db.query(DBProduct).filter(DBProduct.name.ilike(item_name)).first()

    return product


def validate_and_deduct_inventory(db, items: list) -> list:
    deductions = []
    requested_by_product = {}

    for item in items:
        product = find_order_product_for_stock(db, item)
        if not product:
            continue
        quantity = int(item.get("quantity") or item.get("qty") or 1)
        if quantity <= 0:
            continue
        current = requested_by_product.get(product.id, {"product": product, "quantity": 0})
        current["quantity"] += quantity
        requested_by_product[product.id] = current

    for entry in requested_by_product.values():
        product = entry["product"]
        requested = entry["quantity"]
        available = product.stock_qty if product.stock_qty is not None else (product.stock or 0)
        if available < requested:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {product.name}. Available: {available}, requested: {requested}",
            )

    for entry in requested_by_product.values():
        product = entry["product"]
        requested = entry["quantity"]
        available = product.stock_qty if product.stock_qty is not None else (product.stock or 0)
        next_stock = max(0, available - requested)
        product.stock_qty = next_stock
        product.stock = next_stock
        product.updated_at = datetime.utcnow()
        deductions.append({
            "product_id": product.id,
            "name": product.name,
            "quantity": requested,
            "previous_stock": available,
            "new_stock": next_stock,
            "low_stock": 0 < next_stock <= 5,
            "out_of_stock": next_stock <= 0,
        })

    return deductions


def restock_order_inventory(db, order: DBOrder) -> list:
    if getattr(order, "inventory_restocked_at", None):
        return []
    restocked = []
    for item in order.items or []:
        if not item.product_id:
            continue
        product = db.query(DBProduct).filter(DBProduct.id == item.product_id).first()
        if not product:
            continue
        quantity = int(item.quantity or item.qty or 0)
        if quantity <= 0:
            continue
        previous = product.stock_qty if product.stock_qty is not None else (product.stock or 0)
        product.stock_qty = previous + quantity
        product.stock = product.stock_qty
        product.updated_at = datetime.utcnow()
        restocked.append({
            "product_id": product.id,
            "name": product.name,
            "quantity": quantity,
            "previous_stock": previous,
            "new_stock": product.stock_qty,
        })
    if restocked:
        order.inventory_restocked_at = datetime.utcnow()
    return restocked


def is_cancellation_eligible(order: DBOrder) -> tuple[bool, str]:
    cancellation_status = getattr(order, "cancellation_status", "none") or "none"
    refund_status = getattr(order, "refund_status", "none") or "none"
    statuses = {
        str(order.status or "").lower(),
        str(order.order_status or "").lower(),
        str(order.fulfillment_status or "").lower(),
        str(order.payment_status or "").lower(),
    }
    if cancellation_status == "pending" or refund_status == "pending":
        return False, "A cancellation/refund request is already pending for this order."
    if cancellation_status == "approved" or refund_status == "processed":
        return False, "Cancellation/refund has already been processed for this order."
    if statuses.intersection({"out_for_delivery", "delivered", "cancelled"}):
        return False, "Cancellation is no longer available for this order. Please contact FoodNova support."
    allowed = {"order_placed", "pending_payment", "receipt_submitted", "payment_confirmed", "confirmed", "processing"}
    if statuses.intersection(allowed):
        return True, ""
    return False, "Cancellation is no longer available for this order. Please contact FoodNova support."


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


IMAGE_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

RECEIPT_CONTENT_TYPES = {
    **IMAGE_CONTENT_TYPES,
    "application/pdf": ".pdf",
}


def _safe_upload_extension(file: UploadFile, allowed_types: dict) -> str:
    if file.content_type in allowed_types:
        return allowed_types[file.content_type]
    original_ext = Path(file.filename or "").suffix.lower()
    return original_ext if original_ext else ".bin"


def _save_upload_locally(contents: bytes, file: UploadFile, folder: str, prefix: str, allowed_types: dict) -> str:
    os.makedirs(folder, exist_ok=True)
    ext = _safe_upload_extension(file, allowed_types)
    filename = f"{prefix}-{uuid4().hex}{ext}"
    file_path = os.path.join(folder, filename)
    with open(file_path, "wb") as upload_file:
        upload_file.write(contents)
    public_folder = os.path.relpath(folder, UPLOAD_DIR).replace("\\", "/")
    return f"/uploads/{public_folder}/{filename}"


async def upload_to_cloudinary(
    file: UploadFile,
    folder: str,
    allowed_types: Optional[dict] = None,
    max_size_mb: int = 5,
    invalid_type_message: str = "Unsupported file type",
) -> dict:
    allowed_types = allowed_types or IMAGE_CONTENT_TYPES
    if not file:
        return {"url": "", "filename": ""}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=invalid_type_message)

    contents = await file.read()
    max_size = max_size_mb * 1024 * 1024
    if len(contents) > max_size:
        raise HTTPException(status_code=400, detail=f"File must be {max_size_mb}MB or smaller")

    filename = file.filename or f"foodnova-upload-{uuid4().hex}{_safe_upload_extension(file, allowed_types)}"
    local_folder = folder.replace("foodnova/", "", 1)
    local_path = os.path.join(UPLOAD_DIR, local_folder)
    prefix = folder.strip("/").split("/")[-1].rstrip("s") or "upload"

    if CLOUDINARY_ENABLED:
        try:
            upload_stream = io.BytesIO(contents)
            upload_stream.name = filename
            result = cloudinary.uploader.upload(
                upload_stream,
                folder=folder,
                resource_type="auto",
                public_id=f"{prefix}-{uuid4().hex}",
                overwrite=False,
            )
            uploaded_url = result.get("secure_url") or result.get("url")
            if uploaded_url:
                return {"url": uploaded_url, "filename": filename}
        except Exception as error:
            print("CLOUDINARY UPLOAD ERROR:", repr(error))

    return {"url": _save_upload_locally(contents, file, local_path, prefix, allowed_types), "filename": filename}


async def save_uploaded_image(file: UploadFile, folder: str, prefix: str) -> str:
    folder_map = {
        AVATAR_UPLOAD_DIR: "foodnova/avatars",
        PRODUCT_UPLOAD_DIR: "foodnova/products",
        PACK_UPLOAD_DIR: "foodnova/packs",
        ANNOUNCEMENT_UPLOAD_DIR: "foodnova/announcements",
    }
    result = await upload_to_cloudinary(file, folder_map.get(folder, f"foodnova/{prefix}s"), IMAGE_CONTENT_TYPES, 5)
    return result.get("url", "")


def _receipt_file_type(mime_type: str) -> str:
    if mime_type == "application/pdf":
        return "pdf"
    if str(mime_type or "").startswith("image/"):
        return "image"
    return "file"


async def save_uploaded_receipt(file: UploadFile) -> dict:
    result = await upload_to_cloudinary(
        file,
        "foodnova/receipts",
        RECEIPT_CONTENT_TYPES,
        10,
        "Only JPG, PNG, WEBP, or PDF receipts are allowed.",
    )
    mime_type = file.content_type or ""
    return {
        "url": result.get("url", ""),
        "filename": result.get("filename") or (file.filename if file else ""),
        "mime_type": mime_type,
        "file_type": _receipt_file_type(mime_type),
        "uploaded_at": datetime.utcnow().isoformat(),
    }


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
        "admin_role": normalize_admin_role(getattr(user, "admin_role", None)) if (user.role or "") == "admin" else "",
        "permissions_json": getattr(user, "permissions_json", None),
        "permissions": get_admin_permissions(user) if (user.role or "") == "admin" else [],
        "is_active": bool(getattr(user, "is_active", True)),
        "created_at": iso(user.created_at),
        "updated_at": iso(user.updated_at),
    }


def admin_user_to_dict(user: DBUser) -> dict:
    full_name = user.full_name or "Admin"
    return {
        "id": user.id,
        "full_name": full_name,
        "fullName": full_name,
        "name": full_name,
        "email": user.email,
        "phone": user.phone or "",
        "role": "admin",
        "admin_role": normalize_admin_role(getattr(user, "admin_role", None)),
        "permissions": get_admin_permissions(user),
        "is_active": bool(getattr(user, "is_active", True)),
        "created_at": iso(user.created_at),
        "updated_at": iso(user.updated_at),
    }


def product_to_dict(product: DBProduct) -> dict:
    stock_qty = product.stock_qty if product.stock_qty is not None else (product.stock or 0)
    low_stock_threshold = 5
    return {
        "id": product.id,
        "name": product.name,
        "price": product.price or 0,
        "stock_qty": stock_qty,
        "stock": product.stock if product.stock is not None else stock_qty,
        "category": product.category or "",
        "category_name": product.category_name or product.category or "",
        "image_url": product.image_url or "",
        "description": product.description or "",
        "is_active": bool(product.is_active),
        "active": bool(product.is_active),
        "is_out_of_stock": stock_qty <= 0,
        "low_stock": 0 < stock_qty <= low_stock_threshold,
        "low_stock_threshold": low_stock_threshold,
        "status": "active" if product.is_active else "inactive",
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


def rider_to_dict(rider: DBDeliveryRider) -> dict:
    return {
        "id": rider.id,
        "full_name": rider.full_name or "",
        "name": rider.full_name or "",
        "phone": rider.phone or "",
        "email": rider.email or "",
        "vehicle_type": rider.vehicle_type or "",
        "vehicle_number": rider.vehicle_number or "",
        "status": rider.status or "active",
        "notes": rider.notes or "",
        "created_at": iso(rider.created_at),
        "updated_at": iso(rider.updated_at),
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
        "rider_id": getattr(order, "rider_id", None),
        "rider_name": getattr(order, "rider_name", "") or "",
        "rider_phone": getattr(order, "rider_phone", "") or "",
        "rider_vehicle_type": getattr(order, "rider_vehicle_type", "") or "",
        "rider_vehicle_number": getattr(order, "rider_vehicle_number", "") or "",
        "delivery_assigned_at": iso(getattr(order, "delivery_assigned_at", None)),
        "delivery_started_at": iso(getattr(order, "delivery_started_at", None)),
        "delivery_completed_at": iso(getattr(order, "delivery_completed_at", None)),
        "delivery_note": getattr(order, "delivery_note", "") or "",
        "cancellation_status": getattr(order, "cancellation_status", "none") or "none",
        "cancellation_reason": getattr(order, "cancellation_reason", "") or "",
        "cancellation_requested_at": iso(getattr(order, "cancellation_requested_at", None)),
        "cancellation_reviewed_at": iso(getattr(order, "cancellation_reviewed_at", None)),
        "refund_status": getattr(order, "refund_status", "none") or "none",
        "refund_note": getattr(order, "refund_note", "") or "",
        "inventory_restocked_at": iso(getattr(order, "inventory_restocked_at", None)),
        "receipt": json_load(order.receipt, None),
        "admin_note": order.admin_note or "",
        "service_note": order.service_note or "",
        "is_deleted": bool(getattr(order, "is_deleted", False)),
        "deleted_at": iso(getattr(order, "deleted_at", None)),
        "deleted_by_admin_id": getattr(order, "deleted_by_admin_id", None),
        "deleted_by_admin_name": getattr(order, "deleted_by_admin_name", "") or "",
        "created_at": iso(order.created_at),
        "updated_at": iso(order.updated_at),
    }


def active_order_filter(query):
    return query.filter(or_(DBOrder.is_deleted == False, DBOrder.is_deleted == None))


def normalize_tracking_phone(value: str) -> str:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if not digits:
        return ""
    if digits.startswith("234"):
        return digits
    if digits.startswith("0"):
        return f"234{digits[1:]}"
    return digits


def tracking_phone_matches(input_value: str, candidates: list) -> bool:
    submitted = normalize_tracking_phone(input_value)
    if not submitted:
        return False
    submitted_variants = {submitted}
    if submitted.startswith("234"):
        submitted_variants.add(f"0{submitted[3:]}")
    for candidate in candidates:
        normalized = normalize_tracking_phone(candidate)
        if not normalized:
            continue
        variants = {normalized}
        if normalized.startswith("234"):
            variants.add(f"0{normalized[3:]}")
        if submitted_variants.intersection(variants):
            return True
        if len(submitted) >= 10 and len(normalized) >= 10 and submitted[-10:] == normalized[-10:]:
            return True
    return False


def public_tracking_order_to_dict(order: DBOrder) -> dict:
    items = []
    try:
        for item in order.items or []:
            quantity = item.quantity or item.qty or 1
            price = item.price or item.unit_price or 0
            items.append({
                "name": item.name or item.product_name or "FoodNova Item",
                "quantity": quantity,
                "price": price,
                "line_total": item.line_total or (price * quantity),
            })
    except Exception:
        items = []

    receipt = json_load(order.receipt, None)
    return {
        "id": order.id,
        "order_code": order.order_code,
        "customer_name": order.customer_name or "",
        "payment_status": order.payment_status or "pending_payment",
        "order_status": order.order_status or "order_placed",
        "fulfillment_status": order.fulfillment_status or "order_placed",
        "delivery_method": order.delivery_method or "delivery",
        "total_amount": order.total_amount or 0,
        "created_at": iso(order.created_at),
        "updated_at": iso(order.updated_at),
        "receipt_uploaded": bool(receipt),
        "cancellation_status": getattr(order, "cancellation_status", "none") or "none",
        "refund_status": getattr(order, "refund_status", "none") or "none",
        "rider_name": getattr(order, "rider_name", "") or "",
        "rider_phone": getattr(order, "rider_phone", "") or "",
        "delivery_note": getattr(order, "delivery_note", "") or "",
        "delivery_assigned_at": iso(getattr(order, "delivery_assigned_at", None)),
        "delivery_started_at": iso(getattr(order, "delivery_started_at", None)),
        "delivery_completed_at": iso(getattr(order, "delivery_completed_at", None)),
        "items": items,
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


def announcement_to_dict(announcement: DBAnnouncement) -> dict:
    return {
        "id": announcement.id,
        "title": announcement.title,
        "message": announcement.message,
        "display_type": announcement.display_type or "top_bar",
        "button_text": announcement.button_text or "",
        "button_link": announcement.button_link or "",
        "image_url": announcement.image_url or "",
        "theme": announcement.theme or "green",
        "priority": announcement.priority or 0,
        "is_active": bool(announcement.is_active),
        "start_date": iso(announcement.start_date),
        "end_date": iso(announcement.end_date),
        "created_by_admin_id": announcement.created_by_admin_id,
        "created_by_admin_name": announcement.created_by_admin_name or "",
        "created_at": iso(announcement.created_at),
        "updated_at": iso(announcement.updated_at),
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


def payment_audit_log_to_dict(log: DBPaymentApprovalLog) -> dict:
    return {
        "id": log.id,
        "order_id": log.order_id,
        "order_code": log.order_code or "",
        "admin_id": log.admin_id,
        "admin_name": log.admin_name or "Admin",
        "admin_email": log.admin_email or "",
        "action": log.action,
        "old_payment_status": log.old_payment_status or "",
        "new_payment_status": log.new_payment_status or "",
        "receipt_url": log.receipt_url or "",
        "receipt_filename": log.receipt_filename or "",
        "note": log.note or "",
        "rejection_reason": log.rejection_reason or "",
        "ip_address": log.ip_address or "",
        "user_agent": log.user_agent or "",
        "created_at": iso(log.created_at),
    }


def cancellation_request_to_dict(request_obj: DBCancellationRequest, order: DBOrder = None) -> dict:
    data = {
        "id": request_obj.id,
        "order_id": request_obj.order_id,
        "order_code": request_obj.order_code or "",
        "customer_email": request_obj.customer_email or "",
        "customer_name": request_obj.customer_name or "",
        "customer_phone": request_obj.customer_phone or "",
        "request_type": request_obj.request_type or "cancellation",
        "reason": request_obj.reason or "",
        "status": request_obj.status or "pending",
        "admin_note": request_obj.admin_note or "",
        "reviewed_by_admin_id": request_obj.reviewed_by_admin_id,
        "reviewed_by_admin_name": request_obj.reviewed_by_admin_name or "",
        "reviewed_by_admin_email": request_obj.reviewed_by_admin_email or "",
        "requested_at": iso(request_obj.requested_at),
        "reviewed_at": iso(request_obj.reviewed_at),
        "created_at": iso(request_obj.created_at),
        "updated_at": iso(request_obj.updated_at),
    }
    if order:
        data["order"] = order_to_dict(order)
    return data


def csv_download_response(filename_prefix: str, columns: list, rows: list):
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({column: row.get(column, "") for column in columns})
    output.seek(0)
    today = datetime.utcnow().strftime("%Y-%m-%d")
    filename = f"foodnova-{filename_prefix}-{today}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def require_export_permission(request: Request):
    return require_permission(request, "exports:download")


def parse_report_date(value: Optional[str], default: datetime) -> datetime:
    if not value:
        return default
    try:
        return datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates must use YYYY-MM-DD format.")


def report_status_counts(values: List[str], allowed_statuses: List[str]) -> List[dict]:
    counts = {status: 0 for status in allowed_statuses}
    for value in values:
        status = str(value or "").lower()
        if status in counts:
            counts[status] += 1
        elif status:
            counts[status] = counts.get(status, 0) + 1
    return [{"status": status, "count": count} for status, count in counts.items()]


def create_payment_approval_log(
    db,
    request: Request,
    admin: dict,
    order: DBOrder,
    action: str,
    old_payment_status: str,
    new_payment_status: str,
    note: str = "",
    rejection_reason: str = "",
):
    receipt = json_load(order.receipt, {}) or {}
    log = DBPaymentApprovalLog(
        order_id=order.id,
        order_code=order.order_code or "",
        admin_id=admin.get("id"),
        admin_name=admin.get("full_name") or admin.get("fullName") or admin.get("name") or "Admin",
        admin_email=admin.get("email") or "",
        action=action,
        old_payment_status=old_payment_status or "",
        new_payment_status=new_payment_status or "",
        receipt_url=receipt.get("url") or receipt.get("receipt_url") or receipt.get("data_url") or "",
        receipt_filename=receipt.get("filename") or "",
        note=note or "",
        rejection_reason=rejection_reason or "",
        ip_address=request.client.host if request and request.client else "",
        user_agent=request.headers.get("user-agent", "") if request else "",
    )
    db.add(log)
    return log


def get_db_user_by_email(db, email: str):
    return db.query(DBUser).filter(DBUser.email == str(email).strip().lower()).first()


def get_db_user_by_phone(db, phone: str):
    normalized = str(phone or "").strip()
    if not normalized:
        return None
    return db.query(DBUser).filter(DBUser.phone == normalized).first()


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
            "admin_role": "VARCHAR(80) DEFAULT ''",
            "permissions_json": "TEXT",
            "is_active": "BOOLEAN DEFAULT TRUE",
            "updated_at": "TIMESTAMP",
        },
        "payment_approval_logs": {
            "order_id": "INTEGER",
            "order_code": "VARCHAR(30) DEFAULT ''",
            "admin_id": "INTEGER",
            "admin_name": "VARCHAR(150) DEFAULT ''",
            "admin_email": "VARCHAR(150) DEFAULT ''",
            "action": "VARCHAR(80)",
            "old_payment_status": "VARCHAR(80) DEFAULT ''",
            "new_payment_status": "VARCHAR(80) DEFAULT ''",
            "receipt_url": "TEXT DEFAULT ''",
            "receipt_filename": "VARCHAR(255) DEFAULT ''",
            "note": "TEXT DEFAULT ''",
            "rejection_reason": "TEXT DEFAULT ''",
            "ip_address": "VARCHAR(80) DEFAULT ''",
            "user_agent": "TEXT DEFAULT ''",
            "created_at": "TIMESTAMP",
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
            "rider_id": "INTEGER",
            "rider_name": "VARCHAR(150) DEFAULT ''",
            "rider_phone": "VARCHAR(50) DEFAULT ''",
            "rider_vehicle_type": "VARCHAR(80) DEFAULT ''",
            "rider_vehicle_number": "VARCHAR(80) DEFAULT ''",
            "delivery_assigned_at": "TIMESTAMP",
            "delivery_started_at": "TIMESTAMP",
            "delivery_completed_at": "TIMESTAMP",
            "delivery_note": "TEXT DEFAULT ''",
            "cancellation_status": "VARCHAR(30) DEFAULT 'none'",
            "cancellation_reason": "TEXT DEFAULT ''",
            "cancellation_requested_at": "TIMESTAMP",
            "cancellation_reviewed_at": "TIMESTAMP",
            "refund_status": "VARCHAR(30) DEFAULT 'none'",
            "refund_note": "TEXT DEFAULT ''",
            "inventory_restocked_at": "TIMESTAMP",
            "receipt": "TEXT",
            "admin_note": "TEXT DEFAULT ''",
            "service_note": "TEXT DEFAULT ''",
            "is_deleted": "BOOLEAN DEFAULT FALSE",
            "deleted_at": "TIMESTAMP",
            "deleted_by_admin_id": "INTEGER",
            "deleted_by_admin_name": "VARCHAR(150)",
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
        "announcements": {
            "display_type": "VARCHAR(40) DEFAULT 'top_bar'",
            "button_text": "VARCHAR(120)",
            "button_link": "TEXT",
            "image_url": "TEXT",
            "theme": "VARCHAR(40) DEFAULT 'green'",
            "priority": "INTEGER DEFAULT 0",
            "is_active": "BOOLEAN DEFAULT TRUE",
            "start_date": "TIMESTAMP",
            "end_date": "TIMESTAMP",
            "created_by_admin_id": "INTEGER",
            "created_by_admin_name": "VARCHAR(150)",
            "created_at": "TIMESTAMP",
            "updated_at": "TIMESTAMP",
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
            connection.execute(text("UPDATE users SET admin_role = 'super_admin' WHERE role = 'admin' AND (admin_role IS NULL OR admin_role = '')"))
            connection.execute(text("UPDATE users SET is_active = TRUE WHERE is_active IS NULL"))
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
            connection.execute(text("UPDATE orders SET is_deleted = FALSE WHERE is_deleted IS NULL"))
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
                admin_role="super_admin",
                permissions_json=json_dump(ADMIN_ROLE_PERMISSIONS["super_admin"]),
                is_active=True,
            )
            db.add(admin)
        elif not admin.full_name or admin.full_name == "FoodNova User":
            admin.full_name = "FoodNova Admin"
            admin.updated_at = datetime.utcnow()
        else:
            admin.is_active = True
            admin.admin_role = "super_admin"
            admin.permissions_json = json_dump(ADMIN_ROLE_PERMISSIONS["super_admin"])

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
    return {"success": True, "status": "ok"}


@app.get("/debug/db")
def debug_db():
    db = SessionLocal()
    try:
        return {
            "success": True,
            "auth_mode": "jwt",
            "database_url_prefix": engine.url.get_backend_name(),
            "users_count": db.query(DBUser).count(),
            "products_count": db.query(DBProduct).count(),
            "packs_count": db.query(DBPack).count(),
            "orders_count": active_order_filter(db.query(DBOrder)).count(),
            "notifications_count": db.query(DBNotification).count(),
            "broadcasts_count": db.query(DBBroadcast).count(),
        }
    except Exception as error:
        return {
            "success": False,
            "auth_mode": "jwt",
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

        token = create_access_token(user)

        return auth_response("Registration successful", db_user_to_dict(user), token)
    finally:
        db.close()


@app.post("/auth/login")
def login(payload: LoginPayload, request: Request):
    email = payload.email.lower().strip() if payload.email else ""
    phone = (payload.phone or "").strip()
    db = SessionLocal()
    try:
        user = get_db_user_by_email(db, email) if email else get_db_user_by_phone(db, phone)

        if not user or not _password_matches(payload.password, user.password):
            raise HTTPException(status_code=401, detail="Invalid login credentials")
        if (user.role or "customer") == "admin":
            raise HTTPException(status_code=403, detail="Please use the admin login page")

        ensure_profile(db, user)
        token = create_access_token(user)

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


@app.post("/auth/admin/login")
def admin_login(payload: LoginPayload, request: Request):
    if not payload.email:
        raise HTTPException(status_code=400, detail="Admin email is required")
    email = payload.email.lower().strip()
    db = SessionLocal()
    try:
        user = get_db_user_by_email(db, email)
        if not user or (user.role or "") != "admin" or not _password_matches(payload.password, user.password):
            raise HTTPException(status_code=401, detail="Invalid admin email or password")
        if not getattr(user, "is_active", True):
            raise HTTPException(status_code=403, detail="Admin account is inactive")

        token = create_access_token(user)
        user_data = db_user_to_dict(user)
        create_admin_audit_log(request, user_data, "admin_login", "admin", user.id, "Admin logged in")
        return auth_response("Admin login successful", user_data, token)
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


@app.post("/track-order")
def track_order(payload: TrackOrderPayload):
    order_code = (payload.order_code or "").strip().lower()
    phone_or_email = (payload.phone_or_email or "").strip()
    if not order_code:
        raise HTTPException(status_code=400, detail="Order code is required")
    if not phone_or_email:
        raise HTTPException(status_code=400, detail="Phone or email is required")

    db = SessionLocal()
    try:
        order = active_order_filter(db.query(DBOrder)).filter(func.lower(DBOrder.order_code) == order_code).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found. Please check your order code and phone/email.")

        submitted = phone_or_email.lower()
        email_matches = bool(order.customer_email and submitted == order.customer_email.strip().lower())
        phone_matches = tracking_phone_matches(phone_or_email, [order.customer_phone, order.phone])
        if not email_matches and not phone_matches:
            raise HTTPException(status_code=404, detail="Order not found. Please check your order code and phone/email.")

        data = public_tracking_order_to_dict(order)
        return {"success": True, "order": data, "data": data}
    finally:
        db.close()


@app.post("/orders")
def create_order(payload: OrderPayload, request: Request):
    normalized_items = normalize_order_items(payload.items or [])
    order_data = {}
    inventory_deductions = []
    # Attempt to enrich with user/profile data when available
    auth = request.headers.get("authorization")
    current_user = _get_user_from_token(auth)
    customer_name = payload.customer_name or (current_user.get("full_name") if current_user else "FoodNova Customer")
    customer_email = payload.customer_email or (current_user.get("email") if current_user else "")
    customer_phone = payload.customer_phone or (current_user.get("phone") if current_user else "")

    db = SessionLocal()
    try:
        inventory_deductions = validate_and_deduct_inventory(db, normalized_items)
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
        db.flush()

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
        if inventory_deductions:
            print(f"INVENTORY DEDUCTED for {order.order_code}: {inventory_deductions}")
            create_admin_audit_log(
                request,
                {"id": None, "full_name": "FoodNova System", "email": "system@foodnova.com.ng"},
                "inventory_deducted",
                "order",
                order.id,
                f"Inventory deducted for order {order.order_code}",
                {"order_code": order.order_code, "deductions": inventory_deductions},
            )
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
        safe_email_call("customer_order_placed", send_customer_order_email, order_data, "order_placed")

    safe_email_call("admin_new_order", send_admin_order_email, order_data, "new_order")

    for deduction in inventory_deductions:
        entered_low_stock = deduction.get("previous_stock", 0) > 5 and deduction.get("low_stock")
        entered_out_of_stock = deduction.get("previous_stock", 0) > 0 and deduction.get("out_of_stock")
        if entered_low_stock or entered_out_of_stock:
            safe_email_call("admin_low_stock", send_low_stock_alert, deduction, order_data)

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
            for order in active_order_filter(db.query(DBOrder)).filter(DBOrder.customer_email == email).order_by(DBOrder.created_at.desc(), DBOrder.id.desc()).all()
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
        orders = [order_to_dict(order) for order in active_order_filter(db.query(DBOrder)).order_by(DBOrder.created_at.desc(), DBOrder.id.desc()).all()]
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
        order = active_order_filter(db.query(DBOrder)).filter(DBOrder.id == order_id).first()
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
        order = active_order_filter(db.query(DBOrder)).filter(DBOrder.id == order_id).first()
        if order:
            receipt = await save_uploaded_receipt(file)
            receipt["status"] = "submitted"
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
            safe_email_call("customer_receipt_uploaded", send_customer_order_email, order_data, "receipt_uploaded", {"filename": receipt.get("filename")})
            safe_email_call("admin_receipt_uploaded", send_admin_order_email, order_data, "receipt_uploaded", {"receipt_url": receipt.get("url")})

            return {
                "success": True,
                "message": "Receipt uploaded successfully",
                "receipt": receipt,
                "data": receipt,
            }
    finally:
        db.close()

    raise HTTPException(status_code=404, detail="Order not found")


@app.post("/orders/{order_id}/cancel-request")
def create_cancel_request(order_id: int, payload: CancellationRequestPayload, request: Request):
    user = require_user(request)
    reason = (payload.reason or "").strip()
    request_type = (payload.request_type or "cancellation").strip().lower()
    if request_type not in ["cancellation", "refund"]:
        request_type = "cancellation"
    if len(reason) < 10:
        raise HTTPException(status_code=400, detail="Reason must be at least 10 characters")
    db = SessionLocal()
    try:
        order = active_order_filter(db.query(DBOrder)).filter(DBOrder.id == order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        if (order.customer_email or "").strip().lower() != (user.get("email") or "").strip().lower():
            raise HTTPException(status_code=403, detail="You can only request cancellation for your own order")
        eligible, message = is_cancellation_eligible(order)
        if not eligible:
            raise HTTPException(status_code=400, detail=message)
        existing = db.query(DBCancellationRequest).filter(
            DBCancellationRequest.order_id == order.id,
            DBCancellationRequest.status == "pending",
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="A cancellation/refund request is already pending for this order.")

        cancel_request = DBCancellationRequest(
            order_id=order.id,
            order_code=order.order_code or "",
            customer_email=order.customer_email or "",
            customer_name=order.customer_name or "",
            customer_phone=order.customer_phone or order.phone or "",
            request_type=request_type,
            reason=reason,
            status="pending",
            requested_at=datetime.utcnow(),
        )
        order.cancellation_status = "pending"
        order.cancellation_reason = reason
        order.cancellation_requested_at = datetime.utcnow()
        if request_type == "refund":
            order.refund_status = "pending"
        order.updated_at = datetime.utcnow()
        db.add(cancel_request)
        db.commit()
        db.refresh(cancel_request)
        db.refresh(order)
        order_data = order_to_dict(order)
        request_data = cancellation_request_to_dict(cancel_request, order)
        _create_order_notification(order_data, "Cancellation request submitted", f"Your cancellation/refund request for order {order.order_code} has been submitted.", "order_update", "order")
        safe_email_call("customer_cancellation_submitted", send_customer_order_email, order_data, "cancellation_submitted")
        safe_email_call("admin_cancellation_request", send_admin_order_email, order_data, "cancellation_request", {"reason": reason, "request_type": request_type})
        create_admin_audit_log(request, {"id": None, "full_name": "FoodNova System", "email": "system@foodnova.com.ng"}, "cancellation_request_submitted", "order", order.id, f"Cancellation/refund request submitted for order {order.order_code}", {"request": request_data})
        return {"success": True, "message": "Cancellation request submitted successfully", "request": request_data, "order": order_data, "data": request_data}
    finally:
        db.close()


@app.get("/orders/{order_id}/cancel-request")
def get_cancel_request(order_id: int, request: Request):
    user = require_user(request)
    db = SessionLocal()
    try:
        order = active_order_filter(db.query(DBOrder)).filter(DBOrder.id == order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        if (order.customer_email or "").strip().lower() != (user.get("email") or "").strip().lower():
            raise HTTPException(status_code=403, detail="You can only view your own cancellation request")
        cancel_request = db.query(DBCancellationRequest).filter(DBCancellationRequest.order_id == order.id).order_by(DBCancellationRequest.created_at.desc(), DBCancellationRequest.id.desc()).first()
        data = cancellation_request_to_dict(cancel_request, order) if cancel_request else None
        return {"success": True, "request": data, "data": data}
    finally:
        db.close()


@app.get("/admin/orders")
def admin_orders(request: Request, include_deleted: bool = False, status: Optional[str] = None):
    require_permission(request, "orders:view")
    db = SessionLocal()
    try:
        query = db.query(DBOrder)
        if include_deleted:
            require_permission(request, "orders:delete")
            query = query.filter(DBOrder.is_deleted == True)
        else:
            query = active_order_filter(query)
        clean_status = str(status or "").strip().lower()
        if clean_status and clean_status != "all":
            query = query.filter(or_(
                func.lower(DBOrder.payment_status) == clean_status,
                func.lower(DBOrder.order_status) == clean_status,
                func.lower(DBOrder.fulfillment_status) == clean_status,
                func.lower(DBOrder.status) == clean_status,
            ))
        orders = [order_to_dict(order) for order in query.order_by(DBOrder.created_at.desc(), DBOrder.id.desc()).all()]
        return {"success": True, "orders": orders, "data": orders}
    except Exception as error:
        print("ADMIN ORDERS LOAD ERROR:", repr(error))
        return {"success": True, "orders": [], "data": []}
    finally:
        db.close()


@app.get("/admin/orders/{order_id}")
def admin_get_order(order_id: int, request: Request):
    require_permission(request, "orders:view")
    db = SessionLocal()
    try:
        order = active_order_filter(db.query(DBOrder)).filter(DBOrder.id == order_id).first()
        if order:
            data = order_to_dict(order)
            return {"success": True, "order": data, "data": data}
    finally:
        db.close()

    raise HTTPException(status_code=404, detail="Order not found")


@app.delete("/admin/orders/{order_id}")
def delete_admin_order(order_id: int, request: Request):
    admin = require_permission(request, "orders:delete")
    db = SessionLocal()
    try:
        order = active_order_filter(db.query(DBOrder)).filter(DBOrder.id == order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        old_data = order_to_dict(order)
        order.is_deleted = True
        order.deleted_at = datetime.utcnow()
        order.deleted_by_admin_id = admin.get("id")
        order.deleted_by_admin_name = admin.get("full_name") or admin.get("email") or "Admin"
        order.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(order)
        create_admin_audit_log(
            request,
            admin,
            "order_deleted",
            "order",
            order.id,
            f"Admin deleted order {order.order_code}",
            {"order_id": order.id, "order_code": order.order_code, "before": old_data, "after": order_to_dict(order)},
        )
        return {"success": True, "message": "Order deleted successfully"}
    finally:
        db.close()


@app.get("/admin/riders")
def get_riders(request: Request):
    require_any_permission(request, ["delivery:manage", "orders:delivery"])
    db = SessionLocal()
    try:
        riders = [
            rider_to_dict(rider)
            for rider in db.query(DBDeliveryRider).order_by(DBDeliveryRider.status.asc(), DBDeliveryRider.full_name.asc()).all()
        ]
        return {"success": True, "riders": riders, "data": riders}
    finally:
        db.close()


@app.post("/admin/riders")
def create_rider(payload: RiderPayload, request: Request):
    admin = require_any_permission(request, ["delivery:manage", "orders:delivery"])
    full_name = (payload.full_name or "").strip()
    phone = (payload.phone or "").strip()
    if not full_name:
        raise HTTPException(status_code=400, detail="Rider full name is required")
    if not phone:
        raise HTTPException(status_code=400, detail="Rider phone is required")
    db = SessionLocal()
    try:
        rider = DBDeliveryRider(
            full_name=full_name,
            phone=phone,
            email=(payload.email or "").strip(),
            vehicle_type=(payload.vehicle_type or "").strip(),
            vehicle_number=(payload.vehicle_number or "").strip(),
            status=(payload.status or "active").strip().lower() if payload.status else "active",
            notes=(payload.notes or "").strip(),
        )
        if rider.status not in ["active", "inactive"]:
            rider.status = "active"
        db.add(rider)
        db.commit()
        db.refresh(rider)
        data = rider_to_dict(rider)
        create_admin_audit_log(request, admin, "rider_created", "rider", rider.id, f"Admin created rider {rider.full_name}", {"rider": data})
        return {"success": True, "message": "Rider created successfully", "rider": data, "data": data}
    finally:
        db.close()


@app.patch("/admin/riders/{rider_id}")
def update_rider(rider_id: int, payload: RiderUpdatePayload, request: Request):
    admin = require_any_permission(request, ["delivery:manage", "orders:delivery"])
    updates = payload.dict(exclude_unset=True)
    db = SessionLocal()
    try:
        rider = db.query(DBDeliveryRider).filter(DBDeliveryRider.id == rider_id).first()
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found")
        old_data = rider_to_dict(rider)
        for field in ["full_name", "phone", "email", "vehicle_type", "vehicle_number", "status", "notes"]:
            if field in updates and updates[field] is not None:
                value = updates[field].strip() if isinstance(updates[field], str) else updates[field]
                if field in ["full_name", "phone"] and not value:
                    raise HTTPException(status_code=400, detail="Rider name and phone are required")
                if field == "status":
                    value = str(value or "active").lower()
                    if value not in ["active", "inactive"]:
                        value = "active"
                setattr(rider, field, value)
        rider.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(rider)
        data = rider_to_dict(rider)
        create_admin_audit_log(request, admin, "rider_updated", "rider", rider.id, f"Admin updated rider {rider.full_name}", {"before": old_data, "after": data})
        return {"success": True, "message": "Rider updated successfully", "rider": data, "data": data}
    finally:
        db.close()


@app.delete("/admin/riders/{rider_id}")
def deactivate_rider(rider_id: int, request: Request):
    admin = require_any_permission(request, ["delivery:manage", "orders:delivery"])
    db = SessionLocal()
    try:
        rider = db.query(DBDeliveryRider).filter(DBDeliveryRider.id == rider_id).first()
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found")
        rider.status = "inactive"
        rider.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(rider)
        data = rider_to_dict(rider)
        create_admin_audit_log(request, admin, "rider_deactivated", "rider", rider.id, f"Admin deactivated rider {rider.full_name}", {"rider": data})
        return {"success": True, "message": "Rider deactivated successfully", "rider": data, "data": data}
    finally:
        db.close()


@app.patch("/admin/orders/{order_id}/assign-rider")
def assign_rider_to_order(order_id: int, payload: AssignRiderPayload, request: Request):
    admin = require_any_permission(request, ["delivery:manage", "orders:delivery"])
    db = SessionLocal()
    try:
        order = active_order_filter(db.query(DBOrder)).filter(DBOrder.id == order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        rider = db.query(DBDeliveryRider).filter(DBDeliveryRider.id == payload.rider_id).first()
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found")
        if rider.status != "active":
            raise HTTPException(status_code=400, detail="Rider must be active before assignment")

        order.rider_id = rider.id
        order.rider_name = rider.full_name
        order.rider_phone = rider.phone
        order.rider_vehicle_type = rider.vehicle_type or ""
        order.rider_vehicle_number = rider.vehicle_number or ""
        order.delivery_note = payload.delivery_note or ""
        order.delivery_assigned_at = datetime.utcnow()
        if payload.mark_out_for_delivery:
            order.status = "out_for_delivery"
            order.order_status = "out_for_delivery"
            order.fulfillment_status = "out_for_delivery"
            order.delivery_started_at = order.delivery_started_at or datetime.utcnow()
            if order.delivery_method == "delivery" and not order.delivery_code:
                order.delivery_code = "{:06d}".format(random.randint(0, 999999))
                order.delivery_code_created_at = datetime.utcnow()
        order.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(order)
        order_data = order_to_dict(order)
        rider_data = rider_to_dict(rider)

        if order_data.get("customer_email"):
            _create_order_notification(
                order_data,
                "Delivery Rider Assigned",
                f"A delivery rider has been assigned to your order {order_data.get('order_code')}. Rider: {rider.full_name}. Phone: {rider.phone}.",
                "delivery_update",
                "delivery",
            )
            safe_email_call(
                "customer_rider_assigned",
                send_customer_order_email,
                order_data,
                "rider_assigned",
                {"rider_name": rider.full_name, "rider_phone": rider.phone},
            )
            if payload.mark_out_for_delivery:
                _create_order_notification(
                    order_data,
                    "Out for Delivery",
                    f"Your order {order_data.get('order_code')} is out for delivery. The dispatch rider will provide the delivery confirmation code when they arrive. Enter it in the app only after you have received your order.",
                    "delivery_update",
                    "delivery",
                )
                safe_email_call("customer_out_for_delivery", send_customer_order_email, order_data, "out_for_delivery")

        create_admin_audit_log(
            request,
            admin,
            "rider_assigned",
            "order",
            order.id,
            f"Admin assigned rider {rider.full_name} to order {order.order_code}",
            {"order_code": order.order_code, "rider": rider_data, "delivery_note": payload.delivery_note or ""},
        )
        return {"success": True, "message": "Rider assigned successfully", "order": order_data, "data": order_data}
    finally:
        db.close()


@app.patch("/admin/orders/{order_id}")
def update_order(order_id: int, payload: dict, request: Request):
    payment_update_requested = any(key in payload for key in ["payment_status", "status"]) and (
        payload.get("payment_status") in ["payment_confirmed", "payment_rejected", "receipt_submitted"]
        or payload.get("status") in ["payment_confirmed", "payment_rejected", "receipt_submitted"]
    )
    order_update_requested = any(key in payload for key in ["order_status", "fulfillment_status", "delivery_code", "admin_note", "service_note"])
    if payment_update_requested:
        admin = require_permission(request, "payments:approve")
    elif order_update_requested:
        admin = require_permission(request, "orders:update")
    else:
        admin = require_permission(request, "orders:update")
    db = SessionLocal()
    try:
        order = active_order_filter(db.query(DBOrder)).filter(DBOrder.id == order_id).first()
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
        if order.order_status == "out_for_delivery" or order.fulfillment_status == "out_for_delivery" or order.status == "out_for_delivery":
            order.delivery_started_at = order.delivery_started_at or datetime.utcnow()
        if order.order_status == "delivered" or order.fulfillment_status == "delivered" or order.status == "delivered":
            order.delivery_completed_at = order.delivery_completed_at or datetime.utcnow()
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
                    rejection_reason = payload.get("rejection_reason") or payload.get("reason") or payload.get("admin_note") or ""
                    reason_text = f" Reason: {rejection_reason}." if rejection_reason else ""
                    _create_order_notification(order_data, "Payment Rejected",
                        f"Your payment receipt for order {order_code} was rejected.{reason_text} Please upload a clearer receipt or contact support.",
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
            note = payload.get("note") or payload.get("admin_note") or ""
            payment_log = create_payment_approval_log(db, request, admin, order, "payment_confirmed", old_payment_status, order.payment_status, note=note)
            db.commit()
            db.refresh(payment_log)
            create_admin_audit_log(request, admin, "payment_confirmed", "order", order.id, f"Admin confirmed payment for order {order.order_code}", {"order_code": order.order_code, "payment_log": payment_audit_log_to_dict(payment_log)})
            safe_email_call("customer_payment_confirmed", send_customer_order_email, order_data, "payment_confirmed")
        if order.payment_status != old_payment_status and order.payment_status == "payment_rejected":
            rejection_reason = payload.get("rejection_reason") or payload.get("reason") or payload.get("admin_note") or ""
            payment_log = create_payment_approval_log(db, request, admin, order, "payment_rejected", old_payment_status, order.payment_status, rejection_reason=rejection_reason)
            db.commit()
            db.refresh(payment_log)
            create_admin_audit_log(request, admin, "payment_rejected", "order", order.id, f"Admin rejected payment for order {order.order_code}", {"order_code": order.order_code, "payment_log": payment_audit_log_to_dict(payment_log)})
            safe_email_call("customer_payment_rejected", send_customer_order_email, order_data, "payment_rejected", {"reason": rejection_reason})
        if generated_delivery_code:
            create_admin_audit_log(request, admin, "delivery_code_generated", "order", order.id, f"Admin generated delivery code for order {order.order_code}", {"order_code": order.order_code})

        delivery_statuses = {
            value
            for old_value, value in [
                (old_order_status, order.order_status),
                (old_fulfillment_status, order.fulfillment_status),
                (old_status, order.status),
            ]
            if old_value != value
        }
        if "out_for_delivery" in delivery_statuses:
            safe_email_call("customer_out_for_delivery", send_customer_order_email, order_data, "out_for_delivery")
        if "delivered" in delivery_statuses:
            safe_email_call("customer_delivered", send_customer_order_email, order_data, "delivered")

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
        order = active_order_filter(db.query(DBOrder)).filter(DBOrder.id == order_id).first()
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
        order.delivery_completed_at = order.delivery_completed_at or datetime.utcnow()
        order.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(order)
        data = order_to_dict(order)
        safe_email_call("customer_delivery_confirmed", send_customer_order_email, data, "delivered")
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
    require_permission(request, "stock:view")
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
    admin = require_permission(request, "stock:manage")
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
    admin = require_permission(request, "stock:manage")
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
    admin = require_permission(request, "stock:manage")
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
    require_permission(request, "stock:view")
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
    admin = require_permission(request, "stock:manage")
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
    admin = require_permission(request, "stock:manage")
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
    admin = require_permission(request, "stock:manage")
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
    require_permission(request, "customers:view")

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
                active_order_filter(db.query(DBOrder))
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


@app.get("/admin/orders/{order_id}/payment-audit")
def get_order_payment_audit(order_id: int, request: Request):
    require_any_permission(request, ["payments:view", "payments:approve"])
    db = SessionLocal()
    try:
        logs = [
            payment_audit_log_to_dict(log)
            for log in db.query(DBPaymentApprovalLog)
            .filter(DBPaymentApprovalLog.order_id == order_id)
            .order_by(DBPaymentApprovalLog.created_at.desc(), DBPaymentApprovalLog.id.desc())
            .all()
        ]
        return {"success": True, "logs": logs, "data": logs}
    finally:
        db.close()


@app.get("/admin/payment-audit")
def get_payment_audit_logs(
    request: Request,
    order_id: Optional[int] = None,
    admin_email: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 100,
):
    require_any_permission(request, ["payments:view", "audit:view"])
    db = SessionLocal()
    try:
        query = db.query(DBPaymentApprovalLog)
        if order_id:
            query = query.filter(DBPaymentApprovalLog.order_id == order_id)
        if admin_email:
            query = query.filter(DBPaymentApprovalLog.admin_email == admin_email.strip().lower())
        if action:
            query = query.filter(DBPaymentApprovalLog.action == action)
        safe_limit = max(1, min(int(limit or 100), 500))
        logs = [
            payment_audit_log_to_dict(log)
            for log in query.order_by(DBPaymentApprovalLog.created_at.desc(), DBPaymentApprovalLog.id.desc()).limit(safe_limit).all()
        ]
        return {"success": True, "logs": logs, "data": logs}
    finally:
        db.close()


@app.get("/admin/reports/summary")
def admin_reports_summary(request: Request, start_date: Optional[str] = None, end_date: Optional[str] = None):
    require_permission(request, "reports:view")
    now = datetime.utcnow()
    start_dt = parse_report_date(start_date, now - timedelta(days=30))
    end_dt = parse_report_date(end_date, now)
    end_exclusive = end_dt + timedelta(days=1)
    db = SessionLocal()
    try:
        orders = (
            active_order_filter(db.query(DBOrder))
            .filter(DBOrder.created_at >= start_dt, DBOrder.created_at < end_exclusive)
            .order_by(DBOrder.created_at.desc(), DBOrder.id.desc())
            .all()
        )
        products = db.query(DBProduct).all()
        low_stock_threshold = 5

        payment_statuses = [str(order.payment_status or order.status or "pending_payment").lower() for order in orders]
        order_statuses = [str(order.order_status or order.fulfillment_status or order.status or "order_placed").lower() for order in orders]
        total_order_value = sum(float(order.total_amount or 0) for order in orders)
        confirmed_revenue = sum(float(order.total_amount or 0) for order in orders if str(order.payment_status or "").lower() == "payment_confirmed")
        active_customers = len({order.customer_email for order in orders if order.customer_email}) or db.query(DBUser).filter(DBUser.role == "customer").count()
        low_stock_products = [
            product for product in products
            if int(product.stock_qty if product.stock_qty is not None else product.stock or 0) > 0
            and int(product.stock_qty if product.stock_qty is not None else product.stock or 0) <= low_stock_threshold
        ]
        out_of_stock_products = [
            product for product in products
            if int(product.stock_qty if product.stock_qty is not None else product.stock or 0) <= 0
        ]

        revenue_by_day_map = {}
        top_products_map = {}
        for order in orders:
            day = (order.created_at or now).date().isoformat()
            day_data = revenue_by_day_map.setdefault(day, {"date": day, "revenue": 0, "confirmed_revenue": 0, "orders": 0})
            amount = float(order.total_amount or 0)
            day_data["revenue"] += amount
            if str(order.payment_status or "").lower() == "payment_confirmed":
                day_data["confirmed_revenue"] += amount
            day_data["orders"] += 1

            for item in order.items or []:
                quantity = int(item.quantity or item.qty or 1)
                price = float(item.unit_price or item.price or 0)
                line_total = float(item.line_total or (price * quantity))
                product_id = item.product_id or 0
                name = item.name or item.product_name or "FoodNova Item"
                key = product_id or name.lower()
                current = top_products_map.setdefault(key, {
                    "product_id": product_id,
                    "name": name,
                    "quantity_sold": 0,
                    "revenue": 0,
                })
                current["quantity_sold"] += quantity
                current["revenue"] += line_total

        recent_orders = [
            {
                "id": order.id,
                "order_code": order.order_code or "",
                "customer_name": order.customer_name or "",
                "total_amount": order.total_amount or 0,
                "payment_status": order.payment_status or order.status or "",
                "order_status": order.order_status or order.fulfillment_status or order.status or "",
                "created_at": iso(order.created_at),
            }
            for order in orders[:10]
        ]

        summary = {
            "total_orders": len(orders),
            "total_revenue": confirmed_revenue,
            "total_order_value": total_order_value,
            "confirmed_revenue": confirmed_revenue,
            "pending_payments": payment_statuses.count("pending_payment") + payment_statuses.count("receipt_submitted"),
            "confirmed_payments": payment_statuses.count("payment_confirmed"),
            "rejected_payments": payment_statuses.count("payment_rejected"),
            "delivered_orders": order_statuses.count("delivered"),
            "cancelled_orders": order_statuses.count("cancelled"),
            "active_customers": active_customers,
            "low_stock_products": len(low_stock_products),
            "out_of_stock_products": len(out_of_stock_products),
            "assigned_deliveries": len([order for order in orders if order.rider_id or order.rider_name]),
            "out_for_delivery_orders": order_statuses.count("out_for_delivery"),
        }
        payload = {
            "success": True,
            "range": {
                "start_date": start_dt.date().isoformat(),
                "end_date": end_dt.date().isoformat(),
            },
            "summary": summary,
            "orders_by_status": report_status_counts(order_statuses, ["order_placed", "processing", "ready_for_pickup", "out_for_delivery", "delivered", "cancelled"]),
            "payments_by_status": report_status_counts(payment_statuses, ["pending_payment", "receipt_submitted", "payment_confirmed", "payment_rejected"]),
            "revenue_by_day": sorted(revenue_by_day_map.values(), key=lambda item: item["date"]),
            "top_products": sorted(top_products_map.values(), key=lambda item: item["revenue"], reverse=True)[:10],
            "low_stock": [
                {
                    "id": product.id,
                    "name": product.name or "",
                    "stock_qty": int(product.stock_qty if product.stock_qty is not None else product.stock or 0),
                    "category": product.category or product.category_name or "",
                }
                for product in low_stock_products[:10]
            ],
            "recent_orders": recent_orders,
        }
        payload["data"] = summary
        return payload
    finally:
        db.close()


@app.get("/admin/export/orders")
def export_orders(request: Request):
    require_export_permission(request)
    db = SessionLocal()
    try:
        columns = ["order_id", "order_code", "customer_name", "customer_phone", "customer_email", "total_amount", "payment_status", "order_status", "delivery_method", "created_at", "updated_at"]
        rows = [
            {
                "order_id": order.id,
                "order_code": order.order_code,
                "customer_name": order.customer_name or "",
                "customer_phone": order.customer_phone or order.phone or "",
                "customer_email": order.customer_email or "",
                "total_amount": order.total_amount or 0,
                "payment_status": order.payment_status or "",
                "order_status": order.order_status or order.fulfillment_status or order.status or "",
                "delivery_method": order.delivery_method or "",
                "created_at": iso(order.created_at),
                "updated_at": iso(order.updated_at),
            }
            for order in active_order_filter(db.query(DBOrder)).order_by(DBOrder.created_at.desc(), DBOrder.id.desc()).all()
        ]
        return csv_download_response("orders", columns, rows)
    finally:
        db.close()


@app.get("/admin/export/customers")
def export_customers(request: Request):
    require_export_permission(request)
    db = SessionLocal()
    try:
        columns = ["customer_id", "name", "email", "phone", "created_at", "total_orders"]
        rows = []
        for user in db.query(DBUser).filter(DBUser.role == "customer").order_by(DBUser.created_at.desc(), DBUser.id.desc()).all():
            total_orders = active_order_filter(db.query(DBOrder)).filter(DBOrder.customer_email == user.email).count()
            rows.append({
                "customer_id": user.id,
                "name": user.full_name or "Customer",
                "email": user.email or "",
                "phone": user.phone or "",
                "created_at": iso(user.created_at),
                "total_orders": total_orders,
            })
        return csv_download_response("customers", columns, rows)
    finally:
        db.close()


@app.get("/admin/export/products")
def export_products(request: Request):
    require_export_permission(request)
    db = SessionLocal()
    try:
        columns = ["product_id", "name", "category", "price", "stock_qty", "active", "low_stock", "out_of_stock"]
        rows = []
        low_stock_threshold = 5
        for product in db.query(DBProduct).order_by(DBProduct.name.asc()).all():
            stock_qty = int(product.stock_qty if product.stock_qty is not None else product.stock or 0)
            rows.append({
                "product_id": product.id,
                "name": product.name or "",
                "category": product.category or product.category_name or "",
                "price": product.price or 0,
                "stock_qty": stock_qty,
                "active": bool(product.is_active),
                "low_stock": stock_qty > 0 and stock_qty <= low_stock_threshold,
                "out_of_stock": stock_qty <= 0,
            })
        return csv_download_response("products", columns, rows)
    finally:
        db.close()


@app.get("/admin/export/payments")
def export_payments(request: Request):
    require_export_permission(request)
    db = SessionLocal()
    try:
        columns = ["order_code", "customer_name", "amount", "payment_status", "receipt_uploaded", "approved_by", "approved_at", "rejected_reason"]
        rows = []
        for order in active_order_filter(db.query(DBOrder)).order_by(DBOrder.created_at.desc(), DBOrder.id.desc()).all():
            latest_log = (
                db.query(DBPaymentApprovalLog)
                .filter(DBPaymentApprovalLog.order_id == order.id)
                .order_by(DBPaymentApprovalLog.created_at.desc(), DBPaymentApprovalLog.id.desc())
                .first()
            )
            receipt = json_load(order.receipt, None)
            rows.append({
                "order_code": order.order_code or "",
                "customer_name": order.customer_name or "",
                "amount": order.total_amount or 0,
                "payment_status": order.payment_status or order.status or "",
                "receipt_uploaded": bool(receipt),
                "approved_by": latest_log.admin_name if latest_log and latest_log.action == "payment_confirmed" else "",
                "approved_at": iso(latest_log.created_at) if latest_log and latest_log.action == "payment_confirmed" else "",
                "rejected_reason": latest_log.rejection_reason if latest_log and latest_log.action == "payment_rejected" else "",
            })
        return csv_download_response("payments", columns, rows)
    finally:
        db.close()


@app.get("/admin/export/cancellations")
def export_cancellations(request: Request):
    require_export_permission(request)
    db = SessionLocal()
    try:
        columns = ["request_id", "order_code", "customer_name", "request_type", "status", "reason", "admin_note", "requested_at", "reviewed_at"]
        rows = [
            {
                "request_id": item.id,
                "order_code": item.order_code or "",
                "customer_name": item.customer_name or "",
                "request_type": item.request_type or "",
                "status": item.status or "",
                "reason": item.reason or "",
                "admin_note": item.admin_note or "",
                "requested_at": iso(item.requested_at),
                "reviewed_at": iso(item.reviewed_at),
            }
            for item in db.query(DBCancellationRequest).order_by(DBCancellationRequest.created_at.desc(), DBCancellationRequest.id.desc()).all()
        ]
        return csv_download_response("cancellations", columns, rows)
    finally:
        db.close()


@app.get("/admin/export/riders")
def export_riders(request: Request):
    require_export_permission(request)
    db = SessionLocal()
    try:
        columns = ["rider_id", "full_name", "phone", "vehicle_type", "vehicle_number", "status", "created_at"]
        rows = [
            {
                "rider_id": rider.id,
                "full_name": rider.full_name or "",
                "phone": rider.phone or "",
                "vehicle_type": rider.vehicle_type or "",
                "vehicle_number": rider.vehicle_number or "",
                "status": rider.status or "",
                "created_at": iso(rider.created_at),
            }
            for rider in db.query(DBDeliveryRider).order_by(DBDeliveryRider.created_at.desc(), DBDeliveryRider.id.desc()).all()
        ]
        return csv_download_response("riders", columns, rows)
    finally:
        db.close()


@app.get("/admin/export/audit-logs")
def export_audit_logs(request: Request):
    require_export_permission(request)
    db = SessionLocal()
    try:
        columns = ["id", "admin_name", "admin_email", "action", "entity_type", "entity_id", "description", "created_at", "ip_address"]
        rows = [
            {
                "id": log.id,
                "admin_name": log.admin_name or "",
                "admin_email": log.admin_email or "",
                "action": log.action or "",
                "entity_type": log.entity_type or "",
                "entity_id": log.entity_id or "",
                "description": log.description or "",
                "created_at": iso(log.created_at),
                "ip_address": log.ip_address or "",
            }
            for log in db.query(DBAdminAuditLog).order_by(DBAdminAuditLog.created_at.desc(), DBAdminAuditLog.id.desc()).all()
        ]
        return csv_download_response("audit-logs", columns, rows)
    finally:
        db.close()


@app.get("/admin/users")
def get_admin_users(request: Request):
    require_permission(request, "admins:view")
    db = SessionLocal()
    try:
        admins = [admin_user_to_dict(user) for user in db.query(DBUser).filter(DBUser.role == "admin").order_by(DBUser.created_at.desc(), DBUser.id.desc()).all()]
        return {"success": True, "admins": admins, "data": admins}
    finally:
        db.close()


@app.get("/admin/cancellation-requests")
def get_cancellation_requests(request: Request, status: Optional[str] = None, request_type: Optional[str] = None, limit: int = 100):
    require_any_permission(request, ["cancellations:view", "cancellations:manage", "orders:update", "payments:approve"])
    db = SessionLocal()
    try:
        query = db.query(DBCancellationRequest)
        if status:
            query = query.filter(DBCancellationRequest.status == status)
        if request_type:
            query = query.filter(DBCancellationRequest.request_type == request_type)
        safe_limit = max(1, min(int(limit or 100), 500))
        requests = []
        for item in query.order_by(DBCancellationRequest.created_at.desc(), DBCancellationRequest.id.desc()).limit(safe_limit).all():
            order = active_order_filter(db.query(DBOrder)).filter(DBOrder.id == item.order_id).first()
            requests.append(cancellation_request_to_dict(item, order))
        return {"success": True, "requests": requests, "data": requests}
    finally:
        db.close()


@app.get("/admin/cancellation-requests/{request_id}")
def get_cancellation_request(request_id: int, request: Request):
    require_any_permission(request, ["cancellations:view", "cancellations:manage", "orders:update", "payments:approve"])
    db = SessionLocal()
    try:
        item = db.query(DBCancellationRequest).filter(DBCancellationRequest.id == request_id).first()
        if not item:
            raise HTTPException(status_code=404, detail="Cancellation request not found")
        order = active_order_filter(db.query(DBOrder)).filter(DBOrder.id == item.order_id).first()
        data = cancellation_request_to_dict(item, order)
        return {"success": True, "request": data, "data": data}
    finally:
        db.close()


@app.patch("/admin/cancellation-requests/{request_id}/approve")
def approve_cancellation_request(request_id: int, payload: CancellationReviewPayload, request: Request):
    admin = require_any_permission(request, ["cancellations:manage", "orders:update", "payments:approve"])
    db = SessionLocal()
    try:
        item = db.query(DBCancellationRequest).filter(DBCancellationRequest.id == request_id).first()
        if not item:
            raise HTTPException(status_code=404, detail="Cancellation request not found")
        order = active_order_filter(db.query(DBOrder)).filter(DBOrder.id == item.order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        item.status = "approved"
        item.admin_note = payload.admin_note or ""
        item.reviewed_by_admin_id = admin.get("id")
        item.reviewed_by_admin_name = admin.get("full_name") or admin.get("name") or "Admin"
        item.reviewed_by_admin_email = admin.get("email") or ""
        item.reviewed_at = datetime.utcnow()
        item.updated_at = datetime.utcnow()
        order.cancellation_status = "approved"
        order.cancellation_reviewed_at = item.reviewed_at
        order.order_status = "cancelled"
        order.fulfillment_status = "cancelled"
        order.status = "cancelled"
        if item.request_type == "refund" or order.payment_status in ["payment_confirmed", "confirmed"]:
            order.refund_status = payload.refund_status or "approved"
        order.refund_note = payload.admin_note or order.refund_note or ""
        order.updated_at = datetime.utcnow()
        restocked = restock_order_inventory(db, order)
        db.commit()
        db.refresh(item)
        db.refresh(order)
        order_data = order_to_dict(order)
        request_data = cancellation_request_to_dict(item, order)
        _create_order_notification(order_data, "Cancellation request approved", f"Your cancellation/refund request for order {order.order_code} has been approved.", "order_update", "order")
        safe_email_call("customer_cancellation_approved", send_customer_order_email, order_data, "cancellation_approved")
        create_admin_audit_log(request, admin, "cancellation_request_approved", "order", order.id, f"Admin approved cancellation/refund request for order {order.order_code}", {"request": request_data})
        if restocked:
            create_admin_audit_log(request, admin, "inventory_restocked", "order", order.id, f"Inventory restocked after cancellation approval for order {order.order_code}", {"restocked": restocked})
        return {"success": True, "message": "Cancellation request approved", "request": request_data, "order": order_data, "data": request_data}
    finally:
        db.close()


@app.patch("/admin/cancellation-requests/{request_id}/reject")
def reject_cancellation_request(request_id: int, payload: CancellationReviewPayload, request: Request):
    admin = require_any_permission(request, ["cancellations:manage", "orders:update", "payments:approve"])
    reason = (payload.rejection_reason or payload.admin_note or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Rejection reason is required")
    db = SessionLocal()
    try:
        item = db.query(DBCancellationRequest).filter(DBCancellationRequest.id == request_id).first()
        if not item:
            raise HTTPException(status_code=404, detail="Cancellation request not found")
        order = active_order_filter(db.query(DBOrder)).filter(DBOrder.id == item.order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        item.status = "rejected"
        item.admin_note = reason
        item.reviewed_by_admin_id = admin.get("id")
        item.reviewed_by_admin_name = admin.get("full_name") or admin.get("name") or "Admin"
        item.reviewed_by_admin_email = admin.get("email") or ""
        item.reviewed_at = datetime.utcnow()
        item.updated_at = datetime.utcnow()
        order.cancellation_status = "rejected"
        order.cancellation_reviewed_at = item.reviewed_at
        if item.request_type == "refund":
            order.refund_status = "rejected"
        order.refund_note = reason
        order.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(item)
        db.refresh(order)
        order_data = order_to_dict(order)
        request_data = cancellation_request_to_dict(item, order)
        _create_order_notification(order_data, "Cancellation request rejected", f"Your cancellation/refund request for order {order.order_code} was rejected. Reason: {reason}", "order_update", "order")
        safe_email_call("customer_cancellation_rejected", send_customer_order_email, order_data, "cancellation_rejected", {"reason": reason})
        create_admin_audit_log(request, admin, "cancellation_request_rejected", "order", order.id, f"Admin rejected cancellation/refund request for order {order.order_code}", {"request": request_data})
        return {"success": True, "message": "Cancellation request rejected", "request": request_data, "order": order_data, "data": request_data}
    finally:
        db.close()


@app.post("/admin/users")
def create_admin_user(payload: AdminUserPayload, request: Request):
    try:
        admin = require_permission(request, "admins:manage")
        full_name = (payload.full_name or payload.name or payload.fullName or "").strip()
        email = str(payload.email or "").lower().strip()
        password = payload.password or ""
        confirm_password = payload.confirm_password or payload.confirmPassword
        if not full_name:
            raise HTTPException(status_code=400, detail="Full name is required.")
        if not email:
            raise HTTPException(status_code=400, detail="Email is required.")
        if len(password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
        if confirm_password is not None and confirm_password != password:
            raise HTTPException(status_code=400, detail="Passwords do not match.")
        raw_permissions = payload.permissions
        if raw_permissions is None and payload.permissions_json is not None:
            raw_permissions = json_load(payload.permissions_json, payload.permissions_json) if isinstance(payload.permissions_json, str) else payload.permissions_json
        admin_role, permissions = validate_assignable_permissions(admin, payload.admin_role or "viewer", raw_permissions)

        db = SessionLocal()
        try:
            if get_db_user_by_email(db, email):
                raise HTTPException(status_code=400, detail="Email already exists.")
            new_admin = DBUser(
                full_name=full_name,
                email=email,
                phone=payload.phone or "",
                password=_hash_new_password(password),
                role="admin",
                admin_role=admin_role,
                permissions_json=json_dump(permissions),
                is_active=payload.is_active is not False,
            )
            db.add(new_admin)
            db.commit()
            db.refresh(new_admin)
            data = admin_user_to_dict(new_admin)
            create_admin_audit_log(
                request,
                admin,
                "admin_user_created",
                "admin_user",
                new_admin.id,
                f"{admin.get('full_name') or admin.get('email')} created admin user {new_admin.email}",
                {"admin_email": new_admin.email, "admin_role": admin_role, "permissions": permissions},
            )
            return {"success": True, "message": "Admin user created successfully", "admin": data, "data": data}
        finally:
            db.close()
    except HTTPException:
        raise
    except Exception as error:
        print("CREATE ADMIN USER ERROR:", repr(error))
        raise HTTPException(status_code=500, detail=f"Create admin failed: {str(error)}")


@app.patch("/admin/users/{admin_id}")
def update_admin_user(admin_id: int, payload: AdminUserUpdatePayload, request: Request):
    admin = require_permission(request, "admins:manage")
    db = SessionLocal()
    try:
        target = db.query(DBUser).filter(DBUser.id == admin_id, DBUser.role == "admin").first()
        if not target:
            raise HTTPException(status_code=404, detail="Admin user not found")
        old_data = admin_user_to_dict(target)
        if payload.full_name is not None:
            if not payload.full_name.strip():
                raise HTTPException(status_code=400, detail="Full name is required")
            target.full_name = payload.full_name.strip()
        if payload.phone is not None:
            target.phone = payload.phone
        if payload.admin_role is not None or payload.permissions is not None:
            target_role, target_permissions = validate_assignable_permissions(admin, payload.admin_role or target.admin_role, payload.permissions)
            target.admin_role = target_role
            target.permissions_json = json_dump(target_permissions)
        if payload.is_active is not None:
            if admin_id == admin.get("id") and payload.is_active is False:
                raise HTTPException(status_code=400, detail="You cannot deactivate your own admin account")
            target.is_active = bool(payload.is_active)
        target.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(target)
        data = admin_user_to_dict(target)
        create_admin_audit_log(request, admin, "admin_user_updated", "admin_user", target.id, f"{admin.get('full_name') or admin.get('email')} updated admin user {target.email}", {"before": old_data, "after": data})
        return {"success": True, "message": "Admin user updated successfully", "admin": data, "data": data}
    finally:
        db.close()


@app.patch("/admin/users/{admin_id}/password")
def reset_admin_password(admin_id: int, payload: AdminPasswordResetPayload, request: Request):
    admin = require_permission(request, "admins:manage")
    password = payload.new_password or ""
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if payload.confirm_password is not None and payload.confirm_password != password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    db = SessionLocal()
    try:
        target = db.query(DBUser).filter(DBUser.id == admin_id, DBUser.role == "admin").first()
        if not target:
            raise HTTPException(status_code=404, detail="Admin user not found")
        target.password = _hash_new_password(password)
        target.updated_at = datetime.utcnow()
        db.commit()
        data = admin_user_to_dict(target)
        create_admin_audit_log(request, admin, "admin_password_reset", "admin_user", target.id, f"{admin.get('full_name') or admin.get('email')} reset password for admin user {target.email}", {"admin_email": target.email})
        return {"success": True, "message": "Admin password reset successfully", "admin": data, "data": data}
    finally:
        db.close()


@app.delete("/admin/users/{admin_id}")
def deactivate_admin_user(admin_id: int, request: Request):
    admin = require_permission(request, "admins:manage")
    if admin_id == admin.get("id"):
        raise HTTPException(status_code=400, detail="You cannot deactivate your own admin account")
    db = SessionLocal()
    try:
        target = db.query(DBUser).filter(DBUser.id == admin_id, DBUser.role == "admin").first()
        if not target:
            raise HTTPException(status_code=404, detail="Admin user not found")
        target.is_active = False
        target.updated_at = datetime.utcnow()
        db.commit()
        data = admin_user_to_dict(target)
        create_admin_audit_log(request, admin, "admin_user_deactivated", "admin_user", target.id, f"{admin.get('full_name') or admin.get('email')} deactivated admin user {target.email}", {"admin_email": target.email})
        return {"success": True, "message": "Admin user deactivated successfully", "admin": data, "data": data}
    finally:
        db.close()


ANNOUNCEMENT_DISPLAY_TYPES = {"top_bar", "hero_banner", "popup"}
ANNOUNCEMENT_THEMES = {"green", "yellow", "dark", "light", "promo", "urgent"}


def clean_announcement_payload(data: dict, partial: bool = False) -> dict:
    cleaned = {}
    for key, value in data.items():
        if isinstance(value, str):
            value = value.strip()
        cleaned[key] = value

    if not partial or "title" in cleaned:
        if not cleaned.get("title"):
            raise HTTPException(status_code=400, detail="Announcement title is required")
    if not partial or "message" in cleaned:
        if not cleaned.get("message"):
            raise HTTPException(status_code=400, detail="Announcement message is required")

    display_type = cleaned.get("display_type")
    if display_type is not None:
        display_type = str(display_type or "top_bar").strip() or "top_bar"
        if display_type not in ANNOUNCEMENT_DISPLAY_TYPES:
            raise HTTPException(status_code=400, detail="Invalid announcement display type")
        cleaned["display_type"] = display_type

    theme = cleaned.get("theme")
    if theme is not None:
        theme = str(theme or "green").strip() or "green"
        if theme not in ANNOUNCEMENT_THEMES:
            raise HTTPException(status_code=400, detail="Invalid announcement theme")
        cleaned["theme"] = theme

    if "priority" in cleaned and cleaned["priority"] is not None:
        cleaned["priority"] = int(cleaned["priority"])

    return cleaned


@app.get("/announcements/active")
def get_active_announcements():
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        announcements = [
            announcement_to_dict(announcement)
            for announcement in db.query(DBAnnouncement)
            .filter(DBAnnouncement.is_active == True)
            .filter(or_(DBAnnouncement.start_date == None, DBAnnouncement.start_date <= now))
            .filter(or_(DBAnnouncement.end_date == None, DBAnnouncement.end_date >= now))
            .order_by(DBAnnouncement.priority.desc(), DBAnnouncement.created_at.desc(), DBAnnouncement.id.desc())
            .all()
        ]
        return {"success": True, "announcements": announcements, "data": announcements}
    except Exception as error:
        print("ACTIVE ANNOUNCEMENTS LOAD ERROR:", repr(error))
        return {"success": True, "announcements": [], "data": []}
    finally:
        db.close()


@app.get("/admin/announcements")
def get_admin_announcements(request: Request):
    require_any_permission(request, ["announcements:view", "announcements:manage"])
    db = SessionLocal()
    try:
        announcements = [
            announcement_to_dict(announcement)
            for announcement in db.query(DBAnnouncement)
            .order_by(DBAnnouncement.priority.desc(), DBAnnouncement.created_at.desc(), DBAnnouncement.id.desc())
            .all()
        ]
        return {"success": True, "announcements": announcements, "data": announcements}
    except Exception as error:
        print("ADMIN ANNOUNCEMENTS LOAD ERROR:", repr(error))
        return {"success": True, "announcements": [], "data": []}
    finally:
        db.close()


@app.post("/admin/uploads/announcement-image")
async def upload_announcement_image(request: Request, file: UploadFile = File(...)):
    require_any_permission(request, ["announcements:manage"])
    image_url = await save_uploaded_image(file, ANNOUNCEMENT_UPLOAD_DIR, "announcement")
    return {"success": True, "image_url": image_url, "url": image_url, "data": {"image_url": image_url}}


@app.post("/admin/announcements")
def create_announcement(payload: AnnouncementPayload, request: Request):
    admin = require_permission(request, "announcements:manage")
    data = clean_announcement_payload(payload.dict())
    db = SessionLocal()
    try:
        announcement = DBAnnouncement(
            title=data["title"],
            message=data["message"],
            display_type=data.get("display_type") or "top_bar",
            button_text=data.get("button_text") or None,
            button_link=data.get("button_link") or None,
            image_url=data.get("image_url") or None,
            theme=data.get("theme") or "green",
            priority=data.get("priority") or 0,
            is_active=data.get("is_active") is not False,
            start_date=data.get("start_date"),
            end_date=data.get("end_date"),
            created_by_admin_id=admin.get("id"),
            created_by_admin_name=admin.get("full_name") or admin.get("email") or "Admin",
        )
        db.add(announcement)
        db.commit()
        db.refresh(announcement)
        announcement_data = announcement_to_dict(announcement)
        create_admin_audit_log(request, admin, "announcement_created", "announcement", announcement.id, f"Admin created announcement {announcement.title}", {"announcement": announcement_data})
        return {"success": True, "message": "Announcement created successfully", "announcement": announcement_data, "data": announcement_data}
    finally:
        db.close()


@app.patch("/admin/announcements/{announcement_id}")
def update_announcement(announcement_id: int, payload: AnnouncementUpdatePayload, request: Request):
    admin = require_permission(request, "announcements:manage")
    updates = clean_announcement_payload(payload.dict(exclude_unset=True), partial=True)
    db = SessionLocal()
    try:
        announcement = db.query(DBAnnouncement).filter(DBAnnouncement.id == announcement_id).first()
        if not announcement:
            raise HTTPException(status_code=404, detail="Announcement not found")
        old_data = announcement_to_dict(announcement)
        for field in [
            "title", "message", "display_type", "button_text", "button_link", "image_url",
            "theme", "priority", "is_active", "start_date", "end_date",
        ]:
            if field in updates:
                setattr(announcement, field, updates[field])
        announcement.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(announcement)
        data = announcement_to_dict(announcement)
        action = "announcement_status_changed" if "is_active" in updates and len(updates) == 1 else "announcement_updated"
        create_admin_audit_log(request, admin, action, "announcement", announcement.id, f"Admin updated announcement {announcement.title}", {"before": old_data, "after": data})
        return {"success": True, "message": "Announcement updated successfully", "announcement": data, "data": data}
    finally:
        db.close()


@app.delete("/admin/announcements/{announcement_id}")
def delete_announcement(announcement_id: int, request: Request):
    admin = require_permission(request, "announcements:manage")
    db = SessionLocal()
    try:
        announcement = db.query(DBAnnouncement).filter(DBAnnouncement.id == announcement_id).first()
        if not announcement:
            raise HTTPException(status_code=404, detail="Announcement not found")
        old_data = announcement_to_dict(announcement)
        announcement.is_active = False
        announcement.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(announcement)
        data = announcement_to_dict(announcement)
        create_admin_audit_log(request, admin, "announcement_deactivated", "announcement", announcement.id, f"Admin deactivated announcement {announcement.title}", {"before": old_data, "after": data})
        return {"success": True, "message": "Announcement deactivated successfully", "announcement": data, "data": data}
    finally:
        db.close()


# ============================================
# BROADCAST ENDPOINTS
# ============================================

@app.post("/admin/broadcasts")
def create_broadcast(payload: BroadcastPayload, request: Request):
    """Create and send a broadcast message to all customers."""
    user = require_permission(request, "broadcasts:send")
    
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
    require_permission(request, "broadcasts:view")
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
    require_permission(request, "audit:view")
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
    admin = require_permission(request, "broadcasts:send")
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
    admin = require_permission(request, "broadcasts:send")
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

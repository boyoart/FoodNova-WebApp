from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from uuid import uuid4
import base64
import csv
import hashlib
import hmac
import io
import ipaddress
import json
import math
import os
import random
import traceback
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
from sqlalchemy import and_, func, inspect, or_, text

from database import Base, SessionLocal, engine
from email_service import (
    send_admin_order_email,
    send_customer_order_email,
    send_low_stock_alert,
)
from services.ninbvnportal_service import NINBVNPortalError, check_balance, check_provider_connectivity, ninbvnportal_config, current_nin_auth_mode, validate_ninbvnportal_config, verify_nin

try:
    import firebase_admin
    from firebase_admin import credentials, messaging
except Exception:
    firebase_admin = None
    credentials = None
    messaging = None
from models import (
    Address as DBAddress,
    Admin as DBAdmin,
    AdminAuditLog as DBAdminAuditLog,
    Announcement as DBAnnouncement,
    AppSetting as DBAppSetting,
    Broadcast as DBBroadcast,
    CancellationRequest as DBCancellationRequest,
    Notification as DBNotification,
    Order as DBOrder,
    OrderItem as DBOrderItem,
    Pack as DBPack,
    PaymentApprovalLog as DBPaymentApprovalLog,
    Product as DBProduct,
    ProductVariant as DBProductVariant,
    Profile as DBProfile,
    DeliveryRider as DBDeliveryRider,
    DeliveryOffer as DBDeliveryOffer,
    DeliveryWorker as DBDeliveryWorker,
    DeliveryAssignmentLog as DBDeliveryAssignmentLog,
    Rider as DBRider,
    RiderKyc as DBRiderKyc,
    RiderDocument as DBRiderDocument,
    RiderStatusLog as DBRiderStatusLog,
    VerificationLog as DBVerificationLog,
    RiderSession as DBRiderSession,
    DeletedRiderLog as DBDeletedRiderLog,
    AdminReview as DBAdminReview,
    OperationalZone as DBOperationalZone,
    User as DBUser,
)

try:
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
except Exception:
    pwd_context = None

try:
    from werkzeug.security import check_password_hash as werkzeug_check_password_hash
except Exception:
    werkzeug_check_password_hash = None

try:
    import cloudinary
    import cloudinary.uploader
except Exception:
    cloudinary = None

try:
    import socketio
except Exception:
    socketio = None

load_dotenv()

app = FastAPI(title="FoodNova API")
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
) if socketio else None
DIAGNOSTIC_ENDPOINTS = (
    "/delivery/me",
    "/delivery/stats",
    "/delivery/orders",
    "/delivery/offers",
    "/rider/go-online",
    "/delivery/go-offline",
    "/delivery/location-ping",
    "/notifications/register-fcm-token",
    "/delivery-workers/register-fcm-token",
)
nin_provider_config = validate_ninbvnportal_config()
if not nin_provider_config.get("configured"):
    print(f"WARNING: {nin_provider_config.get('message')}")
NIN_PROVIDER_HEALTH = {
    "healthy": False,
    "onboarding_verification_enabled": False,
    "message": "Provider health has not been checked yet.",
    "checked_at": None,
}
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
AVATAR_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "avatars")
PRODUCT_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "products")
PACK_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "packs")
ANNOUNCEMENT_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "announcements")
WORKFORCE_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "workforce")
RECEIPT_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "receipts")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(AVATAR_UPLOAD_DIR, exist_ok=True)
os.makedirs(PRODUCT_UPLOAD_DIR, exist_ok=True)
os.makedirs(PACK_UPLOAD_DIR, exist_ok=True)
os.makedirs(ANNOUNCEMENT_UPLOAD_DIR, exist_ok=True)
os.makedirs(WORKFORCE_UPLOAD_DIR, exist_ok=True)
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

def csv_env_values(name: str) -> List[str]:
    return [value.strip().rstrip("/") for value in os.environ.get(name, "").split(",") if value.strip()]


allowed_origins = [
    "capacitor://localhost",
    "ionic://localhost",
    "http://localhost",
    "https://foodnova-webapp.onrender.com",
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
for origin in csv_env_values("CORS_ORIGINS"):
    if origin not in allowed_origins:
        allowed_origins.append(origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https://([a-z0-9-]+\.)?(vercel\.app|netlify\.app|web\.app|firebaseapp\.com|pages\.dev)$|^http://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["x-request-id"],
)


@app.middleware("http")
async def delivery_diagnostics_middleware(request: Request, call_next):
    path = request.url.path
    should_log = any(
        path == endpoint or path.startswith(f"{endpoint}/")
        for endpoint in DIAGNOSTIC_ENDPOINTS
    )
    started_at = datetime.utcnow()
    if should_log:
        print("API_DIAGNOSTIC_REQUEST", json_dump({
            "method": request.method,
            "url": str(request.url),
            "path": path,
            "auth_attached": bool(request.headers.get("authorization")),
            "timestamp": iso(started_at),
        }))
    response = await call_next(request)
    if should_log:
        print("API_DIAGNOSTIC_RESPONSE", json_dump({
            "method": request.method,
            "url": str(request.url),
            "path": path,
            "status_code": response.status_code,
            "elapsed_ms": int((datetime.utcnow() - started_at).total_seconds() * 1000),
        }))
    return response

WEBSITE_SETTINGS_KEY = "website_settings"
COMING_SOON_WHITELIST_PREFIXES = (
    "/admin",
    "/api",
    "/coming-soon",
    "/website-settings",
    "/uploads",
    "/assets",
    "/favicon",
    "/manifest",
    "/robots.txt",
    "/sitemap.xml",
    "/foodnova-logo.png",
    "/logo.png",
    "/placeholder.png",
)


def default_website_settings() -> dict:
    launch_date = datetime.utcnow() + timedelta(days=30)
    launch_date = launch_date.replace(hour=9, minute=0, second=0, microsecond=0)
    return {
        "comingSoonEnabled": False,
        "maintenanceMode": False,
        "splashEnabled": True,
        "launchDate": launch_date.isoformat() + "Z",
        "siteName": "FoodNova",
        "siteDescription": "Premium grocery delivery for your neighborhood.",
        "headline": "Launching Soon",
        "subtext": "FoodNova is preparing a premium grocery experience for your neighborhood.",
        "homepageBanners": "",
        "featuredPacks": "",
        "homepageAnnouncement": "",
        "subscribers": [],
    }


def normalize_website_settings(raw: dict = None) -> dict:
    settings = default_website_settings()
    if isinstance(raw, dict):
        settings.update({key: value for key, value in raw.items() if value is not None})
    settings["comingSoonEnabled"] = bool(settings.get("comingSoonEnabled"))
    settings["maintenanceMode"] = bool(settings.get("maintenanceMode"))
    settings["splashEnabled"] = bool(settings.get("splashEnabled"))
    if not isinstance(settings.get("subscribers"), list):
        settings["subscribers"] = []
    for key in ["siteName", "siteDescription", "headline", "subtext", "launchDate", "homepageBanners", "featuredPacks", "homepageAnnouncement"]:
        settings[key] = str(settings.get(key) or default_website_settings().get(key, ""))
    return settings


def get_website_settings_from_db(db) -> dict:
    raw_value = get_app_setting(db, WEBSITE_SETTINGS_KEY, "")
    if not raw_value:
        return normalize_website_settings()
    try:
        return normalize_website_settings(json.loads(raw_value))
    except Exception:
        return normalize_website_settings()


def save_website_settings_to_db(db, settings: dict) -> dict:
    normalized = normalize_website_settings(settings)
    set_app_setting(db, WEBSITE_SETTINGS_KEY, json.dumps(normalized))
    db.commit()
    return normalized


def is_coming_soon_whitelisted(path: str) -> bool:
    clean_path = path or "/"
    if any(clean_path == prefix or clean_path.startswith(f"{prefix}/") for prefix in COMING_SOON_WHITELIST_PREFIXES):
        return True
    filename = clean_path.rsplit("/", 1)[-1]
    return "." in filename


@app.middleware("http")
async def coming_soon_middleware(request: Request, call_next):
    path = request.url.path or "/"
    accepts_html = "text/html" in request.headers.get("accept", "")
    if request.method not in {"GET", "HEAD"} or not accepts_html or is_coming_soon_whitelisted(path):
        return await call_next(request)

    db = SessionLocal()
    try:
        settings = get_website_settings_from_db(db)
        if settings.get("comingSoonEnabled"):
            return RedirectResponse(url="/coming-soon", status_code=307)
    except Exception as error:
        traceback.print_exception(type(error), error, error.__traceback__)
        print("COMING_SOON_MIDDLEWARE_ERROR", json_dump({
            "path": path,
            "error_type": type(error).__name__,
            "message": str(error),
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }))
    finally:
        db.close()

    return await call_next(request)

if not any(getattr(route, "path", None) == "/uploads" for route in app.routes):
    app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.exception_handler(HTTPException)
async def foodnova_http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "detail": exc.detail},
        headers=exc.headers,
    )


@app.exception_handler(Exception)
async def foodnova_unhandled_exception_handler(request: Request, exc: Exception):
    traceback.print_exception(type(exc), exc, exc.__traceback__)
    print("UNHANDLED_BACKEND_EXCEPTION", json_dump({
        "path": request.url.path,
        "method": request.method,
        "error_type": type(exc).__name__,
        "message": str(exc),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }))
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "detail": "Internal server error",
            "error_type": type(exc).__name__,
        },
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
LAST_ADMIN_LOGIN_ERROR = ""
LAST_ADMIN_LOGIN_TRACEBACK = ""
LAST_ADMIN_LOGIN_AT = ""

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
        "items": [
            "Rice",
            "Beans",
            "Garri",
            "Spaghetti",
            "Tomato Paste",
            "Noodles",
            "Red Oil",
            "Groundnut Oil",
            "Semovita",
            "Salt",
            "Maggi",
            "Curry",
            "Thyme",
            "Egusi",
        ],
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

FOODNOVA_CATEGORIES = {
    "Food Staples": ["Foreign Rice", "Honey Beans", "Garri Ijebu", "Semovita"],
    "Pasta & Noodles": ["Spaghetti", "Noodles"],
    "Cooking Ingredients": ["Tomato Paste", "Salt", "Maggi", "Curry", "Thyme"],
    "Oils": ["Vegetable Oil", "Palm Oil"],
    "Breakfast": ["Custard", "Milo", "Milk"],
    "Local Ingredients": ["Grounded Egusi"],
}

FOODNOVA_CATEGORY_IMAGES = {
    "Food Staples": "/uploads/catalog/categories/food-staples.svg",
    "Pasta & Noodles": "/uploads/catalog/categories/pasta-noodles.svg",
    "Cooking Ingredients": "/uploads/catalog/categories/cooking-ingredients.svg",
    "Oils": "/uploads/catalog/categories/oils.svg",
    "Breakfast": "/uploads/catalog/categories/breakfast.svg",
    "Local Ingredients": "/uploads/catalog/categories/local-ingredients.svg",
}
FOODNOVA_DEFAULT_PLACEHOLDER = "/uploads/catalog/foodnova-placeholder.svg"

FOODNOVA_PRODUCT_CATALOG = [
    {"name": "Foreign Rice", "category": "Food Staples", "price": 2400, "stock": 80, "image": "/uploads/catalog/products/foreign-rice.svg", "description": "Premium foreign parboiled rice selected for clean grains, consistent texture, and everyday Nigerian meals. Ideal for jollof rice, fried rice, white rice, and family foodstuff restocking."},
    {"name": "Honey Beans", "category": "Food Staples", "price": 2200, "stock": 70, "image": "/uploads/catalog/products/honey-beans.svg", "description": "Sweet, nutritious honey beans with a smooth cook and rich flavor for akara, moi moi, beans porridge, and balanced home meals. A dependable pantry staple for FoodNova grocery shoppers."},
    {"name": "Garri Ijebu", "category": "Food Staples", "price": 1200, "stock": 90, "image": "/uploads/catalog/products/garri-ijebu.svg", "description": "Crisp, finely processed Garri Ijebu with the familiar tangy taste loved for soaking, eba, and quick meals. Carefully packed for freshness and reliable household use."},
    {"name": "Spaghetti", "category": "Pasta & Noodles", "price": 1500, "stock": 100, "image": "/uploads/catalog/products/spaghetti.svg", "description": "Quality spaghetti for quick weekday meals, party dishes, and lunch boxes. Cooks evenly and pairs well with tomato stew, vegetables, protein, and FoodNova pantry essentials."},
    {"name": "Tomato Paste", "category": "Cooking Ingredients", "price": 900, "stock": 120, "image": "/uploads/catalog/products/tomato-paste.svg", "description": "Rich tomato paste for stews, jollof rice, sauces, and soups. A concentrated cooking ingredient that brings color, body, and classic tomato flavor to everyday meals."},
    {"name": "Semovita", "category": "Food Staples", "price": 2300, "stock": 60, "image": "/uploads/catalog/products/semovita.svg", "description": "Smooth Semovita flour for soft, satisfying swallows served with vegetable, egusi, okra, and traditional soups. Packed for convenient home cooking and family restocking."},
    {"name": "Noodles", "category": "Pasta & Noodles", "price": 800, "stock": 140, "image": "/uploads/catalog/products/noodles.svg", "description": "Quick-cooking instant noodles for breakfast, lunch, late-night meals, and busy school days. Easy to prepare and useful for fast FoodNova grocery baskets."},
    {"name": "Salt", "category": "Cooking Ingredients", "price": 500, "stock": 150, "image": "/uploads/catalog/products/salt.svg", "description": "Everyday cooking salt for seasoning soups, stews, rice, pasta, and household recipes. A basic kitchen essential for complete grocery shopping."},
    {"name": "Maggi", "category": "Cooking Ingredients", "price": 700, "stock": 150, "image": "/uploads/catalog/products/maggi.svg", "description": "Trusted seasoning cubes that add savory depth to soups, stews, rice dishes, sauces, and everyday Nigerian cooking. A must-have flavor booster for every pantry."},
    {"name": "Vegetable Oil", "category": "Oils", "price": 3200, "stock": 80, "image": "/uploads/catalog/products/vegetable-oil.svg", "description": "Clean-tasting vegetable oil for frying, sauteing, baking, and daily cooking. Suitable for family kitchens, meal prep, and FoodNova foodstuff restocking."},
    {"name": "Palm Oil", "category": "Oils", "price": 3000, "stock": 80, "image": "/uploads/catalog/products/palm-oil.svg", "description": "Quality palm oil with rich color and traditional flavor for soups, beans, yam, sauces, and local dishes. Packed for dependable taste and freshness."},
    {"name": "Sugar", "category": "Breakfast", "price": 1100, "stock": 100, "image": "/uploads/catalog/products/sugar.svg", "description": "Fine granulated sugar for tea, pap, custard, baking, cereals, and everyday sweetening. A practical grocery essential for breakfast and home use."},
    {"name": "Custard", "category": "Breakfast", "price": 1800, "stock": 70, "image": "/uploads/catalog/products/custard.svg", "description": "Smooth breakfast custard for quick, comforting meals served with milk, sugar, and snacks. Great for families, children, and convenient morning routines."},
    {"name": "Curry", "category": "Cooking Ingredients", "price": 600, "stock": 100, "image": "/uploads/catalog/products/curry.svg", "description": "Aromatic curry powder for fried rice, sauces, stews, chicken, and vegetable dishes. Adds warm color and balanced spice to everyday cooking."},
    {"name": "Thyme", "category": "Cooking Ingredients", "price": 600, "stock": 100, "image": "/uploads/catalog/products/thyme.svg", "description": "Fragrant dried thyme for seasoning meats, stews, rice, soups, and sauces. A versatile herb that brings depth to Nigerian and continental recipes."},
    {"name": "Milo", "category": "Breakfast", "price": 2500, "stock": 80, "image": "/uploads/catalog/products/milo.svg", "description": "Chocolate malt beverage for breakfast drinks, school mornings, and energy-filled refreshment. Enjoy hot or cold with milk for a familiar family favorite."},
    {"name": "Milk", "category": "Breakfast", "price": 1600, "stock": 90, "image": "/uploads/catalog/products/milk.svg", "description": "Creamy milk for tea, custard, cereals, pap, beverages, and baking. A breakfast essential that completes many FoodNova grocery baskets."},
    {"name": "Grounded Egusi", "category": "Local Ingredients", "price": 2800, "stock": 60, "image": "/uploads/catalog/products/grounded-egusi.svg", "description": "Finely grounded egusi for rich, flavorful egusi soup and traditional Nigerian meals. Conveniently prepared for faster cooking and consistent texture."},
]

WEIGHT_VARIANT_PRODUCTS = {"Foreign Rice", "Honey Beans", "Garri Ijebu"}
WEIGHT_VARIANTS = ["1kg", "2kg", "3kg", "5kg"]
CATALOG_PRODUCT_NAMES = {item["name"] for item in FOODNOVA_PRODUCT_CATALOG}
COMBO_KEYWORDS = ("pack", "combo", "package", "bundle")


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


class LocationPingPayload(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    heading: Optional[float] = None
    speed: Optional[float] = None
    timestamp: Optional[datetime] = None


class NINVerificationPayload(BaseModel):
    nin: str
    consent: bool
    consentAccepted: Optional[bool] = None
    consentTimestamp: Optional[str] = None
    deviceMetadata: Optional[dict] = None


class WorkerReviewPayload(BaseModel):
    status: str
    review_note: Optional[str] = ""


class OperationalZonePayload(BaseModel):
    zone_name: Optional[str] = "FoodNova Local Zone"
    center_latitude: float
    center_longitude: float
    radius_meters: int
    is_active: Optional[bool] = True


GPS_RECENCY_SECONDS = 60
MESSENGER_OUTSIDE_ZONE_MESSAGE = "You must be within the operational area to receive delivery requests."


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


class BulkOrderIdsPayload(BaseModel):
    orderIds: List[int] = []


class BulkOrderStatusPayload(BaseModel):
    orderIds: List[int] = []
    status: str


class BulkAssignRiderPayload(BaseModel):
    orderIds: List[int] = []
    rider_id: int
    delivery_note: Optional[str] = ""
    mark_out_for_delivery: Optional[bool] = False


def rider_lifecycle_status(worker: DBDeliveryWorker, rider_status: str = "") -> str:
    raw_status = (getattr(worker, "kyc_status", "") or "").upper()
    linked_status = (rider_status or "").upper()
    if getattr(worker, "deleted_at", None) or raw_status == "DELETED":
        return "SUSPENDED"
    if raw_status in {"SUSPENDED", "REJECTED"}:
        return "SUSPENDED"
    if raw_status in {"INACTIVE", "DEACTIVATED"}:
        return "INACTIVE"
    if raw_status == "ACTIVE" and bool(getattr(worker, "nin_verified", False)):
        return "ACTIVE"
    if raw_status == "APPROVED" and bool(getattr(worker, "nin_verified", False)):
        return "ACTIVE"
    if linked_status in {"ACTIVE", "APPROVED"} and bool(getattr(worker, "nin_verified", False)):
        return "ACTIVE"
    return "ONBOARDING"


def rider_status_input_to_lifecycle(value: str, default: str = "ONBOARDING") -> str:
    normalized = (value or "").strip().lower()
    status_map = {
        "active": "ACTIVE",
        "approved": "ACTIVE",
        "reactivated": "ACTIVE",
        "inactive": "INACTIVE",
        "deactivated": "INACTIVE",
        "onboarding": "ONBOARDING",
        "pending": "ONBOARDING",
        "pending_review": "ONBOARDING",
        "kyc_pending": "ONBOARDING",
        "rejected": "SUSPENDED",
        "suspended": "SUSPENDED",
    }
    return status_map.get(normalized, default)


def promote_verified_approved_rider(worker: DBDeliveryWorker) -> bool:
    if (
        (getattr(worker, "kyc_status", "") or "").upper() == "APPROVED"
        and bool(getattr(worker, "nin_verified", False))
        and not getattr(worker, "deleted_at", None)
    ):
        worker.kyc_status = "ACTIVE"
        worker.approved_at = worker.approved_at or datetime.utcnow()
        return True
    return False


class DeliveryOfferActionPayload(BaseModel):
    reason: Optional[str] = ""


class DeliveryAssignmentModePayload(BaseModel):
    mode: str


class FCMTokenPayload(BaseModel):
    token: str
    platform: Optional[str] = ""


class DeliveryOrderStatusPayload(BaseModel):
    delivery_status: Optional[str] = ""
    status: Optional[str] = ""
    note: Optional[str] = ""


class DeliveryProofPayload(BaseModel):
    delivery_code: Optional[str] = ""
    signature_present: Optional[bool] = False
    photo_url: Optional[str] = ""
    photo_path: Optional[str] = ""
    note: Optional[str] = ""


class DeliveryAuthCheckPhonePayload(BaseModel):
    phone_number: str


class DeliveryAuthRegisterPayload(BaseModel):
    full_name: Optional[str] = ""
    email: Optional[EmailStr] = None
    phone_number: str
    country_code: Optional[str] = "+234"
    password: str
    worker_type: Optional[str] = "rider"


class DeliveryAuthLoginPayload(BaseModel):
    phone_number: str
    password: str


class DeliveryEmergencyContactPayload(BaseModel):
    full_name: str
    relationship: str
    phone_number: str
    alternate_phone: Optional[str] = None


class OnboardingProfilePayload(BaseModel):
    first_name: Optional[str] = ""
    middle_name: Optional[str] = ""
    last_name: Optional[str] = ""
    full_name: Optional[str] = ""
    phone: Optional[str] = ""
    gender: Optional[str] = ""
    date_of_birth: Optional[str] = ""
    address: Optional[str] = ""
    rider_type: Optional[str] = "motorcycle"
    vehicle_type: Optional[str] = ""
    plate_number: Optional[str] = ""
    emergency_contact_name: Optional[str] = ""
    emergency_contact_phone: Optional[str] = ""
    emergency_contact_relationship: Optional[str] = ""


class OnboardingTrainingPayload(BaseModel):
    completed: bool = True


class OnboardingSubmitPayload(BaseModel):
    submit: bool = True


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
        "reports:view", "orders:delete", "riders:manage", "workforce:view", "workforce:manage",
    ],
    "orders_manager": ["dashboard:view", "orders:view", "orders:update", "orders:delivery", "delivery:manage", "riders:manage", "workforce:view", "workforce:manage", "cancellations:view", "cancellations:manage", "customers:view"],
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
        "iat": int(datetime.utcnow().timestamp()),
        "exp": expiry,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return None


def _socket_user_rooms(user: dict) -> List[str]:
    rooms = []
    if not user:
        return rooms
    user_id = user.get("id") or user.get("user_id")
    email = str(user.get("email") or user.get("sub") or "").strip().lower()
    role = str(user.get("role") or "").strip().lower()
    if user_id:
        rooms.append(f"user:{user_id}")
    if email:
        rooms.append(f"email:{email}")
    if role:
        rooms.append(f"role:{role}")
    return rooms


def socket_emit(event: str, payload: dict, room: Optional[str] = None) -> None:
    if not sio:
        return
    try:
        import asyncio
        target = room or None
        asyncio.run(sio.emit(event, payload or {}, room=target))
    except Exception as error:
        print("SOCKET_EMIT_ERROR", json_dump({"event": event, "room": room or "", "error": repr(error)}))


if sio:
    @sio.event
    async def connect(sid, environ, auth):
        token = ""
        if isinstance(auth, dict):
            token = str(auth.get("token") or "").strip()
        query = environ.get("QUERY_STRING") or ""
        if not token and query:
            parsed = urllib.parse.parse_qs(query)
            token = str((parsed.get("token") or [""])[0]).strip()
        user = decode_access_token(token)
        if not user:
            print("SOCKET_CONNECT_REJECTED", json_dump({"sid": sid}))
            return False
        for room in _socket_user_rooms(user):
            await sio.enter_room(sid, room)
        await sio.save_session(sid, {"user": user})
        print("SOCKET_CONNECTED", json_dump({"sid": sid, "role": user.get("role"), "user_id": user.get("user_id")}))

    @sio.event
    async def disconnect(sid):
        print("SOCKET_DISCONNECTED", json_dump({"sid": sid}))

    @sio.on("order:subscribe")
    async def socket_order_subscribe(sid, payload):
        data = payload if isinstance(payload, dict) else {}
        order_id = str(data.get("order_id") or data.get("orderId") or "").strip()
        if not order_id:
            return
        await sio.enter_room(sid, f"order:{order_id}")
        await sio.emit("order:subscribed", {"order_id": order_id}, room=sid)

    @sio.on("dispatch:subscribe")
    async def socket_dispatch_subscribe(sid, payload):
        session = await sio.get_session(sid)
        user = session.get("user") or {}
        if str(user.get("role") or "").lower() in {"rider", "messenger"}:
            await sio.enter_room(sid, f"dispatch:{user.get('user_id')}")
            await sio.emit("dispatch:subscribed", {"success": True}, room=sid)


def _token_hash(token: str) -> str:
    return hashlib.sha256(str(token or "").encode("utf-8")).hexdigest()


def record_rider_session(token: str, user: DBUser, worker: DBDeliveryWorker, request: Optional[Request] = None) -> None:
    if not token or not worker or (worker.worker_type or "") != "rider":
        return
    db = SessionLocal()
    try:
        session = DBRiderSession(
            delivery_worker_id=worker.id,
            user_id=user.id,
            token_hash=_token_hash(token),
            device_info_json=json_dump(parse_user_agent(request.headers.get("user-agent", "")) if request else {}),
            ip_address=get_request_ip(request),
            is_active=True,
        )
        db.add(session)
        db.commit()
    except Exception as error:
        print("RIDER SESSION LOG ERROR:", repr(error))
    finally:
        db.close()


def revoke_rider_sessions(db, worker: DBDeliveryWorker, admin: dict = None, reason: str = "") -> int:
    sessions = db.query(DBRiderSession).filter(DBRiderSession.delivery_worker_id == worker.id, DBRiderSession.is_active == True).all()
    for session in sessions:
        session.is_active = False
        session.revoked_at = datetime.utcnow()
        session.revoked_by_admin_id = (admin or {}).get("id")
        session.revoked_reason = reason or "Session revoked"
    worker.fcm_token = ""
    worker.fcm_tokens_json = "[]"
    worker.force_logout_at = datetime.utcnow()
    return len(sessions)


def delivery_worker_access_block_reason(worker: Optional[DBDeliveryWorker]) -> str:
    if not worker:
        return "This account has been removed or deactivated."
    if getattr(worker, "deleted_at", None) or (worker.kyc_status or "").upper() == "DELETED":
        return "This account has been removed or deactivated."
    if (worker.kyc_status or "").upper() == "SUSPENDED":
        return "This account has been suspended."
    if (worker.kyc_status or "").upper() == "DEACTIVATED":
        return "This account has been removed or deactivated."
    return ""


def is_delivery_token_revoked(token: str, user_id: int, payload: dict = None) -> bool:
    if not token or not user_id:
        return False
    db = SessionLocal()
    try:
        worker = db.query(DBDeliveryWorker).filter(DBDeliveryWorker.user_id == user_id).first()
        token_role = str((payload or {}).get("role") or "").lower()
        if not worker:
            return token_role == "rider"
        if (worker.worker_type or "") != "rider":
            return False
        if delivery_worker_access_block_reason(worker):
            return True
        force_logout_at = getattr(worker, "force_logout_at", None)
        if force_logout_at:
            issued_at = (payload or {}).get("iat")
            if not issued_at:
                return True
            try:
                issued_dt = datetime.fromtimestamp(float(issued_at), tz=timezone.utc).replace(tzinfo=None) if isinstance(issued_at, (int, float)) else as_naive_utc(datetime.fromisoformat(str(issued_at).replace("Z", "+00:00")))
                if issued_dt <= as_naive_utc(force_logout_at):
                    return True
            except Exception:
                return True
        session = db.query(DBRiderSession).filter(DBRiderSession.token_hash == _token_hash(token)).first()
        if not session:
            return False
        session.last_seen_at = datetime.utcnow()
        db.commit()
        return not bool(session.is_active)
    finally:
        db.close()


def _get_user_from_token(authorization: Optional[str]) -> Optional[dict]:
    if not authorization:
        return None
    token = authorization.replace("Bearer ", "").strip()
    payload = decode_access_token(token)
    email = payload.get("sub") if payload else None
    if not email:
        return None
    if is_delivery_token_revoked(token, payload.get("user_id"), payload):
        return None
    db = SessionLocal()
    try:
        user = get_db_user_by_email(db, email)
        if not user:
            return None
        if not getattr(user, "is_active", True):
            return None
        if (user.role or "") in ["rider", "messenger"]:
            worker = db.query(DBDeliveryWorker).filter(DBDeliveryWorker.user_id == user.id).first()
            reason = delivery_worker_access_block_reason(worker)
            if reason:
                raise HTTPException(status_code=401, detail=reason)
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


def get_request_ip(request: Optional[Request]) -> str:
    if not request:
        return ""
    candidates = []
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        candidates.extend(part.strip() for part in forwarded_for.split(","))
    real_ip = request.headers.get("x-real-ip", "")
    if real_ip:
        candidates.append(real_ip.strip())
    if request.client and request.client.host:
        candidates.append(request.client.host)
    for candidate in candidates:
        value = str(candidate or "").strip()
        if not value:
            continue
        if value.startswith("[") and "]" in value:
            value = value[1:value.index("]")]
        elif value.count(":") == 1 and "." in value:
            value = value.split(":", 1)[0]
        try:
            ipaddress.ip_address(value)
            return value
        except ValueError:
            continue
    return ""


def is_mobile_worker_registration_request(request: Request) -> bool:
    user_agent = (request.headers.get("user-agent") or "").lower()
    capacitor_hint = (request.headers.get("x-requested-with") or "").lower()
    return any(token in user_agent for token in ["mobile", "android", "iphone", "ipad", "ipod"]) or "capacitor" in capacitor_hint


def parse_user_agent(user_agent: str) -> dict:
    ua = str(user_agent or "")
    lower = ua.lower()
    if not ua:
        return {"device_type": "", "browser": "", "operating_system": ""}

    if "ipad" in lower or "tablet" in lower:
        device_type = "Tablet"
    elif "mobile" in lower or "iphone" in lower or "android" in lower:
        device_type = "Mobile"
    else:
        device_type = "Desktop"

    if "edg/" in lower or "edge/" in lower:
        browser = "Microsoft Edge"
    elif "opr/" in lower or "opera" in lower:
        browser = "Opera"
    elif "chrome/" in lower and "chromium" not in lower:
        browser = "Chrome"
    elif "safari/" in lower and "chrome/" not in lower:
        browser = "Safari"
    elif "firefox/" in lower:
        browser = "Firefox"
    elif "msie" in lower or "trident/" in lower:
        browser = "Internet Explorer"
    else:
        browser = "Unknown browser"

    if "windows nt" in lower:
        operating_system = "Windows"
    elif "android" in lower:
        operating_system = "Android"
    elif "iphone" in lower or "ipad" in lower or "ios" in lower:
        operating_system = "iOS"
    elif "mac os x" in lower or "macintosh" in lower:
        operating_system = "macOS"
    elif "linux" in lower:
        operating_system = "Linux"
    else:
        operating_system = "Unknown OS"

    return {
        "device_type": device_type,
        "browser": browser,
        "operating_system": operating_system,
    }


def verification_consent_metadata(request: Optional[Request], payload: Optional[NINVerificationPayload] = None) -> dict:
    device = parse_user_agent(request.headers.get("user-agent", "") if request else "")
    supplied_device = getattr(payload, "deviceMetadata", None) if payload else None
    if isinstance(supplied_device, dict):
        device.update({key: value for key, value in supplied_device.items() if value is not None})
    return {
        "consent_accepted": bool(getattr(payload, "consent", False) if payload else False),
        "consent_timestamp": getattr(payload, "consentTimestamp", None) or iso(datetime.utcnow()),
        "device": device,
        "ip_address": get_request_ip(request),
    }


def create_admin_audit_log(
    request: Optional[Request],
    admin: dict,
    action: str,
    entity_type: str = "",
    entity_id: str = "",
    description: str = "",
    metadata: dict = None,
):
    user_agent = request.headers.get("user-agent", "") if request else ""
    device_info = parse_user_agent(user_agent)
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
            ip_address=get_request_ip(request),
            user_agent=user_agent,
            device_type=device_info.get("device_type") or "",
            browser=device_info.get("browser") or "",
            operating_system=device_info.get("operating_system") or "",
            location_country="",
            location_region="",
            location_city="",
        )
        db.add(log)
        db.commit()
    except Exception as error:
        print("AUDIT LOG ERROR:", repr(error))
    finally:
        db.close()


def _password_hash_scheme(stored_password: str) -> str:
    value = str(stored_password or "")
    if value.startswith("pbkdf2_sha256$"):
        return "pbkdf2_sha256"
    if value.startswith("pbkdf2:") or value.startswith("scrypt:"):
        return "werkzeug"
    if value.startswith(("$2a$", "$2b$", "$2y$")):
        return "bcrypt"
    if value:
        return "plain_or_unknown"
    return "empty"


def _password_matches(plain_password: str, stored_password: str) -> bool:
    if not stored_password:
        return False

    if str(stored_password).startswith("pbkdf2_sha256$"):
        parts = str(stored_password).split("$", 3)
        if len(parts) != 4:
            return False
        _, iterations_raw, salt_raw, digest_raw = parts
        try:
            salt = base64.b64decode(salt_raw.encode("utf-8"), validate=True)
            expected = base64.b64decode(digest_raw.encode("utf-8"), validate=True)
            actual = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), salt, int(iterations_raw))
            return hmac.compare_digest(actual, expected)
        except Exception:
            try:
                expected = base64.b64decode(digest_raw.encode("utf-8"), validate=True)
                actual = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), salt_raw.encode("utf-8"), int(iterations_raw))
                return hmac.compare_digest(actual, expected)
            except Exception:
                return False

    if pwd_context and str(stored_password).startswith(("$2a$", "$2b$", "$2y$")):
        try:
            return pwd_context.verify(plain_password, stored_password)
        except Exception:
            return False

    if werkzeug_check_password_hash and str(stored_password).startswith(("pbkdf2:", "scrypt:")):
        try:
            return werkzeug_check_password_hash(stored_password, plain_password)
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
        data = notification_to_dict(notif)
        socket_emit("notification:new", data, room=f"email:{email}")
        if data.get("order_id"):
            socket_emit(
                f"order:update:{data.get('order_id')}",
                {"order_id": data.get("order_id"), "notification": data},
                room=f"order:{data.get('order_id')}",
            )
        user = db.query(DBUser).filter(func.lower(DBUser.email) == email).first()
        if user:
            is_dispatch_user = (getattr(user, "role", "") or "") in {"rider", "messenger"}
            tokens = []
            if getattr(user, "fcm_token", ""):
                tokens.append(user.fcm_token)
            for token in json_load(getattr(user, "fcm_tokens_json", None), []) or []:
                if token and token not in tokens:
                    tokens.append(token)
            for token in tokens:
                send_fcm_push_token(token, title, message, {
                    "type": notif_type,
                    "category": category,
                    "notification_id": str(notif.id),
                    "order_id": str(order.get("id") if order else ""),
                    "title": title,
                    "body": message,
                    "sound": "delivery_alert" if is_dispatch_user else "default",
                    "android_channel_id": "foodnova_dispatch_delivery" if is_dispatch_user else "foodnova_customer_updates",
                    "android_click_action": "OPEN_WORKER_DASHBOARD" if is_dispatch_user else "OPEN_FOODNOVA",
                    "click_action": "/notifications",
                })
        return data
    finally:
        db.close()


def _create_order_notification(order: dict, title: str, message: str, notif_type: str = "order_update", 
                              category: str = "order") -> dict:
    """Create an order-related notification."""
    email = order.get("customer_email") or order.get("user_email")
    if not email:
        return None
    return _create_user_notification(email, title, message, notif_type, category, order)


def _create_admin_notifications(title: str, message: str, notif_type: str = "admin_delivery", category: str = "delivery", order: dict = None) -> int:
    db = SessionLocal()
    try:
        admins = db.query(DBUser).filter(DBUser.role == "admin", DBUser.is_active == True).all()
        count = 0
        for admin in admins:
            if not admin.email:
                continue
            db.add(DBNotification(
                user_email=admin.email.strip().lower(),
                customer_email=admin.email.strip().lower(),
                order_id=order.get("id") if order else None,
                order_code=order.get("order_code") if order else None,
                title=title,
                message=message,
                type=notif_type,
                category=category,
                is_read=False,
            ))
            count += 1
        db.commit()
        return count
    finally:
        db.close()


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


def get_app_setting(db, key: str, default: str = "") -> str:
    setting = db.query(DBAppSetting).filter(DBAppSetting.key == key).first()
    return setting.value if setting and setting.value is not None else default


def set_app_setting(db, key: str, value: str) -> DBAppSetting:
    setting = db.query(DBAppSetting).filter(DBAppSetting.key == key).first()
    if not setting:
        setting = DBAppSetting(key=key, value=value)
        db.add(setting)
    else:
        setting.value = value
        setting.updated_at = datetime.utcnow()
    db.flush()
    return setting


class WebsiteSettingsPayload(BaseModel):
    comingSoonEnabled: Optional[bool] = None
    maintenanceMode: Optional[bool] = None
    splashEnabled: Optional[bool] = None
    launchDate: Optional[str] = None
    siteName: Optional[str] = None
    siteDescription: Optional[str] = None
    headline: Optional[str] = None
    subtext: Optional[str] = None
    homepageBanners: Optional[str] = None
    featuredPacks: Optional[str] = None
    homepageAnnouncement: Optional[str] = None


class ComingSoonSubscriberPayload(BaseModel):
    email: EmailStr


@app.get("/website-settings")
def get_public_website_settings():
    db = SessionLocal()
    try:
        settings = get_website_settings_from_db(db)
        public_settings = {key: value for key, value in settings.items() if key != "subscribers"}
        return {"success": True, "settings": public_settings, "data": public_settings}
    except Exception as error:
        traceback.print_exception(type(error), error, error.__traceback__)
        print("WEBSITE_SETTINGS_ERROR", json_dump({
            "route": "/website-settings",
            "error_type": type(error).__name__,
            "message": str(error),
            "timestamp": iso(datetime.utcnow()),
        }))
        public_settings = {key: value for key, value in normalize_website_settings().items() if key != "subscribers"}
        return {
            "success": True,
            "settings": public_settings,
            "data": public_settings,
            "fallback": True,
            "warning": "Website settings unavailable; default settings returned.",
        }
    finally:
        db.close()


@app.get("/admin/website-settings")
def get_admin_website_settings(request: Request):
    require_any_permission(request, ["announcements:view", "announcements:manage", "admins:manage"])
    db = SessionLocal()
    try:
        settings = get_website_settings_from_db(db)
        return {"success": True, "settings": settings, "data": settings}
    except Exception as error:
        traceback.print_exception(type(error), error, error.__traceback__)
        print("ADMIN_WEBSITE_SETTINGS_ERROR", json_dump({
            "route": "/admin/website-settings",
            "error_type": type(error).__name__,
            "message": str(error),
            "timestamp": iso(datetime.utcnow()),
        }))
        raise HTTPException(status_code=500, detail=f"Website settings unavailable: {type(error).__name__}")
    finally:
        db.close()


@app.patch("/admin/website-settings")
def update_admin_website_settings(payload: WebsiteSettingsPayload, request: Request):
    admin = require_any_permission(request, ["announcements:manage", "admins:manage"])
    db = SessionLocal()
    try:
        current = get_website_settings_from_db(db)
        updates = {key: value for key, value in payload.dict(exclude_unset=True).items() if value is not None}
        next_settings = save_website_settings_to_db(db, {**current, **updates})
        create_admin_audit_log(
            request,
            admin,
            "website_settings_updated",
            "app_setting",
            WEBSITE_SETTINGS_KEY,
            "Admin updated website launch mode settings",
            {"before": current, "after": next_settings},
        )
        return {"success": True, "message": "Website settings updated", "settings": next_settings, "data": next_settings}
    finally:
        db.close()


@app.post("/coming-soon/subscribe")
def subscribe_coming_soon(payload: ComingSoonSubscriberPayload):
    db = SessionLocal()
    try:
        settings = get_website_settings_from_db(db)
        subscribers = settings.get("subscribers") if isinstance(settings.get("subscribers"), list) else []
        email = payload.email.lower()
        if email not in subscribers:
            subscribers.append(email)
        settings["subscribers"] = subscribers
        save_website_settings_to_db(db, settings)
        return {"success": True, "message": "You're on the FoodNova launch list."}
    finally:
        db.close()


def get_delivery_assignment_mode(db) -> str:
    mode = (get_app_setting(db, "delivery_assignment_mode", "automatic") or "automatic").strip().lower()
    return mode if mode in ["automatic", "manual"] else "automatic"


def get_firebase_app():
    if not firebase_admin:
        return None
    if firebase_admin._apps:
        return firebase_admin.get_app()
    service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON") or ""
    service_account_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH") or ""
    try:
        if service_account_json:
            return firebase_admin.initialize_app(credentials.Certificate(json.loads(service_account_json)))
        if service_account_path:
            return firebase_admin.initialize_app(credentials.Certificate(service_account_path))
    except Exception as error:
        print("FCM INIT ERROR:", repr(error))
    return None


def send_fcm_push_token(token: str, title: str, body: str, data: dict = None) -> bool:
    token = (token or "").strip()
    if not token:
        return False
    data = {str(key): str(value) for key, value in (data or {}).items() if value is not None}
    app = get_firebase_app()
    if app and messaging:
        try:
            messaging.send(messaging.Message(
                token=token,
                notification=messaging.Notification(title=title, body=body),
                data=data,
                webpush=messaging.WebpushConfig(fcm_options=messaging.WebpushFCMOptions(link=data.get("click_action") or "/")),
                android=messaging.AndroidConfig(notification=messaging.AndroidNotification(
                    click_action=data.get("android_click_action") or "OPEN_FOODNOVA",
                    channel_id=data.get("android_channel_id") or "foodnova_customer_updates",
                    sound=data.get("sound") or "default",
                )),
                apns=messaging.APNSConfig(payload=messaging.APNSPayload(aps=messaging.Aps(sound=data.get("sound") or "default"))),
            ))
            return True
        except Exception as error:
            print("FCM SEND ERROR:", repr(error))
            return False
    server_key = os.getenv("FCM_SERVER_KEY") or ""
    if not server_key:
        return False
    payload = json.dumps({
        "to": token,
        "notification": {"title": title, "body": body, "click_action": data.get("click_action") or "/", "sound": data.get("sound") or "default"},
        "data": data,
    }).encode("utf-8")
    request_obj = urllib.request.Request(
        "https://fcm.googleapis.com/fcm/send",
        data=payload,
        headers={"Authorization": f"key={server_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request_obj, timeout=10) as response:
            return 200 <= response.status < 300
    except (urllib.error.URLError, urllib.error.HTTPError) as error:
        print("FCM LEGACY SEND ERROR:", repr(error))
        return False


def send_delivery_offer_push(worker: DBDeliveryWorker, offer: DBDeliveryOffer) -> None:
    if delivery_worker_access_block_reason(worker):
        return
    tokens = []
    if worker.fcm_token:
        tokens.append(worker.fcm_token)
    for token in json_load(getattr(worker, "fcm_tokens_json", None), []) or []:
        if token and token not in tokens:
            tokens.append(token)
    for token in tokens:
        send_fcm_push_token(
            token,
            "New Delivery Request",
            "You have a new FoodNova delivery offer.",
            {
                "type": "delivery_offer",
                "offer_id": offer.id,
                "order_id": offer.order_id,
                "worker_type": offer.worker_type,
                "sound": "delivery_alert",
                "android_channel_id": "foodnova_dispatch_delivery",
                "android_click_action": "OPEN_WORKER_DASHBOARD",
                "click_action": "/rider/dashboard" if offer.worker_type == "rider" else "/messenger/dashboard",
            },
        )


def safe_email_call(label: str, func, *args, **kwargs):
    try:
        return func(*args, **kwargs)
    except Exception as error:
        print(f"EMAIL EVENT ERROR [{label}]:", repr(error))
        return None


def normalize_order_items(items: list) -> list:
    normalized = []

    for item in items or []:
        qty = int(item.get("quantity") or item.get("qty") or 1)
        price = float(item.get("price") or item.get("unit_price") or 0)
        name = item.get("name") or item.get("product_name") or f"Product #{item.get('product_id') or item.get('id') or ''}"
        variant_id = item.get("variant_id") or item.get("product_variant_id")
        variant_weight = item.get("variant_weight") or item.get("weight") or item.get("selected_weight") or ""
        sku = item.get("sku") or item.get("variant_sku") or ""
        display_name = f"{name} - {variant_weight}" if variant_weight and variant_weight not in str(name) else name

        normalized.append({
            "id": item.get("id") or item.get("product_id"),
            "product_id": item.get("product_id") or item.get("id"),
            "variant_id": variant_id,
            "variant_weight": variant_weight,
            "sku": sku,
            "item_type": item.get("item_type") or item.get("type") or ("pack" if item.get("items") else "product"),
            "name": display_name,
            "product_name": display_name,
            "base_product_name": name,
            "price": price,
            "unit_price": price,
            "quantity": qty,
            "qty": qty,
            "line_total": price * qty,
        })

    return normalized


def find_order_variant_for_stock(db, item: dict) -> Optional[DBProductVariant]:
    if str(item.get("item_type") or "").lower() == "pack":
        return None
    variant_id = item.get("variant_id")
    sku = str(item.get("sku") or "").strip()
    if variant_id:
        try:
            variant = db.query(DBProductVariant).filter(DBProductVariant.id == int(variant_id)).first()
            if variant:
                return variant
        except Exception:
            pass
    if sku:
        variant = db.query(DBProductVariant).filter(DBProductVariant.sku == sku).first()
        if variant:
            return variant
    return None


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
    requested_by_variant = {}
    requested_by_product = {}

    for item in items:
        variant = find_order_variant_for_stock(db, item)
        if variant:
            quantity = int(item.get("quantity") or item.get("qty") or 1)
            if quantity > 0:
                current = requested_by_variant.get(variant.id, {"variant": variant, "quantity": 0})
                current["quantity"] += quantity
                requested_by_variant[variant.id] = current
            continue
        product = find_order_product_for_stock(db, item)
        if not product:
            continue
        quantity = int(item.get("quantity") or item.get("qty") or 1)
        if quantity <= 0:
            continue
        current = requested_by_product.get(product.id, {"product": product, "quantity": 0})
        current["quantity"] += quantity
        requested_by_product[product.id] = current

    for entry in requested_by_variant.values():
        variant = entry["variant"]
        requested = entry["quantity"]
        available = variant.stock_qty if variant.stock_qty is not None else (variant.stock or 0)
        product_name = variant.product.name if variant.product else "Product"
        if available < requested:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {product_name} {variant.weight}. Available: {available}, requested: {requested}",
            )

    for entry in requested_by_product.values():
        product = entry["product"]
        requested = entry["quantity"]
        available = product.stock_qty if product.stock_qty is not None else (product.stock or 0)
        if available < requested:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {product.name}. Available: {available}, requested: {requested}",
            )

    for entry in requested_by_variant.values():
        variant = entry["variant"]
        requested = entry["quantity"]
        available = variant.stock_qty if variant.stock_qty is not None else (variant.stock or 0)
        next_stock = max(0, available - requested)
        variant.stock_qty = next_stock
        variant.stock = next_stock
        variant.updated_at = datetime.utcnow()
        if variant.product:
            variant.product.stock_qty = sum(v.stock_qty if v.stock_qty is not None else (v.stock or 0) for v in variant.product.variants if v.is_active)
            variant.product.stock = variant.product.stock_qty
            variant.product.updated_at = datetime.utcnow()
        deductions.append({
            "product_id": variant.product_id,
            "variant_id": variant.id,
            "sku": variant.sku,
            "name": f"{variant.product.name if variant.product else 'Product'} - {variant.weight}" if variant.weight else (variant.product.name if variant.product else "Product"),
            "quantity": requested,
            "previous_stock": available,
            "new_stock": next_stock,
            "low_stock": 0 < next_stock <= 5,
            "out_of_stock": next_stock <= 0,
        })

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
        variant_id = getattr(item, "variant_id", None)
        if variant_id:
            variant = db.query(DBProductVariant).filter(DBProductVariant.id == variant_id).first()
            if variant:
                quantity = int(item.quantity or item.qty or 0)
                if quantity <= 0:
                    continue
                previous = variant.stock_qty if variant.stock_qty is not None else (variant.stock or 0)
                variant.stock_qty = previous + quantity
                variant.stock = variant.stock_qty
                variant.updated_at = datetime.utcnow()
                if variant.product:
                    variant.product.stock_qty = sum(v.stock_qty if v.stock_qty is not None else (v.stock or 0) for v in variant.product.variants if v.is_active)
                    variant.product.stock = variant.product.stock_qty
                    variant.product.updated_at = datetime.utcnow()
                restocked.append({
                    "product_id": variant.product_id,
                    "variant_id": variant.id,
                    "name": f"{variant.product.name if variant.product else 'Product'} - {variant.weight}" if variant.weight else (variant.product.name if variant.product else "Product"),
                    "quantity": quantity,
                    "previous_stock": previous,
                    "new_stock": variant.stock_qty,
                })
                continue
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


def parse_content_list(value) -> list:
    parsed = json_load(value, None)
    if isinstance(parsed, list):
        return [str(item).strip() for item in parsed if str(item).strip()]
    if parsed is not None:
        return [str(parsed).strip()] if str(parsed).strip() else []
    return [item.strip() for item in str(value or "").split(",") if item.strip()]


def slugify(value: str) -> str:
    clean = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value or ""))
    while "--" in clean:
        clean = clean.replace("--", "-")
    return clean.strip("-") or "item"


def foodnova_sku(name: str, weight: str = "") -> str:
    parts = ["FN", slugify(name).replace("-", "").upper()[:18]]
    if weight:
        parts.append(slugify(weight).replace("-", "").upper())
    return "-".join(parts)


def variant_to_dict(variant: DBProductVariant) -> dict:
    stock_qty = variant.stock_qty if variant.stock_qty is not None else (variant.stock or 0)
    return {
        "id": variant.id,
        "product_id": variant.product_id,
        "sku": variant.sku,
        "weight": variant.weight or "",
        "label": variant.weight or variant.sku,
        "price": variant.price or 0,
        "unit_price": variant.price or 0,
        "stock_qty": stock_qty,
        "stock": variant.stock if variant.stock is not None else stock_qty,
        "image_url": variant.image_url or "",
        "is_active": bool(variant.is_active),
        "active": bool(variant.is_active),
        "is_out_of_stock": stock_qty <= 0,
        "created_at": iso(variant.created_at),
        "updated_at": iso(variant.updated_at),
    }


def product_default_sku(product: DBProduct) -> str:
    return foodnova_sku(product.name or f"product-{product.id}")


def default_variant_payload(product_name: str, base_price: float, base_stock: int, product_image: str) -> list[dict]:
    if product_name in WEIGHT_VARIANT_PRODUCTS:
        return [
            {
                "sku": foodnova_sku(product_name, weight),
                "weight": weight,
                "price": float(base_price) * int(weight.replace("kg", "")),
                "stock_qty": int(base_stock),
                "stock": int(base_stock),
                "image_url": product_image,
                "is_active": True,
            }
            for weight in WEIGHT_VARIANTS
        ]
    return [
        {
            "sku": foodnova_sku(product_name),
            "weight": "",
            "price": float(base_price),
            "stock_qty": int(base_stock),
            "stock": int(base_stock),
            "image_url": product_image,
            "is_active": True,
        }
    ]


def is_combo_product(product: DBProduct) -> bool:
    haystack = " ".join([
        product.name or "",
        product.category or "",
        product.category_name or "",
        product.pack_info or "",
        product.description or "",
    ]).lower()
    return any(keyword in haystack for keyword in COMBO_KEYWORDS)


def make_placeholder_svg(title: str, subtitle: str, accent: str = "#0B7A3B") -> str:
    safe_title = str(title or "FoodNova").replace("&", "&amp;")
    safe_subtitle = str(subtitle or "Premium grocery").replace("&", "&amp;")
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F7FAEF"/>
      <stop offset="1" stop-color="#E4F4DC"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="900" fill="url(#bg)"/>
  <rect x="82" y="72" width="1036" height="756" rx="42" fill="#FFFFFF" stroke="#D7E8CF" stroke-width="6"/>
  <circle cx="960" cy="190" r="92" fill="{accent}" opacity=".16"/>
  <circle cx="230" cy="695" r="118" fill="#F3B63F" opacity=".22"/>
  <path d="M318 332h564l-48 294H366z" fill="{accent}" opacity=".12" stroke="{accent}" stroke-width="10" stroke-linejoin="round"/>
  <path d="M382 327c38-83 105-126 202-126 102 0 171 43 207 126" fill="none" stroke="{accent}" stroke-width="16" stroke-linecap="round"/>
  <rect x="425" y="392" width="350" height="52" rx="26" fill="{accent}" opacity=".9"/>
  <rect x="452" y="475" width="296" height="34" rx="17" fill="#F3B63F"/>
  <text x="600" y="620" text-anchor="middle" font-family="Arial, sans-serif" font-size="56" font-weight="800" fill="#173321">{safe_title}</text>
  <text x="600" y="680" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="600" fill="#4E6658">{safe_subtitle}</text>
</svg>
"""


def ensure_catalog_placeholder_images():
    accents = ["#0B7A3B", "#2F7D52", "#D69A19", "#B85C27", "#355E3B", "#704C9F"]
    for folder in ["products", "categories"]:
        os.makedirs(os.path.join(UPLOAD_DIR, "catalog", folder), exist_ok=True)

    default_path = os.path.join(UPLOAD_DIR, "catalog", "foodnova-placeholder.svg")
    if not os.path.exists(default_path):
        with open(default_path, "w", encoding="utf-8") as file:
            file.write(make_placeholder_svg("FoodNova", "Premium grocery placeholder", "#0B7A3B"))

    for idx, item in enumerate(FOODNOVA_PRODUCT_CATALOG):
        path = os.path.join(UPLOAD_DIR, "catalog", "products", f"{slugify(item['name'])}.svg")
        if not os.path.exists(path):
            with open(path, "w", encoding="utf-8") as file:
                file.write(make_placeholder_svg(item["name"], item["category"], accents[idx % len(accents)]))

    for idx, category in enumerate(FOODNOVA_CATEGORIES.keys()):
        path = os.path.join(UPLOAD_DIR, "catalog", "categories", f"{slugify(category)}.svg")
        if not os.path.exists(path):
            with open(path, "w", encoding="utf-8") as file:
                file.write(make_placeholder_svg(category, "FoodNova category", accents[idx % len(accents)]))


def sync_foodnova_catalog(db) -> dict:
    ensure_catalog_placeholder_images()
    removed = []
    added = []
    variants_created = []

    for product in db.query(DBProduct).all():
        if product.name in CATALOG_PRODUCT_NAMES or is_combo_product(product):
            continue
        if product.is_active:
            removed.append(product.name)
        product.is_active = False
        product.updated_at = datetime.utcnow()

    for item in FOODNOVA_PRODUCT_CATALOG:
        product = db.query(DBProduct).filter(func.lower(DBProduct.name) == item["name"].lower()).first()
        if not product:
            product = DBProduct(name=item["name"])
            db.add(product)
            db.flush()
            added.append(item["name"])
        product.category = item["category"]
        product.category_name = item["category"]
        product.description = item["description"]
        product.image_url = product.image_url or item["image"]
        product.contents = json_dump([item["name"]])
        product.pack_info = "Weight variants available" if item["name"] in WEIGHT_VARIANT_PRODUCTS else "Single grocery item"
        product.serving_estimate = "Select the quantity and weight that fits your household" if item["name"] in WEIGHT_VARIANT_PRODUCTS else "Serving varies by household use"
        product.freshness_note = "Quality checked and packed from FoodNova inventory"
        product.delivery_note = "Prepared after payment confirmation"
        product.is_active = True
        product.updated_at = datetime.utcnow()

        desired_variants = default_variant_payload(item["name"], item["price"], item["stock"], item["image"])
        first_variant = desired_variants[0]
        product.price = first_variant["price"]
        product.stock_qty = sum(v["stock_qty"] for v in desired_variants if v["is_active"])
        product.stock = product.stock_qty

        wanted_skus = {variant["sku"] for variant in desired_variants}
        for existing in list(product.variants or []):
            if existing.sku not in wanted_skus:
                existing.is_active = False
                existing.updated_at = datetime.utcnow()
        for variant_data in desired_variants:
            variant = db.query(DBProductVariant).filter(DBProductVariant.sku == variant_data["sku"]).first()
            is_new_variant = variant is None
            if not variant:
                variant = DBProductVariant(product_id=product.id, sku=variant_data["sku"])
                db.add(variant)
                variants_created.append({"product": item["name"], "weight": variant_data["weight"], "sku": variant_data["sku"]})
            variant.product_id = product.id
            variant.weight = variant_data["weight"]
            if is_new_variant:
                variant.price = variant_data["price"]
                variant.stock_qty = variant_data["stock_qty"]
                variant.stock = variant_data["stock"]
            elif variant.price is None:
                variant.price = variant_data["price"]
            if variant.stock_qty is None:
                variant.stock_qty = variant_data["stock_qty"]
            if variant.stock is None:
                variant.stock = variant.stock_qty
            variant.image_url = variant.image_url or variant_data["image_url"]
            variant.is_active = True
            variant.updated_at = datetime.utcnow()

        db.flush()
        active_variants = [variant for variant in (product.variants or []) if variant.is_active]
        if active_variants:
            product.price = active_variants[0].price or product.price or 0
            product.stock_qty = sum(variant.stock_qty if variant.stock_qty is not None else (variant.stock or 0) for variant in active_variants)
            product.stock = product.stock_qty

    return {
        "removed": removed,
        "added": added,
        "variants_created": variants_created,
        "categories": list(FOODNOVA_CATEGORIES.keys()),
        "product_images": [item["image"] for item in FOODNOVA_PRODUCT_CATALOG],
        "category_images": FOODNOVA_CATEGORY_IMAGES,
    }


async def read_json_payload(request: Request) -> dict:
    content_type = request.headers.get("content-type", "")
    if "application/json" not in content_type:
        return {}
    try:
        payload = await request.json()
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def apply_product_variants(db, product: DBProduct, variants_payload) -> list[dict]:
    if variants_payload is None:
        return [variant_to_dict(variant) for variant in (product.variants or [])]
    if isinstance(variants_payload, str):
        variants_payload = json_load(variants_payload, [])
    if not isinstance(variants_payload, list):
        return [variant_to_dict(variant) for variant in (product.variants or [])]

    kept_variant_ids = set()
    for raw_variant in variants_payload:
        if not isinstance(raw_variant, dict):
            continue
        variant_id = raw_variant.get("id")
        variant = None
        if variant_id:
            try:
                variant = db.query(DBProductVariant).filter(DBProductVariant.id == int(variant_id), DBProductVariant.product_id == product.id).first()
            except Exception:
                variant = None
        if not variant:
            sku = raw_variant.get("sku") or foodnova_sku(product.name, raw_variant.get("weight", ""))
            variant = db.query(DBProductVariant).filter(DBProductVariant.sku == sku).first()
        if not variant:
            variant = DBProductVariant(product_id=product.id, sku=raw_variant.get("sku") or foodnova_sku(product.name, raw_variant.get("weight", "")))
            db.add(variant)
        variant.product_id = product.id
        variant.weight = str(raw_variant.get("weight") or variant.weight or "").strip()
        variant.sku = str(raw_variant.get("sku") or variant.sku or foodnova_sku(product.name, variant.weight)).strip()
        if raw_variant.get("price") is not None:
            variant.price = float(raw_variant.get("price") or 0)
        if raw_variant.get("stock_qty") is not None or raw_variant.get("stock") is not None:
            stock = int(raw_variant.get("stock_qty") if raw_variant.get("stock_qty") is not None else raw_variant.get("stock") or 0)
            variant.stock_qty = stock
            variant.stock = stock
        if raw_variant.get("image_url") is not None:
            variant.image_url = raw_variant.get("image_url") or variant.image_url or product.image_url or ""
        if raw_variant.get("is_active") is not None or raw_variant.get("active") is not None:
            variant.is_active = bool(raw_variant.get("is_active") if raw_variant.get("is_active") is not None else raw_variant.get("active"))
        variant.updated_at = datetime.utcnow()
        if variant.id:
            kept_variant_ids.add(variant.id)

    db.flush()
    product.stock_qty = sum(v.stock_qty if v.stock_qty is not None else (v.stock or 0) for v in product.variants if v.is_active)
    product.stock = product.stock_qty
    active_variants = [v for v in product.variants if v.is_active]
    if active_variants:
        product.price = active_variants[0].price or product.price or 0
    product.updated_at = datetime.utcnow()
    return [variant_to_dict(variant) for variant in (product.variants or [])]


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


async def save_workforce_upload(file: Optional[UploadFile], allow_pdf: bool = False, folder: str = "foodnova/workforce") -> str:
    if not file:
        return ""
    allowed = RECEIPT_CONTENT_TYPES if allow_pdf else IMAGE_CONTENT_TYPES
    result = await upload_to_cloudinary(
        file,
        folder,
        allowed,
        10 if allow_pdf else 5,
        "Only JPG, PNG, WEBP, or PDF files are allowed." if allow_pdf else "Only JPG, PNG, or WEBP images are allowed.",
    )
    return result.get("url", "")


def db_user_to_dict(user: DBUser) -> dict:
    full_name = user.full_name or "FoodNova User"
    data = {
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
    if (user.role or "") in ["messenger", "rider"]:
        data["delivery_worker_type"] = user.role
    return data


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
    contents = parse_content_list(getattr(product, "contents", None))
    variants = [variant_to_dict(variant) for variant in (product.variants or []) if variant.is_active]
    variants.sort(key=lambda variant: (int(str(variant.get("weight") or "999kg").replace("kg", "") or 999), variant.get("sku", "")))
    if variants:
        stock_qty = sum(int(variant.get("stock_qty") or 0) for variant in variants)
        available_variants = [variant for variant in variants if int(variant.get("stock_qty") or 0) > 0]
        display_variant = available_variants[0] if available_variants else variants[0]
        display_price = display_variant.get("price", product.price or 0)
    else:
        display_price = product.price or 0
    return {
        "id": product.id,
        "name": product.name,
        "sku": product_default_sku(product),
        "price": display_price,
        "base_price": product.price or 0,
        "stock_qty": stock_qty,
        "stock": product.stock if product.stock is not None else stock_qty,
        "category": product.category or "",
        "category_name": product.category_name or product.category or "",
        "category_image_url": FOODNOVA_CATEGORY_IMAGES.get(product.category or product.category_name or "", ""),
        "image_url": product.image_url or "",
        "effective_image_url": product.image_url or FOODNOVA_CATEGORY_IMAGES.get(product.category or product.category_name or "", "") or FOODNOVA_DEFAULT_PLACEHOLDER,
        "default_image_url": FOODNOVA_DEFAULT_PLACEHOLDER,
        "description": product.description or "",
        "contents": contents,
        "included_items": contents,
        "has_variants": bool(variants),
        "variants": variants,
        "pack_info": getattr(product, "pack_info", "") or "",
        "serving_estimate": getattr(product, "serving_estimate", "") or "",
        "freshness_note": getattr(product, "freshness_note", "") or "",
        "delivery_note": getattr(product, "delivery_note", "") or "",
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
    items = parse_content_list(pack.items)
    return {
        "id": pack.id,
        "name": pack.name,
        "description": pack.description or "",
        "price": pack.price or 0,
        "is_active": bool(pack.is_active),
        "items": items,
        "contents": items,
        "included_items": items,
        "pack_info": "Curated FoodNova pack",
        "serving_estimate": "Sized for household restocking",
        "freshness_note": "Packed from current FoodNova inventory before dispatch",
        "delivery_note": "Delivered after payment confirmation and packing",
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
        "deleted_at": iso(getattr(rider, "deleted_at", None)),
        "deleted_by_admin_id": getattr(rider, "deleted_by_admin_id", None),
        "deleted_reason": getattr(rider, "deleted_reason", "") or "",
        "created_at": iso(rider.created_at),
        "updated_at": iso(rider.updated_at),
    }


def operational_zone_to_dict(zone: DBOperationalZone) -> dict:
    return {
        "id": zone.id,
        "zone_name": zone.zone_name or "FoodNova Local Zone",
        "center_latitude": zone.center_latitude,
        "center_longitude": zone.center_longitude,
        "radius_meters": zone.radius_meters or 0,
        "is_active": bool(zone.is_active),
        "created_at": iso(zone.created_at),
        "updated_at": iso(zone.updated_at),
    }


def worker_gps_age_seconds(worker: DBDeliveryWorker) -> Optional[float]:
    if not worker.last_seen_at:
        return None
    return max(0, (datetime.utcnow() - as_naive_utc(worker.last_seen_at)).total_seconds())


def worker_has_recent_gps(worker: DBDeliveryWorker, max_age_seconds: int = GPS_RECENCY_SECONDS) -> bool:
    age = worker_gps_age_seconds(worker)
    return age is not None and age <= max_age_seconds


def payload_has_recent_timestamp(payload: LocationPingPayload, max_age_seconds: int = GPS_RECENCY_SECONDS) -> bool:
    timestamp = as_naive_utc(payload.timestamp) if payload.timestamp else datetime.utcnow()
    age = (datetime.utcnow() - timestamp).total_seconds()
    return -10 <= age <= max_age_seconds


def as_naive_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def worker_assignment_policy(worker: DBDeliveryWorker) -> dict:
    worker_type = (worker.worker_type or "messenger").lower()
    promote_verified_approved_rider(worker)
    deleted = bool(getattr(worker, "deleted_at", None) or (worker.kyc_status or "") == "DELETED")
    approved = rider_lifecycle_status(worker) == "ACTIVE" and not deleted
    online = (worker.operational_status or "") in ["ONLINE", "BUSY"]
    gps_recent = worker_has_recent_gps(worker)
    is_messenger = worker_type == "messenger"
    inside_zone = bool(worker.inside_zone)
    eligible = approved and online and gps_recent and (inside_zone if is_messenger else True)
    if deleted:
        reason = "This account has been removed or deactivated."
    elif not approved:
        reason = "KYC approval required"
    elif not online:
        reason = "Worker is offline"
    elif not gps_recent:
        reason = f"GPS ping must be within {GPS_RECENCY_SECONDS} seconds"
    elif is_messenger and not inside_zone:
        reason = MESSENGER_OUTSIDE_ZONE_MESSAGE
    else:
        reason = "Ready for delivery assignment"
    return {
        "eligible": eligible,
        "reason": reason,
        "gps_recent": gps_recent,
        "gps_age_seconds": worker_gps_age_seconds(worker),
        "is_geo_fenced": is_messenger,
        "geo_fence_enforced": is_messenger,
        "assignment_scope": "hyperlocal" if is_messenger else "wide_area",
        "delivery_type_label": "Walking Messenger" if is_messenger else "Rider / Delivery Partner",
        "gps_ping_interval_seconds": 30 if is_messenger else 60,
        "active_delivery_ping_interval_seconds": 15,
        "can_receive_delivery_notifications": eligible,
        "can_accept_delivery_requests": eligible,
    }


RIDER_ONBOARDING_TOTAL_STEPS = 7
RIDER_ONBOARDING_STAGE_STEPS = {
    "account_created": 2,
    "identity_submitted": 2,
    "address_uploaded": 3,
    "emergency_contact_added": 3,
    "rider_profile_completed": 4,
    "selfie_verified": 5,
    "documents_uploaded": 5,
    "training_completed": 6,
    "admin_review": 7,
    "approved": 7,
    "rejected": 7,
    "suspended": 7,
    "deactivated": 7,
    "deleted": 7,
}


def rider_onboarding_step_for_stage(stage: str = "") -> int:
    value = RIDER_ONBOARDING_STAGE_STEPS.get((stage or "").strip().lower(), 1)
    return max(1, min(RIDER_ONBOARDING_TOTAL_STEPS, int(value)))


def rider_onboarding_progress_percent(current_step: int = 1) -> int:
    step = max(1, min(RIDER_ONBOARDING_TOTAL_STEPS, int(current_step or 1)))
    return int(round((step / RIDER_ONBOARDING_TOTAL_STEPS) * 100))


def worker_to_dict(worker: DBDeliveryWorker) -> dict:
    assignment_policy = worker_assignment_policy(worker)
    review_meta = delivery_worker_review_meta(worker)
    identity_meta = review_meta.get("identity_verification") or {}
    address_meta = review_meta.get("address_verification") or {}
    emergency_meta = review_meta.get("emergency_contact") or {}
    admin_override = review_meta.get("admin_override") or {}
    rejection_reason = admin_override.get("note") or identity_meta.get("rejection_reason") or review_meta.get("rejection_reason") or ""
    submitted_statuses = {"submitted", "pending_review", "manual_review", "verified", "approved", "completed", "not_required"}
    promote_verified_approved_rider(worker)
    lifecycle_status = rider_lifecycle_status(worker)
    rider_stage = "deleted" if getattr(worker, "deleted_at", None) or (worker.kyc_status or "") == "DELETED" else "approved" if lifecycle_status == "ACTIVE" else "suspended" if lifecycle_status == "SUSPENDED" else "deactivated" if lifecycle_status == "INACTIVE" else "admin_review" if all([(identity_meta.get("status") or "") in submitted_statuses, (address_meta.get("status") or "") in submitted_statuses, (emergency_meta.get("status") or "") in submitted_statuses, bool(worker.selfie_url)]) else "selfie_verified" if worker.selfie_url else "emergency_contact_added" if (emergency_meta.get("status") or "") in submitted_statuses else "address_uploaded" if (address_meta.get("status") or "") in submitted_statuses else "identity_submitted" if (identity_meta.get("status") or "") in submitted_statuses else "account_created"
    current_step = rider_onboarding_step_for_stage(rider_stage)
    progress_percent = rider_onboarding_progress_percent(current_step)
    documents_complete = bool(
        getattr(worker, "selfie_url", None)
        and getattr(worker, "id_document_url", None)
        and (address_meta.get("status") or "") in submitted_statuses
    )
    profile_completed = bool(
        (identity_meta.get("status") or "") in submitted_statuses
        and (emergency_meta.get("status") or "") in submitted_statuses
        and (worker.full_name or "").strip()
        and (worker.phone or "").strip()
    )
    return {
        "id": worker.id,
        "user_id": worker.user_id,
        "worker_type": worker.worker_type or "messenger",
        "delivery_worker_type": worker.worker_type or "messenger",
        "delivery_type_label": assignment_policy["delivery_type_label"],
        "full_name": worker.full_name or "",
        "name": worker.full_name or "",
        "phone": worker.phone or "",
        "email": worker.email or "",
        "home_address": worker.home_address or "",
        "operating_city": (identity_meta.get("operating_city") or worker.home_address or ""),
        "emergency_contact_name": worker.emergency_contact_name or "",
        "emergency_contact_phone": worker.emergency_contact_phone or "",
        "emergency_contact_relationship": emergency_meta.get("relationship") or "",
        "id_type": worker.id_type or "",
        "id_number": worker.id_number or "",
        "nin_verified": bool(getattr(worker, "nin_verified", False)),
        "nin_report_id": getattr(worker, "nin_report_id", "") or "",
        "nin_last4": getattr(worker, "nin_last4", "") or "",
        "masked_nin": f"*******{getattr(worker, 'nin_last4', '')}" if getattr(worker, "nin_last4", "") else "",
        "verified_first_name": getattr(worker, "verified_first_name", "") or "",
        "verified_middle_name": getattr(worker, "verified_middle_name", "") or "",
        "verified_surname": getattr(worker, "verified_surname", "") or "",
        "verified_phone": getattr(worker, "verified_phone", "") or "",
        "verified_gender": getattr(worker, "verified_gender", "") or "",
        "verified_birthdate": getattr(worker, "verified_birthdate", "") or "",
        "verified_photo_url": getattr(worker, "verified_photo_url", "") or "",
        "selfie_url": getattr(worker, "selfie_url", "") or "",
        "profile_photo_url": worker.profile_photo_url or "",
        "id_document_url": worker.id_document_url or "",
        "documents_uploaded": documents_complete,
        "profile_completed": profile_completed,
        "dashboard_access_allowed": bool(
            lifecycle_status == "ACTIVE"
            and getattr(worker, "nin_verified", False)
            and documents_complete
            and profile_completed
        ),
        "vehicle_type": worker.vehicle_type or "",
        "rider_type": identity_meta.get("rider_type") or ("walking" if (worker.worker_type or "") == "messenger" else "motorcycle"),
        "partner_company": getattr(worker, "partner_company", "") or "",
        "plate_number": worker.plate_number or "",
        "driver_license_number": worker.driver_license_number or "",
        "vehicle_photo_url": worker.vehicle_photo_url or "",
        "kyc_status": worker.kyc_status or "KYC_PENDING",
        "onboarding_stage": rider_stage,
        "current_step": current_step,
        "onboarding_current_step": current_step,
        "onboarding_step_total": RIDER_ONBOARDING_TOTAL_STEPS,
        "onboarding_progress_percent": progress_percent,
        "rejection_reason": rejection_reason,
        "operational_status": worker.operational_status or "OFFLINE",
        "review_note": worker.review_note or "",
        "trust_score": worker.trust_score or 100,
        "completed_deliveries": worker.completed_deliveries or 0,
        "failed_deliveries": worker.failed_deliveries or 0,
        "late_deliveries": worker.late_deliveries or 0,
        "customer_complaints": worker.customer_complaints or 0,
        "suspicious_gps_gaps": worker.suspicious_gps_gaps or 0,
        "latest_latitude": worker.latest_latitude,
        "latest_longitude": worker.latest_longitude,
        "latest_accuracy": worker.latest_accuracy,
        "latest_heading": worker.latest_heading,
        "latest_speed": worker.latest_speed,
        "last_seen_at": iso(worker.last_seen_at),
        "inside_zone": bool(worker.inside_zone),
        "gps_recent": assignment_policy["gps_recent"],
        "gps_age_seconds": assignment_policy["gps_age_seconds"],
        "is_geo_fenced": assignment_policy["is_geo_fenced"],
        "geo_fence_enforced": assignment_policy["geo_fence_enforced"],
        "assignment_scope": assignment_policy["assignment_scope"],
        "assignment_eligible": assignment_policy["eligible"],
        "assignment_eligibility_reason": assignment_policy["reason"],
        "can_receive_delivery_notifications": assignment_policy["can_receive_delivery_notifications"],
        "can_accept_delivery_requests": assignment_policy["can_accept_delivery_requests"],
        "can_go_online": bool(
            lifecycle_status == "ACTIVE"
            and getattr(worker, "nin_verified", False)
            and documents_complete
            and profile_completed
        ),
        "wallet_enabled": lifecycle_status == "ACTIVE",
        "gps_ping_interval_seconds": assignment_policy["gps_ping_interval_seconds"],
        "active_delivery_ping_interval_seconds": assignment_policy["active_delivery_ping_interval_seconds"],
        "approved_at": iso(worker.approved_at),
        "approved_by_admin_name": worker.approved_by_admin_name or "",
        "suspended_at": iso(worker.suspended_at),
        "deactivated_at": iso(getattr(worker, "deactivated_at", None)),
        "deleted_at": iso(getattr(worker, "deleted_at", None)),
        "deleted_by_admin_id": getattr(worker, "deleted_by_admin_id", None),
        "deleted_reason": getattr(worker, "deleted_reason", "") or "",
        "created_at": iso(worker.created_at),
        "updated_at": iso(worker.updated_at),
    }


def worker_dashboard_access_allowed(worker: DBDeliveryWorker) -> bool:
    review_meta = delivery_worker_review_meta(worker)
    identity_meta = review_meta.get("identity_verification") or {}
    address_meta = review_meta.get("address_verification") or {}
    emergency_meta = review_meta.get("emergency_contact") or {}
    submitted_statuses = {"submitted", "pending_review", "manual_review", "verified", "approved", "completed", "not_required"}
    documents_complete = bool(
        getattr(worker, "selfie_url", None)
        and getattr(worker, "id_document_url", None)
        and (address_meta.get("status") or "") in submitted_statuses
    )
    profile_completed = bool(
        (identity_meta.get("status") or "") in submitted_statuses
        and (emergency_meta.get("status") or "") in submitted_statuses
        and (worker.full_name or "").strip()
        and (worker.phone or "").strip()
    )
    return bool(
        rider_lifecycle_status(worker) == "ACTIVE"
        and getattr(worker, "nin_verified", False)
        and documents_complete
        and profile_completed
    )


def order_item_to_dict(item: DBOrderItem) -> dict:
    return {
        "id": item.id,
        "product_id": item.product_id,
        "variant_id": getattr(item, "variant_id", None),
        "variant_weight": getattr(item, "variant_weight", "") or "",
        "sku": getattr(item, "sku", "") or "",
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
        "delivery_type": getattr(order, "delivery_type", "needs_admin_review") or "needs_admin_review",
        "estimated_distance_meters": getattr(order, "estimated_distance_meters", None),
        "delivery_worker_id": getattr(order, "delivery_worker_id", None),
        "delivery_worker_type": getattr(order, "delivery_worker_type", "") or "",
        "delivery_status": getattr(order, "delivery_status", "") or "",
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


def distance_meters(lat1, lon1, lat2, lon2) -> float:
    radius = 6371000
    phi1 = math.radians(float(lat1))
    phi2 = math.radians(float(lat2))
    d_phi = math.radians(float(lat2) - float(lat1))
    d_lambda = math.radians(float(lon2) - float(lon1))
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def get_order_delivery_coordinates(order: DBOrder) -> tuple[Optional[float], Optional[float]]:
    snapshot = json_load(getattr(order, "delivery_address_snapshot", None), None) or {}
    sources = [snapshot]
    if isinstance(snapshot.get("address"), dict):
        sources.append(snapshot.get("address"))
    for source in sources:
        lat = source.get("latitude") or source.get("lat")
        lng = source.get("longitude") or source.get("lng") or source.get("lon")
        if lat is not None and lng is not None:
            try:
                return float(lat), float(lng)
            except (TypeError, ValueError):
                pass
    if getattr(order, "delivery_address_id", None):
        address = db_address = None
        try:
            db_address = SessionLocal()
            address = db_address.query(DBAddress).filter(DBAddress.id == order.delivery_address_id).first()
            if address and address.latitude is not None and address.longitude is not None:
                return float(address.latitude), float(address.longitude)
        finally:
            if db_address:
                db_address.close()
    return None, None


def get_active_operational_zone(db) -> Optional[DBOperationalZone]:
    return db.query(DBOperationalZone).filter(DBOperationalZone.is_active == True).order_by(DBOperationalZone.updated_at.desc(), DBOperationalZone.id.desc()).first()


def ensure_default_operational_zone(db) -> DBOperationalZone:
    zone = get_active_operational_zone(db)
    if zone:
        return zone
    zone = DBOperationalZone(zone_name="FoodNova Local Zone", center_latitude=6.5244, center_longitude=3.3792, radius_meters=5000, is_active=True)
    db.add(zone)
    db.commit()
    db.refresh(zone)
    return zone


def classify_order_delivery(order: DBOrder, db) -> tuple[str, Optional[float]]:
    if (order.delivery_method or "delivery") != "delivery":
        return "needs_admin_review", None
    lat, lng = get_order_delivery_coordinates(order)
    if lat is None or lng is None:
        return "needs_admin_review", None
    zone = ensure_default_operational_zone(db)
    distance = distance_meters(lat, lng, zone.center_latitude, zone.center_longitude)
    return ("short_distance" if distance <= float(zone.radius_meters or 0) else "long_distance"), distance


def classify_and_save_order_delivery(order: DBOrder, db) -> tuple[str, Optional[float]]:
    delivery_type, distance = classify_order_delivery(order, db)
    order.delivery_type = delivery_type
    order.estimated_distance_meters = distance
    return delivery_type, distance


def delivery_area_for_order(order: DBOrder) -> str:
    snapshot = json_load(getattr(order, "delivery_address_snapshot", None), None) or {}
    pieces = [snapshot.get("area"), snapshot.get("city"), snapshot.get("lga"), snapshot.get("state")]
    area = ", ".join([str(piece) for piece in pieces if piece])
    return area or "Customer area"


DELIVERY_PIN_LENGTH = 4
LEGACY_DELIVERY_PIN_LENGTHS = {6}


def generate_delivery_pin(db) -> str:
    for _ in range(20):
        code = f"{random.randint(0, 10 ** DELIVERY_PIN_LENGTH - 1):0{DELIVERY_PIN_LENGTH}d}"
        exists = db.query(DBOrder).filter(
            DBOrder.delivery_code == code,
            DBOrder.delivery_confirmed_at.is_(None),
            DBOrder.order_status.notin_(["delivered", "cancelled"]),
        ).first()
        if not exists:
            return code
    return f"{random.randint(0, 10 ** DELIVERY_PIN_LENGTH - 1):0{DELIVERY_PIN_LENGTH}d}"


def validate_delivery_pin_input(submitted_code: str, stored_code: str) -> str:
    submitted = str(submitted_code or "").strip()
    stored = str(stored_code or "").strip()
    expected_lengths = {DELIVERY_PIN_LENGTH}
    if len(stored) in LEGACY_DELIVERY_PIN_LENGTHS:
        expected_lengths.add(len(stored))
    if not submitted.isdigit() or len(submitted) not in expected_lengths:
        expected = " or ".join(f"{length} digits" for length in sorted(expected_lengths))
        raise HTTPException(status_code=400, detail=f"Delivery confirmation code must be exactly {expected}")
    return submitted


def ensure_order_delivery_pin(db, order: DBOrder) -> str:
    if (order.delivery_method or "delivery") != "delivery":
        return ""
    if not (order.delivery_code or "").strip():
        order.delivery_code = generate_delivery_pin(db)
        order.delivery_code_created_at = datetime.utcnow()
    return order.delivery_code or ""


def canonical_dispatch_status(order: DBOrder) -> str:
    raw_delivery = str(getattr(order, "delivery_status", "") or "").strip().lower()
    raw_order = str(order.fulfillment_status or order.order_status or order.status or "").strip().lower()
    if raw_order == "cancelled" or raw_delivery == "cancelled":
        return "CANCELLED"
    if raw_order == "delivered" or raw_delivery == "delivered":
        return "DELIVERED"
    if raw_delivery in {"arrived", "arrived_at_customer"}:
        return "ARRIVED"
    if raw_delivery in {"in_transit", "en_route_to_customer", "out_for_delivery"}:
        return "IN_TRANSIT"
    if raw_delivery in {"picked_up", "pickedup"}:
        return "PICKED_UP"
    if raw_delivery == "accepted":
        return "ACCEPTED"
    if raw_delivery == "assigned" or getattr(order, "delivery_worker_id", None) or getattr(order, "rider_id", None):
        return "ASSIGNED"
    return "NEW"


def dispatch_order_to_dict(order: DBOrder) -> dict:
    data = order_to_dict(order)
    data["dispatch_status"] = canonical_dispatch_status(order)
    data["delivery_pin"] = order.delivery_code or ""
    return data


def valid_tracking_coordinate(lat, lng) -> bool:
    try:
        lat = float(lat)
        lng = float(lng)
    except (TypeError, ValueError):
        return False
    if lat == 0 and lng == 0:
        return False
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return False
    return True


def decode_google_polyline(encoded: str) -> List[dict]:
    points = []
    index = 0
    lat = 0
    lng = 0
    while index < len(encoded or ""):
        for coord in ("lat", "lng"):
            shift = 0
            result = 0
            while index < len(encoded):
                byte = ord(encoded[index]) - 63
                index += 1
                result |= (byte & 0x1F) << shift
                shift += 5
                if byte < 0x20:
                    break
            delta = ~(result >> 1) if result & 1 else result >> 1
            if coord == "lat":
                lat += delta
            else:
                lng += delta
        points.append({"latitude": lat / 1e5, "longitude": lng / 1e5})
    return points


def tracking_route_service(rider_lat: float, rider_lng: float, customer_lat: float, customer_lng: float) -> dict:
    google_key = (
        os.getenv("GOOGLE_DIRECTIONS_API_KEY")
        or os.getenv("GOOGLE_MAPS_API_KEY")
        or os.getenv("GOOGLE_PLACES_API_KEY")
        or ""
    ).strip()
    if google_key:
        params = urllib.parse.urlencode({
            "origin": f"{rider_lat},{rider_lng}",
            "destination": f"{customer_lat},{customer_lng}",
            "mode": "driving",
            "key": google_key,
        })
        url = f"https://maps.googleapis.com/maps/api/directions/json?{params}"
        try:
            with urllib.request.urlopen(url, timeout=8) as response:
                body = json.loads(response.read().decode("utf-8"))
            route = (body.get("routes") or [{}])[0]
            leg = (route.get("legs") or [{}])[0]
            distance_meters_value = (leg.get("distance") or {}).get("value")
            duration_seconds = (leg.get("duration") or {}).get("value")
            polyline = ((route.get("overview_polyline") or {}).get("points") or "")
            if distance_meters_value is not None and duration_seconds is not None and polyline:
                return {
                    "distance_meters": float(distance_meters_value),
                    "eta_minutes": max(1, math.ceil(float(duration_seconds) / 60)),
                    "route_polyline": decode_google_polyline(polyline),
                    "route_provider": "google_directions",
                    "route_status": body.get("status") or "OK",
                }
            return {"route_provider": "google_directions", "route_status": body.get("status") or "NO_ROUTE"}
        except Exception as error:
            print("TRACK_RIDER_ROUTE_ERROR", json_dump({"provider": "google_directions", "error": repr(error)}))

    osrm_url = (
        "https://router.project-osrm.org/route/v1/driving/"
        f"{rider_lng},{rider_lat};{customer_lng},{customer_lat}"
        "?overview=full&geometries=geojson"
    )
    try:
        with urllib.request.urlopen(osrm_url, timeout=8) as response:
            body = json.loads(response.read().decode("utf-8"))
        route = (body.get("routes") or [{}])[0]
        coordinates = (((route.get("geometry") or {}).get("coordinates")) or [])
        if route.get("distance") is not None and route.get("duration") is not None and coordinates:
            return {
                "distance_meters": float(route.get("distance")),
                "eta_minutes": max(1, math.ceil(float(route.get("duration")) / 60)),
                "route_polyline": [{"latitude": lat, "longitude": lng} for lng, lat in coordinates],
                "route_provider": "osrm",
                "route_status": body.get("code") or "Ok",
            }
        return {"route_provider": "osrm", "route_status": body.get("code") or "NO_ROUTE"}
    except Exception as error:
        print("TRACK_RIDER_ROUTE_ERROR", json_dump({"provider": "osrm", "error": repr(error)}))
    return {"route_provider": "none", "route_status": "UNAVAILABLE"}


def order_rider_location_payload(order: DBOrder, db) -> dict:
    worker_id = getattr(order, "delivery_worker_id", None) or getattr(order, "rider_id", None)
    worker = db.query(DBDeliveryWorker).filter(DBDeliveryWorker.id == worker_id).first() if worker_id else None
    customer_lat, customer_lng = get_order_delivery_coordinates(order)
    rider_lat = getattr(worker, "latest_latitude", None) if worker else None
    rider_lng = getattr(worker, "latest_longitude", None) if worker else None
    rider_valid = valid_tracking_coordinate(rider_lat, rider_lng)
    customer_valid = valid_tracking_coordinate(customer_lat, customer_lng)
    distance_remaining = None
    eta_minutes = None
    route_polyline = []
    route_provider = "none"
    route_status = "WAITING_FOR_COORDINATES"
    if rider_valid and customer_valid:
        route = tracking_route_service(float(rider_lat), float(rider_lng), float(customer_lat), float(customer_lng))
        distance_remaining = route.get("distance_meters")
        eta_minutes = route.get("eta_minutes")
        route_polyline = route.get("route_polyline") or []
        route_provider = route.get("route_provider") or "none"
        route_status = route.get("route_status") or "UNAVAILABLE"

    dispatch_status = canonical_dispatch_status(order)
    tracking_visible = dispatch_status in {"PICKED_UP", "IN_TRANSIT", "ARRIVED"}
    tracking_available = tracking_visible and rider_valid and customer_valid and bool(route_polyline)
    if getattr(order, "delivery_confirmed_at", None):
        tracking_visible = False
        tracking_available = False

    print("TRACK_RIDER_COORDINATES", json_dump({
        "order_id": order.id,
        "rider_id": worker_id,
        "rider_coordinates": {"latitude": rider_lat, "longitude": rider_lng, "valid": rider_valid},
        "customer_coordinates": {"latitude": customer_lat, "longitude": customer_lng, "valid": customer_valid},
        "route_provider": route_provider,
        "route_status": route_status,
        "calculated_distance_meters": distance_remaining,
        "calculated_eta_minutes": eta_minutes,
    }))

    return {
        "order_id": order.id,
        "order_code": order.order_code or "",
        "delivery_status": dispatch_status,
        "tracking_visible": tracking_visible,
        "tracking_available": tracking_available,
        "route_provider": route_provider,
        "route_status": route_status,
        "rider": {
            "id": worker.id if worker else worker_id,
            "name": (worker.full_name if worker else None) or getattr(order, "rider_name", "") or "",
            "phone": (worker.phone if worker else None) or getattr(order, "rider_phone", "") or "",
            "vehicle_type": (worker.vehicle_type if worker else None) or getattr(order, "rider_vehicle_type", "") or "",
            "vehicle_number": (worker.plate_number if worker else None) or getattr(order, "rider_vehicle_number", "") or "",
            "latitude": float(rider_lat) if rider_valid else None,
            "longitude": float(rider_lng) if rider_valid else None,
            "accuracy": getattr(worker, "latest_accuracy", None) if worker else None,
            "heading": getattr(worker, "latest_heading", None) if worker else None,
            "speed": getattr(worker, "latest_speed", None) if worker else None,
            "last_updated_at": iso(getattr(worker, "last_seen_at", None)) if worker else "",
        },
        "customer": {
            "latitude": float(customer_lat) if customer_valid else None,
            "longitude": float(customer_lng) if customer_valid else None,
            "address": order.delivery_address or "",
        },
        "distance_meters": distance_remaining,
        "eta_minutes": eta_minutes,
        "route_polyline": route_polyline,
    }


def order_rider_location_response(order: DBOrder, db) -> dict:
    data = order_rider_location_payload(order, db)
    rider = data.get("rider") or {}
    location = {
        "latitude": rider.get("latitude"),
        "longitude": rider.get("longitude"),
        "accuracy": rider.get("accuracy"),
        "heading": rider.get("heading"),
        "speed": rider.get("speed"),
    }
    return {
        "success": True,
        "rider": {
            "id": rider.get("id"),
            "name": rider.get("name") or "",
            "phone": rider.get("phone") or "",
        },
        "location": location,
        "deliveryStatus": data.get("delivery_status") or "",
        "updatedAt": rider.get("last_updated_at") or "",
        "trackingAvailable": bool(data.get("tracking_available")),
        "tracking": data,
        "data": data,
    }


def worker_inside_zone(worker: DBDeliveryWorker, latitude: float, longitude: float, db) -> bool:
    if (worker.worker_type or "") != "messenger":
        return False
    zone = ensure_default_operational_zone(db)
    if not zone.is_active:
        return True
    return distance_meters(latitude, longitude, zone.center_latitude, zone.center_longitude) <= float(zone.radius_meters or 0)


def delivery_offer_to_dict(offer: DBDeliveryOffer, worker: DBDeliveryWorker = None, order: DBOrder = None) -> dict:
    return {
        "id": offer.id,
        "order_id": offer.order_id,
        "order_code": offer.order_code or (order.order_code if order else ""),
        "worker_id": offer.worker_id,
        "worker_type": offer.worker_type or "",
        "worker_name": worker.full_name if worker else "",
        "worker_phone": worker.phone if worker else "",
        "worker_status": worker.operational_status if worker else "",
        "customer_name": order.customer_name if order else "",
        "customer_phone": (order.customer_phone or order.phone) if order else "",
        "status": offer.status or "PENDING",
        "delivery_type": offer.delivery_type or "needs_admin_review",
        "estimated_distance_meters": offer.estimated_distance_meters,
        "pickup_area": offer.pickup_area or "FoodNova pickup",
        "delivery_area": offer.delivery_area or "",
        "delivery_address": order.delivery_address if order and offer.status == "ASSIGNED" else "",
        "delivery_notes": order.delivery_notes if order else "",
        "delivery_note": order.delivery_note if order else "",
        "delivery_code": order.delivery_code if order else "",
        "delivery_pin": order.delivery_code if order else "",
        "accepted_at": iso(offer.accepted_at),
        "declined_at": iso(offer.declined_at),
        "expires_at": iso(offer.expires_at),
        "created_at": iso(offer.created_at),
        "updated_at": iso(offer.updated_at),
    }


def expire_stale_delivery_offers(db) -> list[int]:
    stale = db.query(DBDeliveryOffer).filter(
        DBDeliveryOffer.status == "PENDING",
        DBDeliveryOffer.expires_at < datetime.utcnow(),
    ).all()
    order_ids = [offer.order_id for offer in stale]
    for offer in stale:
        offer.status = "EXPIRED"
        offer.updated_at = datetime.utcnow()
        create_admin_audit_log(None, {"id": None, "full_name": "FoodNova System", "email": "system@foodnova.com.ng"}, "delivery_offer_expired", "delivery_offer", offer.id, f"Delivery offer expired for order {offer.order_code}", {"order_id": offer.order_id, "worker_id": offer.worker_id})
    return order_ids


def worker_has_active_assignment(db, worker: DBDeliveryWorker, exclude_offer_id: Optional[int] = None) -> bool:
    query = db.query(DBDeliveryOffer).filter(
        DBDeliveryOffer.worker_id == worker.id,
        DBDeliveryOffer.status.in_(["PENDING", "ACCEPTED", "ASSIGNED"]),
    )
    if exclude_offer_id:
        query = query.filter(DBDeliveryOffer.id != exclude_offer_id)
    return query.first() is not None


def worker_eligible_for_offer(db, worker: DBDeliveryWorker, delivery_type: str, exclude_offer_id: Optional[int] = None) -> bool:
    if delivery_worker_access_block_reason(worker):
        return False
    if promote_verified_approved_rider(worker):
        sync_rider_onboarding_state(db, worker, {"id": "system", "email": "system"}, "Auto-activated verified approved rider for delivery offer")
    if rider_lifecycle_status(worker) != "ACTIVE" or worker.operational_status != "ONLINE":
        return False
    if worker_has_active_assignment(db, worker, exclude_offer_id):
        return False
    age = worker_gps_age_seconds(worker)
    if age is None:
        return False
    if worker.worker_type == "messenger":
        return delivery_type == "short_distance" and bool(worker.inside_zone) and age <= GPS_RECENCY_SECONDS
    if worker.worker_type == "rider":
        return age <= 120
    return False


def find_available_delivery_worker(db, delivery_type: str, excluded_worker_ids: set[int] = None) -> Optional[DBDeliveryWorker]:
    excluded_worker_ids = excluded_worker_ids or set()
    type_order = ["messenger", "rider"] if delivery_type == "short_distance" else ["rider"] if delivery_type == "long_distance" else []
    for worker_type in type_order:
        workers = db.query(DBDeliveryWorker).filter(
            DBDeliveryWorker.worker_type == worker_type,
            or_(
                DBDeliveryWorker.kyc_status == "ACTIVE",
                and_(DBDeliveryWorker.kyc_status == "APPROVED", DBDeliveryWorker.nin_verified == True),
            ),
            DBDeliveryWorker.operational_status == "ONLINE",
            DBDeliveryWorker.deleted_at.is_(None),
        ).order_by(DBDeliveryWorker.last_seen_at.desc(), DBDeliveryWorker.id.asc()).all()
        for worker in workers:
            if worker.id not in excluded_worker_ids and worker_eligible_for_offer(db, worker, delivery_type):
                return worker
    return None


def create_delivery_offer_for_order(db, order: DBOrder, worker: DBDeliveryWorker) -> DBDeliveryOffer:
    offer = DBDeliveryOffer(
        order_id=order.id,
        order_code=order.order_code,
        worker_id=worker.id,
        worker_type=worker.worker_type or "",
        status="PENDING",
        delivery_type=order.delivery_type or "needs_admin_review",
        estimated_distance_meters=order.estimated_distance_meters,
        pickup_area="FoodNova pickup",
        delivery_area=delivery_area_for_order(order),
        expires_at=datetime.utcnow() + timedelta(seconds=60),
    )
    db.add(offer)
    db.flush()
    _create_user_notification(
        worker.email,
        "New delivery request available",
        f"New {offer.delivery_type.replace('_', ' ')} delivery request available for order {order.order_code}.",
        "delivery_offer",
        "delivery",
        order_to_dict(order),
    )
    send_delivery_offer_push(worker, offer)
    return offer


def start_delivery_matching(db, order: DBOrder, request: Request = None) -> Optional[DBDeliveryOffer]:
    if (order.delivery_method or "delivery") != "delivery":
        return None
    expire_stale_delivery_offers(db)
    if not getattr(order, "delivery_type", None):
        classify_and_save_order_delivery(order, db)
    if order.delivery_type == "needs_admin_review":
        return None
    existing = db.query(DBDeliveryOffer).filter(
        DBDeliveryOffer.order_id == order.id,
        DBDeliveryOffer.status.in_(["PENDING", "ACCEPTED", "ASSIGNED"]),
    ).first()
    if existing:
        return existing
    excluded = {
        offer.worker_id
        for offer in db.query(DBDeliveryOffer).filter(
            DBDeliveryOffer.order_id == order.id,
            DBDeliveryOffer.status.in_(["DECLINED", "EXPIRED"]),
        ).all()
    }
    worker = find_available_delivery_worker(db, order.delivery_type, excluded)
    if not worker:
        return None
    offer = create_delivery_offer_for_order(db, order, worker)
    create_admin_audit_log(
        request,
        {"id": None, "full_name": "FoodNova System", "email": "system@foodnova.com.ng"},
        "delivery_offer_created",
        "order",
        order.id,
        f"Delivery offer created for {worker.full_name} on order {order.order_code}",
        {"order_code": order.order_code, "worker_id": worker.id, "worker_type": worker.worker_type, "delivery_type": order.delivery_type},
    )
    create_admin_audit_log(
        request,
        {"id": None, "full_name": "FoodNova System", "email": "system@foodnova.com.ng"},
        "delivery_offer_sent",
        "delivery_offer",
        offer.id,
        f"Delivery offer sent to {worker.full_name} for order {order.order_code}",
        {"order_code": order.order_code, "worker_id": worker.id, "worker_type": worker.worker_type},
    )
    return offer


def assign_delivery_offer_to_order(db, offer: DBDeliveryOffer, worker: DBDeliveryWorker, order: DBOrder, request: Request, actor: dict, automatic: bool = False) -> dict:
    offer.status = "ASSIGNED"
    offer.updated_at = datetime.utcnow()
    ensure_order_delivery_pin(db, order)
    order.delivery_worker_id = worker.id
    order.delivery_worker_type = worker.worker_type or ""
    order.delivery_status = "ASSIGNED"
    order.rider_id = worker.id
    order.rider_name = worker.full_name
    order.rider_phone = worker.phone
    order.rider_vehicle_type = worker.vehicle_type or ""
    order.rider_vehicle_number = worker.plate_number or ""
    order.delivery_assigned_at = datetime.utcnow()
    order.updated_at = datetime.utcnow()
    worker.operational_status = "BUSY"
    worker.updated_at = datetime.utcnow()
    db.flush()
    order_data = order_to_dict(order)
    _create_user_notification(
        worker.email,
        "You have been assigned this delivery",
        f"You have been assigned order {order.order_code}.",
        "delivery_assigned",
        "delivery",
        order_data,
    )
    _create_order_notification(
        order_data,
        "Delivery Assigned",
        "Your order has been assigned for delivery.",
        "delivery_update",
        "delivery",
    )
    _create_admin_notifications(
        f"Delivery assigned for order #{order.order_code}",
        f"{worker.full_name} has been assigned to order #{order.order_code}.",
        "delivery_auto_assigned" if automatic else "delivery_manual_assigned",
        "delivery",
        order_data,
    )
    action = "delivery_auto_assigned" if automatic else "delivery_manual_assigned"
    create_admin_audit_log(request, actor, action, "delivery_offer", offer.id, f"{'System auto assigned' if automatic else 'Admin assigned'} {worker.full_name} to order {order.order_code}", {"offer": delivery_offer_to_dict(offer, worker, order)})
    return order_data


def require_worker(request: Request, expected_type: Optional[str] = None):
    user = require_user(request)
    if user.get("role") not in ["messenger", "rider"]:
        raise HTTPException(status_code=403, detail="Delivery worker access required.")
    if expected_type and user.get("role") != expected_type:
        raise HTTPException(status_code=403, detail=f"{expected_type.title()} access required.")
    db = SessionLocal()
    try:
        worker = db.query(DBDeliveryWorker).filter(DBDeliveryWorker.user_id == user.get("id")).first()
        if not worker:
            raise HTTPException(status_code=404, detail="Delivery worker profile not found.")
        return user, worker_to_dict(worker)
    finally:
        db.close()


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
        "dispatch_status": canonical_dispatch_status(order),
        "delivery_status": getattr(order, "delivery_status", "") or "",
        "delivery_code": order.delivery_code or "",
        "delivery_pin": order.delivery_code or "",
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
    image_url = announcement.image_url or ""
    display_type = announcement.display_type or "top_bar"
    button_text = announcement.button_text or ""
    button_link = announcement.button_link or ""
    is_active = bool(announcement.is_active)
    return {
        "id": announcement.id,
        "title": announcement.title,
        "message": announcement.message,
        "display_type": display_type,
        "displayType": display_type,
        "button_text": button_text,
        "buttonText": button_text,
        "button_link": button_link,
        "buttonLink": button_link,
        "image_url": image_url,
        "imageUrl": image_url,
        "theme": announcement.theme or "green",
        "priority": announcement.priority or 0,
        "is_active": is_active,
        "isActive": is_active,
        "start_date": iso(announcement.start_date),
        "startDate": iso(announcement.start_date),
        "end_date": iso(announcement.end_date),
        "endDate": iso(announcement.end_date),
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
        "device_type": getattr(log, "device_type", "") or "",
        "browser": getattr(log, "browser", "") or "",
        "operating_system": getattr(log, "operating_system", "") or "",
        "location_country": getattr(log, "location_country", "") or "",
        "location_region": getattr(log, "location_region", "") or "",
        "location_city": getattr(log, "location_city", "") or "",
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


def normalize_delivery_phone(phone: str) -> str:
    digits = "".join(ch for ch in str(phone or "") if ch.isdigit())
    if not digits:
        return ""
    if digits.startswith("234"):
        national = digits[3:]
    elif digits.startswith("0"):
        national = digits[1:]
    else:
        national = digits
    national = national[:10]
    if len(national) != 10 or national[0] not in ["7", "8", "9"]:
        return ""
    return f"+234{national}"


def get_delivery_worker_by_phone(db, phone: str, include_deleted: bool = False):
    normalized = normalize_delivery_phone(phone)
    if not normalized:
        return None
    query = db.query(DBDeliveryWorker).filter(DBDeliveryWorker.phone == normalized)
    if not include_deleted:
        query = query.filter(DBDeliveryWorker.deleted_at.is_(None), DBDeliveryWorker.kyc_status != "DELETED")
    return query.first()


def delivery_worker_auth_response(user: DBUser, worker: DBDeliveryWorker, request: Optional[Request] = None) -> dict:
    token = create_access_token(user)
    record_rider_session(token, user, worker, request)
    db = SessionLocal()
    try:
        attached_worker = db.query(DBDeliveryWorker).filter(DBDeliveryWorker.id == worker.id).first()
        progress = onboarding_progress_payload(db, attached_worker) if attached_worker else {}
    finally:
        db.close()
    requires_verification = rider_lifecycle_status(worker) != "ACTIVE"
    print("RIDER_LOGIN_SUCCESS", json_dump({
        "worker_id": worker.id,
        "user_id": user.id,
        "approval_status": worker.kyc_status or "KYC_PENDING",
        "worker_type": worker.worker_type or "",
        "timestamp": iso(datetime.utcnow()),
    }))
    print("RIDER_APPROVAL_STATUS", json_dump({"worker_id": worker.id, "status": worker.kyc_status or "KYC_PENDING"}))
    worker_data = worker_to_dict(worker)
    if progress:
        worker_data["current_step"] = progress.get("current_step")
        worker_data["onboarding_current_step"] = progress.get("current_step")
        worker_data["onboarding_step_total"] = progress.get("step_total")
        worker_data["onboarding_progress_percent"] = progress.get("progress_percent")
        worker_data["onboarding_stage"] = progress.get("onboarding_stage")
    return {
        "success": True,
        "worker_id": str(worker.id),
        "access_token": token,
        "token": token,
        "requires_verification": requires_verification,
        "approval_status": worker.kyc_status or "KYC_PENDING",
        "worker": worker_data,
        "onboarding_progress": progress,
        "message": "Authenticated successfully.",
    }


def log_delivery_auth_event(event: str, phone: str, reason: str = "", worker_id: Optional[int] = None, user_id: Optional[int] = None, scheme: str = ""):
    safe_phone = f"***{str(phone or '')[-4:]}" if phone else ""
    print(
        "DELIVERY_AUTH",
        json_dump({
            "event": event,
            "phone": safe_phone,
            "worker_id": worker_id,
            "user_id": user_id,
            "reason": reason,
            "password_scheme": scheme,
            "timestamp": iso(datetime.utcnow()),
        }),
    )


def get_delivery_worker_record_for_request(request: Request):
    user = require_user(request)
    if user.get("role") not in ["messenger", "rider"]:
        raise HTTPException(status_code=403, detail="Delivery worker access required.")
    db = SessionLocal()
    try:
        worker = db.query(DBDeliveryWorker).filter(DBDeliveryWorker.user_id == user.get("id")).first()
        if not worker:
            print("RIDER_PROFILE_NOT_FOUND", json_dump({"user_id": user.get("id"), "route": "delivery_worker_record", "timestamp": iso(datetime.utcnow())}))
            raise HTTPException(status_code=404, detail="Delivery worker profile not found.")
        blocked_reason = delivery_worker_access_block_reason(worker)
        if blocked_reason:
            raise HTTPException(status_code=401, detail=blocked_reason)
        return db, user, worker
    except Exception:
        db.close()
        raise


def delivery_worker_review_meta(worker: DBDeliveryWorker) -> dict:
    existing = json_load(worker.review_note, {}) if worker and worker.review_note else {}
    return existing if isinstance(existing, dict) else {}


def set_delivery_worker_review_meta(worker: DBDeliveryWorker, key: str, value: dict) -> None:
    meta = delivery_worker_review_meta(worker)
    meta[key] = value
    worker.review_note = json_dump(meta)


RIDER_ONBOARDING_STAGES = [
    "account_created", "identity_submitted", "address_uploaded", "emergency_contact_added",
    "selfie_verified", "admin_review", "approved", "rejected", "suspended", "deactivated", "deleted",
]


def ensure_rider_records(db, worker: DBDeliveryWorker) -> tuple[Optional[DBRider], Optional[DBRiderKyc]]:
    if (worker.worker_type or "").lower() not in ["rider", "messenger"]:
        return None, None
    rider = db.query(DBRider).filter(DBRider.delivery_worker_id == worker.id).first()
    if not rider:
        rider = DBRider(delivery_worker_id=worker.id, user_id=worker.user_id, full_name=worker.full_name or "", phone=worker.phone or "", email=worker.email or "")
        db.add(rider)
    kyc = db.query(DBRiderKyc).filter(DBRiderKyc.delivery_worker_id == worker.id).first()
    if not kyc:
        kyc = DBRiderKyc(delivery_worker_id=worker.id)
        db.add(kyc)
    db.flush()
    return rider, kyc


def rider_document_upsert(db, worker: DBDeliveryWorker, document_type: str, file_url: str, metadata: dict = None, checksum: str = "") -> None:
    if (worker.worker_type or "").lower() not in ["rider", "messenger"] or not file_url:
        return
    document = db.query(DBRiderDocument).filter(DBRiderDocument.delivery_worker_id == worker.id, DBRiderDocument.document_type == document_type).order_by(DBRiderDocument.id.desc()).first()
    if not document:
        document = DBRiderDocument(delivery_worker_id=worker.id, document_type=document_type)
        db.add(document)
    elif document.file_url and document.file_url != file_url:
        kyc = db.query(DBRiderKyc).filter(DBRiderKyc.delivery_worker_id == worker.id).first()
        if kyc:
            flags = json_load(kyc.fraud_flags_json, {})
            flags["edited_documents"] = True
            kyc.fraud_flags_json = json_dump(flags)
    document.file_url = file_url
    document.file_name = os.path.basename(str(file_url))
    document.content_type = (metadata or {}).get("content_type", "")
    document.checksum = checksum or document.checksum or ""
    document.status = "submitted"
    document.metadata_json = json_dump(metadata or {})
    document.updated_at = datetime.utcnow()


def rider_documents_map(db, worker: DBDeliveryWorker) -> dict:
    documents = {}
    for document in db.query(DBRiderDocument).filter(DBRiderDocument.delivery_worker_id == worker.id).order_by(DBRiderDocument.created_at.desc()).all():
        if document.document_type not in documents:
            documents[document.document_type] = {
                "url": document.file_url or "",
                "status": document.status or "",
                "uploaded_at": iso(document.updated_at or document.created_at),
                "content_type": document.content_type or "",
            }
    if worker.selfie_url and "selfie" not in documents:
        documents["selfie"] = {"url": worker.selfie_url, "status": "submitted", "uploaded_at": iso(worker.updated_at), "content_type": "image/*"}
    if worker.id_document_url and "driver_license" not in documents:
        documents["driver_license"] = {"url": worker.id_document_url, "status": "submitted", "uploaded_at": iso(worker.updated_at), "content_type": ""}
    return documents


def rider_identity_data(db, worker: DBDeliveryWorker, kyc: Optional[DBRiderKyc] = None) -> dict:
    response = json_load(kyc.nin_response_json if kyc else "{}", {}) if kyc else {}
    provider_data = normalize_nin_provider_data(extract_nin_identity_payload(response))
    if not any(provider_data.get(key) for key in ["full_name", "first_name", "surname", "phone", "birthdate", "gender"]):
        latest_log = db.query(DBVerificationLog).filter(
            DBVerificationLog.delivery_worker_id == worker.id,
            DBVerificationLog.verification_type == "nin",
            DBVerificationLog.success == True,
        ).order_by(DBVerificationLog.created_at.desc()).first()
        if latest_log:
            provider_data = normalize_nin_provider_data(
                extract_nin_identity_payload(json_load(latest_log.response_json, {}))
            )
    first_name = worker.verified_first_name or provider_data.get("first_name") or ""
    middle_name = worker.verified_middle_name or provider_data.get("middle_name") or ""
    surname = worker.verified_surname or provider_data.get("surname") or ""
    full_name = provider_data.get("full_name") or " ".join(part for part in [first_name, middle_name, surname] if part).strip() or worker.full_name or ""
    return {
        "full_name": full_name,
        "first_name": first_name,
        "middle_name": middle_name,
        "surname": surname,
        "last_name": surname,
        "gender": worker.verified_gender or provider_data.get("gender") or "",
        "phone": worker.verified_phone or provider_data.get("phone") or worker.phone or "",
        "date_of_birth": worker.verified_birthdate or provider_data.get("birthdate") or "",
        "birthdate": worker.verified_birthdate or provider_data.get("birthdate") or "",
        "address": (kyc.verified_address if kyc else "") or provider_data.get("address") or worker.home_address or "",
        "photo": worker.verified_photo_url or provider_data.get("photo") or "",
        "nin": (kyc.submitted_nin if kyc else "") or "",
        "nin_last4": worker.nin_last4 or (kyc.nin_last4 if kyc else "") or "",
        "report_id": worker.nin_report_id or (kyc.nin_provider_report_id if kyc else "") or "",
    }


def onboarding_progress_payload(db, worker: DBDeliveryWorker) -> dict:
    rider, kyc = ensure_rider_records(db, worker)
    sync_rider_onboarding_state(db, worker)
    documents = rider_documents_map(db, worker)
    meta = delivery_worker_review_meta(worker)
    profile_data = {
        "full_name": worker.full_name or "",
        "email": worker.email or "",
        "phone": worker.phone or "",
        "address": worker.home_address or "",
        "rider_type": (meta.get("identity_verification") or {}).get("rider_type") or ("walker" if (worker.worker_type or "") == "messenger" else "motorcycle"),
        "vehicle_type": worker.vehicle_type or "",
        "plate_number": worker.plate_number or "",
        "emergency_contact_name": worker.emergency_contact_name or "",
        "emergency_contact_phone": worker.emergency_contact_phone or "",
        "emergency_contact_relationship": (meta.get("emergency_contact") or {}).get("relationship") or "",
    }
    data = {
        "rider_id": worker.id,
        "email": worker.email or "",
        "phone": worker.phone or "",
        "current_step": kyc.current_step if kyc else worker_to_dict(worker).get("current_step", 1),
        "step_total": RIDER_ONBOARDING_TOTAL_STEPS,
        "progress_percent": rider_onboarding_progress_percent(kyc.current_step if kyc else 1),
        "nin_verified": bool(worker.nin_verified),
        "nin_report_id": worker.nin_report_id or "",
        "nin_data": rider_identity_data(db, worker, kyc),
        "profile_data": profile_data,
        "documents": documents,
        "training_completed": (kyc.onboarding_stage if kyc else "") in {"training_completed", "admin_review", "approved"},
        "application_submitted": (worker.kyc_status or "") in {"PENDING_REVIEW", "APPROVED", "ACTIVE", "REJECTED"} or (kyc.onboarding_stage if kyc else "") in {"admin_review", "approved", "rejected"},
        "approval_status": worker.kyc_status or "ONBOARDING",
        "onboarding_stage": kyc.onboarding_stage if kyc else "account_created",
        "last_updated": iso((kyc.updated_at if kyc else None) or worker.updated_at),
    }
    identity_log = data["nin_data"]
    print("ONBOARDING_PROGRESS_TRACE", json_dump({
        "rider_id": data["rider_id"],
        "status": data["approval_status"],
        "current_step": data["current_step"],
        "progress_percent": data["progress_percent"],
        "application_submitted": data["application_submitted"],
        "nin_verified": data["nin_verified"],
        "full_name": identity_log.get("full_name") or profile_data.get("full_name") or "",
        "dob": identity_log.get("date_of_birth") or identity_log.get("birthdate") or "",
        "phone": identity_log.get("phone") or data.get("phone") or "",
        "gender": identity_log.get("gender") or "",
        "nin_report_id": data["nin_report_id"],
        "documents": sorted(list(documents.keys())),
    }))
    return data


def log_rider_status_change(db, worker: DBDeliveryWorker, old_stage: str, new_stage: str, old_status: str, new_status: str, actor: dict = None, note: str = "", metadata: dict = None) -> None:
    if (worker.worker_type or "").lower() != "rider":
        return
    db.add(DBRiderStatusLog(
        delivery_worker_id=worker.id,
        old_stage=old_stage or "",
        new_stage=new_stage or "",
        old_status=old_status or "",
        new_status=new_status or "",
        actor_type="admin" if actor else "system",
        actor_id=(actor or {}).get("id"),
        actor_name=(actor or {}).get("full_name") or (actor or {}).get("email") or "FoodNova System",
        note=note or "",
        metadata_json=json_dump(metadata or {}),
    ))


def log_verification_event(db, worker: DBDeliveryWorker, verification_type: str, provider_result: dict = None, error: NINBVNPortalError = None, message: str = "", nin_last4: str = "", attempt_number: int = 0) -> None:
    provider_result = provider_result or {}
    endpoint_url = provider_result.get("endpoint_url") or f"{ninbvnportal_config().get('base_url')}/nin-verification"
    print("RIDER_VERIFICATION_ATTEMPT", json_dump({
        "request_timestamp": iso(datetime.utcnow()),
        "rider_id": worker.id if worker else None,
        "endpoint_url": endpoint_url,
        "provider_status_code": error.provider_status if error else provider_result.get("provider_http_status"),
        "timeout_error": bool(error and error.code == "provider_timeout"),
        "auth_error": bool(error and error.code == "invalid_provider_credentials"),
        "latency_ms": provider_result.get("duration_ms"),
        "verification_attempt_count": attempt_number or int(provider_result.get("attempt_number") or 0),
        "success": bool(provider_result.get("verified")) and error is None,
        "error_code": error.code if error else "",
        "provider_response_body": provider_result.get("raw_response") or error.provider_body if error else provider_result.get("raw_response"),
    }))
    db.add(DBVerificationLog(
        delivery_worker_id=worker.id,
        verification_type=verification_type,
        provider=provider_result.get("provider") or "ninbvnportal",
        request_id=provider_result.get("request_id") or "",
        status=provider_result.get("provider_status") or ("error" if error else ""),
        success=bool(provider_result.get("verified")) and error is None,
        http_status=error.provider_status if error else provider_result.get("provider_http_status"),
        error_code=error.code if error else "",
        message=message or provider_result.get("message") or (str(error) if error else ""),
        response_json=json_dump(provider_result or {"error_code": error.code if error else "", "message": str(error) if error else message}),
        nin_last4=nin_last4 or provider_result.get("nin_last4") or "",
        attempt_number=attempt_number or int(provider_result.get("attempt_number") or 0),
        latency_ms=provider_result.get("duration_ms") if provider_result else None,
    ))


def sync_rider_onboarding_state(db, worker: DBDeliveryWorker, actor: dict = None, note: str = "") -> str:
    rider, kyc = ensure_rider_records(db, worker)
    if not kyc:
        return ""
    meta = delivery_worker_review_meta(worker)
    identity = meta.get("identity_verification") or {}
    address = meta.get("address_verification") or {}
    emergency = meta.get("emergency_contact") or {}
    profile = meta.get("profile_data") or {}
    training = meta.get("training") or {}
    documents = meta.get("documents") or {}
    submitted_statuses = {"submitted", "pending_review", "manual_review", "verified", "approved", "completed", "not_required"}
    old_stage = kyc.onboarding_stage or "account_created"
    old_status = worker.kyc_status or "KYC_PENDING"
    if getattr(worker, "deleted_at", None):
        stage = "deleted"
        kyc.onboarding_stage = stage
        kyc.current_step = rider_onboarding_step_for_stage(stage)
        kyc.admin_review_status = "deleted"
        if rider:
            rider.status = "deleted"
            rider.onboarding_stage = stage
            rider.can_go_online = False
            rider.can_accept_orders = False
            rider.wallet_enabled = False
        return stage
    kyc.identity_status = identity.get("status") or kyc.identity_status or "not_started"
    kyc.address_status = address.get("status") or kyc.address_status or "not_started"
    kyc.emergency_status = emergency.get("status") or kyc.emergency_status or "not_started"
    documents_complete = bool(worker.selfie_url and worker.id_document_url and documents.get("proof_of_address_url"))
    kyc.selfie_status = "verified" if worker.selfie_url and kyc.identity_status in submitted_statuses else "not_started"
    kyc.nin_last4 = worker.nin_last4 or kyc.nin_last4 or ""
    kyc.nin_verified = bool(worker.nin_verified)
    kyc.nin_provider_report_id = worker.nin_report_id or kyc.nin_provider_report_id or ""
    kyc.nin_provider_message = identity.get("provider_message") or kyc.nin_provider_message or ""
    kyc.nin_hash = identity.get("nin_hash") or kyc.nin_hash or ""
    kyc.fraud_flags_json = json_dump(identity.get("fraud_flags") or json_load(kyc.fraud_flags_json, {}))
    kyc.duplicate_nin = bool((identity.get("fraud_flags") or {}).get("duplicate_nin") or kyc.duplicate_nin)
    kyc.submitted_at = kyc.submitted_at or (datetime.utcnow() if any((identity, address, emergency)) else None)
    if kyc.identity_status in submitted_statuses:
        kyc.identity_verified_at = kyc.identity_verified_at or datetime.utcnow()
    if kyc.address_status in submitted_statuses:
        kyc.address_uploaded_at = kyc.address_uploaded_at or datetime.utcnow()
    if kyc.emergency_status in submitted_statuses:
        kyc.emergency_contact_added_at = kyc.emergency_contact_added_at or datetime.utcnow()
    if kyc.selfie_status == "verified":
        kyc.selfie_verified_at = kyc.selfie_verified_at or datetime.utcnow()
    promote_verified_approved_rider(worker)
    lifecycle_status = rider_lifecycle_status(worker)
    if lifecycle_status == "ACTIVE":
        stage = "approved"
    elif (worker.kyc_status or "") == "REJECTED":
        stage = "rejected"
    elif lifecycle_status == "SUSPENDED":
        stage = "suspended"
    elif lifecycle_status == "INACTIVE":
        stage = "deactivated"
    elif (worker.kyc_status or "") == "DELETED":
        stage = "deleted"
    elif (worker.kyc_status or "") == "PENDING_REVIEW":
        stage = "admin_review"
    elif training.get("completed") is True:
        stage = "training_completed"
    elif documents_complete:
        stage = "documents_uploaded"
    elif profile.get("completed") is True:
        stage = "rider_profile_completed"
    elif kyc.emergency_status in submitted_statuses:
        stage = "emergency_contact_added"
    elif kyc.address_status in submitted_statuses:
        stage = "address_uploaded"
    elif kyc.identity_status in submitted_statuses:
        stage = "identity_submitted"
    else:
        stage = "account_created"
    kyc.onboarding_stage = stage
    kyc.current_step = rider_onboarding_step_for_stage(stage)
    kyc.admin_review_status = "approved" if stage == "approved" else "rejected" if stage == "rejected" else "suspended" if stage == "suspended" else "deactivated" if stage == "deactivated" else "deleted" if stage == "deleted" else "pending"
    kyc.updated_at = datetime.utcnow()
    if rider:
        rider.full_name = worker.full_name or rider.full_name
        rider.phone = worker.phone or rider.phone
        rider.email = worker.email or rider.email
        rider.status = "active" if stage == "approved" else "suspended" if stage in {"rejected", "suspended"} else "inactive" if stage == "deactivated" else "deleted" if stage == "deleted" else "onboarding"
        rider.onboarding_stage = stage
        rider.can_go_online = stage == "approved"
        rider.can_accept_orders = stage == "approved"
        rider.wallet_enabled = stage == "approved"
        rider.updated_at = datetime.utcnow()
    if old_stage != stage or old_status != (worker.kyc_status or ""):
        log_rider_status_change(db, worker, old_stage, stage, old_status, worker.kyc_status or "KYC_PENDING", actor, note)
    return stage


def rider_approval_blockers(db, worker: DBDeliveryWorker) -> List[str]:
    sync_rider_onboarding_state(db, worker)
    kyc = db.query(DBRiderKyc).filter(DBRiderKyc.delivery_worker_id == worker.id).first()
    blockers = []
    if not kyc or not kyc.nin_verified or kyc.identity_status not in {"verified", "approved"}:
        blockers.append("NIN must be verified by the provider before approval.")
    if kyc and kyc.duplicate_nin:
        blockers.append("Duplicate NIN usage must be cleared before approval.")
    if kyc and kyc.duplicate_selfie:
        blockers.append("Duplicate selfie flag must be cleared before approval.")
    if kyc and json_load(kyc.fraud_flags_json, {}).get("edited_documents"):
        blockers.append("Edited document flag must be reviewed before approval.")
    if not worker.selfie_url:
        blockers.append("Selfie submission is required.")
    if not worker.home_address:
        blockers.append("Residential address is required.")
    if not worker.id_document_url:
        blockers.append("Driver license upload is required.")
    rider_meta = (delivery_worker_review_meta(worker).get("identity_verification") or {})
    rider_type = (rider_meta.get("rider_type") or "").lower()
    if rider_type in ["motorcycle", "motorcycle_rider", "motorbike", "vehicle"]:
        if not worker.vehicle_type or not worker.plate_number:
            blockers.append("Vehicle type and plate number are required.")
    return blockers


def rider_detail_payload(db, worker: DBDeliveryWorker) -> dict:
    sync_rider_onboarding_state(db, worker)
    rider = db.query(DBRider).filter(DBRider.delivery_worker_id == worker.id).first()
    kyc = db.query(DBRiderKyc).filter(DBRiderKyc.delivery_worker_id == worker.id).first()
    documents = db.query(DBRiderDocument).filter(DBRiderDocument.delivery_worker_id == worker.id).order_by(DBRiderDocument.created_at.desc()).all()
    logs = db.query(DBRiderStatusLog).filter(DBRiderStatusLog.delivery_worker_id == worker.id).order_by(DBRiderStatusLog.created_at.desc()).limit(50).all()
    verification_logs = db.query(DBVerificationLog).filter(DBVerificationLog.delivery_worker_id == worker.id).order_by(DBVerificationLog.created_at.desc()).limit(30).all()
    sessions = db.query(DBRiderSession).filter(DBRiderSession.delivery_worker_id == worker.id).order_by(DBRiderSession.created_at.desc()).limit(20).all()
    reviews = db.query(DBAdminReview).filter(DBAdminReview.delivery_worker_id == worker.id).order_by(DBAdminReview.created_at.desc()).limit(30).all()
    return {
        "worker": worker_to_dict(worker),
        "rider": {
            "id": rider.id if rider else None,
            "status": rider.status if rider else "pending",
            "onboarding_stage": rider.onboarding_stage if rider else "account_created",
            "wallet_enabled": bool(rider.wallet_enabled) if rider else False,
            "can_go_online": bool(rider.can_go_online) if rider else False,
            "can_accept_orders": bool(rider.can_accept_orders) if rider else False,
        },
        "kyc": {
            "current_step": kyc.current_step if kyc else 1,
            "step_total": RIDER_ONBOARDING_TOTAL_STEPS,
            "progress_percent": rider_onboarding_progress_percent(kyc.current_step if kyc else 1),
            "onboarding_stage": kyc.onboarding_stage if kyc else "account_created",
            "identity_status": kyc.identity_status if kyc else "not_started",
            "address_status": kyc.address_status if kyc else "not_started",
            "emergency_status": kyc.emergency_status if kyc else "not_started",
            "selfie_status": kyc.selfie_status if kyc else "not_started",
            "admin_review_status": kyc.admin_review_status if kyc else "pending",
            "submitted_nin": kyc.submitted_nin if kyc else "",
            "nin_last4": kyc.nin_last4 if kyc else "",
            "nin_verified": bool(kyc.nin_verified) if kyc else False,
            "verification_status": kyc.nin_provider_status if kyc else "",
            "provider_report_id": kyc.nin_provider_report_id if kyc else "",
            "provider_message": kyc.nin_provider_message if kyc else "",
            "verified_full_name": kyc.verified_full_name if kyc else "",
            "verified_dob": kyc.verified_dob if kyc else "",
            "verified_phone": kyc.verified_phone if kyc else "",
            "verified_gender": kyc.verified_gender if kyc else "",
            "verified_address": kyc.verified_address if kyc else "",
            "consent_accepted": bool(kyc.consent_accepted) if kyc else False,
            "consent_timestamp": iso(kyc.consent_timestamp) if kyc else "",
            "consent_device": json_load(kyc.consent_device_json, {}) if kyc else {},
            "consent_ip_address": kyc.consent_ip_address if kyc else "",
            "verification_attempt_count": kyc.verification_attempt_count if kyc else 0,
            "failed_verification_attempts": int((json_load(kyc.fraud_flags_json, {}) if kyc else {}).get("failed_kyc_attempts") or 0),
            "confidence_score": kyc.confidence_score if kyc else 0,
            "fraud_flags": json_load(kyc.fraud_flags_json, {}) if kyc else {},
            "provider_response": json_load(kyc.nin_response_json, {}) if kyc else {},
            "rejection_reason": kyc.rejection_reason if kyc else "",
            "timestamps": {
                "submitted_at": iso(kyc.submitted_at) if kyc else "",
                "last_verification_at": iso(kyc.last_verification_at) if kyc else "",
                "identity_verified_at": iso(kyc.identity_verified_at) if kyc else "",
                "address_uploaded_at": iso(kyc.address_uploaded_at) if kyc else "",
                "emergency_contact_added_at": iso(kyc.emergency_contact_added_at) if kyc else "",
                "selfie_verified_at": iso(kyc.selfie_verified_at) if kyc else "",
                "admin_reviewed_at": iso(kyc.admin_reviewed_at) if kyc else "",
            },
        },
        "documents": [{"id": doc.id, "type": doc.document_type, "url": doc.file_url or "", "file_name": doc.file_name or "", "status": doc.status or "submitted", "metadata": json_load(doc.metadata_json, {}), "created_at": iso(doc.created_at)} for doc in documents],
        "status_logs": [{"id": log.id, "old_stage": log.old_stage or "", "new_stage": log.new_stage or "", "old_status": log.old_status or "", "new_status": log.new_status or "", "actor_type": log.actor_type or "", "actor_name": log.actor_name or "", "note": log.note or "", "created_at": iso(log.created_at)} for log in logs],
        "verification_logs": [{"id": log.id, "type": log.verification_type or "", "provider": log.provider or "", "status": log.status or "", "success": bool(log.success), "error_code": log.error_code or "", "message": log.message or "", "nin_last4": log.nin_last4 or "", "attempt_number": log.attempt_number or 0, "latency_ms": log.latency_ms, "response": json_load(log.response_json, {}), "created_at": iso(log.created_at)} for log in verification_logs],
        "login_history": [{"id": session.id, "active": bool(session.is_active), "ip_address": session.ip_address or "", "device": json_load(session.device_info_json, {}), "created_at": iso(session.created_at), "last_seen_at": iso(session.last_seen_at), "revoked_at": iso(session.revoked_at), "revoked_reason": session.revoked_reason or ""} for session in sessions],
        "admin_reviews": [{"id": review.id, "admin_name": review.admin_name or "", "action": review.action or "", "reason": review.reason or "", "required_changes": json_load(review.required_changes_json, []), "created_at": iso(review.created_at)} for review in reviews],
        "approval_blockers": rider_approval_blockers(db, worker),
    }


def _nin_hash(nin: str) -> str:
    return hashlib.sha256(str(nin or "").encode("utf-8")).hexdigest()


def _identity_key(value: str) -> str:
    return "".join(ch.lower() for ch in str(value or "") if ch.isalnum())


def _identity_value(source: dict, aliases: list[str]) -> str:
    if not isinstance(source, dict):
        return ""
    direct = {_identity_key(key): value for key, value in source.items()}
    for alias in aliases:
        value = direct.get(_identity_key(alias))
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def normalize_nin_provider_data(data: dict) -> dict:
    source = data or {}
    first_name = _identity_value(source, ["first_name", "firstname", "firstName", "given_name", "givenName"])
    middle_name = _identity_value(source, ["middle_name", "middlename", "middleName", "other_name", "otherName"])
    surname = _identity_value(source, ["surname", "last_name", "lastname", "lastName", "family_name", "familyName"])
    full_name = _identity_value(source, ["full_name", "fullname", "fullName", "name", "display_name", "displayName"])
    if not full_name:
        full_name = " ".join(part for part in [first_name, middle_name, surname] if part).strip()
    gender = _identity_value(source, ["gender", "sex"])
    if gender.upper() == "M":
        gender = "Male"
    elif gender.upper() == "F":
        gender = "Female"
    birthdate = _identity_value(source, ["birthdate", "birth_date", "date_of_birth", "dateOfBirth", "dob"])
    phone = _identity_value(source, ["phone", "phone_number", "phoneNumber", "telephoneno", "telephone_no", "telephoneNo", "mobile", "mobile_number"])
    address = _identity_value(source, ["address", "residence_address", "residential_address", "residenceAddress", "home_address"])
    return {
        "first_name": first_name,
        "middle_name": middle_name,
        "surname": surname,
        "full_name": full_name,
        "gender": gender,
        "birthdate": birthdate,
        "phone": phone,
        "address": address,
        "residence_state": _identity_value(source, ["residence_state", "state"]),
        "residence_town": _identity_value(source, ["residence_town", "town", "city"]),
        "residence_lga": _identity_value(source, ["residence_lga", "lga", "local_government"]),
        "photo": _identity_value(source, ["photo", "photograph", "image", "portrait"]),
        "nin": _identity_value(source, ["nin", "nin_number", "ninNumber", "number"]),
    }


def extract_nin_identity_payload(provider_result) -> dict:
    candidates = []

    def collect(value):
        if isinstance(value, dict):
            candidates.append(value)
            for nested in value.values():
                collect(nested)
        elif isinstance(value, list):
            for item in value:
                collect(item)
        elif isinstance(value, str) and value.strip().startswith(("{", "[")):
            try:
                collect(json.loads(value))
            except Exception:
                pass

    collect(provider_result or {})
    identity_keys = {"firstname", "givenname", "surname", "lastname", "middlename", "fullname", "birthdate", "dateofbirth", "dob", "telephoneno", "telephone", "phonenumber", "mobile", "gender", "sex", "address"}
    for candidate in candidates:
        compact_keys = {_identity_key(key) for key in candidate.keys()}
        if compact_keys.intersection(identity_keys):
            return candidate
    return candidates[0] if candidates else {}


def nin_identity_response_data(normalized_data: dict) -> dict:
    return {
        "firstname": normalized_data.get("first_name") or "",
        "middlename": normalized_data.get("middle_name") or "",
        "surname": normalized_data.get("surname") or "",
        "first_name": normalized_data.get("first_name") or "",
        "last_name": normalized_data.get("surname") or "",
        "middle_name": normalized_data.get("middle_name") or "",
        "full_name": normalized_data.get("full_name") or "",
        "date_of_birth": normalized_data.get("birthdate") or "",
        "birthdate": normalized_data.get("birthdate") or "",
        "gender": normalized_data.get("gender") or "",
        "phone": normalized_data.get("phone") or "",
        "phone_number": normalized_data.get("phone") or "",
        "telephoneno": normalized_data.get("phone") or "",
        "address": normalized_data.get("address") or "",
        "state": normalized_data.get("residence_state") or "",
        "residence_state": normalized_data.get("residence_state") or "",
        "residence_town": normalized_data.get("residence_town") or "",
        "residence_lga": normalized_data.get("residence_lga") or "",
        "photo": normalized_data.get("photo") or "",
    }


def create_nin_verification_token(nin: str, result: dict) -> str:
    normalized_data = normalize_nin_provider_data(extract_nin_identity_payload(result))
    payload = {
        "type": "nin_verification",
        "nin_hash": _nin_hash("".join(ch for ch in str(nin or "") if ch.isdigit())),
        "report_id": result.get("report_id") or "",
        "data": normalized_data,
        "verified": bool(result.get("verified")),
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(hours=2),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_nin_verification_token(token: str, nin: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=400, detail="NIN verification session expired. Please verify NIN again.")
    if payload.get("type") != "nin_verification" or not payload.get("verified"):
        raise HTTPException(status_code=400, detail="NIN verification is invalid. Please verify NIN again.")
    expected_hash = _nin_hash("".join(ch for ch in str(nin or "") if ch.isdigit()))
    if payload.get("nin_hash") != expected_hash:
        raise HTTPException(status_code=400, detail="Verified NIN does not match submitted NIN.")
    return payload


def _name_tokens(value: str) -> set:
    return {
        token
        for token in "".join(ch.lower() if ch.isalpha() else " " for ch in str(value or "")).split()
        if len(token) > 1
    }


def detect_nin_fraud_flags(db, worker: DBDeliveryWorker, clean_nin: str, provider_data: dict, verified: bool) -> dict:
    provider_name = " ".join([
        provider_data.get("first_name") or "",
        provider_data.get("middle_name") or "",
        provider_data.get("surname") or "",
    ]).strip()
    worker_tokens = _name_tokens(worker.full_name)
    provider_tokens = _name_tokens(provider_name)
    name_overlap = len(worker_tokens.intersection(provider_tokens)) if worker_tokens and provider_tokens else 0
    identity_mismatch = bool(verified and provider_tokens and worker_tokens and name_overlap == 0)

    current_hash = _nin_hash(clean_nin)
    duplicate_nin = False
    for other in db.query(DBDeliveryWorker).filter(DBDeliveryWorker.id != worker.id).all():
        meta = delivery_worker_review_meta(other)
        other_identity = meta.get("identity_verification") or {}
        if other_identity.get("nin_hash") == current_hash:
            duplicate_nin = True
            break
    if not duplicate_nin:
        duplicate_nin = db.query(DBRiderKyc).filter(
            DBRiderKyc.delivery_worker_id != worker.id,
            DBRiderKyc.nin_hash == current_hash,
        ).first() is not None

    fraud_risk_detected = duplicate_nin or identity_mismatch
    confidence = 0.98 if verified and not fraud_risk_detected else 0.6 if verified else 0.15
    return {
        "duplicate_nin": duplicate_nin,
        "identity_mismatch": identity_mismatch,
        "suspicious_activity": False,
        "failed_verification": not verified,
        "fake_nin": not verified,
        "fraud_risk_detected": fraud_risk_detected,
        "confidence_score": confidence,
        "provider_name": provider_name,
    }


def maybe_auto_activate_delivery_worker(worker: DBDeliveryWorker) -> bool:
    meta = delivery_worker_review_meta(worker)
    identity = meta.get("identity_verification") or {}
    address = meta.get("address_verification") or {}
    emergency = meta.get("emergency_contact") or {}
    submitted_statuses = {"submitted", "pending_review", "verified", "approved", "completed"}
    clean_identity = identity.get("status") == "verified" and not identity.get("manual_review_required")
    ready = (
        clean_identity
        and (address.get("status") or "") in submitted_statuses
        and (emergency.get("status") or "") in submitted_statuses
    )
    if ready and (worker.worker_type or "").lower() == "messenger":
        worker.kyc_status = "ACTIVE"
        worker.approved_at = worker.approved_at or datetime.utcnow()
        worker.approved_by_admin_id = None
        worker.approved_by_admin_name = "FoodNova Auto Verification"
        identity["status"] = "verified"
        address["status"] = "verified"
        emergency["status"] = "verified"
        meta["identity_verification"] = identity
        meta["address_verification"] = address
        meta["emergency_contact"] = emergency
        worker.review_note = json_dump(meta)
        return True
    return False


def verification_status_response(worker: DBDeliveryWorker) -> dict:
    meta = delivery_worker_review_meta(worker)
    identity = meta.get("identity_verification") or {}
    address = meta.get("address_verification") or {}
    emergency = meta.get("emergency_contact") or {}
    worker_approved = (worker.kyc_status or "") in {"ACTIVE"}
    submitted_statuses = {"submitted", "pending_review", "verified", "approved", "completed"}
    identity_status = "approved" if worker_approved else identity.get("status") or "not_started"
    address_status = "verified" if worker_approved else address.get("status") or "not_started"
    emergency_status = "verified" if worker_approved else emergency.get("status") or "not_started"
    review_ready = (
        identity_status in submitted_statuses
        and address_status in submitted_statuses
        and emergency_status in submitted_statuses
    )
    return {
        "success": True,
        "identity_status": identity_status,
        "address_status": address_status,
        "emergency_contact_status": emergency_status,
        "admin_approval_status": "approved" if worker_approved else "pending_review" if review_ready else "not_started",
        "can_activate_deliveries": worker_approved,
        "data": {
            "worker_id": worker.id,
            "worker_type": worker.worker_type or "",
            "kyc_status": worker.kyc_status or "KYC_PENDING",
            "onboarding_stage": "approved" if worker_approved else "rejected" if (worker.kyc_status or "") == "REJECTED" else "suspended" if (worker.kyc_status or "") == "SUSPENDED" else "admin_review" if review_ready else "identity_submitted" if identity_status in submitted_statuses else "account_created",
            "rejection_reason": (meta.get("admin_override") or {}).get("note") or meta.get("rejection_reason") or "",
            "identity_verification": identity,
            "address_verification": address,
            "emergency_contact": emergency,
        },
    }


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
        "admin_audit_logs": {
            "admin_id": "INTEGER",
            "admin_name": "VARCHAR(150) DEFAULT ''",
            "admin_email": "VARCHAR(150) DEFAULT ''",
            "action": "VARCHAR(120)",
            "entity_type": "VARCHAR(80) DEFAULT ''",
            "entity_id": "VARCHAR(80) DEFAULT ''",
            "description": "TEXT DEFAULT ''",
            "metadata_json": "TEXT",
            "ip_address": "VARCHAR(80)",
            "user_agent": "TEXT",
            "device_type": "VARCHAR(80)",
            "browser": "VARCHAR(120)",
            "operating_system": "VARCHAR(120)",
            "location_country": "VARCHAR(120)",
            "location_region": "VARCHAR(120)",
            "location_city": "VARCHAR(120)",
            "created_at": "TIMESTAMP",
        },
        "products": {
            "stock_qty": "INTEGER DEFAULT 0",
            "stock": "INTEGER DEFAULT 0",
            "category_name": "VARCHAR(100) DEFAULT ''",
            "image_url": "TEXT DEFAULT ''",
            "description": "TEXT DEFAULT ''",
            "contents": "TEXT DEFAULT '[]'",
            "pack_info": "TEXT DEFAULT ''",
            "serving_estimate": "TEXT DEFAULT ''",
            "freshness_note": "TEXT DEFAULT ''",
            "delivery_note": "TEXT DEFAULT ''",
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
            "delivery_type": "VARCHAR(40) DEFAULT 'needs_admin_review'",
            "estimated_distance_meters": "FLOAT",
            "delivery_worker_id": "INTEGER",
            "delivery_worker_type": "VARCHAR(30) DEFAULT ''",
            "delivery_status": "VARCHAR(40) DEFAULT ''",
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
            "variant_id": "INTEGER",
            "variant_weight": "VARCHAR(40) DEFAULT ''",
            "sku": "VARCHAR(120) DEFAULT ''",
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
        "delivery_workers": {
            "user_id": "INTEGER",
            "worker_type": "VARCHAR(30) DEFAULT 'messenger'",
            "full_name": "VARCHAR(150) DEFAULT ''",
            "phone": "VARCHAR(50) DEFAULT ''",
            "email": "VARCHAR(150) DEFAULT ''",
            "home_address": "TEXT DEFAULT ''",
            "emergency_contact_name": "VARCHAR(150) DEFAULT ''",
            "emergency_contact_phone": "VARCHAR(50) DEFAULT ''",
            "id_type": "VARCHAR(80) DEFAULT ''",
            "id_number": "VARCHAR(120) DEFAULT ''",
            "nin_verified": "BOOLEAN DEFAULT FALSE",
            "nin_report_id": "VARCHAR(120) DEFAULT ''",
            "nin_last4": "VARCHAR(4) DEFAULT ''",
            "verified_first_name": "VARCHAR(120) DEFAULT ''",
            "verified_middle_name": "VARCHAR(120) DEFAULT ''",
            "verified_surname": "VARCHAR(120) DEFAULT ''",
            "verified_phone": "VARCHAR(50) DEFAULT ''",
            "verified_gender": "VARCHAR(30) DEFAULT ''",
            "verified_birthdate": "VARCHAR(40) DEFAULT ''",
            "verified_photo_url": "TEXT DEFAULT ''",
            "selfie_url": "TEXT DEFAULT ''",
            "profile_photo_url": "TEXT DEFAULT ''",
            "id_document_url": "TEXT DEFAULT ''",
            "vehicle_type": "VARCHAR(80) DEFAULT ''",
            "partner_company": "VARCHAR(150) DEFAULT ''",
            "plate_number": "VARCHAR(80) DEFAULT ''",
            "driver_license_number": "VARCHAR(120) DEFAULT ''",
            "vehicle_photo_url": "TEXT DEFAULT ''",
            "kyc_status": "VARCHAR(30) DEFAULT 'KYC_PENDING'",
            "operational_status": "VARCHAR(30) DEFAULT 'OFFLINE'",
            "review_note": "TEXT DEFAULT ''",
            "trust_score": "FLOAT DEFAULT 100",
            "completed_deliveries": "INTEGER DEFAULT 0",
            "failed_deliveries": "INTEGER DEFAULT 0",
            "late_deliveries": "INTEGER DEFAULT 0",
            "customer_complaints": "INTEGER DEFAULT 0",
            "suspicious_gps_gaps": "INTEGER DEFAULT 0",
            "latest_latitude": "FLOAT",
            "latest_longitude": "FLOAT",
            "latest_accuracy": "FLOAT",
            "latest_heading": "FLOAT",
            "latest_speed": "FLOAT",
            "last_seen_at": "TIMESTAMP",
            "inside_zone": "BOOLEAN DEFAULT FALSE",
            "fcm_token": "TEXT DEFAULT ''",
            "fcm_tokens_json": "TEXT DEFAULT '[]'",
            "approved_at": "TIMESTAMP",
            "approved_by_admin_id": "INTEGER",
            "approved_by_admin_name": "VARCHAR(150) DEFAULT ''",
            "suspended_at": "TIMESTAMP",
            "deactivated_at": "TIMESTAMP",
            "force_logout_at": "TIMESTAMP",
            "deleted_at": "TIMESTAMP",
            "deleted_by_admin_id": "INTEGER",
            "deleted_reason": "TEXT DEFAULT ''",
            "created_at": "TIMESTAMP",
            "updated_at": "TIMESTAMP",
        },
        "delivery_riders": {
            "full_name": "VARCHAR(150) DEFAULT ''",
            "phone": "VARCHAR(50) DEFAULT ''",
            "email": "VARCHAR(150) DEFAULT ''",
            "vehicle_type": "VARCHAR(80) DEFAULT ''",
            "vehicle_number": "VARCHAR(80) DEFAULT ''",
            "status": "VARCHAR(30) DEFAULT 'active'",
            "notes": "TEXT DEFAULT ''",
            "deleted_at": "TIMESTAMP",
            "deleted_by_admin_id": "INTEGER",
            "deleted_reason": "TEXT DEFAULT ''",
            "created_at": "TIMESTAMP",
            "updated_at": "TIMESTAMP",
        },
        "rider_kyc": {
            "delivery_worker_id": "INTEGER",
            "current_step": "INTEGER DEFAULT 1",
            "onboarding_stage": "VARCHAR(50) DEFAULT 'account_created'",
            "identity_status": "VARCHAR(30) DEFAULT 'not_started'",
            "address_status": "VARCHAR(30) DEFAULT 'not_started'",
            "emergency_status": "VARCHAR(30) DEFAULT 'not_started'",
            "selfie_status": "VARCHAR(30) DEFAULT 'not_started'",
            "admin_review_status": "VARCHAR(30) DEFAULT 'pending'",
            "nin_hash": "VARCHAR(80) DEFAULT ''",
            "submitted_nin": "VARCHAR(20) DEFAULT ''",
            "nin_last4": "VARCHAR(4) DEFAULT ''",
            "nin_verified": "BOOLEAN DEFAULT FALSE",
            "nin_provider": "VARCHAR(80) DEFAULT 'ninbvnportal'",
            "nin_provider_report_id": "VARCHAR(120) DEFAULT ''",
            "nin_provider_status": "VARCHAR(80) DEFAULT ''",
            "nin_provider_message": "TEXT DEFAULT ''",
            "nin_response_json": "TEXT DEFAULT '{}'",
            "verified_full_name": "VARCHAR(255) DEFAULT ''",
            "verified_dob": "VARCHAR(40) DEFAULT ''",
            "verified_phone": "VARCHAR(50) DEFAULT ''",
            "verified_gender": "VARCHAR(30) DEFAULT ''",
            "verified_address": "TEXT DEFAULT ''",
            "consent_accepted": "BOOLEAN DEFAULT FALSE",
            "consent_timestamp": "TIMESTAMP",
            "consent_device_json": "TEXT DEFAULT '{}'",
            "consent_ip_address": "VARCHAR(80) DEFAULT ''",
            "verification_attempt_count": "INTEGER DEFAULT 0",
            "last_verification_at": "TIMESTAMP",
            "confidence_score": "FLOAT DEFAULT 0",
            "fraud_flags_json": "TEXT DEFAULT '{}'",
            "duplicate_nin": "BOOLEAN DEFAULT FALSE",
            "duplicate_selfie": "BOOLEAN DEFAULT FALSE",
            "rejection_reason": "TEXT DEFAULT ''",
            "resubmission_requested": "BOOLEAN DEFAULT FALSE",
            "submitted_at": "TIMESTAMP",
            "identity_verified_at": "TIMESTAMP",
            "address_uploaded_at": "TIMESTAMP",
            "emergency_contact_added_at": "TIMESTAMP",
            "selfie_verified_at": "TIMESTAMP",
            "admin_reviewed_at": "TIMESTAMP",
            "created_at": "TIMESTAMP",
            "updated_at": "TIMESTAMP",
        },
        "verification_logs": {
            "delivery_worker_id": "INTEGER",
            "verification_type": "VARCHAR(60) DEFAULT 'nin'",
            "provider": "VARCHAR(80) DEFAULT 'ninbvnportal'",
            "request_id": "VARCHAR(120) DEFAULT ''",
            "status": "VARCHAR(50) DEFAULT ''",
            "success": "BOOLEAN DEFAULT FALSE",
            "http_status": "INTEGER",
            "error_code": "VARCHAR(80) DEFAULT ''",
            "message": "TEXT DEFAULT ''",
            "response_json": "TEXT DEFAULT '{}'",
            "nin_last4": "VARCHAR(4) DEFAULT ''",
            "attempt_number": "INTEGER DEFAULT 0",
            "latency_ms": "INTEGER",
            "created_at": "TIMESTAMP",
        },
        "operational_zones": {
            "zone_name": "VARCHAR(150) DEFAULT 'FoodNova Local Zone'",
            "center_latitude": "FLOAT DEFAULT 6.5244",
            "center_longitude": "FLOAT DEFAULT 3.3792",
            "radius_meters": "INTEGER DEFAULT 5000",
            "is_active": "BOOLEAN DEFAULT TRUE",
            "created_at": "TIMESTAMP",
            "updated_at": "TIMESTAMP",
        },
        "delivery_offers": {
            "order_id": "INTEGER",
            "order_code": "VARCHAR(30) DEFAULT ''",
            "worker_id": "INTEGER",
            "worker_type": "VARCHAR(30) DEFAULT ''",
            "status": "VARCHAR(30) DEFAULT 'PENDING'",
            "delivery_type": "VARCHAR(40) DEFAULT 'needs_admin_review'",
            "estimated_distance_meters": "FLOAT",
            "pickup_area": "VARCHAR(180) DEFAULT ''",
            "delivery_area": "VARCHAR(180) DEFAULT ''",
            "accepted_at": "TIMESTAMP",
            "declined_at": "TIMESTAMP",
            "expires_at": "TIMESTAMP",
            "created_at": "TIMESTAMP",
            "updated_at": "TIMESTAMP",
        },
        "app_settings": {
            "key": "VARCHAR(120)",
            "value": "TEXT DEFAULT ''",
            "updated_at": "TIMESTAMP",
            "created_at": "TIMESTAMP",
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

        demo_email = "demo@foodnova.app"
        demo_user = get_db_user_by_email(db, demo_email)
        if not demo_user:
            demo_user = DBUser(
                full_name="FoodNova Demo Customer",
                email=demo_email,
                phone="+2348000000000",
                password=_hash_new_password("Password123"),
                role="customer",
                is_active=True,
            )
            db.add(demo_user)
            db.flush()
            ensure_profile(db, demo_user)

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
        sync_report = sync_foodnova_catalog(db)
        ensure_default_operational_zone(db)
        db.commit()
        print("FOODNOVA_CATALOG_SYNC", json_dump(sync_report))
        db.close()
    except Exception as error:
        print("DATABASE SEED ERROR:", repr(error))


@app.on_event("startup")
def on_startup():
    seed_database()
    global NIN_PROVIDER_HEALTH
    nin_config = ninbvnportal_config()
    nin_endpoint = f"{nin_config.get('base_url')}/nin-verification"
    print("NIN_PROVIDER_BASE_URL", nin_config.get("base_url"))
    print("NIN_BASE_URL", nin_config.get("base_url"))
    print("NIN_ENDPOINT", nin_endpoint)
    print("AUTH_MODE", current_nin_auth_mode())
    print("HEADER_NAME_USED", "x-api-key")
    print("NINBVNPORTAL_API_KEY present:", bool(os.getenv("NINBVNPORTAL_API_KEY", "").strip()))
    print("NINBVNPORTAL_API_KEY length:", len(nin_config.get("api_key") or ""))
    print("NINBVNPORTAL_BASE_URL", os.getenv("NINBVNPORTAL_BASE_URL", "").strip() or nin_config.get("base_url"))
    validation = validate_ninbvnportal_config()
    print("NINBVNPORTAL_API_KEY detected:", bool(os.getenv("NINBVNPORTAL_API_KEY", "").strip()))
    if not validation.get("configured"):
        print("NINBVNPORTAL_CONFIGURATION_ERROR", validation.get("message"))
        NIN_PROVIDER_HEALTH = {
            "healthy": False,
            "onboarding_verification_enabled": False,
            "message": validation.get("message") or "NIN API key missing from server configuration",
            "provider_status": None,
            "provider_message": validation.get("message"),
            "checked_at": iso(datetime.utcnow()),
        }
        print("NINBVNPORTAL_STARTUP_FAILURE", json_dump({
            "api_key_loaded": bool(os.getenv("NINBVNPORTAL_API_KEY", "").strip()),
            "api_key_length": len(nin_config.get("api_key") or ""),
            "base_url": nin_config.get("base_url"),
            "provider_url": nin_endpoint,
            "auth_mode": current_nin_auth_mode(),
            "header_name_used": "x-api-key",
            "message": validation.get("message"),
            "timestamp": iso(datetime.utcnow()),
        }))
        print("NIN_PROVIDER_STATUS", "configuration_error")
        print("NIN_PROVIDER_BALANCE_CHECK", "skipped_missing_configuration")
        _create_admin_notifications(
            "Verification provider unhealthy",
            "FoodNova NIN verification is disabled until NINBVNPORTAL_API_KEY is configured and the backend is redeployed.",
            "verification_health",
            "operations",
        )
        return
    health = check_provider_connectivity()
    healthy = bool(health.get("apiKeyLoaded") and health.get("endpointReachable"))
    provider_auth_failed = health.get("providerAuthStatus") == "failed" or health.get("lastProviderStatus") in (401, 403)
    health_message = "Provider authentication failed. Check API credentials." if provider_auth_failed else ("Provider healthy." if healthy else "Identity verification currently unavailable.")
    NIN_PROVIDER_HEALTH = {
        "healthy": healthy,
        "onboarding_verification_enabled": healthy,
        "message": health_message,
        "provider_auth_status": health.get("providerAuthStatus"),
        "provider_status": health.get("lastProviderStatus"),
        "provider_message": health.get("lastProviderMessage"),
        "latency_ms": health.get("latencyMs"),
        "checked_at": iso(datetime.utcnow()),
    }
    print("NINBVNPORTAL_STARTUP_HEALTH", json_dump({
        "api_key_loaded": health.get("apiKeyLoaded"),
        "endpoint_reachable": health.get("endpointReachable"),
        "last_provider_status": health.get("lastProviderStatus"),
        "last_provider_message": health.get("lastProviderMessage"),
        "provider_url": health.get("providerUrl"),
        "latency_ms": health.get("latencyMs"),
        "timestamp": iso(datetime.utcnow()),
    }))
    print("NIN_PROVIDER_STATUS", "authenticated" if healthy else health.get("providerAuthStatus") or "unavailable")
    print("NIN_PROVIDER_BALANCE_CHECK", json_dump({
        "success": healthy,
        "status": health.get("lastProviderStatus"),
        "message": health.get("lastProviderMessage"),
        "balance_url": health.get("balanceUrl"),
    }))
    if not healthy:
        _create_admin_notifications(
            "Verification provider authentication failed" if provider_auth_failed else "Verification provider unhealthy",
            "Provider authentication failed. Check API credentials." if provider_auth_failed else "FoodNova rider onboarding verification is disabled. Check Operations > Verification Health and redeploy after environment updates.",
            "verification_health",
            "operations",
        )


@app.get("/")
def root():
    return {"message": "FoodNova API is running", "status": "ok"}


@app.head("/")
def root_head():
    return None


@app.get("/health")
def health():
    return {"success": True, "status": "ok"}


@app.get("/admin/debug")
def admin_debug():
    db_connected = False
    db_error = ""
    try:
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
            db_connected = True
        finally:
            db.close()
    except Exception as error:
        db_error = f"{type(error).__name__}: {error}"

    nin_config = ninbvnportal_config()
    return {
        "status": "ok",
        "environment_loaded": True,
        "admin_email_loaded": bool(ADMIN_EMAIL),
        "database_connected": db_connected,
        "database_error": db_error,
        "nin_provider_connected": bool(NIN_PROVIDER_HEALTH.get("healthy")),
        "nin_provider_status": NIN_PROVIDER_HEALTH,
        "nin_base_url": nin_config.get("base_url"),
        "nin_api_key_loaded": bool(nin_config.get("api_key")),
        "timestamp": iso(datetime.utcnow()),
    }


@app.get("/admin/login-diagnostics")
def admin_login_diagnostics():
    db_connected = False
    admin_user_exists = False
    db_error = ""
    try:
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
            db_connected = True
            admin_user_exists = bool(get_db_user_by_email(db, ADMIN_EMAIL))
        finally:
            db.close()
    except Exception as error:
        db_error = f"{type(error).__name__}: {error}"

    return {
        "admin_email_configured": bool(ADMIN_EMAIL),
        "admin_user_exists": admin_user_exists,
        "database_connected": db_connected,
        "jwt_secret_loaded": bool(os.environ.get("JWT_SECRET")),
        "last_login_error": LAST_ADMIN_LOGIN_ERROR,
        "last_login_traceback": LAST_ADMIN_LOGIN_TRACEBACK,
        "last_login_at": LAST_ADMIN_LOGIN_AT,
        "admin_email_env_loaded": bool(os.environ.get("ADMIN_EMAIL")),
        "admin_password_env_loaded": bool(os.environ.get("ADMIN_PASSWORD")),
        "configured_admin_email": ADMIN_EMAIL,
        "database_error": db_error,
    }


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
        products = db.query(DBProduct).filter(DBProduct.is_active == True).all()
        categories = sorted({p.category or p.category_name for p in products if p.category or p.category_name})
        return [
            {
                "id": idx + 1,
                "name": category,
                "image_url": FOODNOVA_CATEGORY_IMAGES.get(category, ""),
                "products": FOODNOVA_CATEGORIES.get(category, []),
            }
            for idx, category in enumerate(categories)
        ]
    finally:
        db.close()


@app.get("/products")
def list_products(search: Optional[str] = None, include_inactive: bool = False):
    db = SessionLocal()
    try:
        query = db.query(DBProduct)
        if not include_inactive:
            query = query.filter(DBProduct.is_active == True)
        products = []
        for product in query.order_by(DBProduct.category.asc(), DBProduct.name.asc()).all():
            if include_inactive or product.is_active:
                if product.name in CATALOG_PRODUCT_NAMES or is_combo_product(product) or product.is_active:
                    products.append(product_to_dict(product))
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


@app.post("/delivery-workers/signup")
@app.post("/delivery/workers/signup")
async def delivery_worker_signup(
    request: Request,
    worker_type: str = Form(...),
    full_name: str = Form(""),
    first_name: str = Form(""),
    last_name: str = Form(""),
    phone: str = Form(...),
    password: str = Form(...),
    confirm_password: str = Form(...),
    email: str = Form(...),
    home_address: str = Form(""),
    residential_address: str = Form(""),
    operating_city: str = Form(""),
    emergency_contact_name: str = Form(""),
    emergency_contact_phone: str = Form(""),
    emergency_contact_relationship: str = Form(""),
    nin_number: str = Form(...),
    nin_consent: bool = Form(...),
    nin_verification_token: str = Form(""),
    nin_verified_firstname: str = Form(""),
    nin_verified_middlename: str = Form(""),
    nin_verified_surname: str = Form(""),
    nin_verified_full_name: str = Form(""),
    nin_verified_birthdate: str = Form(""),
    nin_verified_gender: str = Form(""),
    nin_verified_phone: str = Form(""),
    nin_report_id: str = Form(""),
    nin_last4: str = Form(""),
    nin_verified: bool = Form(False),
    nin_identity_payload: str = Form(""),
    id_type: str = Form("NIN"),
    id_number: str = Form(""),
    rider_type: str = Form("motorcycle"),
    vehicle_type: Optional[str] = Form(""),
    partner_company: Optional[str] = Form(""),
    plate_number: Optional[str] = Form(""),
    driver_license_number: Optional[str] = Form(""),
    selfie: UploadFile = File(...),
    id_document: UploadFile = File(...),
    address_document: Optional[UploadFile] = File(None),
    vehicle_photo: Optional[UploadFile] = File(None),
):
    print("SUBMIT_STARTED", json_dump({
        "route": "/delivery-workers/signup",
        "email_present": bool(email),
        "phone_present": bool(phone),
        "nin_last4": "".join(ch for ch in str(nin_number or "") if ch.isdigit())[-4:],
        "timestamp": iso(datetime.utcnow()),
    }))
    print("SUBMIT_APPLICATION_START", json_dump({
        "route": "/delivery-workers/signup",
        "email_present": bool(email),
        "phone_present": bool(phone),
        "nin_last4": "".join(ch for ch in str(nin_number or "") if ch.isdigit())[-4:],
        "timestamp": iso(datetime.utcnow()),
    }))
    print("ONBOARDING_SUBMIT_START", json_dump({
        "route": "/delivery-workers/signup",
        "email_present": bool(email),
        "phone_present": bool(phone),
        "nin_last4": "".join(ch for ch in str(nin_number or "") if ch.isdigit())[-4:],
        "timestamp": iso(datetime.utcnow()),
    }))
    if not is_mobile_worker_registration_request(request):
        raise HTTPException(status_code=403, detail="Delivery partner registration must be completed on a mobile phone so we can capture your selfie and verify your identity.")
    worker_type = (worker_type or "").strip().lower()
    if worker_type not in ["messenger", "rider"]:
        raise HTTPException(status_code=400, detail="Invalid delivery worker type")
    clean_first_name = (first_name or "").strip()
    clean_last_name = (last_name or "").strip()
    clean_full_name = (full_name or " ".join([clean_first_name, clean_last_name]).strip()).strip()
    clean_address = (residential_address or home_address or operating_city or "").strip()
    required_values = {
        "phone": phone,
        "email": email,
        "residential address": clean_address,
        "NIN": nin_number,
    }
    missing = [label for label, value in required_values.items() if not str(value or "").strip()]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required field: {', '.join(missing)}")
    if password != confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    if len("".join(ch for ch in str(nin_number or "") if ch.isdigit())) != 11:
        raise HTTPException(status_code=400, detail="NIN must be exactly 11 digits")
    if not nin_consent:
        raise HTTPException(status_code=400, detail="NIN verification consent is required")
    if not selfie:
        raise HTTPException(status_code=400, detail="Live selfie capture is required")
    if not id_document:
        raise HTTPException(status_code=400, detail="Driver license upload is required")
    rider_type = (rider_type or ("walker" if worker_type == "messenger" else "motorcycle")).strip().lower()
    if rider_type in ["walking", "walking_messenger", "messenger"]:
        rider_type = "walker"
    if rider_type in ["motorcycle_rider", "motorbike"]:
        rider_type = "motorcycle"
    if rider_type not in ["walker", "motorcycle", "vehicle", "bicycle"]:
        raise HTTPException(status_code=400, detail="Invalid rider type")
    if rider_type == "walker":
        worker_type = "messenger"
    elif rider_type in ["motorcycle", "vehicle", "bicycle"]:
        worker_type = "rider"
    requires_vehicle_details = worker_type == "rider" and rider_type in ["motorcycle", "vehicle"]
    if requires_vehicle_details:
        rider_missing = []
        if not (vehicle_type or "").strip():
            rider_missing.append("vehicle type")
        if not (plate_number or "").strip():
            rider_missing.append("plate number")
        if rider_missing:
            raise HTTPException(status_code=400, detail=f"Missing required rider field: {', '.join(rider_missing)}")
    if not NIN_PROVIDER_HEALTH.get("onboarding_verification_enabled", True):
        raise HTTPException(status_code=503, detail=NIN_PROVIDER_HEALTH.get("message") or "Identity verification currently unavailable.")

    clean_phone = (phone or "").strip()
    clean_email = (email or "").strip().lower()
    account_email = clean_email
    clean_nin = "".join(ch for ch in str(nin_number or "") if ch.isdigit())
    submitted_nin_hash = _nin_hash(clean_nin)

    if nin_verification_token.strip():
        verified_payload = decode_nin_verification_token(nin_verification_token.strip(), clean_nin)
        verified_data = dict(verified_payload.get("data") or {})
        verification_source = "stored_verification_token"
    elif nin_report_id.strip():
        verified_payload = {
            "verified": bool(nin_verified),
            "report_id": nin_report_id.strip(),
            "data": {},
        }
        verified_data = {}
        if nin_identity_payload.strip():
            try:
                decoded_identity = json.loads(nin_identity_payload)
                if isinstance(decoded_identity, dict):
                    verified_data.update(decoded_identity)
            except Exception:
                print("NIN_ONBOARDING_FAILURE_STAGE", json_dump({
                    "stage": "backend_validation",
                    "reason": "invalid_nin_identity_payload",
                    "route": "/delivery-workers/signup",
                    "report_id": nin_report_id.strip(),
                }))
        verification_source = "stored_report_id"
    else:
        raise HTTPException(status_code=400, detail="Verify NIN before submitting your rider application.")
    for key, value in {
        "first_name": nin_verified_firstname,
        "middle_name": nin_verified_middlename,
        "surname": nin_verified_surname,
        "full_name": nin_verified_full_name,
        "birthdate": nin_verified_birthdate,
        "gender": nin_verified_gender,
        "phone": nin_verified_phone,
    }.items():
        if str(value or "").strip():
            verified_data[key] = value
    nin_data = normalize_nin_provider_data(verified_data)
    clean_first_name = clean_first_name or nin_data.get("first_name") or ""
    clean_last_name = clean_last_name or nin_data.get("surname") or ""
    clean_full_name = (
        clean_full_name
        or nin_data.get("full_name")
        or " ".join(part for part in [clean_first_name, nin_data.get("middle_name") or "", clean_last_name] if part).strip()
    )
    clean_phone = (phone or "").strip() or nin_data.get("phone") or ""
    clean_address = clean_address or nin_data.get("address") or ""
    nin_result = {
        "verified": True,
        "report_id": nin_report_id or verified_payload.get("report_id") or "",
        "message": "Identity Verified.",
        "data": nin_data,
    }
    if not clean_full_name:
        raise HTTPException(status_code=400, detail="Missing required field: full name")
    if not clean_address:
        raise HTTPException(status_code=400, detail="Missing required field: residential address")
    if not nin_result.get("report_id"):
        raise HTTPException(status_code=400, detail="NIN verification session is missing report ID. Please verify NIN again.")
    print("NORMALIZED_IDENTITY", json_dump({"route": "/delivery-workers/signup", "data": nin_data, "effective_full_name": clean_full_name, "effective_phone_present": bool(clean_phone), "report_id": nin_result.get("report_id") or ""}))
    print("NIN_PARSED_DATA", json_dump({"route": "/delivery-workers/signup", "source": verification_source, "data": nin_data, "report_id": nin_result.get("report_id") or "", "nin_last4": nin_last4 or clean_nin[-4:]}))
    consent_meta = {
        "consent_accepted": True,
        "consent_timestamp": iso(datetime.utcnow()),
        "device": parse_user_agent(request.headers.get("user-agent", "")),
        "ip_address": get_request_ip(request),
    }

    db = SessionLocal()
    try:
        print("NIN_ONBOARDING_REGISTRATION_STAGE", json_dump({
            "stage": "database_validation",
            "provider_verified": bool(nin_result.get("verified")),
            "report_id": nin_result.get("report_id") or "",
            "identity_fields_populated": bool(any(nin_data.values())),
            "route": "/delivery-workers/signup",
        }))
        if get_db_user_by_email(db, account_email) or get_db_user_by_phone(db, clean_phone):
            raise HTTPException(status_code=400, detail="A delivery account with this email or phone already exists")
        existing_kyc_nin = db.query(DBRiderKyc).filter(DBRiderKyc.nin_hash == submitted_nin_hash).first()
        existing_worker_nin = None
        if not existing_kyc_nin:
            for existing_worker in db.query(DBDeliveryWorker).filter(DBDeliveryWorker.deleted_at.is_(None)).all():
                existing_identity = (delivery_worker_review_meta(existing_worker).get("identity_verification") or {})
                if existing_identity.get("nin_hash") == submitted_nin_hash:
                    existing_worker_nin = existing_worker
                    break
        if existing_kyc_nin or existing_worker_nin:
            raise HTTPException(status_code=400, detail="A rider application with this NIN already exists")

        print("SUBMIT_DOCUMENT_UPLOAD", json_dump({"route": "/delivery-workers/signup", "stage": "starting_uploads", "has_selfie": bool(selfie), "has_driver_license": bool(id_document), "has_address_document": bool(address_document)}))
        print("SELFIE_UPLOAD_START", json_dump({"route": "/delivery-workers/signup", "filename": getattr(selfie, "filename", ""), "content_type": getattr(selfie, "content_type", "")}))
        selfie_url = await save_workforce_upload(selfie, False, "foodnova/workforce/selfies")
        print("SELFIE_UPLOAD_SUCCESS", json_dump({"route": "/delivery-workers/signup", "url_present": bool(selfie_url)}))
        print("LICENSE_UPLOAD_START", json_dump({"route": "/delivery-workers/signup", "filename": getattr(id_document, "filename", ""), "content_type": getattr(id_document, "content_type", "")}))
        id_document_url = await save_workforce_upload(id_document, True, "foodnova/workforce/id-documents")
        print("LICENSE_UPLOAD_SUCCESS", json_dump({"route": "/delivery-workers/signup", "url_present": bool(id_document_url)}))
        address_document_url = await save_workforce_upload(address_document, True, "foodnova/workforce/address-documents") if address_document else ""
        vehicle_photo_url = await save_workforce_upload(vehicle_photo, True, "foodnova/workforce/vehicles") if vehicle_photo else ""
        effective_city = clean_address
        clean_id_type = (id_type or "Driver License").strip() or "Driver License"
        clean_id_number = (id_number or clean_nin).strip()

        print("RIDER_CREATE_START", json_dump({"route": "/delivery-workers/signup", "worker_type": worker_type, "rider_type": rider_type, "email": account_email}))
        print("DATABASE_INSERT_START", json_dump({"route": "/delivery-workers/signup", "tables": ["users", "delivery_workers", "riders", "rider_kyc", "rider_documents"]}))
        user = DBUser(
            full_name=clean_full_name,
            email=account_email,
            phone=clean_phone,
            password=_hash_new_password(password),
            role=worker_type,
            is_active=True,
        )
        db.add(user)
        db.flush()
        worker = DBDeliveryWorker(
            user_id=user.id,
            worker_type=worker_type,
            full_name=clean_full_name,
            phone=clean_phone,
            email=clean_email,
            home_address=effective_city,
            emergency_contact_name=(emergency_contact_name or "").strip(),
            emergency_contact_phone=(emergency_contact_phone or "").strip(),
            id_type=clean_id_type,
            id_number=clean_id_number,
            nin_verified=True,
            nin_report_id=nin_result.get("report_id") or "",
            nin_last4=clean_nin[-4:],
            verified_first_name=nin_data.get("first_name") or "",
            verified_middle_name=nin_data.get("middle_name") or "",
            verified_surname=nin_data.get("surname") or "",
            verified_phone=nin_data.get("phone") or "",
            verified_gender=nin_data.get("gender") or "",
            verified_birthdate=nin_data.get("birthdate") or "",
            verified_photo_url="",
            selfie_url=selfie_url,
            profile_photo_url=selfie_url,
            id_document_url=id_document_url,
            vehicle_type=(vehicle_type or "").strip() if worker_type == "rider" else "Walker",
            partner_company=(partner_company or "").strip() if worker_type == "rider" else "",
            plate_number=(plate_number or "").strip() if requires_vehicle_details else "",
            driver_license_number=(driver_license_number or "").strip() if requires_vehicle_details else "",
            vehicle_photo_url=vehicle_photo_url,
            kyc_status="PENDING_REVIEW",
            operational_status="OFFLINE",
        )
        db.add(worker)
        db.flush()
        print("DATABASE_INSERT_SUCCESS", json_dump({"route": "/delivery-workers/signup", "user_id": user.id, "worker_id": worker.id, "tables": ["users", "delivery_workers"]}))
        print("RIDER_CREATE_SUCCESS", json_dump({"worker_id": worker.id, "user_id": user.id, "source": "delivery_workers"}))
        log_verification_event(db, worker, "nin", nin_result, message=nin_result.get("message") or "")
        set_delivery_worker_review_meta(worker, "identity_verification", {
                "status": "verified",
                "verification_state": "verified",
                "nin_last4": worker.nin_last4,
                "nin_hash": submitted_nin_hash,
                "provider": "ninbvnportal",
                "provider_report_id": worker.nin_report_id,
                "provider_message": nin_result.get("message") or "",
                "verified_full_name": nin_data.get("full_name") or " ".join([nin_data.get("first_name") or "", nin_data.get("middle_name") or "", nin_data.get("surname") or ""]).strip(),
                "verified_dob": nin_data.get("dob") or nin_data.get("birthdate") or "",
                "verified_phone": nin_data.get("phone") or "",
                "verified_gender": nin_data.get("gender") or "",
                "verified_address": nin_data.get("address") or "",
                "rider_type": rider_type,
                "operating_city": effective_city,
                "consent": consent_meta,
                "manual_review_required": False,
                "verified_at": iso(datetime.utcnow()),
        })
        set_delivery_worker_review_meta(worker, "address_verification", {"status": "submitted", "operating_city": effective_city, "submitted_at": iso(datetime.utcnow())})
        set_delivery_worker_review_meta(worker, "emergency_contact", {"status": "completed" if worker.emergency_contact_name or worker.emergency_contact_phone else "not_required", "full_name": worker.emergency_contact_name, "phone_number": worker.emergency_contact_phone, "relationship": emergency_contact_relationship.strip(), "submitted_at": iso(datetime.utcnow())})
        _, rider_kyc = ensure_rider_records(db, worker)
        if rider_kyc:
            rider_kyc.identity_status = "verified"
            rider_kyc.address_status = "submitted"
            rider_kyc.emergency_status = "completed"
            rider_kyc.selfie_status = "verified"
            rider_kyc.nin_hash = submitted_nin_hash
            rider_kyc.nin_last4 = worker.nin_last4
            rider_kyc.nin_verified = True
            rider_kyc.nin_provider_report_id = worker.nin_report_id
            rider_kyc.nin_response_json = json_dump(nin_result)
            rider_kyc.verified_full_name = nin_data.get("full_name") or " ".join([nin_data.get("first_name") or "", nin_data.get("middle_name") or "", nin_data.get("surname") or ""]).strip()
            rider_kyc.verified_dob = nin_data.get("dob") or nin_data.get("birthdate") or ""
            rider_kyc.verified_phone = nin_data.get("phone") or ""
            rider_kyc.verified_gender = nin_data.get("gender") or ""
            rider_kyc.verified_address = nin_data.get("address") or ""
            rider_kyc.consent_accepted = True
            rider_kyc.consent_timestamp = datetime.utcnow()
            rider_kyc.consent_device_json = json_dump(consent_meta.get("device") or {})
            rider_kyc.consent_ip_address = consent_meta.get("ip_address") or ""
        rider_document_upsert(db, worker, "selfie", selfie_url, {"filename": selfie.filename, "content_type": selfie.content_type or ""}, hashlib.sha256(str(selfie_url or "").encode("utf-8")).hexdigest())
        if id_document_url:
            rider_document_upsert(db, worker, "driver_license", id_document_url, {"filename": id_document.filename, "content_type": id_document.content_type or ""})
        if address_document_url:
            rider_document_upsert(db, worker, "address_proof", address_document_url, {"filename": getattr(address_document, "filename", ""), "content_type": getattr(address_document, "content_type", "")})
        if vehicle_photo_url:
            rider_document_upsert(db, worker, "vehicle_photo", vehicle_photo_url, {"filename": getattr(vehicle_photo, "filename", ""), "content_type": getattr(vehicle_photo, "content_type", "")})
        print("RIDER_STATUS_UPDATE_START", json_dump({"worker_id": worker.id, "from_status": "", "to_status": worker.kyc_status}))
        print("PENDING_REVIEW_SAVE_START", json_dump({"worker_id": worker.id, "target_status": "PENDING_REVIEW"}))
        sync_rider_onboarding_state(db, worker, note="Rider submitted complete signup KYC")
        print("RIDER_STATUS_UPDATE_SUCCESS", json_dump({"worker_id": worker.id, "kyc_status": worker.kyc_status, "source": "delivery_workers"}))
        print("PENDING_REVIEW_SAVE_SUCCESS", json_dump({"worker_id": worker.id, "kyc_status": worker.kyc_status, "source": "delivery_workers"}))
        print("NIN_ONBOARDING_REGISTRATION_STAGE", json_dump({
            "stage": "database_save",
            "worker_id": worker.id,
            "user_id": user.id,
            "route": "/delivery-workers/signup",
        }))
        db.commit()
        print("SUBMIT_APPLICATION_CREATED", json_dump({"route": "/delivery-workers/signup", "worker_id": worker.id, "status": worker.kyc_status}))
        print("SUBMIT_COMPLETED", json_dump({"route": "/delivery-workers/signup", "worker_id": worker.id, "status": worker.kyc_status}))
        print("DATABASE_INSERT_SUCCESS", json_dump({"route": "/delivery-workers/signup", "worker_id": worker.id, "transaction_committed": True}))
        db.refresh(worker)
        worker_data = worker_to_dict(worker)
        print("RIDER_ONBOARDING_COMPLETE", json_dump({
            "worker_id": worker.id,
            "user_id": user.id,
            "worker_type": worker.worker_type,
            "approval_status": worker.kyc_status or "KYC_PENDING",
            "admin_source": "delivery_workers",
            "timestamp": iso(datetime.utcnow()),
        }))
        create_admin_audit_log(
            request,
            {"id": None, "full_name": "FoodNova System", "email": "system@foodnova.com.ng"},
            "worker_nin_verified",
            "delivery_worker",
            worker.id,
            f"NIN verified for {worker_type} delivery workforce application",
            {"worker_id": worker.id, "worker_type": worker_type, "nin_last4": worker.nin_last4, "report_id": worker.nin_report_id},
        )
        create_admin_audit_log(
            request,
            {"id": None, "full_name": "FoodNova System", "email": "system@foodnova.com.ng"},
            "worker_registered",
            "delivery_worker",
            worker.id,
            f"{worker_type.title()} registered for FoodNova delivery workforce",
            {"worker": worker_data},
        )
        token = create_access_token(user)
        return {"success": True, "message": "Identity Verified. Submitted for operational review.", "access_token": token, "token": token, "worker": worker_data, "data": worker_data}
    except HTTPException as error:
        db.rollback()
        print("SUBMIT_FAILED", json_dump({"route": "/delivery-workers/signup", "status_code": error.status_code, "detail": error.detail}))
        print("DATABASE_INSERT_FAILURE", json_dump({
            "route": "/delivery-workers/signup",
            "stage": "http_exception",
            "status_code": error.status_code,
            "detail": error.detail,
        }))
        print("PENDING_REVIEW_SAVE_FAILURE", json_dump({
            "route": "/delivery-workers/signup",
            "stage": "http_exception",
            "status_code": error.status_code,
        }))
        print("RIDER_CREATE_FAILURE", json_dump({
            "route": "/delivery-workers/signup",
            "stage": "database_validation_or_save",
            "status_code": error.status_code,
            "detail": error.detail,
        }))
        print("NIN_ONBOARDING_FAILURE_STAGE", json_dump({
            "stage": "database_validation",
            "status_code": error.status_code,
            "detail": error.detail,
            "route": "/delivery-workers/signup",
        }))
        raise
    except Exception as error:
        db.rollback()
        print("SUBMIT_FAILED", json_dump({"route": "/delivery-workers/signup", "error_type": type(error).__name__, "message": str(error)}))
        print("DATABASE_INSERT_FAILURE", json_dump({
            "route": "/delivery-workers/signup",
            "stage": "unexpected_exception",
            "error_type": type(error).__name__,
            "message": str(error),
        }))
        print("PENDING_REVIEW_SAVE_FAILURE", json_dump({
            "route": "/delivery-workers/signup",
            "stage": "unexpected_exception",
            "error_type": type(error).__name__,
        }))
        print("RIDER_CREATE_FAILURE", json_dump({
            "route": "/delivery-workers/signup",
            "stage": "unexpected_exception",
            "error_type": type(error).__name__,
            "message": str(error),
        }))
        print("NIN_ONBOARDING_FAILURE_STAGE", json_dump({
            "stage": "database_save",
            "error_type": type(error).__name__,
            "message": str(error),
            "route": "/delivery-workers/signup",
        }))
        raise
    finally:
        db.close()


@app.post("/delivery-workers/verify-nin")
def verify_delivery_worker_nin(payload: NINVerificationPayload, request: Request):
    if not is_mobile_worker_registration_request(request):
        print("NIN_ONBOARDING_FAILURE_STAGE", json_dump({"stage": "backend_validation", "reason": "mobile_request_required", "route": "/delivery-workers/verify-nin"}))
        raise HTTPException(status_code=403, detail="NIN verification must be completed on a mobile phone.")
    validation = validate_ninbvnportal_config()
    if not validation.get("configured"):
        print("NIN_ONBOARDING_FAILURE_STAGE", json_dump({"stage": "backend_validation", "reason": "provider_not_configured", "route": "/delivery-workers/verify-nin"}))
        raise HTTPException(status_code=503, detail=validation.get("message") or "NIN API key missing from server configuration")
    print("NIN_VERIFICATION_ATTEMPT", json_dump({
        "route": "/delivery-workers/verify-nin",
        "nin_last4": "".join(ch for ch in str(payload.nin or "") if ch.isdigit())[-4:],
        "consent": bool(payload.consent),
        "provider_health": NIN_PROVIDER_HEALTH,
        "timestamp": iso(datetime.utcnow()),
    }))
    try:
        result = verify_nin(payload.nin, payload.consent)
    except NINBVNPortalError as error:
        failure_stage = "provider_rejection" if error.provider_status else "backend_validation"
        if error.code in {"provider_unavailable", "provider_timeout"}:
            failure_stage = "provider_network"
        print("NIN_ONBOARDING_FAILURE_STAGE", json_dump({
            "stage": failure_stage,
            "error_code": error.code,
            "provider_status": error.provider_status,
            "route": "/delivery-workers/verify-nin",
        }))
        provider_response = error.provider_response or (json_dump(error.provider_body or {}) if error.provider_body else "")
        provider_detail = ""
        if isinstance(error.provider_body, dict):
            provider_detail = str(error.provider_body.get("message") or error.provider_body.get("detail") or error.provider_body.get("error") or "").strip()
        if not provider_detail and provider_response:
            try:
                provider_detail = str(json.loads(provider_response).get("message") or "").strip()
            except Exception:
                provider_detail = provider_response.strip()
        user_message = {
            "invalid_provider_credentials": "The NIN provider rejected the API credentials.",
            "provider_not_configured": "NIN API key missing from server configuration",
            "invalid_nin": "Please enter a valid 11-digit NIN.",
            "consent_required": "Please accept NIN verification consent before continuing.",
            "insufficient_wallet_balance": "Identity verification is temporarily unavailable. Please try again later.",
            "provider_unavailable": "Identity verification provider is currently unreachable. Please try again shortly.",
            "provider_timeout": "Identity verification is taking too long. Please try again.",
            "provider_rate_limited": "Too many verification requests. Please try again later.",
            "provider_rejected_request": "The NIN provider rejected this request. Please check the NIN and try again.",
            "provider_error": "Identity verification is temporarily unavailable. Please try again later.",
        }.get(error.code, str(error) or "NIN verification failed.")
        if provider_detail:
            user_message = provider_detail
        print("NIN_VERIFICATION_FAILURE", json_dump({
            "route": "/delivery-workers/verify-nin",
            "error_code": error.code,
            "provider_status": error.provider_status,
            "provider_response": provider_response,
            "provider_attempts": error.provider_attempts or [],
            "retryable": error.retryable,
            "nin_last4": "".join(ch for ch in str(payload.nin or "") if ch.isdigit())[-4:],
            "timestamp": iso(datetime.utcnow()),
        }))
        if error.code in {"invalid_provider_credentials", "insufficient_wallet_balance", "provider_unavailable", "provider_timeout", "provider_error"}:
            auth_failed = error.code == "invalid_provider_credentials" or error.provider_status in (401, 403)
            NIN_PROVIDER_HEALTH.update({
                "healthy": False,
                "onboarding_verification_enabled": not auth_failed and bool(error.retryable),
                "message": user_message,
                "provider_auth_status": "failed" if auth_failed else "unknown",
                "provider_status": error.provider_status,
                "provider_message": str(error),
                "checked_at": iso(datetime.utcnow()),
            })
        response_body = {
            "success": False,
            "verified": False,
            "message": user_message,
            "error_code": error.code,
            "provider_status": error.provider_status,
            "provider_response": provider_response,
            "provider_body": error.provider_body or {},
            "provider_attempts": error.provider_attempts or [],
            "retryable": error.retryable,
        }
        return JSONResponse(
            status_code=error.provider_status or error.status_code or 400,
            content=response_body,
        )
    if not result.get("verified"):
        print("NIN_ONBOARDING_FAILURE_STAGE", json_dump({
            "stage": "provider_rejection",
            "provider_status": result.get("provider_http_status"),
            "provider_message": result.get("message"),
            "route": "/delivery-workers/verify-nin",
        }))
        return {
            "success": False,
            "verified": False,
            "message": result.get("message") or "NIN verification failed.",
            "provider_status": result.get("provider_http_status"),
            "provider_response": json_dump(result.get("raw_response") or {}),
            "provider_body": result.get("raw_response") or {},
            "provider_attempts": result.get("provider_attempts") or [],
        }
    NIN_PROVIDER_HEALTH.update({
        "healthy": True,
        "onboarding_verification_enabled": True,
        "message": "Provider healthy.",
        "provider_auth_status": "authenticated",
        "provider_status": result.get("provider_http_status"),
        "provider_message": result.get("message"),
        "latency_ms": result.get("duration_ms"),
        "checked_at": iso(datetime.utcnow()),
    })
    print("NIN_VERIFICATION_SUCCESS", json_dump({
        "route": "/delivery-workers/verify-nin",
        "request_id": result.get("request_id"),
        "provider_status": result.get("provider_http_status"),
        "duration_ms": result.get("duration_ms"),
        "nin_last4": "".join(ch for ch in str(payload.nin or "") if ch.isdigit())[-4:],
        "timestamp": iso(datetime.utcnow()),
    }))
    raw_provider_response = result.get("parsed_response_body") or result.get("raw_response") or result
    identity_payload = extract_nin_identity_payload(result)
    normalized_data = normalize_nin_provider_data(identity_payload)
    print("RAW_PROVIDER_RESPONSE", json_dump(raw_provider_response))
    print("NIN_PROVIDER_RAW_RESPONSE", json_dump(raw_provider_response))
    print("NIN_PROVIDER_PARSED_RESPONSE", json_dump(identity_payload))
    print("NORMALIZED_PROVIDER_DATA", json_dump(normalized_data))
    print("NIN_NORMALIZED_DATA", json_dump(normalized_data))
    print("NORMALIZED_IDENTITY", json_dump(normalized_data))
    print("NIN_PROVIDER_RESPONSE", json_dump(result))
    print("NIN_PARSED_DATA", json_dump(normalized_data))
    verification_token = create_nin_verification_token(payload.nin, result)
    response_to_app = {
        "success": True,
        "verified": True,
        "message": "Identity Verified. Submitted for operational review.",
        "report_id": result.get("report_id") or "",
        "nin_verification_token": verification_token,
        "nin_last4": "".join(ch for ch in str(payload.nin or "") if ch.isdigit())[-4:],
        "data": nin_identity_response_data(normalized_data),
    }
    print("FINAL API RESPONSE SENT TO FLUTTER", json_dump(response_to_app))
    print("NIN_API_RESPONSE", json_dump(response_to_app))
    print("NIN_API_RESPONSE_TO_APP", json_dump(response_to_app))
    print("FINAL_RESPONSE_TO_APP", json_dump(response_to_app))
    return response_to_app


@app.post("/delivery/kyc/verify-nin")
def verify_delivery_kyc_nin(payload: NINVerificationPayload, request: Request):
    db, user, worker = get_delivery_worker_record_for_request(request)
    try:
        if not NIN_PROVIDER_HEALTH.get("onboarding_verification_enabled", True):
            raise HTTPException(status_code=503, detail=NIN_PROVIDER_HEALTH.get("message") or "Identity verification currently unavailable.")
        clean_nin = "".join(ch for ch in str(payload.nin or "") if ch.isdigit())
        if len(clean_nin) != 11:
            raise HTTPException(status_code=422, detail="NIN must be exactly 11 digits.")
        if not payload.consent:
            raise HTTPException(status_code=422, detail="Consent is required before NIN verification.")
        consent_meta = verification_consent_metadata(request, payload)
        rider_kyc = None
        attempt_number = 1
        if (worker.worker_type or "").lower() == "rider":
            _, rider_kyc = ensure_rider_records(db, worker)
            recent_cutoff = datetime.utcnow() - timedelta(hours=1)
            recent_attempts = db.query(DBVerificationLog).filter(
                DBVerificationLog.delivery_worker_id == worker.id,
                DBVerificationLog.verification_type == "nin",
                DBVerificationLog.created_at >= recent_cutoff,
            ).count()
            if recent_attempts >= 5:
                flags = json_load(rider_kyc.fraud_flags_json, {})
                flags["rate_limited_verification"] = True
                flags["suspicious_activity"] = True
                rider_kyc.fraud_flags_json = json_dump(flags)
                db.commit()
                raise HTTPException(status_code=429, detail="Too many verification attempts. Please retry after one hour.")
            attempt_number = int(rider_kyc.verification_attempt_count or 0) + 1
            rider_kyc.verification_attempt_count = attempt_number
            rider_kyc.last_verification_at = datetime.utcnow()
            rider_kyc.submitted_nin = clean_nin
            rider_kyc.nin_last4 = clean_nin[-4:]
            rider_kyc.consent_accepted = True
            rider_kyc.consent_timestamp = datetime.utcnow()
            rider_kyc.consent_device_json = json_dump(consent_meta.get("device") or {})
            rider_kyc.consent_ip_address = consent_meta.get("ip_address") or ""

        verified = False
        provider_result = {}
        provider_data = {}
        provider_message = ""
        provider_error_code = ""
        provider_retryable = False
        provider_http_status = None
        provider_fallback_manual_review = False
        try:
            provider_result = verify_nin(clean_nin, True)
            verified = bool(provider_result.get("verified"))
            provider_data = provider_result.get("data") or {}
            provider_message = provider_result.get("message") or ""
            provider_result["attempt_number"] = attempt_number
            provider_result["nin_last4"] = clean_nin[-4:]
            log_verification_event(db, worker, "nin", provider_result, message=provider_message, nin_last4=clean_nin[-4:], attempt_number=attempt_number)
        except NINBVNPortalError as error:
            if error.code in {"invalid_provider_credentials", "insufficient_wallet_balance", "provider_unavailable", "provider_timeout", "provider_error"}:
                auth_failed = error.code == "invalid_provider_credentials" or error.provider_status in (401, 403)
                NIN_PROVIDER_HEALTH.update({
                    "healthy": False,
                    "onboarding_verification_enabled": False,
                    "message": "Provider authentication failed. Check API credentials." if auth_failed else (str(error) or "Identity verification currently unavailable."),
                    "provider_auth_status": "failed" if auth_failed else "unknown",
                    "provider_status": error.provider_status,
                    "provider_message": str(error),
                    "checked_at": iso(datetime.utcnow()),
                })
            provider_message = str(error) or "NIN verification failed."
            provider_error_code = error.code
            provider_retryable = error.retryable
            provider_http_status = error.provider_status
            log_verification_event(db, worker, "nin", {"attempt_number": attempt_number, "nin_last4": clean_nin[-4:]}, error, provider_message, nin_last4=clean_nin[-4:], attempt_number=attempt_number)
            if rider_kyc:
                rider_kyc.identity_status = "failed"
                rider_kyc.nin_hash = _nin_hash(clean_nin)
                rider_kyc.submitted_nin = clean_nin
                rider_kyc.nin_last4 = clean_nin[-4:]
                rider_kyc.nin_verified = False
                rider_kyc.nin_provider = "ninbvnportal"
                rider_kyc.nin_provider_status = "error"
                rider_kyc.nin_provider_message = provider_message
                rider_kyc.nin_response_json = json_dump({"error_code": provider_error_code, "message": provider_message, "provider_status": provider_http_status})
                existing_flags = json_load(rider_kyc.fraud_flags_json, {})
                failed_attempts = int(existing_flags.get("failed_kyc_attempts") or 0) + 1
                existing_flags.update({
                    "failed_verification": True,
                    "fake_nin": provider_error_code == "invalid_nin",
                    "provider_error_code": provider_error_code,
                    "provider_retryable": provider_retryable,
                    "failed_kyc_attempts": failed_attempts,
                    "suspicious_activity": bool(existing_flags.get("suspicious_activity") or failed_attempts >= 3),
                })
                rider_kyc.fraud_flags_json = json_dump(existing_flags)
            print(
                "NIN_PROVIDER_ERROR",
                json_dump({
                    "worker_id": worker.id,
                    "error_code": error.code,
                    "retryable": error.retryable,
                    "provider_status": error.provider_status,
                    "nin_last4": clean_nin[-4:],
                    "timestamp": iso(datetime.utcnow()),
                }),
            )
            if error.code in [
                "provider_not_configured",
                "invalid_provider_credentials",
                "provider_unavailable",
                "provider_rate_limited",
                "invalid_provider_response",
                "provider_error",
                "insufficient_wallet_balance",
            ]:
                db.commit()
                raise HTTPException(status_code=error.status_code, detail=provider_message)

        fraud = detect_nin_fraud_flags(db, worker, clean_nin, provider_data, verified)
        if fraud.get("duplicate_nin"):
            verified = False
            provider_message = "This NIN is already linked to another delivery account."
        manual_review_required = bool(
            fraud.get("identity_mismatch")
            or fraud.get("duplicate_nin")
            or fraud.get("suspicious_activity")
            or fraud.get("fraud_risk_detected")
        )
        status = "verified" if verified and not manual_review_required else "manual_review" if verified or provider_fallback_manual_review else "failed"

        worker.nin_verified = status == "verified"
        worker.nin_report_id = provider_result.get("report_id") or worker.nin_report_id or ""
        worker.nin_last4 = clean_nin[-4:]
        worker.verified_first_name = provider_data.get("first_name") or worker.verified_first_name or ""
        worker.verified_middle_name = provider_data.get("middle_name") or worker.verified_middle_name or ""
        worker.verified_surname = provider_data.get("surname") or worker.verified_surname or ""
        worker.verified_phone = provider_data.get("phone") or worker.verified_phone or ""
        worker.verified_gender = provider_data.get("gender") or worker.verified_gender or ""
        worker.verified_birthdate = provider_data.get("birthdate") or worker.verified_birthdate or ""
        worker.verified_photo_url = provider_data.get("photo") or worker.verified_photo_url or ""
        set_delivery_worker_review_meta(worker, "identity_verification", {
            "status": status,
            "verification_state": status,
            "nin_last4": clean_nin[-4:],
            "nin_hash": _nin_hash(clean_nin),
            "provider": "ninbvnportal",
            "provider_report_id": provider_result.get("report_id") or "",
            "provider_message": provider_message,
            "provider_response_log": {
                "verified": verified,
                "message": provider_message,
                "report_id": provider_result.get("report_id") or "",
                "error_code": provider_error_code,
                "retryable": provider_retryable,
                "provider_http_status": provider_http_status,
                "fallback_manual_review": provider_fallback_manual_review,
            },
            "verified_at": iso(datetime.utcnow()) if status == "verified" else "",
            "checked_at": iso(datetime.utcnow()),
            "confidence_score": fraud.get("confidence_score"),
            "fraud_flags": {
                "identity_mismatch": fraud.get("identity_mismatch"),
                "duplicate_nin": fraud.get("duplicate_nin"),
                "suspicious_activity": fraud.get("suspicious_activity"),
                "failed_verification": fraud.get("failed_verification"),
                "fake_nin": fraud.get("fake_nin"),
                "fraud_risk_detected": fraud.get("fraud_risk_detected"),
            },
            "manual_review_required": manual_review_required or not verified,
        })
        if (worker.worker_type or "").lower() == "rider":
            _, rider_kyc = ensure_rider_records(db, worker)
            if rider_kyc:
                rider_kyc.identity_status = status
                rider_kyc.nin_hash = _nin_hash(clean_nin)
                rider_kyc.submitted_nin = clean_nin
                rider_kyc.nin_last4 = clean_nin[-4:]
                rider_kyc.nin_verified = status == "verified"
                rider_kyc.nin_provider = "ninbvnportal"
                rider_kyc.nin_provider_report_id = provider_result.get("report_id") or ""
                rider_kyc.nin_provider_status = provider_result.get("provider_status") or status
                rider_kyc.nin_provider_message = provider_message or ""
                rider_kyc.nin_response_json = json_dump(provider_result or {"error_code": provider_error_code, "message": provider_message})
                rider_kyc.verified_full_name = provider_data.get("full_name") or " ".join([provider_data.get("first_name") or "", provider_data.get("middle_name") or "", provider_data.get("surname") or ""]).strip()
                rider_kyc.verified_dob = provider_data.get("dob") or provider_data.get("birthdate") or ""
                rider_kyc.verified_phone = provider_data.get("phone") or ""
                rider_kyc.verified_gender = provider_data.get("gender") or ""
                rider_kyc.verified_address = provider_data.get("address") or ""
                rider_kyc.verification_attempt_count = attempt_number
                rider_kyc.last_verification_at = datetime.utcnow()
                rider_kyc.confidence_score = fraud.get("confidence_score") or 0
                existing_flags = json_load(rider_kyc.fraud_flags_json, {})
                failed_attempts = int(existing_flags.get("failed_kyc_attempts") or 0) + (0 if status == "verified" else 1)
                rider_kyc.fraud_flags_json = json_dump({
                    "identity_mismatch": fraud.get("identity_mismatch"),
                    "duplicate_nin": fraud.get("duplicate_nin"),
                    "suspicious_activity": bool(fraud.get("suspicious_activity") or failed_attempts >= 3),
                    "failed_verification": fraud.get("failed_verification"),
                    "fake_nin": fraud.get("fake_nin"),
                    "fraud_risk_detected": fraud.get("fraud_risk_detected"),
                    "provider_error_code": provider_error_code,
                    "provider_retryable": provider_retryable,
                    "failed_kyc_attempts": failed_attempts,
                })
                rider_kyc.duplicate_nin = bool(fraud.get("duplicate_nin"))
                rider_kyc.identity_verified_at = datetime.utcnow() if status == "verified" else rider_kyc.identity_verified_at
            sync_rider_onboarding_state(db, worker, note="Identity NIN verification updated")
        if manual_review_required or not verified:
            worker.kyc_status = "KYC_PENDING"

        auto_activated = maybe_auto_activate_delivery_worker(worker)
        worker.updated_at = datetime.utcnow()
        progress = onboarding_progress_payload(db, worker)
        response_identity = nin_identity_response_data(
            normalize_nin_provider_data(rider_identity_data(db, worker, rider_kyc))
        )
        db.commit()
        db.refresh(worker)

        return {
            "success": status == "verified",
            "verified": status == "verified",
            "status": status,
            "message": "Identity Verified. Submitted for operational review." if status == "verified" else (provider_message or "NIN requires manual review."),
            "report_id": worker.nin_report_id or "",
            "nin_last4": worker.nin_last4 or "",
            "data": response_identity,
            "error_code": provider_error_code,
            "retryable": provider_retryable,
            "manual_review_required": manual_review_required or not verified,
            "confidence_score": fraud.get("confidence_score"),
            "fraud_flags": {
                "identity_mismatch": fraud.get("identity_mismatch"),
                "duplicate_nin": fraud.get("duplicate_nin"),
                "suspicious_activity": fraud.get("suspicious_activity"),
                "failed_verification": fraud.get("failed_verification"),
                "fake_nin": fraud.get("fake_nin"),
                "fraud_risk_detected": fraud.get("fraud_risk_detected"),
            },
            "auto_activated": auto_activated,
            "verification": verification_status_response(worker),
            "worker": worker_data,
            "onboarding_progress": progress,
        }
    finally:
        db.close()


def api_success(data=None, message: str = "OK", **extra):
    response = {"success": True, "message": message, "data": data}
    response.update(extra)
    return response


@app.get("/api/health")
def api_health():
    return api_success({"status": "ok", "service": "foodnova-backend"})


@app.post("/api/auth/register")
def api_auth_register(payload: RegisterPayload):
    return register(payload)


@app.post("/api/auth/login")
def api_auth_login(payload: LoginPayload, request: Request):
    return login(payload, request)


@app.get("/api/auth/me")
def api_auth_me(request: Request):
    return me(request)


@app.get("/api/users/me")
def api_users_me(request: Request):
    return get_profile(request)


@app.patch("/api/users/me")
def api_update_user_profile(payload: ProfileUpdatePayload, request: Request):
    return update_profile(request, payload)


@app.get("/api/users/addresses")
def api_user_addresses(request: Request):
    return get_addresses(request)


@app.post("/api/users/addresses")
def api_create_user_address(payload: AddressPayload, request: Request):
    return create_address(request, payload)


@app.get("/api/categories")
def api_categories():
    return api_success(list_categories(), categories=list_categories())


@app.get("/api/products")
def api_products(search: Optional[str] = None):
    products = list_products(search)
    return api_success(products, products=products)


@app.get("/api/products/{product_id}")
def api_product_detail(product_id: int):
    product = get_product(product_id)
    return api_success(product, product=product)


@app.get("/api/cart")
def api_cart_status(request: Request):
    require_user(request)
    return JSONResponse(
        status_code=501,
        content={
            "success": False,
            "message": "Persistent cart is not enabled yet. Customer app uses local cart until checkout.",
            "data": None,
        },
    )


@app.post("/api/orders")
def api_create_order(payload: OrderPayload, request: Request):
    return create_order(payload, request)


@app.get("/api/orders")
def api_my_orders(request: Request):
    return my_orders(request)


@app.get("/api/orders/{order_id}")
def api_order_detail(order_id: int):
    order = get_order(order_id)
    return api_success(order, order=order)


@app.post("/api/orders/{order_id}/receipt")
async def api_upload_order_receipt(order_id: int, request: Request, file: UploadFile = File(...)):
    require_user(request)
    return await upload_receipt(order_id, file)


@app.post("/api/orders/{order_id}/confirm-delivery")
def api_confirm_delivery(order_id: int, payload: dict):
    return confirm_delivery(order_id, payload)


@app.get("/api/orders/{order_id}/rider-location")
def api_get_order_rider_location(order_id: int):
    return get_order_rider_location(order_id)


@app.get("/api/notifications")
def api_notifications(request: Request):
    return get_notifications(request)


@app.patch("/api/notifications/{notification_id}/read")
def api_mark_notification_read(notification_id: int, request: Request):
    return mark_notification_read(notification_id, request)


@app.post("/api/payments/initialize")
def api_initialize_payment(request: Request):
    require_user(request)
    return JSONResponse(
        status_code=501,
        content={
            "success": False,
            "message": "Paystack initialization endpoint is reserved for Phase 2.",
            "data": None,
        },
    )


@app.post("/delivery/auth/check-phone")
def delivery_auth_check_phone(payload: DeliveryAuthCheckPhonePayload):
    phone = normalize_delivery_phone(payload.phone_number)
    if not phone:
        raise HTTPException(status_code=422, detail="Enter a valid Nigerian phone number.")
    db = SessionLocal()
    try:
        worker = get_delivery_worker_by_phone(db, phone, include_deleted=True)
        return {
            "success": True,
            "exists": bool(worker),
            "phone_number": phone,
            "requires_verification": bool(worker and (worker.kyc_status or "") not in {"APPROVED", "ACTIVE"}),
            "approval_status": worker.kyc_status if worker else None,
        }
    finally:
        db.close()


@app.post("/delivery/auth/register", status_code=201)
def delivery_auth_register(payload: DeliveryAuthRegisterPayload, request: Request):
    phone = normalize_delivery_phone(payload.phone_number)
    full_name = (payload.full_name or "").strip()
    worker_type = (payload.worker_type or "").strip().lower()
    password = payload.password or ""
    account_email = str(payload.email or "").strip().lower()

    if not phone:
        raise HTTPException(status_code=422, detail="Enter a valid Nigerian phone number.")
    if not account_email:
        raise HTTPException(status_code=422, detail="Email is required.")
    if worker_type not in ["messenger", "rider"]:
        raise HTTPException(status_code=422, detail="Worker type must be rider or messenger.")
    if len(password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters.")

    db = SessionLocal()
    try:
        if get_delivery_worker_by_phone(db, phone):
            raise HTTPException(status_code=409, detail="Delivery account already exists. Please log in.")
        if get_db_user_by_phone(db, phone):
            raise HTTPException(status_code=409, detail="This phone number is already registered.")
        if get_db_user_by_email(db, account_email):
            raise HTTPException(status_code=409, detail="This email is already registered. Please log in.")

        user = DBUser(
            full_name=full_name or "FoodNova Rider",
            email=account_email,
            phone=phone,
            password=_hash_new_password(password),
            role=worker_type,
            is_active=True,
        )
        db.add(user)
        db.flush()
        ensure_profile(db, user)

        worker = DBDeliveryWorker(
            user_id=user.id,
            worker_type=worker_type,
            full_name=full_name or "",
            phone=phone,
            email=account_email,
            kyc_status="ONBOARDING",
            operational_status="OFFLINE",
        )
        db.add(worker)
        db.flush()
        ensure_rider_records(db, worker)
        sync_rider_onboarding_state(db, worker, note="Rider account created")
        db.commit()
        db.refresh(user)
        db.refresh(worker)
        log_delivery_auth_event("register_success", phone, worker_id=worker.id, user_id=user.id, scheme=_password_hash_scheme(user.password))
        create_admin_audit_log(
            request,
            db_user_to_dict(user),
            "delivery_auth_register",
            "delivery_worker",
            worker.id,
            f"{worker_type.title()} created FoodNova Delivery account",
            {"worker_id": worker.id, "worker_type": worker_type},
        )
        response = delivery_worker_auth_response(user, worker, request)
        response["message"] = "Delivery account created successfully."
        return response
    finally:
        db.close()


@app.post("/delivery/auth/login")
def delivery_auth_login(payload: DeliveryAuthLoginPayload, request: Request):
    phone = normalize_delivery_phone(payload.phone_number)
    if not phone:
        log_delivery_auth_event("login_failed", payload.phone_number, "invalid_phone")
        raise HTTPException(status_code=422, detail="Enter a valid Nigerian phone number.")
    db = SessionLocal()
    try:
        log_delivery_auth_event("login_attempt", phone)
        worker = get_delivery_worker_by_phone(db, phone, include_deleted=True)
        if not worker:
            log_delivery_auth_event("login_failed", phone, "worker_not_found")
            raise HTTPException(status_code=404, detail="Delivery account not found.")
        user = db.query(DBUser).filter(DBUser.id == worker.user_id).first()
        if not user or (user.role or "") not in ["messenger", "rider"]:
            log_delivery_auth_event("login_failed", phone, "user_not_delivery_worker", worker_id=worker.id, user_id=worker.user_id)
            raise HTTPException(status_code=404, detail="Delivery account not found.")
        if not getattr(user, "is_active", True):
            log_delivery_auth_event("login_failed", phone, "account_disabled", worker_id=worker.id, user_id=user.id)
            raise HTTPException(status_code=403, detail="Delivery account is disabled.")
        blocked_reason = delivery_worker_access_block_reason(worker)
        if blocked_reason:
            log_delivery_auth_event("login_failed", phone, "account_removed_or_blocked", worker_id=worker.id, user_id=user.id)
            raise HTTPException(status_code=401, detail=blocked_reason)
        scheme = _password_hash_scheme(user.password)
        if not _password_matches(payload.password or "", user.password):
            log_delivery_auth_event("password_verification_failed", phone, "invalid_password", worker_id=worker.id, user_id=user.id, scheme=scheme)
            raise HTTPException(status_code=401, detail="Invalid phone number or password.")
        if scheme in ["plain_or_unknown", "pbkdf2_sha256", "werkzeug"]:
            user.password = _hash_new_password(payload.password or "")
            db.commit()
            db.refresh(user)
            log_delivery_auth_event("password_rehashed", phone, "legacy_hash_upgraded", worker_id=worker.id, user_id=user.id, scheme=scheme)
        log_delivery_auth_event("login_success", phone, worker_id=worker.id, user_id=user.id, scheme=_password_hash_scheme(user.password))
        return delivery_worker_auth_response(user, worker, request)
    finally:
        db.close()


@app.get("/delivery/me")
def delivery_me(request: Request):
    db, user, worker = get_delivery_worker_record_for_request(request)
    try:
        progress = onboarding_progress_payload(db, worker)
        db.commit()
        db.refresh(worker)
        print("RIDER_PROFILE_FETCH", json_dump({
            "worker_id": worker.id,
            "user_id": user.get("id"),
            "approval_status": worker.kyc_status or "KYC_PENDING",
            "timestamp": iso(datetime.utcnow()),
        }))
        print("RIDER_APPROVAL_STATUS", json_dump({"worker_id": worker.id, "status": worker.kyc_status or "KYC_PENDING"}))
        return {
            "success": True,
            "worker_id": str(worker.id),
            "full_name": worker.full_name or "",
            "phone_number": worker.phone or "",
            "worker_type": worker.worker_type or "",
            "approval_status": worker.kyc_status or "KYC_PENDING",
            "kyc_status": worker.kyc_status or "KYC_PENDING",
            "worker": worker_to_dict(worker),
            "onboarding_progress": progress,
        }
    finally:
        db.close()


@app.get("/delivery/onboarding/progress")
def delivery_onboarding_progress(request: Request):
    db, user, worker = get_delivery_worker_record_for_request(request)
    try:
        progress = onboarding_progress_payload(db, worker)
        db.commit()
        return {"success": True, "data": progress, "onboarding_progress": progress}
    finally:
        db.close()


@app.post("/delivery/onboarding/verify-nin")
def delivery_onboarding_verify_nin(payload: NINVerificationPayload, request: Request):
    db, user, worker = get_delivery_worker_record_for_request(request)
    try:
        _, rider_kyc = ensure_rider_records(db, worker)
        cached_identity = rider_identity_data(db, worker, rider_kyc)
        if worker.nin_verified and (worker.nin_report_id or (rider_kyc and rider_kyc.nin_provider_report_id)):
            response = {
                "success": True,
                "verified": True,
                "cached": True,
                "message": "Identity already verified.",
                "report_id": worker.nin_report_id or rider_kyc.nin_provider_report_id,
                "nin_last4": worker.nin_last4 or rider_kyc.nin_last4,
                "data": nin_identity_response_data(normalize_nin_provider_data(cached_identity)),
                "onboarding_progress": onboarding_progress_payload(db, worker),
            }
            print("NIN_CACHE_HIT", json_dump({"worker_id": worker.id, "report_id": response["report_id"], "nin_last4": response["nin_last4"]}))
            return response
    finally:
        db.close()
    return verify_delivery_kyc_nin(payload, request)


@app.patch("/delivery/onboarding/profile")
def delivery_onboarding_profile(payload: OnboardingProfilePayload, request: Request):
    db, user, worker = get_delivery_worker_record_for_request(request)
    try:
        full_name = (payload.full_name or " ".join(part for part in [payload.first_name, payload.middle_name, payload.last_name] if part).strip()).strip()
        if full_name:
            worker.full_name = full_name
        if payload.phone:
            worker.phone = normalize_delivery_phone(payload.phone) or payload.phone.strip()
        if payload.address:
            worker.home_address = payload.address.strip()
        worker.emergency_contact_name = (payload.emergency_contact_name or worker.emergency_contact_name or "").strip()
        worker.emergency_contact_phone = (payload.emergency_contact_phone or worker.emergency_contact_phone or "").strip()
        rider_type = (payload.rider_type or "").strip().lower()
        if rider_type in ["walker", "walking", "messenger"]:
            worker.worker_type = "messenger"
            worker.vehicle_type = "Walker"
            worker.plate_number = ""
        elif rider_type in ["motorcycle", "vehicle", "bicycle"]:
            worker.worker_type = "rider"
            worker.vehicle_type = (payload.vehicle_type or worker.vehicle_type or rider_type.title()).strip()
            worker.plate_number = (payload.plate_number or worker.plate_number or "").strip()
        meta = delivery_worker_review_meta(worker)
        meta["profile_data"] = {
            "completed": True,
            "full_name": worker.full_name or "",
            "phone": worker.phone or "",
            "address": worker.home_address or "",
            "rider_type": rider_type or "motorcycle",
            "vehicle_type": worker.vehicle_type or "",
            "plate_number": worker.plate_number or "",
            "updated_at": iso(datetime.utcnow()),
        }
        meta["address_verification"] = {"status": "submitted", "operating_city": worker.home_address or "", "submitted_at": iso(datetime.utcnow())}
        meta["emergency_contact"] = {"status": "completed" if worker.emergency_contact_name or worker.emergency_contact_phone else "not_required", "full_name": worker.emergency_contact_name, "phone_number": worker.emergency_contact_phone, "relationship": (payload.emergency_contact_relationship or "").strip(), "submitted_at": iso(datetime.utcnow())}
        worker.review_note = json_dump(meta)
        worker.updated_at = datetime.utcnow()
        sync_rider_onboarding_state(db, worker, note="Onboarding profile saved")
        progress = onboarding_progress_payload(db, worker)
        db.commit()
        return {"success": True, "data": progress, "onboarding_progress": progress}
    finally:
        db.close()


@app.post("/delivery/onboarding/documents")
async def delivery_onboarding_document(
    request: Request,
    document_type: str = Form(...),
    document: UploadFile = File(...),
):
    db, user, worker = get_delivery_worker_record_for_request(request)
    try:
        clean_type = (document_type or "").strip().lower()
        if clean_type not in {"selfie", "driver_license", "proof_of_address", "address_proof"}:
            raise HTTPException(status_code=400, detail="Invalid document type.")
        folder = "foodnova/workforce/selfies" if clean_type == "selfie" else "foodnova/workforce/id-documents" if clean_type == "driver_license" else "foodnova/workforce/address-documents"
        url = await save_workforce_upload(document, clean_type != "selfie", folder)
        if clean_type == "selfie":
            worker.selfie_url = url
            worker.profile_photo_url = worker.profile_photo_url or url
        elif clean_type == "driver_license":
            worker.id_document_url = url
        document_key = "address_proof" if clean_type == "proof_of_address" else clean_type
        rider_document_upsert(db, worker, document_key, url, {"filename": document.filename, "content_type": document.content_type or ""})
        meta = delivery_worker_review_meta(worker)
        docs = meta.get("documents") or {}
        docs[f"{clean_type}_url"] = url
        docs["updated_at"] = iso(datetime.utcnow())
        meta["documents"] = docs
        worker.review_note = json_dump(meta)
        worker.updated_at = datetime.utcnow()
        sync_rider_onboarding_state(db, worker, note=f"Onboarding document uploaded: {clean_type}")
        progress = onboarding_progress_payload(db, worker)
        db.commit()
        return {"success": True, "document_type": clean_type, "url": url, "data": progress, "onboarding_progress": progress}
    finally:
        db.close()


@app.post("/delivery/onboarding/training")
def delivery_onboarding_training(payload: OnboardingTrainingPayload, request: Request):
    db, user, worker = get_delivery_worker_record_for_request(request)
    try:
        meta = delivery_worker_review_meta(worker)
        meta["training"] = {"completed": bool(payload.completed), "completed_at": iso(datetime.utcnow()) if payload.completed else ""}
        worker.review_note = json_dump(meta)
        worker.updated_at = datetime.utcnow()
        sync_rider_onboarding_state(db, worker, note="Onboarding training completed")
        progress = onboarding_progress_payload(db, worker)
        db.commit()
        return {"success": True, "data": progress, "onboarding_progress": progress}
    finally:
        db.close()


@app.post("/delivery/onboarding/submit")
def delivery_onboarding_submit(payload: OnboardingSubmitPayload, request: Request):
    db, user, worker = get_delivery_worker_record_for_request(request)
    try:
        progress = onboarding_progress_payload(db, worker)
        documents = progress.get("documents") or {}
        missing = []
        if not progress.get("nin_verified"):
            missing.append("NIN verification")
        if not documents.get("selfie"):
            missing.append("selfie")
        if not documents.get("driver_license"):
            missing.append("driver license")
        if not (documents.get("proof_of_address") or documents.get("address_proof")):
            missing.append("proof of address")
        if not progress.get("training_completed"):
            missing.append("training")
        if missing:
            raise HTTPException(status_code=400, detail=f"Missing required onboarding item: {', '.join(missing)}")
        worker.kyc_status = "PENDING_REVIEW"
        worker.updated_at = datetime.utcnow()
        _, rider_kyc = ensure_rider_records(db, worker)
        if rider_kyc:
            rider_kyc.submitted_at = datetime.utcnow()
        sync_rider_onboarding_state(db, worker, note="Rider application submitted")
        progress = onboarding_progress_payload(db, worker)
        db.commit()
        return {"success": True, "message": "Submitted for admin review.", "worker": worker_to_dict(worker), "data": progress, "onboarding_progress": progress}
    finally:
        db.close()


@app.post("/delivery/auth/logout")
def delivery_auth_logout(request: Request):
    db, user, worker = get_delivery_worker_record_for_request(request)
    try:
        token = request.headers.get("authorization", "").replace("Bearer ", "").strip()
        if token:
            session = db.query(DBRiderSession).filter(DBRiderSession.token_hash == _token_hash(token)).first()
            if session:
                session.is_active = False
                session.revoked_at = datetime.utcnow()
                session.revoked_reason = "Rider logout"
        worker.fcm_token = ""
        worker.fcm_tokens_json = "[]"
        worker.updated_at = datetime.utcnow()
        db.commit()
        return {"success": True, "message": "Logged out successfully."}
    finally:
        db.close()


@app.get("/delivery/verification-status")
def delivery_verification_status(request: Request):
    db, user, worker = get_delivery_worker_record_for_request(request)
    try:
        if (worker.worker_type or "").lower() == "rider":
            sync_rider_onboarding_state(db, worker)
            db.commit()
            db.refresh(worker)
        return verification_status_response(worker)
    finally:
        db.close()


@app.post("/delivery/kyc", status_code=201)
async def delivery_identity_kyc(
    request: Request,
    nin: str = Form(...),
    selfie: UploadFile = File(...),
):
    db, user, worker = get_delivery_worker_record_for_request(request)
    try:
        clean_nin = "".join(ch for ch in str(nin or "") if ch.isdigit())
        if len(clean_nin) != 11:
            raise HTTPException(status_code=422, detail="NIN must be exactly 11 digits.")
        if not selfie or not selfie.filename:
            raise HTTPException(status_code=422, detail="Selfie image is required.")
        if not str(selfie.content_type or "").startswith("image/"):
            raise HTTPException(status_code=422, detail="Selfie must be a JPG, PNG, or WEBP image.")

        selfie_url = await save_workforce_upload(selfie, False, "foodnova/workforce/selfies")
        if not selfie_url:
            raise HTTPException(status_code=400, detail="Unable to upload selfie image.")

        worker.id_type = worker.id_type or "NIN"
        worker.id_number = worker.id_number or clean_nin[-4:]
        worker.nin_last4 = clean_nin[-4:]
        worker.selfie_url = selfie_url
        worker.profile_photo_url = worker.profile_photo_url or selfie_url
        if (worker.kyc_status or "") in ["", "NOT_STARTED", "KYC_NOT_STARTED"]:
            worker.kyc_status = "KYC_PENDING"
        existing_identity = (delivery_worker_review_meta(worker).get("identity_verification") or {})
        identity_status = "verified" if worker.nin_verified and existing_identity.get("status") == "verified" else "manual_review"
        existing_identity.update({
            "status": identity_status,
            "verification_state": identity_status,
            "nin_last4": clean_nin[-4:],
            "selfie_url": selfie_url,
            "filename": selfie.filename,
            "content_type": selfie.content_type or "",
            "selfie_submitted_at": iso(datetime.utcnow()),
            "manual_review_required": identity_status != "verified",
        })
        set_delivery_worker_review_meta(worker, "identity_verification", existing_identity)
        if (worker.worker_type or "").lower() == "rider":
            selfie_hash = hashlib.sha256(str(selfie_url or "").encode("utf-8")).hexdigest()
            duplicate_selfie = bool(db.query(DBRiderDocument).filter(DBRiderDocument.document_type == "selfie", DBRiderDocument.checksum == selfie_hash, DBRiderDocument.delivery_worker_id != worker.id).first())
            _, rider_kyc = ensure_rider_records(db, worker)
            rider_document_upsert(db, worker, "selfie", selfie_url, {"filename": selfie.filename, "content_type": selfie.content_type or ""}, selfie_hash)
            if rider_kyc:
                rider_kyc.selfie_status = "verified"
                rider_kyc.duplicate_selfie = duplicate_selfie
                rider_kyc.selfie_verified_at = datetime.utcnow()
                flags = json_load(rider_kyc.fraud_flags_json, {})
                flags["duplicate_selfie"] = duplicate_selfie
                rider_kyc.fraud_flags_json = json_dump(flags)
            sync_rider_onboarding_state(db, worker, note="Rider selfie submitted")
        worker.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(worker)
        print(f"DELIVERY IDENTITY KYC SUBMITTED worker_id={worker.id} nin_last4={worker.nin_last4}")
        return {
            "success": True,
            "status": "pending_review",
            "pending_review": True,
            "message": "Identity verification submitted for review.",
            "selfie_url": selfie_url,
            "verification": verification_status_response(worker),
            "worker": worker_to_dict(worker),
        }
    finally:
        db.close()


@app.post("/delivery/emergency-contact", status_code=201)
def delivery_emergency_contact(payload: DeliveryEmergencyContactPayload, request: Request):
    db, user, worker = get_delivery_worker_record_for_request(request)
    try:
        full_name = (payload.full_name or "").strip()
        relationship = (payload.relationship or "").strip()
        phone = (payload.phone_number or "").strip()
        alternate_phone = (payload.alternate_phone or "").strip()
        valid_relationships = {"spouse", "parent", "sibling", "friend", "guardian", "other"}

        if len(full_name) < 2:
            raise HTTPException(status_code=422, detail="Emergency contact full name is required.")
        if relationship.lower() not in valid_relationships:
            raise HTTPException(status_code=422, detail="Select a valid emergency contact relationship.")
        if len("".join(ch for ch in phone if ch.isdigit())) < 10:
            raise HTTPException(status_code=422, detail="Enter a valid emergency contact phone number.")
        if alternate_phone and len("".join(ch for ch in alternate_phone if ch.isdigit())) < 10:
            raise HTTPException(status_code=422, detail="Enter a valid alternate phone number.")

        worker.emergency_contact_name = full_name
        worker.emergency_contact_phone = phone
        set_delivery_worker_review_meta(worker, "emergency_contact", {
            "status": "completed",
            "full_name": full_name,
            "relationship": relationship,
            "phone_number": phone,
            "alternate_phone": alternate_phone,
            "submitted_at": iso(datetime.utcnow()),
        })
        auto_activated = maybe_auto_activate_delivery_worker(worker)
        sync_rider_onboarding_state(db, worker, note="Rider emergency contact added")
        worker.updated_at = datetime.utcnow()
        db.commit()
        print(f"DELIVERY EMERGENCY CONTACT SUBMITTED worker_id={worker.id} relationship={relationship}")
        return {
            "success": True,
            "status": "completed",
            "pending_review": False,
            "auto_activated": auto_activated,
            "message": "Emergency contact submitted for review.",
            "verification": verification_status_response(worker),
        }
    finally:
        db.close()


@app.post("/delivery/address-verification", status_code=201)
async def delivery_address_verification(
    request: Request,
    document_type: str = Form(...),
    document: UploadFile = File(...),
):
    db, user, worker = get_delivery_worker_record_for_request(request)
    try:
        clean_type = (document_type or "").strip().lower()
        accepted_types = {
            "utilitybill", "utility_bill",
            "bankstatement", "bank_statement",
            "internetbill", "internet_bill",
            "waterorelectricitybill", "water_or_electricity_bill", "water_electricity_bill",
        }
        if clean_type not in accepted_types:
            raise HTTPException(status_code=422, detail="Accepted documents: utility bill, bank statement, internet bill, water/electricity bill.")
        if not document or not document.filename:
            raise HTTPException(status_code=422, detail="Address verification document is required.")

        document_url = await save_workforce_upload(document, True, "foodnova/workforce/address-documents")
        if not document_url:
            raise HTTPException(status_code=400, detail="Unable to upload address verification document.")

        set_delivery_worker_review_meta(worker, "address_verification", {
            "status": "submitted",
            "document_type": clean_type,
            "document_url": document_url,
            "filename": document.filename,
            "content_type": document.content_type or "",
            "submitted_at": iso(datetime.utcnow()),
        })
        auto_activated = maybe_auto_activate_delivery_worker(worker)
        if (worker.worker_type or "").lower() == "rider":
            rider_document_upsert(db, worker, "address_proof", document_url, {"document_type": clean_type, "filename": document.filename, "content_type": document.content_type or ""})
        sync_rider_onboarding_state(db, worker, note="Rider address proof uploaded")
        worker.updated_at = datetime.utcnow()
        db.commit()
        print(f"DELIVERY ADDRESS VERIFICATION SUBMITTED worker_id={worker.id} document_type={clean_type}")
        return {
            "success": True,
            "status": "submitted",
            "pending_review": False,
            "auto_activated": auto_activated,
            "message": "Address verification document submitted for review.",
            "document_url": document_url,
            "verification": verification_status_response(worker),
        }
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
        if not getattr(user, "is_active", True):
            raise HTTPException(status_code=403, detail="This account has been removed or deactivated.")
        if (user.role or "") in ["messenger", "rider"]:
            worker = db.query(DBDeliveryWorker).filter(DBDeliveryWorker.user_id == user.id).first()
            if worker and getattr(worker, "deleted_at", None):
                raise HTTPException(status_code=403, detail="This account has been removed or deactivated.")
            if worker and (worker.kyc_status or "").upper() in ["SUSPENDED", "DEACTIVATED", "DELETED"]:
                raise HTTPException(status_code=403, detail="This account has been removed or deactivated.")

        ensure_profile(db, user)
        token = create_access_token(user)

        user_data = db_user_to_dict(user)
        if user_data.get("role") in ["messenger", "rider"]:
            worker = db.query(DBDeliveryWorker).filter(DBDeliveryWorker.user_id == user.id).first()
            if worker:
                user_data["delivery_worker"] = worker_to_dict(worker)
                user_data["delivery_worker_type"] = worker.worker_type or user_data.get("role")
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
@app.post("/api/admin/login")
def admin_login(payload: LoginPayload, request: Request):
    global LAST_ADMIN_LOGIN_ERROR, LAST_ADMIN_LOGIN_TRACEBACK, LAST_ADMIN_LOGIN_AT
    email = (payload.email or "").lower().strip()
    db = None
    try:
        print("ADMIN_LOGIN_REQUEST", json_dump({
            "email": email,
            "has_email": bool(email),
            "has_password": bool(payload.password),
            "ip_address": get_request_ip(request),
            "route": request.url.path,
            "timestamp": iso(datetime.utcnow()),
        }))
        if not email:
            print("ADMIN_LOGIN_FAILURE", json_dump({
                "email": "",
                "reason": "email_missing",
                "ip_address": get_request_ip(request),
                "timestamp": iso(datetime.utcnow()),
            }))
            raise HTTPException(status_code=400, detail="Admin email is required")

        print("ADMIN_LOGIN_ATTEMPT", json_dump({
            "email": email,
            "ip_address": get_request_ip(request),
            "route": request.url.path,
            "timestamp": iso(datetime.utcnow()),
        }))
        db = SessionLocal()
        print("ADMIN_USER_LOOKUP", json_dump({
            "email": email,
            "stage": "start",
            "timestamp": iso(datetime.utcnow()),
        }))
        user = get_db_user_by_email(db, email)
        print("ADMIN_USER_LOOKUP", json_dump({
            "email": email,
            "stage": "complete",
            "user_exists": bool(user),
            "user_id": getattr(user, "id", None),
            "role": getattr(user, "role", None),
            "timestamp": iso(datetime.utcnow()),
        }))
        if not user:
            print("ADMIN_LOGIN_FAILURE", json_dump({
                "email": email,
                "reason": "user_not_found",
                "ip_address": get_request_ip(request),
                "timestamp": iso(datetime.utcnow()),
            }))
            raise HTTPException(status_code=401, detail="Invalid admin email or password")
        if (user.role or "") != "admin":
            print("ADMIN_LOGIN_FAILURE", json_dump({
                "email": email,
                "user_id": user.id,
                "reason": "role_not_admin",
                "ip_address": get_request_ip(request),
                "timestamp": iso(datetime.utcnow()),
            }))
            raise HTTPException(status_code=401, detail="Invalid admin email or password")
        print("ADMIN_PASSWORD_VERIFY", json_dump({
            "email": email,
            "user_id": user.id,
            "stage": "start",
            "timestamp": iso(datetime.utcnow()),
        }))
        password_valid = _password_matches(payload.password, user.password)
        print("ADMIN_PASSWORD_VERIFY", json_dump({
            "email": email,
            "user_id": user.id,
            "stage": "complete",
            "password_valid": bool(password_valid),
            "timestamp": iso(datetime.utcnow()),
        }))
        if not password_valid:
            print("ADMIN_LOGIN_FAILURE", json_dump({
                "email": email,
                "user_id": user.id,
                "reason": "invalid_password",
                "ip_address": get_request_ip(request),
                "timestamp": iso(datetime.utcnow()),
            }))
            raise HTTPException(status_code=401, detail="Invalid admin email or password")
        if not getattr(user, "is_active", True):
            print("ADMIN_LOGIN_FAILURE", json_dump({
                "email": email,
                "user_id": user.id,
                "reason": "account_inactive",
                "ip_address": get_request_ip(request),
                "timestamp": iso(datetime.utcnow()),
            }))
            raise HTTPException(status_code=403, detail="Admin account is inactive")

        print("ADMIN_TOKEN_GENERATE", json_dump({
            "email": email,
            "user_id": user.id,
            "stage": "start",
            "jwt_secret_loaded": bool(os.environ.get("JWT_SECRET")),
            "timestamp": iso(datetime.utcnow()),
        }))
        token = create_access_token(user)
        print("ADMIN_TOKEN_GENERATE", json_dump({
            "email": email,
            "user_id": user.id,
            "stage": "complete",
            "token_created": bool(token),
            "timestamp": iso(datetime.utcnow()),
        }))
        user_data = db_user_to_dict(user)
        create_admin_audit_log(request, user_data, "admin_login", "admin", user.id, "Admin logged in")
        print("ADMIN_LOGIN_SUCCESS", json_dump({
            "email": email,
            "user_id": user.id,
            "role": user.role,
            "ip_address": get_request_ip(request),
            "route": request.url.path,
            "timestamp": iso(datetime.utcnow()),
        }))
        LAST_ADMIN_LOGIN_ERROR = ""
        LAST_ADMIN_LOGIN_TRACEBACK = ""
        LAST_ADMIN_LOGIN_AT = iso(datetime.utcnow())
        return auth_response("Admin login successful", user_data, token)
    except HTTPException as error:
        LAST_ADMIN_LOGIN_ERROR = f"HTTPException: {error.detail}"
        LAST_ADMIN_LOGIN_TRACEBACK = traceback.format_exc()
        LAST_ADMIN_LOGIN_AT = iso(datetime.utcnow())
        print("ADMIN_LOGIN_FAILURE", json_dump({
            "email": email,
            "reason": "http_exception",
            "exception_type": type(error).__name__,
            "exception_message": str(error.detail),
            "status_code": error.status_code,
            "traceback": LAST_ADMIN_LOGIN_TRACEBACK,
            "ip_address": get_request_ip(request),
            "route": request.url.path,
            "timestamp": LAST_ADMIN_LOGIN_AT,
        }))
        raise
    except Exception as error:
        LAST_ADMIN_LOGIN_ERROR = f"{type(error).__name__}: {error}"
        LAST_ADMIN_LOGIN_TRACEBACK = traceback.format_exc()
        LAST_ADMIN_LOGIN_AT = iso(datetime.utcnow())
        traceback.print_exception(type(error), error, error.__traceback__)
        print("ADMIN_LOGIN_FAILURE", json_dump({
            "email": email,
            "reason": "unexpected_backend_error",
            "error_type": type(error).__name__,
            "exception_message": str(error),
            "traceback": LAST_ADMIN_LOGIN_TRACEBACK,
            "ip_address": get_request_ip(request),
            "route": request.url.path,
            "timestamp": LAST_ADMIN_LOGIN_AT,
        }))
        raise
    finally:
        if db is not None:
            db.close()


def update_worker_location(worker: DBDeliveryWorker, payload: LocationPingPayload, db) -> bool:
    if not valid_tracking_coordinate(payload.latitude, payload.longitude):
        print("TRACK_RIDER_INVALID_PING", json_dump({
            "worker_id": getattr(worker, "id", None),
            "latitude": payload.latitude,
            "longitude": payload.longitude,
        }))
        raise HTTPException(status_code=400, detail="Invalid rider GPS coordinates")
    print("DISPATCH_GPS_PING", json_dump({
        "worker_id": getattr(worker, "id", None),
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "accuracy": payload.accuracy,
        "heading": payload.heading,
        "speed": payload.speed,
        "timestamp": payload.timestamp,
    }))
    inside_zone = worker_inside_zone(worker, payload.latitude, payload.longitude, db)
    worker.latest_latitude = payload.latitude
    worker.latest_longitude = payload.longitude
    worker.latest_accuracy = payload.accuracy
    worker.latest_heading = payload.heading
    worker.latest_speed = payload.speed
    worker.last_seen_at = as_naive_utc(payload.timestamp) if payload.timestamp else datetime.utcnow()
    worker.inside_zone = inside_zone
    worker.updated_at = datetime.utcnow()
    return inside_zone


def get_current_worker_record(request: Request, expected_type: Optional[str] = None):
    user = require_user(request)
    role = user.get("role")
    if role not in ["messenger", "rider"]:
        raise HTTPException(status_code=403, detail="Delivery worker access required.")
    if expected_type and role != expected_type:
        raise HTTPException(status_code=403, detail=f"{expected_type.title()} access required.")
    db = SessionLocal()
    try:
        worker = db.query(DBDeliveryWorker).filter(DBDeliveryWorker.user_id == user.get("id")).first()
        if not worker:
            print("RIDER_PROFILE_NOT_FOUND", json_dump({"user_id": user.get("id"), "route": "current_worker_record", "timestamp": iso(datetime.utcnow())}))
            raise HTTPException(status_code=404, detail="Delivery worker profile not found.")
        blocked_reason = delivery_worker_access_block_reason(worker)
        if blocked_reason:
            raise HTTPException(status_code=401, detail=blocked_reason)
        return db, user, worker
    except Exception:
        db.close()
        raise


@app.get("/delivery/me")
def delivery_me(request: Request):
    db, user, worker = get_current_worker_record(request)
    try:
        print("RIDER_PROFILE_FETCH", json_dump({
            "worker_id": worker.id,
            "user_id": user.get("id"),
            "approval_status": worker.kyc_status or "KYC_PENDING",
            "timestamp": iso(datetime.utcnow()),
        }))
        print("RIDER_APPROVAL_STATUS", json_dump({"worker_id": worker.id, "status": worker.kyc_status or "KYC_PENDING"}))
        data = worker_to_dict(worker)
        return {"success": True, "user": user, "worker": data, "data": data}
    finally:
        db.close()


@app.get("/delivery/stats")
def delivery_stats(request: Request):
    db, user, worker = get_current_worker_record(request)
    try:
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        assigned_filter = or_(DBOrder.delivery_worker_id == worker.id, DBOrder.rider_id == worker.id)
        orders = active_order_filter(db.query(DBOrder)).filter(assigned_filter).all()
        today_orders = [
            order for order in orders
            if (getattr(order, "delivery_assigned_at", None) or getattr(order, "updated_at", None) or today_start) >= today_start
        ]
        completed_today = [
            order for order in today_orders
            if str(getattr(order, "delivery_status", "") or "").upper() == "DELIVERED"
            or str(getattr(order, "status", "") or "").lower() == "delivered"
        ]
        active_statuses = {"ASSIGNED", "ACCEPTED", "PICKED_UP", "IN_TRANSIT", "ARRIVED"}
        pending_today = [
            order for order in today_orders
            if str(getattr(order, "delivery_status", "") or "").upper() in active_statuses
        ]
        earnings_today = sum(float(getattr(order, "delivery_fee", 0) or 0) for order in completed_today)
        data = {
            "today_earnings": earnings_today,
            "today_deliveries": len(today_orders),
            "completed": len(completed_today),
            "pending": len(pending_today),
            "assigned": len([order for order in orders if str(getattr(order, "delivery_status", "") or "").upper() == "ASSIGNED"]),
            "active": len([order for order in orders if str(getattr(order, "delivery_status", "") or "").upper() in active_statuses]),
            "lifetime_completed": worker.completed_deliveries or 0,
        }
        return {"success": True, "stats": data, "data": data}
    finally:
        db.close()


@app.post("/messenger/go-online")
def messenger_go_online(payload: LocationPingPayload, request: Request):
    db, user, worker = get_current_worker_record(request, "messenger")
    try:
        if promote_verified_approved_rider(worker):
            sync_rider_onboarding_state(db, worker, {"id": "system", "email": "system"}, "Auto-activated verified approved messenger on go-online")
        if rider_lifecycle_status(worker) != "ACTIVE":
            raise HTTPException(status_code=403, detail="Your FoodNova delivery account is under review. You will be notified once approved.")
        if not payload_has_recent_timestamp(payload):
            worker.operational_status = "OFFLINE"
            db.commit()
            raise HTTPException(status_code=400, detail=f"GPS ping must be within {GPS_RECENCY_SECONDS} seconds to go online.")
        inside_zone = update_worker_location(worker, payload, db)
        if not inside_zone:
            worker.operational_status = "OFFLINE"
            db.commit()
            raise HTTPException(status_code=403, detail=MESSENGER_OUTSIDE_ZONE_MESSAGE)
        worker.operational_status = "ONLINE"
        db.commit()
        db.refresh(worker)
        data = worker_to_dict(worker)
        create_admin_audit_log(request, user, "worker_go_online", "delivery_worker", worker.id, f"Messenger {worker.full_name} went online", {"worker": data})
        socket_emit("rider:availability", {"worker": data, "status": "ONLINE"}, room=f"user:{worker.user_id}")
        socket_emit("dispatch:availability", {"worker": data, "status": "ONLINE"}, room=f"role:admin")
        return {"success": True, "worker": data, "data": data}
    finally:
        db.close()


@app.post("/rider/go-online")
def rider_go_online(request: Request, payload: Optional[LocationPingPayload] = None):
    db, user, worker = get_current_worker_record(request, "rider")
    try:
        print("ONLINE_REQUEST", json_dump({
            "worker_id": worker.id,
            "payload_present": payload is not None,
            "latitude": getattr(payload, "latitude", None),
            "longitude": getattr(payload, "longitude", None),
            "timestamp": getattr(payload, "timestamp", None),
        }))
        if promote_verified_approved_rider(worker):
            sync_rider_onboarding_state(db, worker, {"id": "system", "email": "system"}, "Auto-activated verified approved rider on go-online")
        if rider_lifecycle_status(worker) != "ACTIVE":
            raise HTTPException(status_code=403, detail="Your FoodNova delivery account is under review. You will be notified once approved.")
        if not worker_dashboard_access_allowed(worker):
            raise HTTPException(status_code=403, detail="Complete NIN verification, profile, selfie, and document uploads before going online.")
        if payload is None:
            worker.operational_status = "OFFLINE"
            worker.updated_at = datetime.utcnow()
            db.commit()
            raise HTTPException(status_code=400, detail="Enable location services to go online.")
        if not payload_has_recent_timestamp(payload):
            worker.operational_status = "OFFLINE"
            worker.suspicious_gps_gaps = (worker.suspicious_gps_gaps or 0) + 1
            worker.updated_at = datetime.utcnow()
            db.commit()
            raise HTTPException(status_code=400, detail=f"GPS ping must be within {GPS_RECENCY_SECONDS} seconds to go online.")
        update_worker_location(worker, payload, db)
        worker.operational_status = "ONLINE"
        worker.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(worker)
        data = worker_to_dict(worker)
        create_admin_audit_log(request, user, "worker_go_online", "delivery_worker", worker.id, f"Rider {worker.full_name} went online", {"worker": data, "gps_provided": bool(payload), "gps_recent": data.get("gps_recent")})
        socket_emit("rider:availability", {"worker": data, "status": "ONLINE"}, room=f"user:{worker.user_id}")
        socket_emit("dispatch:availability", {"worker": data, "status": "ONLINE"}, room=f"role:admin")
        print("ONLINE_RESPONSE", json_dump({"worker_id": worker.id, "status": worker.operational_status, "gps_recent": data.get("gps_recent")}))
        return {"success": True, "worker": data, "data": data}
    finally:
        db.close()


@app.post("/delivery/go-offline")
def delivery_go_offline(request: Request):
    db, user, worker = get_current_worker_record(request)
    try:
        worker.operational_status = "OFFLINE"
        worker.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(worker)
        data = worker_to_dict(worker)
        create_admin_audit_log(request, user, "worker_go_offline", "delivery_worker", worker.id, f"{worker.worker_type.title()} {worker.full_name} went offline", {"worker": data})
        socket_emit("rider:availability", {"worker": data, "status": "OFFLINE"}, room=f"user:{worker.user_id}")
        socket_emit("dispatch:availability", {"worker": data, "status": "OFFLINE"}, room=f"role:admin")
        return {"success": True, "worker": data, "data": data}
    finally:
        db.close()


@app.post("/delivery/location-ping")
def delivery_location_ping(payload: LocationPingPayload, request: Request):
    db, user, worker = get_current_worker_record(request)
    try:
        if promote_verified_approved_rider(worker):
            sync_rider_onboarding_state(db, worker, {"id": "system", "email": "system"}, "Auto-activated verified approved worker on location ping")
        if rider_lifecycle_status(worker) != "ACTIVE":
            raise HTTPException(status_code=403, detail="Delivery account is not approved.")
        if not worker_dashboard_access_allowed(worker):
            raise HTTPException(status_code=403, detail="Complete onboarding before sending delivery GPS updates.")
        if not payload_has_recent_timestamp(payload):
            raise HTTPException(status_code=400, detail=f"GPS ping must be within {GPS_RECENCY_SECONDS} seconds.")
        inside_zone = update_worker_location(worker, payload, db)
        if (worker.worker_type or "") == "messenger" and worker.operational_status == "ONLINE" and not inside_zone:
            worker.operational_status = "OFFLINE"
        db.commit()
        db.refresh(worker)
        data = worker_to_dict(worker)
        create_admin_audit_log(request, user, "delivery_location_ping", "delivery_worker", worker.id, f"Location ping from {worker.full_name}", {"latitude": payload.latitude, "longitude": payload.longitude, "inside_zone": worker.inside_zone})
        active_orders = active_order_filter(db.query(DBOrder)).filter(
            or_(DBOrder.delivery_worker_id == worker.id, DBOrder.rider_id == worker.id),
            DBOrder.delivery_status.in_(["ASSIGNED", "ACCEPTED", "PICKED_UP", "IN_TRANSIT", "ARRIVED"]),
        ).all()
        location_update = {
            "rider_id": worker.id,
            "latitude": payload.latitude,
            "longitude": payload.longitude,
            "accuracy": payload.accuracy,
            "heading": payload.heading,
            "speed": payload.speed,
            "updatedAt": iso(worker.last_seen_at),
        }
        for active_order in active_orders:
            socket_emit(
                f"rider:location:{active_order.id}",
                {"order_id": active_order.id, "location": location_update},
                room=f"order:{active_order.id}",
            )
            socket_emit(
                f"order:update:{active_order.id}",
                {"order_id": active_order.id, "location": location_update},
                room=f"order:{active_order.id}",
            )
        return {"success": True, "worker": data, "data": data}
    finally:
        db.close()


@app.post("/delivery/panic-alert")
def delivery_panic_alert(payload: LocationPingPayload, request: Request):
    db, user, worker = get_current_worker_record(request)
    try:
        update_worker_location(worker, payload, db)
        db.commit()
        create_admin_audit_log(request, user, "worker_panic_alert", "delivery_worker", worker.id, f"Emergency alert from {worker.full_name}", {"worker": worker_to_dict(worker), "latitude": payload.latitude, "longitude": payload.longitude})
        return {"success": True, "message": "Emergency alert sent to FoodNova admin."}
    finally:
        db.close()


@app.post("/delivery-workers/register-fcm-token")
def register_delivery_worker_fcm_token(payload: FCMTokenPayload, request: Request):
    db, user, worker = get_current_worker_record(request)
    token = (payload.token or "").strip()
    if not token:
        db.close()
        raise HTTPException(status_code=400, detail="FCM token is required")
    try:
        tokens = json_load(getattr(worker, "fcm_tokens_json", None), []) or []
        tokens = [item for item in tokens if item and item != token]
        tokens.insert(0, token)
        worker.fcm_token = token
        worker.fcm_tokens_json = json_dump(tokens[:5])
        worker.updated_at = datetime.utcnow()
        db.commit()
        return {"success": True, "message": "Push notification token registered"}
    finally:
        db.close()


@app.get("/delivery/offers")
def get_worker_delivery_offers(request: Request):
    db, user, worker = get_current_worker_record(request)
    try:
        expired_order_ids = expire_stale_delivery_offers(db)
        for order_id in set(expired_order_ids):
            order = db.query(DBOrder).filter(DBOrder.id == order_id).first()
            if order:
                start_delivery_matching(db, order, request)
        db.commit()
        offers = db.query(DBDeliveryOffer).filter(
            DBDeliveryOffer.worker_id == worker.id,
            DBDeliveryOffer.status.in_(["PENDING", "ACCEPTED", "ASSIGNED"]),
        ).order_by(DBDeliveryOffer.created_at.desc(), DBDeliveryOffer.id.desc()).all()
        items = []
        for offer in offers:
            order = db.query(DBOrder).filter(DBOrder.id == offer.order_id).first()
            items.append(delivery_offer_to_dict(offer, worker, order))
        return {"success": True, "offers": items, "data": items}
    finally:
        db.close()


@app.post("/delivery/offers/{offer_id}/accept")
def accept_delivery_offer(offer_id: int, request: Request):
    db, user, worker = get_current_worker_record(request)
    try:
        expired_order_ids = expire_stale_delivery_offers(db)
        for order_id in set(expired_order_ids):
            order = db.query(DBOrder).filter(DBOrder.id == order_id).first()
            if order:
                start_delivery_matching(db, order, request)
        offer = db.query(DBDeliveryOffer).filter(DBDeliveryOffer.id == offer_id, DBDeliveryOffer.worker_id == worker.id).first()
        if not offer:
            raise HTTPException(status_code=404, detail="Delivery offer not found")
        if offer.status != "PENDING":
            raise HTTPException(status_code=400, detail="Delivery offer is no longer pending")
        if not worker_eligible_for_offer(db, worker, offer.delivery_type, offer.id):
            raise HTTPException(status_code=403, detail="You are no longer eligible for this delivery request")
        offer.status = "ACCEPTED"
        offer.accepted_at = datetime.utcnow()
        offer.updated_at = datetime.utcnow()
        worker.operational_status = "BUSY"
        worker.updated_at = datetime.utcnow()
        order = db.query(DBOrder).filter(DBOrder.id == offer.order_id).first()
        order_data = order_to_dict(order) if order else {"id": offer.order_id, "order_code": offer.order_code}
        worker_type_label = "Rider" if (worker.worker_type or "") == "rider" else "Messenger"
        assignment_mode = get_delivery_assignment_mode(db)
        if assignment_mode == "automatic" and order:
            order_data = assign_delivery_offer_to_order(db, offer, worker, order, request, {"id": None, "full_name": "FoodNova System", "email": "system@foodnova.com.ng"}, automatic=True)
        else:
            _create_admin_notifications(
                f"{worker_type_label} accepted order #{offer.order_code}",
                f"{worker_type_label} accepted order #{offer.order_code}. Confirm assignment.",
                "delivery_offer_accepted",
                "delivery",
                order_data,
            )
        db.commit()
        db.refresh(offer)
        create_admin_audit_log(request, user, "delivery_offer_accepted", "delivery_offer", offer.id, f"{worker.full_name} accepted order {offer.order_code}", {"offer": delivery_offer_to_dict(offer, worker, order)})
        return {"success": True, "offer": delivery_offer_to_dict(offer, worker, order), "data": delivery_offer_to_dict(offer, worker, order)}
    finally:
        db.close()


@app.post("/delivery/offers/{offer_id}/decline")
def decline_delivery_offer(offer_id: int, request: Request, payload: DeliveryOfferActionPayload = None):
    db, user, worker = get_current_worker_record(request)
    try:
        offer = db.query(DBDeliveryOffer).filter(DBDeliveryOffer.id == offer_id, DBDeliveryOffer.worker_id == worker.id).first()
        if not offer:
            raise HTTPException(status_code=404, detail="Delivery offer not found")
        if offer.status == "PENDING":
            offer.status = "DECLINED"
            offer.declined_at = datetime.utcnow()
            offer.updated_at = datetime.utcnow()
            if not worker_has_active_assignment(db, worker, offer.id):
                worker.operational_status = "ONLINE"
                worker.updated_at = datetime.utcnow()
            create_admin_audit_log(request, user, "delivery_offer_declined", "delivery_offer", offer.id, f"{worker.full_name} declined order {offer.order_code}", {"offer": delivery_offer_to_dict(offer, worker)})
            order = db.query(DBOrder).filter(DBOrder.id == offer.order_id).first()
            if order:
                start_delivery_matching(db, order, request)
            db.commit()
        return {"success": True, "message": "Delivery offer declined"}
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


@app.post("/notifications/register-fcm-token")
def register_customer_fcm_token(payload: FCMTokenPayload, request: Request):
    user = require_user(request)
    token = (payload.token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="FCM token is required")
    db = SessionLocal()
    try:
        db_user = db.query(DBUser).filter(DBUser.id == user.get("id")).first()
        if not db_user:
            raise HTTPException(status_code=404, detail="User not found")
        tokens = json_load(getattr(db_user, "fcm_tokens_json", None), []) or []
        tokens = [item for item in tokens if item and item != token]
        tokens.insert(0, token)
        db_user.fcm_token = token
        db_user.fcm_tokens_json = json_dump(tokens[:5])
        db_user.updated_at = datetime.utcnow()
        db.commit()
        return {"success": True, "message": "Push notification token registered"}
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
        classify_and_save_order_delivery(order, db)
        ensure_order_delivery_pin(db, order)

        for item in normalized_items:
            db.add(DBOrderItem(
                order_id=order.id,
                product_id=item.get("product_id"),
                variant_id=item.get("variant_id"),
                variant_weight=item.get("variant_weight", ""),
                sku=item.get("sku", ""),
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


@app.get("/orders/{order_id}/rider-location")
def get_order_rider_location(order_id: int):
    db = SessionLocal()
    try:
        order = active_order_filter(db.query(DBOrder)).filter(DBOrder.id == order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        return order_rider_location_response(order, db)
    finally:
        db.close()


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


def require_workforce_view(request: Request):
    return require_any_permission(request, ["workforce:view", "workforce:manage", "delivery:manage", "riders:manage"])


def require_workforce_manage(request: Request):
    return require_any_permission(request, ["workforce:manage", "delivery:manage", "riders:manage"])


@app.get("/admin/workforce")
def get_delivery_workforce(request: Request, worker_type: Optional[str] = None, status: Optional[str] = None, operational_status: Optional[str] = None, inside_zone: Optional[bool] = None):
    require_workforce_view(request)
    db = SessionLocal()
    try:
        query = db.query(DBDeliveryWorker).filter(DBDeliveryWorker.deleted_at.is_(None))
        if worker_type in ["messenger", "rider"]:
            query = query.filter(DBDeliveryWorker.worker_type == worker_type)
        if status:
            query = query.filter(DBDeliveryWorker.kyc_status == status.upper())
        if operational_status:
            query = query.filter(DBDeliveryWorker.operational_status == operational_status.upper())
        if inside_zone is not None:
            query = query.filter(DBDeliveryWorker.worker_type == "messenger", DBDeliveryWorker.inside_zone == inside_zone)
        workers = []
        for worker in query.order_by(DBDeliveryWorker.created_at.desc(), DBDeliveryWorker.id.desc()).all():
            data = worker_to_dict(worker)
            data["onboarding_progress"] = onboarding_progress_payload(db, worker)
            data["documents"] = rider_documents_map(db, worker)
            identity = data["onboarding_progress"].get("nin_data") or {}
            data["dob"] = identity.get("date_of_birth") or data.get("verified_birthdate") or ""
            data["gender"] = identity.get("gender") or data.get("verified_gender") or ""
            data["address"] = identity.get("address") or data.get("home_address") or ""
            data["nin"] = identity.get("nin") or data.get("masked_nin") or ""
            assigned_order = active_order_filter(db.query(DBOrder)).filter(DBOrder.delivery_worker_id == worker.id, DBOrder.delivery_status == "ASSIGNED").order_by(DBOrder.delivery_assigned_at.desc(), DBOrder.id.desc()).first()
            data["availability_status"] = "BUSY" if assigned_order or worker.operational_status in ["BUSY", "ASSIGNED", "ON_DELIVERY"] else "AVAILABLE" if worker.operational_status == "ONLINE" else "OFFLINE"
            data["active_order"] = order_to_dict(assigned_order) if assigned_order else None
            workers.append(data)
        return {"success": True, "workers": workers, "data": workers}
    finally:
        db.close()


@app.get("/admin/delivery-offers")
def get_admin_delivery_offers(request: Request, status: Optional[str] = None):
    require_any_permission(request, ["workforce:view", "workforce:manage", "delivery:manage", "orders:delivery"])
    db = SessionLocal()
    try:
        expired_order_ids = expire_stale_delivery_offers(db)
        for order_id in set(expired_order_ids):
            order = db.query(DBOrder).filter(DBOrder.id == order_id).first()
            if order:
                start_delivery_matching(db, order, request)
        db.commit()
        query = db.query(DBDeliveryOffer).order_by(DBDeliveryOffer.created_at.desc(), DBDeliveryOffer.id.desc())
        if status:
            query = query.filter(DBDeliveryOffer.status == status.upper())
        else:
            query = query.filter(DBDeliveryOffer.status.in_(["PENDING", "ACCEPTED"]))
        offers = query.all()
        items = []
        for offer in offers:
            worker = db.query(DBDeliveryWorker).filter(DBDeliveryWorker.id == offer.worker_id).first()
            if worker and delivery_worker_access_block_reason(worker) and offer.status in ["PENDING", "ACCEPTED"]:
                continue
            order = db.query(DBOrder).filter(DBOrder.id == offer.order_id).first()
            item = delivery_offer_to_dict(offer, worker, order)
            if order:
                item["order"] = order_to_dict(order)
            items.append(item)
        return {"success": True, "offers": items, "data": items}
    finally:
        db.close()


@app.get("/admin/delivery-assignment-mode")
def get_admin_delivery_assignment_mode(request: Request):
    require_any_permission(request, ["workforce:view", "workforce:manage", "delivery:manage", "orders:delivery"])
    db = SessionLocal()
    try:
        mode = get_delivery_assignment_mode(db)
        return {"success": True, "mode": mode, "data": {"mode": mode}}
    finally:
        db.close()


@app.patch("/admin/delivery-assignment-mode")
def update_admin_delivery_assignment_mode(payload: DeliveryAssignmentModePayload, request: Request):
    admin = require_any_permission(request, ["workforce:manage", "delivery:manage", "orders:delivery"])
    mode = (payload.mode or "").strip().lower()
    if mode not in ["automatic", "manual"]:
        raise HTTPException(status_code=400, detail="Delivery assignment mode must be automatic or manual")
    db = SessionLocal()
    try:
        set_app_setting(db, "delivery_assignment_mode", mode)
        db.commit()
        create_admin_audit_log(request, admin, "delivery_assignment_mode_updated", "app_setting", "delivery_assignment_mode", f"Admin set delivery assignment mode to {mode}", {"mode": mode})
        return {"success": True, "mode": mode, "data": {"mode": mode}}
    finally:
        db.close()


@app.post("/admin/delivery-offers/{offer_id}/assign")
def assign_delivery_offer(offer_id: int, request: Request):
    admin = require_any_permission(request, ["delivery:manage", "orders:delivery"])
    db = SessionLocal()
    try:
        offer = db.query(DBDeliveryOffer).filter(DBDeliveryOffer.id == offer_id).first()
        if not offer:
            raise HTTPException(status_code=404, detail="Delivery offer not found")
        if offer.status != "ACCEPTED":
            raise HTTPException(status_code=400, detail="Worker must accept this offer before assignment")
        order = active_order_filter(db.query(DBOrder)).filter(DBOrder.id == offer.order_id).first()
        worker = db.query(DBDeliveryWorker).filter(DBDeliveryWorker.id == offer.worker_id).first()
        if not order or not worker:
            raise HTTPException(status_code=404, detail="Order or worker not found")
        order_data = assign_delivery_offer_to_order(db, offer, worker, order, request, admin, automatic=False)
        db.commit()
        db.refresh(order)
        db.refresh(worker)
        db.refresh(offer)
        return {"success": True, "offer": delivery_offer_to_dict(offer, worker, order), "order": order_data, "data": order_data}
    finally:
        db.close()


@app.post("/admin/delivery-offers/{offer_id}/reject")
def reject_delivery_offer(offer_id: int, request: Request, payload: DeliveryOfferActionPayload = None):
    admin = require_any_permission(request, ["delivery:manage", "orders:delivery"])
    db = SessionLocal()
    try:
        offer = db.query(DBDeliveryOffer).filter(DBDeliveryOffer.id == offer_id).first()
        if not offer:
            raise HTTPException(status_code=404, detail="Delivery offer not found")
        if offer.status in ["PENDING", "ACCEPTED"]:
            offer.status = "DECLINED"
            offer.updated_at = datetime.utcnow()
        order = active_order_filter(db.query(DBOrder)).filter(DBOrder.id == offer.order_id).first()
        if order:
            start_delivery_matching(db, order, request)
        db.commit()
        create_admin_audit_log(request, admin, "delivery_offer_rejected", "delivery_offer", offer.id, f"Admin rejected delivery offer for order {offer.order_code}", {"reason": payload.reason if payload else ""})
        return {"success": True, "message": "Delivery offer rejected"}
    finally:
        db.close()


@app.get("/admin/workforce/eligible")
def get_eligible_delivery_workforce(request: Request, delivery_type: Optional[str] = "local"):
    require_workforce_view(request)
    requested_type = (delivery_type or "local").strip().lower()
    db = SessionLocal()
    try:
        workers = db.query(DBDeliveryWorker).filter(
            or_(
                DBDeliveryWorker.kyc_status == "ACTIVE",
                and_(DBDeliveryWorker.kyc_status == "APPROVED", DBDeliveryWorker.nin_verified == True),
            ),
            DBDeliveryWorker.deleted_at.is_(None),
        ).all()
        eligible_workers = []
        for worker in workers:
            policy = worker_assignment_policy(worker)
            if not policy["eligible"]:
                continue
            if requested_type in ["local", "short_distance", "hyperlocal"]:
                priority = 0 if (worker.worker_type or "") == "messenger" else 1
            else:
                priority = 0 if (worker.worker_type or "") == "rider" else 1
            data = worker_to_dict(worker)
            data["assignment_priority"] = priority
            eligible_workers.append(data)
        eligible_workers.sort(key=lambda item: (item.get("assignment_priority", 9), -(item.get("trust_score") or 0), item.get("gps_age_seconds") or 999999))
        return {
            "success": True,
            "delivery_type": requested_type,
            "workers": eligible_workers,
            "data": eligible_workers,
        }
    finally:
        db.close()


@app.get("/admin/dispatch-board")
def get_admin_dispatch_board(request: Request):
    require_any_permission(request, ["orders:view", "orders:delivery", "delivery:manage", "workforce:view", "workforce:manage"])
    db = SessionLocal()
    try:
        expire_stale_delivery_offers(db)
        active_orders = active_order_filter(db.query(DBOrder)).filter(
            DBOrder.delivery_method == "delivery",
            DBOrder.order_status.notin_(["delivered", "cancelled"]),
        ).order_by(DBOrder.created_at.desc(), DBOrder.id.desc()).all()
        completed_orders = active_order_filter(db.query(DBOrder)).filter(
            DBOrder.delivery_method == "delivery",
            DBOrder.order_status.in_(["delivered", "cancelled"]),
        ).order_by(DBOrder.updated_at.desc(), DBOrder.id.desc()).limit(50).all()
        queue = {
            "NEW": [],
            "ASSIGNED": [],
            "ACCEPTED": [],
            "PICKED_UP": [],
            "IN_TRANSIT": [],
            "ARRIVED": [],
            "DELIVERED": [],
            "CANCELLED": [],
        }
        for order in active_orders + completed_orders:
            item = dispatch_order_to_dict(order)
            queue.setdefault(item["dispatch_status"], []).append(item)

        riders = []
        for worker in db.query(DBDeliveryWorker).filter(
            DBDeliveryWorker.worker_type.in_(["rider", "messenger"]),
            DBDeliveryWorker.deleted_at.is_(None),
        ).order_by(DBDeliveryWorker.operational_status.asc(), DBDeliveryWorker.full_name.asc()).all():
            data = worker_to_dict(worker)
            data["company"] = getattr(worker, "partner_company", "") or "FoodNova"
            lifecycle_status = rider_lifecycle_status(worker)
            data["status_label"] = "Pending Approval" if lifecycle_status != "ACTIVE" else "Busy" if worker.operational_status in {"BUSY", "ASSIGNED", "ON_DELIVERY"} else "Available" if worker.operational_status == "ONLINE" else "Offline"
            data["current_location"] = {"latitude": getattr(worker, "latest_latitude", None), "longitude": getattr(worker, "latest_longitude", None)}
            data["last_active_time"] = iso(getattr(worker, "last_seen_at", None) or getattr(worker, "updated_at", None))
            riders.append(data)

        offers = []
        for offer in db.query(DBDeliveryOffer).filter(DBDeliveryOffer.status.in_(["PENDING", "ACCEPTED", "ASSIGNED"])).order_by(DBDeliveryOffer.created_at.desc(), DBDeliveryOffer.id.desc()).all():
            worker = db.query(DBDeliveryWorker).filter(DBDeliveryWorker.id == offer.worker_id).first()
            order = db.query(DBOrder).filter(DBOrder.id == offer.order_id).first()
            item = delivery_offer_to_dict(offer, worker, order)
            if order:
                item["order"] = dispatch_order_to_dict(order)
            offers.append(item)

        stats = {status: len(items) for status, items in queue.items()}
        stats.update({
            "online_riders": len([rider for rider in riders if rider.get("operational_status") == "ONLINE"]),
            "available_riders": len([rider for rider in riders if rider.get("status_label") == "Available"]),
            "busy_riders": len([rider for rider in riders if rider.get("status_label") == "Busy"]),
            "pending_approval": len([rider for rider in riders if rider.get("status_label") == "Pending Approval"]),
        })
        db.commit()
        return {"success": True, "queue": queue, "riders": riders, "offers": offers, "stats": stats, "data": {"queue": queue, "riders": riders, "offers": offers, "stats": stats}}
    finally:
        db.close()


@app.post("/admin/dispatch-board/orders/{order_id}/auto-assign")
def admin_dispatch_auto_assign(order_id: int, request: Request):
    admin = require_any_permission(request, ["delivery:manage", "orders:delivery"])
    db = SessionLocal()
    try:
        order = active_order_filter(db.query(DBOrder)).filter(DBOrder.id == order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        classify_and_save_order_delivery(order, db)
        ensure_order_delivery_pin(db, order)
        offer = start_delivery_matching(db, order, request)
        if not offer:
            raise HTTPException(status_code=400, detail="No eligible rider is currently available for this order")
        db.commit()
        worker = db.query(DBDeliveryWorker).filter(DBDeliveryWorker.id == offer.worker_id).first()
        create_admin_audit_log(request, admin, "dispatch_auto_assign_requested", "order", order.id, f"Admin requested auto assignment for {order.order_code}", {"offer_id": offer.id})
        return {"success": True, "offer": delivery_offer_to_dict(offer, worker, order), "order": dispatch_order_to_dict(order), "data": dispatch_order_to_dict(order)}
    finally:
        db.close()


@app.patch("/admin/dispatch-board/orders/{order_id}/cancel")
def admin_dispatch_cancel_order(order_id: int, payload: DeliveryOfferActionPayload, request: Request):
    admin = require_any_permission(request, ["delivery:manage", "orders:delivery"])
    db = SessionLocal()
    try:
        order = active_order_filter(db.query(DBOrder)).filter(DBOrder.id == order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        order.delivery_status = "CANCELLED"
        order.order_status = "cancelled"
        order.fulfillment_status = "cancelled"
        order.status = "cancelled"
        order.cancellation_status = "approved"
        order.cancellation_reason = (payload.reason if payload else "") or order.cancellation_reason or "Cancelled by dispatch admin"
        order.updated_at = datetime.utcnow()
        if order.delivery_worker_id:
            worker = db.query(DBDeliveryWorker).filter(DBDeliveryWorker.id == order.delivery_worker_id).first()
            if worker:
                worker.operational_status = "ONLINE"
                worker.updated_at = datetime.utcnow()
        db.query(DBDeliveryOffer).filter(DBDeliveryOffer.order_id == order.id, DBDeliveryOffer.status.in_(["PENDING", "ACCEPTED", "ASSIGNED"])).update({"status": "DECLINED", "updated_at": datetime.utcnow()}, synchronize_session=False)
        db.commit()
        db.refresh(order)
        data = dispatch_order_to_dict(order)
        _create_order_notification(data, "Delivery Cancelled", f"Delivery for order {order.order_code} has been cancelled.", "delivery_update", "delivery")
        create_admin_audit_log(request, admin, "dispatch_delivery_cancelled", "order", order.id, f"Admin cancelled delivery for {order.order_code}", {"reason": payload.reason if payload else ""})
        return {"success": True, "order": data, "data": data}
    finally:
        db.close()


@app.get("/admin/rider-verification-queue")
def get_rider_verification_queue(
    request: Request,
    status: Optional[str] = None,
    stage: Optional[str] = None,
    search: Optional[str] = None,
):
    require_workforce_view(request)
    db = SessionLocal()
    try:
        worker_types = ["rider", "messenger"]
        count_query = db.query(DBDeliveryWorker).filter(DBDeliveryWorker.worker_type.in_(worker_types))
        all_count_workers = count_query.all()
        counts = {
            "pending": sum(1 for worker in all_count_workers if rider_lifecycle_status(worker) == "ONBOARDING" and not worker.deleted_at),
            "approved": sum(1 for worker in all_count_workers if rider_lifecycle_status(worker) == "ACTIVE" and not worker.deleted_at),
            "rejected": 0,
            "suspended": sum(1 for worker in all_count_workers if (worker.kyc_status or "") == "SUSPENDED" and not worker.deleted_at),
            "deleted": sum(1 for worker in all_count_workers if (worker.kyc_status or "") == "DELETED" or bool(worker.deleted_at)),
        }
        deleted_requested = (status or "").strip().upper() == "DELETED" or (stage or "").strip().lower() == "deleted"
        query = db.query(DBDeliveryWorker).filter(DBDeliveryWorker.worker_type.in_(worker_types))
        if deleted_requested:
            query = query.filter(or_(DBDeliveryWorker.deleted_at.isnot(None), DBDeliveryWorker.kyc_status == "DELETED"))
        else:
            query = query.filter(DBDeliveryWorker.deleted_at.is_(None), DBDeliveryWorker.kyc_status != "DELETED")
        if status:
            wanted = status.strip().upper()
            if wanted in ["PENDING", "ADMIN_REVIEW", "ONBOARDING"]:
                query = query.filter(DBDeliveryWorker.kyc_status.in_(["ONBOARDING", "KYC_PENDING", "PENDING_REVIEW"]))
            elif wanted == "ACTIVE":
                query = query.filter(or_(DBDeliveryWorker.kyc_status == "ACTIVE", and_(DBDeliveryWorker.kyc_status == "APPROVED", DBDeliveryWorker.nin_verified == True)))
            elif wanted == "INACTIVE":
                query = query.filter(DBDeliveryWorker.kyc_status.in_(["INACTIVE", "DEACTIVATED"]))
            elif wanted in ["APPROVED", "REJECTED", "SUSPENDED", "DEACTIVATED", "DELETED"]:
                query = query.filter(DBDeliveryWorker.kyc_status == wanted)
        if search:
            term = f"%{search.strip()}%"
            query = query.filter(or_(DBDeliveryWorker.full_name.ilike(term), DBDeliveryWorker.phone.ilike(term), DBDeliveryWorker.email.ilike(term), DBDeliveryWorker.plate_number.ilike(term)))
        riders = []
        for worker in query.order_by(DBDeliveryWorker.updated_at.desc(), DBDeliveryWorker.created_at.desc()).all():
            detail = rider_detail_payload(db, worker)
            if stage and detail["kyc"].get("onboarding_stage") != stage:
                continue
            riders.append(detail)
        return {"success": True, "riders": riders, "data": riders, "counts": counts, "stages": RIDER_ONBOARDING_STAGES}
    finally:
        db.close()


@app.get("/admin/rider-verification-queue/{worker_id}")
def get_rider_verification_detail(worker_id: int, request: Request):
    require_workforce_view(request)
    db = SessionLocal()
    try:
        worker = db.query(DBDeliveryWorker).filter(DBDeliveryWorker.id == worker_id, DBDeliveryWorker.worker_type.in_(["rider", "messenger"])).first()
        if not worker:
            raise HTTPException(status_code=404, detail="Rider verification profile not found")
        return {"success": True, "rider": rider_detail_payload(db, worker)}
    finally:
        db.close()


@app.post("/admin/rider-verification-queue/{worker_id}/{action}")
def review_rider_verification(worker_id: int, action: str, payload: WorkerReviewPayload, request: Request):
    admin = require_workforce_manage(request)
    action = (action or "").strip().lower().replace("-", "_")
    action_map = {
        "approve": "ACTIVE",
        "reject": "SUSPENDED",
        "request_resubmission": "ONBOARDING",
        "reactivate": "ONBOARDING",
        "suspend": "SUSPENDED",
        "deactivate": "INACTIVE",
        "delete": "DELETED",
        "reset_onboarding": "ONBOARDING",
        "force_logout": "FORCE_LOGOUT",
    }
    if action not in action_map:
        raise HTTPException(status_code=400, detail="Action must be approve, reject, request_resubmission, reactivate, suspend, deactivate, delete, reset_onboarding, or force_logout.")
    db = SessionLocal()
    try:
        worker = db.query(DBDeliveryWorker).filter(DBDeliveryWorker.id == worker_id, DBDeliveryWorker.worker_type.in_(["rider", "messenger"])).first()
        if not worker:
            raise HTTPException(status_code=404, detail="Rider verification profile not found")
        new_status = action_map[action]
        if new_status == "ACTIVE":
            blockers = rider_approval_blockers(db, worker)
            if blockers:
                raise HTTPException(status_code=422, detail="Rider cannot be approved yet: " + " ".join(blockers))
        old_data = rider_detail_payload(db, worker)
        review_note = (payload.review_note or "").strip()
        if new_status == "FORCE_LOGOUT":
            revoked = revoke_rider_sessions(db, worker, admin, review_note or "Admin forced logout")
            db.add(DBAdminReview(
                delivery_worker_id=worker.id,
                admin_id=admin.get("id"),
                admin_name=admin.get("full_name") or admin.get("email") or "Admin",
                action=action,
                reason=review_note,
                metadata_json=json_dump({"revoked_sessions": revoked}),
            ))
            worker.operational_status = "OFFLINE"
            worker.updated_at = datetime.utcnow()
            db.commit()
            data = rider_detail_payload(db, worker)
            create_admin_audit_log(request, admin, "rider_force_logout", "delivery_worker", worker.id, f"Admin forced logout for rider {worker.full_name}", {"revoked_sessions": revoked})
            return {"success": True, "rider": data, "data": data, "revoked_sessions": revoked}

        if new_status == "DELETED":
            revoked = revoke_rider_sessions(db, worker, admin, review_note or "Rider deleted")
            worker.operational_status = "OFFLINE"
            worker.kyc_status = "DELETED"
            worker.deleted_at = datetime.utcnow()
            worker.deleted_by_admin_id = admin.get("id")
            worker.deleted_reason = review_note
            worker.fcm_token = ""
            worker.fcm_tokens_json = "[]"
            db_user = db.query(DBUser).filter(DBUser.id == worker.user_id).first()
            if db_user:
                db_user.is_active = False
                db_user.updated_at = datetime.utcnow()
            db.add(DBDeletedRiderLog(
                delivery_worker_id=worker.id,
                admin_id=admin.get("id"),
                admin_name=admin.get("full_name") or admin.get("email") or "Admin",
                reason=review_note,
                snapshot_json=json_dump({
                    "rider": old_data,
                    "deleted_at": iso(worker.deleted_at),
                    "deleted_by": admin.get("id"),
                    "revoked_sessions": revoked,
                    "ip": get_request_ip(request),
                    "device": parse_user_agent(request.headers.get("user-agent", "")),
                }),
                hard_deleted=False,
            ))
        elif action == "reset_onboarding":
            revoke_rider_sessions(db, worker, admin, review_note or "KYC reset")
            worker.kyc_status = "ONBOARDING"
            worker.operational_status = "OFFLINE"
            worker.nin_verified = False
            worker.nin_report_id = ""
            worker.nin_last4 = ""
            worker.review_note = json_dump({"admin_override": {"status": "ONBOARDING", "note": review_note, "admin_id": admin.get("id"), "admin_name": admin.get("full_name") or admin.get("email") or "Admin", "updated_at": iso(datetime.utcnow())}})
            kyc = db.query(DBRiderKyc).filter(DBRiderKyc.delivery_worker_id == worker.id).first()
            if kyc:
                kyc.current_step = 1
                kyc.onboarding_stage = "account_created"
                kyc.identity_status = "not_started"
                kyc.address_status = "not_started"
                kyc.emergency_status = "not_started"
                kyc.selfie_status = "not_started"
                kyc.admin_review_status = "pending"
                kyc.nin_hash = ""
                kyc.submitted_nin = ""
                kyc.nin_last4 = ""
                kyc.nin_verified = False
                kyc.nin_provider_report_id = ""
                kyc.nin_provider_status = ""
                kyc.nin_provider_message = ""
                kyc.nin_response_json = "{}"
                kyc.verification_attempt_count = 0
                kyc.last_verification_at = None
                kyc.rejection_reason = ""
                kyc.resubmission_requested = True
        else:
            worker.kyc_status = new_status
        if new_status == "ACTIVE":
            worker.operational_status = "OFFLINE"
            worker.approved_at = datetime.utcnow()
            worker.approved_by_admin_id = admin.get("id")
            worker.approved_by_admin_name = admin.get("full_name") or admin.get("email") or "Admin"
            worker.suspended_at = None
        elif new_status == "SUSPENDED":
            revoke_rider_sessions(db, worker, admin, review_note or "Rider suspended")
            worker.operational_status = "OFFLINE"
            worker.suspended_at = datetime.utcnow()
        elif new_status == "INACTIVE":
            revoke_rider_sessions(db, worker, admin, review_note or "Rider deactivated")
            worker.operational_status = "OFFLINE"
            worker.deactivated_at = datetime.utcnow()
        else:
            worker.operational_status = "OFFLINE"
        meta = delivery_worker_review_meta(worker)
        meta["admin_override"] = {"status": new_status, "note": review_note, "admin_id": admin.get("id"), "admin_name": admin.get("full_name") or admin.get("email") or "Admin", "updated_at": iso(datetime.utcnow())}
        if action == "reject":
            meta["rejection_reason"] = review_note
        worker.review_note = json_dump(meta)
        worker.updated_at = datetime.utcnow()
        _, rider_kyc = ensure_rider_records(db, worker)
        if rider_kyc:
            rider_kyc.rejection_reason = review_note if action == "reject" else rider_kyc.rejection_reason
            rider_kyc.resubmission_requested = new_status == "ONBOARDING"
            rider_kyc.admin_reviewed_at = datetime.utcnow()
            if new_status == "DELETED":
                rider_kyc.onboarding_stage = "deleted"
                rider_kyc.admin_review_status = "deleted"
        db.add(DBAdminReview(
            delivery_worker_id=worker.id,
            admin_id=admin.get("id"),
            admin_name=admin.get("full_name") or admin.get("email") or "Admin",
            action=action,
            reason=review_note,
            metadata_json=json_dump({"status": new_status}),
        ))
        sync_rider_onboarding_state(db, worker, admin, f"Rider verification {action}")
        db.commit()
        db.refresh(worker)
        data = rider_detail_payload(db, worker)
        create_admin_audit_log(request, admin, f"rider_verification_{action}", "delivery_worker", worker.id, f"Admin {action.replace('_', ' ')} for rider {worker.full_name}", {"before": old_data, "after": data})
        audit_event = {
            "approve": "RIDER_APPROVED",
            "reject": "RIDER_REJECTED",
            "suspend": "RIDER_SUSPENDED",
            "reactivate": "RIDER_REACTIVATED",
            "request_resubmission": "RIDER_REACTIVATED",
            "delete": "RIDER_DELETED",
        }.get(action, "RIDER_STATUS_UPDATED")
        print(audit_event, json_dump({
            "worker_id": worker.id,
            "status": worker.kyc_status,
            "admin_id": admin.get("id"),
            "action": action,
            "timestamp": iso(datetime.utcnow()),
        }))
        return {"success": True, "rider": data, "data": data}
    finally:
        db.close()


@app.delete("/admin/rider-verification-queue/{worker_id}")
def permanently_delete_rider(worker_id: int, request: Request):
    admin = require_workforce_manage(request)
    db = SessionLocal()
    try:
        worker = db.query(DBDeliveryWorker).filter(DBDeliveryWorker.id == worker_id, DBDeliveryWorker.worker_type.in_(["rider", "messenger"])).first()
        if not worker:
            raise HTTPException(status_code=404, detail="Rider verification profile not found")
        old_data = rider_detail_payload(db, worker)
        worker_name = worker.full_name or f"Rider #{worker.id}"
        user_id = worker.user_id
        revoked_sessions = revoke_rider_sessions(db, worker, admin, "Rider permanently deleted")
        released_orders = db.query(DBOrder).filter(
            DBOrder.delivery_worker_id == worker.id,
            DBOrder.order_status.notin_(["delivered", "cancelled"]),
        ).all()
        for order in released_orders:
            order.delivery_worker_id = None
            order.delivery_worker_type = ""
            order.delivery_status = ""
            order.rider_name = ""
            order.rider_phone = ""
            order.rider_vehicle_type = ""
            order.rider_vehicle_number = ""
            order.updated_at = datetime.utcnow()
        offer_count = db.query(DBDeliveryOffer).filter(DBDeliveryOffer.worker_id == worker.id).count()
        db.add(DBDeletedRiderLog(
            delivery_worker_id=worker.id,
            admin_id=admin.get("id"),
            admin_name=admin.get("full_name") or admin.get("email") or "Admin",
            reason="Permanent admin deletion",
            snapshot_json=json_dump({
                "rider": old_data,
                "deleted_at": iso(datetime.utcnow()),
                "deleted_by": admin.get("id"),
                "revoked_sessions": revoked_sessions,
                "released_order_ids": [order.id for order in released_orders],
                "removed_delivery_offers": offer_count,
                "ip": get_request_ip(request),
                "device": parse_user_agent(request.headers.get("user-agent", "")),
            }),
            hard_deleted=True,
        ))
        db.query(DBDeliveryOffer).filter(DBDeliveryOffer.worker_id == worker.id).delete(synchronize_session=False)
        db.query(DBRiderDocument).filter(DBRiderDocument.delivery_worker_id == worker.id).delete(synchronize_session=False)
        db.query(DBRiderStatusLog).filter(DBRiderStatusLog.delivery_worker_id == worker.id).delete(synchronize_session=False)
        db.query(DBVerificationLog).filter(DBVerificationLog.delivery_worker_id == worker.id).delete(synchronize_session=False)
        db.query(DBRiderSession).filter(DBRiderSession.delivery_worker_id == worker.id).delete(synchronize_session=False)
        db.query(DBAdminReview).filter(DBAdminReview.delivery_worker_id == worker.id).delete(synchronize_session=False)
        db.query(DBRiderKyc).filter(DBRiderKyc.delivery_worker_id == worker.id).delete(synchronize_session=False)
        db.query(DBRider).filter(DBRider.delivery_worker_id == worker.id).delete(synchronize_session=False)
        db.delete(worker)
        db.query(DBAddress).filter(DBAddress.user_id == user_id).delete(synchronize_session=False)
        db.query(DBProfile).filter(DBProfile.user_id == user_id).delete(synchronize_session=False)
        user = db.query(DBUser).filter(DBUser.id == user_id).first()
        if user:
            db.delete(user)
        db.commit()
        print("RIDER_DELETED", json_dump({
            "worker_id": worker_id,
            "user_id": user_id,
            "admin_id": admin.get("id"),
            "hard_deleted": True,
            "revoked_sessions": revoked_sessions,
            "released_orders": len(released_orders),
            "removed_delivery_offers": offer_count,
            "timestamp": iso(datetime.utcnow()),
        }))
        create_admin_audit_log(
            request,
            admin,
            "rider_deleted",
            "delivery_worker",
            worker_id,
            f"Admin permanently deleted rider {worker_name}",
            {"before": old_data, "hard_deleted": True, "revoked_sessions": revoked_sessions, "released_orders": len(released_orders), "removed_delivery_offers": offer_count},
        )
        return {"success": True, "message": "Rider permanently deleted", "deleted_worker_id": worker_id, "released_orders": len(released_orders), "removed_delivery_offers": offer_count}
    finally:
        db.close()


@app.patch("/admin/workforce/{worker_id}/status")
def review_delivery_worker(worker_id: int, payload: WorkerReviewPayload, request: Request):
    admin = require_workforce_manage(request)
    new_status = (payload.status or "").strip().upper()
    legacy_status_map = {
        "APPROVED": "ACTIVE",
        "REJECTED": "SUSPENDED",
        "DEACTIVATED": "INACTIVE",
        "KYC_PENDING": "ONBOARDING",
        "PENDING_REVIEW": "ONBOARDING",
    }
    new_status = legacy_status_map.get(new_status, new_status)
    if new_status not in ["ACTIVE", "INACTIVE", "SUSPENDED", "DELETED", "ONBOARDING"]:
        raise HTTPException(status_code=400, detail="Invalid worker status")
    db = SessionLocal()
    try:
        worker = db.query(DBDeliveryWorker).filter(DBDeliveryWorker.id == worker_id).first()
        if not worker:
            raise HTTPException(status_code=404, detail="Delivery worker not found")
        old_data = worker_to_dict(worker)
        if (worker.worker_type or "").lower() in ["rider", "messenger"] and new_status == "ACTIVE":
            blockers = rider_approval_blockers(db, worker)
            if blockers:
                raise HTTPException(status_code=422, detail="Rider cannot be approved yet: " + " ".join(blockers))
        review_meta = delivery_worker_review_meta(worker)
        if payload.review_note is not None:
            review_meta["admin_override"] = {
                "status": new_status,
                "note": (payload.review_note or "").strip(),
                "admin_id": admin.get("id"),
                "admin_name": admin.get("full_name") or admin.get("email") or "Admin",
                "updated_at": iso(datetime.utcnow()),
            }
        worker.kyc_status = new_status
        worker.review_note = json_dump(review_meta)
        if new_status == "ACTIVE":
            worker.approved_at = datetime.utcnow()
            worker.approved_by_admin_id = admin.get("id")
            worker.approved_by_admin_name = admin.get("full_name") or admin.get("email") or "Admin"
            worker.suspended_at = None
        if new_status in ["SUSPENDED", "INACTIVE", "DELETED"]:
            worker.operational_status = "OFFLINE"
            if new_status == "SUSPENDED":
                worker.suspended_at = datetime.utcnow()
            if new_status == "INACTIVE":
                worker.deactivated_at = datetime.utcnow()
            if new_status == "DELETED":
                worker.deleted_at = datetime.utcnow()
                worker.deleted_by_admin_id = admin.get("id")
                worker.deleted_reason = (payload.review_note or "").strip()
                worker.fcm_token = ""
                worker.fcm_tokens_json = "[]"
                db_user = db.query(DBUser).filter(DBUser.id == worker.user_id).first()
                if db_user:
                    db_user.is_active = False
                    db_user.updated_at = datetime.utcnow()
            if (worker.worker_type or "").lower() == "rider":
                revoked = revoke_rider_sessions(db, worker, admin, f"Rider {new_status.lower()}")
                if new_status == "DELETED":
                    db.add(DBDeletedRiderLog(
                        delivery_worker_id=worker.id,
                        admin_id=admin.get("id"),
                        admin_name=admin.get("full_name") or admin.get("email") or "Admin",
                        reason=(payload.review_note or "").strip(),
                        snapshot_json=json_dump({
                            "rider": old_data,
                            "deleted_at": iso(worker.deleted_at),
                            "deleted_by": admin.get("id"),
                            "revoked_sessions": revoked,
                            "ip": get_request_ip(request),
                            "device": parse_user_agent(request.headers.get("user-agent", "")),
                        }),
                        hard_deleted=False,
                    ))
        if new_status == "ONBOARDING":
            worker.operational_status = "OFFLINE"
        worker.updated_at = datetime.utcnow()
        if (worker.worker_type or "").lower() in ["rider", "messenger"]:
            _, rider_kyc = ensure_rider_records(db, worker)
            if rider_kyc:
                rider_kyc.resubmission_requested = new_status == "ONBOARDING"
                rider_kyc.admin_reviewed_at = datetime.utcnow()
                if new_status == "DELETED":
                    rider_kyc.onboarding_stage = "deleted"
                    rider_kyc.admin_review_status = "deleted"
            db.add(DBAdminReview(
                delivery_worker_id=worker.id,
                admin_id=admin.get("id"),
                admin_name=admin.get("full_name") or admin.get("email") or "Admin",
                action=new_status.lower(),
                reason=(payload.review_note or "").strip(),
                metadata_json=json_dump({"previous": old_data.get("kyc_status"), "new": new_status}),
            ))
            sync_rider_onboarding_state(db, worker, admin, f"Admin set rider to {new_status}")
        db.commit()
        db.refresh(worker)
        data = worker_to_dict(worker)
        action = {
            "ACTIVE": "worker_approved",
            "SUSPENDED": "worker_suspended",
            "INACTIVE": "worker_deactivated",
            "DELETED": "worker_deleted",
            "ONBOARDING": "worker_reactivated",
        }.get(new_status, "worker_status_updated")
        create_admin_audit_log(request, admin, action, "delivery_worker", worker.id, f"Admin set {worker.full_name} to {new_status}", {"before": old_data, "after": data})
        return {"success": True, "worker": data, "data": data}
    finally:
        db.close()


@app.get("/admin/delivery-zone")
def get_delivery_zone(request: Request):
    require_workforce_view(request)
    db = SessionLocal()
    try:
        zone = ensure_default_operational_zone(db)
        data = operational_zone_to_dict(zone)
        return {"success": True, "zone": data, "data": data}
    finally:
        db.close()


@app.patch("/admin/delivery-zone")
def update_delivery_zone(payload: OperationalZonePayload, request: Request):
    admin = require_workforce_manage(request)
    db = SessionLocal()
    try:
        zone = ensure_default_operational_zone(db)
        old_data = operational_zone_to_dict(zone)
        zone.zone_name = (payload.zone_name or "FoodNova Local Zone").strip()
        zone.center_latitude = payload.center_latitude
        zone.center_longitude = payload.center_longitude
        zone.radius_meters = max(50, int(payload.radius_meters or 0))
        zone.is_active = payload.is_active is not False
        zone.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(zone)
        data = operational_zone_to_dict(zone)
        create_admin_audit_log(request, admin, "delivery_zone_updated", "operational_zone", zone.id, "Admin updated delivery operational zone", {"before": old_data, "after": data})
        return {"success": True, "zone": data, "data": data}
    finally:
        db.close()


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


def normalized_bulk_order_ids(order_ids: List[int]) -> List[int]:
    ids = []
    seen = set()
    for raw_id in order_ids or []:
        try:
            order_id = int(raw_id)
        except (TypeError, ValueError):
            continue
        if order_id > 0 and order_id not in seen:
            ids.append(order_id)
            seen.add(order_id)
    return ids[:1000]


def apply_bulk_order_status(order: DBOrder, status: str, db) -> bool:
    old_values = (order.status, order.order_status, order.fulfillment_status)
    if status == "processing":
        order.status = "processing"
        order.order_status = "processing"
        order.fulfillment_status = "processing"
        if (order.delivery_method or "delivery") == "delivery":
            classify_and_save_order_delivery(order, db)
    elif status == "out_for_delivery":
        order.status = "out_for_delivery"
        order.order_status = "out_for_delivery"
        order.fulfillment_status = "out_for_delivery"
        if (order.delivery_method or "delivery") == "delivery":
            ensure_order_delivery_pin(db, order)
        order.delivery_started_at = order.delivery_started_at or datetime.utcnow()
    elif status == "delivered":
        order.status = "delivered"
        order.order_status = "delivered"
        order.fulfillment_status = "delivered"
        order.delivery_completed_at = order.delivery_completed_at or datetime.utcnow()
    else:
        raise HTTPException(status_code=400, detail="Invalid bulk status")
    order.updated_at = datetime.utcnow()
    return old_values != (order.status, order.order_status, order.fulfillment_status)


@app.post("/admin/orders/bulk-delete")
def bulk_delete_admin_orders(payload: BulkOrderIdsPayload, request: Request):
    admin = require_permission(request, "orders:delete")
    order_ids = normalized_bulk_order_ids(payload.orderIds)
    db = SessionLocal()
    try:
        if not order_ids:
            return {"success": True, "processed": 0, "failed": 0, "invalidOrderIds": []}
        orders = active_order_filter(db.query(DBOrder)).filter(DBOrder.id.in_(order_ids)).all()
        found_ids = {order.id for order in orders}
        invalid_ids = [order_id for order_id in order_ids if order_id not in found_ids]
        now = datetime.utcnow()
        processed_ids = []
        for order in orders:
            order.is_deleted = True
            order.deleted_at = now
            order.deleted_by_admin_id = admin.get("id")
            order.deleted_by_admin_name = admin.get("full_name") or admin.get("email") or "Admin"
            order.updated_at = now
            processed_ids.append(order.id)
        db.commit()
        create_admin_audit_log(
            request,
            admin,
            "orders_bulk_deleted",
            "order",
            "bulk",
            f"Admin bulk deleted {len(processed_ids)} orders",
            {"order_ids": processed_ids, "invalid_order_ids": invalid_ids, "timestamp": iso(now)},
        )
        return {
            "success": True,
            "processed": len(processed_ids),
            "failed": len(invalid_ids),
            "orderIds": processed_ids,
            "invalidOrderIds": invalid_ids,
        }
    finally:
        db.close()


@app.post("/admin/orders/bulk-status")
def bulk_update_admin_order_status(payload: BulkOrderStatusPayload, request: Request):
    admin = require_permission(request, "orders:update")
    order_ids = normalized_bulk_order_ids(payload.orderIds)
    status_input = (payload.status or "").strip().lower()
    status_map = {
        "processing": "processing",
        "bulk_mark_processing": "processing",
        "out_for_delivery": "out_for_delivery",
        "out for delivery": "out_for_delivery",
        "OUT_FOR_DELIVERY".lower(): "out_for_delivery",
        "delivered": "delivered",
    }
    status = status_map.get(status_input, status_input)
    if status not in {"processing", "out_for_delivery", "delivered"}:
        raise HTTPException(status_code=400, detail="Invalid bulk status")
    db = SessionLocal()
    try:
        if not order_ids:
            return {"success": True, "processed": 0, "failed": 0, "invalidOrderIds": []}
        orders = active_order_filter(db.query(DBOrder)).filter(DBOrder.id.in_(order_ids)).all()
        found_ids = {order.id for order in orders}
        invalid_ids = [order_id for order_id in order_ids if order_id not in found_ids]
        processed_ids = []
        changed_ids = []
        now = datetime.utcnow()
        for order in orders:
            if apply_bulk_order_status(order, status, db):
                changed_ids.append(order.id)
            processed_ids.append(order.id)
        db.commit()
        create_admin_audit_log(
            request,
            admin,
            "orders_bulk_status_updated",
            "order",
            "bulk",
            f"Admin bulk marked {len(processed_ids)} orders as {status}",
            {"order_ids": processed_ids, "changed_order_ids": changed_ids, "invalid_order_ids": invalid_ids, "status": status, "timestamp": iso(now)},
        )
        return {
            "success": True,
            "processed": len(processed_ids),
            "failed": len(invalid_ids),
            "orderIds": processed_ids,
            "invalidOrderIds": invalid_ids,
        }
    finally:
        db.close()


@app.post("/admin/orders/bulk-assign-rider")
def bulk_assign_rider_to_orders(payload: BulkAssignRiderPayload, request: Request):
    admin = require_any_permission(request, ["delivery:manage", "orders:delivery"])
    order_ids = normalized_bulk_order_ids(payload.orderIds)
    db = SessionLocal()
    try:
        rider = db.query(DBDeliveryWorker).filter(
            DBDeliveryWorker.id == payload.rider_id,
            DBDeliveryWorker.deleted_at.is_(None),
            DBDeliveryWorker.kyc_status != "DELETED",
        ).first()
        if not rider:
            linked_payload_rider = db.query(DBRider).filter(DBRider.id == payload.rider_id).first()
            if linked_payload_rider:
                rider = db.query(DBDeliveryWorker).filter(
                    DBDeliveryWorker.id == linked_payload_rider.delivery_worker_id,
                    DBDeliveryWorker.deleted_at.is_(None),
                    DBDeliveryWorker.kyc_status != "DELETED",
                ).first()
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found")
        linked_rider = db.query(DBRider).filter(DBRider.delivery_worker_id == rider.id).first()
        lifecycle_status = "ACTIVE" if (rider.kyc_status or "").upper() == "ACTIVE" else rider_lifecycle_status(rider, (linked_rider.status if linked_rider else "") or "")
        if lifecycle_status != "ACTIVE":
            raise HTTPException(status_code=400, detail="Rider must be ACTIVE before assignment")
        if not order_ids:
            return {"success": True, "processed": 0, "failed": 0, "invalidOrderIds": []}
        orders = active_order_filter(db.query(DBOrder)).filter(DBOrder.id.in_(order_ids)).all()
        found_ids = {order.id for order in orders}
        invalid_ids = [order_id for order_id in order_ids if order_id not in found_ids]
        processed_ids = []
        now = datetime.utcnow()
        for order in orders:
            ensure_order_delivery_pin(db, order)
            order.delivery_worker_id = rider.id
            order.delivery_worker_type = rider.worker_type or "rider"
            order.delivery_status = "ASSIGNED"
            order.rider_id = rider.id
            order.rider_name = rider.full_name
            order.rider_phone = rider.phone
            order.rider_vehicle_type = rider.vehicle_type or ""
            order.rider_vehicle_number = rider.plate_number or ""
            order.delivery_note = payload.delivery_note or ""
            order.delivery_assigned_at = now
            if payload.mark_out_for_delivery:
                order.status = "out_for_delivery"
                order.order_status = "out_for_delivery"
                order.fulfillment_status = "out_for_delivery"
                order.delivery_status = "IN_TRANSIT"
                order.delivery_started_at = order.delivery_started_at or now
                ensure_order_delivery_pin(db, order)
            order.updated_at = now
            processed_ids.append(order.id)
        if processed_ids:
            rider.operational_status = "BUSY"
            rider.updated_at = now
            _create_user_notification(
                rider.email,
                "New Delivery Assigned",
                f"{len(processed_ids)} FoodNova order{'s' if len(processed_ids) != 1 else ''} assigned to you.",
                "delivery_assigned",
                "delivery",
                order_to_dict(orders[0]) if orders else None,
            )
        db.commit()
        rider_data = worker_to_dict(rider)
        create_admin_audit_log(
            request,
            admin,
            "orders_bulk_rider_assigned",
            "order",
            "bulk",
            f"Admin bulk assigned rider {rider.full_name} to {len(processed_ids)} orders",
            {
                "order_ids": processed_ids,
                "invalid_order_ids": invalid_ids,
                "rider": rider_data,
                "delivery_note": payload.delivery_note or "",
                "mark_out_for_delivery": bool(payload.mark_out_for_delivery),
                "timestamp": iso(now),
            },
        )
        return {
            "success": True,
            "processed": len(processed_ids),
            "failed": len(invalid_ids),
            "orderIds": processed_ids,
            "invalidOrderIds": invalid_ids,
            "rider": rider_data,
        }
    finally:
        db.close()


@app.get("/admin/riders")
def get_riders(request: Request, include_deleted: bool = False, status: Optional[str] = None):
    require_any_permission(request, ["delivery:manage", "orders:delivery", "riders:manage", "workforce:view", "workforce:manage"])
    db = SessionLocal()
    try:
        requested_status = (status or "").strip().lower()
        print("ASSIGN_RIDER_REQUEST", json_dump({
            "endpoint": "/admin/riders",
            "status_filter": requested_status or "all",
            "include_deleted": bool(include_deleted),
            "query_params": dict(request.query_params),
        }))
        print("ASSIGNABLE_RIDERS_QUERY", json_dump({
            "endpoint": "/admin/riders",
            "status_filter": status or "all",
            "include_deleted": bool(include_deleted),
            "models": ["DeliveryWorker", "Rider"],
            "base_filters": {
                "soft_deleted_excluded": not bool(include_deleted),
                "deleted_status_excluded": not bool(include_deleted),
            },
            "active_status_rule": {
                "delivery_workers.kyc_status": ["ACTIVE"],
                "isDeleted": False,
                "nin_verified_required_for_assignment": False,
                "online_required": False,
                "available_required": False,
            },
        }))
        query = db.query(DBDeliveryWorker).outerjoin(DBRider, DBRider.delivery_worker_id == DBDeliveryWorker.id)
        if include_deleted or (status or "").lower() == "deleted":
            query = query.filter(or_(DBDeliveryWorker.deleted_at.isnot(None), DBDeliveryWorker.kyc_status == "DELETED"))
        else:
            query = query.filter(DBDeliveryWorker.deleted_at.is_(None), DBDeliveryWorker.kyc_status != "DELETED")
        if status and (status or "").lower() not in ["all", "deleted"]:
            status_map = {
                "onboarding": ["ONBOARDING", "PENDING_REVIEW", "KYC_PENDING"],
                "pending": ["ONBOARDING", "PENDING_REVIEW", "KYC_PENDING"],
                "pending_review": ["ONBOARDING", "PENDING_REVIEW", "KYC_PENDING"],
                "inactive": ["INACTIVE", "DEACTIVATED"],
                "suspended": ["SUSPENDED"],
                "rejected": ["SUSPENDED", "REJECTED"],
                "deactivated": ["INACTIVE", "DEACTIVATED"],
            }
            if requested_status in ["active", "approved"]:
                query = query.filter(DBDeliveryWorker.kyc_status == "ACTIVE")
            else:
                wanted_values = status_map.get(requested_status, [(status or "").upper()])
                query = query.filter(DBDeliveryWorker.kyc_status.in_(wanted_values))
        riders = []
        worker_rows = query.order_by(DBDeliveryWorker.kyc_status.asc(), DBDeliveryWorker.full_name.asc()).all()
        changed_statuses = False
        for worker in worker_rows:
            linked_rider = db.query(DBRider).filter(DBRider.delivery_worker_id == worker.id).first()
            if promote_verified_approved_rider(worker):
                changed_statuses = True
                sync_rider_onboarding_state(db, worker, {"id": "system", "email": "system"}, "Auto-activated verified approved rider")
            data = worker_to_dict(worker)
            rider_status = (linked_rider.status if linked_rider else "") or ""
            raw_worker_status = data.get("kyc_status") or "ONBOARDING"
            lifecycle_status = "DELETED" if data.get("deleted_at") else "ACTIVE" if requested_status in ["active", "approved"] and (worker.kyc_status or "").upper() == "ACTIVE" else rider_lifecycle_status(worker, rider_status)
            data.update({
                "raw_kyc_status": raw_worker_status,
                "kyc_status": lifecycle_status,
                "status": lifecycle_status,
                "rider_id": worker.id,
                "database_rider_id": linked_rider.id if linked_rider else None,
                "nin_status": "verified" if data.get("nin_verified") else "not_verified",
                "approval_status": lifecycle_status,
                "rider_table_status": rider_status,
                "vehicle_number": data.get("plate_number") or "",
                "source": "delivery_workers",
            })
            riders.append(data)
        if changed_statuses:
            db.commit()
        print("ASSIGNABLE_RIDERS_FOUND", json_dump([
            {
                "id": item.get("id"),
                "rider_id": item.get("rider_id"),
                "name": item.get("full_name") or item.get("name"),
                "status": item.get("status"),
                "raw_kyc_status": item.get("raw_kyc_status"),
                "deleted_at": item.get("deleted_at"),
            }
            for item in riders
        ]))
        print("ASSIGNABLE_RIDERS_COUNT", json_dump({
            "count": len(riders),
            "ids": [item.get("id") for item in riders],
            "names": [item.get("full_name") or item.get("name") for item in riders],
        }))
        print("ADMIN_RIDERS_FETCH", json_dump({
            "total_riders_found": len(worker_rows),
            "rider_ids_returned": [item.get("id") for item in riders],
            "rider_status_values_returned": [
                {"id": item.get("id"), "status": item.get("status"), "kyc_status": item.get("kyc_status"), "raw_kyc_status": item.get("raw_kyc_status"), "rider_table_status": item.get("rider_table_status")}
                for item in riders
            ],
            "status_filter": status or "all",
            "include_deleted": bool(include_deleted),
            "source": "delivery_workers+riders",
        }))
        print("ASSIGNABLE_RIDERS_RESULT", json_dump({
            "total_riders_found": len(worker_rows),
            "riders": [
                {
                    "rider_id": item.get("id"),
                    "database_rider_id": item.get("database_rider_id"),
                    "name": item.get("full_name") or item.get("name"),
                    "status": item.get("status") or item.get("approval_status"),
                    "rider_table_status": item.get("rider_table_status"),
                    "nin_verified": bool(item.get("nin_verified")),
                    "online": item.get("operational_status") == "ONLINE",
                    "available": item.get("operational_status") == "ONLINE" and not item.get("active_order"),
                }
                for item in riders
            ],
        }))
        return {"success": True, "riders": riders, "data": riders}
    finally:
        db.close()


@app.post("/admin/riders")
def create_rider(payload: RiderPayload, request: Request):
    admin = require_any_permission(request, ["delivery:manage", "orders:delivery", "riders:manage", "workforce:manage"])
    full_name = (payload.full_name or "").strip()
    phone = (payload.phone or "").strip()
    if not full_name:
        raise HTTPException(status_code=400, detail="Rider full name is required")
    if not phone:
        raise HTTPException(status_code=400, detail="Rider phone is required")
    db = SessionLocal()
    try:
        clean_email = (payload.email or "").strip().lower()
        digits = "".join(ch for ch in phone if ch.isdigit())
        account_email = clean_email or f"admin-rider-{digits or uuid4().hex[:10]}@foodnova.local"
        if get_db_user_by_email(db, account_email):
            raise HTTPException(status_code=409, detail="A rider account with this email already exists")
        if get_db_user_by_phone(db, phone):
            raise HTTPException(status_code=409, detail="A rider account with this phone already exists")
        user = DBUser(
            full_name=full_name,
            email=account_email,
            phone=phone,
            password=_hash_new_password(uuid4().hex),
            role="rider",
            is_active=True,
        )
        db.add(user)
        db.flush()
        ensure_profile(db, user)
        worker = DBDeliveryWorker(
            user_id=user.id,
            worker_type="rider",
            full_name=full_name,
            phone=phone,
            email=clean_email,
            vehicle_type=(payload.vehicle_type or "").strip(),
            plate_number=(payload.vehicle_number or "").strip(),
            kyc_status=rider_status_input_to_lifecycle(payload.status or "ONBOARDING"),
            operational_status="OFFLINE",
            review_note=(payload.notes or "").strip(),
        )
        db.add(worker)
        db.flush()
        ensure_rider_records(db, worker)
        sync_rider_onboarding_state(db, worker, admin, "Admin created rider")
        db.commit()
        db.refresh(worker)
        data = worker_to_dict(worker)
        data.update({
            "status": rider_lifecycle_status(worker),
            "approval_status": rider_lifecycle_status(worker),
            "rider_id": worker.id,
            "vehicle_number": data.get("plate_number") or "",
            "source": "delivery_workers",
        })
        create_admin_audit_log(request, admin, "rider_created", "delivery_worker", worker.id, f"Admin created rider {worker.full_name}", {"rider": data})
        return {"success": True, "message": "Rider created successfully", "rider": data, "data": data}
    finally:
        db.close()


@app.patch("/admin/riders/{rider_id}")
def update_rider(rider_id: int, payload: RiderUpdatePayload, request: Request):
    admin = require_any_permission(request, ["delivery:manage", "orders:delivery", "riders:manage", "workforce:manage"])
    updates = payload.dict(exclude_unset=True)
    db = SessionLocal()
    try:
        worker = db.query(DBDeliveryWorker).filter(DBDeliveryWorker.id == rider_id, DBDeliveryWorker.worker_type.in_(["rider", "messenger"])).first()
        if not worker:
            raise HTTPException(status_code=404, detail="Rider not found")
        old_data = worker_to_dict(worker)
        if "full_name" in updates and updates["full_name"] is not None:
            worker.full_name = updates["full_name"].strip()
        if "phone" in updates and updates["phone"] is not None:
            worker.phone = updates["phone"].strip()
        if "email" in updates and updates["email"] is not None:
            worker.email = updates["email"].strip()
        if "vehicle_type" in updates and updates["vehicle_type"] is not None:
            worker.vehicle_type = updates["vehicle_type"].strip()
        if "vehicle_number" in updates and updates["vehicle_number"] is not None:
            worker.plate_number = updates["vehicle_number"].strip()
        if "notes" in updates and updates["notes"] is not None:
            worker.review_note = updates["notes"].strip()
        if "status" in updates and updates["status"] is not None:
            worker.kyc_status = rider_status_input_to_lifecycle(str(updates["status"] or ""), worker.kyc_status or "ONBOARDING")
            if worker.kyc_status == "ACTIVE":
                worker.approved_at = worker.approved_at or datetime.utcnow()
                worker.approved_by_admin_id = admin.get("id")
                worker.approved_by_admin_name = admin.get("full_name") or admin.get("email") or ""
                worker.deleted_at = None
                worker.deleted_reason = ""
                user = db.query(DBUser).filter(DBUser.id == worker.user_id).first()
                if user:
                    user.is_active = True
                    user.updated_at = datetime.utcnow()
            if worker.kyc_status in ["INACTIVE", "SUSPENDED", "ONBOARDING"]:
                worker.operational_status = "OFFLINE"
        worker.updated_at = datetime.utcnow()
        sync_rider_onboarding_state(db, worker, admin, "Admin updated rider")
        db.commit()
        db.refresh(worker)
        data = worker_to_dict(worker)
        create_admin_audit_log(request, admin, "rider_updated", "delivery_worker", worker.id, f"Admin updated rider {worker.full_name}", {"before": old_data, "after": data})
        return {"success": True, "message": "Rider updated successfully", "rider": data, "data": data}
    finally:
        db.close()


@app.delete("/admin/riders/{rider_id}")
def deactivate_rider(rider_id: int, request: Request):
    admin = require_any_permission(request, ["delivery:manage", "orders:delivery", "riders:manage", "workforce:manage"])
    db = SessionLocal()
    try:
        worker = db.query(DBDeliveryWorker).filter(DBDeliveryWorker.id == rider_id, DBDeliveryWorker.worker_type.in_(["rider", "messenger"])).first()
        if not worker:
            raise HTTPException(status_code=404, detail="Rider not found")
        old_data = worker_to_dict(worker)
        worker_name = worker.full_name or f"Rider #{worker.id}"
        user_id = worker.user_id
        revoked = revoke_rider_sessions(db, worker, admin, "Rider deleted from admin rider management")

        released_orders = db.query(DBOrder).filter(
            or_(DBOrder.delivery_worker_id == worker.id, DBOrder.rider_id == worker.id),
            DBOrder.order_status.notin_(["delivered", "cancelled"]),
        ).all()
        for order in released_orders:
            order.delivery_worker_id = None
            order.delivery_worker_type = ""
            order.delivery_status = ""
            order.rider_id = None
            order.rider_name = ""
            order.rider_phone = ""
            order.rider_vehicle_type = ""
            order.rider_vehicle_number = ""
            order.updated_at = datetime.utcnow()

        offer_count = db.query(DBDeliveryOffer).filter(DBDeliveryOffer.worker_id == worker.id).count()
        db.add(DBDeletedRiderLog(
            delivery_worker_id=worker.id,
            admin_id=admin.get("id"),
            admin_name=admin.get("full_name") or admin.get("email") or "Admin",
            reason="Permanent admin deletion from rider management",
            snapshot_json=json_dump({
                "rider": old_data,
                "deleted_at": iso(datetime.utcnow()),
                "deleted_by": admin.get("id"),
                "revoked_sessions": revoked,
                "released_order_ids": [order.id for order in released_orders],
                "removed_delivery_offers": offer_count,
                "ip": get_request_ip(request),
                "device": parse_user_agent(request.headers.get("user-agent", "")),
            }),
            hard_deleted=True,
        ))
        db.query(DBDeliveryOffer).filter(DBDeliveryOffer.worker_id == worker.id).delete(synchronize_session=False)
        db.query(DBRiderDocument).filter(DBRiderDocument.delivery_worker_id == worker.id).delete(synchronize_session=False)
        db.query(DBRiderStatusLog).filter(DBRiderStatusLog.delivery_worker_id == worker.id).delete(synchronize_session=False)
        db.query(DBVerificationLog).filter(DBVerificationLog.delivery_worker_id == worker.id).delete(synchronize_session=False)
        db.query(DBRiderSession).filter(DBRiderSession.delivery_worker_id == worker.id).delete(synchronize_session=False)
        db.query(DBAdminReview).filter(DBAdminReview.delivery_worker_id == worker.id).delete(synchronize_session=False)
        db.query(DBRiderKyc).filter(DBRiderKyc.delivery_worker_id == worker.id).delete(synchronize_session=False)
        db.query(DBRider).filter(DBRider.delivery_worker_id == worker.id).delete(synchronize_session=False)
        db.delete(worker)

        db.query(DBAddress).filter(DBAddress.user_id == user_id).delete(synchronize_session=False)
        db.query(DBProfile).filter(DBProfile.user_id == user_id).delete(synchronize_session=False)
        user = db.query(DBUser).filter(DBUser.id == user_id).first()
        if user:
            db.delete(user)
        db.commit()
        print("RIDER_DELETED", json_dump({
            "worker_id": rider_id,
            "user_id": user_id,
            "admin_id": admin.get("id"),
            "hard_deleted": True,
            "revoked_sessions": revoked,
            "released_orders": len(released_orders),
            "removed_delivery_offers": offer_count,
            "timestamp": iso(datetime.utcnow()),
        }))
        create_admin_audit_log(
            request,
            admin,
            "rider_deleted",
            "delivery_worker",
            rider_id,
            f"Admin permanently deleted rider {worker_name}",
            {"before": old_data, "hard_deleted": True, "revoked_sessions": revoked, "released_orders": len(released_orders), "removed_delivery_offers": offer_count},
        )
        return {"success": True, "message": "Rider permanently deleted", "deleted_worker_id": rider_id, "released_orders": len(released_orders), "removed_delivery_offers": offer_count}
    finally:
        db.close()


@app.patch("/admin/orders/{order_id}/assign-rider")
def assign_rider_to_order(order_id: int, payload: AssignRiderPayload, request: Request):
    admin = require_any_permission(request, ["delivery:manage", "orders:delivery"])
    db = SessionLocal()
    try:
        print("ASSIGN_RIDER_REQUEST", json_dump({
            "endpoint": f"/admin/orders/{order_id}/assign-rider",
            "order_id": order_id,
            "payload_rider_id": payload.rider_id,
            "admin_id": admin.get("id"),
        }))
        order = active_order_filter(db.query(DBOrder)).filter(DBOrder.id == order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        rider = db.query(DBDeliveryWorker).filter(
            DBDeliveryWorker.id == payload.rider_id,
            DBDeliveryWorker.deleted_at.is_(None),
            DBDeliveryWorker.kyc_status != "DELETED",
        ).first()
        if not rider:
            linked_payload_rider = db.query(DBRider).filter(DBRider.id == payload.rider_id).first()
            if linked_payload_rider:
                rider = db.query(DBDeliveryWorker).filter(
                    DBDeliveryWorker.id == linked_payload_rider.delivery_worker_id,
                    DBDeliveryWorker.deleted_at.is_(None),
                    DBDeliveryWorker.kyc_status != "DELETED",
                ).first()
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found")
        linked_rider = db.query(DBRider).filter(DBRider.delivery_worker_id == rider.id).first()
        worker_status = (rider.kyc_status or "").upper()
        rider_table_status = ((linked_rider.status if linked_rider else "") or "").upper()
        lifecycle_status = "ACTIVE" if worker_status == "ACTIVE" else rider_lifecycle_status(rider, rider_table_status)
        print("ASSIGN_RIDER_CANDIDATE", json_dump({
            "order_id": order_id,
            "rider_id": rider.id,
            "rider_name": rider.full_name,
            "worker_status": worker_status,
            "rider_table_status": rider_table_status,
            "lifecycle_status": lifecycle_status,
            "nin_verified": bool(getattr(rider, "nin_verified", False)),
            "deleted_at": iso(getattr(rider, "deleted_at", None)),
            "allowed": lifecycle_status == "ACTIVE" and not bool(getattr(rider, "deleted_at", None)),
        }))
        if lifecycle_status != "ACTIVE":
            raise HTTPException(status_code=400, detail="Rider must be ACTIVE before assignment")

        ensure_order_delivery_pin(db, order)
        order.delivery_worker_id = rider.id
        order.delivery_worker_type = rider.worker_type or "rider"
        order.delivery_status = "ASSIGNED"
        order.rider_id = rider.id
        order.rider_name = rider.full_name
        order.rider_phone = rider.phone
        order.rider_vehicle_type = rider.vehicle_type or ""
        order.rider_vehicle_number = rider.plate_number or ""
        order.delivery_note = payload.delivery_note or ""
        order.delivery_assigned_at = datetime.utcnow()
        if payload.mark_out_for_delivery:
            order.status = "out_for_delivery"
            order.order_status = "out_for_delivery"
            order.fulfillment_status = "out_for_delivery"
            order.delivery_status = "IN_TRANSIT"
            order.delivery_started_at = order.delivery_started_at or datetime.utcnow()
            ensure_order_delivery_pin(db, order)
        rider.operational_status = "BUSY"
        rider.updated_at = datetime.utcnow()
        order.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(order)
        order_data = order_to_dict(order)
        rider_data = worker_to_dict(rider)
        _create_user_notification(
            rider.email,
            "New Delivery Assigned",
            f"FoodNova order {order_data.get('order_code')} has been assigned to you.",
            "delivery_assigned",
            "delivery",
            order_data,
        )

        if order_data.get("customer_email"):
            _create_order_notification(
                order_data,
                "Rider Assigned",
                "Your order has been assigned to a rider.",
                "rider_assigned",
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
        assignment_event = {
            "order_id": order.id,
            "order": order_data,
            "rider": rider_data,
            "event": "delivery_assigned",
            "message": f"FoodNova order {order.order_code} has been assigned to you.",
            "timestamp": iso(datetime.utcnow()),
        }
        socket_emit("delivery:assigned", assignment_event, room=f"user:{rider.user_id}")
        socket_emit("dispatch:assignment", assignment_event, room=f"user:{rider.user_id}")
        socket_emit(f"order:update:{order.id}", assignment_event, room=f"order:{order.id}")
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
            ensure_order_delivery_pin(db, order)
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
            if (order.delivery_method or "delivery") == "delivery":
                classify_and_save_order_delivery(order, db)
                start_delivery_matching(db, order, request)
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
        if "processing" in delivery_statuses and (order.delivery_method or "delivery") == "delivery":
            classify_and_save_order_delivery(order, db)
            start_delivery_matching(db, order, request)
            db.commit()
            db.refresh(order)
            order_data = order_to_dict(order)

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
        stored_code = str(order.delivery_code or "").strip()

        if not stored_code:
            raise HTTPException(status_code=400, detail="No delivery code generated for this order")

        delivery_code = validate_delivery_pin_input(payload.get("delivery_code", ""), stored_code)
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


def _delivery_worker_order_or_404(db, worker: DBDeliveryWorker, order_id: int) -> DBOrder:
    order = active_order_filter(db.query(DBOrder)).filter(DBOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if getattr(order, "delivery_worker_id", None) != worker.id and getattr(order, "rider_id", None) != worker.id:
        raise HTTPException(status_code=403, detail="This order is not assigned to your dispatch account")
    return order


@app.get("/delivery/orders")
def delivery_worker_orders(request: Request, status: Optional[str] = None):
    db, user, worker = get_current_worker_record(request)
    try:
        query = active_order_filter(db.query(DBOrder)).filter(
            or_(DBOrder.delivery_worker_id == worker.id, DBOrder.rider_id == worker.id)
        )
        clean_status = (status or "").strip().upper()
        orders = query.order_by(DBOrder.delivery_assigned_at.desc(), DBOrder.updated_at.desc(), DBOrder.id.desc()).all()
        items = [dispatch_order_to_dict(order) for order in orders if not clean_status or canonical_dispatch_status(order) == clean_status]
        return {"success": True, "orders": items, "data": items}
    finally:
        db.close()


@app.patch("/delivery/orders/{order_id}/status")
def delivery_worker_update_order_status(order_id: int, payload: DeliveryOrderStatusPayload, request: Request):
    db, user, worker = get_current_worker_record(request)
    try:
        order = _delivery_worker_order_or_404(db, worker, order_id)
        raw_status = (payload.delivery_status or payload.status or "").strip().lower()
        allowed = {
            "assigned",
            "accepted",
            "en_route_to_pickup",
            "arrived_at_pickup",
            "picked_up",
            "in_transit",
            "arrived",
            "en_route_to_customer",
            "delivered",
            "cancelled",
        }
        if raw_status not in allowed:
            raise HTTPException(status_code=400, detail="Invalid delivery status")

        status_map = {
            "en_route_to_customer": "IN_TRANSIT",
            "en_route_to_pickup": "ACCEPTED",
            "arrived_at_pickup": "ACCEPTED",
        }
        order.delivery_status = status_map.get(raw_status, raw_status.upper())
        if raw_status in {"picked_up", "en_route_to_customer", "in_transit", "arrived"}:
            order.status = "out_for_delivery"
            order.order_status = "out_for_delivery"
            order.fulfillment_status = "out_for_delivery"
            order.delivery_started_at = order.delivery_started_at or datetime.utcnow()
        if raw_status == "delivered":
            order.status = "delivered"
            order.order_status = "delivered"
            order.fulfillment_status = "delivered"
            order.delivery_completed_at = order.delivery_completed_at or datetime.utcnow()
        if raw_status == "cancelled":
            order.delivery_status = "CANCELLED"
        if payload.note:
            existing_note = order.service_note or order.admin_note or ""
            order.service_note = f"{existing_note}\nRider note: {payload.note}".strip()
        order.updated_at = datetime.utcnow()
        worker.operational_status = "BUSY" if raw_status not in {"delivered", "cancelled"} else "ONLINE"
        worker.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(order)
        data = order_to_dict(order)
        customer_event = {
            "accepted": ("Delivery Accepted", f"Your rider accepted order {order.order_code}.", "delivery_accepted"),
            "picked_up": ("Order Picked Up", f"Your order {order.order_code} has been picked up.", "order_picked_up"),
            "in_transit": ("Out for Delivery", f"Your order {order.order_code} is out for delivery.", "out_for_delivery"),
            "en_route_to_customer": ("Out for Delivery", f"Your order {order.order_code} is out for delivery.", "out_for_delivery"),
            "arrived": ("Rider Nearby", f"Your rider has arrived with order {order.order_code}.", "rider_nearby"),
            "delivered": ("Delivery Completed", f"Your order {order.order_code} has been delivered.", "delivered"),
            "cancelled": ("Delivery Cancelled", f"Delivery for order {order.order_code} was cancelled.", "delivery_cancelled"),
        }.get(raw_status, ("Delivery update", f"Your order {order.order_code} is now {raw_status.replace('_', ' ')}.", "delivery_update"))
        _create_order_notification(data, customer_event[0], customer_event[1], customer_event[2], "delivery")
        status_event = {
            "order_id": order.id,
            "order": data,
            "delivery_status": order.delivery_status,
            "status": order.status,
            "event": customer_event[2],
            "timestamp": iso(datetime.utcnow()),
        }
        socket_emit(f"order:update:{order.id}", status_event, room=f"order:{order.id}")
        socket_emit("delivery:status", status_event, room=f"user:{worker.user_id}")
        create_admin_audit_log(request, user, "delivery_status_update", "order", order.id, f"{worker.full_name} updated delivery status for {order.order_code}", {"delivery_status": raw_status, "order": data})
        return {"success": True, "order": data, "data": data}
    finally:
        db.close()


@app.post("/delivery/orders/{order_id}/proof")
def delivery_worker_submit_proof(order_id: int, payload: DeliveryProofPayload, request: Request):
    db, user, worker = get_current_worker_record(request)
    try:
        order = _delivery_worker_order_or_404(db, worker, order_id)
        proof = {
            "signature_present": bool(payload.signature_present),
            "photo_url": payload.photo_url or payload.photo_path or "",
            "note": payload.note or "",
            "submitted_at": datetime.utcnow().isoformat(),
            "worker_id": worker.id,
        }
        if payload.delivery_code:
            stored_code = str(order.delivery_code or "").strip()
            if not stored_code:
                raise HTTPException(status_code=400, detail="No delivery code generated for this order")
            delivery_code = validate_delivery_pin_input(payload.delivery_code, stored_code)
            if delivery_code != stored_code:
                raise HTTPException(status_code=400, detail="Invalid delivery confirmation code")
            order.delivery_confirmed_at = datetime.utcnow()
        elif not proof["signature_present"] and not proof["photo_url"]:
            raise HTTPException(status_code=400, detail="Delivery proof requires a 4-digit Delivery PIN, signature, or photo")

        order.status = "delivered"
        order.order_status = "delivered"
        order.fulfillment_status = "delivered"
        order.delivery_status = "DELIVERED"
        order.delivery_completed_at = order.delivery_completed_at or datetime.utcnow()
        order.service_note = f"{order.service_note or ''}\nDelivery proof: {json_dump(proof)}".strip()
        order.updated_at = datetime.utcnow()
        worker.operational_status = "ONLINE"
        worker.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(order)
        data = order_to_dict(order)
        _create_order_notification(data, "Delivery completed", f"Your order {order.order_code} has been delivered.", "delivery_update", "delivery")
        proof_event = {
            "order_id": order.id,
            "order": data,
            "delivery_status": order.delivery_status,
            "status": order.status,
            "event": "delivered",
            "timestamp": iso(datetime.utcnow()),
        }
        socket_emit(f"order:update:{order.id}", proof_event, room=f"order:{order.id}")
        socket_emit("delivery:completed", proof_event, room=f"user:{worker.user_id}")
        create_admin_audit_log(request, user, "delivery_proof_submitted", "order", order.id, f"{worker.full_name} submitted proof for {order.order_code}", {"proof": proof, "order": data})
        safe_email_call("customer_delivery_confirmed", send_customer_order_email, data, "delivered")
        return {"success": True, "message": "Delivery proof submitted", "order": data, "data": data}
    finally:
        db.close()


@app.get("/admin/products")
def admin_products(request: Request):
    require_permission(request, "stock:view")
    products = list_products(include_inactive=True)
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
    contents: str = Form("[]"),
    pack_info: str = Form(""),
    serving_estimate: str = Form(""),
    freshness_note: str = Form(""),
    delivery_note: str = Form(""),
    image: Optional[UploadFile] = File(None),
):
    admin = require_permission(request, "stock:manage")
    payload = await read_json_payload(request)
    name = payload.get("name", name)
    price = payload.get("price", price)
    stock_qty = payload.get("stock_qty", payload.get("stock", stock_qty))
    category = payload.get("category", category)
    is_active = payload.get("is_active", payload.get("active", is_active))
    description = payload.get("description", description)
    contents = json_dump(payload.get("contents")) if "contents" in payload else contents
    pack_info = payload.get("pack_info", pack_info)
    serving_estimate = payload.get("serving_estimate", serving_estimate)
    freshness_note = payload.get("freshness_note", freshness_note)
    delivery_note = payload.get("delivery_note", delivery_note)
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
            contents=json_dump(parse_content_list(contents)),
            pack_info=pack_info,
            serving_estimate=serving_estimate,
            freshness_note=freshness_note,
            delivery_note=delivery_note,
            is_active=is_active if active is None else active,
        )
        db.add(product)
        db.flush()
        if "variants" in payload:
            apply_product_variants(db, product, payload.get("variants"))
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
    contents: Optional[str] = Form(None),
    pack_info: Optional[str] = Form(None),
    serving_estimate: Optional[str] = Form(None),
    freshness_note: Optional[str] = Form(None),
    delivery_note: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
):
    admin = require_permission(request, "stock:manage")
    payload = await read_json_payload(request)
    name = payload.get("name", name)
    price = payload.get("price", price)
    stock_qty = payload.get("stock_qty", payload.get("stock", stock_qty))
    category = payload.get("category", category)
    is_active = payload.get("is_active", is_active)
    active = payload.get("active", active)
    description = payload.get("description", description)
    contents = json_dump(payload.get("contents")) if "contents" in payload else contents
    pack_info = payload.get("pack_info", pack_info)
    serving_estimate = payload.get("serving_estimate", serving_estimate)
    freshness_note = payload.get("freshness_note", freshness_note)
    delivery_note = payload.get("delivery_note", delivery_note)
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
            if contents is not None:
                product.contents = json_dump(parse_content_list(contents))
            if pack_info is not None:
                product.pack_info = pack_info
            if serving_estimate is not None:
                product.serving_estimate = serving_estimate
            if freshness_note is not None:
                product.freshness_note = freshness_note
            if delivery_note is not None:
                product.delivery_note = delivery_note
            if price is not None:
                product.price = float(price or 0)
            if stock_qty is not None:
                product.stock_qty = int(stock_qty or 0)
                product.stock = int(stock_qty or 0)
            if is_active is not None or active is not None:
                product.is_active = is_active if active is None else active
            if image:
                product.image_url = await save_uploaded_image(image, PRODUCT_UPLOAD_DIR, "product")
            if "variants" in payload:
                apply_product_variants(db, product, payload.get("variants"))
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


@app.post("/admin/products/bulk-stock")
async def admin_bulk_update_product_stock(request: Request):
    admin = require_permission(request, "stock:manage")
    payload = await read_json_payload(request)
    updates = payload.get("updates") if isinstance(payload, dict) else []
    if not isinstance(updates, list):
        raise HTTPException(status_code=400, detail="updates must be a list")
    db = SessionLocal()
    try:
        changed = []
        for update in updates:
            if not isinstance(update, dict):
                continue
            stock = int(update.get("stock_qty") if update.get("stock_qty") is not None else update.get("stock") or 0)
            variant_id = update.get("variant_id")
            product_id = update.get("product_id")
            if variant_id:
                variant = db.query(DBProductVariant).filter(DBProductVariant.id == int(variant_id)).first()
                if not variant:
                    continue
                variant.stock_qty = stock
                variant.stock = stock
                variant.updated_at = datetime.utcnow()
                if variant.product:
                    variant.product.stock_qty = sum(v.stock_qty if v.stock_qty is not None else (v.stock or 0) for v in variant.product.variants if v.is_active)
                    variant.product.stock = variant.product.stock_qty
                changed.append({"variant_id": variant.id, "product_id": variant.product_id, "stock_qty": stock})
            elif product_id:
                product = db.query(DBProduct).filter(DBProduct.id == int(product_id)).first()
                if not product:
                    continue
                product.stock_qty = stock
                product.stock = stock
                product.updated_at = datetime.utcnow()
                changed.append({"product_id": product.id, "stock_qty": stock})
        db.commit()
        create_admin_audit_log(request, admin, "products_bulk_stock_updated", "product", "bulk", f"Admin bulk updated stock for {len(changed)} entries", {"updates": changed})
        return {"success": True, "updated": changed, "data": changed}
    finally:
        db.close()


@app.post("/admin/products/bulk-pricing")
async def admin_bulk_update_product_pricing(request: Request):
    admin = require_permission(request, "stock:manage")
    payload = await read_json_payload(request)
    updates = payload.get("updates") if isinstance(payload, dict) else []
    if not isinstance(updates, list):
        raise HTTPException(status_code=400, detail="updates must be a list")
    db = SessionLocal()
    try:
        changed = []
        for update in updates:
            if not isinstance(update, dict):
                continue
            price = float(update.get("price") or update.get("unit_price") or 0)
            variant_id = update.get("variant_id")
            product_id = update.get("product_id")
            if variant_id:
                variant = db.query(DBProductVariant).filter(DBProductVariant.id == int(variant_id)).first()
                if not variant:
                    continue
                variant.price = price
                variant.updated_at = datetime.utcnow()
                if variant.product:
                    active_variants = [v for v in variant.product.variants if v.is_active]
                    if active_variants:
                        variant.product.price = active_variants[0].price or variant.product.price or 0
                changed.append({"variant_id": variant.id, "product_id": variant.product_id, "price": price})
            elif product_id:
                product = db.query(DBProduct).filter(DBProduct.id == int(product_id)).first()
                if not product:
                    continue
                product.price = price
                product.updated_at = datetime.utcnow()
                changed.append({"product_id": product.id, "price": price})
        db.commit()
        create_admin_audit_log(request, admin, "products_bulk_pricing_updated", "product", "bulk", f"Admin bulk updated pricing for {len(changed)} entries", {"updates": changed})
        return {"success": True, "updated": changed, "data": changed}
    finally:
        db.close()


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
                "rider_id": worker.id,
                "full_name": worker.full_name or "",
                "phone": worker.phone or "",
                "vehicle_type": worker.vehicle_type or "",
                "vehicle_number": worker.plate_number or "",
                "status": worker.kyc_status or "KYC_PENDING",
                "created_at": iso(worker.created_at),
            }
            for worker in db.query(DBDeliveryWorker)
            .filter(DBDeliveryWorker.worker_type == "rider")
            .order_by(DBDeliveryWorker.created_at.desc(), DBDeliveryWorker.id.desc())
            .all()
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
        rows = db.query(DBAnnouncement).order_by(
            DBAnnouncement.priority.desc(),
            DBAnnouncement.created_at.desc(),
            DBAnnouncement.id.desc(),
        ).all()
        announcements = []
        rejected = []
        for announcement in rows:
            reasons = []
            if not bool(announcement.is_active):
                reasons.append("inactive")
            if announcement.start_date and announcement.start_date > now:
                reasons.append(f"starts_at={iso(announcement.start_date)}")
            if announcement.end_date and announcement.end_date < now:
                reasons.append(f"ended_at={iso(announcement.end_date)}")
            if reasons:
                rejected.append({"id": announcement.id, "reasons": reasons})
                continue
            announcements.append(announcement_to_dict(announcement))
        print("ACTIVE ANNOUNCEMENTS AUDIT:", json_dump({
            "total_records": len(rows),
            "active_count": len(announcements),
            "active_ids": [item["id"] for item in announcements],
            "active_image_urls": [item.get("image_url", "") for item in announcements],
            "rejected": rejected,
        }))
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
        raise HTTPException(status_code=500, detail="Unable to load announcements")
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
        db.delete(announcement)
        db.commit()
        create_admin_audit_log(request, admin, "announcement_deleted", "announcement", announcement_id, f"Admin deleted announcement {old_data.get('title')}", {"before": old_data})
        return {"success": True, "message": "Announcement deleted successfully", "announcement": old_data, "data": old_data}
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
@app.get("/admin/activity-logs")
def get_admin_audit_logs(
    request: Request,
    page: int = 1,
    limit: int = 10,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    search: Optional[str] = None,
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
        if search:
            term = f"%{search.strip()}%"
            query = query.filter(or_(
                DBAdminAuditLog.action.ilike(term),
                DBAdminAuditLog.admin_name.ilike(term),
                DBAdminAuditLog.admin_email.ilike(term),
                DBAdminAuditLog.ip_address.ilike(term),
                DBAdminAuditLog.location_city.ilike(term),
                DBAdminAuditLog.location_region.ilike(term),
                DBAdminAuditLog.location_country.ilike(term),
                DBAdminAuditLog.browser.ilike(term),
                DBAdminAuditLog.operating_system.ilike(term),
                DBAdminAuditLog.device_type.ilike(term),
                DBAdminAuditLog.description.ilike(term),
            ))
        if start_date:
            try:
                start_dt = datetime.strptime(start_date, "%Y-%m-%d")
                query = query.filter(DBAdminAuditLog.created_at >= start_dt)
            except ValueError:
                raise HTTPException(status_code=400, detail="start_date must be YYYY-MM-DD")
        if end_date:
            try:
                end_dt = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
                query = query.filter(DBAdminAuditLog.created_at < end_dt)
            except ValueError:
                raise HTTPException(status_code=400, detail="end_date must be YYYY-MM-DD")

        safe_page = max(1, int(page or 1))
        safe_limit = max(1, min(int(limit or 10), 100))
        total = query.count()
        total_pages = math.ceil(total / safe_limit) if total else 0
        logs = [
            audit_log_to_dict(log)
            for log in query.order_by(DBAdminAuditLog.created_at.desc(), DBAdminAuditLog.id.desc()).offset((safe_page - 1) * safe_limit).limit(safe_limit).all()
        ]
        return {
            "success": True,
            "logs": logs,
            "data": logs,
            "page": safe_page,
            "limit": safe_limit,
            "total": total,
            "total_pages": total_pages,
        }
    except HTTPException:
        raise
    except Exception as error:
        print("AUDIT LOGS LOAD ERROR:", repr(error))
        return {"success": True, "logs": [], "data": []}
    finally:
        db.close()


@app.get("/admin/diagnostics/nin-provider")
def get_nin_provider_diagnostics(request: Request):
    admin = require_permission(request, "audit:view")
    config = ninbvnportal_config()
    validation = validate_ninbvnportal_config()
    endpoint_url = f"{config.get('base_url')}/nin-verification"
    balance_url = f"{config.get('base_url')}/balance"
    balance_status = {"checked": False, "available": False, "message": "Balance not checked."}
    if validation.get("configured"):
        try:
            balance = check_balance()
            balance_status = {
                "checked": True,
                "available": True,
                "balance": balance.get("balance"),
                "formatted_balance": balance.get("formatted_balance"),
                "is_low": balance.get("is_low"),
                "low_balance_threshold": balance.get("low_balance_threshold"),
                "api_requests_today": balance.get("api_requests_today"),
                "api_limit": balance.get("api_limit"),
                "message": balance.get("message"),
            }
        except NINBVNPortalError as error:
            balance_status = {
                "checked": True,
                "available": False,
                "message": str(error) or "Verification service unavailable. Please retry shortly.",
                "error_code": error.code,
                "provider_http_status": error.provider_status,
                "retryable": error.retryable,
            }
    diagnostics = {
        "success": True,
        "provider": "ninbvnportal",
        "configured": bool(validation.get("configured")),
        "message": validation.get("message"),
        "render_environment": {
            "api_key_present": bool(config.get("api_key")),
            "base_url_present": bool(os.getenv("NINBVNPORTAL_BASE_URL")),
            "timeout_seconds": os.getenv("NINBVNPORTAL_TIMEOUT_SECONDS", "25"),
            "runtime_env_checked_at": iso(datetime.utcnow()),
            "redeploy_required_after_env_update": True,
            "redeploy_note": "After changing Render environment variables, redeploy the backend before retesting provider health.",
        },
        "request_contract": {
            "method": "POST",
            "url": endpoint_url,
            "body_keys": ["nin", "consent"],
            "body": {"nin": "<11-digit-number>", "consent": True},
            "headers": {
                "Content-Type": "application/json",
                "x-api-key": "present" if config.get("api_key") else "missing",
            },
            "auth_mode": current_nin_auth_mode(),
            "auth_strategy": "documented x-api-key header only",
            "auth_methods": [
                {"auth_mode": "x-api-key", "header_name": "x-api-key"},
            ],
        },
        "balance_contract": {
            "method": "GET",
            "url": balance_url,
            "headers": {
                "x-api-key": "present" if config.get("api_key") else "missing",
            },
            "auth_mode": "x-api-key",
            "header_name": "x-api-key",
        },
        "provider_auth": {
            "status": "failed" if balance_status.get("error_code") == "invalid_provider_credentials" else "authenticated" if balance_status.get("available") else "unknown",
            "response_code": balance_status.get("provider_http_status") or balance_status.get("status_code"),
            "admin_warning": "Provider authentication failed. Check API credentials." if balance_status.get("error_code") == "invalid_provider_credentials" else "",
        },
        "balance": balance_status,
        "retry_policy": {
            "automatic_retries": 0,
            "reason": "NIN verification can affect wallet billing, so provider POST calls are not replayed automatically after ambiguous failures.",
            "retryable_errors": ["provider_unavailable", "provider_rate_limited", "invalid_provider_response", "provider_error"],
        },
        "worker_fallback": {
            "provider_unavailable": "worker sees a retry-safe unavailable message and onboarding does not advance.",
            "invalid_nin": "worker is asked to check the NIN and retry.",
        },
    }
    create_admin_audit_log(
        request,
        admin,
        "nin_provider_diagnostics_viewed",
        "diagnostic",
        "ninbvnportal",
        "Admin viewed NINBVNPortal provider diagnostics",
        {
            "configured": diagnostics["configured"],
            "api_key_present": diagnostics["render_environment"]["api_key_present"],
            "url": endpoint_url,
        },
    )
    return diagnostics


def nin_provider_health_payload(db=None) -> dict:
    config = ninbvnportal_config()
    connectivity = check_provider_connectivity()
    balance = None
    if connectivity.get("endpointReachable"):
        try:
            balance = check_balance()
        except NINBVNPortalError:
            balance = None

    failed_requests_count = 0
    last_successful_verification_at = ""
    average_latency_ms = None
    if db is not None:
        failed_requests_count = db.query(DBVerificationLog).filter(
            DBVerificationLog.provider == "ninbvnportal",
            DBVerificationLog.success == False,
        ).count()
        last_success = db.query(DBVerificationLog).filter(
            DBVerificationLog.provider == "ninbvnportal",
            DBVerificationLog.success == True,
        ).order_by(DBVerificationLog.created_at.desc()).first()
        last_successful_verification_at = iso(last_success.created_at) if last_success else ""
        average_latency_ms = db.query(func.avg(DBVerificationLog.latency_ms)).filter(
            DBVerificationLog.provider == "ninbvnportal",
            DBVerificationLog.latency_ms.isnot(None),
        ).scalar()

    return {
        "apiKeyLoaded": connectivity.get("apiKeyLoaded"),
        "endpointReachable": connectivity.get("endpointReachable"),
        "providerReachable": connectivity.get("endpointReachable"),
        "providerAuthStatus": connectivity.get("providerAuthStatus"),
        "providerStatus": connectivity.get("lastProviderStatus"),
        "providerMessage": connectivity.get("lastProviderMessage"),
        "lastProviderStatus": connectivity.get("lastProviderStatus"),
        "lastProviderMessage": connectivity.get("lastProviderMessage"),
        "lastStatus": connectivity.get("lastProviderStatus"),
        "lastError": connectivity.get("lastProviderMessage") if not connectivity.get("endpointReachable") else "",
        "renderEnvironment": "production",
        "providerUrl": f"{config.get('base_url')}/nin-verification",
        "endpoint": f"{config.get('base_url')}/nin-verification",
        "balanceEndpoint": f"{config.get('base_url')}/balance",
        "timeoutSeconds": os.getenv("NINBVNPORTAL_TIMEOUT_SECONDS", "10"),
        "latencyCheckedAt": iso(datetime.utcnow()),
        "latencyMs": connectivity.get("latencyMs"),
        "balance": balance,
        "verificationBalance": balance,
        "failedRequestsCount": failed_requests_count,
        "lastSuccessfulVerificationAt": last_successful_verification_at,
        "lastSuccessfulVerification": last_successful_verification_at,
        "averageLatencyMs": round(float(average_latency_ms), 2) if average_latency_ms is not None else None,
    }


@app.get("/api/debug/nin-health")
def get_public_nin_health():
    db = SessionLocal()
    try:
        health = nin_provider_health_payload(db)
        return {
            "apiKeyLoaded": health["apiKeyLoaded"],
            "endpointReachable": health["endpointReachable"],
            "providerAuthStatus": health["providerAuthStatus"],
            "providerStatus": health["providerStatus"],
            "providerMessage": health["providerMessage"],
            "lastSuccessfulVerification": health["lastSuccessfulVerification"],
            "verificationBalance": health["verificationBalance"],
            "latencyMs": health["latencyMs"] if "latencyMs" in health else health.get("averageLatencyMs"),
        }
    finally:
        db.close()


@app.get("/debug/nin-provider")
def debug_nin_provider_config():
    config = ninbvnportal_config()
    api_key = config.get("api_key") or ""
    return {
        "api_key_present": bool(api_key),
        "api_key_length": len(api_key),
        "base_url": config.get("base_url"),
        "auth_mode": current_nin_auth_mode(),
        "auth_strategy": "documented x-api-key header only",
        "auth_methods": [
            {"auth_mode": "x-api-key", "header_name": "x-api-key"},
        ],
        "endpoint": f"{config.get('base_url')}/nin-verification",
    }


@app.get("/debug/nin-config")
def debug_nin_config():
    config = ninbvnportal_config()
    api_key = config.get("api_key") or ""
    endpoint = f"{config.get('base_url')}/nin-verification"
    return {
        "provider": "ninbvnportal",
        "endpoint": endpoint,
        "base_url": config.get("base_url"),
        "auth_mode": current_nin_auth_mode(),
        "auth_header": "x-api-key",
        "api_key_loaded": bool(api_key),
        "api_key_length": len(api_key),
    }


@app.get("/admin/diagnostics/account-search")
def search_account_records(email: str, request: Request):
    require_any_permission(request, ["admins:manage", "workforce:view", "workforce:manage", "riders:manage"])
    normalized_email = str(email or "").strip().lower()
    if not normalized_email or "@" not in normalized_email:
        raise HTTPException(status_code=400, detail="A valid email is required")
    db = SessionLocal()
    try:
        matches = []
        users = db.query(DBUser).filter(func.lower(DBUser.email) == normalized_email).all()
        user_ids = {user.id for user in users}
        for user in users:
            matches.append({
                "table": "users",
                "record_id": user.id,
                "email": user.email,
                "role": user.role or "",
                "approval_status": "active" if bool(user.is_active) else "inactive",
                "created_at": iso(user.created_at),
                "updated_at": iso(user.updated_at),
            })

        admins = db.query(DBAdmin).filter(func.lower(DBAdmin.email) == normalized_email).all()
        for admin_record in admins:
            matches.append({
                "table": "admins",
                "record_id": admin_record.id,
                "email": admin_record.email,
                "role": "admin",
                "approval_status": "active" if bool(admin_record.is_active) else "inactive",
                "created_at": iso(admin_record.created_at),
            })

        workers_query = db.query(DBDeliveryWorker).filter(func.lower(DBDeliveryWorker.email) == normalized_email)
        if user_ids:
            workers_query = db.query(DBDeliveryWorker).filter(or_(func.lower(DBDeliveryWorker.email) == normalized_email, DBDeliveryWorker.user_id.in_(user_ids)))
        workers = workers_query.all()
        worker_ids = {worker.id for worker in workers}
        for worker in workers:
            matches.append({
                "table": "delivery_workers",
                "record_id": worker.id,
                "user_id": worker.user_id,
                "email": worker.email,
                "worker_type": worker.worker_type,
                "approval_status": worker.kyc_status or "KYC_PENDING",
                "operational_status": worker.operational_status or "OFFLINE",
                "deleted_at": iso(worker.deleted_at),
                "created_at": iso(worker.created_at),
                "updated_at": iso(worker.updated_at),
            })

        legacy_riders = db.query(DBDeliveryRider).filter(func.lower(DBDeliveryRider.email) == normalized_email).all()
        for rider in legacy_riders:
            matches.append({
                "table": "delivery_riders",
                "record_id": rider.id,
                "email": rider.email,
                "approval_status": rider.status or "",
                "deleted_at": iso(rider.deleted_at),
                "created_at": iso(rider.created_at),
                "updated_at": iso(rider.updated_at),
            })

        riders_query = db.query(DBRider).filter(func.lower(DBRider.email) == normalized_email)
        if user_ids or worker_ids:
            clauses = [func.lower(DBRider.email) == normalized_email]
            if user_ids:
                clauses.append(DBRider.user_id.in_(user_ids))
            if worker_ids:
                clauses.append(DBRider.delivery_worker_id.in_(worker_ids))
            riders_query = db.query(DBRider).filter(or_(*clauses))
        riders = riders_query.all()
        for rider in riders:
            matches.append({
                "table": "riders",
                "record_id": rider.id,
                "user_id": rider.user_id,
                "delivery_worker_id": rider.delivery_worker_id,
                "email": rider.email,
                "approval_status": rider.status or "",
                "onboarding_stage": rider.onboarding_stage or "",
                "created_at": iso(rider.created_at),
                "updated_at": iso(rider.updated_at),
            })

        profiles = db.query(DBProfile).filter(DBProfile.user_id.in_(user_ids)).all() if user_ids else []
        for profile in profiles:
            matches.append({
                "table": "profiles",
                "record_id": profile.id,
                "user_id": profile.user_id,
                "approval_status": "profile_exists",
                "created_at": iso(profile.created_at),
                "updated_at": iso(profile.updated_at),
            })

        session_clauses = []
        if user_ids:
            session_clauses.append(DBRiderSession.user_id.in_(user_ids))
        if worker_ids:
            session_clauses.append(DBRiderSession.delivery_worker_id.in_(worker_ids))
        sessions = db.query(DBRiderSession).filter(or_(*session_clauses)).all() if session_clauses else []
        for session in sessions:
            matches.append({
                "table": "rider_sessions",
                "record_id": session.id,
                "user_id": session.user_id,
                "delivery_worker_id": session.delivery_worker_id,
                "approval_status": "active" if bool(session.is_active) else "revoked",
                "token_hash_present": bool(session.token_hash),
                "created_at": iso(session.created_at),
                "last_seen_at": iso(session.last_seen_at),
                "revoked_at": iso(session.revoked_at),
                "revoked_reason": session.revoked_reason or "",
            })

        deleted_logs = db.query(DBDeletedRiderLog).filter(DBDeletedRiderLog.snapshot_json.ilike(f"%{normalized_email}%")).all()
        for log in deleted_logs:
            matches.append({
                "table": "deleted_rider_logs",
                "record_id": log.id,
                "delivery_worker_id": log.delivery_worker_id,
                "approval_status": "hard_deleted" if bool(log.hard_deleted) else "soft_deleted",
                "created_at": iso(log.created_at),
                "reason": log.reason or "",
            })

        return {
            "success": True,
            "email": normalized_email,
            "match_count": len(matches),
            "matches": matches,
        }
    finally:
        db.close()


@app.get("/admin/diagnostics/nin-provider/balance")
def get_nin_provider_balance(request: Request):
    require_workforce_view(request)
    try:
        balance = check_balance()
        return {
            "success": True,
            "provider": "ninbvnportal",
            "http_status_code": balance.get("provider_http_status"),
            "provider_response_body": balance.get("raw_response_body") or json_dump(balance.get("raw_response") or {}),
            "balance": balance,
            "data": balance,
        }
    except NINBVNPortalError as error:
        return {
            "success": False,
            "provider": "ninbvnportal",
            "message": str(error) or "Verification service unavailable. Please retry shortly.",
            "error_code": error.code,
            "http_status_code": error.provider_status,
            "provider_response_body": error.provider_response or error.provider_body or "",
            "retryable": error.retryable,
            "data": {
                "available": False,
                "is_low": False,
                "message": str(error) or "Verification service unavailable. Please retry shortly.",
            },
        }


@app.get("/admin/diagnostics/nin-provider/health")
def get_admin_nin_provider_health(request: Request):
    require_workforce_view(request)
    db = SessionLocal()
    try:
        health = nin_provider_health_payload(db)
        return {"success": True, "provider": "ninbvnportal", "health": health, "data": health}
    finally:
        db.close()


@app.get("/admin/nin-provider-status")
def get_admin_nin_provider_status(request: Request):
    require_workforce_view(request)
    config = ninbvnportal_config()
    api_key = config.get("api_key") or ""
    masked_key = f"{api_key[:6]}{'*' * max(len(api_key) - 6, 0)}" if api_key else ""
    provider_url = f"{config.get('base_url')}/balance"
    db = SessionLocal()
    try:
        latest_attempt = db.query(DBVerificationLog).filter(
            DBVerificationLog.provider == "ninbvnportal",
        ).order_by(DBVerificationLog.created_at.desc()).first()
        latest_error = db.query(DBVerificationLog).filter(
            DBVerificationLog.provider == "ninbvnportal",
            DBVerificationLog.success == False,
        ).order_by(DBVerificationLog.created_at.desc()).first()
        last_attempt_data = {
            "id": latest_attempt.id,
            "request_id": latest_attempt.request_id or "",
            "status": latest_attempt.status or "",
            "success": bool(latest_attempt.success),
            "http_status": latest_attempt.http_status,
            "message": latest_attempt.message or "",
            "created_at": iso(latest_attempt.created_at),
        } if latest_attempt else None
        last_error_data = {
            "id": latest_error.id,
            "request_id": latest_error.request_id or "",
            "error_code": latest_error.error_code or "",
            "http_status": latest_error.http_status,
            "message": latest_error.message or "",
            "response": json_load(latest_error.response_json, {}),
            "created_at": iso(latest_error.created_at),
        } if latest_error else None
    finally:
        db.close()
    try:
        balance = check_balance()
        authenticated = bool(balance.get("success"))
        return {
            "provider": "ninbvnportal",
            "base_url": config.get("base_url"),
            "provider_url": provider_url,
            "api_key_loaded": bool(api_key),
            "api_key_masked": masked_key,
            "authenticated": authenticated,
            "balance": balance.get("balance") if authenticated else None,
            "balance_request_status": "success" if authenticated else "failed",
            "http_status_code": balance.get("provider_http_status"),
            "provider_response_body": balance.get("raw_response_body") or json_dump(balance.get("raw_response") or {}),
            "last_verification_attempt": last_attempt_data,
            "last_verification_error": last_error_data,
            "last_error": "" if authenticated else balance.get("message") or "Provider balance check failed.",
        }
    except NINBVNPortalError as error:
        return {
            "provider": "ninbvnportal",
            "base_url": config.get("base_url"),
            "provider_url": provider_url,
            "api_key_loaded": bool(api_key),
            "api_key_masked": masked_key,
            "authenticated": False,
            "balance": None,
            "balance_request_status": "failed",
            "http_status_code": error.provider_status,
            "provider_response_body": error.provider_response or error.provider_body or "",
            "last_verification_attempt": last_attempt_data,
            "last_verification_error": last_error_data,
            "last_error": str(error) or "Provider balance check failed.",
        }


@app.post("/admin/nin-provider-test-verification")
def run_admin_nin_provider_test_verification(request: Request):
    require_workforce_view(request)
    sample_nin = "".join(ch for ch in os.getenv("NINBVNPORTAL_DIAGNOSTIC_NIN", "22021091960") if ch.isdigit())
    if len(sample_nin) != 11:
        raise HTTPException(status_code=500, detail="NINBVNPORTAL_DIAGNOSTIC_NIN must contain exactly 11 digits.")
    print("NIN_DIAGNOSTIC_VERIFY_REQUEST", json_dump({
        "sample_nin_last4": sample_nin[-4:],
        "provider": "ninbvnportal",
        "timestamp": iso(datetime.utcnow()),
    }))
    try:
        result = verify_nin(sample_nin, True)
        return {
            "success": bool(result.get("verified")),
            "diagnostic_only": True,
            "sample_nin_masked": f"*******{sample_nin[-4:]}",
            "provider": "ninbvnportal",
            "request_url": result.get("request_endpoint"),
            "provider_url": result.get("request_endpoint"),
            "request_payload": result.get("request_payload"),
            "request_headers_used": result.get("request_headers"),
            "http_status_code": result.get("provider_http_status"),
            "provider_response_body": result.get("raw_response_body") or json_dump(result.get("raw_response") or {}),
            "parsed_response_body": result.get("parsed_response_body") or result.get("raw_response") or {},
            "provider_error_message": "",
            "failure_stage": result.get("failure_stage") or "",
            "shared_service": "services.ninbvnportal_service.verify_nin",
            "result": result,
        }
    except NINBVNPortalError as error:
        provider_attempt = (error.provider_attempts or [{}])[-1]
        failure_stage = "provider_rejection" if error.provider_status else "backend_validation"
        if error.code in {"provider_unavailable", "provider_timeout"}:
            failure_stage = "provider_network"
        return JSONResponse(
            status_code=error.provider_status or error.status_code or 400,
            content={
                "success": False,
                "diagnostic_only": True,
                "sample_nin_masked": f"*******{sample_nin[-4:]}",
                "provider": "ninbvnportal",
                "request_url": provider_attempt.get("endpoint") or f"{ninbvnportal_config().get('base_url')}/nin-verification",
                "provider_url": provider_attempt.get("endpoint") or f"{ninbvnportal_config().get('base_url')}/nin-verification",
                "request_payload": {"nin": sample_nin, "consent": True},
                "request_headers_used": {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "x-api-key": "[configured]" if ninbvnportal_config().get("api_key") else "[missing]",
                },
                "error_code": error.code,
                "http_status_code": error.provider_status,
                "provider_response_body": error.provider_response or error.provider_body or "",
                "parsed_response_body": error.provider_body or {},
                "provider_error_message": str(error),
                "failure_stage": failure_stage,
                "shared_service": "services.ninbvnportal_service.verify_nin",
                "message": str(error),
                "provider_attempts": error.provider_attempts or [],
            },
        )


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


if sio:
    app = socketio.ASGIApp(sio, other_asgi_app=app)

from datetime import datetime
from typing import Dict, List, Optional
from uuid import uuid4
import random

from fastapi import FastAPI, HTTPException, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr

try:
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
except Exception:
    pwd_context = None

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
    return USERS.get(email)


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




def _get_next_notification_id(email: str) -> int:
    """Get next notification ID for a user."""
    existing = ORDER_NOTIFICATIONS.get(email, [])
    if not existing:
        return 1
    return max([n.get("id", 0) for n in existing], default=0) + 1


def _create_user_notification(email: str, title: str, message: str, notif_type: str = "service", 
                              category: str = "service", order: dict = None) -> dict:
    """Create a general user notification."""
    if not email:
        return None
    
    notifications = ORDER_NOTIFICATIONS.setdefault(email, [])
    notif = {
        "id": _get_next_notification_id(email),
        "order_id": order.get("id") if order else None,
        "order_code": order.get("order_code") if order else None,
        "user_email": email,
        "customer_email": email,
        "title": title,
        "message": message,
        "type": notif_type,
        "category": category,
        "is_read": False,
        "created_at": datetime.utcnow().isoformat(),
    }
    notifications.append(notif)
    ORDER_NOTIFICATIONS[email] = notifications
    return notif


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
    recipient_count = 0
    
    # Get all customer emails
    customer_emails = set()
    
    # From USERS
    for email, user in USERS.items():
        if user.get("role") == "customer":
            customer_emails.add(email)
    
    # From ORDERS
    for order in ORDERS:
        if order.get("customer_email"):
            customer_emails.add(order.get("customer_email"))
    
    # Push notification to all customers
    for email in customer_emails:
        try:
            _create_user_notification(email, title, message, notif_type, "broadcast", None)
            recipient_count += 1
        except:
            pass
    
    return recipient_count


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
def list_products(search: Optional[str] = None):
    if not search:
        return PRODUCTS

    search_lower = search.lower()
    filtered = [
        product for product in PRODUCTS
        if search_lower in product.get("name", "").lower()
        or search_lower in product.get("category", "").lower()
        or search_lower in product.get("category_name", "").lower()
    ]
    return filtered


@app.get("/products/{product_id}")
def get_product(product_id: int):
    for product in list_products():
        if product["id"] == product_id:
            return product

    raise HTTPException(status_code=404, detail="Product not found")


@app.get("/packs")
def list_packs(search: Optional[str] = None):
    if not search:
        return PACKS

    search_lower = search.lower()
    filtered = [
        pack for pack in PACKS
        if search_lower in pack.get("name", "").lower()
        or search_lower in pack.get("description", "").lower()
        or any(search_lower in str(item).lower() for item in pack.get("items", []))
    ]
    return filtered


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

    # Create user profile
    profile = {
        "user_id": user["id"],
        "full_name": full_name,
        "email": email,
        "phone": user.get("phone", ""),
        "avatar_url": "",
        "default_address_id": None,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }

    USER_PROFILES[email] = profile
    USER_ADDRESSES[email] = []
    ORDER_NOTIFICATIONS[email] = []

    return auth_response("Registration successful", user, token)


@app.post("/auth/login")
def login(payload: LoginPayload):
    email = payload.email.lower().strip()
    user = USERS.get(email)

    if not user or not _password_matches(payload.password, user.get("password", "")):
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


@app.post("/auth/change-password")
def change_password(request: Request, payload: ChangePasswordPayload):
    user = _get_user_from_token(request.headers.get("authorization"))
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    if user.get("role") == "admin":
        raise HTTPException(status_code=403, detail="Admins cannot use customer password changes")

    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="New passwords do not match")

    if len(payload.new_password or "") < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")

    if not _password_matches(payload.current_password, user.get("password", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    email = user.get("email")
    USERS[email]["password"] = _hash_new_password(payload.new_password)

    return {"success": True, "message": "Password changed successfully"}


@app.get("/auth/me")
def me():
    return {"success": True, "message": "Temporary auth active"}


@app.get("/profile")
def get_profile(request: Request):
    auth = request.headers.get("authorization")
    user = _get_user_from_token(auth)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    email = user.get("email")
    profile = USER_PROFILES.get(email)
    if not profile:
        # create a default profile if missing
        profile = {
            "user_id": user["id"],
            "full_name": user.get("full_name") or user.get("name"),
            "email": email,
            "phone": user.get("phone", ""),
            "avatar_url": "",
            "default_address_id": None,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }
        USER_PROFILES[email] = profile
        USER_ADDRESSES[email] = []

    addresses = USER_ADDRESSES.get(email, [])

    return {"success": True, "profile": profile, "addresses": addresses, "data": {"profile": profile, "addresses": addresses}}


@app.patch("/profile")
def update_profile(request: Request, payload: ProfileUpdatePayload):
    auth = request.headers.get("authorization")
    user = _get_user_from_token(auth)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    email = user.get("email")
    profile = USER_PROFILES.get(email, {})
    if payload.full_name:
        profile["full_name"] = payload.full_name
    if payload.phone is not None:
        profile["phone"] = payload.phone
    if payload.avatar_url is not None:
        profile["avatar_url"] = payload.avatar_url

    profile["updated_at"] = datetime.utcnow().isoformat()
    USER_PROFILES[email] = profile

    return {"success": True, "profile": profile, "data": profile}


@app.get("/profile/addresses")
def get_addresses(request: Request):
    auth = request.headers.get("authorization")
    user = _get_user_from_token(auth)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    email = user.get("email")
    addresses = USER_ADDRESSES.get(email, [])
    return {"success": True, "addresses": addresses, "data": addresses}


@app.post("/profile/addresses")
def create_address(request: Request, payload: AddressPayload):
    auth = request.headers.get("authorization")
    user = _get_user_from_token(auth)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    email = user.get("email")
    addresses = USER_ADDRESSES.setdefault(email, [])
    max_id = max([a.get("id", 0) for a in addresses], default=0)
    new_id = max_id + 1

    addr = payload.dict()
    addr.update({
        "id": new_id,
        "user_id": user["id"],
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    })

    # handle default
    if addr.get("is_default"):
        for a in addresses:
            a["is_default"] = False
        USER_PROFILES[email]["default_address_id"] = new_id

    addresses.append(addr)
    USER_ADDRESSES[email] = addresses

    return {"success": True, "address": addr, "data": addr}


@app.patch("/profile/addresses/{address_id}")
def update_address(address_id: int, request: Request, payload: AddressPayload):
    auth = request.headers.get("authorization")
    user = _get_user_from_token(auth)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    email = user.get("email")
    addresses = USER_ADDRESSES.get(email, [])
    for i, a in enumerate(addresses):
        if a.get("id") == address_id:
            updated = {**a, **{k: v for k, v in payload.dict().items() if v is not None}}
            updated["updated_at"] = datetime.utcnow().isoformat()
            addresses[i] = updated
            USER_ADDRESSES[email] = addresses
            return {"success": True, "address": updated, "data": updated}

    raise HTTPException(status_code=404, detail="Address not found")


@app.delete("/profile/addresses/{address_id}")
def delete_address(address_id: int, request: Request):
    auth = request.headers.get("authorization")
    user = _get_user_from_token(auth)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    email = user.get("email")
    addresses = USER_ADDRESSES.get(email, [])
    for i, a in enumerate(addresses):
        if a.get("id") == address_id:
            removed = addresses.pop(i)
            USER_ADDRESSES[email] = addresses
            # clear default if needed
            if USER_PROFILES.get(email, {}).get("default_address_id") == address_id:
                USER_PROFILES[email]["default_address_id"] = None
            return {"success": True, "address": removed, "data": removed}

    raise HTTPException(status_code=404, detail="Address not found")


@app.patch("/profile/addresses/{address_id}/default")
def set_default_address(address_id: int, request: Request):
    auth = request.headers.get("authorization")
    user = _get_user_from_token(auth)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    email = user.get("email")
    addresses = USER_ADDRESSES.get(email, [])
    found = False
    for a in addresses:
        if a.get("id") == address_id:
            a["is_default"] = True
            USER_PROFILES[email]["default_address_id"] = address_id
            found = True
        else:
            a["is_default"] = False

    if not found:
        raise HTTPException(status_code=404, detail="Address not found")

    USER_ADDRESSES[email] = addresses
    return {"success": True, "default_address_id": address_id, "data": {"default_address_id": address_id}}




@app.get("/notifications")
def get_notifications(request: Request):
    user = _get_user_from_token(request.headers.get("authorization"))
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    email = user.get("email")
    items = sorted(ORDER_NOTIFICATIONS.get(email, []), key=lambda x: x.get("created_at", ""), reverse=True)
    return {"success": True, "notifications": items, "data": items}


@app.get("/notifications/unread-count")
def unread_count(request: Request):
    user = _get_user_from_token(request.headers.get("authorization"))
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    email = user.get("email")
    count = len([n for n in ORDER_NOTIFICATIONS.get(email, []) if not n.get("is_read")])
    return {"count": count}


@app.patch("/notifications/{notification_id}/read")
def mark_notification_read(notification_id: int, request: Request):
    user = _get_user_from_token(request.headers.get("authorization"))
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    email = user.get("email")
    for n in ORDER_NOTIFICATIONS.get(email, []):
        if n.get("id") == notification_id:
            n["is_read"] = True
            return {"success": True, "notification": n, "data": n}
    raise HTTPException(status_code=404, detail="Notification not found")


@app.patch("/notifications/read-all")
def mark_all_notifications_read(request: Request):
    user = _get_user_from_token(request.headers.get("authorization"))
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    email = user.get("email")
    for n in ORDER_NOTIFICATIONS.get(email, []):
        n["is_read"] = True
    return {"success": True}

@app.post("/orders")
def create_order(payload: OrderPayload, request: Request):
    normalized_items = normalize_order_items(payload.items or [])
    # Attempt to enrich with user/profile data when available
    auth = request.headers.get("authorization")
    current_user = _get_user_from_token(auth)
    customer_name = payload.customer_name or (current_user.get("full_name") if current_user else "FoodNova Customer")
    customer_email = payload.customer_email or (current_user.get("email") if current_user else "")
    customer_phone = payload.customer_phone or (current_user.get("phone") if current_user else "")

    order = {
        "id": len(ORDERS) + 1,
        "order_code": f"FN-{len(ORDERS) + 1:05d}",
        "items": normalized_items,
        "total_amount": payload.total_amount or payload.total or sum(item["line_total"] for item in normalized_items),
        "delivery_address": payload.delivery_address or payload.address or "",
        "delivery_address_id": payload.delivery_address_id if getattr(payload, 'delivery_address_id', None) else None,
        "delivery_address_snapshot": payload.delivery_address_snapshot or None,
        "phone": payload.phone or customer_phone or "",
        "customer_name": customer_name,
        "customer_email": customer_email or "",
        "customer_phone": customer_phone or "",
        "payment_method": payload.payment_method or "bank_transfer",
        "delivery_method": payload.delivery_method or "delivery",
        "pickup_note": payload.pickup_note or "",
        "delivery_notes": payload.delivery_notes or "",
        "status": "pending_payment",
        "payment_status": "pending_payment",
        "order_status": "order_placed",
        "fulfillment_status": "order_placed",
        "delivery_code": None,
        "delivery_code_created_at": None,
        "delivery_confirmed_at": None,
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
            order["payment_status"] = "receipt_submitted"
            
            # Create notification for customer
            _create_order_notification(
                order, 
                "Receipt Received", 
                f"Your payment receipt for order {order.get('order_code')} has been received and is awaiting approval.",
                "payment_update",
                "payment"
            )

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
            # Store old values for comparison
            old_payment_status = order.get("payment_status")
            old_order_status = order.get("order_status")
            old_fulfillment_status = order.get("fulfillment_status")
            old_delivery_code = order.get("delivery_code")
            old_delivery_method = order.get("delivery_method")
            old_admin_note = order.get("admin_note")
            old_service_note = order.get("service_note")
            old_delivery_notes = order.get("delivery_notes")
            old_delivery_address = order.get("delivery_address")
            
            # Handle delivery code generation when status changes to out_for_delivery
            new_status = payload.get("status") or payload.get("order_status") or payload.get("fulfillment_status")
            if new_status == "out_for_delivery" and order.get("delivery_method") == "delivery":
                if not order.get("delivery_code"):
                    order["delivery_code"] = "{:06d}".format(random.randint(0, 999999))
                    order["delivery_code_created_at"] = datetime.utcnow().isoformat()
            
            # Update order with new payload
            order.update(payload)
            
            # Create notifications for meaningful changes
            email = order.get("customer_email") or order.get("user_email")
            
            if email:
                # Payment status changes
                new_payment_status = order.get("payment_status")
                if new_payment_status != old_payment_status:
                    if new_payment_status == "receipt_submitted":
                        _create_order_notification(order, "Receipt Submitted", 
                            f"Your receipt for order {order.get('order_code')} has been submitted and is awaiting review.",
                            "payment_update", "payment")
                    elif new_payment_status == "payment_confirmed":
                        _create_order_notification(order, "Payment Confirmed",
                            f"Your payment for order {order.get('order_code')} has been confirmed.",
                            "payment_update", "payment")
                    elif new_payment_status == "payment_rejected":
                        _create_order_notification(order, "Payment Rejected",
                            f"Your payment for order {order.get('order_code')} was rejected. Please upload a clearer receipt or contact support.",
                            "payment_update", "payment")
                
                # Order status changes
                new_order_status = order.get("order_status")
                if new_order_status != old_order_status:
                    if new_order_status == "processing":
                        _create_order_notification(order, "Order Processing",
                            f"Your order {order.get('order_code')} is now being processed.",
                            "order_update", "order")
                    elif new_order_status == "ready_for_pickup":
                        _create_order_notification(order, "Ready for Pickup",
                            f"Your order {order.get('order_code')} is ready for pickup.",
                            "order_update", "order")
                    elif new_order_status == "out_for_delivery":
                        _create_order_notification(order, "Out for Delivery",
                            f"Your order {order.get('order_code')} is out for delivery. Please keep your delivery confirmation code ready.",
                            "delivery_update", "delivery")
                    elif new_order_status == "delivered":
                        _create_order_notification(order, "Order Delivered",
                            f"Your order {order.get('order_code')} has been marked as delivered.",
                            "delivery_update", "delivery")
                
                # Delivery code generation notification
                if order.get("delivery_code") and not old_delivery_code:
                    _create_order_notification(order, "Delivery Code Generated",
                        f"Your delivery confirmation code has been generated for order {order.get('order_code')}. Share it only after receiving your order.",
                        "delivery_update", "delivery")
                
                # Service note added
                new_service_note = order.get("service_note")
                if new_service_note and new_service_note != old_service_note:
                    _create_order_notification(order, "FoodNova Service Update",
                        f"Your order {order.get('order_code')} update: {new_service_note}",
                        "service_update", "service")
                
                # Admin note added (also create notification)
                new_admin_note = order.get("admin_note")
                if new_admin_note and new_admin_note != old_admin_note:
                    _create_order_notification(order, "FoodNova Service Update",
                        f"Your order {order.get('order_code')} update: {new_admin_note}",
                        "service_update", "service")

            return {
                "success": True,
                "message": "Order updated successfully",
                "order": order,
                "data": order,
            }

    raise HTTPException(status_code=404, detail="Order not found")


@app.post("/orders/{order_id}/confirm-delivery")
def confirm_delivery(order_id: int, payload: dict):
    for order in ORDERS:
        if order["id"] == order_id:
            delivery_code = str(payload.get("delivery_code", "")).strip()
            stored_code = str(order.get("delivery_code", "")).strip()
            
            if not stored_code:
                raise HTTPException(status_code=400, detail="No delivery code generated for this order")
            
            if delivery_code != stored_code:
                raise HTTPException(status_code=400, detail="Invalid delivery confirmation code")
            
            # Mark order as delivered
            order["status"] = "delivered"
            order["order_status"] = "delivered"
            order["fulfillment_status"] = "delivered"
            order["delivery_confirmed_at"] = datetime.utcnow().isoformat()
            
            return {
                "success": True,
                "message": "Delivery confirmed successfully",
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
    # Generate new ID
    max_id = max([p["id"] for p in PRODUCTS], default=0)
    new_id = max_id + 1

    # Create new product
    new_product = {
        "id": new_id,
        "name": payload.get("name", ""),
        "price": int(payload.get("price", 0)),
        "stock_qty": int(payload.get("stock_qty", 0)),
        "stock": int(payload.get("stock_qty", 0)),
        "category": payload.get("category", ""),
        "category_name": payload.get("category", ""),
        "image_url": payload.get("image_url", ""),
        "is_active": payload.get("is_active", True),
    }

    PRODUCTS.append(new_product)

    return {
        "success": True,
        "message": "Product created successfully",
        "product": new_product,
        "data": new_product,
    }


@app.patch("/admin/products/{product_id}")
def admin_update_product(product_id: int, payload: dict):
    for i, product in enumerate(PRODUCTS):
        if product["id"] == product_id:
            # Update product
            updated_product = {**product, **payload}
            # Ensure stock fields are consistent
            if "stock_qty" in payload:
                updated_product["stock"] = int(payload["stock_qty"])
            elif "stock" in payload:
                updated_product["stock_qty"] = int(payload["stock"])

            PRODUCTS[i] = updated_product

            return {
                "success": True,
                "message": "Product updated successfully",
                "product": updated_product,
                "data": updated_product,
            }

    raise HTTPException(status_code=404, detail="Product not found")


@app.delete("/admin/products/{product_id}")
def admin_delete_product(product_id: int):
    for i, product in enumerate(PRODUCTS):
        if product["id"] == product_id:
            deleted_product = PRODUCTS.pop(i)
            return {
                "success": True,
                "message": "Product deleted successfully",
                "product": deleted_product,
                "data": deleted_product,
            }

    raise HTTPException(status_code=404, detail="Product not found")


@app.get("/admin/packs")
def admin_packs():
    packs = list_packs()
    return {"success": True, "packs": packs, "data": packs}


@app.post("/admin/packs")
def admin_create_pack(payload: dict):
    # Generate new ID
    max_id = max([p["id"] for p in PACKS], default=0)
    new_id = max_id + 1

    # Create new pack
    new_pack = {
        "id": new_id,
        "name": payload.get("name", ""),
        "description": payload.get("description", ""),
        "price": int(payload.get("price", 0)),
        "is_active": payload.get("is_active", True),
        "items": payload.get("items", []),
        "image_url": payload.get("image_url", ""),
    }

    PACKS.append(new_pack)

    return {
        "success": True,
        "message": "Pack created successfully",
        "pack": new_pack,
        "data": new_pack,
    }


@app.patch("/admin/packs/{pack_id}")
def admin_update_pack(pack_id: int, payload: dict):
    for i, pack in enumerate(PACKS):
        if pack["id"] == pack_id:
            # Update pack
            updated_pack = {**pack, **payload}
            PACKS[i] = updated_pack

            return {
                "success": True,
                "message": "Pack updated successfully",
                "pack": updated_pack,
                "data": updated_pack,
            }

    raise HTTPException(status_code=404, detail="Pack not found")


@app.delete("/admin/packs/{pack_id}")
def admin_delete_pack(pack_id: int):
    for i, pack in enumerate(PACKS):
        if pack["id"] == pack_id:
            deleted_pack = PACKS.pop(i)
            return {
                "success": True,
                "message": "Pack deleted successfully",
                "pack": deleted_pack,
                "data": deleted_pack,
            }

    raise HTTPException(status_code=404, detail="Pack not found")


# ============================================
# BROADCAST ENDPOINTS
# ============================================

@app.post("/admin/broadcasts")
def create_broadcast(payload: dict, request: Request):
    """Create and send a broadcast message to all customers."""
    user = _get_user_from_token(request.headers.get("authorization"))
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    title = payload.get("title", "")
    message = payload.get("message", "")
    notif_type = payload.get("type", "broadcast")
    audience = payload.get("audience", "all")
    
    if not title or not message:
        raise HTTPException(status_code=400, detail="Title and message are required")
    
    # Generate broadcast ID
    max_id = max([b.get("id", 0) for b in BROADCAST_MESSAGES], default=0)
    broadcast_id = max_id + 1
    
    # Create broadcast record
    broadcast = {
        "id": broadcast_id,
        "title": title,
        "message": message,
        "type": notif_type,
        "audience": audience,
        "created_by": user.get("email"),
        "created_at": datetime.utcnow().isoformat(),
        "is_active": True,
    }
    
    BROADCAST_MESSAGES.append(broadcast)
    
    # Send notifications to all customers
    recipient_count = _create_broadcast_notification(title, message, notif_type, audience)
    
    return {
        "success": True,
        "message": "Broadcast sent successfully",
        "broadcast": broadcast,
        "recipient_count": recipient_count,
        "data": {
            "broadcast": broadcast,
            "recipient_count": recipient_count,
        }
    }


@app.get("/admin/broadcasts")
def get_broadcasts(request: Request):
    """Get all broadcast messages."""
    user = _get_user_from_token(request.headers.get("authorization"))
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Sort by created_at descending (newest first)
    sorted_broadcasts = sorted(BROADCAST_MESSAGES, key=lambda x: x.get("created_at", ""), reverse=True)
    
    return {
        "success": True,
        "broadcasts": sorted_broadcasts,
        "data": sorted_broadcasts,
    }


@app.patch("/admin/broadcasts/{broadcast_id}")
def update_broadcast(broadcast_id: int, payload: dict, request: Request):
    """Update a broadcast message."""
    user = _get_user_from_token(request.headers.get("authorization"))
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    for i, broadcast in enumerate(BROADCAST_MESSAGES):
        if broadcast["id"] == broadcast_id:
            # Update allowed fields
            if "title" in payload:
                broadcast["title"] = payload["title"]
            if "message" in payload:
                broadcast["message"] = payload["message"]
            if "type" in payload:
                broadcast["type"] = payload["type"]
            if "is_active" in payload:
                broadcast["is_active"] = payload["is_active"]
            
            broadcast["updated_at"] = datetime.utcnow().isoformat()
            BROADCAST_MESSAGES[i] = broadcast
            
            return {
                "success": True,
                "message": "Broadcast updated successfully",
                "broadcast": broadcast,
                "data": broadcast,
            }
    
    raise HTTPException(status_code=404, detail="Broadcast not found")


@app.delete("/admin/broadcasts/{broadcast_id}")
def delete_broadcast(broadcast_id: int, request: Request):
    """Delete or mark a broadcast as inactive."""
    user = _get_user_from_token(request.headers.get("authorization"))
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    for i, broadcast in enumerate(BROADCAST_MESSAGES):
        if broadcast["id"] == broadcast_id:
            # Mark as inactive instead of deleting
            broadcast["is_active"] = False
            broadcast["deleted_at"] = datetime.utcnow().isoformat()
            BROADCAST_MESSAGES[i] = broadcast
            
            return {
                "success": True,
                "message": "Broadcast deleted successfully",
                "broadcast": broadcast,
                "data": broadcast,
            }
    
    raise HTTPException(status_code=404, detail="Broadcast not found")

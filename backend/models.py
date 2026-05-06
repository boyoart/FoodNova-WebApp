from datetime import datetime
import enum

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(150), nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=False)
    phone = Column(String(50), default="")
    password = Column(String(255), nullable=False)
    role = Column(String(30), default="customer", index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    profile = relationship("Profile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    addresses = relationship("Address", back_populates="user", cascade="all, delete-orphan")


class Admin(Base):
    __tablename__ = "admins"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    full_name = Column(String(150), default="")
    phone = Column(String(50), default="")
    avatar_url = Column(Text, default="")
    default_address_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="profile")


class Address(Base):
    __tablename__ = "addresses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    label = Column(String(80), default="")
    recipient_name = Column(String(150), default="")
    phone = Column(String(50), default="")
    address_line = Column(Text, default="")
    street = Column(String(180), default="")
    area = Column(String(120), default="")
    city = Column(String(120), default="")
    lga = Column(String(120), default="")
    state = Column(String(120), default="")
    country = Column(String(120), default="Nigeria")
    landmark = Column(Text, default="")
    postal_code = Column(String(30), default="")
    google_place_id = Column(String(255), default="")
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="addresses")


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False, index=True)
    price = Column(Float, default=0)
    stock_qty = Column(Integer, default=0)
    stock = Column(Integer, default=0)
    category = Column(String(100), default="", index=True)
    category_name = Column(String(100), default="")
    image_url = Column(Text, default="")
    description = Column(Text, default="")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Pack(Base):
    __tablename__ = "packs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False, index=True)
    description = Column(Text, default="")
    price = Column(Float, default=0)
    image_url = Column(Text, default="")
    items = Column(Text, default="[]")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    order_code = Column(String(30), unique=True, index=True, nullable=False)
    customer_name = Column(String(150), default="")
    customer_email = Column(String(150), index=True, default="")
    customer_phone = Column(String(50), default="")
    delivery_address = Column(Text, default="")
    delivery_address_id = Column(Integer, nullable=True)
    delivery_address_snapshot = Column(Text, nullable=True)
    phone = Column(String(50), default="")
    payment_method = Column(String(80), default="bank_transfer")
    delivery_method = Column(String(80), default="delivery")
    pickup_note = Column(Text, default="")
    delivery_notes = Column(Text, default="")
    total_amount = Column(Float, default=0)
    status = Column(String(80), default="pending_payment", index=True)
    payment_status = Column(String(80), default="pending_payment", index=True)
    order_status = Column(String(80), default="order_placed", index=True)
    fulfillment_status = Column(String(80), default="order_placed", index=True)
    delivery_code = Column(String(20), nullable=True)
    delivery_code_created_at = Column(DateTime, nullable=True)
    delivery_confirmed_at = Column(DateTime, nullable=True)
    receipt = Column(Text, nullable=True)
    admin_note = Column(Text, default="")
    service_note = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    product_id = Column(Integer, nullable=True)
    name = Column(String(150), default="")
    product_name = Column(String(150), default="")
    price = Column(Float, default=0)
    unit_price = Column(Float, default=0)
    quantity = Column(Integer, default=1)
    qty = Column(Integer, default=1)
    line_total = Column(Float, default=0)

    order = relationship("Order", back_populates="items")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String(150), index=True, nullable=False)
    customer_email = Column(String(150), index=True, nullable=False)
    order_id = Column(Integer, nullable=True, index=True)
    order_code = Column(String(30), nullable=True)
    title = Column(String(180), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(80), default="service")
    category = Column(String(80), default="service")
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)


class Broadcast(Base):
    __tablename__ = "broadcasts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(180), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(80), default="broadcast")
    audience = Column(String(80), default="all")
    is_active = Column(Boolean, default=True)
    recipient_count = Column(Integer, default=0)
    created_by = Column(String(150), default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    admin_id = Column(Integer, nullable=True)
    admin_name = Column(String(150), default="")
    admin_email = Column(String(150), index=True, default="")
    action = Column(String(120), index=True, nullable=False)
    entity_type = Column(String(80), index=True, default="")
    entity_id = Column(String(80), index=True, default="")
    description = Column(Text, default="")
    metadata_json = Column(Text, nullable=True)
    ip_address = Column(String(80), default="")
    user_agent = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class OrderStatus(str, enum.Enum):
    pending_payment = "pending_payment"
    receipt_submitted = "receipt_submitted"
    payment_confirmed = "payment_confirmed"
    payment_rejected = "payment_rejected"
    processing = "processing"
    ready_for_pickup = "ready_for_pickup"
    out_for_delivery = "out_for_delivery"
    delivered = "delivered"
    cancelled = "cancelled"


FoodPack = Pack

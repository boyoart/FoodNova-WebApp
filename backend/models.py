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
    admin_role = Column(String(80), default="")
    permissions_json = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
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


class DeliveryRider(Base):
    __tablename__ = "delivery_riders"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(150), nullable=False, index=True)
    phone = Column(String(50), nullable=False, index=True)
    email = Column(String(150), default="")
    vehicle_type = Column(String(80), default="")
    vehicle_number = Column(String(80), default="")
    status = Column(String(30), default="active", index=True)
    notes = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CancellationRequest(Base):
    __tablename__ = "cancellation_requests"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, nullable=False, index=True)
    order_code = Column(String(30), default="", index=True)
    customer_email = Column(String(150), index=True, default="")
    customer_name = Column(String(150), default="")
    customer_phone = Column(String(50), default="")
    request_type = Column(String(30), default="cancellation", index=True)
    reason = Column(Text, default="")
    status = Column(String(30), default="pending", index=True)
    admin_note = Column(Text, default="")
    reviewed_by_admin_id = Column(Integer, nullable=True)
    reviewed_by_admin_name = Column(String(150), default="")
    reviewed_by_admin_email = Column(String(150), default="")
    requested_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)
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
    rider_id = Column(Integer, nullable=True, index=True)
    rider_name = Column(String(150), default="")
    rider_phone = Column(String(50), default="")
    rider_vehicle_type = Column(String(80), default="")
    rider_vehicle_number = Column(String(80), default="")
    delivery_assigned_at = Column(DateTime, nullable=True)
    delivery_started_at = Column(DateTime, nullable=True)
    delivery_completed_at = Column(DateTime, nullable=True)
    delivery_note = Column(Text, default="")
    cancellation_status = Column(String(30), default="none", index=True)
    cancellation_reason = Column(Text, default="")
    cancellation_requested_at = Column(DateTime, nullable=True)
    cancellation_reviewed_at = Column(DateTime, nullable=True)
    refund_status = Column(String(30), default="none", index=True)
    refund_note = Column(Text, default="")
    inventory_restocked_at = Column(DateTime, nullable=True)
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


class Announcement(Base):
    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(180), nullable=False)
    message = Column(Text, nullable=False)
    display_type = Column(String(40), default="top_bar", index=True)
    button_text = Column(String(120), nullable=True)
    button_link = Column(Text, nullable=True)
    image_url = Column(Text, nullable=True)
    theme = Column(String(40), default="green", index=True)
    priority = Column(Integer, default=0)
    is_active = Column(Boolean, default=True, index=True)
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    created_by_admin_id = Column(Integer, nullable=True)
    created_by_admin_name = Column(String(150), nullable=True)
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


class PaymentApprovalLog(Base):
    __tablename__ = "payment_approval_logs"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, nullable=True, index=True)
    order_code = Column(String(30), default="", index=True)
    admin_id = Column(Integer, nullable=True)
    admin_name = Column(String(150), default="")
    admin_email = Column(String(150), index=True, default="")
    action = Column(String(80), index=True, nullable=False)
    old_payment_status = Column(String(80), default="")
    new_payment_status = Column(String(80), default="")
    receipt_url = Column(Text, default="")
    receipt_filename = Column(String(255), default="")
    note = Column(Text, default="")
    rejection_reason = Column(Text, default="")
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

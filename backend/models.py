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
    fcm_token = Column(Text, default="")
    fcm_tokens_json = Column(Text, default="[]")
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
    contents = Column(Text, default="[]")
    pack_info = Column(Text, default="")
    serving_estimate = Column(Text, default="")
    freshness_note = Column(Text, default="")
    delivery_note = Column(Text, default="")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    variants = relationship("ProductVariant", back_populates="product", cascade="all, delete-orphan")


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
    deleted_at = Column(DateTime, nullable=True, index=True)
    deleted_by_admin_id = Column(Integer, nullable=True)
    deleted_reason = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProductVariant(Base):
    __tablename__ = "product_variants"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    sku = Column(String(120), unique=True, index=True, nullable=False)
    weight = Column(String(40), default="", index=True)
    price = Column(Float, default=0)
    stock_qty = Column(Integer, default=0)
    stock = Column(Integer, default=0)
    image_url = Column(Text, default="")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    product = relationship("Product", back_populates="variants")


class DeliveryWorker(Base):
    __tablename__ = "delivery_workers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    worker_type = Column(String(30), default="rider", index=True)
    full_name = Column(String(150), nullable=False, index=True)
    phone = Column(String(50), nullable=False, index=True)
    email = Column(String(150), default="", index=True)
    home_address = Column(Text, default="")
    emergency_contact_name = Column(String(150), default="")
    emergency_contact_phone = Column(String(50), default="")
    id_type = Column(String(80), default="")
    id_number = Column(String(120), default="")
    nin_verified = Column(Boolean, default=False)
    nin_report_id = Column(String(120), default="")
    nin_last4 = Column(String(4), default="")
    verified_first_name = Column(String(120), default="")
    verified_middle_name = Column(String(120), default="")
    verified_surname = Column(String(120), default="")
    verified_phone = Column(String(50), default="")
    verified_gender = Column(String(30), default="")
    verified_birthdate = Column(String(40), default="")
    verified_photo_url = Column(Text, default="")
    selfie_url = Column(Text, default="")
    profile_photo_url = Column(Text, default="")
    id_document_url = Column(Text, default="")
    vehicle_type = Column(String(80), default="")
    partner_company = Column(String(150), default="")
    plate_number = Column(String(80), default="")
    driver_license_number = Column(String(120), default="")
    vehicle_photo_url = Column(Text, default="")
    kyc_status = Column(String(30), default="KYC_PENDING", index=True)
    operational_status = Column(String(30), default="OFFLINE", index=True)
    review_note = Column(Text, default="")
    trust_score = Column(Float, default=100)
    completed_deliveries = Column(Integer, default=0)
    failed_deliveries = Column(Integer, default=0)
    late_deliveries = Column(Integer, default=0)
    customer_complaints = Column(Integer, default=0)
    suspicious_gps_gaps = Column(Integer, default=0)
    latest_latitude = Column(Float, nullable=True)
    latest_longitude = Column(Float, nullable=True)
    latest_accuracy = Column(Float, nullable=True)
    latest_heading = Column(Float, nullable=True)
    latest_speed = Column(Float, nullable=True)
    last_seen_at = Column(DateTime, nullable=True)
    inside_zone = Column(Boolean, default=False)
    fcm_token = Column(Text, default="")
    fcm_tokens_json = Column(Text, default="[]")
    approved_at = Column(DateTime, nullable=True)
    approved_by_admin_id = Column(Integer, nullable=True)
    approved_by_admin_name = Column(String(150), default="")
    suspended_at = Column(DateTime, nullable=True)
    deactivated_at = Column(DateTime, nullable=True)
    force_logout_at = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime, nullable=True, index=True)
    deleted_by_admin_id = Column(Integer, nullable=True)
    deleted_reason = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")


class Rider(Base):
    __tablename__ = "riders"

    id = Column(Integer, primary_key=True, index=True)
    delivery_worker_id = Column(Integer, ForeignKey("delivery_workers.id"), nullable=False, unique=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    full_name = Column(String(150), default="", index=True)
    phone = Column(String(50), default="", index=True)
    email = Column(String(150), default="", index=True)
    status = Column(String(30), default="pending", index=True)
    onboarding_stage = Column(String(50), default="account_created", index=True)
    wallet_enabled = Column(Boolean, default=False)
    can_go_online = Column(Boolean, default=False)
    can_accept_orders = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    worker = relationship("DeliveryWorker")
    user = relationship("User")


class RiderKyc(Base):
    __tablename__ = "rider_kyc"

    id = Column(Integer, primary_key=True, index=True)
    delivery_worker_id = Column(Integer, ForeignKey("delivery_workers.id"), nullable=False, unique=True, index=True)
    current_step = Column(Integer, default=1, index=True)
    onboarding_stage = Column(String(50), default="account_created", index=True)
    identity_status = Column(String(30), default="not_started", index=True)
    address_status = Column(String(30), default="not_started", index=True)
    emergency_status = Column(String(30), default="not_started", index=True)
    selfie_status = Column(String(30), default="not_started", index=True)
    admin_review_status = Column(String(30), default="pending", index=True)
    nin_hash = Column(String(80), default="", index=True)
    submitted_nin = Column(String(20), default="")
    nin_last4 = Column(String(4), default="")
    nin_verified = Column(Boolean, default=False)
    nin_provider = Column(String(80), default="ninbvnportal")
    nin_provider_report_id = Column(String(120), default="")
    nin_provider_status = Column(String(80), default="")
    nin_provider_message = Column(Text, default="")
    nin_response_json = Column(Text, default="{}")
    verified_full_name = Column(String(255), default="")
    verified_dob = Column(String(40), default="")
    verified_phone = Column(String(50), default="")
    verified_gender = Column(String(30), default="")
    verified_address = Column(Text, default="")
    consent_accepted = Column(Boolean, default=False)
    consent_timestamp = Column(DateTime, nullable=True)
    consent_device_json = Column(Text, default="{}")
    consent_ip_address = Column(String(80), default="")
    verification_attempt_count = Column(Integer, default=0)
    last_verification_at = Column(DateTime, nullable=True)
    confidence_score = Column(Float, default=0)
    fraud_flags_json = Column(Text, default="{}")
    duplicate_nin = Column(Boolean, default=False)
    duplicate_selfie = Column(Boolean, default=False)
    rejection_reason = Column(Text, default="")
    resubmission_requested = Column(Boolean, default=False)
    submitted_at = Column(DateTime, nullable=True)
    identity_verified_at = Column(DateTime, nullable=True)
    address_uploaded_at = Column(DateTime, nullable=True)
    emergency_contact_added_at = Column(DateTime, nullable=True)
    selfie_verified_at = Column(DateTime, nullable=True)
    admin_reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    worker = relationship("DeliveryWorker")


class RiderDocument(Base):
    __tablename__ = "rider_documents"

    id = Column(Integer, primary_key=True, index=True)
    delivery_worker_id = Column(Integer, ForeignKey("delivery_workers.id"), nullable=False, index=True)
    document_type = Column(String(60), nullable=False, index=True)
    file_url = Column(Text, default="")
    file_name = Column(String(255), default="")
    content_type = Column(String(120), default="")
    checksum = Column(String(80), default="", index=True)
    status = Column(String(30), default="submitted", index=True)
    metadata_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    worker = relationship("DeliveryWorker")


class RiderStatusLog(Base):
    __tablename__ = "rider_status_logs"

    id = Column(Integer, primary_key=True, index=True)
    delivery_worker_id = Column(Integer, ForeignKey("delivery_workers.id"), nullable=False, index=True)
    old_stage = Column(String(50), default="")
    new_stage = Column(String(50), default="")
    old_status = Column(String(30), default="")
    new_status = Column(String(30), default="")
    actor_type = Column(String(30), default="system")
    actor_id = Column(Integer, nullable=True)
    actor_name = Column(String(150), default="")
    note = Column(Text, default="")
    metadata_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow)

    worker = relationship("DeliveryWorker")


class VerificationLog(Base):
    __tablename__ = "verification_logs"

    id = Column(Integer, primary_key=True, index=True)
    delivery_worker_id = Column(Integer, ForeignKey("delivery_workers.id"), nullable=False, index=True)
    verification_type = Column(String(60), default="nin", index=True)
    provider = Column(String(80), default="ninbvnportal", index=True)
    request_id = Column(String(120), default="", index=True)
    status = Column(String(50), default="", index=True)
    success = Column(Boolean, default=False)
    http_status = Column(Integer, nullable=True)
    error_code = Column(String(80), default="")
    message = Column(Text, default="")
    response_json = Column(Text, default="{}")
    nin_last4 = Column(String(4), default="")
    attempt_number = Column(Integer, default=0)
    latency_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    worker = relationship("DeliveryWorker")


class RiderSession(Base):
    __tablename__ = "rider_sessions"

    id = Column(Integer, primary_key=True, index=True)
    delivery_worker_id = Column(Integer, ForeignKey("delivery_workers.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String(80), nullable=False, unique=True, index=True)
    device_info_json = Column(Text, default="{}")
    ip_address = Column(String(80), default="")
    is_active = Column(Boolean, default=True, index=True)
    revoked_at = Column(DateTime, nullable=True)
    revoked_by_admin_id = Column(Integer, nullable=True)
    revoked_reason = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    last_seen_at = Column(DateTime, default=datetime.utcnow)

    worker = relationship("DeliveryWorker")
    user = relationship("User")


class DeletedRiderLog(Base):
    __tablename__ = "deleted_rider_logs"

    id = Column(Integer, primary_key=True, index=True)
    delivery_worker_id = Column(Integer, nullable=False, index=True)
    admin_id = Column(Integer, nullable=True, index=True)
    admin_name = Column(String(150), default="")
    reason = Column(Text, default="")
    snapshot_json = Column(Text, default="{}")
    hard_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class AdminReview(Base):
    __tablename__ = "admin_reviews"

    id = Column(Integer, primary_key=True, index=True)
    delivery_worker_id = Column(Integer, ForeignKey("delivery_workers.id"), nullable=False, index=True)
    admin_id = Column(Integer, nullable=True, index=True)
    admin_name = Column(String(150), default="")
    action = Column(String(50), nullable=False, index=True)
    reason = Column(Text, default="")
    required_changes_json = Column(Text, default="[]")
    metadata_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow)

    worker = relationship("DeliveryWorker")


class OperationalZone(Base):
    __tablename__ = "operational_zones"

    id = Column(Integer, primary_key=True, index=True)
    zone_name = Column(String(150), default="FoodNova Local Zone")
    center_latitude = Column(Float, default=6.5244)
    center_longitude = Column(Float, default=3.3792)
    radius_meters = Column(Integer, default=5000)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AppSetting(Base):
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(120), unique=True, nullable=False, index=True)
    value = Column(Text, default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)


class ComingSoonSubscriber(Base):
    __tablename__ = "coming_soon_subscribers"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(150), unique=True, nullable=False, index=True)
    source = Column(String(80), default="coming_soon_page", index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class DeliveryAssignmentLog(Base):
    __tablename__ = "delivery_assignment_logs"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, nullable=True, index=True)
    order_code = Column(String(30), default="", index=True)
    worker_id = Column(Integer, nullable=True, index=True)
    worker_type = Column(String(30), default="")
    worker_name = Column(String(150), default="")
    worker_phone = Column(String(50), default="")
    status = Column(String(60), default="assigned", index=True)
    assigned_by_admin_id = Column(Integer, nullable=True)
    assigned_by_admin_name = Column(String(150), default="")
    released_by_admin_id = Column(Integer, nullable=True)
    released_by_admin_name = Column(String(150), default="")
    released_at = Column(DateTime, nullable=True)
    pickup_time = Column(DateTime, nullable=True)
    pickup_latitude = Column(Float, nullable=True)
    pickup_longitude = Column(Float, nullable=True)
    gps_trail_json = Column(Text, default="[]")
    completion_time = Column(DateTime, nullable=True)
    delivery_code_entered = Column(String(50), default="")
    risk_flags_json = Column(Text, default="[]")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class DeliveryOffer(Base):
    __tablename__ = "delivery_offers"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, nullable=False, index=True)
    order_code = Column(String(30), default="", index=True)
    worker_id = Column(Integer, nullable=False, index=True)
    worker_type = Column(String(30), default="", index=True)
    status = Column(String(30), default="PENDING", index=True)
    assignment_status = Column(String(30), default="PENDING", index=True)
    offer_type = Column(String(30), default="automatic", index=True)
    delivery_type = Column(String(40), default="needs_admin_review", index=True)
    estimated_distance_meters = Column(Float, nullable=True)
    pickup_area = Column(String(180), default="")
    delivery_area = Column(String(180), default="")
    accepted_at = Column(DateTime, nullable=True)
    declined_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=False, index=True)
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
    rider_photo_url = Column(Text, default="")
    delivery_assigned_at = Column(DateTime, nullable=True)
    delivery_started_at = Column(DateTime, nullable=True)
    delivery_completed_at = Column(DateTime, nullable=True)
    delivery_note = Column(Text, default="")
    delivery_type = Column(String(40), default="needs_admin_review", index=True)
    estimated_distance_meters = Column(Float, nullable=True)
    delivery_worker_id = Column(Integer, nullable=True, index=True)
    delivery_worker_type = Column(String(30), default="")
    delivery_status = Column(String(40), default="", index=True)
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
    is_deleted = Column(Boolean, default=False, index=True)
    deleted_at = Column(DateTime, nullable=True)
    deleted_by_admin_id = Column(Integer, nullable=True)
    deleted_by_admin_name = Column(String(150), nullable=True)
    customer_rating = Column(Integer, nullable=True)
    customer_feedback = Column(Text, default="")
    customer_rated_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    product_id = Column(Integer, nullable=True)
    variant_id = Column(Integer, nullable=True, index=True)
    variant_weight = Column(String(40), default="")
    sku = Column(String(120), default="")
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
    device_type = Column(String(80), nullable=True)
    browser = Column(String(120), nullable=True)
    operating_system = Column(String(120), nullable=True)
    location_country = Column(String(120), nullable=True)
    location_region = Column(String(120), nullable=True)
    location_city = Column(String(120), nullable=True)
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

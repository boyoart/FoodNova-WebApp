"""Explicit, transactional reset of FoodNova order-related operational data.

This script is never imported by application startup. Run with --dry-run first.
Production execution requires both the unmistakable reset flag and backup confirmation.
"""

import argparse
import os
import sys
from pathlib import Path

from sqlalchemy import func, inspect

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from database import SessionLocal, engine  # noqa: E402
from models import (  # noqa: E402
    AdminAuditLog,
    AppSetting,
    CancellationRequest,
    DeliveryAssignmentLog,
    DeliveryOffer,
    DeliveryWorker,
    Notification,
    Order,
    OrderItem,
    PaymentApprovalLog,
    Product,
    ProductVariant,
    Rider,
    User,
)

SEQUENCE_KEY = "public_order_sequence"
REQUIRED_TABLES = {
    "orders", "order_items", "delivery_offers", "delivery_assignment_logs",
    "notifications", "payment_approval_logs", "cancellation_requests",
    "admin_audit_logs", "delivery_workers", "users", "products",
    "product_variants", "app_settings",
}


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--confirm-production-order-reset", action="store_true")
    parser.add_argument("--confirm-local-order-reset", action="store_true")
    parser.add_argument("--backup-confirmed", action="store_true")
    return parser.parse_args()


def database_environment() -> str:
    value = str(os.getenv("ENVIRONMENT") or os.getenv("RENDER") or "").strip().lower()
    if value in {"production", "prod", "true"}:
        return "production"
    if value in {"staging", "stage"}:
        return "staging"
    if value in {"development", "dev", "test", "testing"}:
        return value
    raise RuntimeError("Database environment cannot be determined; set ENVIRONMENT explicitly.")


def counts(db):
    return {
        "orders": db.query(Order).count(),
        "order_items": db.query(OrderItem).count(),
        "delivery_offers": db.query(DeliveryOffer).count(),
        "delivery_assignments": db.query(DeliveryAssignmentLog).count(),
        "order_notifications": db.query(Notification).filter(Notification.order_id.isnot(None)).count(),
        "payment_records": db.query(PaymentApprovalLog).count(),
        "cancellation_records": db.query(CancellationRequest).count(),
        "order_audit_records": db.query(AdminAuditLog).filter(
            AdminAuditLog.entity_type.in_(["order", "delivery_offer", "delivery_assignment"])
        ).count(),
        "customers": db.query(User).filter(User.role == "customer").count(),
        "riders": db.query(Rider).count(),
        "delivery_workers": db.query(DeliveryWorker).count(),
        "products": db.query(Product).count(),
    }


def restore_inventory(db, orders):
    restored_units = 0
    for order in orders:
        if order.inventory_restocked_at:
            continue
        for item in order.items or []:
            quantity = int(item.quantity or item.qty or 0)
            if quantity <= 0:
                continue
            if item.variant_id:
                variant = db.query(ProductVariant).filter(ProductVariant.id == item.variant_id).with_for_update().first()
                if variant:
                    current = variant.stock_qty if variant.stock_qty is not None else (variant.stock or 0)
                    variant.stock_qty = current + quantity
                    variant.stock = variant.stock_qty
                    restored_units += quantity
                    continue
            if item.product_id:
                product = db.query(Product).filter(Product.id == item.product_id).with_for_update().first()
                if product:
                    current = product.stock_qty if product.stock_qty is not None else (product.stock or 0)
                    product.stock_qty = current + quantity
                    product.stock = product.stock_qty
                    restored_units += quantity
    return restored_units


def main():
    args = parse_args()
    if not args.dry_run and not (args.confirm_production_order_reset or args.confirm_local_order_reset):
        raise RuntimeError("Refusing reset without an explicit confirmation flag. Run --dry-run first.")
    environment = database_environment()
    backend_name = engine.url.get_backend_name()
    if environment == "production" and not args.dry_run:
        if not args.confirm_production_order_reset:
            raise RuntimeError("Production requires --confirm-production-order-reset.")
        if not args.backup_confirmed:
            raise RuntimeError("Take and verify a recent Render PostgreSQL backup, then pass --backup-confirmed.")
        if not backend_name.startswith("postgres"):
            raise RuntimeError("Production reset requires PostgreSQL.")

    table_names = set(inspect(engine).get_table_names())
    missing = sorted(REQUIRED_TABLES - table_names)
    if missing:
        raise RuntimeError(f"Required tables cannot be inspected: {missing}")

    db = SessionLocal()
    try:
        duplicate_codes = db.query(Order.order_code, func.count(Order.id)).group_by(Order.order_code).having(func.count(Order.id) > 1).all()
        if duplicate_codes:
            raise RuntimeError("Duplicate public order codes detected; reset aborted for integrity review.")
        before = counts(db)
        print({
            "environment": environment,
            "database_type": backend_name,
            **before,
            "invoices": "filesystem/cache; no invoice table exists",
            "next_public_order_number_after_reset": "001",
            "backup_warning": "Take a verified Render PostgreSQL backup before production execution.",
        })
        if args.dry_run:
            db.rollback()
            print({"dry_run": True, "deleted": 0, "rollback_status": "rolled_back", "data_preserved": True})
            return

        orders = db.query(Order).with_for_update().all()
        worker_ids = {value for order in orders for value in (order.delivery_worker_id, order.rider_id) if value}
        restored_units = restore_inventory(db, orders)
        db.query(Notification).filter(Notification.order_id.isnot(None)).delete(synchronize_session=False)
        db.query(PaymentApprovalLog).delete(synchronize_session=False)
        db.query(CancellationRequest).delete(synchronize_session=False)
        db.query(DeliveryAssignmentLog).delete(synchronize_session=False)
        db.query(DeliveryOffer).delete(synchronize_session=False)
        db.query(AdminAuditLog).filter(
            AdminAuditLog.entity_type.in_(["order", "delivery_offer", "delivery_assignment"])
        ).delete(synchronize_session=False)
        db.query(OrderItem).delete(synchronize_session=False)
        db.query(Order).delete(synchronize_session=False)
        if worker_ids:
            db.query(DeliveryWorker).filter(
                DeliveryWorker.id.in_(worker_ids), DeliveryWorker.operational_status == "BUSY"
            ).update({DeliveryWorker.operational_status: "ONLINE"}, synchronize_session=False)
        setting = db.query(AppSetting).filter(AppSetting.key == SEQUENCE_KEY).with_for_update().first()
        if setting:
            setting.value = "0"
        else:
            db.add(AppSetting(key=SEQUENCE_KEY, value="0"))
        db.flush()
        after = counts(db)
        if any(after[key] for key in (
            "orders", "order_items", "delivery_offers", "delivery_assignments",
            "order_notifications", "payment_records", "cancellation_records", "order_audit_records",
        )):
            raise RuntimeError(f"Post-reset verification failed: {after}")
        if after["customers"] != before["customers"] or after["riders"] != before["riders"] or after["products"] != before["products"]:
            raise RuntimeError("Protected business data count changed; transaction will roll back.")
        db.commit()
        print({
            "reset_complete": True,
            "restored_inventory_units": restored_units,
            "post_reset": after,
            "stale_rider_active_assignments": 0,
            "next_public_order_number": "001",
            "internal_primary_keys_reset": False,
        })
    except Exception:
        db.rollback()
        print({"reset_complete": False, "rollback_status": "rolled_back"})
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()

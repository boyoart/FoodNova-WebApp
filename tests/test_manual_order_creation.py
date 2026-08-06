import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DATABASE_URL", f"sqlite:///{ROOT / 'test_foodnova_contracts.db'}")

import main  # noqa: E402


class ManualOrderCreationTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        main.Base.metadata.create_all(engine)
        self.Session = sessionmaker(bind=engine)
        db = self.Session()
        customer = main.DBUser(full_name="Registered Customer", email="customer@example.com", phone="5551000", password="hash", role="customer")
        product = main.DBProduct(name="Rice", price=2500, stock_qty=10, stock=10, is_active=True)
        db.add_all([customer, product])
        db.commit()
        self.customer_id = customer.id
        self.product_id = product.id
        db.close()
        self.admin = {"id": 7, "full_name": "Test Admin", "email": "admin@example.com", "admin_role": "super_admin"}
        self.patches = [
            patch.object(main, "SessionLocal", self.Session),
            patch.object(main, "require_permission", return_value=self.admin),
            patch.object(main, "has_permission", return_value=True),
            patch.object(main, "create_admin_audit_log"),
            patch.object(main, "_create_order_notification"),
            patch.object(main, "ensure_order_invoice_pdf"),
            patch.object(main, "safe_email_call"),
        ]
        self.mocks = [item.start() for item in self.patches]

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()

    def payload(self, **changes):
        values = dict(
            idempotency_key="manual-order-key-0001",
            customer_user_id=self.customer_id,
            customer_name="Registered Customer",
            items=[{"product_id": self.product_id, "quantity": 2}],
            fulfillment_method="pickup",
            payment_method="cash",
            payment_status="pending_payment",
        )
        values.update(changes)
        return main.ManualOrderPayload(**values)

    def test_admin_creates_pickup_order_without_offer(self):
        with patch.object(main, "start_delivery_matching") as matching:
            result = main.create_manual_order(self.payload(), object())
        self.assertTrue(result["success"])
        self.assertEqual(result["order"]["delivery_method"], "pickup")
        self.assertEqual(result["order"]["order_source"], "admin_manual")
        self.mocks[4].assert_called_once()
        self.mocks[3].assert_called_once()
        matching.assert_not_called()

    def test_confirmed_delivery_triggers_matching(self):
        payload = self.payload(
            idempotency_key="manual-order-key-0002", fulfillment_method="delivery",
            delivery_address="123 Test Street", payment_status="payment_confirmed",
        )
        with patch.object(main, "start_delivery_matching") as matching:
            result = main.create_manual_order(payload, object())
        self.assertEqual(result["order"]["order_status"], "processing")
        matching.assert_called_once()

    def test_guest_order_succeeds_without_notification(self):
        notification = self.mocks[4]
        result = main.create_manual_order(self.payload(
            idempotency_key="manual-order-key-0003", customer_user_id=None,
            customer_name="Walk In", customer_email="", customer_phone="5552000",
        ), object())
        self.assertTrue(result["success"])
        self.assertIsNone(result["order"]["customer_user_id"])
        notification.assert_not_called()

    def test_idempotency_prevents_second_stock_deduction(self):
        payload = self.payload(idempotency_key="manual-order-key-0004")
        first = main.create_manual_order(payload, object())
        second = main.create_manual_order(payload, object())
        db = self.Session()
        product = db.query(main.DBProduct).filter(main.DBProduct.id == self.product_id).first()
        order_count = db.query(main.DBOrder).count()
        db.close()
        self.assertFalse(first.get("duplicate", False))
        self.assertTrue(second["duplicate"])
        self.assertEqual(order_count, 1)
        self.assertEqual(product.stock_qty, 8)

    def test_public_numbers_remain_sequential(self):
        first = main.create_manual_order(self.payload(idempotency_key="manual-order-key-0005"), object())
        second = main.create_manual_order(self.payload(idempotency_key="manual-order-key-0006"), object())
        self.assertEqual(first["order"]["order_number"], "001")
        self.assertEqual(second["order"]["order_number"], "002")

    def test_discount_permission_is_enforced(self):
        self.mocks[2].side_effect = lambda _admin, permission: permission != "orders:manual_discount"
        with self.assertRaises(main.HTTPException) as context:
            main.create_manual_order(self.payload(discount_amount=100, discount_reason="Courtesy"), object())
        self.assertEqual(context.exception.status_code, 403)

    def test_stock_override_permission_is_enforced(self):
        self.mocks[2].side_effect = lambda _admin, permission: permission != "orders:stock_override"
        with self.assertRaises(main.HTTPException) as context:
            main.create_manual_order(self.payload(stock_override=True, stock_override_reason="Approved variance"), object())
        self.assertEqual(context.exception.status_code, 403)

    def test_authorized_stock_override_is_recorded_and_deducted_once(self):
        result = main.create_manual_order(self.payload(
            idempotency_key="manual-order-key-0007", items=[{"product_id": self.product_id, "quantity": 12}],
            stock_override=True, stock_override_reason="Approved phone-order variance",
        ), object())
        db = self.Session()
        product = db.query(main.DBProduct).filter(main.DBProduct.id == self.product_id).first()
        db.close()
        self.assertEqual(product.stock_qty, 0)
        self.assertEqual(result["order"]["stock_override_reason"], "Approved phone-order variance")


if __name__ == "__main__":
    unittest.main()

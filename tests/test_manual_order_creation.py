import os
import asyncio
import sys
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timedelta
from io import StringIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import ANY, Mock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DATABASE_URL", f"sqlite:///{ROOT / 'test_foodnova_contracts.db'}")

import main  # noqa: E402
import email_service  # noqa: E402


class JsonRequest:
    headers = {"content-type": "application/json"}

    def __init__(self, payload):
        self.payload = payload

    async def json(self):
        return self.payload


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

    def test_guest_order_requires_a_valid_email(self):
        for key, email in (
            ("manual-order-key-missing-email", ""),
            ("manual-order-key-invalid-email", "not-an-email"),
        ):
            with self.subTest(email=email), self.assertRaises(main.HTTPException) as context:
                main.create_manual_order(self.payload(
                    idempotency_key=key,
                    customer_user_id=None,
                    customer_name="Walk In",
                    customer_email=email,
                    customer_phone="5552000",
                ), object())
            self.assertEqual(context.exception.status_code, 422)

    def test_guest_order_succeeds_without_account_when_email_is_valid(self):
        notification = self.mocks[4]
        result = main.create_manual_order(self.payload(
            idempotency_key="manual-order-key-0003", customer_user_id=None,
            customer_name="Walk In", customer_email="walkin@example.com", customer_phone="5552000",
        ), object())
        self.assertTrue(result["success"])
        self.assertIsNone(result["order"]["customer_user_id"])
        self.assertEqual(result["order"]["customer_email"], "walkin@example.com")

    def create_fulfillment_order(
        self,
        order_code,
        *,
        delivery_method="pickup",
        source="admin_manual",
        payment_status="payment_confirmed",
        status="ready_for_pickup",
        delivery_status="",
        pin_created_at=None,
    ):
        db = self.Session()
        order = main.DBOrder(
            order_code=order_code,
            customer_name="PIN Customer",
            customer_email="pin.customer@example.com",
            delivery_method=delivery_method,
            order_source=source,
            payment_status=payment_status,
            status=status,
            order_status=status,
            fulfillment_status=status,
            delivery_status=delivery_status,
            delivery_code="1604",
            delivery_code_created_at=pin_created_at or datetime.utcnow(),
        )
        db.add(order)
        db.commit()
        order_id = order.id
        db.close()
        return order_id

    def test_pickup_pin_email_uses_existing_pin_and_sends_only_once(self):
        order_id = self.create_fulfillment_order("FN-PICKUP-PIN")
        with patch.object(main, "send_customer_fulfillment_pin_email", return_value={"status": "sent"}) as send:
            first = main.send_eligible_fulfillment_pin_email(order_id, "pickup")
            second = main.send_eligible_fulfillment_pin_email(order_id, "pickup")

        self.assertTrue(first["sent"])
        self.assertTrue(second["duplicate"])
        send.assert_called_once_with(
            "pin.customer@example.com",
            "FN-PICKUP-PIN",
            "PIN Customer",
            "1604",
            "pickup",
            expires_at=ANY,
        )
        db = self.Session()
        audit = db.query(main.DBAdminAuditLog).filter_by(
            entity_id=str(order_id), action="pickup_pin_email_sent"
        ).one()
        self.assertNotIn("1604", audit.metadata_json)
        db.close()

    def test_pickup_email_template_includes_existing_pin_order_and_expiry(self):
        expiry = datetime(2026, 1, 5, 14, 30)
        with patch.object(email_service, "send_email", return_value={"status": "sent"}) as send:
            result = email_service.send_customer_fulfillment_pin_email(
                "pin.customer@example.com",
                "FN-PICKUP-TEMPLATE",
                "PIN Customer",
                "1604",
                "pickup",
                expires_at=expiry,
            )
        self.assertEqual(result["status"], "sent")
        subject, html = send.call_args.args[1:3]
        text = send.call_args.kwargs["text"]
        self.assertEqual(subject, "FoodNova Order #FN-PICKUP-TEMPLATE — Your Pickup PIN")
        self.assertIn("1604", html)
        self.assertIn("1604", text)
        self.assertIn("05 Jan 2026 at 14:30 UTC", text)
        self.assertIn("Do not share this PIN until you are receiving the order", html)

    def test_pin_email_provider_errors_do_not_log_pin(self):
        provider = SimpleNamespace(Emails=SimpleNamespace(send=Mock(side_effect=RuntimeError("request included PIN 1604"))))
        output = StringIO()
        with patch.object(email_service, "is_email_enabled", return_value=True), patch.object(
            email_service, "resend", provider
        ), redirect_stdout(output):
            result = email_service.send_email(
                "pin.customer@example.com",
                "PIN email",
                "PIN content",
                event_type="pickup_fulfillment_pin",
            )
        self.assertEqual(result, {"status": "failed", "error": "RuntimeError"})
        self.assertNotIn("1604", output.getvalue())

    def test_delivery_pin_email_requires_arrived(self):
        order_id = self.create_fulfillment_order(
            "FN-DELIVERY-NOT-ARRIVED",
            delivery_method="delivery",
            status="out_for_delivery",
            delivery_status="IN_TRANSIT",
        )
        with patch.object(main, "send_customer_fulfillment_pin_email") as send:
            result = main.send_eligible_fulfillment_pin_email(order_id, "delivery")
        self.assertEqual(result["reason"], "delivery_pin_not_eligible")
        send.assert_not_called()

    def test_arrived_manual_delivery_emails_existing_pin(self):
        order_id = self.create_fulfillment_order(
            "FN-DELIVERY-ARRIVED",
            delivery_method="delivery",
            status="out_for_delivery",
            delivery_status="ARRIVED",
        )
        with patch.object(main, "send_customer_fulfillment_pin_email", return_value={"status": "sent"}) as send:
            result = main.send_eligible_fulfillment_pin_email(order_id, "delivery")
        self.assertTrue(result["sent"])
        self.assertEqual(send.call_args.args[3:5], ("1604", "delivery"))

    def test_unpaid_cancelled_expired_and_customer_app_orders_do_not_email(self):
        invalid_orders = [
            self.create_fulfillment_order("FN-PIN-UNPAID", payment_status="pending_payment"),
            self.create_fulfillment_order("FN-PIN-CANCELLED", status="cancelled"),
            self.create_fulfillment_order(
                "FN-PIN-EXPIRED",
                pin_created_at=datetime.utcnow() - main.PICKUP_PIN_TTL - timedelta(seconds=1),
            ),
            self.create_fulfillment_order("FN-PIN-CUSTOMER", source="customer_app"),
        ]
        with patch.object(main, "send_customer_fulfillment_pin_email") as send:
            results = [main.send_eligible_fulfillment_pin_email(order_id, "pickup") for order_id in invalid_orders]
        self.assertTrue(all(not result["sent"] for result in results))
        send.assert_not_called()

    def test_resend_uses_existing_pin_and_is_rate_limited(self):
        order_id = self.create_fulfillment_order("FN-PIN-RESEND")
        admin = {"id": 9, "full_name": "Test Admin", "email": "admin@example.com"}
        with patch.object(main, "send_customer_fulfillment_pin_email", return_value={"status": "sent"}) as send:
            first = main.send_eligible_fulfillment_pin_email(order_id, force_resend=True, admin=admin)
            second = main.send_eligible_fulfillment_pin_email(order_id, force_resend=True, admin=admin)
        self.assertTrue(first["sent"])
        self.assertEqual(second["reason"], "resend_rate_limited")
        send.assert_called_once()

    def test_email_failure_does_not_change_fulfillment_or_verification_state(self):
        order_id = self.create_fulfillment_order("FN-PIN-EMAIL-FAILURE")
        with patch.object(main, "send_customer_fulfillment_pin_email", return_value={"status": "failed"}) as send:
            result = main.send_eligible_fulfillment_pin_email(order_id, "pickup")
            repeated = main.send_eligible_fulfillment_pin_email(order_id, "pickup")
        self.assertFalse(result["sent"])
        self.assertEqual(repeated["reason"], "email_attempt_already_made")
        send.assert_called_once()
        db = self.Session()
        order = db.query(main.DBOrder).filter_by(id=order_id).one()
        self.assertEqual(order.order_status, "ready_for_pickup")
        self.assertEqual(order.delivery_code, "1604")
        db.close()

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

    def test_customer_product_contract_hides_exact_inventory(self):
        db = self.Session()
        product = db.query(main.DBProduct).filter(main.DBProduct.id == self.product_id).first()
        variant = main.DBProductVariant(
            product_id=product.id, sku="RICE-2KG", weight="2kg",
            price=4000, stock_qty=12, stock=12, is_active=True,
        )
        db.add(variant)
        db.commit()
        payload = main.product_to_customer_dict(product)
        db.close()
        self.assertNotIn("stock_qty", payload)
        self.assertNotIn("stock", payload)
        self.assertNotIn("low_stock", payload)
        self.assertTrue(payload["is_available"])
        self.assertEqual(payload["stock_status"], "in_stock")
        self.assertNotIn("stock_qty", payload["variants"][0])

    def test_weight_variants_sort_grams_before_kilograms(self):
        db = self.Session()
        product = db.query(main.DBProduct).filter(main.DBProduct.id == self.product_id).first()
        db.add_all([
            main.DBProductVariant(product_id=product.id, sku="EGUSI-1KG", weight="1kg", price=6000, stock_qty=3, stock=3, is_active=True),
            main.DBProductVariant(product_id=product.id, sku="EGUSI-600G", weight="600g", price=4000, stock_qty=3, stock=3, is_active=True),
        ])
        db.commit()
        payload = main.product_to_customer_dict(product)
        db.close()
        self.assertEqual([variant["weight"] for variant in payload["variants"]], ["600g", "1kg"])

    def test_variant_inventory_is_independent_and_shortage_message_is_private(self):
        db = self.Session()
        product = db.query(main.DBProduct).filter(main.DBProduct.id == self.product_id).first()
        two_kg = main.DBProductVariant(product_id=product.id, sku="RICE-2KG", weight="2kg", price=4000, stock_qty=12, stock=12, is_active=True)
        three_kg = main.DBProductVariant(product_id=product.id, sku="RICE-3KG", weight="3kg", price=7000, stock_qty=6, stock=6, is_active=True)
        db.add_all([two_kg, three_kg])
        db.commit()
        main.validate_and_deduct_inventory(db, [{"product_id": product.id, "variant_id": two_kg.id, "quantity": 2}])
        self.assertEqual(two_kg.stock_qty, 10)
        self.assertEqual(three_kg.stock_qty, 6)
        with self.assertRaises(main.HTTPException) as context:
            main.validate_and_deduct_inventory(db, [{"product_id": product.id, "variant_id": three_kg.id, "quantity": 99}])
        self.assertEqual(context.exception.detail, "Requested quantity is currently unavailable. Please reduce the quantity.")
        self.assertNotIn("6", context.exception.detail)
        db.close()

    def test_admin_price_updates_persist_and_customer_contract_reads_them(self):
        result = asyncio.run(main.admin_bulk_update_product_pricing(JsonRequest({
            "updates": [{"product_id": self.product_id, "price": 3100}],
        })))
        self.assertTrue(result["success"])
        db = self.Session()
        product = db.query(main.DBProduct).filter(main.DBProduct.id == self.product_id).first()
        self.assertEqual(product.price, 3100)
        self.assertEqual(main.product_to_dict(product)["price"], 3100)
        self.assertEqual(main.product_to_customer_dict(product)["price"], 3100)
        db.close()

    def test_variant_price_update_changes_only_selected_variant(self):
        db = self.Session()
        product = db.query(main.DBProduct).filter(main.DBProduct.id == self.product_id).first()
        variants = [
            main.DBProductVariant(product_id=product.id, sku="RICE-2KG", weight="2kg", price=4000, stock_qty=5, stock=5, is_active=True),
            main.DBProductVariant(product_id=product.id, sku="RICE-3KG", weight="3kg", price=7000, stock_qty=5, stock=5, is_active=True),
            main.DBProductVariant(product_id=product.id, sku="RICE-5KG", weight="5kg", price=8000, stock_qty=5, stock=5, is_active=True),
        ]
        db.add_all(variants)
        db.commit()
        target_id = variants[1].id
        db.close()
        asyncio.run(main.admin_bulk_update_product_pricing(JsonRequest({"updates": [{"variant_id": target_id, "price": 7500}]})))
        db = self.Session()
        saved = {variant.weight: variant.price for variant in db.query(main.DBProductVariant).filter(main.DBProductVariant.product_id == self.product_id).all()}
        db.close()
        self.assertEqual(saved, {"2kg": 4000, "3kg": 7500, "5kg": 8000})

    def test_invalid_price_is_rejected(self):
        with self.assertRaises(main.HTTPException) as context:
            asyncio.run(main.admin_bulk_update_product_pricing(JsonRequest({"updates": [{"product_id": self.product_id, "price": -1}]})))
        self.assertEqual(context.exception.status_code, 422)

    def test_bulk_archive_preserves_history_and_variant_siblings(self):
        db = self.Session()
        product = db.query(main.DBProduct).filter(main.DBProduct.id == self.product_id).first()
        first = main.DBProductVariant(product_id=product.id, sku="RICE-2KG", weight="2kg", price=4000, stock_qty=5, stock=5, is_active=True)
        second = main.DBProductVariant(product_id=product.id, sku="RICE-3KG", weight="3kg", price=7000, stock_qty=5, stock=5, is_active=True)
        order = main.DBOrder(order_code="FN-HISTORY", customer_name="History")
        db.add_all([first, second, order])
        db.flush()
        history = main.DBOrderItem(order_id=order.id, product_id=product.id, variant_id=first.id, name="Rice - 2kg", price=4000, quantity=1)
        db.add(history)
        db.commit()
        first_id, second_id, history_id = first.id, second.id, history.id
        db.close()
        result = asyncio.run(main.admin_bulk_archive_products(JsonRequest({"variant_ids": [first_id]})))
        self.assertEqual(result["archived_variants"], 1)
        db = self.Session()
        self.assertFalse(db.query(main.DBProductVariant).filter(main.DBProductVariant.id == first_id).one().is_active)
        self.assertTrue(db.query(main.DBProductVariant).filter(main.DBProductVariant.id == second_id).one().is_active)
        self.assertEqual(db.query(main.DBOrderItem).filter(main.DBOrderItem.id == history_id).one().name, "Rice - 2kg")
        db.close()
        self.assertTrue(any(call.args[2] == "products_bulk_archived" for call in self.mocks[3].call_args_list))

    def test_bulk_archive_invalid_ids_is_transactional(self):
        with self.assertRaises(main.HTTPException) as context:
            asyncio.run(main.admin_bulk_archive_products(JsonRequest({"product_ids": [self.product_id, 999999]})))
        self.assertEqual(context.exception.status_code, 404)
        db = self.Session()
        self.assertTrue(db.query(main.DBProduct).filter(main.DBProduct.id == self.product_id).one().is_active)
        db.close()

    def test_bulk_archive_parent_disappears_from_customer_catalog(self):
        asyncio.run(main.admin_bulk_archive_products(JsonRequest({"product_ids": [self.product_id]})))
        self.assertEqual(main.list_products(), [])

    def test_archived_parent_can_be_restored_with_legacy_variants(self):
        db = self.Session()
        db.add_all([
            main.DBProductVariant(product_id=self.product_id, sku="RESTORE-2KG", weight="2kg", price=4000, stock_qty=4, stock=4, is_active=True),
            main.DBProductVariant(product_id=self.product_id, sku="RESTORE-5KG", weight="5kg", price=8000, stock_qty=0, stock=0, is_active=True),
        ])
        db.commit()
        db.close()

        asyncio.run(main.admin_bulk_archive_products(JsonRequest({"product_ids": [self.product_id]})))
        restored = main.admin_restore_product(self.product_id, object())

        self.assertTrue(restored["product"]["is_active"])
        self.assertEqual(len(restored["restored_variant_ids"]), 2)
        public = main.list_products()
        self.assertEqual([item["name"] for item in public], ["Rice"])
        self.assertTrue(public[0]["is_available"])
        self.assertFalse(next(item for item in public[0]["variants"] if item["weight"] == "5kg")["is_available"])
        self.assertTrue(any(call.args[2] == "product_restored" for call in self.mocks[3].call_args_list))

    def test_unauthorized_bulk_archive_is_blocked(self):
        self.mocks[1].side_effect = main.HTTPException(status_code=403, detail="Forbidden")
        with self.assertRaises(main.HTTPException) as context:
            asyncio.run(main.admin_bulk_archive_products(JsonRequest({"product_ids": [self.product_id]})))
        self.assertEqual(context.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()

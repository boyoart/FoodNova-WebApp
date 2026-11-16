import os
import sys
import unittest
from datetime import datetime, timedelta
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


class AdminAnalyticsTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        main.Base.metadata.create_all(engine)
        self.Session = sessionmaker(bind=engine)
        self.db = self.Session()
        self.session_patch = patch.object(main, "SessionLocal", self.Session)
        self.session_patch.start()
        self.product = main.DBProduct(
            name="Analytics Rice",
            category="Staples",
            stock_qty=20,
            stock=20,
            is_active=True,
        )
        self.db.add(self.product)
        self.db.flush()

    def tearDown(self):
        self.session_patch.stop()
        self.db.close()

    def add_order(self, code, day, *, amount, payment_status, order_status, payment_method="bank_transfer", refund_status="none", delivery_method="pickup", delivery_worker_id=None):
        order = main.DBOrder(
            order_code=code,
            customer_name=code,
            total_amount=amount,
            payment_status=payment_status,
            status=payment_status,
            order_status=order_status,
            fulfillment_status=order_status,
            payment_method=payment_method,
            refund_status=refund_status,
            delivery_method=delivery_method,
            delivery_worker_id=delivery_worker_id,
            is_deleted=False,
            created_at=datetime.combine(day, datetime.min.time()) + timedelta(hours=12),
        )
        self.db.add(order)
        self.db.flush()
        self.db.add(main.DBOrderItem(
            order_id=order.id,
            product_id=self.product.id,
            item_type="product",
            name=self.product.name,
            product_name=self.product.name,
            quantity=1,
            qty=1,
            unit_price=amount,
            line_total=amount,
        ))
        return order

    def get_summary(self, start_date, end_date):
        with patch.object(main, "require_any_permission", return_value={"id": 9}):
            return main.admin_reports_summary(None, start_date.isoformat(), end_date.isoformat())

    def test_summary_reuses_reports_or_order_view_permission(self):
        today = datetime.utcnow().date()
        with patch.object(main, "require_any_permission", return_value={"id": 9}) as permission_check:
            main.admin_reports_summary(None, today.isoformat(), today.isoformat())

        permission_check.assert_called_once_with(None, ["reports:view", "orders:view"])

    def test_summary_filters_dates_and_reports_gross_outstanding_and_refund_limits(self):
        today = datetime.utcnow().date()
        self.add_order("PAID-1", today, amount=1200, payment_status="payment_confirmed", order_status="delivered", payment_method="cash")
        self.add_order("PAID-REFUND", today, amount=300, payment_status="confirmed", order_status="cancelled", payment_method="cash", refund_status="processed")
        self.add_order("PENDING-1", today, amount=800, payment_status="receipt_submitted", order_status="order_placed")
        self.add_order("LAST-DAY", today - timedelta(days=1), amount=9000, payment_status="payment_confirmed", order_status="delivered")
        self.db.commit()

        payload = self.get_summary(today, today)
        summary = payload["summary"]

        self.assertEqual(summary["total_orders"], 3)
        self.assertEqual(summary["gross_collected_revenue"], 1500)
        self.assertEqual(summary["paid_orders"], 2)
        self.assertEqual(summary["average_order_value"], 750)
        self.assertEqual(summary["outstanding_payments"], 800)
        self.assertEqual(summary["processed_refund_orders"], 1)
        self.assertIsNone(summary["refund_adjustment_amount"])
        self.assertIsNone(summary["net_revenue"])
        self.assertEqual(payload["payments_by_method"][0]["payment_method"], "cash")
        self.assertEqual(payload["payments_by_method"][0]["gross_collected_revenue"], 1500)
        self.assertEqual(payload["revenue_by_category"][0]["category"], "Staples")
        self.assertEqual(payload["revenue_by_category"][0]["revenue"], 1500)
        self.assertEqual(payload["period_revenue"]["today"], 1500)
        self.assertIsNone(payload["period_revenue"]["yesterday"])
        self.assertEqual(payload["period_revenue"]["week"], 1500 if today.weekday() == 0 else None)
        self.assertEqual(payload["period_revenue"]["month"], 1500 if today.day == 1 else None)
        self.assertEqual({item["label"]: item["count"] for item in payload["status_distribution"]}, {
            "Pending": 1,
            "Processing": 0,
            "Fulfilment": 0,
            "Completed": 1,
            "Cancelled": 1,
        })

    def test_attention_queue_separates_payment_reviews_and_unassigned_dispatch(self):
        today = datetime.utcnow().date()
        self.add_order("PAYMENT-REVIEW", today, amount=500, payment_status="pending_payment", order_status="order_placed")
        self.add_order("WAITING-DISPATCH", today, amount=700, payment_status="payment_confirmed", order_status="ready_for_pickup", delivery_method="delivery")
        self.db.commit()

        payload = self.get_summary(today, today)

        self.assertEqual(payload["attention_count"], 2)
        self.assertEqual({item["attention_reason"] for item in payload["attention_orders"]}, {"payment_review", "awaiting_dispatch"})
        self.assertEqual(payload["operational_snapshot"]["pending_payment_confirmation"], 1)
        self.assertEqual(payload["operational_snapshot"]["awaiting_dispatch"], 1)
        self.assertEqual(payload["operational_snapshot"]["active_deliveries"], 0)

    def test_empty_paid_dataset_returns_genuine_zero_not_missing_data(self):
        today = datetime.utcnow().date()

        payload = self.get_summary(today, today)

        self.assertEqual(payload["summary"]["gross_collected_revenue"], 0)
        self.assertIsNone(payload["summary"]["net_revenue"])
        self.assertEqual(payload["summary"]["average_order_value"], 0)
        self.assertIsNone(payload["summary"]["refund_adjustment_amount"])
        self.assertEqual(payload["period_revenue"]["today"], 0)

    def test_cancelled_unpaid_order_is_not_outstanding_or_actionable(self):
        today = datetime.utcnow().date()
        self.add_order("CANCELLED-UNPAID", today, amount=500, payment_status="pending_payment", order_status="cancelled")
        self.add_order("PICKUP-COMPLETE", today, amount=700, payment_status="paid", order_status="picked_up_by_customer")
        self.db.commit()
        payload = self.get_summary(today, today)
        self.assertEqual(payload["summary"]["outstanding_payments"], 0)
        self.assertEqual(payload["attention_count"], 0)
        self.assertEqual(payload["operational_snapshot"]["pending_payment_confirmation"], 0)
        self.assertEqual(payload["summary"]["completed_orders"], 1)
        self.assertEqual(next(item["count"] for item in payload["status_distribution"] if item["label"] == "Completed"), 1)

    def test_inventory_reports_active_variant_stock_instead_of_stale_parent(self):
        today = datetime.utcnow().date()
        self.product.stock_qty = self.product.stock = 0
        self.db.add(main.DBProductVariant(product_id=self.product.id, sku="ANALYTICS-1KG", weight="1kg", stock_qty=3, stock=3, is_active=True))
        self.db.add(main.DBProductVariant(product_id=self.product.id, sku="ANALYTICS-OLD", weight="2kg", stock_qty=100, stock=100, is_active=False))
        self.db.commit()
        payload = self.get_summary(today, today)
        self.assertEqual(payload["summary"]["low_stock_products"], 1)
        self.assertEqual(payload["summary"]["out_of_stock_products"], 0)
        self.assertEqual(payload["low_stock"][0]["stock_qty"], 3)

    def test_report_counts_all_matching_orders_not_a_list_page(self):
        today = datetime.utcnow().date()
        for index in range(105):
            self.add_order(f"PAGE-{index}", today, amount=10, payment_status="paid", order_status="delivered")
        self.db.commit()
        payload = self.get_summary(today, today)
        self.assertEqual(payload["summary"]["total_orders"], 105)
        self.assertEqual(payload["summary"]["gross_collected_revenue"], 1050)
        self.assertEqual(len(payload["recent_orders"]), 10)

    def test_reversed_date_range_is_rejected(self):
        today = datetime.utcnow().date()
        with self.assertRaises(main.HTTPException) as raised:
            self.get_summary(today, today - timedelta(days=1))
        self.assertEqual(raised.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()

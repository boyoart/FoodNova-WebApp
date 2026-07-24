import os
import sys
import unittest
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DATABASE_URL", f"sqlite:///{ROOT / 'test_foodnova_contracts.db'}")

import main  # noqa: E402
from services.ninbvnportal_service import authoritative_nin_provider_success  # noqa: E402
from fastapi import HTTPException  # noqa: E402


def tracking_order(status: str, pin: str = "1604") -> SimpleNamespace:
    now = datetime(2026, 7, 17, 12, 0, 0)
    return SimpleNamespace(
        id=25,
        order_code="FN-00025",
        customer_name="Test Customer",
        customer_email="customer+staging@example.com",
        customer_phone="+15555550100",
        payment_status="payment_confirmed",
        status=status.lower(),
        order_status=status.lower(),
        fulfillment_status=status.lower(),
        delivery_status=status,
        delivery_code=pin,
        delivery_method="delivery",
        total_amount=1000,
        created_at=now,
        updated_at=now,
        receipt=None,
        cancellation_status="",
        refund_status="",
        rider_id=13,
        delivery_worker_id=13,
        rider_name="Test Rider",
        rider_phone="+15555550101",
        rider_photo_url="",
        rider_vehicle_type="Motorcycle",
        rider_vehicle_make="",
        rider_vehicle_model="",
        rider_vehicle_color="",
        rider_vehicle_plate_number="TEST-13",
        rider_assigned_at=now,
        delivery_accepted_at=now,
        arrived_at_pickup_at=None,
        picked_up_at=None,
        out_for_delivery_at=None,
        arrived_at=None,
        delivered_at=None,
        delivery_completed_at=None,
        items=[],
    )


class BackendContractRegressionTests(unittest.TestCase):
    def test_public_order_number_is_three_digits_without_wrapping(self):
        self.assertEqual(main.public_order_number_from_code("FN-1"), "001")
        self.assertEqual(main.public_order_number_from_code("FN-999"), "999")
        self.assertEqual(main.public_order_number_from_code("FN-1000"), "1000")

    def test_dispatch_client_out_for_delivery_alias_is_supported(self):
        self.assertEqual(
            main.normalize_delivery_status_transition("out_for_delivery"),
            ("out_for_delivery", "IN_TRANSIT"),
        )

    def test_delivery_proof_accepts_mobile_pin_key(self):
        payload = main.DeliveryProofPayload(entered_pin="1604")
        self.assertEqual(payload.entered_pin, "1604")

    def test_delivery_state_machine_accepts_forward_transition(self):
        main.validate_delivery_status_transition("PICKED_UP", "IN_TRANSIT")

    def test_legacy_manual_assignment_can_arrive_at_pickup(self):
        main.validate_delivery_status_transition("ASSIGNED", "ARRIVED_AT_PICKUP")
        self.assertEqual(
            main.delivery_available_actions("ASSIGNED")[0],
            "arrived_at_pickup",
        )

    def test_delivery_state_machine_rejects_backward_transition(self):
        with self.assertRaises(HTTPException) as context:
            main.validate_delivery_status_transition("IN_TRANSIT", "PICKED_UP")
        self.assertEqual(context.exception.status_code, 409)

    def test_google_directions_polyline_is_decoded(self):
        points = main.decode_google_polyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")
        self.assertEqual(len(points), 3)
        self.assertAlmostEqual(points[0]["latitude"], 38.5)
        self.assertAlmostEqual(points[0]["longitude"], -120.2)

    def test_online_active_rider_is_manually_assignable_without_location(self):
        worker = SimpleNamespace(
            kyc_status="ACTIVE",
            deleted_at=None,
            operational_status="ONLINE",
            latest_latitude=None,
            latest_longitude=None,
        )
        result = main.manual_assignment_eligibility(worker)
        self.assertTrue(result["assignment_eligible"])
        self.assertFalse(result["location_present"])

    def test_canada_coordinates_do_not_exclude_active_rider(self):
        worker = SimpleNamespace(
            kyc_status="ACTIVE",
            deleted_at=None,
            operational_status="ONLINE",
            latest_latitude=43.6532,
            latest_longitude=-79.3832,
        )
        result = main.manual_assignment_eligibility(worker)
        self.assertTrue(result["assignment_eligible"])
        self.assertTrue(result["location_present"])

    def test_active_delivery_excludes_manual_assignment_with_reason(self):
        worker = SimpleNamespace(
            kyc_status="ACTIVE",
            deleted_at=None,
            operational_status="ONLINE",
            latest_latitude=43.6532,
            latest_longitude=-79.3832,
        )
        result = main.manual_assignment_eligibility(worker, active_delivery_id=99)
        self.assertFalse(result["assignment_eligible"])
        self.assertEqual(result["exclusion_reason"], "active_delivery")

    def test_customer_tracking_hides_pin_until_arrival(self):
        for status in ("ACCEPTED", "PICKED_UP", "IN_TRANSIT", "DELIVERED"):
            with self.subTest(status=status):
                data = main.public_tracking_order_to_dict(tracking_order(status))
                self.assertEqual(data["delivery_pin"], "")
                self.assertEqual(data["delivery_code"], "")

        arrived = main.public_tracking_order_to_dict(tracking_order("ARRIVED"))
        self.assertEqual(arrived["delivery_pin"], "1604")
        self.assertEqual(arrived["delivery_code"], "1604")

    def test_notification_contract_includes_navigation_data(self):
        notification = SimpleNamespace(
            id=9,
            order_id=25,
            order_code="FN-00025",
            user_email="rider+staging@example.com",
            customer_email="rider+staging@example.com",
            title="Delivery assigned",
            message="Open the active delivery.",
            type="delivery_assigned",
            category="delivery",
            is_read=False,
            created_at=datetime(2026, 7, 17, 12, 0, 0),
        )
        data = main.notification_to_dict(notification)
        self.assertEqual(data["screen"], "active_delivery")
        self.assertEqual(data["destination"], "/delivery/25")
        self.assertEqual(data["data"]["order_id"], "25")

    def test_pending_targeted_offer_is_actionable(self):
        now = datetime(2026, 7, 23, 12, 0, 0)
        offer = SimpleNamespace(
            id=7, order_id=25, order_code="FN-002", worker_id=4,
            worker_type="RIDER", status="PENDING", assignment_status="PENDING",
            offer_type="targeted", delivery_type="standard",
            estimated_distance_meters=1800, pickup_area="FoodNova pickup",
            delivery_area="Toronto", accepted_at=None, declined_at=None,
            expires_at=now, created_at=now, updated_at=now,
        )
        data = main.delivery_offer_to_dict(offer)
        self.assertEqual(data["offer_type"], "targeted")
        self.assertEqual(data["order_number"], "002")
        self.assertEqual(data["allowed_actions"], ["accept", "decline"])

    def test_pickup_orders_are_not_dispatch_eligible(self):
        pickup = tracking_order("PAYMENT_CONFIRMED")
        pickup.delivery_method = "pickup"
        ready, reason = main.delivery_order_ready_for_matching(pickup)
        self.assertFalse(ready)
        self.assertEqual(reason, "not_delivery")

    def test_pickup_state_machine_is_separate_from_delivery(self):
        main.validate_pickup_status_transition("ORDER_PLACED", "PREPARING")
        main.validate_pickup_status_transition("PREPARING", "READY_FOR_PICKUP")
        with self.assertRaises(HTTPException):
            main.validate_pickup_status_transition("READY_FOR_PICKUP", "DELIVERED")

    def test_pickup_order_receives_secure_collection_pin(self):
        db = main.SessionLocal()
        try:
            order = main.DBOrder(delivery_method="pickup")
            with patch.object(main, "generate_delivery_pin", return_value="8471"):
                pin = main.ensure_order_delivery_pin(db, order)
            self.assertTrue(pin.isdigit())
            self.assertGreaterEqual(len(pin), 4)
            self.assertEqual(order.delivery_code, pin)
        finally:
            db.close()

    def test_customer_sees_pickup_pin_only_when_ready(self):
        order = main.DBOrder(
            id=44,
            order_code="FN-044",
            delivery_method="pickup",
            delivery_code="1604",
            order_status="preparing",
            fulfillment_status="preparing",
            status="preparing",
        )
        hidden = main.order_to_dict_for_context(order, context="customer")
        self.assertEqual(hidden["delivery_pin"], "")
        order.order_status = "ready_for_pickup"
        order.fulfillment_status = "ready_for_pickup"
        ready = main.order_to_dict_for_context(order, context="customer")
        self.assertEqual(ready["delivery_pin"], "1604")

    def test_pickup_terminal_state_cannot_regress(self):
        with self.assertRaises(HTTPException):
            main.validate_pickup_status_transition(
                "PICKED_UP_BY_CUSTOMER", "READY_FOR_PICKUP"
            )

    def test_nin_http_success_without_explicit_provider_success_is_rejected(self):
        verified, _ = authoritative_nin_provider_success(
            {
                "status": "success",
                "data": {
                    "nin": "12345678901",
                    "full_name": "Test Person",
                    "date_of_birth": "1990-01-01",
                },
            },
            "12345678901",
        )
        self.assertFalse(verified)

    def test_nin_mismatch_is_rejected(self):
        verified, _ = authoritative_nin_provider_success(
            {
                "status": "success",
                "success": True,
                "data": {
                    "nin": "10987654321",
                    "full_name": "Test Person",
                    "date_of_birth": "1990-01-01",
                },
            },
            "12345678901",
        )
        self.assertFalse(verified)

    def test_explicit_matching_nin_provider_success_is_accepted(self):
        verified, identity = authoritative_nin_provider_success(
            {
                "status": "success",
                "success": True,
                "data": {
                    "nin": "12345678901",
                    "full_name": "Test Person",
                    "date_of_birth": "1990-01-01",
                },
            },
            "12345678901",
        )
        self.assertTrue(verified)
        self.assertEqual(identity["full_name"], "Test Person")


if __name__ == "__main__":
    unittest.main()

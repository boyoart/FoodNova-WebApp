import os
import sys
import unittest
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DATABASE_URL", f"sqlite:///{ROOT / 'test_foodnova_contracts.db'}")

import main  # noqa: E402
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


if __name__ == "__main__":
    unittest.main()

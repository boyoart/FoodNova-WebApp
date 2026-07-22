import os
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DATABASE_URL", f"sqlite:///{ROOT / 'test_foodnova_contracts.db'}")

import main  # noqa: E402
from models import DeliveryWorker, RiderDocument, RiderKyc  # noqa: E402


class _DocumentQuery:
    def __init__(self, documents):
        self.documents = documents

    def filter(self, *_args):
        return self

    def order_by(self, *_args):
        return self

    def all(self):
        return self.documents

    def first(self):
        return self.documents[0] if self.documents else None


class _Db:
    def __init__(self, documents=None):
        self.documents = documents or []

    def query(self, model):
        if model is RiderDocument:
            return _DocumentQuery(self.documents)
        return _DocumentQuery([])


def worker(**values):
    defaults = {
        "id": 7, "user_id": 70, "worker_type": "rider", "full_name": "Test Rider",
        "phone": "5550100", "email": "rider@example.test", "kyc_status": "ONBOARDING",
        "review_note": "", "home_address": "", "emergency_contact_name": "",
        "emergency_contact_phone": "", "selfie_url": "", "id_document_url": "",
        "vehicle_type": "", "plate_number": "", "nin_verified": False, "nin_report_id": "",
    }
    defaults.update(values)
    return DeliveryWorker(**defaults)


def kyc(**values):
    defaults = {
        "delivery_worker_id": 7, "current_step": 1, "onboarding_stage": "account_created",
        "identity_status": "not_started", "address_status": "not_started",
        "emergency_status": "not_started", "selfie_status": "not_started",
        "admin_review_status": "pending", "nin_verified": False, "nin_provider_report_id": "",
        "nin_last4": "", "verified_full_name": "", "submitted_at": None,
    }
    defaults.update(values)
    return RiderKyc(**defaults)


class DispatchOnboardingResumeTests(unittest.TestCase):
    def test_new_rider_starts_at_nin(self):
        state = main.authoritative_onboarding_state(_Db(), worker(), kyc())
        self.assertEqual(state["first_incomplete_step"], 1)
        self.assertEqual(state["destination"], "onboarding")

    def test_stale_backend_step_four_cannot_skip_missing_nin(self):
        state = main.authoritative_onboarding_state(_Db(), worker(), kyc(current_step=4))
        self.assertEqual(state["first_incomplete_step"], 1)

    def test_verified_identity_with_missing_address_starts_at_address(self):
        rider = worker(nin_verified=True, nin_report_id="provider-report", nin_last4="1234", verified_first_name="Test")
        record = kyc(
            current_step=8, identity_status="verified", nin_verified=True,
            nin_provider_report_id="provider-report", nin_last4="1234", verified_full_name="Test Rider",
        )
        state = main.authoritative_onboarding_state(_Db(), rider, record)
        self.assertEqual(state["first_incomplete_step"], 3)

    def test_pending_review_and_approved_and_rejected_destinations(self):
        base = dict(nin_verified=True, nin_report_id="provider-report", nin_last4="1234", verified_first_name="Test")
        submitted = kyc(nin_verified=True, nin_provider_report_id="provider-report", nin_last4="1234", submitted_at=main.datetime.utcnow())
        self.assertEqual(main.authoritative_onboarding_state(_Db(), worker(kyc_status="PENDING_REVIEW", **base), submitted)["destination"], "pending_review")
        self.assertEqual(main.authoritative_onboarding_state(_Db(), worker(kyc_status="ACTIVE", **base), submitted)["destination"], "dashboard")
        self.assertEqual(main.authoritative_onboarding_state(_Db(), worker(kyc_status="REJECTED", **base), submitted)["destination"], "rejected")

    def test_full_resubmission_preserves_provider_truth_but_restarts_at_nin(self):
        review_note = main.json_dump({"force_reonboarding": {"active": True, "scope": "full_resubmission", "reason": "Periodic KYC review"}})
        rider = worker(nin_verified=True, nin_report_id="provider-report", nin_last4="1234", verified_first_name="Test", review_note=review_note, kyc_status="ONBOARDING")
        record = kyc(nin_verified=True, nin_provider_report_id="provider-report", nin_last4="1234", verified_full_name="Test Rider")
        state = main.authoritative_onboarding_state(_Db(), rider, record)
        self.assertEqual(state["first_incomplete_step"], 1)
        self.assertTrue(state["force_reonboarding"]["active"])
        self.assertTrue(rider.nin_verified)
        self.assertEqual(record.nin_provider_report_id, "provider-report")

    def test_dispatch_resolver_rejects_legacy_and_unscoped_navigation(self):
        source = (ROOT / "foodnova-dispatch-app/src/lib/onboarding.ts").read_text(encoding="utf-8")
        screen = (ROOT / "foodnova-dispatch-app/app/onboarding/index.tsx").read_text(encoding="utf-8")
        self.assertIn("parsed >= 1 && parsed <= ONBOARDING_STAGES.length", source)
        self.assertIn("ONBOARDING_DRAFT_KEY}:${String(accountId", source)
        self.assertIn("remove the unsafe legacy global draft", source)
        self.assertNotIn("Math.max(draft.step", screen)
        self.assertIn("setStep(serverStep)", screen)

    def test_force_reonboarding_contract_is_permission_protected_and_uses_modal(self):
        routes = {(route.path, ",".join(getattr(route, "methods", None) or [])) for route in main.fastapi_app.routes}
        self.assertTrue(any(path.endswith("/force-reonboarding") and "PATCH" in methods for path, methods in routes))
        self.assertIn("rider_kyc:force_reonboarding", main.ADMIN_ROLE_PERMISSIONS["super_admin"])
        frontend = (ROOT / "frontend/src/pages/AdminRiderKycDetail.jsx").read_text(encoding="utf-8")
        self.assertIn("role=\"dialog\"", frontend)
        self.assertIn("first_incomplete", frontend)
        self.assertIn("full_resubmission", frontend)
        self.assertNotIn("window.confirm(promptText)) return\n    try {\n      setWorking(true)\n      const body = await adminAPI.forceRiderReonboarding", frontend)


if __name__ == "__main__":
    unittest.main()

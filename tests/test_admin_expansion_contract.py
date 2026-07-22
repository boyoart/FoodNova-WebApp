import os
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DATABASE_URL", f"sqlite:///{ROOT / 'test_foodnova_contracts.db'}")

import main  # noqa: E402
from models import AppSetting  # noqa: E402


class AdminExpansionContractTests(unittest.TestCase):
    def test_super_admin_has_every_new_module_permission(self):
        required = {
            "reports:view", "announcements:view", "announcements:manage",
            "categories:view", "categories:manage", "website_settings:view",
            "website_settings:manage", "subscribers:view", "subscribers:manage",
            "delivery_zones:view", "delivery_zones:manage",
        }
        self.assertTrue(required.issubset(set(main.ADMIN_ROLE_PERMISSIONS["super_admin"])))

    def test_backend_registers_every_browser_admin_contract(self):
        paths = {route.path for route in main.fastapi_app.routes}
        required = {
            "/admin/reports/summary", "/admin/announcements", "/admin/delivery-zone",
            "/admin/website-settings", "/admin/coming-soon-subscribers",
            "/admin/categories", "/admin/categories/{category_id}",
        }
        self.assertTrue(required.issubset(paths))

    def test_categories_reuse_existing_application_settings_storage(self):
        self.assertEqual(main.PRODUCT_CATEGORIES_KEY, "product_categories")
        self.assertEqual(AppSetting.__tablename__, "app_settings")
        self.assertTrue(AppSetting.__table__.columns["key"].unique)

    def test_browser_routes_are_registered_and_permission_guarded(self):
        app_source = (ROOT / "frontend/src/App.jsx").read_text(encoding="utf-8")
        page_source = (ROOT / "frontend/src/pages/AdminExpansion.jsx").read_text(encoding="utf-8")
        for route in (
            "/admin/reports", "/admin/banners", "/admin/announcements",
            "/admin/delivery-zones", "/admin/website-settings",
            "/admin/coming-soon-subscribers", "/admin/categories",
        ):
            self.assertIn(route, app_source)
        self.assertIn("function AdminGate", page_source)
        self.assertIn("You do not have permission", page_source)

    def test_existing_eight_dashboard_modules_remain(self):
        source = (ROOT / "frontend/src/pages/AdminDashboard.jsx").read_text(encoding="utf-8")
        for title in (
            "Manage Orders", "Delivery Riders", "Stock Management", "Payment Approvals",
            "Broadcasts", "Customers", "Activity Logs", "Admin Users",
        ):
            self.assertIn(title, source)

    def test_homepage_and_mobile_admin_share_announcement_contract(self):
        web = (ROOT / "frontend/src/pages/HomePage.jsx").read_text(encoding="utf-8")
        mobile = (ROOT / "foodnova-customer-app/lib/features/products/data/product_repository.dart").read_text(encoding="utf-8")
        self.assertIn("/announcements/active", web)
        self.assertIn("/announcements/active", mobile)
        self.assertIn("hero_banner", web)
        self.assertIn("hero_banner", mobile)

    def test_reports_page_normalizes_backend_status_arrays_and_has_recovery_state(self):
        source = (ROOT / "frontend/src/pages/AdminExpansion.jsx").read_text(encoding="utf-8")
        self.assertIn("Array.isArray(value)", source)
        self.assertIn("ADMIN_REPORTS_RESPONSE_INVALID", source)
        self.assertIn("Unable to load reports", source)
        self.assertIn("Retry", source)

    def test_rider_kyc_browser_routes_and_api_contracts_are_reachable(self):
        app_source = (ROOT / "frontend/src/App.jsx").read_text(encoding="utf-8")
        rider_source = (ROOT / "frontend/src/pages/AdminRiders.jsx").read_text(encoding="utf-8")
        detail_source = (ROOT / "frontend/src/pages/AdminRiderKycDetail.jsx").read_text(encoding="utf-8")
        api_source = (ROOT / "frontend/src/services/api.js").read_text(encoding="utf-8")
        self.assertIn('/admin/riders/:riderId', app_source)
        self.assertIn('Pending KYC Review', rider_source)
        self.assertIn('/admin/rider-verification-queue', api_source)
        self.assertIn("You do not have permission to view rider KYC records", detail_source)
        self.assertIn("Manual approval does not change", detail_source)

    def test_manual_approval_is_separate_from_provider_nin_verification(self):
        class Worker:
            review_note = main.json_dump({"manual_approval": {"active": True}})
            nin_verified = False
            kyc_status = "ACTIVE"
            deleted_at = None

        worker = Worker()
        self.assertTrue(main.rider_manual_approval_active(worker))
        self.assertFalse(worker.nin_verified)
        self.assertEqual(main.rider_lifecycle_status(worker), "ACTIVE")

    def test_super_admin_has_granular_rider_kyc_permissions(self):
        required = {"rider_kyc:view", "rider_kyc:review", "rider_kyc:force_reonboarding", "riders:worker_type", "riders:delete"}
        self.assertTrue(required.issubset(set(main.ADMIN_ROLE_PERMISSIONS["super_admin"])))


if __name__ == "__main__":
    unittest.main()

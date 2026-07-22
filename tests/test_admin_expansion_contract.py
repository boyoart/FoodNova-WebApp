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


if __name__ == "__main__":
    unittest.main()

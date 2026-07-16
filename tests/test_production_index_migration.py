from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "backend" / "scripts" / "apply_production_index_migration.py"


def load_script_module():
    spec = importlib.util.spec_from_file_location("apply_production_index_migration", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class ProductionIndexMigrationTests(unittest.TestCase):
    def test_expected_index_list_is_exact(self):
        module = load_script_module()
        self.assertEqual(
            [index.name for index in module.EXPECTED_INDEXES],
            [
                "ix_delivery_offers_assignment_status",
                "ix_delivery_riders_deleted_at",
                "ix_delivery_workers_deleted_at",
                "ix_order_items_variant_id",
                "ix_orders_cancellation_status",
                "ix_orders_delivery_status",
                "ix_orders_delivery_type",
                "ix_orders_delivery_worker_id",
                "ix_orders_is_deleted",
                "ix_orders_refund_status",
                "ix_orders_rider_id",
                "ix_rider_kyc_current_step",
            ],
        )

    def test_expected_indexes_match_sqlalchemy_metadata(self):
        module = load_script_module()
        module.validate_expected_indexes_match_models()

    def test_generated_sql_is_index_only_and_idempotent(self):
        module = load_script_module()
        sql = "\n".join(module.iter_sql(module.EXPECTED_INDEXES)).upper()
        self.assertIn("CREATE INDEX IF NOT EXISTS", sql)
        self.assertNotIn("ALTER TABLE", sql)
        self.assertNotIn("DROP ", sql)
        self.assertNotIn("INSERT ", sql)
        self.assertNotIn("UPDATE ", sql)
        self.assertNotIn("DELETE ", sql)
        self.assertNotIn("CREATE TABLE", sql)

    def test_existing_equivalent_index_is_not_recreated(self):
        module = load_script_module()
        existing = module.ExpectedIndex(
            "orders", "legacy_orders_rider_lookup", ("rider_id",), False
        )
        with patch.object(module, "existing_indexes", return_value=[existing]):
            missing = module.missing_indexes(object())
        self.assertNotIn("ix_orders_rider_id", [index.name for index in missing])

    def test_wrong_columns_or_uniqueness_are_not_treated_as_equivalent(self):
        module = load_script_module()
        indexes = [
            module.ExpectedIndex("orders", "wrong_column", ("order_code",), False),
            module.ExpectedIndex("orders", "wrong_unique", ("rider_id",), True),
        ]
        expected = module.ExpectedIndex("orders", "ix_orders_rider_id", ("rider_id",), False)
        self.assertIsNone(module.equivalent_index(expected, indexes))

    def test_requires_explicit_confirmation(self):
        env = os.environ.copy()
        env["DATABASE_URL"] = "sqlite:///:memory:"
        result = subprocess.run(
            [sys.executable, str(SCRIPT)],
            cwd=ROOT / "backend",
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("--confirm-production-index-migration", result.stderr)

    def test_rejects_sqlite_even_with_confirmation(self):
        env = os.environ.copy()
        env["DATABASE_URL"] = "sqlite:///:memory:"
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--confirm-production-index-migration"],
            cwd=ROOT / "backend",
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("non-PostgreSQL", result.stderr)

    def test_requires_database_url_from_environment(self):
        env = os.environ.copy()
        env.pop("DATABASE_URL", None)
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--confirm-production-index-migration"],
            cwd=ROOT / "backend",
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("without DATABASE_URL", result.stderr)

    def test_dry_run_does_not_require_postgresql(self):
        env = os.environ.copy()
        env["DATABASE_URL"] = "sqlite:///:memory:"
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--dry-run"],
            cwd=ROOT / "backend",
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0)
        self.assertIn("CREATE INDEX IF NOT EXISTS", result.stdout)
        self.assertIn("No database connection was opened", result.stdout)


if __name__ == "__main__":
    unittest.main()

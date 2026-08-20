from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "backend" / "scripts" / "apply_production_order_schema_migration.py"


def load_script_module():
    spec = importlib.util.spec_from_file_location("apply_production_order_schema_migration", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class ProductionOrderSchemaMigrationTests(unittest.TestCase):
    def test_definitions_match_authoritative_models(self):
        module = load_script_module()
        module.validate_definitions_match_models()

    def test_column_list_is_exact(self):
        module = load_script_module()
        self.assertEqual(
            {(column.table, column.name) for column in module.EXPECTED_COLUMNS},
            {
                ("delivery_offers", "offer_type"),
                *{("orders", name) for name in (
                    "created_by_admin_id", "created_by_admin_name", "customer_feedback",
                    "customer_rated_at", "customer_rating", "customer_user_id",
                    "delivery_fee", "delivery_service_level", "discount_amount",
                    "manual_discount_reason", "manual_idempotency_key", "order_source",
                    "payment_reference", "stock_override_reason", "subtotal_amount", "tax_amount",
                )},
            },
        )

    def test_index_list_and_uniqueness_are_exact(self):
        module = load_script_module()
        indexes = {index.name: index for index in module.EXPECTED_INDEXES}
        self.assertEqual(set(indexes), {
            "ix_delivery_offers_offer_type", "ix_orders_created_by_admin_id",
            "ix_orders_customer_user_id", "ix_orders_manual_idempotency_key",
            "ix_orders_order_source",
        })
        self.assertTrue(indexes["ix_orders_manual_idempotency_key"].unique)
        self.assertFalse(indexes["ix_orders_customer_user_id"].unique)

    def test_sql_is_idempotent_and_non_destructive(self):
        module = load_script_module()
        sql = "\n".join(module.iter_sql()).upper()
        self.assertEqual(sql.count("ADD COLUMN IF NOT EXISTS"), 17)
        self.assertEqual(sql.count("INDEX CONCURRENTLY IF NOT EXISTS"), 5)
        self.assertNotIn("DROP ", sql)
        self.assertNotIn("DELETE ", sql)
        self.assertNotIn("UPDATE ", sql)
        self.assertNotIn("TRUNCATE ", sql)
        self.assertNotIn("CREATE TABLE", sql)
        self.assertNotIn("FOREIGN KEY", sql)
        self.assertNotIn(" NOT NULL", sql)

    def test_unique_index_has_read_only_duplicate_preflight(self):
        source = SCRIPT.read_text(encoding="utf-8").upper()
        self.assertIn("HAVING COUNT(*) > 1", source)
        self.assertIn("REFUSING TO CREATE UNIQUE IDEMPOTENCY INDEX", source)
        self.assertNotIn("UPDATE ORDERS", source)

    def test_requires_both_production_confirmations(self):
        env = os.environ.copy()
        env["DATABASE_URL"] = "sqlite:///:memory:"
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--confirm-production-schema-migration"],
            cwd=ROOT / "backend", env=env, text=True, capture_output=True, check=False,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("--confirm-recent-backup", result.stderr)

    def test_rejects_non_postgresql(self):
        env = os.environ.copy()
        env["DATABASE_URL"] = "sqlite:///:memory:"
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--confirm-production-schema-migration", "--confirm-recent-backup"],
            cwd=ROOT / "backend", env=env, text=True, capture_output=True, check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("non-PostgreSQL", result.stderr)

    def test_dry_run_does_not_connect_or_mutate(self):
        env = os.environ.copy()
        env["DATABASE_URL"] = "sqlite:///:memory:"
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--dry-run"],
            cwd=ROOT / "backend", env=env, text=True, capture_output=True, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('"backfills": []', result.stdout)
        self.assertIn("No database connection was opened", result.stdout)


if __name__ == "__main__":
    unittest.main()

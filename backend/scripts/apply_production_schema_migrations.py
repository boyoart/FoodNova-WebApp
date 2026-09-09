"""Run every reviewed, idempotent FoodNova production schema migration."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from sqlalchemy import text

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import engine  # noqa: E402
from scripts.check_schema import build_schema_report  # noqa: E402
from scripts import apply_production_order_schema_migration as order_schema  # noqa: E402
from scripts import apply_production_index_migration as legacy_indexes  # noqa: E402
from scripts import apply_product_images_migration as product_images  # noqa: E402


def run_all() -> None:
    order_schema.validate_definitions_match_models()
    legacy_indexes.validate_expected_indexes_match_models()
    product_images.validate_definition_matches_models()
    order_schema.require_postgresql()

    order_schema.run_migration()
    product_images.run_migration()

    # Indexes on existing large tables are created outside a transaction.
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
        for index in legacy_indexes.missing_indexes(connection):
            sql = legacy_indexes.create_index_sql(index)
            sql = sql.replace("CREATE UNIQUE INDEX ", "CREATE UNIQUE INDEX CONCURRENTLY ", 1)
            sql = sql.replace("CREATE INDEX ", "CREATE INDEX CONCURRENTLY ", 1)
            print("FOODNOVA_SCHEMA_MIGRATION_APPLY", json.dumps({"sql": sql}))
            connection.execute(text(sql))


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply all reviewed FoodNova production schema migrations")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--confirm-production-schema-migration", action="store_true")
    parser.add_argument("--confirm-recent-backup", action="store_true")
    args = parser.parse_args()
    if args.dry_run:
        print(json.dumps({"mode": "dry_run", "order_schema": True, "legacy_indexes": True, "product_images": True}, sort_keys=True))
        return 0
    if not args.confirm_production_schema_migration or not args.confirm_recent_backup:
        print("Refusing to run without migration and recent-backup confirmations", file=sys.stderr)
        return 2
    before = build_schema_report()
    print("FOODNOVA_SCHEMA_MIGRATION_BEFORE", json.dumps(before, sort_keys=True))
    run_all()
    after = build_schema_report()
    print("FOODNOVA_SCHEMA_MIGRATION_AFTER", json.dumps(after, sort_keys=True))
    if after["has_drift"]:
        raise RuntimeError(f"Schema verification failed: unresolved drift remains: {json.dumps(after, sort_keys=True)}")
    print("FOODNOVA_SCHEMA_MIGRATION_VERIFIED", json.dumps({"has_drift": False}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

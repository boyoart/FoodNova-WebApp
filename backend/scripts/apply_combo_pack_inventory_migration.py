"""Add inventory-linked Combo Pack relationships and immutable order snapshots."""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.dialects import postgresql

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import Base, engine  # noqa: E402
import models  # noqa: F401,E402

ADD_STOCK_UNIT_SQL = "ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_unit VARCHAR(40)"
BACKFILL_STOCK_UNIT_SQL = "UPDATE products SET stock_unit = 'unit' WHERE stock_unit IS NULL OR BTRIM(stock_unit) = ''"
REQUIRE_STOCK_UNIT_SQL = "ALTER TABLE products ALTER COLUMN stock_unit SET NOT NULL"
ADD_PACK_ID_SQL = "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS pack_id INTEGER REFERENCES packs(id) ON DELETE SET NULL"
ADD_ITEM_TYPE_SQL = "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_type VARCHAR(20)"
BACKFILL_ITEM_TYPE_SQL = "UPDATE order_items SET item_type = 'product' WHERE item_type IS NULL OR BTRIM(item_type) = ''"
REQUIRE_ITEM_TYPE_SQL = "ALTER TABLE order_items ALTER COLUMN item_type SET NOT NULL"
ADD_SNAPSHOT_SQL = "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS combo_components_snapshot TEXT"
CREATE_COMPONENTS_SQL = """
CREATE TABLE IF NOT EXISTS combo_pack_components (
    id SERIAL PRIMARY KEY,
    pack_id INTEGER NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    variant_id INTEGER REFERENCES product_variants(id) ON DELETE RESTRICT,
    quantity_per_pack INTEGER NOT NULL,
    unit VARCHAR(40) NOT NULL,
    CONSTRAINT ck_combo_pack_components_quantity_positive CHECK (quantity_per_pack > 0),
    CONSTRAINT uq_combo_pack_component_target UNIQUE (pack_id, product_id, variant_id)
)
"""
INDEX_SQL = (
    "CREATE INDEX IF NOT EXISTS ix_combo_pack_components_id ON combo_pack_components (id)",
    "CREATE INDEX IF NOT EXISTS ix_combo_pack_components_pack_id ON combo_pack_components (pack_id)",
    "CREATE INDEX IF NOT EXISTS ix_combo_pack_components_product_id ON combo_pack_components (product_id)",
    "CREATE INDEX IF NOT EXISTS ix_combo_pack_components_variant_id ON combo_pack_components (variant_id)",
    "CREATE INDEX IF NOT EXISTS ix_order_items_pack_id ON order_items (pack_id)",
)


def validate_definition_matches_models() -> None:
    expected_tables = {
        "combo_pack_components": {"id", "pack_id", "product_id", "variant_id", "quantity_per_pack", "unit"},
    }
    errors = []
    for table_name, expected_columns in expected_tables.items():
        table = Base.metadata.tables.get(table_name)
        actual_columns = {column.name for column in table.columns} if table is not None else set()
        if actual_columns != expected_columns:
            errors.append({"table": table_name, "expected": sorted(expected_columns), "actual": sorted(actual_columns)})

    dialect = postgresql.dialect()
    expected_columns = (
        ("products", "stock_unit", "VARCHAR(40)", False),
        ("order_items", "pack_id", "INTEGER", True),
        ("order_items", "item_type", "VARCHAR(20)", False),
        ("order_items", "combo_components_snapshot", "TEXT", True),
    )
    for table_name, column_name, sql_type, nullable in expected_columns:
        column = Base.metadata.tables[table_name].columns[column_name]
        actual = {
            "sql_type": column.type.compile(dialect=dialect),
            "nullable": column.nullable,
            "foreign_keys": sorted(key.target_fullname for key in column.foreign_keys),
        }
        expected = {
            "sql_type": sql_type,
            "nullable": nullable,
            "foreign_keys": (
                ["packs.id"] if table_name == "order_items" and column_name == "pack_id" else []
            ),
        }
        if actual != expected:
            errors.append({"column": f"{table_name}.{column_name}", "expected": expected, "actual": actual})

    component_table = Base.metadata.tables["combo_pack_components"]
    expected_foreign_keys = {
        "packs.id",
        "products.id",
        "product_variants.id",
    }
    actual_foreign_keys = {key.target_fullname for column in component_table.columns for key in column.foreign_keys}
    if actual_foreign_keys != expected_foreign_keys:
        errors.append({
            "table": "combo_pack_components.foreign_keys",
            "expected": sorted(expected_foreign_keys),
            "actual": sorted(actual_foreign_keys),
        })
    if errors:
        raise RuntimeError(f"Combo Pack migration definitions differ from SQLAlchemy models: {errors}")


def require_postgresql() -> None:
    if not os.environ.get("DATABASE_URL") or not engine.url.get_backend_name().startswith("postgres"):
        raise RuntimeError("DATABASE_URL must explicitly identify PostgreSQL")


def run_migration() -> None:
    tables = set(inspect(engine).get_table_names())
    required = {"packs", "products", "product_variants", "order_items"}
    missing = sorted(required - tables)
    if missing:
        raise RuntimeError(f"Refusing to apply Combo Pack migration; required tables are missing: {missing}")

    with engine.begin() as connection:
        for statement in (
            ADD_STOCK_UNIT_SQL,
            BACKFILL_STOCK_UNIT_SQL,
            REQUIRE_STOCK_UNIT_SQL,
            ADD_PACK_ID_SQL,
            ADD_ITEM_TYPE_SQL,
            BACKFILL_ITEM_TYPE_SQL,
            REQUIRE_ITEM_TYPE_SQL,
            ADD_SNAPSHOT_SQL,
            CREATE_COMPONENTS_SQL,
            *INDEX_SQL,
        ):
            connection.execute(text(statement))

    inspector = inspect(engine)
    if "combo_pack_components" not in inspector.get_table_names():
        raise RuntimeError("Combo Pack component table verification failed")
    expected_columns = {"id", "pack_id", "product_id", "variant_id", "quantity_per_pack", "unit"}
    actual_columns = {column["name"] for column in inspector.get_columns("combo_pack_components")}
    if actual_columns != expected_columns:
        raise RuntimeError(f"Unexpected Combo Pack component schema: {sorted(actual_columns)}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply the reviewed Combo Pack inventory migration")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--confirm-combo-pack-migration", action="store_true")
    parser.add_argument("--confirm-recent-backup", action="store_true")
    args = parser.parse_args()
    validate_definition_matches_models()
    if args.dry_run:
        print("Combo Pack relationship, stock units, and order snapshots are pending.")
        return 0
    require_postgresql()
    if not args.confirm_combo_pack_migration or not args.confirm_recent_backup:
        raise RuntimeError("Refusing to run without migration and recent-backup confirmations")
    run_migration()
    print("Combo Pack inventory migration complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

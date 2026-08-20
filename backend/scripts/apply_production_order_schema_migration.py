"""Apply the reviewed FoodNova order-schema drift migration.

Safety properties:
- PostgreSQL only
- explicit migration and recent-backup confirmations required
- adds only the columns and indexes declared below
- never drops tables/columns, truncates, deletes, or updates application rows
- safe to run more than once

Usage:
    python scripts/apply_production_order_schema_migration.py --dry-run
    python scripts/apply_production_order_schema_migration.py \
        --confirm-production-schema-migration --confirm-recent-backup
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.dialects import postgresql


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import Base, engine  # noqa: E402
import models  # noqa: F401,E402
from scripts.check_schema import build_schema_report  # noqa: E402


@dataclass(frozen=True)
class ExpectedColumn:
    table: str
    name: str
    sql_type: str
    nullable: bool = True
    python_default: object | None = None


@dataclass(frozen=True)
class ExpectedIndex:
    table: str
    name: str
    columns: tuple[str, ...]
    unique: bool = False


EXPECTED_COLUMNS: tuple[ExpectedColumn, ...] = (
    ExpectedColumn("delivery_offers", "offer_type", "VARCHAR(30)", python_default="automatic"),
    ExpectedColumn("orders", "created_by_admin_id", "INTEGER"),
    ExpectedColumn("orders", "created_by_admin_name", "VARCHAR(150)", python_default=""),
    ExpectedColumn("orders", "customer_feedback", "TEXT", python_default=""),
    ExpectedColumn("orders", "customer_rated_at", "TIMESTAMP WITHOUT TIME ZONE"),
    ExpectedColumn("orders", "customer_rating", "INTEGER"),
    ExpectedColumn("orders", "customer_user_id", "INTEGER"),
    ExpectedColumn("orders", "delivery_fee", "FLOAT", python_default=0),
    ExpectedColumn("orders", "delivery_service_level", "VARCHAR(30)", python_default="standard"),
    ExpectedColumn("orders", "discount_amount", "FLOAT", python_default=0),
    ExpectedColumn("orders", "manual_discount_reason", "TEXT", python_default=""),
    ExpectedColumn("orders", "manual_idempotency_key", "VARCHAR(120)"),
    ExpectedColumn("orders", "order_source", "VARCHAR(40)", python_default="customer_app"),
    ExpectedColumn("orders", "payment_reference", "VARCHAR(150)", python_default=""),
    ExpectedColumn("orders", "stock_override_reason", "TEXT", python_default=""),
    ExpectedColumn("orders", "subtotal_amount", "FLOAT", python_default=0),
    ExpectedColumn("orders", "tax_amount", "FLOAT", python_default=0),
)

EXPECTED_INDEXES: tuple[ExpectedIndex, ...] = (
    ExpectedIndex("delivery_offers", "ix_delivery_offers_offer_type", ("offer_type",)),
    ExpectedIndex("orders", "ix_orders_created_by_admin_id", ("created_by_admin_id",)),
    ExpectedIndex("orders", "ix_orders_customer_user_id", ("customer_user_id",)),
    ExpectedIndex(
        "orders",
        "ix_orders_manual_idempotency_key",
        ("manual_idempotency_key",),
        unique=True,
    ),
    ExpectedIndex("orders", "ix_orders_order_source", ("order_source",)),
)


def quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def add_column_sql(column: ExpectedColumn) -> str:
    nullability = "" if column.nullable else " NOT NULL"
    return (
        f"ALTER TABLE {quote_identifier(column.table)} "
        f"ADD COLUMN IF NOT EXISTS {quote_identifier(column.name)} "
        f"{column.sql_type}{nullability}"
    )


def create_index_sql(index: ExpectedIndex) -> str:
    unique = "UNIQUE " if index.unique else ""
    columns = ", ".join(quote_identifier(column) for column in index.columns)
    return (
        f"CREATE {unique}INDEX CONCURRENTLY IF NOT EXISTS "
        f"{quote_identifier(index.name)} ON {quote_identifier(index.table)} ({columns})"
    )


def iter_sql() -> list[str]:
    return [add_column_sql(column) for column in EXPECTED_COLUMNS] + [
        create_index_sql(index) for index in EXPECTED_INDEXES
    ]


def validate_definitions_match_models() -> None:
    dialect = postgresql.dialect()
    errors: list[dict] = []
    for expected in EXPECTED_COLUMNS:
        actual = Base.metadata.tables[expected.table].columns[expected.name]
        actual_default = actual.default.arg if actual.default is not None else None
        facts = {
            "sql_type": actual.type.compile(dialect=dialect),
            "nullable": actual.nullable,
            "python_default": actual_default,
            "has_server_default": actual.server_default is not None,
            "foreign_keys": sorted(key.target_fullname for key in actual.foreign_keys),
        }
        wanted = {
            "sql_type": expected.sql_type,
            "nullable": expected.nullable,
            "python_default": expected.python_default,
            "has_server_default": False,
            "foreign_keys": [],
        }
        if facts != wanted:
            errors.append({"column": f"{expected.table}.{expected.name}", "expected": wanted, "actual": facts})

    metadata_indexes = {
        index.name: ExpectedIndex(
            table=table.name,
            name=index.name or "",
            columns=tuple(column.name for column in index.columns),
            unique=bool(index.unique),
        )
        for table in Base.metadata.tables.values()
        for index in table.indexes
        if index.name
    }
    for expected in EXPECTED_INDEXES:
        actual = metadata_indexes.get(expected.name)
        if actual != expected:
            errors.append({"index": expected.name, "expected": expected.__dict__, "actual": actual.__dict__ if actual else None})
    if errors:
        raise RuntimeError(f"Migration definitions differ from SQLAlchemy models: {json.dumps(errors, sort_keys=True)}")


def require_postgresql() -> None:
    if not os.environ.get("DATABASE_URL"):
        raise RuntimeError("Refusing to run without DATABASE_URL set explicitly")
    backend = engine.url.get_backend_name()
    if not backend.startswith("postgres"):
        raise RuntimeError(f"Refusing to run migration against non-PostgreSQL database: {backend}")


def sanitized_database_target() -> dict:
    return {
        "driver": engine.url.get_backend_name(),
        "host": engine.url.host or "",
        "port": engine.url.port,
        "database": engine.url.database or "",
        "username_present": bool(engine.url.username),
        "password_present": bool(engine.url.password),
    }


def validate_tables_exist() -> None:
    tables = set(inspect(engine).get_table_names())
    missing = sorted({column.table for column in EXPECTED_COLUMNS} - tables)
    if missing:
        raise RuntimeError(f"Refusing to create missing tables: {missing}")


def run_migration() -> None:
    validate_tables_exist()
    # PostgreSQL requires CREATE INDEX CONCURRENTLY outside a transaction.
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
        for column in EXPECTED_COLUMNS:
            statement = add_column_sql(column)
            print("FOODNOVA_SCHEMA_MIGRATION_APPLY", json.dumps({"sql": statement}))
            connection.execute(text(statement))
        duplicate_count = connection.execute(text(
            "SELECT COUNT(*) FROM ("
            "SELECT manual_idempotency_key FROM orders "
            "WHERE manual_idempotency_key IS NOT NULL "
            "GROUP BY manual_idempotency_key HAVING COUNT(*) > 1"
            ") AS duplicate_keys"
        )).scalar_one()
        if duplicate_count:
            raise RuntimeError(
                "Refusing to create unique idempotency index: "
                f"{duplicate_count} duplicate non-null key group(s) exist"
            )
        for index in EXPECTED_INDEXES:
            statement = create_index_sql(index)
            print("FOODNOVA_SCHEMA_MIGRATION_APPLY", json.dumps({"sql": statement}))
            connection.execute(text(statement))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Apply reviewed FoodNova order-schema drift migration.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--confirm-production-schema-migration", action="store_true")
    parser.add_argument(
        "--confirm-recent-backup",
        action="store_true",
        help="Confirms a recent Render PostgreSQL backup was verified before execution.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    validate_definitions_match_models()
    if args.dry_run:
        print(json.dumps({
            "mode": "dry_run",
            "columns": [column.__dict__ for column in EXPECTED_COLUMNS],
            "indexes": [index.__dict__ for index in EXPECTED_INDEXES],
            "sql": iter_sql(),
            "backfills": [],
            "note": "No database connection was opened and no schema or data was changed.",
        }, indent=2, sort_keys=True))
        return 0

    if not args.confirm_production_schema_migration or not args.confirm_recent_backup:
        print(
            "Refusing to run without --confirm-production-schema-migration and --confirm-recent-backup.",
            file=sys.stderr,
        )
        return 2

    require_postgresql()
    print("FOODNOVA_SCHEMA_MIGRATION_TARGET", json.dumps(sanitized_database_target(), sort_keys=True))
    before = build_schema_report()
    print("FOODNOVA_SCHEMA_MIGRATION_BEFORE", json.dumps(before, sort_keys=True))
    run_migration()
    after = build_schema_report()
    print("FOODNOVA_SCHEMA_MIGRATION_AFTER", json.dumps(after, sort_keys=True))
    if after["has_drift"]:
        raise RuntimeError("Schema verification failed: has_drift remains true")
    print("FOODNOVA_SCHEMA_MIGRATION_VERIFIED", json.dumps({"has_drift": False}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

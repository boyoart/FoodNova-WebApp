"""Apply the FoodNova production index-only drift correction.

This script is intentionally narrow:
- PostgreSQL only
- explicit production confirmation required
- creates only the indexes listed in EXPECTED_INDEXES
- does not create/drop tables, alter columns, seed data, or mutate rows
- safe to run more than once

Usage:
    python scripts/apply_production_index_migration.py --dry-run
    python scripts/apply_production_index_migration.py --confirm-production-index-migration
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from sqlalchemy import inspect, text


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import Base, engine  # noqa: E402
import models  # noqa: F401,E402  # register SQLAlchemy models


@dataclass(frozen=True)
class ExpectedIndex:
    table: str
    name: str
    columns: tuple[str, ...]
    unique: bool = False


EXPECTED_INDEXES: tuple[ExpectedIndex, ...] = (
    ExpectedIndex("delivery_offers", "ix_delivery_offers_assignment_status", ("assignment_status",)),
    ExpectedIndex("delivery_riders", "ix_delivery_riders_deleted_at", ("deleted_at",)),
    ExpectedIndex("delivery_workers", "ix_delivery_workers_deleted_at", ("deleted_at",)),
    ExpectedIndex("order_items", "ix_order_items_variant_id", ("variant_id",)),
    ExpectedIndex("orders", "ix_orders_cancellation_status", ("cancellation_status",)),
    ExpectedIndex("orders", "ix_orders_delivery_status", ("delivery_status",)),
    ExpectedIndex("orders", "ix_orders_delivery_type", ("delivery_type",)),
    ExpectedIndex("orders", "ix_orders_delivery_worker_id", ("delivery_worker_id",)),
    ExpectedIndex("orders", "ix_orders_is_deleted", ("is_deleted",)),
    ExpectedIndex("orders", "ix_orders_refund_status", ("refund_status",)),
    ExpectedIndex("orders", "ix_orders_rider_id", ("rider_id",)),
    ExpectedIndex("rider_kyc", "ix_rider_kyc_current_step", ("current_step",)),
)


def quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def create_index_sql(index: ExpectedIndex) -> str:
    unique = "UNIQUE " if index.unique else ""
    columns = ", ".join(quote_identifier(column) for column in index.columns)
    return (
        f"CREATE {unique}INDEX IF NOT EXISTS {quote_identifier(index.name)} "
        f"ON {quote_identifier(index.table)} ({columns})"
    )


def expected_index_names() -> set[str]:
    return {index.name for index in EXPECTED_INDEXES}


def metadata_index_definitions() -> dict[str, ExpectedIndex]:
    definitions: dict[str, ExpectedIndex] = {}
    for table_name, table in Base.metadata.tables.items():
        for index in table.indexes:
            if index.name in expected_index_names():
                definitions[index.name] = ExpectedIndex(
                    table=table_name,
                    name=index.name or "",
                    columns=tuple(column.name for column in index.columns),
                    unique=bool(index.unique),
                )
    return definitions


def validate_expected_indexes_match_models() -> None:
    metadata_definitions = metadata_index_definitions()
    missing_from_models = sorted(expected_index_names() - set(metadata_definitions))
    if missing_from_models:
        raise RuntimeError(f"Expected indexes missing from SQLAlchemy metadata: {missing_from_models}")

    mismatches = []
    for expected in EXPECTED_INDEXES:
        actual = metadata_definitions[expected.name]
        if actual != expected:
            mismatches.append({"expected": expected.__dict__, "actual": actual.__dict__})
    if mismatches:
        raise RuntimeError(f"Expected index definitions do not match models: {json.dumps(mismatches, sort_keys=True)}")


def require_postgresql() -> None:
    if not os.environ.get("DATABASE_URL"):
        raise RuntimeError("Refusing to run without DATABASE_URL set explicitly in the environment")
    backend = engine.url.get_backend_name()
    if not backend.startswith("postgres"):
        raise RuntimeError(f"Refusing to run index migration against non-PostgreSQL database: {backend}")


def sanitized_database_target() -> dict:
    return {
        "driver": engine.url.get_backend_name(),
        "host": engine.url.host or "",
        "port": engine.url.port,
        "database": engine.url.database or "",
        "username_present": bool(engine.url.username),
        "password_present": bool(engine.url.password),
    }


def existing_indexes(connection, table_name: str) -> list[ExpectedIndex]:
    inspector = inspect(connection)
    indexes = []
    for index in inspector.get_indexes(table_name):
        if index.get("name"):
            indexes.append(ExpectedIndex(
                table=table_name,
                name=index["name"],
                columns=tuple(index.get("column_names") or ()),
                unique=bool(index.get("unique")),
            ))
    return indexes


def equivalent_index(expected: ExpectedIndex, indexes: Iterable[ExpectedIndex]) -> ExpectedIndex | None:
    return next((
        index for index in indexes
        if index.columns == expected.columns and index.unique == expected.unique
    ), None)


def missing_indexes(connection) -> list[ExpectedIndex]:
    missing: list[ExpectedIndex] = []
    cache: dict[str, list[ExpectedIndex]] = {}
    for index in EXPECTED_INDEXES:
        cache.setdefault(index.table, existing_indexes(connection, index.table))
        if not equivalent_index(index, cache[index.table]):
            missing.append(index)
    return missing


def equivalent_indexes_with_other_names(connection) -> list[dict[str, str]]:
    alternatives = []
    cache: dict[str, list[ExpectedIndex]] = {}
    for expected in EXPECTED_INDEXES:
        cache.setdefault(expected.table, existing_indexes(connection, expected.table))
        equivalent = equivalent_index(expected, cache[expected.table])
        if equivalent and equivalent.name != expected.name:
            alternatives.append({"expected": expected.name, "existing": equivalent.name})
    return alternatives


def verify_all_indexes(connection) -> None:
    missing = missing_indexes(connection)
    if missing:
        raise RuntimeError(f"Index verification failed; still missing: {[index.name for index in missing]}")


def iter_sql(indexes: Iterable[ExpectedIndex]) -> list[str]:
    return [create_index_sql(index) for index in indexes]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Apply FoodNova production index-only migration.")
    parser.add_argument(
        "--confirm-production-index-migration",
        action="store_true",
        help="Required to execute the migration against PostgreSQL.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print SQL and safety checks without connecting to or mutating the database.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    validate_expected_indexes_match_models()

    if args.dry_run:
        print(json.dumps({
            "mode": "dry_run",
            "expected_indexes": [index.__dict__ for index in EXPECTED_INDEXES],
            "sql": iter_sql(EXPECTED_INDEXES),
            "note": "No database connection was opened and no schema changes were applied.",
        }, indent=2, sort_keys=True))
        return 0

    if not args.confirm_production_index_migration:
        print(
            "Refusing to run without --confirm-production-index-migration.",
            file=sys.stderr,
        )
        return 2

    require_postgresql()
    print("FOODNOVA_INDEX_MIGRATION_TARGET", json.dumps(sanitized_database_target(), sort_keys=True))

    with engine.begin() as connection:
        alternatives = equivalent_indexes_with_other_names(connection)
        if alternatives:
            print("FOODNOVA_INDEX_MIGRATION_EQUIVALENT_EXISTING", json.dumps(alternatives, sort_keys=True))
        missing_before = missing_indexes(connection)
        print("FOODNOVA_INDEX_MIGRATION_MISSING_BEFORE", json.dumps([index.name for index in missing_before]))
        for index in missing_before:
            sql = create_index_sql(index)
            print("FOODNOVA_INDEX_MIGRATION_CREATE", json.dumps({"index": index.name, "sql": sql}, sort_keys=True))
            connection.execute(text(sql))
        verify_all_indexes(connection)
        print("FOODNOVA_INDEX_MIGRATION_VERIFIED", json.dumps([index.name for index in EXPECTED_INDEXES]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

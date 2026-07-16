"""Read-only schema drift report for FoodNova backend deployments.

Usage:
    python scripts/check_schema.py

The script imports the recovered backend models, inspects the configured
DATABASE_URL, and reports missing tables, columns, and indexes without applying
any schema changes.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from sqlalchemy import inspect


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import Base, engine  # noqa: E402
import models  # noqa: F401,E402  # ensure all model classes are registered


def build_schema_report() -> dict:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    missing_tables = []
    missing_columns = {}
    missing_indexes = {}

    for table_name, table in sorted(Base.metadata.tables.items()):
        if table_name not in existing_tables:
            missing_tables.append(table_name)
            continue

        existing_column_names = {column["name"] for column in inspector.get_columns(table_name)}
        expected_column_names = {column.name for column in table.columns}
        column_delta = sorted(expected_column_names - existing_column_names)
        if column_delta:
            missing_columns[table_name] = column_delta

        existing_index_names = {index["name"] for index in inspector.get_indexes(table_name) if index.get("name")}
        expected_index_names = {index.name for index in table.indexes if index.name}
        index_delta = sorted(expected_index_names - existing_index_names)
        if index_delta:
            missing_indexes[table_name] = index_delta

    return {
        "database": engine.url.get_backend_name(),
        "missing_tables": missing_tables,
        "missing_columns": missing_columns,
        "missing_indexes": missing_indexes,
        "has_drift": bool(missing_tables or missing_columns or missing_indexes),
    }


def main() -> int:
    report = build_schema_report()
    print(json.dumps(report, indent=2, sort_keys=True))
    return 1 if report["has_drift"] else 0


if __name__ == "__main__":
    raise SystemExit(main())

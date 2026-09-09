"""Create normalized product image storage without changing existing product data."""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from sqlalchemy import inspect, text

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
from database import engine  # noqa: E402
from database import Base  # noqa: E402
import models  # noqa: F401,E402

CREATE_SQL = """
CREATE TABLE IF NOT EXISTS product_images (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    public_id TEXT DEFAULT '',
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
)
"""
INDEX_SQL = "CREATE INDEX IF NOT EXISTS ix_product_images_product_id ON product_images (product_id)"
ID_INDEX_SQL = "CREATE INDEX IF NOT EXISTS ix_product_images_id ON product_images (id)"
BACKFILL_SQL = """
INSERT INTO product_images (product_id, image_url, is_primary, sort_order)
SELECT p.id, p.image_url, TRUE, 0 FROM products p
WHERE COALESCE(p.image_url, '') <> ''
AND NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id)
"""


def require_postgresql() -> None:
    if not os.environ.get("DATABASE_URL") or not engine.url.get_backend_name().startswith("postgres"):
        raise RuntimeError("DATABASE_URL must identify PostgreSQL")


def validate_definition_matches_models() -> None:
    table = Base.metadata.tables.get("product_images")
    if table is None:
        raise RuntimeError("product_images is missing from SQLAlchemy metadata")
    expected = {"id", "product_id", "image_url", "public_id", "is_primary", "sort_order", "created_at"}
    actual = {column.name for column in table.columns}
    if actual != expected:
        raise RuntimeError(f"product_images migration differs from SQLAlchemy metadata: {sorted(actual)}")


def run_migration() -> None:
    if "products" not in inspect(engine).get_table_names():
        raise RuntimeError("Refusing to create product_images before products exists")
    with engine.begin() as connection:
        connection.execute(text(CREATE_SQL))
        connection.execute(text(INDEX_SQL))
        connection.execute(text(ID_INDEX_SQL))
        connection.execute(text(BACKFILL_SQL))

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--confirm-product-images-migration", action="store_true")
    args = parser.parse_args()
    validate_definition_matches_models()
    if args.dry_run:
        print("product_images table/index creation and idempotent legacy image backfill are pending")
        return 0
    require_postgresql()
    if not args.confirm_product_images_migration:
        raise RuntimeError("Pass --confirm-product-images-migration after confirming a recent backup")
    run_migration()
    inspector = inspect(engine)
    if "product_images" not in inspector.get_table_names():
        raise RuntimeError("product_images verification failed")
    print("product_images migration complete")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())

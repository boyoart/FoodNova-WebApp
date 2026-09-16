"""Apply the reviewed, idempotent customer password-reset schema migration."""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from sqlalchemy import inspect, text

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import Base, engine  # noqa: E402
import models  # noqa: F401,E402


ADD_SESSION_VERSION_SQL = "ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER"
BACKFILL_SESSION_VERSION_SQL = "UPDATE users SET session_version = 0 WHERE session_version IS NULL"
SESSION_VERSION_DEFAULT_SQL = "ALTER TABLE users ALTER COLUMN session_version SET DEFAULT 0"
SESSION_VERSION_NOT_NULL_SQL = "ALTER TABLE users ALTER COLUMN session_version SET NOT NULL"
CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    used_at TIMESTAMP WITHOUT TIME ZONE,
    requested_by VARCHAR(30) NOT NULL DEFAULT 'customer',
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
)
"""
INDEX_SQL = (
    "CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_id ON password_reset_tokens (id)",
    "CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_user_id ON password_reset_tokens (user_id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS ix_password_reset_tokens_token_hash ON password_reset_tokens (token_hash)",
    "CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_expires_at ON password_reset_tokens (expires_at)",
)


def require_postgresql() -> None:
    if not os.environ.get("DATABASE_URL") or not engine.url.get_backend_name().startswith("postgres"):
        raise RuntimeError("DATABASE_URL must identify PostgreSQL")


def validate_definition_matches_models() -> None:
    users = Base.metadata.tables.get("users")
    reset_tokens = Base.metadata.tables.get("password_reset_tokens")
    if users is None or "session_version" not in users.columns:
        raise RuntimeError("users.session_version is missing from SQLAlchemy metadata")
    if reset_tokens is None:
        raise RuntimeError("password_reset_tokens is missing from SQLAlchemy metadata")
    expected = {"id", "user_id", "token_hash", "expires_at", "used_at", "requested_by", "created_at"}
    actual = {column.name for column in reset_tokens.columns}
    if actual != expected:
        raise RuntimeError(f"password-reset migration differs from SQLAlchemy metadata: {sorted(actual)}")


def run_migration() -> None:
    existing_tables = set(inspect(engine).get_table_names())
    if "users" not in existing_tables:
        raise RuntimeError("Refusing to create password-reset storage before users exists")
    with engine.begin() as connection:
        connection.execute(text(ADD_SESSION_VERSION_SQL))
        connection.execute(text(BACKFILL_SESSION_VERSION_SQL))
        connection.execute(text(SESSION_VERSION_DEFAULT_SQL))
        connection.execute(text(SESSION_VERSION_NOT_NULL_SQL))
        connection.execute(text(CREATE_TABLE_SQL))
        for statement in INDEX_SQL:
            connection.execute(text(statement))


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply FoodNova password-reset storage migration")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--confirm-password-reset-migration", action="store_true")
    args = parser.parse_args()
    validate_definition_matches_models()
    if args.dry_run:
        print("users.session_version and password_reset_tokens migration are pending")
        return 0
    require_postgresql()
    if not args.confirm_password_reset_migration:
        raise RuntimeError("Pass --confirm-password-reset-migration after confirming a recent backup")
    run_migration()
    report = inspect(engine)
    if "password_reset_tokens" not in report.get_table_names():
        raise RuntimeError("password-reset migration verification failed")
    print("password-reset migration complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Verify or explicitly create the unique app_settings.key index on PostgreSQL."""

import argparse
import os
import sys

from sqlalchemy import create_engine, text


INDEX_NAME = "uq_app_settings_key_release_a"
MIGRATION_LOCK = "foodnova_app_settings_key_unique_index_v1"


def inspect_index(connection, schema):
    return connection.execute(text("""
        SELECT i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
               AND i.indpred IS NULL AND i.indexprs IS NULL
               AND i.indnkeyatts = 1 AND i.indnatts = 1
               AND a.attname = 'key' AS usable
        FROM pg_index i
        JOIN pg_class t ON t.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
        WHERE n.nspname = :schema AND t.relname = 'app_settings'
    """), {"schema": schema}).scalars().all()


def migrate(connection, apply):
    if connection.dialect.name != "postgresql":
        raise RuntimeError("PostgreSQL is required")
    connection.execute(text("SET lock_timeout = '5s'"))
    connection.execute(text("SET statement_timeout = '5min'"))
    if not connection.execute(text("SELECT pg_try_advisory_lock(hashtext(:name))"), {"name": MIGRATION_LOCK}).scalar_one():
        raise RuntimeError("Another app_settings index migration is running")
    try:
        schema = connection.execute(text("SELECT current_schema()")).scalar_one()
        if not schema:
            raise RuntimeError("No current schema")
        quote = connection.dialect.identifier_preparer.quote
        qualified_table = f"{quote(schema)}.{quote('app_settings')}"
        exists = connection.execute(text("""
            SELECT EXISTS (
                SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid = t.relnamespace
                WHERE n.nspname = :schema AND t.relname = 'app_settings' AND t.relkind = 'r'
            )
        """), {"schema": schema}).scalar_one()
        if not exists:
            raise RuntimeError("An ordinary app_settings table is required in the current schema")
        duplicate = connection.execute(text(f"""
            SELECT EXISTS (SELECT 1 FROM {qualified_table}
                           WHERE key IS NOT NULL GROUP BY key HAVING count(*) > 1)
        """)).scalar_one()
        null_keys = connection.execute(text(f"SELECT EXISTS (SELECT 1 FROM {qualified_table} WHERE key IS NULL)")).scalar_one()
        if duplicate or null_keys:
            raise RuntimeError("Duplicate or null app_settings keys found; no changes made")
        if any(inspect_index(connection, schema)):
            return "already_present"
        name_exists = connection.execute(text("""
            SELECT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                           WHERE n.nspname = :schema AND c.relname = :name)
        """), {"schema": schema, "name": INDEX_NAME}).scalar_one()
        if name_exists:
            raise RuntimeError("Index name already exists but is not usable; inspect it manually")
        if not apply:
            return "index_required"
        connection.execute(text(f"CREATE UNIQUE INDEX CONCURRENTLY {quote(INDEX_NAME)} ON {qualified_table} (key)"))
        if not any(inspect_index(connection, schema)):
            raise RuntimeError("Index creation completed but verification failed")
        return "created"
    finally:
        connection.execute(text("SELECT pg_advisory_unlock(hashtext(:name))"), {"name": MIGRATION_LOCK})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Create the index; otherwise inspect only")
    parser.add_argument("--confirm-database", help="Exact database name; required with --apply")
    parser.add_argument("--confirm-host", help="Exact host from DATABASE_URL; required with --apply")
    parser.add_argument("--confirm-schema", help="Exact current schema; required with --apply")
    parser.add_argument("--confirm-reviewed-backup", action="store_true")
    args = parser.parse_args()
    url = os.environ.get("DATABASE_URL")
    if not url:
        parser.error("DATABASE_URL must be supplied explicitly")
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    engine = create_engine(url, isolation_level="AUTOCOMMIT")
    try:
        if engine.dialect.name != "postgresql":
            raise RuntimeError("PostgreSQL is required")
        if args.apply and (not engine.url.host or args.confirm_host != engine.url.host
                           or not engine.url.database or args.confirm_database != engine.url.database
                           or not args.confirm_reviewed_backup):
            raise RuntimeError("Apply requires exact --confirm-host, --confirm-database and --confirm-reviewed-backup")
        with engine.connect() as connection:
            schema = connection.execute(text("SELECT current_schema()")).scalar_one()
            print(f"target host={engine.url.host or '(local socket)'} database={engine.url.database or '(unspecified)'} schema={schema}")
            if args.apply and (not schema or args.confirm_schema != schema):
                raise RuntimeError("Apply requires exact --confirm-schema")
            print(f"app_settings unique index: {migrate(connection, args.apply)}")
    finally:
        engine.dispose()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"app_settings index migration failed: {error}", file=sys.stderr)
        sys.exit(1)

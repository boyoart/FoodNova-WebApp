"""Compare feature ORM schema to the authoritative standalone migration, without DDL."""
import sys
from pathlib import Path

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.dialects import postgresql

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from models import AccountActionLimit, EmailVerificationToken, Order, User
from scripts import migrate_customer_security as migration


def signature(column):
    return (str(column.type.compile(dialect=postgresql.dialect())), column.nullable, column.primary_key)


def test_feature_security_tables_match_authoritative_migration():
    for model, table in [(EmailVerificationToken, migration.tokens), (AccountActionLimit, migration.limits)]:
        assert {c.name: signature(c) for c in model.__table__.c} == {c.name: signature(c) for c in table.c}
        indexes = lambda t: {(tuple(c.name for c in index.columns), bool(index.unique)) for index in t.indexes}
        assert indexes(model.__table__) == indexes(table)
        foreign_keys = lambda t: {(fk.parent.name, fk.target_fullname, fk.ondelete) for fk in t.foreign_keys}
        assert foreign_keys(model.__table__) == foreign_keys(table)


def test_feature_columns_match_authoritative_migration():
    expected = {
        'account_status': (String(24), False, "VARCHAR(24) NOT NULL DEFAULT 'active'"),
        'account_status_reason': (Text(), True, "TEXT DEFAULT ''"),
        'account_deleted_at': (DateTime(), True, 'TIMESTAMP NULL'),
        'email_verified_at': (DateTime(), True, 'TIMESTAMP NULL'),
        'email_verification_required': (Boolean(), False, 'BOOLEAN NOT NULL DEFAULT FALSE'),
    }
    assert set(migration.USER_COLUMNS) == set(expected)
    for name, (kind, nullable, ddl) in expected.items():
        column = User.__table__.c[name]
        assert signature(column) == (str(kind.compile(dialect=postgresql.dialect())), nullable, False)
        assert migration.USER_COLUMNS[name] == ddl
    assert signature(Order.__table__.c.checkout_request_hash) == ('VARCHAR(64)', True, False)
    assert User.__table__.c.session_version.nullable is False
    assert Order.__table__.c.manual_idempotency_key.unique is True

"""Migration-only tests: isolated SQLite execution and PostgreSQL SQL compilation."""
import importlib.util
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable, CreateIndex

SCRIPT = Path(__file__).resolve().parents[1] / 'backend/scripts/migrate_customer_security.py'
spec = importlib.util.spec_from_file_location('migration_only', SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def database():
    engine = create_engine('sqlite:///:memory:')
    with engine.begin() as c:
        c.execute(text('CREATE TABLE users (id INTEGER PRIMARY KEY, is_active BOOLEAN, session_version INTEGER, email TEXT)'))
        c.execute(text("INSERT INTO users VALUES (1, TRUE, 7, 'active@example.test'), (2, FALSE, 9, 'inactive@example.test')"))
        c.execute(text('CREATE TABLE orders (id INTEGER PRIMARY KEY, manual_idempotency_key VARCHAR(160) UNIQUE, total INTEGER)'))
        c.execute(text('INSERT INTO orders VALUES (4, NULL, 2500)'))
    return engine


def test_plan_never_connects_even_with_database_url():
    with patch.dict(os.environ, {'DATABASE_URL': 'postgresql://invalid/foodnova'}), patch.object(m, 'create_engine', side_effect=AssertionError('connected')):
        assert m.main([]) == 0


def test_explicit_apply_and_verify_require_postgres_url():
    for mode in ['--apply', '--verify']:
        with patch.dict(os.environ, {'DATABASE_URL': 'sqlite:///:memory:'}), pytest.raises(SystemExit):
            m.main([mode])


def test_repeatable_data_preserving_migration():
    engine = database()
    m.migrate(engine)
    with engine.begin() as c:
        m.verify(c)
        assert c.execute(text('SELECT id, is_active, session_version, email FROM users ORDER BY id')).all() == [(1, 1, 7, 'active@example.test'), (2, 0, 9, 'inactive@example.test')]
        assert c.execute(text('SELECT account_status, email_verified_at, email_verification_required FROM users ORDER BY id')).all() == [('active', None, 0), ('deactivated', None, 0)]
        assert c.execute(text('SELECT id, total FROM orders')).all() == [(4, 2500)]
        c.execute(text("UPDATE users SET account_status='suspended', email_verification_required=TRUE WHERE id=1"))
    m.migrate(engine)
    with engine.connect() as c:
        assert c.execute(text('SELECT account_status, email_verification_required FROM users WHERE id=1')).one() == ('suspended', 1)
        assert c.execute(text('SELECT count(*) FROM email_verification_tokens')).scalar() == 0
        assert set(inspect(c).get_table_names()) == {'users', 'orders', 'email_verification_tokens', 'account_action_limits'}


def test_missing_prerequisite_fails_before_ddl():
    engine = database()
    with engine.begin() as c:
        c.execute(text('ALTER TABLE users RENAME COLUMN session_version TO legacy_version'))
    with pytest.raises(RuntimeError, match='prerequisite'):
        m.migrate(engine)
    assert 'account_status' not in {c['name'] for c in inspect(engine).get_columns('users')}


def test_incompatible_schema_fails_verification():
    engine = database()
    with engine.begin() as c:
        c.execute(text('ALTER TABLE users ADD COLUMN account_status INTEGER'))
    with pytest.raises(RuntimeError, match='Incompatible column'):
        m.migrate(engine)


def test_postgres_ddl_matches_feature_constraints():
    dialect = postgresql.dialect()
    sql = '\n'.join(str(CreateTable(t).compile(dialect=dialect)) + '\n' + '\n'.join(str(CreateIndex(i).compile(dialect=dialect)) for i in t.indexes) for t in m.TABLES)
    assert 'SERIAL' in sql
    assert 'FOREIGN KEY(user_id) REFERENCES users (id)' in sql
    assert 'CREATE UNIQUE INDEX ix_email_verification_tokens_token_hash' in sql
    assert 'TIMESTAMP WITHOUT TIME ZONE' in sql
    assert 'CASCADE' not in sql
    assert 'CREATE TABLE users' not in sql


def test_no_application_imports():
    source = SCRIPT.read_text()
    assert 'from models' not in source and 'from database' not in source
    assert 'SET LOCAL lock_timeout' in source
    assert 'pg_try_advisory_xact_lock' in source


def test_verify_cli_is_read_only():
    engine = MagicMock()
    connection = engine.connect.return_value.__enter__.return_value
    with patch.dict(os.environ, {'DATABASE_URL': 'postgresql://invalid/fixture'}), patch.object(m, 'create_engine', return_value=engine), patch.object(m, 'verify') as verify, patch.object(m, 'migrate', side_effect=AssertionError('mutation')):
        assert m.main(['--verify']) == 0
    verify.assert_called_once_with(connection)
    assert str(connection.execute.call_args_list[0].args[0]) == 'SET TRANSACTION READ ONLY'
    engine.begin.assert_not_called()
    engine.dispose.assert_called_once()


def test_driver_errors_do_not_expose_credentials(capsys):
    with patch.dict(os.environ, {'DATABASE_URL': 'postgresql://invalid/fixture'}), patch.object(m, 'create_engine', side_effect=RuntimeError('private-password')):
        assert m.main(['--apply']) == 1
    assert 'private-password' not in capsys.readouterr().out


def test_postgres_lock_refusal_aborts_before_schema_work():
    engine = MagicMock()
    connection = engine.begin.return_value.__enter__.return_value
    connection.dialect.name = 'postgresql'
    connection.execute.return_value.scalar.return_value = False
    with patch.object(m, 'prerequisites') as prerequisites, pytest.raises(RuntimeError, match='Another'):
        m.migrate(engine)
    prerequisites.assert_not_called()
    assert [str(call.args[0]) for call in connection.execute.call_args_list] == [
        "SET LOCAL lock_timeout = '5s'", "SET LOCAL statement_timeout = '60s'",
        'SELECT pg_try_advisory_xact_lock(187436921)']
    assert engine.begin.return_value.__exit__.call_args.args[0] is RuntimeError

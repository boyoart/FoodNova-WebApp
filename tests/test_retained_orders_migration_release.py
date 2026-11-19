"""Standalone migration contracts. No app imports or remote database access."""
import ast
import importlib.util
import os
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import Boolean, DateTime, Integer, Text, create_engine, event, inspect, text

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'backend/scripts/migrate_retained_orders.py'
spec = importlib.util.spec_from_file_location('retained_migration_release', SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

EXPECTED = {
    'operational_removed_at': 'TIMESTAMP NULL',
    'personal_data_erased_at': 'TIMESTAMP NULL',
    'retention_hold': 'BOOLEAN NOT NULL DEFAULT FALSE',
    'retention_hold_reason': "TEXT DEFAULT ''",
}


def cli(*args):
    with patch.object(sys, 'argv', [str(SCRIPT), *args]):
        return m.main()


def column_specs():
    return [dict(name=name, type=kind, nullable=nullable, default='false' if name == 'retention_hold' else None)
            for name, kind, nullable in [('operational_removed_at', DateTime(), True),
                ('personal_data_erased_at', DateTime(), True), ('retention_hold', Boolean(), False),
                ('retention_hold_reason', Text(), True)]]


def database(missing_column=None, missing_table=None):
    engine = create_engine('sqlite://')
    # Make SQLite DDL transactional for a real rollback assertion. This is a
    # test-only driver setting; it is not a claim of live PostgreSQL validation.
    @event.listens_for(engine, 'connect')
    def connect(dbapi, record):
        dbapi.isolation_level = None
    @event.listens_for(engine, 'begin')
    def begin(connection):
        connection.exec_driver_sql('BEGIN')
    user_columns = {'id': 'INTEGER PRIMARY KEY', 'is_active': 'BOOLEAN', 'account_status': 'TEXT',
                    'session_version': 'INTEGER', 'email': 'TEXT'}
    user_columns.pop(missing_column, None)
    with engine.begin() as c:
        if missing_table != 'users':
            c.execute(text('CREATE TABLE users (' + ','.join(f'{k} {v}' for k, v in user_columns.items()) + ')'))
            for row in [dict(id=1, is_active=True, account_status='active', session_version=7, email='active@example.test'),
                        dict(id=2, is_active=False, account_status='deactivated', session_version=9, email='inactive@example.test')]:
                values = {k: v for k, v in row.items() if k in user_columns}
                c.execute(text('INSERT INTO users (' + ','.join(values) + ') VALUES (' + ','.join(':' + k for k in values) + ')'), values)
        if missing_table != 'orders':
            c.execute(text('CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_user_id INTEGER, customer_name TEXT, payment_status TEXT, refund_status TEXT, total_amount FLOAT, receipt TEXT)'))
            c.execute(text("INSERT INTO orders VALUES (1,1,'Original customer','payment_confirmed','none',100,'original-receipt'), (2,2,'Other original','payment_confirmed','approved',200,NULL)"))
        for table in ('cancellation_requests', 'payment_approval_logs', 'delivery_offers', 'order_items'):
            if missing_table != table:
                c.execute(text(f'CREATE TABLE {table} (id INTEGER PRIMARY KEY, order_id INTEGER, status TEXT)'))
                c.execute(text(f"INSERT INTO {table} VALUES (1, 2, 'original-history')"))
    return engine


def snapshot(engine):
    result = {}
    with engine.connect() as c:
        for table in inspect(c).get_table_names():
            columns = [item['name'] for item in inspect(c).get_columns(table) if item['name'] not in EXPECTED]
            result[table] = c.execute(text(f'SELECT {",".join(columns)} FROM {table} ORDER BY id')).all()
    return result


def fake_pg(already=False, advisory=True, schema='public', version=(16, 0)):
    engine = MagicMock()
    c = engine.begin.return_value.__enter__.return_value
    c.dialect.name = 'postgresql'; c.dialect.server_version_info = version
    inspector = SimpleNamespace(has_table=lambda table: True,
        get_columns=lambda table: ([{'name': 'account_status'}, {'name': 'session_version'}] if table == 'users'
                                  else column_specs() if already else [{'name': 'id'}]))
    def execute(statement, params=None):
        sql = str(statement)
        value = schema if sql == 'SELECT current_schema()' else advisory if 'pg_try_advisory' in sql else (1 if already else None)
        return SimpleNamespace(scalar=lambda: value)
    c.execute.side_effect = execute
    return engine, c, inspector


def test_default_is_no_connection_plan(capsys):
    with patch.dict(os.environ, {'DATABASE_URL': 'postgresql://unreachable.invalid/never'}), patch.object(m, 'create_engine', side_effect=AssertionError('connection')):
        assert cli() == 0
    assert 'PLAN ONLY' in capsys.readouterr().out


def test_four_columns_six_triggers_and_main_prerequisites():
    assert m.COLUMNS == EXPECTED
    assert len(m.TRIGGERS) == 6 and len({item[1] for item in m.TRIGGERS}) == 6
    assert {t[0] for t in m.TRIGGERS} == {'orders', 'order_items', 'cancellation_requests', 'payment_approval_logs', 'delivery_offers'}
    assert m.TRIGGERS == [
        ('orders', 'foodnova_retained_order_guard', 'BEFORE UPDATE OR DELETE', 'foodnova_guard_retained_order'),
        ('orders', 'foodnova_customer_order_guard', 'BEFORE INSERT', 'foodnova_guard_customer_order'),
        ('cancellation_requests', 'foodnova_refund_guard', 'BEFORE INSERT OR UPDATE OR DELETE', 'foodnova_guard_retained_child'),
        ('payment_approval_logs', 'foodnova_payment_guard', 'BEFORE INSERT OR UPDATE OR DELETE', 'foodnova_guard_retained_child'),
        ('delivery_offers', 'foodnova_offer_guard', 'BEFORE INSERT OR UPDATE OR DELETE', 'foodnova_guard_retained_child'),
        ('order_items', 'foodnova_item_guard', 'BEFORE INSERT OR UPDATE OR DELETE', 'foodnova_guard_retained_child'),
    ]
    # Inspect declarations without importing the ORM/application/database module.
    classes = {node.name: node for node in ast.parse((ROOT / 'backend/models.py').read_text()).body if isinstance(node, ast.ClassDef)}
    required = {'User': {'id', 'is_active', 'account_status', 'session_version'},
                'Order': {'id', 'customer_user_id'}, 'OrderItem': {'order_id'},
                'CancellationRequest': {'order_id'}, 'PaymentApprovalLog': {'order_id'}, 'DeliveryOffer': {'order_id'}}
    for name, fields in required.items():
        declared = {target.id for node in classes[name].body if isinstance(node, ast.Assign) for target in node.targets if isinstance(target, ast.Name)}
        assert fields <= declared


def test_idempotent_columns_preserve_original_customer_order_payment_refund_data():
    engine = database(); before = snapshot(engine)
    m.migrate(engine)
    with engine.connect() as c:
        m.verify(c)
        assert c.execute(text('SELECT operational_removed_at, personal_data_erased_at, retention_hold, retention_hold_reason FROM orders ORDER BY id')).all() == [(None, None, 0, ''), (None, None, 0, '')]
    assert snapshot(engine) == before
    with engine.begin() as c:
        c.execute(text("UPDATE orders SET retention_hold=TRUE, retention_hold_reason='Existing reviewed hold' WHERE id=2"))
    m.migrate(engine)
    assert snapshot(engine) == before
    with engine.connect() as c:
        assert c.execute(text('SELECT retention_hold, retention_hold_reason FROM orders WHERE id=2')).one() == (1, 'Existing reviewed hold')


def test_post_ddl_failure_rolls_back_all_new_columns_and_preserves_records():
    engine = database(); before = snapshot(engine)
    columns_before = {c['name'] for c in inspect(engine).get_columns('orders')}
    with patch.object(m, 'verify', side_effect=RuntimeError('injected post-DDL failure')), pytest.raises(RuntimeError, match='injected'):
        m.migrate(engine)
    assert {c['name'] for c in inspect(engine).get_columns('orders')} == columns_before
    assert snapshot(engine) == before


@pytest.mark.parametrize('missing', ['account_status', 'session_version'])
def test_missing_security_prerequisite_stops_before_ddl(missing):
    engine = database(missing_column=missing)
    with pytest.raises(RuntimeError, match='prerequisite'):
        m.migrate(engine)
    assert not (set(EXPECTED) & {c['name'] for c in inspect(engine).get_columns('orders')})


@pytest.mark.parametrize('missing', ['orders', 'order_items', 'cancellation_requests', 'payment_approval_logs', 'delivery_offers'])
def test_missing_existing_table_stops(missing):
    engine = database(missing_table=missing)
    with pytest.raises(RuntimeError, match='Required existing table absent'):
        m.migrate(engine)


@pytest.mark.parametrize('already', [False, True])
def test_postgres_ddl_transaction_timeouts_and_trigger_idempotency(already):
    engine, c, inspector = fake_pg(already=already)
    with patch.object(m, 'inspect', return_value=inspector), patch.object(m, 'verify') as verify:
        m.migrate(engine)
    verify.assert_called_once_with(c)
    sql = [str(call.args[0]) for call in c.execute.call_args_list]
    assert "SET LOCAL lock_timeout = '5s'" in sql and "SET LOCAL statement_timeout = '60s'" in sql
    assert any('pg_try_advisory_xact_lock(187436922)' in statement for statement in sql)
    assert len([s for s in sql if s.startswith('ALTER TABLE')]) == (0 if already else 4)
    assert len([s for s in sql if s.startswith('CREATE TRIGGER')]) == (0 if already else 6)
    assert len([s for s in sql if s.strip().startswith('CREATE OR REPLACE FUNCTION')]) == 3
    assert not any(s.strip().upper().startswith(('UPDATE ', 'DELETE ', 'INSERT ', 'DROP ', 'TRUNCATE ')) for s in sql)
    engine.begin.return_value.__exit__.assert_called_once_with(None, None, None)


@pytest.mark.parametrize('options,message', [({'advisory': False}, 'already running'), ({'schema': 'other'}, 'public schema'), ({'version': (10, 0)}, '11+')])
def test_pg_lock_schema_version_failure_rolls_back_before_ddl(options, message):
    engine, c, inspector = fake_pg(**options)
    with patch.object(m, 'inspect', return_value=inspector), pytest.raises(RuntimeError, match=message.replace('+', r'\+')):
        m.migrate(engine)
    assert not any(str(call.args[0]).strip().startswith(('ALTER ', 'CREATE ')) for call in c.execute.call_args_list)
    assert engine.begin.return_value.__exit__.call_args.args[0] is RuntimeError


def test_pg_verification_failure_exits_same_ddl_transaction_with_error():
    engine, c, inspector = fake_pg()
    with patch.object(m, 'inspect', return_value=inspector), patch.object(m, 'verify', side_effect=RuntimeError('post-DDL validation')), pytest.raises(RuntimeError, match='post-DDL'):
        m.migrate(engine)
    assert sum(str(call.args[0]).startswith('CREATE TRIGGER') for call in c.execute.call_args_list) == 6
    assert engine.begin.return_value.__exit__.call_args.args[0] is RuntimeError
    c.commit.assert_not_called()


def test_guard_definitions_preserve_financial_fields_and_lock_related_rows():
    assert 'FOR UPDATE' in m.CHILD_GUARD and 'FOR UPDATE' in m.CUSTOMER_GUARD
    assert 'OLD.operational_removed_at IS NOT NULL' in m.ORDER_GUARD
    assert 'OLD.personal_data_erased_at IS NOT NULL' in m.ORDER_GUARD
    for field in ('payment_status', 'refund_status', 'total_amount', 'receipt', 'operational_removed_at'):
        assert field not in m.PRIVACY
    for definition in (m.ORDER_GUARD, m.CHILD_GUARD, m.CUSTOMER_GUARD):
        assert 'foodnova_retained_record_guard' in definition and "ERRCODE='23514'" in definition
        assert not any(word in definition.upper() for word in ('DELETE FROM ', 'TRUNCATE ', 'INSERT INTO ', 'UPDATE ORDERS SET'))


def test_verify_accepts_canonical_event_order_and_exact_function_binding():
    c = MagicMock(); c.dialect.name = 'postgresql'
    def execute(statement, params):
        assert params['function'] in {'foodnova_guard_retained_order', 'foodnova_guard_customer_order', 'foodnova_guard_retained_child'}
        timing = next(t[2] for t in m.TRIGGERS if t[1] == params['name'])
        events = ' OR '.join(sorted(timing.removeprefix('BEFORE ').split(' OR ')))
        return SimpleNamespace(scalar=lambda: f'CREATE TRIGGER {params["name"]} BEFORE {events} ON public.{params["table"]} FOR EACH ROW EXECUTE FUNCTION {params["function"]}()')
    c.execute.side_effect = execute
    with patch.object(m, 'inspect', return_value=SimpleNamespace(get_columns=lambda table: column_specs())):
        m.verify(c)
    assert c.execute.call_count == 6


@pytest.mark.parametrize('change', ['missing', 'type', 'nullable', 'default'])
def test_verify_rejects_column_drift(change):
    columns = column_specs()
    if change == 'missing': columns.pop()
    if change == 'type': columns[0]['type'] = Integer()
    if change == 'nullable': columns[2]['nullable'] = True
    if change == 'default': columns[2]['default'] = 'true'
    c = SimpleNamespace(dialect=SimpleNamespace(name='sqlite'))
    with patch.object(m, 'inspect', return_value=SimpleNamespace(get_columns=lambda table: columns)), pytest.raises(RuntimeError):
        m.verify(c)


@pytest.mark.parametrize('definition', [None, 'CREATE TRIGGER wrong BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION wrong()', 'CREATE TRIGGER wrong BEFORE UPDATE OR DELETE ON orders FOR EACH STATEMENT EXECUTE FUNCTION wrong()'])
def test_verify_rejects_missing_or_incompatible_triggers(definition):
    c = MagicMock(); c.dialect.name = 'postgresql'
    c.execute.return_value.scalar.return_value = definition
    with patch.object(m, 'inspect', return_value=SimpleNamespace(get_columns=lambda table: column_specs())), pytest.raises(RuntimeError, match='trigger'):
        m.verify(c)


def test_verify_cli_is_read_only_and_never_calls_migrate():
    engine = MagicMock(); c = engine.connect.return_value.__enter__.return_value
    with patch.dict(os.environ, {'DATABASE_URL': 'postgresql://unreachable.invalid/test'}), patch.object(m, 'create_engine', return_value=engine), patch.object(m, 'verify') as verify, patch.object(m, 'migrate', side_effect=AssertionError('migration')):
        assert cli('--verify') == 0
    verify.assert_called_once_with(c)
    assert [str(call.args[0]) for call in c.execute.call_args_list] == ['SET TRANSACTION READ ONLY', "SET LOCAL statement_timeout = '60s'"]
    engine.begin.assert_not_called(); engine.dispose.assert_called_once()


def test_cli_requires_explicit_postgres_and_sanitizes_errors(capsys):
    with patch.dict(os.environ, {'DATABASE_URL': 'sqlite:///:memory:'}), pytest.raises(SystemExit):
        cli('--apply')
    with patch.dict(os.environ, {'DATABASE_URL': 'postgresql://unreachable.invalid/test'}), patch.object(m, 'create_engine', side_effect=RuntimeError('private-driver-detail')):
        assert cli('--apply') == 1
    assert 'private-driver-detail' not in capsys.readouterr().out


def test_no_application_or_receipt_dependencies():
    source = SCRIPT.read_text()
    for forbidden in ('from models', 'from database', 'import main', 'from fastapi', 'receipt_evidence', 'load_dotenv'):
        assert forbidden not in source

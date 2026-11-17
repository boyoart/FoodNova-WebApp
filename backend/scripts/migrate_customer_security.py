"""Standalone additive migration. No database access unless --apply or --verify."""
import argparse
import os

from sqlalchemy import (Boolean, Column, DateTime, ForeignKey, Integer, MetaData,
                        String, Table, Text, create_engine, inspect, text)

USER_COLUMNS = {
    'account_status': "VARCHAR(24) NOT NULL DEFAULT 'active'",
    'account_status_reason': "TEXT DEFAULT ''",
    'account_deleted_at': 'TIMESTAMP NULL',
    'email_verified_at': 'TIMESTAMP NULL',
    'email_verification_required': 'BOOLEAN NOT NULL DEFAULT FALSE',
}
metadata = MetaData()
# Reference only: never create/alter users through this metadata.
Table('users', metadata, Column('id', Integer, primary_key=True))
tokens = Table('email_verification_tokens', metadata,
    Column('id', Integer, primary_key=True),
    Column('user_id', Integer, ForeignKey('users.id'), nullable=False, index=True),
    Column('token_hash', String(64), unique=True, nullable=False, index=True),
    Column('email_digest', String(64), nullable=False),
    Column('expires_at', DateTime, nullable=False, index=True),
    Column('used_at', DateTime), Column('created_at', DateTime, nullable=False))
limits = Table('account_action_limits', metadata,
    Column('key_hash', String(64), primary_key=True),
    Column('count', Integer, nullable=False),
    Column('expires_at', DateTime, nullable=False, index=True))
TABLES = (tokens, limits)


def prerequisites(connection):
    inspector = inspect(connection)
    for table, required in [('users', {'id', 'is_active', 'session_version'}),
                            ('orders', {'id', 'manual_idempotency_key'})]:
        if not inspector.has_table(table):
            raise RuntimeError('Missing prerequisite table: ' + table)
        if not required.issubset({c['name'] for c in inspector.get_columns(table)}):
            raise RuntimeError('Missing prerequisite columns in ' + table)


def verify(connection):
    """Read schema only; reject missing columns, constraints or indexes."""
    prerequisites(connection)
    inspector = inspect(connection)
    expected = {'users': set(USER_COLUMNS), 'orders': {'checkout_request_hash'}}
    expected.update({table.name: set(table.c.keys()) for table in TABLES})
    for name, columns in expected.items():
        if not inspector.has_table(name):
            raise RuntimeError('Missing table: ' + name)
        if not columns.issubset({c['name'] for c in inspector.get_columns(name)}):
            raise RuntimeError('Missing columns in ' + name)
    column_specs = {
        'users': [('account_status', String(24), False), ('account_status_reason', Text(), True),
                  ('account_deleted_at', DateTime(), True), ('email_verified_at', DateTime(), True),
                  ('email_verification_required', Boolean(), False)],
        'orders': [('checkout_request_hash', String(64), True)],
    }
    column_specs.update({t.name: [(c.name, c.type, c.nullable) for c in t.c] for t in TABLES})
    for name, specs in column_specs.items():
        actual = {c['name']: c for c in inspector.get_columns(name)}
        for column, kind, nullable in specs:
            found = actual[column]
            actual_type = found['type']
            if (actual_type._type_affinity is not kind._type_affinity
                    or getattr(actual_type, 'length', None) != getattr(kind, 'length', None)
                    or getattr(actual_type, 'timezone', False) != getattr(kind, 'timezone', False)
                    or found['nullable'] != nullable):
                raise RuntimeError('Incompatible column: ' + name + '.' + column)
    defaults = {c['name']: str(c.get('default') or '').lower() for c in inspector.get_columns('users')}
    if "'active'" not in defaults['account_status'] or "''" not in defaults['account_status_reason']:
        raise RuntimeError('Incompatible customer status defaults')
    if defaults['email_verification_required'].strip('() ') not in ('false', '0'):
        raise RuntimeError('Legacy verification grace default must be false')
    for table in TABLES:
        actual = {tuple(i['column_names']): i for i in inspector.get_indexes(table.name)}
        for index in table.indexes:
            found = actual.get(tuple(c.name for c in index.columns))
            if found is None or bool(found['unique']) != bool(index.unique):
                raise RuntimeError('Missing/incompatible index in ' + table.name)
        if inspector.get_pk_constraint(table.name)['constrained_columns'] != [c.name for c in table.primary_key]:
            raise RuntimeError('Incompatible primary key in ' + table.name)
    if not any(f['constrained_columns'] == ['user_id'] and f['referred_table'] == 'users'
               and f['referred_columns'] == ['id'] and not f.get('options', {}).get('ondelete')
               for f in inspector.get_foreign_keys(tokens.name)):
        raise RuntimeError('Missing/non-retaining token user foreign key')


def migrate(engine):
    with engine.begin() as connection:
        if connection.dialect.name == 'postgresql':
            connection.execute(text("SET LOCAL lock_timeout = '5s'"))
            connection.execute(text("SET LOCAL statement_timeout = '60s'"))
            if not connection.execute(text('SELECT pg_try_advisory_xact_lock(187436921)')).scalar():
                raise RuntimeError('Another customer-security migration is running')
            if connection.dialect.server_version_info < (11,):
                raise RuntimeError('PostgreSQL 11+ required for constant-default migration')
        prerequisites(connection)
        existing = {c['name'] for c in inspect(connection).get_columns('users')}
        for name, ddl in USER_COLUMNS.items():
            if name not in existing:
                connection.execute(text(f'ALTER TABLE users ADD COLUMN {name} {ddl}'))
        if 'account_status' not in existing:
            connection.execute(text("UPDATE users SET account_status = 'deactivated' WHERE is_active = FALSE"))
        if 'checkout_request_hash' not in {c['name'] for c in inspect(connection).get_columns('orders')}:
            connection.execute(text('ALTER TABLE orders ADD COLUMN checkout_request_hash VARCHAR(64) NULL'))
        for table in TABLES:
            table.create(connection, checkfirst=True)
        verify(connection)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--apply', action='store_true')
    mode.add_argument('--verify', action='store_true', help='read-only schema verification')
    args = parser.parse_args(argv)
    if not args.apply and not args.verify:
        print('PLAN ONLY (no connection): add users ' + ', '.join(USER_COLUMNS))
        print('Add orders.checkout_request_hash; create email_verification_tokens and account_action_limits with indexes. Reuse session_version. Legacy accounts remain unverified, with verification grace. --apply is required to modify the DB; --verify checks schema only.')
        return 0
    url = os.environ.get('DATABASE_URL', '')
    if url.startswith('postgres://'):
        url = url.replace('postgres://', 'postgresql://', 1)
    if not url.startswith(('postgresql://', 'postgresql+psycopg2://', 'postgresql+psycopg://')):
        parser.error('An explicit PostgreSQL DATABASE_URL is required; no SQLite fallback')
    engine = None
    try:
        engine = create_engine(url, echo=False, hide_parameters=True, connect_args={'connect_timeout': 10})
        if args.apply:
            migrate(engine)
            print('Migration committed. No accounts verified; no transactions deleted.')
        else:
            with engine.connect() as connection:
                connection.execute(text('SET TRANSACTION READ ONLY'))
                connection.execute(text("SET LOCAL statement_timeout = '60s'"))
                verify(connection)
            print('Schema verification passed (read-only).')
        return 0
    except Exception as exc:
        # Driver errors may contain credentials/SQL parameters. Never print them.
        print('Migration/verification failed (' + type(exc).__name__ + '). No success claimed. Review schema/locks with your DBA; do not activate the feature backend.')
        return 1
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == '__main__':
    raise SystemExit(main())

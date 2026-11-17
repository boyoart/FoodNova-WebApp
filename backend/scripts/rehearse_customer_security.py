"""Opt-in PostgreSQL STAGING rehearsal; never reads the application's DATABASE_URL."""
import argparse
import hashlib
import hmac
import importlib.util
import os
from pathlib import Path
import secrets

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError

SCRIPT = Path(__file__).with_name('migrate_customer_security.py')
EXPECTED_HASH = 'f963f10e4fda49e7efe54520954e3da706aa54aee985a3a78aeab2eb39dfbf2a'
RESOURCE = 'foodnova-staging-db'


def staging_url(env):
    """Fail closed BEFORE connecting; provider isolation must also be checked by operator."""
    if any(name.startswith('PG') for name in env):
        raise ValueError('Use a clean shell without libpq environment overrides')
    if env.get('STAGING_RESOURCE_NAME') != RESOURCE:
        raise ValueError('Staging resource attestation missing')
    if env.get('STAGING_ISOLATION_CONFIRMED') != 'yes':
        raise ValueError('Independent provider isolation check required')
    if env.get('STAGING_WRITERS_PAUSED') != 'yes':
        raise ValueError('Staging writer quiescence required')
    url = make_url(env.get('STAGING_DATABASE_URL', ''))
    host = env.get('EXPECTED_STAGING_HOST', '')
    name = env.get('EXPECTED_STAGING_DATABASE', '')
    if (not host or not name or name.lower() in ('foodnova', 'postgres', 'template0', 'template1')
            or url.host != host or url.database != name
            or (url.port or 5432) != int(env.get('EXPECTED_STAGING_PORT', '5432'))
            or url.drivername not in ('postgres', 'postgresql', 'postgresql+psycopg2')
            or not url.username or not url.password or ',' in host or '/' in host):
        raise ValueError('Missing or mismatched pinned staging identity')
    # libpq URL options can otherwise override a pinned host/database.
    if set(url.query) - {'sslmode'} or url.query.get('sslmode') not in ('require', 'verify-full'):
        raise ValueError('Only required TLS is allowed in connection query')
    return url.set(drivername='postgresql+psycopg2')


def load_migration():
    if hashlib.sha256(SCRIPT.read_bytes().replace(b'\r\n', b'\n')).hexdigest() != EXPECTED_HASH:
        raise ValueError('Migration differs from reviewed PR #2; review before rehearsal')
    spec = importlib.util.spec_from_file_location('reviewed_customer_migration', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def identify(engine, expected):
    with engine.connect() as connection:
        connection.execute(text('SET TRANSACTION READ ONLY'))
        connection.execute(text("SET LOCAL statement_timeout = '60s'"))
        database, version, schema = connection.execute(text(
            "SELECT current_database(), current_setting('server_version_num')::integer, current_schema()"
        )).one()
        if database != expected or version < 110000 or schema != 'public':
            raise ValueError('Connected staging identity/version/schema mismatch')


def schema_snapshot(engine):
    with engine.connect() as connection:
        connection.execute(text('SET TRANSACTION READ ONLY'))
        connection.execute(text("SET LOCAL statement_timeout = '60s'"))
        inspector = inspect(connection)
        result = {}
        for table in sorted(inspector.get_table_names(schema='public')):
            result[table] = (
                [(c['name'], str(c['type']), c['nullable'], c.get('default'))
                 for c in inspector.get_columns(table, schema='public')],
                inspector.get_pk_constraint(table, schema='public'),
                inspector.get_foreign_keys(table, schema='public'),
                inspector.get_indexes(table, schema='public'),
            )
        return result, sorted(inspector.get_sequence_names(schema='public'))


def data_snapshot(engine, columns, key):
    """Keep keyed fingerprints in memory only. Never output rows, hashes, or credentials."""
    result = {}
    with engine.connect().execution_options(isolation_level='REPEATABLE READ') as connection:
        connection.execute(text('SET TRANSACTION READ ONLY'))
        connection.execute(text("SET LOCAL statement_timeout = '60s'"))
        connection.execute(text("SET LOCAL TIME ZONE 'UTC'"))
        quote = connection.dialect.identifier_preparer.quote_identifier
        for table, names in sorted(columns.items()):
            selected = ', '.join(quote(name) for name in names)
            sql = (f'SELECT row_to_json(r)::text FROM (SELECT {selected} '
                   f'FROM public.{quote(table)}) r ORDER BY row_to_json(r)::text COLLATE "C"')
            digest, count = hmac.new(key, digestmod='sha256'), 0
            rows = connection.execution_options(stream_results=True).execute(text(sql))
            try:
                for row in rows:
                    raw = row[0].encode('utf-8')
                    digest.update(len(raw).to_bytes(8, 'big'))
                    digest.update(raw)
                    count += 1
            finally:
                rows.close()
            result[table] = (count, digest.digest())
    return result


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def cli(module, url, mode):
    # Scope DATABASE_URL to this reviewed script call; never inherit a production URL.
    old = os.environ.get('DATABASE_URL')
    try:
        os.environ['DATABASE_URL'] = url.render_as_string(hide_password=False)
        require(module.main([mode]) == 0, 'Migration CLI returned failure')
    finally:
        if old is None:
            os.environ.pop('DATABASE_URL', None)
        else:
            os.environ['DATABASE_URL'] = old


def rehearse(engine, module, url):
    identify(engine, url.database)
    with engine.connect() as connection:
        connection.execute(text('SET TRANSACTION READ ONLY'))
        module.prerequisites(connection)
    print('PASS: pinned staging identity, PostgreSQL version and prerequisites')
    before_schema = schema_snapshot(engine)
    baseline_columns = {name: [c[0] for c in details[0]]
                        for name, details in before_schema[0].items()}
    require('users' in baseline_columns and 'orders' in baseline_columns, 'Required data tables absent')
    require(not (set(module.USER_COLUMNS) & set(baseline_columns['users']))
            and 'checkout_request_hash' not in baseline_columns['orders']
            and not ({t.name for t in module.TABLES} & set(baseline_columns)),
            'First-application rehearsal needs unmigrated staging; do not drop/reset existing schema')
    key = secrets.token_bytes(32)
    baseline_data = data_snapshot(engine, baseline_columns, key)

    def unchanged():
        require(schema_snapshot(engine) == before_schema, 'Schema/sequence changed after rollback')
        require(data_snapshot(engine, baseline_columns, key) == baseline_data, 'Original data changed')

    # Concurrent-copy protection, without blocking ordinary application queries.
    with engine.begin() as blocker:
        require(blocker.execute(text('SELECT pg_try_advisory_xact_lock(187436921)')).scalar(),
                'Another migration already holds advisory lock')
        try:
            module.migrate(engine)
        except RuntimeError as exc:
            require(str(exc) == 'Another customer-security migration is running', 'Unexpected advisory failure')
        else:
            raise RuntimeError('Concurrent migration was not rejected')
    unchanged()
    print('PASS: concurrent migration refused, no changes')

    # ACCESS SHARE permits readers but conflicts with ALTER TABLE's exclusive lock.
    # All writers must already be paused; this transaction is always rolled back.
    with engine.connect() as blocker:
        transaction = blocker.begin()
        try:
            blocker.execute(text("SET LOCAL lock_timeout = '5s'"))
            blocker.execute(text("SET LOCAL statement_timeout = '15s'"))
            blocker.execute(text('LOCK TABLE public.users IN ACCESS SHARE MODE'))
            try:
                module.migrate(engine)
            except DBAPIError as exc:
                require(getattr(exc.orig, 'pgcode', None) == '55P03', 'Expected lock timeout')
            else:
                raise RuntimeError('Conflicting DDL did not time out')
        finally:
            transaction.rollback()
    unchanged()
    print('PASS: lock timeout and transaction rollback')

    # Inject a real SQL error after DDL/backfill/schema verification, before commit.
    original_verify = module.verify
    def fail_before_commit(connection):
        original_verify(connection)
        connection.execute(text('SELECT 1 / 0'))
    module.verify = fail_before_commit
    try:
        try:
            module.migrate(engine)
        except DBAPIError as exc:
            require(getattr(exc.orig, 'pgcode', None) == '22012', 'Unexpected injected-error failure')
        else:
            raise RuntimeError('Injected SQL failure did not abort')
    finally:
        module.verify = original_verify
    unchanged()
    print('PASS: real SQL failure rolls back DDL, backfill and sequences')

    cli(module, url, '--apply')
    cli(module, url, '--verify')
    require(data_snapshot(engine, baseline_columns, key) == baseline_data,
            'Existing customer/order/payment or other records changed')
    migrated_schema = schema_snapshot(engine)
    all_columns = {name: [c[0] for c in details[0]] for name, details in migrated_schema[0].items()}
    migrated_data = data_snapshot(engine, all_columns, key)
    with engine.connect() as connection:
        connection.execute(text('SET TRANSACTION READ ONLY'))
        invalid = connection.execute(text("SELECT count(*) FROM users WHERE email_verified_at IS NOT NULL OR email_verification_required IS DISTINCT FROM FALSE OR account_status IS DISTINCT FROM CASE WHEN is_active = FALSE THEN 'deactivated' ELSE 'active' END")).scalar()
        require(invalid == 0, 'Unexpected legacy-account migration state')
    print('PASS: --apply then --verify; all original columns/rows preserved')
    cli(module, url, '--apply')
    cli(module, url, '--verify')
    require(schema_snapshot(engine) == migrated_schema, 'Repeat application changed schema')
    require(data_snapshot(engine, all_columns, key) == migrated_data, 'Repeat application changed data')
    print('PASS: repeat --apply/--verify preserves complete migrated schema and data')
    print('PASS: staging database rehearsal complete. Existing staging data retained; additive schema remains. Production untouched.')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args(argv)
    if not args.execute:
        print('NOT EXECUTED: plan only, no connection. Read CUSTOMER_SECURITY_STAGING_REHEARSAL.md for isolation gates and opt-in commands.')
        return 0
    engine = None
    try:
        url = staging_url(os.environ)
        module = load_migration()
        engine = create_engine(url, echo=False, hide_parameters=True,
                               connect_args={'connect_timeout': 10}, pool_size=3, max_overflow=0)
        rehearse(engine, module, url)
        return 0
    except Exception as exc:
        print('FAIL / STOP (' + type(exc).__name__ + '): no rehearsal success claimed. Do not promote. Review isolation, prerequisites and staging state securely. No automatic cleanup/reset attempted.')
        return 1
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == '__main__':
    raise SystemExit(main())

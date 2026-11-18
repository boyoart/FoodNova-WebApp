"""Additive retained-order fields and PostgreSQL race guards. Default: plan only."""
import argparse
import os
from sqlalchemy import Boolean, DateTime, Text, create_engine, inspect, text

COLUMNS = {'operational_removed_at': 'TIMESTAMP NULL', 'personal_data_erased_at': 'TIMESTAMP NULL',
           'retention_hold': 'BOOLEAN NOT NULL DEFAULT FALSE', 'retention_hold_reason': "TEXT DEFAULT ''"}
PRIVACY = ['customer_name', 'customer_email', 'customer_phone', 'phone', 'delivery_address',
           'delivery_address_id', 'delivery_address_snapshot', 'delivery_notes', 'pickup_note',
           'customer_feedback', 'admin_note', 'service_note', 'delivery_code', 'customer_user_id',
           'personal_data_erased_at', 'updated_at', 'retention_hold', 'retention_hold_reason']
ARRAY = 'ARRAY[' + ','.join("'" + name + "'" for name in PRIVACY) + ']'
ORDER_GUARD = """
CREATE OR REPLACE FUNCTION foodnova_guard_retained_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.operational_removed_at IS NOT NULL OR OLD.personal_data_erased_at IS NOT NULL THEN
   IF TG_OP = 'DELETE' THEN
     RAISE EXCEPTION 'Retained ledger cannot be deleted' USING ERRCODE='23514', CONSTRAINT='foodnova_retained_record_guard';
   END IF;
   IF NEW.operational_removed_at IS DISTINCT FROM OLD.operational_removed_at
      OR (OLD.personal_data_erased_at IS NOT NULL AND
          (to_jsonb(NEW) - ARRAY['updated_at','retention_hold','retention_hold_reason']) IS DISTINCT FROM
          (to_jsonb(OLD) - ARRAY['updated_at','retention_hold','retention_hold_reason']))
      OR (to_jsonb(NEW) - __PRIVACY__) IS DISTINCT FROM (to_jsonb(OLD) - __PRIVACY__) THEN
     RAISE EXCEPTION 'Retained order is closed to operational changes' USING ERRCODE='23514', CONSTRAINT='foodnova_retained_record_guard';
   END IF;
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$
""".replace('__PRIVACY__', ARRAY)
CHILD_GUARD = """
CREATE OR REPLACE FUNCTION foodnova_guard_retained_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE retained boolean; old_retained boolean; target_id integer;
BEGIN
 IF TG_OP='DELETE' THEN target_id=OLD.order_id; ELSE target_id=NEW.order_id; END IF;
 SELECT (operational_removed_at IS NOT NULL OR personal_data_erased_at IS NOT NULL)
 INTO retained FROM orders WHERE id=target_id FOR UPDATE;
 IF TG_OP='UPDATE' THEN
   IF OLD.order_id IS DISTINCT FROM NEW.order_id THEN
     SELECT (operational_removed_at IS NOT NULL OR personal_data_erased_at IS NOT NULL)
     INTO old_retained FROM orders WHERE id=OLD.order_id FOR UPDATE;
     retained = coalesce(retained, FALSE) OR coalesce(old_retained, FALSE);
   END IF;
 END IF;
 IF retained THEN
   IF TG_OP='UPDATE' AND TG_TABLE_NAME='cancellation_requests' THEN
     IF (to_jsonb(NEW) - ARRAY['customer_email','customer_name','customer_phone','updated_at']) =
        (to_jsonb(OLD) - ARRAY['customer_email','customer_name','customer_phone','updated_at']) AND
        coalesce(to_jsonb(NEW)->>'customer_email','') = '' AND
        coalesce(to_jsonb(NEW)->>'customer_phone','') = '' AND
        coalesce(to_jsonb(NEW)->>'customer_name','') = 'Deleted customer' THEN
       RETURN NEW;
     END IF;
   END IF;
   RAISE EXCEPTION 'Retained order has no operational mutations' USING ERRCODE='23514', CONSTRAINT='foodnova_retained_record_guard';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$
"""
CUSTOMER_GUARD = """
CREATE OR REPLACE FUNCTION foodnova_guard_customer_order() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE usable boolean;
BEGIN
 IF NEW.customer_user_id IS NOT NULL THEN
   SELECT (is_active AND account_status = 'active') INTO usable FROM users WHERE id=NEW.customer_user_id FOR UPDATE;
   IF usable IS DISTINCT FROM TRUE THEN
     RAISE EXCEPTION 'Customer cannot create orders' USING ERRCODE='23514', CONSTRAINT='foodnova_retained_record_guard';
   END IF;
 END IF;
 RETURN NEW;
END $$
"""
TRIGGERS = [
    ('orders', 'foodnova_retained_order_guard', 'BEFORE UPDATE OR DELETE', 'foodnova_guard_retained_order'),
    ('orders', 'foodnova_customer_order_guard', 'BEFORE INSERT', 'foodnova_guard_customer_order'),
    ('cancellation_requests', 'foodnova_refund_guard', 'BEFORE INSERT OR UPDATE OR DELETE', 'foodnova_guard_retained_child'),
    ('payment_approval_logs', 'foodnova_payment_guard', 'BEFORE INSERT OR UPDATE OR DELETE', 'foodnova_guard_retained_child'),
    ('delivery_offers', 'foodnova_offer_guard', 'BEFORE INSERT OR UPDATE OR DELETE', 'foodnova_guard_retained_child'),
    ('order_items', 'foodnova_item_guard', 'BEFORE INSERT OR UPDATE OR DELETE', 'foodnova_guard_retained_child'),
]


def verify(connection):
    columns = {c['name']: c for c in inspect(connection).get_columns('orders')}
    for name, kind, nullable in [('operational_removed_at', DateTime(), True), ('personal_data_erased_at', DateTime(), True),
                                  ('retention_hold', Boolean(), False), ('retention_hold_reason', Text(), True)]:
        if name not in columns or columns[name]['type']._type_affinity is not kind._type_affinity or columns[name]['nullable'] != nullable:
            raise RuntimeError('Missing/incompatible retention column: ' + name)
    if str(columns['retention_hold'].get('default') or '').lower().strip('() ') not in {'false', '0'}:
        raise RuntimeError('Retention hold default is incompatible')
    if connection.dialect.name == 'postgresql':
        for table, name, timing, function in TRIGGERS:
            found = connection.execute(text("""SELECT pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_proc f ON f.oid=t.tgfoid
                WHERE t.tgname=:name AND t.tgrelid=CAST(:table AS regclass) AND t.tgenabled='O'
                AND NOT t.tgisinternal AND f.proname=:function"""), {'name': name, 'table': table, 'function': function}).scalar()
            actual_events = set(found.split(' BEFORE ', 1)[1].split(' ON ', 1)[0].split(' OR ')) if found and ' BEFORE ' in found else set()
            expected_events = set(timing.removeprefix('BEFORE ').split(' OR '))
            if actual_events != expected_events or 'FOR EACH ROW' not in found:
                raise RuntimeError('Missing/incompatible retention trigger: ' + name)


def migrate(engine):
    with engine.begin() as connection:
        inspector = inspect(connection)
        if not {'account_status', 'session_version'} <= {c['name'] for c in inspector.get_columns('users')}:
            raise RuntimeError('Customer security prerequisite absent')
        for table, _, _, _ in TRIGGERS:
            if not inspector.has_table(table):
                raise RuntimeError('Required existing table absent: ' + table)
        if connection.dialect.name == 'postgresql':
            if connection.execute(text('SELECT current_schema()')).scalar() != 'public':
                raise RuntimeError('Expected existing public schema')
            connection.execute(text("SET LOCAL lock_timeout = '5s'"))
            connection.execute(text("SET LOCAL statement_timeout = '60s'"))
            if not connection.execute(text('SELECT pg_try_advisory_xact_lock(187436922)')).scalar():
                raise RuntimeError('Retention migration is already running')
            if connection.dialect.server_version_info < (11,):
                raise RuntimeError('PostgreSQL 11+ required')
        columns = {c['name'] for c in inspector.get_columns('orders')}
        for name, ddl in COLUMNS.items():
            if name not in columns:
                connection.execute(text(f'ALTER TABLE orders ADD COLUMN {name} {ddl}'))
        if connection.dialect.name == 'postgresql':
            for sql in (ORDER_GUARD, CHILD_GUARD, CUSTOMER_GUARD):
                connection.execute(text(sql))
            for table, name, timing, function in TRIGGERS:
                exists = connection.execute(text('SELECT 1 FROM pg_trigger WHERE tgname=:name AND tgrelid=CAST(:table AS regclass) AND NOT tgisinternal'), {'name': name, 'table': table}).scalar()
                if not exists:
                    connection.execute(text(f'CREATE TRIGGER {name} {timing} ON {table} FOR EACH ROW EXECUTE FUNCTION {function}()'))
        verify(connection)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--apply', action='store_true')
    mode.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    if not args.apply and not args.verify:
        print('PLAN ONLY: add four order retention fields and six PostgreSQL guards. No connection. --apply requires separately approved backup and staging rehearsal.')
        return 0
    url = os.environ.get('DATABASE_URL', '')
    if url.startswith('postgres://'):
        url = url.replace('postgres://', 'postgresql://', 1)
    if not url.startswith(('postgresql://', 'postgresql+psycopg2://')):
        parser.error('Explicit PostgreSQL DATABASE_URL required')
    engine = None
    try:
        engine = create_engine(url, echo=False, hide_parameters=True, connect_args={'connect_timeout': 10})
        if args.apply:
            migrate(engine)
            print('Retention fields and guards committed. No customers or orders removed.')
        else:
            with engine.connect() as connection:
                connection.execute(text('SET TRANSACTION READ ONLY'))
                connection.execute(text("SET LOCAL statement_timeout = '60s'"))
                verify(connection)
            print('Retention schema and trigger verification passed (read-only).')
        return 0
    except Exception as exc:
        print('Migration failed (' + type(exc).__name__ + '). Do not activate destructive actions; inspect securely.')
        return 1
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == '__main__':
    raise SystemExit(main())

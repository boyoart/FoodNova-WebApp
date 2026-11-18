"""Opt-in REAL PostgreSQL race test; local empty test DB only, never production/staging.

Uses FOODNOVA_RETENTION_LOCAL_PG_URL with logical name foodnova_retention_test.
Leaves synthetic test records in place; never drops, truncates or resets a database.
"""
import os
import time
from concurrent.futures import ThreadPoolExecutor
from queue import Queue
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError
from tests.test_retained_orders import migration, blockers

pytestmark = pytest.mark.skipif(not os.getenv('FOODNOVA_RETENTION_LOCAL_PG_URL'),
    reason='Dedicated local PostgreSQL concurrency database not configured; not proved by SQLite')


def test_real_postgres_checkout_deletion_and_frozen_financial_guards():
    assert not any(key.startswith('PG') for key in os.environ), 'Refuse libpq environment overrides'
    url = make_url(os.environ['FOODNOVA_RETENTION_LOCAL_PG_URL'])
    assert url.host in {'localhost', '127.0.0.1', '::1'} and url.database == 'foodnova_retention_test', 'Empty dedicated LOCAL test DB required'
    assert url.drivername in {'postgresql', 'postgresql+psycopg2'} and set(url.query) <= {'sslmode'}
    engine = create_engine(url, echo=False, hide_parameters=True, connect_args={'connect_timeout': 5})
    try:
        assert not inspect(engine).get_table_names(schema='public'), 'Refuse to touch any pre-existing data'
        with engine.begin() as db:
            db.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, is_active BOOLEAN, account_status TEXT, session_version INTEGER)"))
            db.execute(text("CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_user_id INTEGER, order_status TEXT, payment_status TEXT, refund_status TEXT, total_amount FLOAT)"))
            for table in ('order_items', 'cancellation_requests', 'payment_approval_logs', 'delivery_offers'):
                db.execute(text(f'CREATE TABLE {table} (id INTEGER PRIMARY KEY, order_id INTEGER, status TEXT)'))
            db.execute(text("INSERT INTO users VALUES (1, TRUE, 'active', 0), (2, TRUE, 'active', 0)"))
            db.execute(text("INSERT INTO orders VALUES (1, 1, 'delivered', 'payment_confirmed', 'none', 100)"))
        migration.migrate(engine)
        migration.migrate(engine)
        with engine.begin() as db:
            for table in ('order_items', 'cancellation_requests', 'payment_approval_logs', 'delivery_offers'):
                db.execute(text(f"INSERT INTO {table} VALUES (10, 1, 'closed')"))

        def wait_for_block(connection, pid, owner):
            end = time.monotonic() + 5
            while time.monotonic() < end:
                if owner in connection.execute(text('SELECT pg_blocking_pids(:pid)'), {'pid': pid}).scalar():
                    return
                time.sleep(0.02)
            pytest.fail('Expected a real PostgreSQL row-lock wait, not just serial execution')

        # Deletion owns User first; a concurrently started checkout INSERT must wait,
        # then reject the deleted account before creating any order.
        with ThreadPoolExecutor(max_workers=1) as pool, engine.connect() as deletion:
            tx = deletion.begin()
            owner = deletion.execute(text('SELECT pg_backend_pid()')).scalar()
            deletion.execute(text('SELECT id FROM users WHERE id=1 FOR UPDATE'))
            deletion.execute(text('SELECT id FROM orders WHERE id=1 FOR UPDATE'))
            worker_pid = Queue()
            def checkout():
                with engine.begin() as db:
                    db.execute(text("SET LOCAL lock_timeout='8s'"))
                    worker_pid.put(db.execute(text('SELECT pg_backend_pid()')).scalar())
                    db.execute(text("INSERT INTO orders (id, customer_user_id, order_status) VALUES (2, 1, 'processing')"))
            future = pool.submit(checkout)
            try:
                wait_for_block(deletion, worker_pid.get(timeout=5), owner)
                deletion.execute(text("UPDATE users SET is_active=FALSE, account_status='deleted', session_version=1 WHERE id=1"))
                deletion.execute(text('UPDATE orders SET personal_data_erased_at=CURRENT_TIMESTAMP WHERE id=1'))
                tx.commit()
            finally:
                if tx.is_active:
                    tx.rollback()
            with pytest.raises(DBAPIError) as denied:
                future.result(timeout=10)
            assert denied.value.orig.pgcode == '23514'

        # Reverse ordering: checkout holds the same User lock first. Deletion
        # waits, then sees the newly committed active order and must stop.
        with ThreadPoolExecutor(max_workers=1) as pool, engine.connect() as checkout:
            tx = checkout.begin()
            owner = checkout.execute(text('SELECT pg_backend_pid()')).scalar()
            checkout.execute(text('SELECT id FROM users WHERE id=2 FOR UPDATE'))
            checkout.execute(text("INSERT INTO orders (id, customer_user_id, order_status, payment_status, refund_status, total_amount) VALUES (3, 2, 'processing', 'pending_payment', 'none', 100)"))
            worker_pid = Queue()
            def attempted_deletion():
                with engine.begin() as db:
                    db.execute(text("SET LOCAL lock_timeout='8s'"))
                    worker_pid.put(db.execute(text('SELECT pg_backend_pid()')).scalar())
                    db.execute(text('SELECT id FROM users WHERE id=2 FOR UPDATE'))
                    rows = db.execute(text('SELECT * FROM orders WHERE customer_user_id=2 ORDER BY id FOR UPDATE')).mappings().all()
                    return any(blockers(SimpleNamespace(**row)) for row in rows)
            future = pool.submit(attempted_deletion)
            try:
                wait_for_block(checkout, worker_pid.get(timeout=5), owner)
                tx.commit()
            finally:
                if tx.is_active:
                    tx.rollback()
            assert future.result(timeout=10) is True

        # Frozen financial writes and related-record inserts fail atomically.
        for sql in ("UPDATE orders SET payment_status='pending_payment' WHERE id=1",
                    "UPDATE orders SET refund_status='pending' WHERE id=1",
                    "INSERT INTO cancellation_requests VALUES (1, 1, 'pending')",
                    "INSERT INTO payment_approval_logs VALUES (1, 1, 'confirmed')",
                    "INSERT INTO delivery_offers VALUES (1, 1, 'ACCEPTED')",
                    "INSERT INTO order_items VALUES (1, 1, 'new')",
                    "DELETE FROM payment_approval_logs WHERE id=10",
                    "DELETE FROM cancellation_requests WHERE id=10",
                    "DELETE FROM delivery_offers WHERE id=10",
                    "DELETE FROM order_items WHERE id=10"):
            with pytest.raises(DBAPIError) as denied:
                with engine.begin() as db:
                    db.execute(text(sql))
            assert denied.value.orig.pgcode == '23514'
        with engine.connect() as db:
            migration.verify(db)
            assert db.execute(text('SELECT count(*) FROM orders WHERE id=2')).scalar() == 0
            assert db.execute(text('SELECT is_active FROM users WHERE id=2')).scalar() is True
            assert db.execute(text('SELECT total_amount FROM orders WHERE id=1')).scalar() == 100
    finally:
        engine.dispose()

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch, MagicMock
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text
sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_customer_security import setup, headers, action
import main
from services.retained_orders import blockers, require_guards, safe_reason
from scripts import migrate_retained_orders as migration
from sqlalchemy import Boolean, DateTime, Text
from fastapi import HTTPException
import os


@pytest.mark.parametrize('status,payment,refund,allowed', [
    ('cancelled', 'pending_payment', 'none', True),
    ('cancelled', 'payment_confirmed', 'none', False),
    ('cancelled', 'payment_confirmed', 'pending', False),
    ('cancelled', 'payment_confirmed', 'approved', False),
    ('cancelled', 'payment_confirmed', 'processed', True),
    ('delivered', 'payment_confirmed', 'none', True),
    ('completed', 'payment_confirmed', 'none', True),
    ('closed', 'pending_payment', 'none', False),
    ('processing', 'payment_confirmed', 'none', False),
    ('cancelled', 'disputed', 'none', False),
    ('delivered', 'chargeback', 'none', False),
])
def test_shared_closure_policy(status, payment, refund, allowed):
    order = SimpleNamespace(order_status=status, fulfillment_status='', status='', delivery_method='delivery',
        delivery_status='', payment_status=payment, refund_status=refund, total_amount=100)
    assert (not blockers(order)) is allowed


def order_for(db, user, **values):
    data = dict(order_code='FN-LEDGER', customer_user_id=user.id, customer_email=user.email,
                order_status='delivered', status='delivered', fulfillment_status='delivered',
                payment_status='payment_confirmed', total_amount=100, is_deleted=True)
    data.update(values)
    order = main.DBOrder(**data)
    db.add(order); db.commit()
    return order


def remove(client, admin, order):
    return client.post(f'/admin/orders/{order.id}/remove-permanently', headers=headers(admin),
        json={'reason': 'Closed retention review', 'confirmation': f'REMOVE ORDER {order.id}'})


def test_stale_legacy_status_does_not_block_cancelled_unpaid_customer(setup):
    db, user, admin, client, _ = setup
    order_for(db, user, order_status='order_placed', fulfillment_status='order_placed', status='cancelled', payment_status='pending_payment')
    assert action(client, admin, user, 'delete').status_code == 200
    assert client.get('/admin/customers', headers=headers(admin)).json()['total'] == 0


@pytest.mark.parametrize('status,refund', [('processing', 'none'), ('cancelled', 'pending'), ('cancelled', 'approved')])
def test_blocks_identify_exact_order_and_required_resolution(setup, status, refund):
    db, user, admin, client, _ = setup
    order = order_for(db, user, order_status=status, status=status, fulfillment_status=status, refund_status=refund)
    response = action(client, admin, user, 'delete')
    assert response.status_code == 409
    assert response.json()['detail']['blocking_orders'][0]['order_id'] == order.id
    assert response.json()['detail']['blocking_orders'][0]['reasons']
    log = db.query(main.DBAdminAuditLog).filter_by(action='customer_delete').one()
    assert 'blocked' in log.metadata_json and user.email not in log.metadata_json


@pytest.mark.parametrize('cancelled', [False, True])
def test_archived_terminal_order_removed_without_deleting_ledger(setup, cancelled, tmp_path):
    db, user, admin, client, _ = setup
    order = order_for(db, user, **({'order_status': 'cancelled', 'status': 'cancelled', 'fulfillment_status': 'cancelled', 'refund_status': 'processed'} if cancelled else {}))
    db.add(main.DBOrderItem(order_id=order.id, name='Rice', quantity=1, unit_price=100))
    db.add(main.DBPaymentApprovalLog(order_id=order.id, action='confirmed', new_payment_status='payment_confirmed', receipt_url='protected-receipt'))
    db.commit()
    invoice = tmp_path / 'original.pdf'; invoice.write_bytes(b'%PDF original retained evidence')
    with patch.object(main, 'invoice_file_path', return_value=invoice):
        assert remove(client, admin, order).status_code == 200
        assert client.get(f'/admin/historical-orders/{order.id}/invoice', headers=headers(admin)).status_code == 200
        assert invoice.read_bytes() == b'%PDF original retained evidence'
    db.refresh(order)
    assert order.operational_removed_at and order.is_deleted and order.total_amount == 100
    assert db.query(main.DBOrderItem).count() == 1 and db.query(main.DBPaymentApprovalLog).count() == 1
    assert client.get('/admin/orders?include_deleted=true', headers=headers(admin)).json()['orders'] == []
    assert client.get('/admin/orders?search=FN-LEDGER', headers=headers(admin)).json()['orders'] == []
    assert client.post(f'/admin/orders/{order.id}/restore', headers=headers(admin)).status_code == 404
    assert client.get('/admin/historical-orders', headers=headers(admin)).json()['total'] == 1
    ledger = client.get(f'/admin/historical-orders/{order.id}', headers=headers(admin))
    assert ledger.status_code == 200 and len(ledger.json()['payment_audit']) == 1
    assert remove(client, admin, order).status_code == 409
    assert db.query(main.DBAdminAuditLog).filter_by(action='order_operationally_removed').count() == 1


def test_active_fulfilment_hold_and_pending_request_block_removal(setup):
    db, user, admin, client, _ = setup
    order = order_for(db, user, delivery_status='IN_TRANSIT')
    assert remove(client, admin, order).status_code == 409
    order.delivery_status = ''; order.retention_hold = True; db.commit()
    assert remove(client, admin, order).status_code == 409
    order.retention_hold = False
    db.add(main.DBCancellationRequest(order_id=order.id, request_type='refund', status='pending')); db.commit()
    response = remove(client, admin, order)
    assert response.status_code == 409 and 'request_' in str(response.json())


def test_payment_history_prevents_false_unpaid_cancellation(setup):
    db, user, admin, client, _ = setup
    order = order_for(db, user, order_status='cancelled', fulfillment_status='cancelled', status='cancelled', payment_status='payment_rejected')
    db.add(main.DBPaymentApprovalLog(order_id=order.id, action='confirmed', new_payment_status='payment_confirmed')); db.commit()
    assert remove(client, admin, order).status_code == 409


def test_completed_delivery_offer_history_is_not_active_fulfilment(setup):
    db, user, admin, client, _ = setup
    order = order_for(db, user)
    offer = main.DBDeliveryOffer(order_id=order.id, worker_id=1, status='ACCEPTED', assignment_status='DELIVERED', expires_at=datetime.utcnow())
    db.add(offer); db.commit()
    assert remove(client, admin, order).status_code == 200
    assert db.query(main.DBDeliveryOffer).count() == 1


def test_current_rejected_payment_is_not_overridden_by_old_confirmation(setup):
    db, user, admin, client, _ = setup
    order = order_for(db, user, payment_status='payment_rejected')
    db.add(main.DBPaymentApprovalLog(order_id=order.id, action='confirmed', new_payment_status='payment_confirmed')); db.commit()
    assert remove(client, admin, order).status_code == 409


def test_super_admin_typed_confirmation_and_reason_enforced(setup):
    db, user, admin, client, _ = setup
    order = order_for(db, user)
    assert remove(client, user, order).status_code == 403
    admin.admin_role = 'customer_support'; db.commit()
    assert remove(client, admin, order).status_code == 403
    assert client.get('/admin/historical-orders', headers=headers(admin)).status_code == 403
    admin.admin_role = 'super_admin'; db.commit()
    assert client.post(f'/admin/orders/{order.id}/remove-permanently', headers=headers(admin), json={'reason': 'short', 'confirmation': 'wrong'}).status_code == 422
    assert not order.operational_removed_at


def test_hold_release_needs_explicit_confirmation_and_surviving_activity(setup):
    db, user, admin, client, _ = setup
    order = order_for(db, user)
    payload = {'reason': 'Reviewed legal hold', 'confirmation': f'HOLD ORDER {order.id}'}
    path = f'/admin/orders/{order.id}/retention-hold'
    assert client.post(path, headers=headers(user), json=payload).status_code == 403
    assert client.post(path, headers=headers(admin), json=payload).status_code == 200
    assert remove(client, admin, order).status_code == 409
    assert client.post(path + '?enabled=false', headers=headers(admin), json=payload).status_code == 422
    payload['confirmation'] = f'RELEASE HOLD ORDER {order.id}'
    assert client.post(path + '?enabled=false', headers=headers(admin), json=payload).status_code == 200
    assert remove(client, admin, order).status_code == 200
    assert db.query(main.DBAdminAuditLog).filter_by(action='order_retention_hold').count() == 2


def test_serialized_checkout_delete_interleavings(setup):
    db, user, admin, client, _ = setup
    active = order_for(db, user, order_status='processing', status='processing', fulfillment_status='processing')
    assert action(client, admin, user, 'delete').status_code == 409  # creation committed first
    active.order_status = active.status = active.fulfillment_status = 'delivered'; db.commit()
    old_headers = headers(user)
    assert action(client, admin, user, 'delete').status_code == 200  # deletion committed first
    assert client.get('/whoami', headers=old_headers).status_code == 401
    assert db.query(main.DBOrder).count() == 1
    # True overlapping PostgreSQL lock scheduling is an explicit staging gate, not proved by SQLite.


def test_customer_erasure_preserves_removed_order_audit_and_financial_history(setup):
    db, user, admin, client, _ = setup
    order = order_for(db, user)
    old_email = user.email
    db.add(main.DBPaymentApprovalLog(order_id=order.id, action='confirmed', new_payment_status='payment_confirmed'))
    db.commit()
    assert remove(client, admin, order).status_code == 200
    assert action(client, admin, user, 'delete').status_code == 200
    assert db.query(main.DBAdminAuditLog).filter(main.DBAdminAuditLog.action.in_(['customer_delete', 'order_operationally_removed'])).count() == 2
    assert db.query(main.DBPaymentApprovalLog).count() == 1
    db.refresh(order)
    assert order.customer_email == '' and order.total_amount == 100 and order.customer_user_id == user.id
    assert old_email not in str(client.get('/admin/historical-orders', headers=headers(admin)).json())


def test_activity_reason_redaction_and_database_guard_presence():
    assert '@' not in safe_reason('Erase customer test@example.test requested')
    assert '5551234567' not in safe_reason('Call +15551234567 for review')
    fake = SimpleNamespace(get_bind=lambda: SimpleNamespace(dialect=SimpleNamespace(name='postgresql')),
        execute=lambda statement: SimpleNamespace(scalars=lambda: []))
    with patch.dict(os.environ, {'RETAINED_INVOICE_STORAGE_DURABLE': 'false'}), pytest.raises(HTTPException) as unavailable:
        require_guards(fake)
    assert unavailable.value.status_code == 503
    with patch.dict(os.environ, {'RETAINED_INVOICE_STORAGE_DURABLE': 'true', 'RETAINED_INVOICE_STORAGE_DIR': str(Path.cwd() / 'unit-private-evidence')}), pytest.raises(HTTPException) as missing_guards:
        require_guards(fake)
    assert missing_guards.value.status_code == 503
    assert 'FOR UPDATE' in migration.CHILD_GUARD and 'FOR UPDATE' in migration.CUSTOMER_GUARD
    assert '23514' in migration.ORDER_GUARD and 'foodnova_retained_record_guard' in migration.ORDER_GUARD
    assert 'DROP ' not in migration.ORDER_GUARD and len(migration.TRIGGERS) == 6


def test_additive_retention_migration_is_repeatable():
    engine = create_engine('sqlite://')
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE users (id INTEGER PRIMARY KEY, account_status TEXT, session_version INTEGER)'))
        connection.execute(text('CREATE TABLE orders (id INTEGER PRIMARY KEY, total_amount FLOAT)'))
        connection.execute(text('INSERT INTO orders VALUES (1, 100)'))
        for name in ('cancellation_requests', 'payment_approval_logs', 'delivery_offers', 'order_items'):
            connection.execute(text(f'CREATE TABLE {name} (id INTEGER PRIMARY KEY)'))
    migration.migrate(engine); migration.migrate(engine)
    assert set(migration.COLUMNS) <= {c['name'] for c in inspect(engine).get_columns('orders')}
    with engine.connect() as connection:
        assert connection.execute(text('SELECT total_amount FROM orders')).scalar() == 100


def test_postgres_verification_accepts_canonical_trigger_event_order():
    connection = MagicMock()
    connection.dialect.name = 'postgresql'
    columns = [{'name': name, 'type': kind, 'nullable': nullable, 'default': 'false' if name == 'retention_hold' else None}
               for name, kind, nullable in [('operational_removed_at', DateTime(), True), ('personal_data_erased_at', DateTime(), True),
                                           ('retention_hold', Boolean(), False), ('retention_hold_reason', Text(), True)]]
    definitions = []
    for table, name, timing, function in migration.TRIGGERS:
        events = sorted(timing.removeprefix('BEFORE ').split(' OR '))
        definitions.append(SimpleNamespace(scalar=lambda table=table, name=name, events=events, function=function:
            f'CREATE TRIGGER {name} BEFORE {" OR ".join(events)} ON public.{table} FOR EACH ROW EXECUTE FUNCTION {function}()'))
    connection.execute.side_effect = definitions
    with patch.object(migration, 'inspect', return_value=SimpleNamespace(get_columns=lambda table: columns)):
        migration.verify(connection)


@pytest.mark.parametrize('path', ['/uploads/invoices/original.pdf', '/uploads//invoices/original.pdf', '/uploads/invoices/../invoices/original.pdf'])
def test_original_invoice_files_cannot_bypass_authorized_endpoint(path):
    import asyncio
    from starlette.requests import Request
    from unittest.mock import AsyncMock
    call_next = AsyncMock()
    response = asyncio.run(main.delivery_diagnostics_middleware(Request({'type': 'http', 'method': 'GET', 'path': path, 'headers': []}), call_next))
    assert response.status_code == 404
    call_next.assert_not_called()

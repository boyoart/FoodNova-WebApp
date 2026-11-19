"""Default-off deployment gate, using synthetic local records only."""
from unittest.mock import MagicMock, patch
from pathlib import Path
import sys

import pytest
from fastapi import HTTPException
from sqlalchemy import event

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_customer_security import setup, action, headers
from test_retained_orders import order_for, remove
import main
from services import customer_security, retained_orders


def snapshot(db):
    return {table.name: db.execute(table.select().order_by(*table.primary_key.columns)).all()
            for table in main.Base.metadata.sorted_tables}


@pytest.mark.parametrize('setting', [None, 'false', 'yes'])
@pytest.mark.parametrize('operation', ['delete', 'remove'])
@pytest.mark.parametrize('has_receipt', [False, True])
def test_disabled_gate_preserves_every_record_without_mutations(setup, monkeypatch, setting, operation, has_receipt):
    db, user, admin, client, _ = setup
    if setting is None:
        monkeypatch.delenv('CUSTOMER_DELETION_ENABLED', raising=False)
    else:
        monkeypatch.setenv('CUSTOMER_DELETION_ENABLED', setting)
    order = order_for(db, user, receipt='protected-test-receipt' if has_receipt else None)
    db.add(main.DBAddress(user_id=user.id, address_line='Synthetic saved address'))
    db.add(main.DBPaymentApprovalLog(order_id=order.id, action='confirmed', new_payment_status='payment_confirmed'))
    db.commit()
    before = snapshot(db)
    statements = []
    listener = lambda connection, cursor, sql, params, context, many: statements.append(sql.strip().upper())
    event.listen(db.get_bind(), 'before_cursor_execute', listener)
    try:
        with patch.object(retained_orders, 'require_guards', side_effect=AssertionError('gate must run first')), \
                patch.object(retained_orders, 'preserve_invoice', side_effect=AssertionError('no filesystem mutation')):
            response = action(client, admin, user, 'delete') if operation == 'delete' else remove(client, admin, order)
        assert response.status_code == 503
        assert response.json()['detail']['code'] == 'CUSTOMER_DELETION_DISABLED'
        assert response.headers['cache-control'] == 'no-store'
        assert 'No records were changed' in response.json()['detail']['message']
        assert not any(sql.startswith(('INSERT ', 'UPDATE ', 'DELETE ', 'ALTER ', 'CREATE ', 'DROP ')) for sql in statements)
        db.expire_all()
        assert snapshot(db) == before  # Includes identity, sessions, addresses, ledger and activity logs.
        assert client.get('/whoami', headers=headers(user)).status_code == 200
    finally:
        event.remove(db.get_bind(), 'before_cursor_execute', listener)


def test_service_gate_rejects_before_using_database(monkeypatch):
    monkeypatch.delenv('CUSTOMER_DELETION_ENABLED', raising=False)
    db = MagicMock()
    with pytest.raises(HTTPException) as error:
        customer_security.change_account(main, db, {'admin_role': 'super_admin'}, 1, 'delete',
                                         'Approved synthetic request', 'DELETE CUSTOMER 1')
    assert error.value.status_code == 503
    assert db.mock_calls == []


@pytest.mark.parametrize('kind', ['suspend', 'deactivate', 'reactivate'])
def test_disabled_deletion_does_not_block_other_account_actions(setup, monkeypatch, kind):
    db, user, admin, client, _ = setup
    monkeypatch.setenv('CUSTOMER_DELETION_ENABLED', 'false')
    assert action(client, admin, user, kind).status_code == 200
    db.refresh(user)
    assert user.account_status == {'suspend': 'suspended', 'deactivate': 'deactivated', 'reactivate': 'active'}[kind]
    assert db.query(main.DBAdminAuditLog).count() == 1


def test_disabled_gate_preserves_super_admin_authorization(setup, monkeypatch):
    db, user, admin, client, _ = setup
    monkeypatch.setenv('CUSTOMER_DELETION_ENABLED', 'false')
    order = order_for(db, user)
    admin.admin_role = 'customer_support'; db.commit()
    assert action(client, admin, user, 'delete').status_code == 403
    assert remove(client, admin, order).status_code == 403
    assert db.query(main.DBAdminAuditLog).count() == 0


def test_disabled_deletion_does_not_block_normal_cancellation(setup, monkeypatch):
    db, user, admin, client, _ = setup
    monkeypatch.setenv('CUSTOMER_DELETION_ENABLED', 'false')
    order = order_for(db, user, is_deleted=False, order_status='order_placed',
                      status='order_placed', fulfillment_status='order_placed', payment_status='pending_payment')
    cancellation = main.DBCancellationRequest(order_id=order.id, request_type='cancel', status='pending')
    db.add(cancellation); db.commit()
    client.app.patch('/admin/cancellation-requests/{request_id}/approve')(main.approve_cancellation_request)
    response = client.patch(f'/admin/cancellation-requests/{cancellation.id}/approve',
                            headers=headers(admin), json={'admin_note': 'Approved synthetic cancellation'})
    assert response.status_code == 200
    db.refresh(order)
    assert order.order_status == 'cancelled'
    assert order.operational_removed_at is None and order.personal_data_erased_at is None


def test_active_route_inventory_has_no_ungated_destructive_alias():
    # Every current alias must resolve to the same guarded implementations.
    routes = [route for route in main.fastapi_app.routes if hasattr(route, 'endpoint')]
    actions = [route for route in routes if route.endpoint.__module__ == 'routes.customer_security'
               and route.endpoint.__name__ == 'action']
    removals = [route for route in routes if route.endpoint.__module__ == 'routes.retained_orders'
                and route.endpoint.__name__ == 'remove']
    assert {route.path for route in actions} == {'/admin/customers/{customer_id}/account-status'}
    assert {route.path for route in removals} == {'/admin/orders/{order_id}/remove-permanently'}


def test_only_explicit_true_enables_gate(monkeypatch):
    monkeypatch.setenv('CUSTOMER_DELETION_ENABLED', 'true')
    retained_orders.require_deletion_enabled()

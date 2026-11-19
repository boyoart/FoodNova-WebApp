import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
os.environ.setdefault('DATABASE_URL', f'sqlite:///{ROOT / "test_foodnova_contracts.db"}')
import main
from models import EmailVerificationToken
from routes.customer_security import build_router
from routes.order_tracking import build_router as tracking_router
from routes.retained_orders import build_router as retained_router
from services import customer_security as security
from services import order_tracking


@pytest.fixture
def setup(monkeypatch):
    # Existing destructive-action regressions exercise the explicitly enabled release.
    # Activation-gate regressions override/remove this setting in their own cases.
    monkeypatch.setenv('CUSTOMER_DELETION_ENABLED', 'true')
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    main.Base.metadata.create_all(engine)
    order_tracking.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    db = sessions()
    customer = main.DBUser(full_name='Test customer', email='customer@example.com', password='legacy-test-password', role='customer', email_verified_at=datetime.utcnow())
    admin = main.DBUser(full_name='Admin', email='admin@example.com', password='legacy-test-password', role='admin', admin_role='super_admin')
    db.add_all([customer, admin]); db.commit()
    app = FastAPI()
    app.include_router(build_router(main)); app.include_router(tracking_router(main))
    app.include_router(retained_router(main))
    app.get('/admin/orders')(main.admin_orders)
    app.post('/admin/orders/{order_id}/restore')(main.restore_admin_order)
    app.post('/orders')(main.create_order)
    app.get('/orders/{order_id}')(main.get_order)
    app.get('/admin/customers')(main.admin_customers)
    app.post('/auth/register')(main.register)
    app.post('/api/auth/register')(main.api_auth_register)
    app.post('/register')(main.register_fallback)
    @app.get('/whoami')
    def whoami(request: Request): return main.public_user(main.require_user(request))
    with patch.object(main, 'SessionLocal', sessions), patch.object(main, 'JWT_SECRET', 'unit-test-key-not-for-production'), patch('email_service.send_customer_verification_email') as email, patch.object(main, 'safe_email_call'), patch.object(main, '_create_order_notification'), patch.object(main, 'ensure_order_invoice_pdf'):
        yield db, customer, admin, TestClient(app), email
    db.close(); engine.dispose()


def headers(user): return {'Authorization': 'Bearer ' + main.create_access_token(user)}


def action(client, admin, user, kind):
    return client.post(f'/admin/customers/{user.id}/account-status', headers=headers(admin), json={'action': kind, 'reason': 'Reviewed account request', 'confirmation': f'{kind.upper()} CUSTOMER {user.id}'})


def test_suspend_and_reactivate_revoke_old_sessions_immediately(setup):
    db, user, admin, client, _ = setup
    old = headers(user)
    assert client.get('/whoami', headers=old).status_code == 200
    assert action(client, admin, user, 'suspend').status_code == 200
    assert client.get('/whoami', headers=old).status_code == 401
    assert action(client, admin, user, 'reactivate').status_code == 200
    assert client.get('/whoami', headers=old).status_code == 401
    db.refresh(user)
    assert client.get('/whoami', headers=headers(user)).status_code == 200
    assert db.query(main.DBAdminAuditLog).count() == 2


@pytest.mark.parametrize('status,refund', [('processing', 'none'), ('out_for_delivery', 'none'), ('cancelled', 'pending')])
def test_account_deletion_blocks_unfinished_orders_and_refunds(setup, status, refund):
    db, user, admin, client, _ = setup
    db.add(main.DBOrder(order_code='FN-SECURITY', customer_email=user.email.upper(), customer_user_id=None, order_status=status, refund_status=refund, total_amount=100))
    db.commit()
    assert action(client, admin, user, 'delete').status_code == 409
    db.refresh(user); assert user.is_active


def test_delete_retains_transactions_and_erases_identifiable_email(setup):
    db, user, admin, client, _ = setup
    address = main.DBAddress(user_id=user.id, address_line='Historical test delivery address')
    db.add(address); db.flush()
    address_id = address.id
    order = main.DBOrder(order_code='FN-COMPLETE', customer_email=user.email, customer_user_id=user.id, delivery_address_id=address.id, order_status='delivered', refund_status='none', payment_status='payment_confirmed', total_amount=100)
    db.add(order); db.flush(); db.add(main.DBOrderItem(order_id=order.id, name='Rice', quantity=1, unit_price=100)); db.commit()
    old = headers(user)
    security.issue_verification(db, user)
    assert action(client, admin, user, 'delete').status_code == 200
    db.refresh(user); assert user.account_status == 'deleted' and not user.is_active
    assert db.query(main.DBOrder).count() == 1 and db.query(main.DBOrderItem).count() == 1
    assert db.query(main.DBAddress).filter_by(id=address_id).count() == 0
    assert client.get(f'/admin/customers/{user.id}', headers=headers(admin)).json()['customer']['addresses'] == []
    assert user.email.endswith('@erased.invalid') and user.phone == ''
    assert db.query(EmailVerificationToken).filter_by(user_id=user.id).count() == 0
    db.refresh(order)
    assert not order.customer_email and order.customer_user_id == user.id and order.personal_data_erased_at
    assert client.get('/whoami', headers=old).status_code == 401
    assert action(client, admin, user, 'reactivate').status_code == 409
    assert client.post('/auth/register', json={'email': 'customer@example.com', 'password': 'Password123', 'name': 'Another person'}).status_code == 200
    replacement = db.query(main.DBUser).filter_by(email='customer@example.com').one()
    replacement.email_verified_at = datetime.utcnow(); db.commit()
    assert client.get(f'/orders/{order.id}', headers=headers(replacement)).status_code == 403


def test_account_actions_require_super_admin_reason_and_confirmation(setup):
    db, user, admin, client, _ = setup
    assert action(client, user, user, 'suspend').status_code == 403
    admin.admin_role = 'customer_support'; db.commit()
    assert action(client, admin, user, 'suspend').status_code == 403
    admin.admin_role = 'super_admin'; db.commit()
    response = client.post(f'/admin/customers/{user.id}/account-status', headers=headers(admin), json={'action': 'delete', 'reason': '', 'confirmation': ''})
    assert response.status_code == 422


def test_verification_tokens_are_hashed_single_use_bound_and_expiring(setup):
    db, user, _, client, _ = setup
    user.email_verified_at = None; user.email_verification_required = True; db.commit()
    raw = security.issue_verification(db, user)
    record = db.query(EmailVerificationToken).one()
    assert record.token_hash != raw and raw not in str(record.__dict__)
    response = client.post('/auth/verification/confirm', json={'token': raw})
    assert response.status_code == 200 and raw not in response.text
    assert client.post('/auth/verification/confirm', json={'token': raw}).status_code == 400
    raw = security.issue_verification(db, user)
    record = db.query(EmailVerificationToken).filter_by(token_hash=order_tracking.digest(raw)).one()
    record.expires_at = datetime.utcnow() - timedelta(seconds=1); db.commit()
    assert client.post('/auth/verification/confirm', json={'token': raw}).status_code == 400


def test_invalid_verification_payload_never_echoes_tokens(setup):
    *_, client, _ = setup
    raw = 'sensitive-' + 'x' * 100
    response = client.post('/auth/verification/confirm', json={'token': raw})
    assert response.status_code == 400 and raw not in response.text
    response = client.post('/auth/verification/confirm', json=raw)
    assert response.status_code == 400 and raw not in response.text


def test_resend_is_own_account_only_and_rate_limited(setup):
    db, user, _, client, email = setup
    user.email_verified_at = None; db.commit()
    assert client.post('/auth/verification/resend').status_code == 401
    for _ in range(3): assert client.post('/auth/verification/resend', headers=headers(user)).status_code == 200
    assert client.post('/auth/verification/resend', headers=headers(user)).status_code == 429
    assert email.call_count == 3
    assert all(call.args[0] == user.email for call in email.call_args_list)


@pytest.mark.parametrize('route', ['/auth/register', '/api/auth/register', '/register'])
def test_all_registration_aliases_require_verification_without_returning_email_tokens(setup, route):
    db, _, _, client, email = setup
    response = client.post(route, json={'email': 'new@example.com', 'password': 'Password123', 'name': 'New customer'})
    assert response.status_code == 200
    assert response.json()['user']['email_verification_required'] is True
    assert email.call_count == 1 and email.call_args.args[1] not in response.text


def test_legacy_accounts_have_explicit_cutover_not_false_verification(setup):
    db, user, _, _, _ = setup
    user.email_verified_at = None; user.email_verification_required = False
    with patch.dict(os.environ, {'CUSTOMER_EMAIL_VERIFICATION_REQUIRED': 'false'}): assert not security.needs_verification(user)
    with patch.dict(os.environ, {'CUSTOMER_EMAIL_VERIFICATION_REQUIRED': 'true'}): assert security.needs_verification(user)
    assert user.email_verified_at is None


def test_unverified_customer_cannot_order_or_read_private_tracking(setup):
    db, user, _, client, _ = setup
    user.email_verified_at = None; user.email_verification_required = True
    db.add(main.DBOrder(order_code='FN-PRIVATE', customer_email=user.email, order_status='processing')); db.commit()
    response = client.post('/orders', headers=headers(user), json={'delivery_method': 'pickup', 'items': []})
    assert response.status_code == 403
    assert client.post('/tracking/lookup', headers=headers(user), json={'order_code': 'FN-PRIVATE'}).json()['status'] == 'verification_required'


def test_checkout_idempotency_replays_without_duplicate_stock_or_emails(setup):
    db, user, _, client, _ = setup
    product = main.DBProduct(name='Test Rice', price=100, stock_qty=20, stock=20, is_active=True)
    db.add(product); db.commit()
    body = {'delivery_method': 'pickup', 'order_source': 'customer_web', 'idempotency_key': 'test-checkout-123456789', 'items': [{'id': product.id, 'product_id': product.id, 'quantity': 1, 'price': 100}], 'total_amount': 100}
    first = client.post('/orders', headers=headers(user), json=body)
    assert first.status_code == 200, first.text
    second = client.post('/orders', headers=headers(user), json=body)
    assert second.status_code == 200 and second.json()['idempotent_replay']
    assert first.json()['order']['id'] == second.json()['order']['id']
    assert db.query(main.DBOrder).count() == 1
    db.refresh(product); assert product.stock_qty == 19
    assert client.post('/orders', headers=headers(user), json={**body, 'total_amount': 200}).status_code == 409


def test_customer_search_filters_pagination_and_details_are_authorized(setup):
    _, user, admin, client, _ = setup
    assert client.get('/admin/customers?page=1').status_code == 401
    assert client.get('/admin/customers?page=1', headers=headers(user)).status_code == 403
    result = client.get('/admin/customers?page=1&page_size=1&verification=verified&account_status=active&search=customer', headers=headers(admin)).json()
    assert result['total'] == 1 and len(result['customers']) == 1
    profile = client.get(f'/admin/customers/{user.id}', headers=headers(admin)).json()['customer']
    assert 'password' not in profile and profile['email_verified']


def test_additive_migration_is_repeatable_and_never_falsely_verifies_legacy_accounts():
    from scripts.migrate_customer_security import migrate
    from sqlalchemy import text, inspect
    engine = create_engine('sqlite://')
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE users (id INTEGER PRIMARY KEY, is_active BOOLEAN, session_version INTEGER NOT NULL DEFAULT 0)'))
        connection.execute(text('CREATE TABLE orders (id INTEGER PRIMARY KEY, manual_idempotency_key VARCHAR(160) UNIQUE)'))
        connection.execute(text('INSERT INTO users VALUES (1, FALSE, 7)'))
    migrate(engine)
    with engine.begin() as connection:
        row = connection.execute(text('SELECT account_status, email_verified_at, email_verification_required FROM users')).one()
        assert row[0] == 'deactivated' and row[1] is None and not row[2]
        connection.execute(text("UPDATE users SET account_status='suspended'"))
    migrate(engine)
    assert {'email_verification_tokens', 'account_action_limits'} <= set(inspect(engine).get_table_names())
    with engine.connect() as connection:
        assert connection.execute(text('SELECT account_status FROM users')).scalar_one() == 'suspended'
        assert connection.execute(text('SELECT session_version FROM users')).scalar_one() == 7
    engine.dispose()


def test_socket_order_subscriptions_use_live_account_and_ownership_checks(setup):
    db, user, admin, _, _ = setup
    order = main.DBOrder(order_code='FN-SOCKET', customer_email=user.email, customer_user_id=user.id, order_status='processing')
    db.add(order); db.commit()
    token = main.create_access_token(user)
    assert main._socket_order_allowed(token, order.id)
    other = main.DBUser(full_name='Other', email='other@example.com', password='test', role='customer', email_verified_at=datetime.utcnow())
    db.add(other); db.commit()
    assert not main._socket_order_allowed(main.create_access_token(other), order.id)
    security.change_account(main, db, {'id': admin.id, 'admin_role': 'super_admin'}, user.id, 'suspend', 'Security review completed', f'SUSPEND CUSTOMER {user.id}')
    assert not main._socket_order_allowed(token, order.id)


def test_socket_emissions_prune_revoked_sessions_before_delivery(setup):
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    _, user, _, _, _ = setup
    events = []
    async def disconnect(sid): events.append('disconnect')
    async def emit(*args, **kwargs): events.append('emit')
    fake = SimpleNamespace(manager=SimpleNamespace(get_participants=lambda *args: [('sid', 'engine-sid')]),
                           get_session=AsyncMock(return_value={'token': 'expired-unit-token'}), disconnect=disconnect, emit=emit)
    with patch.object(main, 'sio', fake), patch.object(main, 'SOCKET_EVENT_LOOP', None):
        main.socket_emit('order:update', {'status': 'processing'}, room=f'user:{user.id}')
    assert events == ['disconnect', 'emit']


def test_email_match_does_not_override_another_linked_customer_id(setup):
    db, user, admin, client, _ = setup
    db.add(main.DBOrder(order_code='FN-LINKED', customer_email=user.email, customer_user_id=admin.id, order_status='processing')); db.commit()
    result = client.post('/tracking/lookup', headers=headers(user), json={'order_code': 'FN-LINKED'})
    assert 'order' not in result.json()


def test_staging_email_origins_require_explicit_https_allowlisting():
    with patch.dict(os.environ, {'CUSTOMER_LINK_ALLOWED_ORIGINS': ''}):
        assert order_tracking.approved_frontend_origin('https://staging.example.com') is None
        assert order_tracking.approved_frontend_origin('https://www.foodnova.com.ng') == 'https://www.foodnova.com.ng'
    with patch.dict(os.environ, {'CUSTOMER_LINK_ALLOWED_ORIGINS': 'https://staging.example.com'}):
        assert order_tracking.link('test-capability', 'https://staging.example.com').startswith('https://staging.example.com/track-order#track=')
        assert order_tracking.approved_frontend_origin('http://staging.example.com') is None
        assert order_tracking.approved_frontend_origin('https://evil@staging.example.com') is None

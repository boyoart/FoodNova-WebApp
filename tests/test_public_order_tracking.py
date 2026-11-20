import os
import sys
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
os.environ.setdefault('DATABASE_URL', 'sqlite:///./test_foodnova_contracts.db')
import main
from routes.order_tracking import build_router
from services import order_tracking as tracking
from services import public_order_tracking as public


@pytest.fixture
def setup():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    main.Base.metadata.create_all(engine)
    tracking.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    db = sessions()
    user = main.DBUser(full_name='Fixture customer', email='fixture@example.test', password='not-a-real-password', role='customer')
    db.add(user); db.flush()
    order = main.DBOrder(order_code='FN-001', customer_user_id=user.id, customer_name='Fixture customer', customer_email=user.email,
        customer_phone='private', delivery_address='private', total_amount=2500, receipt='private-receipt',
        delivery_code='private-pin', rider_name='Private rider', order_status='processing', fulfillment_status='processing')
    db.add(order); db.commit()
    app = FastAPI(); app.include_router(build_router(main))
    app.get('/announcements/active')(main.get_active_announcements)
    app.patch('/admin/website-settings')(main.update_admin_website_settings)
    with patch.object(main, 'SessionLocal', sessions), patch.object(main, 'JWT_SECRET', 'isolated-test-key'):
        yield db, user, order, TestClient(app)
    db.close(); engine.dispose()


def lookup(client, number='FN-001', **kwargs):
    return client.post('/tracking/public', json={'order_number': number}, **kwargs)


def test_guest_and_logged_out_customer_need_only_number_without_authentication(setup):
    db, user, order, client = setup
    before = tuple(getattr(order, c.name) for c in order.__table__.columns)
    with patch.object(main, '_get_user_from_token', side_effect=AssertionError('Public route must not authenticate')):
        response = lookup(client)
        assert response.status_code == 200
        assert lookup(client, '001').json() == response.json()
        assert lookup(client, ' fn-001 ').json() == response.json()
    body = response.json()
    assert set(body) == {'order_number', 'status', 'status_label', 'delivery_stage', 'timeline'}
    assert body['status'] == 'preparing'
    assert all(set(step) == {'step', 'label', 'state'} for step in body['timeline'])
    for value in ['private', '2500', 'fixture@example', 'rider', 'payment', 'receipt', 'customer', 'invoice', 'token', 'latitude', 'longitude']:
        assert value not in response.text.lower()
    assert response.headers['cache-control'] == 'no-store, private'
    assert 'noindex' in response.headers['x-robots-tag']
    db.refresh(order)
    assert tuple(getattr(order, c.name) for c in order.__table__.columns) == before
    assert len(db.execute(select(tracking.tokens)).all()) == 0


@pytest.mark.parametrize('number', ['', '1', '../orders/1', 'FN-001?email=x', 'FN-abc$123', 'x'*100])
def test_invalid_formats_rejected(setup, number):
    assert lookup(setup[3], number).status_code == 422


def test_extra_verification_fields_are_not_required_or_accepted(setup):
    assert setup[3].post('/tracking/public', json={'order_number': 'FN-001', 'email': 'not-needed@example.test'}).status_code == 422
    assert setup[3].get('/tracking/public').status_code == 405


@pytest.mark.parametrize('field,value', [('is_deleted', True), ('operational_removed_at', datetime(2026,1,1)), ('personal_data_erased_at', datetime(2026,1,1))])
def test_archived_removed_and_erased_match_unknown_response(setup, field, value):
    db, _, order, client = setup
    setattr(order, field, value); db.commit()
    unknown = lookup(client, 'FN-999').json()
    result = lookup(client)
    assert result.status_code == 404 and result.json() == unknown


def test_deleted_customer_is_inaccessible_even_if_order_not_yet_erased(setup):
    db, user, _, client = setup
    user.account_status = 'deleted'; user.account_deleted_at = datetime.utcnow(); db.commit()
    assert lookup(client).status_code == 404


def test_guest_without_account_is_eligible(setup):
    db, _, order, client = setup
    order.customer_user_id = None; db.commit()
    assert lookup(client).status_code == 200


def test_shared_ip_limits_cannot_be_bypassed_by_switching_numbers_or_forwarded_headers(setup):
    db, _, _, client = setup
    with patch.dict(os.environ, {'ORDER_TRACKING_TRUSTED_PROXIES': ''}):
        for i in range(30):
            assert lookup(client, f'FN-{i+100:03d}', headers={'x-forwarded-for': f'192.0.2.{i}'}).status_code == 404
        blocked = lookup(client)
    assert blocked.status_code == 429 and blocked.headers['retry-after'] == '900'
    stored = str(db.execute(select(tracking.limits)).all())
    assert 'testclient' not in stored and 'FN-' not in stored


def test_missing_limiter_storage_fails_closed(setup):
    db, _, _, client = setup
    tracking.limits.drop(db.get_bind())
    assert lookup(client).status_code == 503


@pytest.mark.parametrize('status,delivery,completed,expected', [
    ('order_placed','','','order_placed'), ('pending_payment','','','order_placed'),
    ('accepted','','','preparing'), ('preparing','','','preparing'), ('processing','assigned','','preparing'),
    ('processing','accepted','','preparing'), ('ready_for_pickup','accepted','','ready_for_dispatch'),
    ('processing','picked_up','','out_for_delivery'), ('processing','in_transit','','out_for_delivery'),
    ('out_for_delivery','arrived','','out_for_delivery'), ('delivered','delivered','','delivery_update'),
    ('delivered','delivered','yes','delivered'), ('cancelled','assigned','','cancelled'),
    ('processing','returned','','delivery_update'), ('processing','failed','','delivery_update'),
    ('unknown_state','','','delivery_update'),
])
def test_status_mapping_uses_recorded_events_and_never_offer_assignment(setup, status, delivery, completed, expected):
    db, _, order, client = setup
    order.order_status = order.fulfillment_status = status; order.delivery_status = delivery
    if completed: order.delivery_confirmed_at = datetime.utcnow()
    db.commit()
    body = lookup(client).json()
    assert body['status'] == expected
    if not completed:
        assert not any(step['step'] == 'delivered' and step['state'] != 'pending' for step in body['timeline'])


def test_pickup_progress_has_no_fabricated_delivery_stage(setup):
    db, _, order, client = setup
    order.delivery_method = ' Pickup '; order.order_status = order.fulfillment_status = 'ready_for_pickup'; db.commit()
    assert lookup(client).json()['status'] == 'ready_for_pickup'
    order.order_status = order.fulfillment_status = 'picked_up_by_customer'; order.delivery_confirmed_at = datetime.utcnow(); db.commit()
    body = lookup(client).json()
    assert body['status'] == 'picked_up_by_customer'
    assert 'out_for_delivery' not in str(body)


def test_ticker_uses_existing_settings_authorization_and_scheduled_announcements(setup):
    db, _, _, client = setup
    db.add(main.DBAnnouncement(title='Ticker', message='Actual notice', display_type='top_bar', is_active=True))
    db.add_all([
        main.DBAnnouncement(title='Draft', message='Not published', display_type='top_bar', is_active=False),
        main.DBAnnouncement(title='Expired', message='Not current', display_type='top_bar', is_active=True, end_date=datetime(2000,1,1)),
        main.DBAnnouncement(title='Future', message='Not yet current', display_type='top_bar', is_active=True, start_date=datetime(2099,1,1)),
    ]); db.commit()
    assert client.patch('/admin/website-settings', json={'tickerEnabled': False}).status_code == 401
    with patch.object(main, 'require_user', return_value={'role':'customer'}):
        assert client.patch('/admin/website-settings', json={'tickerEnabled': False}).status_code == 403
    with patch.object(main, 'require_user', return_value={'role':'admin','admin_role':'super_admin'}), patch.object(main, 'create_admin_audit_log'):
        result = client.patch('/admin/website-settings', json={'tickerEnabled': False})
        assert result.status_code == 200
    body = client.get('/announcements/active').json()
    assert body['ticker_enabled'] is False
    assert [item['message'] for item in body['announcements']] == ['Actual notice']
    assert main.normalize_website_settings({})['tickerEnabled'] is True


def test_completed_timestamp_alone_does_not_claim_verified_delivery(setup):
    db, _, order, client = setup
    order.order_status = order.fulfillment_status = 'delivered'
    order.delivery_completed_at = datetime.utcnow(); db.commit()
    assert lookup(client).json()['status'] == 'delivery_update'


def test_validation_does_not_echo_extra_fields_and_rejects_oversized_body(setup):
    client = setup[3]
    result = client.post('/tracking/public', json={'order_number':'FN-001','email':'private-input@example.test'})
    assert result.status_code == 422 and 'private-input' not in result.text
    assert result.headers['cache-control'] == 'no-store, private'
    assert client.post('/tracking/public', content='x'*2048).status_code == 413


def test_storage_failure_is_generic_and_preserves_order(setup):
    from sqlalchemy.exc import SQLAlchemyError
    db, _, order, client = setup
    with patch.object(main, 'active_order_filter', side_effect=SQLAlchemyError('sensitive-query-details')):
        result = lookup(client)
    assert result.status_code == 503 and 'sensitive-query' not in result.text
    db.refresh(order); assert order.receipt == 'private-receipt' and order.order_status == 'processing'


def test_allowlist_schema_rejects_unapproved_fields():
    from pydantic import ValidationError
    from routes.public_order_tracking import PublicProgress
    with pytest.raises(ValidationError):
        PublicProgress(order_number='FN-001', status='order_placed', status_label='Order received', delivery_stage='Order received', timeline=[], customer_email='never-allowed@example.test')


def test_confirmation_without_capability_still_opens_public_tracking_page():
    import email_service
    order = {'id': 1, 'order_code': 'FN-001', 'customer_email': 'fixture@example.test', 'items': []}
    with patch.object(email_service, 'is_email_enabled', return_value=True), patch.object(tracking, 'confirmation_link', return_value=None), patch.object(email_service, 'send_email', return_value={'status': 'sent'}) as send:
        email_service.send_customer_order_email(order, 'order_placed')
        assert send.call_count == 1
        assert '/track-order' in send.call_args.kwargs['text']


def test_actual_production_router_and_middlewares_allow_number_only_lookup(setup):
    # Instantiate the actual ASGI wrapper without entering lifespan/startup, with fixture SessionLocal.
    client = TestClient(main.app)
    try:
        result = lookup(client)
        assert result.status_code == 200
        assert result.json()['order_number'] == 'FN-001'
        assert set(result.json()) == {'order_number','status','status_label','delivery_stage','timeline'}
        assert result.headers['cache-control'] == 'no-store, private'
    finally:
        client.close()

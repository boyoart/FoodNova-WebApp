import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
os.environ.setdefault('DATABASE_URL', f'sqlite:///{ROOT / "test_foodnova_contracts.db"}')
import main
from services import website_analytics as ga
from services import analytics_purchase as purchases
from services import order_tracking as tracking
from routes.website_analytics import build_router
from routes.order_tracking import build_router as tracking_router


@pytest.fixture
def db():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    main.Base.metadata.create_all(engine)
    purchases.metadata.create_all(engine)
    tracking.metadata.create_all(engine)
    session = sessionmaker(bind=engine)
    with patch.object(main, 'SessionLocal', session):
        connection = session()
        yield connection
        connection.close()
    engine.dispose()


@pytest.fixture
def client(db):
    app = FastAPI()
    app.include_router(build_router(main)); app.include_router(tracking_router(main))
    return TestClient(app)


@pytest.fixture
def order(db):
    order = main.DBOrder(order_code='FN-TEST123', customer_name='Private Person', customer_email='owner@example.com',
                         total_amount=2500, payment_status='payment_confirmed', order_status='processing',
                         delivery_method='delivery', refund_status='none', order_source='customer_web', created_at=datetime.utcnow(), is_deleted=False)
    db.add(order); db.commit(); db.refresh(order)
    return order


def test_reports_require_admin_reports_permission(client):
    assert client.get('/admin/website-analytics').status_code == 401
    with patch.object(main, 'require_user', return_value={'role': 'customer', 'email': 'owner@example.com'}):
        assert client.get('/admin/website-analytics').status_code == 403
    with patch.object(main, 'require_user', return_value={'role': 'admin', 'admin_role': 'stock_manager'}):
        assert client.get('/admin/website-analytics/summary').status_code == 403
    with patch.object(main, 'require_user', return_value={'role': 'admin', 'admin_role': 'super_admin'}), patch.dict(os.environ, {'GA4_PROPERTY_ID': '', 'GA4_SERVICE_ACCOUNT_JSON': ''}):
        response = client.get('/admin/website-analytics')
        assert response.status_code == 200
        assert response.json()['status'] == 'not_configured'
        assert response.json()['reports'] == {}


@pytest.mark.parametrize('preset', ['today', '7', '30', '90'])
def test_date_presets(preset):
    first, last = ga.report_range(preset)
    assert (datetime.fromisoformat(last) - datetime.fromisoformat(first)).days == (0 if preset == 'today' else int(preset) - 1)


@pytest.mark.parametrize('first,last', [('bad', 'bad'), ('2026-11-10', '2026-11-01'), ('2020-01-01', '2026-01-01'), ('2099-01-01', '2099-01-02')])
def test_invalid_dates(first, last):
    with pytest.raises(main.HTTPException): ga.report_range('custom', first, last)


def test_ga_reports_are_cached_and_keep_sampling_and_truncation_metadata():
    ga._cache.clear()
    def report(body, token):
        return {'rows': [{'dimensionValues': [{'value': '/' if value['name'] == 'pagePath' else 'test'} for value in body['dimensions']],
                          'metricValues': [{'value': '12'} for _ in body['metrics']]}], 'rowCount': 40,
                'metadata': {'samplingMetadatas': [{}], 'subjectToThresholding': True, 'dataLossFromOtherRow': True, 'timeZone': 'Africa/Lagos'}}
    with patch.dict(os.environ, {'GA4_PROPERTY_ID': '123', 'GA4_SERVICE_ACCOUNT_JSON': '{}'}), patch.object(ga, 'access_token', return_value='server-only'), patch.object(ga, 'run_report', side_effect=report) as api:
        first = ga.reporting('2026-11-01', '2026-11-02')
        second = ga.reporting('2026-11-01', '2026-11-02')
    assert api.call_count == len(ga.REPORTS)
    assert first['status'] == 'available' and second['cached']
    assert first['reports']['pages']['sampled'] and first['reports']['pages']['thresholded']
    assert first['reports']['pages']['truncated']
    assert ga.total(first, 'sessions') == 12  # Aggregate report, not the page/source rows.
    assert 'server-only' not in str(first)


def test_ga_empty_is_zero_and_api_failure_is_unavailable():
    empty = {'reports': {'totals': {'status': 'available', 'rows': []}}}
    assert ga.total(empty, 'sessions') == 0
    with patch.object(ga, 'run_report', side_effect=RuntimeError('secret credentials')):
        failed = ga._one('totals', '2026-11-01', '2026-11-02', 'secret')
    assert failed['status'] == 'unavailable' and ga.total({'reports': {'totals': failed}}, 'sessions') is None
    assert 'secret' not in str(failed)


def test_conversion_uses_ga_purchase_key_event_metric_not_filtered_session_totals():
    with patch.object(ga, 'run_report', return_value={'rows': [{'dimensionValues': [], 'metricValues': [{'value': '0.125'}]}]}) as api:
        report = ga._one('purchase_sessions', '2026-11-01', '2026-11-02', 'token')
    body = api.call_args.args[0]
    assert body['metrics'] == [{'name': 'sessionKeyEventRate:purchase'}]
    assert 'dimensionFilter' not in body
    assert ga.conversion_rate({'reports': {'purchase_sessions': report}}) == 12.5
    assert ga.conversion_rate({'reports': {}}) is None


def test_purchase_durable_unique_claim_and_payload_redaction(db, order):
    env = {'GA4_MEASUREMENT_ID': 'G-TEST123', 'GA4_API_SECRET': 'test-secret', 'GA4_PURCHASE_START_DATE': '2020-01-01'}
    with patch.dict(os.environ, env), patch.object(purchases, 'send_purchase') as send:
        assert purchases.report_purchase(db, order, '123.456', '789', main.DELIVERY_MATCH_CONFIRMED_PAYMENTS)['status'] == 'submitted'
        assert purchases.report_purchase(db, order, '123.456', '789', main.DELIVERY_MATCH_CONFIRMED_PAYMENTS)['status'] == 'already_claimed'
        assert send.call_count == 1
        payload = send.call_args.args[0]
    assert payload['events'][0]['params']['value'] == 2500
    assert not any(value in str(payload) for value in ['owner@example.com', 'Private Person', 'test-secret'])


@pytest.mark.parametrize('field,value', [('payment_status', 'pending_payment'), ('payment_status', 'receipt_submitted'), ('order_status', 'cancelled'), ('refund_status', 'processed'), ('is_deleted', True), ('order_source', 'admin_manual'), ('order_source', 'customer_app')])
def test_purchase_authoritative_payment_and_cancellation_rules(db, order, field, value):
    setattr(order, field, value)
    with patch.dict(os.environ, {'GA4_PURCHASE_START_DATE': '2020-01-01'}):
        assert not purchases.eligible(order, main.DELIVERY_MATCH_CONFIRMED_PAYMENTS)


def test_purchase_timeout_is_not_retried(db, order):
    with patch.dict(os.environ, {'GA4_MEASUREMENT_ID': 'G-TEST123', 'GA4_API_SECRET': 'x', 'GA4_PURCHASE_START_DATE': '2020-01-01'}), patch.object(purchases, 'send_purchase', side_effect=TimeoutError) as send:
        assert purchases.report_purchase(db, order, '1.2', '3', main.DELIVERY_MATCH_CONFIRMED_PAYMENTS)['status'] == 'uncertain'
        assert purchases.report_purchase(db, order, '1.2', '3', main.DELIVERY_MATCH_CONFIRMED_PAYMENTS)['status'] == 'already_claimed'
        assert send.call_count == 1


def test_public_order_source_is_backwards_compatible_and_cannot_impersonate_admin():
    assert main.OrderPayload().order_source == 'customer_app'
    assert main.OrderPayload(order_source='customer_web').order_source == 'customer_web'
    with pytest.raises(ValueError): main.OrderPayload(order_source='admin_manual')


def test_purchase_endpoint_checks_consent_and_ownership(client, order):
    body = {'consent': True, 'client_id': '123.456', 'session_id': '789'}
    url = f'/orders/{order.id}/analytics-purchase'
    assert client.post(url, json=body).status_code == 401
    with patch.object(main, 'require_user', return_value={'role': 'customer', 'email': 'stranger@example.com'}):
        assert client.post(url, json=body).status_code == 403
    with patch.object(main, 'require_user', return_value={'role': 'customer', 'email': order.customer_email}):
        assert client.post(url, json={**body, 'consent': False}).json()['status'] == 'consent_required'
        assert client.post(url, json={**body, 'client_id': 'email@example.com'}).status_code == 422


def test_guest_capability_is_hashed_expiring_revocable_and_order_bound(db, order):
    raw = tracking.issue(db, order.id)
    assert len(raw) == 43 and tracking.resolve(db, raw) == order.id
    row = db.execute(select(tracking.tokens)).mappings().one()
    assert row['token_hash'] != raw and len(row['token_hash']) == 64
    db.execute(tracking.tokens.update().values(expires_at=datetime.utcnow() - timedelta(seconds=1))); db.commit()
    assert tracking.resolve(db, raw) is None
    raw2 = tracking.issue(db, order.id)
    db.execute(tracking.tokens.update().where(tracking.tokens.c.token_hash == tracking.digest(raw2)).values(revoked=True)); db.commit()
    assert tracking.resolve(db, raw2) is None
    assert tracking.resolve(db, 'invalid') is None


def test_guest_response_never_contains_private_fields(client, db, order):
    raw = tracking.issue(db, order.id)
    with patch.dict(os.environ, {'ORDER_TRACKING_LINKS_ENABLED': 'true'}):
        response = client.post('/tracking/progress', json={'token': raw})
    assert response.status_code == 200
    assert response.headers['cache-control'] == 'no-store, private'
    assert response.json() == {'status': 'limited', 'progress': {'order_status': 'processing', 'delivery_method': 'delivery'}}
    assert not any(value in response.text for value in ['owner@example', 'Private Person', '2500', 'pin', 'rider', 'items'])


def test_invalid_expired_and_revoked_links_have_same_response(client, db, order):
    expired = tracking.issue(db, order.id)
    db.execute(tracking.tokens.update().where(tracking.tokens.c.token_hash == tracking.digest(expired)).values(expires_at=datetime.utcnow() - timedelta(seconds=1)))
    revoked = tracking.issue(db, order.id)
    db.execute(tracking.tokens.update().where(tracking.tokens.c.token_hash == tracking.digest(revoked)).values(revoked=True)); db.commit()
    with patch.dict(os.environ, {'ORDER_TRACKING_LINKS_ENABLED': 'true'}):
        responses = [client.post('/tracking/progress', json={'token': raw}) for raw in [expired, revoked, 'x' * 43]]
    assert all(response.status_code == 404 for response in responses)
    assert len({response.text for response in responses}) == 1


def test_forwarded_header_cannot_bypass_limits_without_explicit_proxy_trust():
    request = SimpleNamespace(client=SimpleNamespace(host='192.0.2.10'), headers={'x-forwarded-for': '198.51.100.7'})
    with patch.dict(os.environ, {'ORDER_TRACKING_TRUSTED_PROXIES': ''}):
        assert tracking.request_identity(request) == '192.0.2.10'
    with patch.dict(os.environ, {'ORDER_TRACKING_TRUSTED_PROXIES': '192.0.2.0/24'}):
        assert tracking.request_identity(request) == '198.51.100.7'


def test_tracking_revocation_requires_admin_order_permission(client, order):
    assert client.post(f'/tracking/{order.id}/revoke-links').status_code == 401
    with patch.object(main, 'require_user', return_value={'role': 'customer', 'email': order.customer_email}):
        assert client.post(f'/tracking/{order.id}/revoke-links').status_code == 403


def test_guest_order_number_never_authorizes_and_errors_are_neutral(client, order):
    with patch.dict(os.environ, {'ORDER_TRACKING_LINKS_ENABLED': 'true'}), patch.object(main, '_get_user_from_token', return_value=None):
        known = client.post('/tracking/lookup', json={'order_code': order.order_code}).json()
        missing = client.post('/tracking/lookup', json={'order_code': 'FN-NOTEXIST'}).json()
        assert known == missing
        assert 'order' not in known


def test_customer_tracking_ownership_and_cross_account_rejection(client, order):
    with patch.dict(os.environ, {'ORDER_TRACKING_LINKS_ENABLED': 'true'}), patch.object(main, '_get_user_from_token', return_value={'role': 'customer', 'email': order.customer_email}):
        owned = client.post('/tracking/lookup', json={'order_code': order.order_code})
        assert owned.json()['status'] == 'authorized'
        assert owned.json()['order']['id'] == order.id
    with patch.object(main, '_get_user_from_token', return_value={'role': 'customer', 'email': 'other@example.com'}):
        assert 'order' not in client.post('/tracking/lookup', json={'order_code': order.order_code}).json()


def test_shared_rate_limits_and_neutral_email_verification(client, db, order):
    with patch.dict(os.environ, {'ORDER_TRACKING_LINKS_ENABLED': 'true'}), patch.object(main, '_get_user_from_token', return_value=None), patch('email_service.send_tracking_link_email') as send:
        for _ in range(6):
            result = client.post('/tracking/lookup', json={'order_code': order.order_code, 'email': order.customer_email})
            assert result.status_code == 202
        assert send.call_count == 2
        assert '/track-order#track=' in send.call_args.args[2]
    assert len(db.execute(select(tracking.limits)).all()) > 0
    assert 'owner@example.com' not in str(db.execute(select(tracking.limits)).all())


def test_confirmation_adds_one_secure_cta_without_extra_emails():
    import email_service
    order = {'id': 1, 'order_code': 'FN-TEST', 'customer_email': 'owner@example.com', 'items': []}
    with patch.object(email_service, 'is_email_enabled', return_value=True), patch.object(tracking, 'confirmation_link', return_value='https://www.foodnova.com.ng/orders#track=' + 'a' * 43), patch.object(email_service, 'send_email', return_value={'status': 'sent'}) as send:
        email_service.send_customer_order_email(order, 'order_placed')
        assert send.call_count == 1
        assert 'Track My Order' in send.call_args.args[2]
        assert '/orders#track=' in send.call_args.kwargs['text']


def test_token_email_failures_never_log_raw_capabilities(capsys):
    import email_service
    raw = 'a' * 43
    def fail(*args, **kwargs): raise RuntimeError('sensitive-token-' + raw)
    with patch.object(email_service, 'is_email_enabled', return_value=True), patch.object(email_service, 'resend', SimpleNamespace(Emails=SimpleNamespace(send=fail))):
        response = email_service.send_tracking_link_email('owner@example.com', 'FN-TEST', 'https://www.foodnova.com.ng/orders#track=' + raw)
    assert response['status'] == 'failed'
    assert raw not in capsys.readouterr().out and raw not in str(response)

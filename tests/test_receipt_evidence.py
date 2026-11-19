import asyncio
import hashlib
import io
import json
from pathlib import Path
from unittest.mock import patch, MagicMock
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, text
from fastapi import UploadFile
from starlette.datastructures import Headers

from tests.test_customer_security import setup, headers
import main
from services import receipt_evidence as evidence
from services import retained_orders
from scripts import migrate_receipt_evidence as migration

URL = 'https://res.cloudinary.com/unit-cloud/image/upload/v123/foodnova/receipts/proof.pdf'
OTHER = 'https://res.cloudinary.com/unit-cloud/image/upload/v124/foodnova/receipts/previous.pdf'
PDF = b'%PDF-1.7\nunit-test-original-payment-evidence\n%%EOF'


@pytest.fixture
def private_store(tmp_path, monkeypatch):
    monkeypatch.setenv('RETAINED_RECEIPT_STORAGE_DIR', str(tmp_path / 'private-receipts'))
    monkeypatch.setenv('RETAINED_INVOICE_STORAGE_DURABLE', 'true')
    monkeypatch.setenv('RETAINED_RECEIPT_CLOUD_NAME', 'unit-cloud')
    return tmp_path / 'private-receipts'


def catalog():
    engine = create_engine('sqlite://')
    with engine.begin() as db:
        db.execute(text('CREATE TABLE orders (id INTEGER PRIMARY KEY, receipt TEXT, payment_status TEXT)'))
        db.execute(text('CREATE TABLE payment_approval_logs (id INTEGER PRIMARY KEY, order_id INTEGER, receipt_url TEXT, action TEXT)'))
        db.execute(text("INSERT INTO orders VALUES (1, :receipt, 'payment_confirmed')"), {'receipt': json.dumps({'url': URL, 'filename': 'customer-private-name.pdf'})})
        db.execute(text("INSERT INTO payment_approval_logs VALUES (1, 1, :url, 'confirmed')"), {'url': URL})
    return engine


def snapshot(engine):
    with engine.connect() as db:
        return db.execute(text('SELECT * FROM orders')).all(), db.execute(text('SELECT * FROM payment_approval_logs')).all()


def test_plan_only_never_connects_downloads_or_writes(private_store):
    with patch.object(migration, 'create_engine', side_effect=AssertionError('DB')), patch.object(evidence, 'download', side_effect=AssertionError('HTTP')):
        assert migration.main([]) == 0
    assert not private_store.exists()


def test_copy_checksum_duplicate_run_and_non_sensitive_manifest(private_store):
    engine = catalog(); before = snapshot(engine)
    fetch = MagicMock(return_value=PDF)
    report, name = migration.run(engine, expected={'orders': 1, 'order_receipts': 1, 'log_receipts': 1}, fetch=fetch)
    assert report['complete'] and report['unique_sources'] == 1
    fetch.assert_called_once_with(URL)
    record, saved = evidence.verified(URL)
    assert saved == PDF and record['sha256'] == hashlib.sha256(PDF).hexdigest()
    manifest = (private_store / name).read_text()
    assert URL not in manifest and 'cloudinary' not in manifest and 'customer-private-name' not in manifest
    assert report['evidence'][0]['references'] == [{'order_id': 1}, {'order_id': 1, 'payment_log_id': 1}]
    with patch.object(evidence, 'download', side_effect=AssertionError('must not download twice')):
        again, _ = migration.run(engine)
        verified, _ = migration.run(engine, verify_only=True)
    assert again['complete'] and again['evidence'][0]['status'] == 'verified_existing' and verified['complete']
    assert snapshot(engine) == before
    assert len(list(private_store.glob('*.bin'))) == 1


def test_failure_retains_completed_copies_and_retry_resumes_without_db_changes(private_store):
    engine = catalog()
    with engine.begin() as db:
        db.execute(text("INSERT INTO payment_approval_logs VALUES (2, 1, :url, 'previous')"), {'url': OTHER})
    before = snapshot(engine)
    def partial(source):
        if source == OTHER:
            raise OSError('sensitive-download-error-must-not-appear')
        return PDF
    failed, name = migration.run(engine, fetch=partial)
    assert not failed['complete'] and snapshot(engine) == before
    assert evidence.verified(URL)[1] == PDF
    assert 'sensitive-download' not in (private_store / name).read_text()
    retry = MagicMock(return_value=PDF)
    complete, _ = migration.run(engine, fetch=retry)
    assert complete['complete'] and snapshot(engine) == before
    retry.assert_called_once_with(OTHER)


def test_db_rollback_and_metadata_publication_failure_do_not_lose_evidence(private_store):
    engine = catalog(); before = snapshot(engine)
    source = evidence.PREFIX + 'a' * 64
    evidence.store(source, PDF)
    with pytest.raises(RuntimeError, match='rollback'):
        with engine.begin() as db:
            db.execute(text('UPDATE orders SET receipt=:receipt WHERE id=1'), {'receipt': json.dumps({'url': source})})
            raise RuntimeError('rollback')
    assert snapshot(engine) == before and evidence.verified(source)[1] == PDF
    real_publish = evidence.publish
    def interrupted(folder, name, data):
        if name.endswith('.json'):
            raise OSError('interrupted index publication')
        return real_publish(folder, name, data)
    with patch.object(evidence, 'publish', side_effect=interrupted), pytest.raises(OSError):
        evidence.store(URL, PDF)
    with pytest.raises(evidence.EvidenceError, match='missing'):
        evidence.verified(URL)
    assert evidence.store(URL, PDF)['sha256'] == hashlib.sha256(PDF).hexdigest()
    assert snapshot(engine) == before


def test_inventory_drift_and_wrong_expected_counts_cannot_claim_success(private_store):
    engine = catalog()
    with pytest.raises(evidence.EvidenceError, match='inventory_counts_changed'):
        migration.run(engine, expected={'orders': 22}, fetch=lambda source: PDF)
    def changed(source):
        with engine.begin() as db:
            db.execute(text("INSERT INTO payment_approval_logs VALUES (2, 1, :url, 'new')"), {'url': OTHER})
        return PDF
    report, _ = migration.run(engine, fetch=changed)
    assert not report['complete'] and not report['inventory_unchanged']


def test_corruption_missing_and_immutable_conflicts_never_fall_back(private_store):
    with pytest.raises(evidence.EvidenceError, match='missing'):
        evidence.verified(URL)
    record = evidence.store(URL, PDF)
    with pytest.raises(evidence.EvidenceError, match='conflict'):
        evidence.store(URL, PDF + b'changed')
    (private_store / (record['sha256'] + '.bin')).write_bytes(b'corrupt')
    with patch.object(evidence, 'download', side_effect=AssertionError('no fallback')), pytest.raises(evidence.EvidenceError, match='corrupt'):
        evidence.copy_original(URL)


@pytest.mark.parametrize('url', [
    'http://res.cloudinary.com/unit-cloud/image/upload/v1/a.pdf',
    'https://localhost/private.pdf',
    'https://res.cloudinary.com.evil.test/unit-cloud/image/upload/v1/a.pdf',
    'https://res.cloudinary.com/other-account/image/upload/v1/a.pdf',
    'https://res.cloudinary.com/unit-cloud/image/upload/w_400/v1/a.pdf',
    URL + '?redirect=https://localhost', URL + '#secret',
    'https://res.cloudinary.com/unit-cloud/image/upload/v1/../a.pdf',
    'https://res.cloudinary.com/unit-cloud/image/upload/a.pdf',
])
def test_only_pinned_versioned_originals_are_allowed(private_store, url):
    with pytest.raises(evidence.EvidenceError):
        evidence.original_url(url)


def test_download_validation_rejects_redirect_and_incomplete_copy(private_store):
    with pytest.raises(evidence.EvidenceError, match='redirect'):
        evidence.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://localhost')
    response = MagicMock()
    response.__enter__.return_value = response
    response.status = 200; response.geturl.return_value = URL
    response.read.return_value = PDF; response.headers = {'Content-Length': str(len(PDF) + 1)}
    with patch.object(evidence, 'build_opener', return_value=MagicMock(open=MagicMock(return_value=response))), pytest.raises(evidence.EvidenceError, match='incomplete'):
        evidence.download(URL)


def receipt_order(db, user, retained=False):
    order = main.DBOrder(order_code='FN-PRIVATE-RECEIPT', customer_user_id=user.id, customer_email=user.email,
        payment_status='payment_confirmed', order_status='delivered', receipt=json.dumps({'url': URL}),
        operational_removed_at=main.datetime.utcnow() if retained else None, is_deleted=retained)
    db.add(order); db.commit()
    return order


def test_authenticated_receipt_download_and_log_association(setup, private_store):
    db, user, admin, client, _ = setup
    order = receipt_order(db, user)
    log = main.DBPaymentApprovalLog(order_id=order.id, receipt_url=OTHER, action='confirmed')
    db.add(log); db.commit()
    evidence.store(URL, PDF); evidence.store(OTHER, PDF + b'previous')
    path = f'/admin/orders/{order.id}/receipt-evidence'
    assert client.get(path).status_code in (401, 403)
    assert client.get(path, headers=headers(user)).status_code == 403
    response = client.get(path, headers=headers(admin))
    assert response.status_code == 200 and response.content == PDF
    assert response.headers['cache-control'] == 'no-store, private' and response.headers['x-content-type-options'] == 'nosniff'
    assert client.get(path + f'?audit_log_id={log.id}', headers=headers(admin)).content == PDF + b'previous'
    assert client.get(path + '?audit_log_id=999', headers=headers(admin)).status_code == 404
    assert db.query(main.DBPaymentApprovalLog).one().receipt_url == OTHER
    assert db.query(main.DBAdminAuditLog).filter_by(action='payment_receipt_access').count() == 2
    admin.admin_role = 'customer_support'; admin.permissions_json = json.dumps(['payments:view']); db.commit()
    assert client.get(path, headers=headers(admin)).status_code == 200
    assert client.get(f'/admin/historical-orders/{order.id}/receipt', headers=headers(admin)).status_code == 403


def test_retained_evidence_super_admin_only_and_missing_never_proxies(setup, private_store):
    db, user, admin, client, _ = setup
    order = receipt_order(db, user, retained=True)
    path = f'/admin/historical-orders/{order.id}/receipt'
    admin.admin_role = 'customer_support'; admin.permissions_json = json.dumps(['payments:view']); db.commit()
    assert client.get(path, headers=headers(admin)).status_code == 403
    assert client.get(f'/admin/orders/{order.id}/receipt-evidence', headers=headers(admin)).status_code == 403
    admin.admin_role = 'super_admin'; db.commit()
    with patch.object(evidence, 'download', side_effect=AssertionError('no HTTP in API')):
        missing = client.get(path, headers=headers(admin))
    assert missing.status_code == 404 and URL not in missing.text
    evidence.store(URL, PDF)
    assert client.get(path, headers=headers(admin)).content == PDF
    listing = client.get(f'/admin/historical-orders/{order.id}/receipts', headers=headers(admin))
    assert listing.json()['evidence'][0]['available'] and URL not in listing.text


def test_receipt_log_ids_cannot_cross_order_boundaries(setup, private_store):
    db, user, admin, client, _ = setup
    order = receipt_order(db, user)
    foreign = main.DBPaymentApprovalLog(order_id=order.id + 999, receipt_url=URL, action='confirmed')
    db.add(foreign); db.commit(); evidence.store(URL, PDF)
    assert client.get(f'/admin/orders/{order.id}/receipt-evidence?audit_log_id={foreign.id}', headers=headers(admin)).status_code == 404


def test_protection_flag_alone_cannot_bypass_missing_historical_copies(setup, private_store, monkeypatch):
    db, user, admin, client, _ = setup
    order = receipt_order(db, user)
    db.add(main.DBPaymentApprovalLog(order_id=order.id, receipt_url=OTHER, action='confirmed')); db.commit()
    monkeypatch.setenv('RETAINED_PAYMENT_EVIDENCE_PROTECTED', 'true')
    # Exercise the PostgreSQL-only policy with real local queries, without
    # changing the engine dialect or connecting to any PostgreSQL database.
    policy_db = SimpleNamespace(query=db.query, get_bind=lambda: SimpleNamespace(dialect=SimpleNamespace(name='postgresql')))
    evidence.store(URL, PDF)
    assert any(reason.startswith('payment_evidence_missing') for reason in retained_orders.blockers(order, main, policy_db))
    evidence.store(OTHER, PDF)
    assert retained_orders.blockers(order, main, policy_db) == []


def test_private_upload_never_uses_public_cloudinary_and_rollback_keeps_only_private_orphan(private_store, monkeypatch):
    monkeypatch.setenv('PRIVATE_RECEIPT_UPLOADS_ENABLED', 'true')
    file = UploadFile(io.BytesIO(PDF), filename='private-name.pdf', headers=Headers({'content-type': 'application/pdf'}))
    with patch.object(main, 'upload_to_cloudinary', side_effect=AssertionError('public upload')):
        result = asyncio.run(main.save_uploaded_receipt(file))
    assert result['url'].startswith(evidence.PREFIX) and evidence.verified(result['url'])[1] == PDF
    # A subsequent order transaction rollback cannot publish or erase this file:
    # no public URL or DB reference was created by the storage operation itself.
    file = UploadFile(io.BytesIO(PDF), filename='proof.pdf', headers=Headers({'content-type': 'application/pdf'}))
    with patch.object(evidence, 'store', side_effect=OSError('disk unavailable')), patch.object(main, 'upload_to_cloudinary', side_effect=AssertionError('must not fall back')):
        with pytest.raises(main.HTTPException) as error:
            asyncio.run(main.save_uploaded_receipt(file))
    assert error.value.status_code == 503


def test_protection_attestation_cannot_silently_enable_public_uploads(private_store, monkeypatch):
    monkeypatch.setenv('RETAINED_PAYMENT_EVIDENCE_PROTECTED', 'true')
    monkeypatch.setenv('PRIVATE_RECEIPT_UPLOADS_ENABLED', 'false')
    with patch.object(main, 'upload_to_cloudinary', side_effect=AssertionError('public fallback')), pytest.raises(main.HTTPException) as denied:
        asyncio.run(main.save_uploaded_receipt(UploadFile(io.BytesIO(PDF), filename='proof.pdf', headers=Headers({'content-type': 'application/pdf'}))))
    assert denied.value.status_code == 503


@pytest.mark.parametrize('path', ['/uploads/receipts/proof.pdf', '/uploads//receipts/proof.pdf'])
def test_static_receipts_are_never_served_unauthenticated(path):
    from starlette.requests import Request
    from unittest.mock import AsyncMock
    handler = AsyncMock()
    response = asyncio.run(main.delivery_diagnostics_middleware(Request({'type': 'http', 'method': 'GET', 'path': path, 'headers': []}), handler))
    assert response.status_code == 404
    handler.assert_not_called()

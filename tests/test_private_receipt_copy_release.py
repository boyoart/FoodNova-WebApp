"""Standalone tests: no FoodNova app imports, remote DB, or real HTTP requests."""
import importlib.util
import json
import os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import Column, Integer, MetaData, String, Table, create_engine, event, text

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'backend/scripts/migrate_receipt_evidence.py'
spec = importlib.util.spec_from_file_location('standalone_receipt_copy', SCRIPT)
utility = importlib.util.module_from_spec(spec)
spec.loader.exec_module(utility)
evidence = utility.evidence
URL = 'https://res.cloudinary.com/unit-cloud/image/upload/v123/foodnova/receipts/proof.pdf'
OLDER = 'https://res.cloudinary.com/unit-cloud/image/upload/v122/foodnova/receipts/previous.pdf'
PDF = b'%PDF-1.7\nstandalone synthetic evidence\n%%EOF'


@pytest.fixture
def private_store(tmp_path, monkeypatch):
    monkeypatch.setenv('RETAINED_RECEIPT_STORAGE_DIR', str(tmp_path / 'private'))
    monkeypatch.setenv('RETAINED_INVOICE_STORAGE_DURABLE', 'true')
    monkeypatch.setenv('RETAINED_RECEIPT_CLOUD_NAME', 'unit-cloud')
    return tmp_path / 'private'


def catalog():
    engine = create_engine('sqlite://')
    with engine.begin() as db:
        # Only the five required columns from production main; no retention schema.
        db.execute(text('CREATE TABLE orders (id INTEGER PRIMARY KEY, receipt TEXT)'))
        db.execute(text('CREATE TABLE payment_approval_logs (id INTEGER PRIMARY KEY, order_id INTEGER, receipt_url TEXT)'))
        db.execute(text('INSERT INTO orders VALUES (1, :receipt)'), {'receipt': json.dumps({'url': URL, 'filename': 'sensitive-name.pdf'})})
        db.execute(text('INSERT INTO payment_approval_logs VALUES (1, 1, :url)'), {'url': URL})
    return engine


def snapshot(engine):
    with engine.connect() as db:
        return db.execute(text('SELECT * FROM orders')).all(), db.execute(text('SELECT * FROM payment_approval_logs')).all()


def test_default_plan_has_no_db_network_or_private_files(private_store):
    with patch.object(utility, 'create_engine', side_effect=AssertionError('DB')), patch.object(evidence, 'download', side_effect=AssertionError('HTTP')):
        assert utility.main([]) == 0
    assert not private_store.exists()


def test_no_application_dependencies_or_cloudinary_mutation_imports():
    for path in (SCRIPT, ROOT / 'backend/services/receipt_evidence.py'):
        source = path.read_text()
        for forbidden in ('from models', 'from database', 'import main', 'from main', 'import cloudinary', 'from fastapi', 'load_dotenv'):
            assert forbidden not in source


def test_postgres_inventory_sets_read_only_before_selects():
    engine = MagicMock()
    engine.dialect.name = 'postgresql'
    connection = engine.connect.return_value.execution_options.return_value.__enter__.return_value
    connection.dialect.name = 'postgresql'
    connection.execute.side_effect = [None, None, [SimpleNamespace(id=1, receipt=json.dumps({'url': URL}))],
                                      [SimpleNamespace(id=2, order_id=1, receipt_url=URL)]]
    metadata = MetaData()
    tables = [Table('orders', metadata, Column('id', Integer), Column('receipt', String)),
              Table('payment_approval_logs', metadata, Column('id', Integer), Column('order_id', Integer), Column('receipt_url', String))]
    with patch.object(utility, 'Table', side_effect=tables):
        counts, refs = utility.inventory(engine)
    engine.connect.return_value.execution_options.assert_called_once_with(isolation_level='REPEATABLE READ')
    statements = [str(call.args[0]) for call in connection.execute.call_args_list]
    assert statements[0] == 'SET TRANSACTION READ ONLY'
    assert statements[1] == "SET LOCAL statement_timeout='60s'"
    assert all(sql.startswith('SELECT ') for sql in statements[2:])
    assert counts == {'orders': 1, 'order_receipts': 1, 'log_receipts': 1} and len(refs) == 1


def test_minimal_main_schema_copy_is_read_only_and_idempotent(private_store):
    engine = catalog(); before = snapshot(engine)
    statements = []
    event.listen(engine, 'before_cursor_execute', lambda connection, cursor, sql, params, context, many: statements.append(sql.strip().upper()))
    fetch = MagicMock(return_value=PDF)
    report, name = utility.run(engine, expected={'orders': 1, 'order_receipts': 1, 'log_receipts': 1}, fetch=fetch)
    assert report['complete'] and report['unique_sources'] == 1
    fetch.assert_called_once_with(URL)
    assert all(sql.startswith(('SELECT ', 'PRAGMA ')) for sql in statements)
    assert snapshot(engine) == before
    raw = (private_store / name).read_text()
    assert URL not in raw and 'sensitive-name' not in raw and 'cloudinary' not in raw
    with patch.object(evidence, 'download', side_effect=AssertionError('duplicate HTTP')):
        again, _ = utility.run(engine)
        check, _ = utility.run(engine, verify_only=True)
    assert again['complete'] and check['complete']
    assert again['evidence'][0]['status'] == 'verified_existing'
    assert len(list(private_store.glob('*.bin'))) == 1
    assert evidence.verified(URL)[1] == PDF


def test_partial_failure_resume_and_non_sensitive_errors(private_store):
    engine = catalog()
    with engine.begin() as db:
        db.execute(text('INSERT INTO payment_approval_logs VALUES (2, 1, :url)'), {'url': OLDER})
    before = snapshot(engine)
    def fetch(source):
        if source == OLDER:
            raise OSError('do-not-expose-sensitive-error')
        return PDF
    failed, manifest = utility.run(engine, fetch=fetch)
    assert not failed['complete'] and snapshot(engine) == before
    assert 'do-not-expose' not in (private_store / manifest).read_text()
    assert evidence.verified(URL)[1] == PDF
    retry = MagicMock(return_value=PDF)
    report, _ = utility.run(engine, fetch=retry)
    assert report['complete'] and snapshot(engine) == before
    retry.assert_called_once_with(OLDER)


def test_checksum_conflicts_and_missing_verify_never_download(private_store):
    engine = catalog()
    with patch.object(evidence, 'download', side_effect=AssertionError('verify HTTP')):
        missing, _ = utility.run(engine, verify_only=True)
    assert not missing['complete']
    record = evidence.store(URL, PDF)
    with pytest.raises(evidence.EvidenceError, match='conflict'):
        evidence.store(URL, PDF + b'different')
    (private_store / (record['sha256'] + '.bin')).write_bytes(b'corrupt')
    with patch.object(evidence, 'download', side_effect=AssertionError('repair HTTP')), pytest.raises(evidence.EvidenceError, match='corrupt'):
        evidence.copy_original(URL)


def test_interrupted_publication_retains_data_and_retry_is_safe(private_store):
    real_publish = evidence.publish
    def fail_index(folder, name, data):
        if name.endswith('.json'):
            raise OSError('index failure')
        return real_publish(folder, name, data)
    with patch.object(evidence, 'publish', side_effect=fail_index), pytest.raises(OSError):
        evidence.store(URL, PDF)
    with pytest.raises(evidence.EvidenceError, match='missing'):
        evidence.verified(URL)
    assert evidence.store(URL, PDF)['bytes'] == len(PDF)


def test_wrong_counts_and_concurrent_inventory_change_cannot_succeed(private_store):
    engine = catalog()
    with pytest.raises(evidence.EvidenceError, match='inventory_counts_changed'):
        utility.run(engine, expected={'orders': 22})
    def change(source):
        with engine.begin() as db:
            db.execute(text('INSERT INTO payment_approval_logs VALUES (2, 1, :url)'), {'url': OLDER})
        return PDF
    report, _ = utility.run(engine, fetch=change)
    assert not report['complete'] and not report['inventory_unchanged']


@pytest.mark.parametrize('source', [
    'http://res.cloudinary.com/unit-cloud/image/upload/v1/proof.pdf',
    'https://127.0.0.1/proof.pdf',
    'https://res.cloudinary.com.evil.test/unit-cloud/image/upload/v1/proof.pdf',
    'https://res.cloudinary.com/other-cloud/image/upload/v1/proof.pdf',
    'https://res.cloudinary.com/unit-cloud/image/upload/w_500/v1/proof.pdf',
    'https://res.cloudinary.com/unit-cloud/image/upload/v1/../proof.pdf',
    'https://res.cloudinary.com/unit-cloud/image/upload/proof.pdf', URL + '?secret=value', URL + '#private',
])
def test_source_validation(private_store, source):
    with pytest.raises(evidence.EvidenceError):
        evidence.original_url(source)


def test_redirect_and_incomplete_body_refused(private_store):
    with pytest.raises(evidence.EvidenceError, match='redirect'):
        evidence.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://127.0.0.1')
    response = MagicMock()
    response.__enter__.return_value = response
    response.status = 200; response.geturl.return_value = URL
    response.read.return_value = PDF; response.headers = {'Content-Length': str(len(PDF) + 1)}
    with patch.object(evidence, 'build_opener', return_value=MagicMock(open=MagicMock(return_value=response))), pytest.raises(evidence.EvidenceError, match='incomplete'):
        evidence.download(URL)


def test_relative_and_public_roots_refused(private_store, monkeypatch):
    for path in ('relative', str(ROOT / 'backend/uploads/unsafe-private')):
        monkeypatch.setenv('RETAINED_RECEIPT_STORAGE_DIR', path)
        with pytest.raises(evidence.EvidenceError):
            evidence.root()


def test_cli_does_not_expose_driver_secrets(private_store, monkeypatch, capsys):
    monkeypatch.setenv('DATABASE_URL', 'postgresql://fixture:fixture@unreachable.invalid/test')
    with patch.object(utility, 'create_engine', side_effect=RuntimeError('private-driver-detail')):
        assert utility.main(['--apply']) == 1
    assert 'private-driver-detail' not in capsys.readouterr().out

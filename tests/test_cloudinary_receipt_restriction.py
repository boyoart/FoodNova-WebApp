"""Isolated provider mocks and synthetic local evidence; never contact Cloudinary/production."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine, text, event

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('receipt_restriction', ROOT / 'backend/scripts/restrict_cloudinary_receipts.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
PDF = b'%PDF-1.7\nSynthetic retained evidence\n%%EOF'


class FakeProvider:
    def __init__(self, resources):
        self.resources = deepcopy(resources)
        self.mutations = []
        self.fail_id = None
        self.collision = False

    def get(self, asset_id):
        return deepcopy(self.resources[asset_id])

    def target_empty(self, public_id):
        m.require(not self.collision, 'authenticated_target_collision')

    def convert(self, asset):
        self.mutations.append(asset['asset_id'])
        if self.fail_id == asset['asset_id']:
            raise RuntimeError('private provider error must never be printed')
        r = self.resources[asset['asset_id']]
        r['type'] = 'authenticated'
        r['secure_url'] = r['secure_url'].replace('/upload/', '/authenticated/')
        return deepcopy(r)


@pytest.fixture
def prepared(tmp_path, monkeypatch):
    monkeypatch.setenv('RETAINED_RECEIPT_STORAGE_DIR', str(tmp_path / 'private'))
    monkeypatch.setenv('RETAINED_INVOICE_STORAGE_DURABLE', 'true')
    monkeypatch.setenv('RETAINED_RECEIPT_CLOUD_NAME', 'unit-cloud')
    monkeypatch.setenv('CLOUDINARY_CLOUD_NAME', 'unit-cloud')
    monkeypatch.setenv('CLOUDINARY_API_KEY', 'synthetic-api-key')
    monkeypatch.setenv('CLOUDINARY_API_SECRET', 'synthetic-never-print-secret')
    monkeypatch.setenv('PRIVATE_RECEIPT_UPLOADS_ENABLED', 'true')
    monkeypatch.setenv('CUSTOMER_DELETION_ENABLED', 'false')
    monkeypatch.setenv('RETAINED_PAYMENT_EVIDENCE_PROTECTED', 'false')
    resources, rows, entries, refs = {}, [], [], {}
    for number in (1, 2):
        public_id = f'foodnova/receipts/receipt-{number}'
        url = f'https://res.cloudinary.com/unit-cloud/image/upload/v123/{public_id}.pdf'
        asset_id = str(number) * 32
        record = m.evidence.store(url, PDF)
        links = [{'order_id': number}, {'order_id': number, 'payment_log_id': number}]
        refs[url] = links
        entries.append({**record, 'references': links, 'status': 'verified_existing'})
        rows.append({'source_id': m.digest(url), 'asset_id': asset_id, 'receipt_exclusive': True})
        resources[asset_id] = {'asset_id': asset_id, 'public_id': public_id, 'resource_type': 'image',
            'version': 123, 'type': 'upload', 'format': 'pdf', 'bytes': len(PDF), 'secure_url': url,
            'derived': [{'secure_url': url.replace('/v123/', '/w_100/v123/')}], 'versions': [{'version': 122}]}
    counts = {'orders': 22, 'order_receipts': 2, 'log_receipts': 2}
    inventory = lambda engine: (deepcopy(counts), deepcopy(refs))
    monkeypatch.setattr(m.copies, 'inventory', inventory)
    provider = FakeProvider(resources)
    manifest = {'complete': True, 'inventory_unchanged': True, 'evidence': entries}
    mapping = {'assets': rows}
    def audited():
        return m.audit(None, provider, mapping, manifest, expected_sources=2)
    return SimpleNamespace(provider=provider, mapping=mapping, copy=manifest, audited=audited, refs=refs,
                           counts=counts, tmp=tmp_path, inventory=inventory)


def approval(report):
    return dict(reviewed_manifest_sha256=m.digest(m.encoded(report)), operator_approval=True, method=m.METHOD,
        provider_compatibility_confirmed=True, historical_routes_guaranteed=True, route_inventory_complete=True,
        receipt_exclusive_confirmed=True, provider_write_freeze_confirmed=True, provider_confirmation_reference='support-case-test',
        independent_backup_verified=True, backup_verification_reference='isolated-restore-test',
        quiet_window_confirmed=True, private_viewer_verified=True,
        expires_at=(datetime.now(timezone.utc) + timedelta(hours=1)).isoformat())


def execute(p, report, plan, **overrides):
    options = dict(manifest_hash=m.digest(m.encoded(report)), allowlist=report['allowlist'], approval=approval(report),
                   confirmation=m.CONFIRM, journal=lambda entry: None)
    options.update(overrides)
    return m.apply(None, p.provider, report, plan, **options)


def test_default_never_connects_or_writes(capsys):
    with patch.object(m, 'create_engine', side_effect=AssertionError('DB')), patch.object(m, 'Provider', side_effect=AssertionError('provider')):
        assert m.main([]) == 0
    assert 'PLAN ONLY' in capsys.readouterr().out


def test_audit_read_only_exact_identity_private_checksum_and_redaction(prepared):
    p = prepared
    report, plan = p.audited()
    assert report['audit_complete'] and report['eligible_assets'] == report['verified_private_copies'] == 2
    assert not p.provider.mutations
    public_report = json.dumps(report)
    for asset in plan['assets']:
        assert asset['asset_id'] not in public_report and asset['source'] not in public_report
        assert asset['public_id'] not in public_report
        assert any('/w_100/' in url for url in asset['routes'])
        assert any('/v122/' in url for url in asset['routes'])
        assert any(url.startswith('http://') for url in asset['routes'])
        assert any('/image/authenticated/' in url for url in asset['routes'])


@pytest.mark.parametrize('change', ['extra', 'missing', 'different', 'reordered'])
def test_exact_asset_allowlist_before_any_mutation(prepared, change):
    report, plan = prepared.audited()
    allow = deepcopy(report['allowlist'])
    if change == 'extra': allow.append({'source_id': 'f' * 64, 'asset_token': 'e' * 64})
    if change == 'missing': allow.pop()
    if change == 'different': allow[0]['asset_token'] = 'f' * 64
    if change == 'reordered': allow.reverse()
    with pytest.raises(m.Stop, match='allowlist'):
        execute(prepared, report, plan, allowlist=allow)
    assert not prepared.provider.mutations


@pytest.mark.parametrize('field', ['operator_approval', 'provider_compatibility_confirmed', 'historical_routes_guaranteed',
    'route_inventory_complete', 'receipt_exclusive_confirmed', 'provider_write_freeze_confirmed', 'independent_backup_verified',
    'backup_verification_reference', 'quiet_window_confirmed', 'private_viewer_verified'])
def test_missing_approval_prerequisite_stops_whole_batch(prepared, field):
    report, plan = prepared.audited(); permit = approval(report); permit[field] = False
    with pytest.raises(m.Stop): execute(prepared, report, plan, approval=permit)
    assert prepared.provider.mutations == []


def test_risk_exception_must_be_explicit_documented_and_approved(prepared):
    report, plan = prepared.audited(); permit = approval(report)
    permit.update(independent_backup_verified=False, risk_exception_approved=True, risk_exception_reference='reviewed-risk-test')
    assert execute(prepared, report, plan, approval=permit)['complete']


@pytest.mark.parametrize('change', ['hash', 'confirmation', 'expired', 'plan'])
def test_review_hash_confirmation_expiry_and_plan_integrity(prepared, change):
    report, plan = prepared.audited(); options = {}
    if change == 'hash': options['manifest_hash'] = '0' * 64
    if change == 'confirmation': options['confirmation'] = 'yes'
    if change == 'expired':
        permit = approval(report); permit['expires_at'] = '2000-01-01T00:00:00+00:00'; options['approval'] = permit
    if change == 'plan': plan['assets'][0]['public_id'] = 'products/unrelated'
    with pytest.raises(m.Stop): execute(prepared, report, plan, **options)
    assert not prepared.provider.mutations


@pytest.mark.parametrize('change', ['missing', 'corrupt', 'manifest', 'references'])
def test_bad_private_evidence_not_eligible(prepared, change):
    p = prepared; entry = p.copy['evidence'][0]
    if change == 'missing': (m.evidence.root() / (entry['source_id'] + '.json')).unlink()
    if change == 'corrupt': (m.evidence.root() / (entry['sha256'] + '.bin')).write_bytes(b'bad')
    if change == 'manifest': entry['sha256'] = '0' * 64
    if change == 'references': entry['references'] = []
    report, _ = p.audited()
    assert not report['audit_complete'] and report['unsupported_or_ambiguous']
    assert not p.provider.mutations


@pytest.mark.parametrize('change', ['account', 'transformed', 'unversioned', 'ambiguous', 'provider_url', 'namespace', 'type', 'collision'])
def test_wrong_accounts_and_ambiguous_assets_cannot_be_restricted(prepared, monkeypatch, change):
    p = prepared; r = p.provider.resources['1' * 32]
    if change == 'account': monkeypatch.setenv('RETAINED_RECEIPT_CLOUD_NAME', 'other-cloud')
    if change in {'transformed', 'unversioned', 'ambiguous'}:
        old = next(iter(p.refs)); links = p.refs.pop(old)
        new = old.replace('/v123/', {'transformed': '/w_10/v123/', 'unversioned': '/', 'ambiguous': '/v123/../'}[change])
        p.refs[new] = links
    if change == 'provider_url': r['secure_url'] = r['secure_url'].replace('receipt-1', 'other')
    if change == 'namespace': r['public_id'] = 'products/unrelated'
    if change == 'type': r['type'] = 'private'
    if change == 'collision': p.provider.collision = True
    report, _ = p.audited()
    assert not report['audit_complete'] and p.provider.mutations == []


def test_preflight_all_assets_before_first_mutation_and_database_drift(prepared):
    report, plan = prepared.audited()
    record = plan['assets'][-1]
    (m.evidence.root() / (record['source_id'] + '.json')).unlink()
    with pytest.raises(m.evidence.EvidenceError): execute(prepared, report, plan)
    assert not prepared.provider.mutations
    prepared.counts['orders'] += 1
    with pytest.raises(m.Stop, match='inventory'): execute(prepared, report, plan)


def test_partial_failure_stops_and_idempotent_retry_skips_converted_assets(prepared):
    report, plan = prepared.audited()
    prepared.provider.fail_id = plan['assets'][1]['asset_id']
    journal = []
    failed = execute(prepared, report, plan, journal=journal.append)
    assert not failed['complete'] and not failed['privacy_verified']
    assert journal[-1]['event'] == 'stopped_provider_failure_or_unknown_outcome'
    prepared.provider.fail_id = None
    success = execute(prepared, report, plan)
    assert success['complete'] and not success['privacy_verified']
    assert success['outcomes'][0]['status'] == 'already_authenticated'
    first = plan['assets'][0]['asset_id']
    assert prepared.provider.mutations.count(first) == 1
    before = list(prepared.provider.mutations)
    assert execute(prepared, report, plan)['complete']
    assert prepared.provider.mutations == before


@pytest.mark.parametrize('status', [200, 206, 301, 302, 429, 500, None])
def test_cache_or_derivative_success_redirect_and_unknown_response_fail_verification(prepared, status):
    report, plan = prepared.audited(); execute(prepared, report, plan)
    bad = next(url for url in plan['assets'][0]['routes'] if '/w_100/' in url)
    result = m.verify(None, prepared.provider, report, plan, lambda url, method: status if url == bad and method == 'GET' else 404)
    assert not result['all_inventoried_routes_denied']
    assert bad not in json.dumps(result)


def test_verification_probes_every_route_both_methods_without_mutation(prepared):
    report, plan = prepared.audited(); execute(prepared, report, plan)
    before = list(prepared.provider.mutations); calls = []
    def probe(url, method): calls.append((url, method)); return 403
    assert m.verify(None, prepared.provider, report, plan, probe)['all_inventoried_routes_denied']
    assert len(calls) == 2 * report['route_count'] and prepared.provider.mutations == before


def test_provider_adapter_only_exact_rename_no_overwrite_and_immutable_ids(prepared):
    adapter = m.Provider(); adapter.api = MagicMock(); adapter.uploader = MagicMock()
    r = next(iter(prepared.provider.resources.values()))
    adapter.api.resource_by_asset_id.return_value = r
    assert adapter.get(r['asset_id'])['asset_id'] == r['asset_id']
    adapter.api.resource_by_asset_id.assert_called_once_with(r['asset_id'], max_results=100, versions=True, **adapter.options)
    adapter.convert(r)
    adapter.uploader.rename.assert_called_once_with(r['public_id'], r['public_id'], resource_type='image', type='upload',
        to_type='authenticated', overwrite=False, invalidate=True, **adapter.options)
    assert adapter.uploader.method_calls[0][0] == 'rename'


def test_zero_changes_to_unrelated_product_asset_and_unknown_mutation_response(prepared):
    unrelated = {'asset_id': 'f' * 32, 'public_id': 'foodnova/products/rice', 'type': 'upload'}
    prepared.provider.resources[unrelated['asset_id']] = deepcopy(unrelated)
    report, plan = prepared.audited()
    execute(prepared, report, plan)
    assert prepared.provider.resources[unrelated['asset_id']] == unrelated
    assert unrelated['asset_id'] not in prepared.provider.mutations


def test_unexpected_mutation_response_stops_before_second_asset(prepared):
    report, plan = prepared.audited()
    real_convert = prepared.provider.convert
    def wrong_response(asset):
        result = real_convert(asset)
        result['asset_id'] = 'f' * 32
        return result
    prepared.provider.convert = wrong_response
    result = execute(prepared, report, plan)
    assert not result['complete'] and len(prepared.provider.mutations) == 1


def test_new_unaudited_derivative_and_backup_version_stop_before_mutation(prepared):
    report, plan = prepared.audited()
    resource = prepared.provider.resources[plan['assets'][0]['asset_id']]
    resource['derived'].append({'secure_url': resource['secure_url'].replace('/v123/', '/w_999/v123/')})
    with pytest.raises(m.Stop, match='unaudited_derivative'): execute(prepared, report, plan)
    resource['derived'].pop(); resource['versions'].append({'version': 90})
    with pytest.raises(m.Stop, match='unaudited_version'): execute(prepared, report, plan)
    assert not prepared.provider.mutations


def test_converted_new_version_is_retried_without_mutation_and_verified(prepared):
    report, plan = prepared.audited(); execute(prepared, report, plan)
    resource = prepared.provider.resources[plan['assets'][0]['asset_id']]
    resource['version'] = 124
    resource['secure_url'] = resource['secure_url'].replace('/v123/', '/v124/')
    resource['derived'] = [{'secure_url': resource['secure_url'].replace('/v124/', '/w_100/v124/')}]
    before = list(prepared.provider.mutations)
    assert execute(prepared, report, plan)['complete']
    seen = []
    def probe(url, method): seen.append(url); return 404
    assert m.verify(None, prepared.provider, report, plan, probe)['all_inventoried_routes_denied']
    assert any('/v124/' in url and '/image/upload/' in url for url in seen)
    assert prepared.provider.mutations == before


def test_durable_journal_failure_prevents_any_provider_mutation(prepared):
    report, plan = prepared.audited()
    def failed_journal(entry): raise OSError('synthetic disk failure')
    with pytest.raises(OSError): execute(prepared, report, plan, journal=failed_journal)
    assert not prepared.provider.mutations


@pytest.mark.parametrize('flag,value', [('PRIVATE_RECEIPT_UPLOADS_ENABLED', 'false'),
    ('CUSTOMER_DELETION_ENABLED', 'true'), ('RETAINED_PAYMENT_EVIDENCE_PROTECTED', 'true')])
def test_unsafe_activation_flags_prevent_mutations(prepared, monkeypatch, flag, value):
    report, plan = prepared.audited(); monkeypatch.setenv(flag, value)
    with pytest.raises(m.Stop, match='activation_flags'): execute(prepared, report, plan)
    assert not prepared.provider.mutations


def test_read_only_production_schema_inventory_and_preserved_originals(prepared, monkeypatch):
    engine = create_engine('sqlite://')
    source = next(iter(prepared.refs))
    with engine.begin() as db:
        db.execute(text('CREATE TABLE orders (id INTEGER PRIMARY KEY, receipt TEXT)'))
        db.execute(text('CREATE TABLE payment_approval_logs (id INTEGER PRIMARY KEY, order_id INTEGER, receipt_url TEXT)'))
        db.execute(text('INSERT INTO orders VALUES (1, :r)'), {'r': json.dumps({'url': source})})
        db.execute(text('INSERT INTO payment_approval_logs VALUES (1, 1, :r)'), {'r': source})
    statements = []
    event.listen(engine, 'before_cursor_execute', lambda c, cursor, sql, params, ctx, many: statements.append(sql.strip().upper()))
    # Original utility is imported separately to recover unmocked production inventory.
    copy_spec = importlib.util.spec_from_file_location('unmocked_copy', ROOT / 'backend/scripts/migrate_receipt_evidence.py')
    original = importlib.util.module_from_spec(copy_spec); copy_spec.loader.exec_module(original)
    monkeypatch.setattr(m.copies, 'inventory', original.inventory)
    mapping = {'assets': prepared.mapping['assets'][:1]}
    # Source sorting in fixtures is deterministic insertion order.
    manifest = {**prepared.copy, 'evidence': prepared.copy['evidence'][:1]}
    report, _ = m.audit(engine, prepared.provider, mapping, manifest, 1)
    assert report['audit_complete']
    assert all(sql.startswith(('SELECT ', 'PRAGMA ')) for sql in statements)
    assert not prepared.provider.mutations


def test_anonymous_probe_never_reads_body_or_follows_redirect(prepared):
    response = MagicMock(); response.__enter__.return_value = response; response.status = 403
    opener = MagicMock(); opener.open.return_value = response
    with patch.object(m, 'build_opener', return_value=opener):
        assert m.anonymous_status(next(iter(prepared.refs)), 'GET') == 403
    response.read.assert_not_called()
    request = opener.open.call_args.args[0]
    assert request.method == 'GET' and not request.has_header('Authorization') and not request.has_header('Cookie')


def test_wrong_credential_account_and_no_application_dependencies(prepared, monkeypatch):
    monkeypatch.setenv('CLOUDINARY_CLOUD_NAME', 'wrong-account')
    with pytest.raises(m.Stop, match='wrong_cloud'): m.Provider()
    source = (ROOT / 'backend/scripts/restrict_cloudinary_receipts.py').read_text()
    for forbidden in ('import main', 'from models', 'load_dotenv', '.destroy(', '.delete_resources(', 'access_mode='):
        assert forbidden not in source


def test_provider_paginates_all_derivatives_before_audit(prepared):
    adapter = m.Provider(); adapter.api = MagicMock()
    r = deepcopy(next(iter(prepared.provider.resources.values())))
    first = {**r, 'derived_next_cursor': 'next-page'}
    second = {**r, 'derived': [{'secure_url': r['secure_url'].replace('/v123/', '/w_200/v123/')} ]}
    adapter.api.resource_by_asset_id.side_effect = [first, second]
    result = adapter.get(r['asset_id'])
    assert len(result['derived']) == 2
    assert adapter.api.resource_by_asset_id.call_args_list[1].kwargs['derived_next_cursor'] == 'next-page'


def test_lost_conversion_response_reconciles_by_asset_id_on_retry(prepared):
    report, plan = prepared.audited()
    real_convert = prepared.provider.convert
    def uncertain(asset):
        real_convert(asset)
        raise TimeoutError('untrusted provider detail')
    prepared.provider.convert = uncertain
    assert not execute(prepared, report, plan)['complete']
    first = plan['assets'][0]['asset_id']
    prepared.provider.convert = real_convert
    assert execute(prepared, report, plan)['complete']
    assert prepared.provider.mutations.count(first) == 1


def test_cli_audit_apply_verify_only_new_private_reports_no_evidence_changes(prepared, monkeypatch, capsys):
    p = prepared
    monkeypatch.setenv('DATABASE_URL', 'postgresql://synthetic:synthetic@unreachable.invalid/test')
    monkeypatch.setattr(m, 'Provider', lambda: p.provider)
    monkeypatch.setattr(m, 'create_engine', lambda *a, **k: MagicMock())
    def write(name, value):
        path = p.tmp / name; path.write_bytes(m.encoded(value)); path.chmod(0o600); return str(path)
    mapping = write('mapping.json', p.mapping); copy = write('copy.json', p.copy)
    originals = {file: file.read_bytes() for file in m.evidence.root().iterdir() if file.is_file()}
    assert m.main(['--audit', '--asset-map', mapping, '--copy-manifest', copy, '--expected-sources', '2', '--run-id', 'audit']) == 0
    assert not p.provider.mutations
    folder = m.evidence.root() / 'restriction-control'
    manifest = folder / 'audit-report.json'; plan = folder / 'audit-plan.json'
    report = m.read_json(manifest)
    permit = write('permit.json', approval(report)); allow = write('allow.json', report['allowlist'])
    assert m.main(['--apply', '--manifest', str(manifest), '--plan', str(plan), '--copy-manifest', copy,
        '--approval', permit, '--allowlist', allow, '--manifest-sha256', m.digest(manifest.read_bytes()),
        '--confirm', m.CONFIRM, '--run-id', 'apply']) == 0
    monkeypatch.setattr(m, 'verify', lambda *a, **k: {'all_inventoried_routes_denied': True})
    assert m.main(['--verify', '--manifest', str(manifest), '--plan', str(plan), '--run-id', 'verify']) == 0
    before = list(p.provider.mutations)
    assert m.main(['--audit', '--asset-map', mapping, '--copy-manifest', copy, '--run-id', 'audit']) == 1
    assert p.provider.mutations == before
    for file, contents in originals.items(): assert file.read_bytes() == contents
    output = capsys.readouterr().out
    for secret in ('synthetic-never-print-secret', 'res.cloudinary.com', 'foodnova/receipts', '1' * 32, '2' * 32):
        assert secret not in output


def test_ambiguous_approval_json_keys_rejected(prepared):
    path = prepared.tmp / 'ambiguous.json'
    path.write_text('{"operator_approval":false,"operator_approval":true}')
    path.chmod(0o600)
    with pytest.raises(m.Stop, match='ambiguous_json_keys'): m.read_json(path)


def test_verify_before_restriction_never_probes_public_transformations(prepared):
    report, plan = prepared.audited()
    probe = MagicMock(side_effect=AssertionError('must not request public transformations'))
    with pytest.raises(m.Stop, match='assets_not_restricted'):
        m.verify(None, prepared.provider, report, plan, probe)
    probe.assert_not_called()

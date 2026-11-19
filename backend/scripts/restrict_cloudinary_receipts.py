"""Receipt-only Cloudinary restriction. No arguments = offline plan; never run at startup."""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sys
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import build_opener, ProxyHandler, Request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import create_engine
from scripts import migrate_receipt_evidence as copies
from services import receipt_evidence as evidence

METHOD = 'authenticated_delivery_with_invalidation'
CONFIRM = 'RESTRICT_ONLY_REVIEWED_RECEIPTS'


class Stop(Exception):
    """Only fixed, non-sensitive reason codes may be raised or reported."""


def digest(value):
    return hashlib.sha256(value.encode() if isinstance(value, str) else value).hexdigest()


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def require(condition, code):
    if not condition:
        raise Stop(code)


def read_json(path):
    path = Path(path)
    require(path.is_absolute() and not path.is_symlink() and path.is_file(), 'unsafe_input_file')
    require(path.stat().st_size <= 4 * 1024 * 1024, 'oversized_input')
    require(os.name == 'nt' or path.stat().st_mode & 0o077 == 0, 'private_input_permissions_required')
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, 'ambiguous_json_keys')
            result[key] = value
        return result
    return json.loads(path.read_text(encoding='utf-8'), object_pairs_hook=unique)


class Provider:
    """Only asset-ID GET, exact collision GET, and one narrowly scoped rename exist."""
    def __init__(self):
        import cloudinary.api
        import cloudinary.uploader
        self.api, self.uploader = cloudinary.api, cloudinary.uploader
        cloud = os.getenv('RETAINED_RECEIPT_CLOUD_NAME', '')
        require(cloud and cloud == os.getenv('CLOUDINARY_CLOUD_NAME'), 'wrong_cloud_account')
        require(os.getenv('CLOUDINARY_API_KEY') and os.getenv('CLOUDINARY_API_SECRET'), 'provider_credentials_missing')
        self.options = dict(cloud_name=cloud, api_key=os.environ['CLOUDINARY_API_KEY'],
                            api_secret=os.environ['CLOUDINARY_API_SECRET'], secure=True,
                            upload_prefix='https://api.cloudinary.com', timeout=30)

    def get(self, asset_id):
        result, derived, seen, cursor = None, [], set(), None
        for _ in range(100):
            page = self.api.resource_by_asset_id(asset_id, max_results=100, versions=True,
                **({'derived_next_cursor': cursor} if cursor else {}), **self.options)
            require(not page.get('next_cursor') and not page.get('versions_next_cursor'), 'unsupported_version_pagination')
            if result is None:
                result = dict(page)
            require(all(page.get(key) == result.get(key) for key in
                        ('asset_id', 'public_id', 'resource_type', 'type', 'version', 'format', 'bytes')),
                    'provider_changed_during_pagination')
            derived.extend(page.get('derived', []))
            cursor = page.get('derived_next_cursor')
            if not cursor:
                result['derived'] = derived
                return result
            require(cursor not in seen, 'provider_pagination_loop')
            seen.add(cursor)
        raise Stop('provider_pagination_limit')

    def target_empty(self, public_id):
        from cloudinary.exceptions import NotFound
        try:
            self.api.resource(public_id, resource_type='image', type='authenticated', **self.options)
        except NotFound:
            return
        raise Stop('authenticated_target_collision')

    def convert(self, asset):
        return self.uploader.rename(asset['public_id'], asset['public_id'], resource_type='image',
            type='upload', to_type='authenticated', overwrite=False, invalidate=True, **self.options)


def pinned_route(url, asset):
    """Provider/approved aliases only; no arbitrary hosts, redirects or unrelated assets."""
    p = urlsplit(url)
    cloud = os.environ.get('RETAINED_RECEIPT_CLOUD_NAME', '')
    require(p.scheme in {'https', 'http'} and p.netloc == 'res.cloudinary.com' and not p.query and not p.fragment,
            'unsupported_delivery_host_or_query')
    require(not any(ord(c) <= 32 for c in url) and '%' not in p.path and '\\' not in p.path,
            'ambiguous_delivery_route')
    require(not any(part in {'.', '..', ''} for part in p.path.split('/')[1:]), 'ambiguous_delivery_route')
    prefix = '/' + cloud + '/image/'
    require(p.path.startswith(prefix), 'wrong_cloud_account_or_resource')
    delivery, sep, tail = p.path[len(prefix):].partition('/')
    require(sep and delivery in {'upload', 'authenticated'}, 'unsupported_delivery_type')
    public_id = asset['public_id']
    # Transformation/version prefixes may precede the exact provider-confirmed ID.
    suffix = re.escape(public_id) + r'(?:\.[A-Za-z0-9]+)?'
    require(re.search(r'(?:^|/)' + suffix + '$', tail) is not None, 'unrelated_delivery_route')
    return url


def identity(resource, asset):
    require(all(resource.get(k) == asset[k] for k in ('asset_id', 'public_id', 'resource_type', 'format', 'bytes')),
            'provider_identity_changed')
    require(resource.get('type') in {'upload', 'authenticated'}, 'unsupported_delivery_type')
    if resource['type'] == 'upload':
        require(resource.get('version') == asset['version'] and resource.get('secure_url') == asset['source'],
                'provider_version_or_url_changed')


def private_match(source, manifest_entry):
    record, _ = evidence.verified(source)
    require(manifest_entry and manifest_entry.get('status') in {'copied', 'verified_existing'}, 'copy_manifest_entry_missing')
    require(all(record[k] == manifest_entry.get(k) for k in ('source_id', 'sha256', 'bytes', 'mime_type')),
            'copy_manifest_checksum_mismatch')
    return record


def audit(engine, provider, mapping, copy_manifest, expected_sources=7):
    require(copy_manifest.get('complete') is True and copy_manifest.get('inventory_unchanged') is True,
            'copy_manifest_not_complete')
    counts, refs = copies.inventory(engine)
    historical = {url: links for url, links in refs.items() if not url.startswith(evidence.PREFIX)}
    rows = mapping.get('assets', [])
    require(len({r['source_id'] for r in rows}) == len(rows), 'duplicate_source_mapping')
    require(len({r['asset_id'] for r in rows}) == len(rows), 'duplicate_asset_mapping')
    mapped = {r['source_id']: r for r in rows}
    entries = {r['source_id']: r for r in copy_manifest.get('evidence', [])}
    failures, assets, verified = [], [], 0
    for source, links in sorted(historical.items(), key=lambda item: digest(item[0])):
        sid = digest(source)
        try:
            evidence.original_url(source)
            record = private_match(source, entries.get(sid))
            verified += 1
            require(sorted(links, key=encoded) == sorted(entries[sid].get('references', []), key=encoded),
                    'copy_manifest_references_changed')
            row = mapped.get(sid)
            require(row and row.get('receipt_exclusive') is True, 'exact_receipt_mapping_required')
            require(re.fullmatch('[a-f0-9]{32}', row['asset_id']) is not None, 'invalid_asset_id')
            r = provider.get(row['asset_id'])
            require(r.get('asset_id') == row['asset_id'] and r.get('resource_type') == 'image'
                    and r.get('type') == 'upload' and r.get('secure_url') == source, 'ambiguous_provider_identity')
            require(re.fullmatch(r'foodnova/receipts/[A-Za-z0-9_-]+', r.get('public_id', '')) is not None,
                    'outside_receipt_namespace')
            require(isinstance(r.get('version'), int) and r.get('format') in {'jpg', 'jpeg', 'png', 'webp', 'pdf'}
                    and r.get('bytes') == record['bytes'], 'provider_content_metadata_mismatch')
            cloud = os.environ['RETAINED_RECEIPT_CLOUD_NAME']
            canonical = f"https://res.cloudinary.com/{cloud}/image/upload/v{r['version']}/{r['public_id']}.{r['format']}"
            require(canonical == source, 'ambiguous_provider_version')
            asset = {k: r[k] for k in ('asset_id', 'public_id', 'resource_type', 'version', 'format', 'bytes')}
            asset.update(source=source, source_id=sid, sha256=record['sha256'])
            routes = {source, canonical.replace(f"/v{r['version']}/", '/'),
                      canonical.replace(f"/v{r['version']}/", '/v1/')}
            # All provider-returned derivatives, backed-up version numbers and operator aliases.
            for derived in r.get('derived', []):
                require(derived.get('secure_url'), 'derivative_route_missing')
                routes.add(derived['secure_url'])
            for version in r.get('versions', []):
                require(isinstance(version.get('version'), int), 'unsupported_version_inventory')
                routes.add(canonical.replace(f"/v{r['version']}/", f"/v{version['version']}/"))
            routes.update(row.get('additional_routes', []))
            # Include versioned/unversioned/v1 forms of every known derivative as well.
            versions = {r['version'], 1} | {v['version'] for v in r.get('versions', [])}
            for url in list(routes):
                pinned_route(url, asset)
                base = re.sub(r'/v[0-9]+/', '/', url)
                routes.add(base)
                # Insert versions immediately before the exact provider public ID.
                for version in versions:
                    routes.add(base.replace('/' + asset['public_id'], f'/v{version}/' + asset['public_id']))
            for url in list(routes):
                routes.add(url.replace('/image/upload/', '/image/authenticated/', 1))
            for url in list(routes):
                routes.add(url.replace('https://', 'http://', 1))
            asset['routes'] = sorted(routes)
            provider.target_empty(asset['public_id'])
            assets.append(asset)
        except Exception as exc:
            code = str(exc) if isinstance(exc, Stop) else 'evidence_or_provider_read_failed'
            failures.append({'source_id': sid, 'reason': code})
    if set(mapped) != {digest(source) for source in historical}:
        failures.append({'reason': 'mapping_not_exact_inventory'})
    stable_counts, stable_refs = copies.inventory(engine)
    require(copies.fingerprint(counts, refs) == copies.fingerprint(stable_counts, stable_refs), 'database_inventory_changed')
    plan = {'version': 1, 'created_at': datetime.now(timezone.utc).isoformat(),
            'cloud_token': digest(os.environ['RETAINED_RECEIPT_CLOUD_NAME']),
            'database_fingerprint': copies.fingerprint(counts, refs), 'counts': counts,
            'copy_manifest_digest': digest(encoded(copy_manifest)), 'assets': assets}
    report = {'version': 1, 'mode': 'audit', 'privacy_verified': False, 'counts': counts, 'eligible_assets': len(assets),
              'expected_sources': expected_sources, 'unique_historical_sources': len(historical),
              'verified_private_copies': verified, 'unsupported_or_ambiguous': failures,
              'audit_complete': not failures and len(assets) == expected_sources and expected_sources > 0,
              'candidate_method': METHOD, 'account_compatibility': 'operator_provider_confirmation_required',
              'available_restriction_method': 'not_confirmed_until_account_specific_provider_approval',
              'access_control_policy': 'not_automated_without_account_specific_implementation',
              'expected_impact': 'only_exact_allowlisted_receipts_and_their_delivery_routes',
              'rollback_limitations': 'no_atomic_provider_rollback_no_republication_no_recall_of_downloaded_copies',
              'plan_digest': digest(encoded(plan)),
              'allowlist': [{'source_id': a['source_id'], 'asset_token': digest(a['asset_id'])} for a in assets],
              'route_count': sum(len(a['routes']) for a in assets)}
    return report, plan


def validate_plan(report, plan):
    require(report.get('audit_complete') is True and report.get('plan_digest') == digest(encoded(plan)), 'unreviewable_plan')
    require(plan.get('cloud_token') == digest(os.getenv('RETAINED_RECEIPT_CLOUD_NAME', '')), 'wrong_cloud_account')
    require(report.get('allowlist') == [{'source_id': a['source_id'], 'asset_token': digest(a['asset_id'])}
                                       for a in plan['assets']], 'plan_allowlist_changed')
    for asset in plan['assets']:
        evidence.original_url(asset['source'])
        require(digest(asset['source']) == asset['source_id'], 'plan_source_changed')
        for url in asset['routes']:
            pinned_route(url, asset)


def preflight(engine, provider, plan):
    counts, refs = copies.inventory(engine)
    require(copies.fingerprint(counts, refs) == plan['database_fingerprint'], 'database_inventory_changed')
    current = []
    for asset in plan['assets']:
        record, _ = evidence.verified(asset['source'])
        require(record['sha256'] == asset['sha256'] and record['bytes'] == asset['bytes'], 'private_evidence_changed')
        resource = provider.get(asset['asset_id'])
        identity(resource, asset)
        # New derivatives must be audited before mutation; after conversion old routes stay in the plan.
        for derivative in resource.get('derived', []):
            url = derivative.get('secure_url')
            if resource['type'] == 'upload':
                require(url in asset['routes'], 'unaudited_derivative')
            else:
                require(url, 'derivative_route_missing')
                pinned_route(url, asset)
        if resource['type'] == 'upload':
            for version in resource.get('versions', []):
                require(isinstance(version.get('version'), int), 'unsupported_version_inventory')
                url = asset['source'].replace(f"/v{asset['version']}/", f"/v{version['version']}/")
                require(url in asset['routes'], 'unaudited_version')
            provider.target_empty(asset['public_id'])
        current.append(resource)
    return current


def approved(report, manifest_hash, allowlist, approval, confirmation):
    require(digest(encoded(report)) == manifest_hash, 'reviewed_manifest_hash_required')
    require(allowlist == report['allowlist'], 'exact_allowlist_required')
    require(confirmation == CONFIRM, 'explicit_confirmation_required')
    require(approval.get('reviewed_manifest_sha256') == manifest_hash and approval.get('operator_approval') is True,
            'separate_operator_approval_required')
    require(approval.get('method') == METHOD and approval.get('provider_compatibility_confirmed') is True
            and approval.get('historical_routes_guaranteed') is True and approval.get('route_inventory_complete') is True
            and approval.get('receipt_exclusive_confirmed') is True
            and approval.get('provider_write_freeze_confirmed') is True
            and bool(approval.get('provider_confirmation_reference')), 'provider_guarantee_required')
    require((approval.get('independent_backup_verified') is True and bool(approval.get('backup_verification_reference'))) or
            (approval.get('risk_exception_approved') is True and bool(approval.get('risk_exception_reference'))),
            'independent_backup_or_documented_exception_required')
    require(approval.get('quiet_window_confirmed') is True and approval.get('private_viewer_verified') is True,
            'cutover_prerequisites_required')
    try:
        expiry = datetime.fromisoformat(approval['expires_at'])
        require(expiry.tzinfo is not None and expiry > datetime.now(timezone.utc), 'operator_approval_expired')
    except (KeyError, ValueError, TypeError):
        raise Stop('operator_approval_expiry_required') from None


def apply(engine, provider, report, plan, manifest_hash, allowlist, approval, confirmation, journal):
    validate_plan(report, plan)
    approved(report, manifest_hash, allowlist, approval, confirmation)
    current = preflight(engine, provider, plan)  # ALL candidates pass before the FIRST mutation.
    require(os.getenv('PRIVATE_RECEIPT_UPLOADS_ENABLED', '').lower() == 'true'
            and os.getenv('CUSTOMER_DELETION_ENABLED', '').lower() != 'true'
            and os.getenv('RETAINED_PAYMENT_EVIDENCE_PROTECTED', '').lower() != 'true', 'unsafe_activation_flags')
    outcomes = []
    journal({'event': 'preflight_passed', 'manifest_digest': manifest_hash})  # Must be durable before mutation.
    for asset, previous in zip(plan['assets'], current):
        token = digest(asset['asset_id'])
        if previous['type'] == 'authenticated':
            outcomes.append({'asset_token': token, 'status': 'already_authenticated'})
            continue
        try:
            journal({'event': 'conversion_requested', 'asset_token': token})
            # Re-read immediately before mutation, reducing (not eliminating) provider race exposure.
            identity(provider.get(asset['asset_id']), asset)
            result = provider.convert(asset)
            require(result.get('asset_id') == asset['asset_id'] and result.get('public_id') == asset['public_id']
                    and result.get('resource_type') == 'image' and result.get('type') == 'authenticated',
                    'unexpected_mutation_response')
            updated = provider.get(asset['asset_id'])
            identity(updated, asset)
            require(updated['type'] == 'authenticated', 'conversion_not_confirmed')
            journal({'event': 'conversion_confirmed', 'asset_token': token})
            outcomes.append({'asset_token': token, 'status': 'converted_verification_pending'})
        except Exception:
            journal({'event': 'stopped_provider_failure_or_unknown_outcome', 'asset_token': token})
            return {'complete': False, 'privacy_verified': False, 'outcomes': outcomes,
                    'failure': 'provider_failure_or_unknown_outcome_stop_reconcile_then_retry'}
    return {'complete': True, 'privacy_verified': False, 'outcomes': outcomes,
            'next': 'anonymous_verification_and_provider_cache_clearance_required'}


def anonymous_status(url, method):
    # No auth, cookies, proxy credentials, redirects, query cache-busters, body reads or downloads.
    opener = build_opener(ProxyHandler({}), evidence.NoRedirect())
    try:
        with opener.open(Request(url, method=method, headers={'Accept-Encoding': 'identity'}), timeout=20) as response:
            return response.status
    except HTTPError as exc:
        status = exc.code
        exc.close()
        return status
    except Exception:
        return None


def verify(engine, provider, report, plan, probe=anonymous_status):
    validate_plan(report, plan)
    current = preflight(engine, provider, plan)
    require(all(r['type'] == 'authenticated' for r in current), 'assets_not_restricted')
    results = []
    for asset, resource in zip(plan['assets'], current):
        routes = set(asset['routes'])
        # A rename can return a new version or regenerate authenticated derivatives.
        # Probe their unsigned authenticated AND old public forms without further mutation.
        for url in [resource.get('secure_url')] + [r.get('secure_url') for r in resource.get('derived', [])]:
            require(url, 'current_delivery_route_missing')
            pinned_route(url, asset)
            routes.add(url)
            routes.add(url.replace('/image/authenticated/', '/image/upload/', 1))
        for url in list(routes):
            routes.add(url.replace('https://', 'http://', 1))
        for url in sorted(routes):
            statuses = {method: probe(url, method) for method in ('HEAD', 'GET')}
            results.append({'route_token': digest(url), 'statuses': statuses,
                            'denied': all(status in {401, 403, 404, 410} for status in statuses.values())})
    complete = all(r['type'] == 'authenticated' for r in current) and bool(results) and all(r['denied'] for r in results)
    return {'mode': 'verify', 'all_inventoried_routes_denied': complete, 'checks': results,
            'privacy_guarantee': 'bounded_probe_only_provider_attestation_and_multi_region_checks_still_required'}


@contextmanager
def control_lock(folder):
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    require(not folder.is_symlink(), 'unsafe_control_directory')
    os.chmod(folder, 0o700)
    require(not (folder / '.restriction.lock').is_symlink(), 'unsafe_control_lock')
    handle = open(folder / '.restriction.lock', 'a+b')
    os.chmod(folder / '.restriction.lock', 0o600)
    try:
        if os.name == 'nt':
            import msvcrt
            if handle.tell() == 0:
                handle.write(b'0'); handle.flush()
            handle.seek(0); msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        handle.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--audit', action='store_true')
    mode.add_argument('--apply', action='store_true')
    mode.add_argument('--verify', action='store_true')
    for name in ('asset-map', 'copy-manifest', 'manifest', 'plan', 'allowlist', 'approval', 'manifest-sha256', 'confirm'):
        parser.add_argument('--' + name)
    parser.add_argument('--expected-sources', type=int, default=7)
    parser.add_argument('--run-id')
    args = parser.parse_args(argv)
    if not any((args.audit, args.apply, args.verify)):
        print('PLAN ONLY: no DB, provider, HTTP or filesystem access. Use --audit for read-only DB/provider inventory; --apply requires separate approval. No deletion activation.')
        return 0
    engine = None
    try:
        require(args.run_id and re.fullmatch('[a-zA-Z0-9_-]{1,60}', args.run_id), 'safe_unique_run_id_required')
        folder = evidence.root() / 'restriction-control'
        url = os.getenv('DATABASE_URL', '').replace('postgres://', 'postgresql://', 1)
        require(url.startswith(('postgresql://', 'postgresql+psycopg2://')), 'explicit_postgres_required')
        if args.apply:
            require(all((args.manifest, args.plan, args.allowlist, args.approval, args.manifest_sha256,
                         args.confirm, args.copy_manifest)), 'all_approval_inputs_required')
        engine = create_engine(url, echo=False, hide_parameters=True, connect_args={'connect_timeout': 10})
        provider = Provider()
        with control_lock(folder):
            require(not any(folder.glob(args.run_id + '-*')), 'run_id_already_used')
            events = []
            def journal(entry):
                events.append(entry)
                evidence.publish(folder, args.run_id + f'-event-{len(events):03}.json', encoded(entry))
            if args.audit:
                require(args.asset_map and args.copy_manifest, 'audit_inputs_required')
                report, plan = audit(engine, provider, read_json(args.asset_map), read_json(args.copy_manifest), args.expected_sources)
                evidence.publish(folder, args.run_id + '-plan.json', encoded(plan))
                result = report
            else:
                require(args.manifest and args.plan, 'reviewed_audit_and_plan_required')
                report, plan = read_json(args.manifest), read_json(args.plan)
                if args.apply:
                    require(digest(encoded(read_json(args.copy_manifest))) == plan['copy_manifest_digest'], 'copy_manifest_changed')
                    result = apply(engine, provider, report, plan, args.manifest_sha256,
                                   read_json(args.allowlist), read_json(args.approval), args.confirm, journal)
                else:
                    result = verify(engine, provider, report, plan)
            evidence.publish(folder, args.run_id + '-report.json', encoded(result))
        print(json.dumps({'mode': 'audit' if args.audit else 'apply' if args.apply else 'verify',
                          'report_sha256': digest(encoded(result)),
                          **{k: result[k] for k in ('eligible_assets', 'verified_private_copies', 'audit_complete',
                             'complete', 'privacy_verified', 'all_inventoried_routes_denied') if k in result}}))
        return 0 if result.get('audit_complete', result.get('complete', result.get('all_inventoried_routes_denied', False))) else 1
    except Exception as exc:
        print(json.dumps({'stopped': True, 'reason': str(exc) if isinstance(exc, Stop) else 'receipt_restriction_failed',
                          'next': 'inspect_private_audit_journal_no_automatic_rollback_or_republication'}))
        return 1
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == '__main__':
    raise SystemExit(main())

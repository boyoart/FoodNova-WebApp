"""Copy receipt originals into private storage. Default plan: no DB, HTTP or file access."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import MetaData, Table, create_engine, select, text
from services import receipt_evidence as evidence


def inventory(engine):
    with engine.connect().execution_options(isolation_level='REPEATABLE READ' if engine.dialect.name == 'postgresql' else 'SERIALIZABLE') as db:
        if db.dialect.name == 'postgresql':
            db.execute(text('SET TRANSACTION READ ONLY'))
            db.execute(text("SET LOCAL statement_timeout='60s'"))
        orders = Table('orders', MetaData(), autoload_with=db)
        logs = Table('payment_approval_logs', MetaData(), autoload_with=db)
        references, order_count, receipt_count, log_count = {}, 0, 0, 0
        for row in db.execute(select(orders.c.id, orders.c.receipt)):
            order_count += 1
            if row.receipt:
                receipt_count += 1
                source = evidence.read_receipt(row.receipt)
                references.setdefault(source, []).append({'order_id': row.id})
        for row in db.execute(select(logs.c.id, logs.c.order_id, logs.c.receipt_url)):
            if row.receipt_url:
                log_count += 1
                references.setdefault(row.receipt_url, []).append({'order_id': row.order_id, 'payment_log_id': row.id})
        return {'orders': order_count, 'order_receipts': receipt_count, 'log_receipts': log_count}, references


def fingerprint(counts, references):
    rows = sorted((evidence.source_id(source), sorted(refs, key=lambda ref: json.dumps(ref, sort_keys=True)))
                  for source, refs in references.items())
    return hashlib.sha256(json.dumps([counts, rows], sort_keys=True).encode()).hexdigest()


def run(engine, verify_only=False, expected=None, fetch=None):
    counts, references = inventory(engine)
    if expected and any(value is not None and counts[name] != value for name, value in expected.items()):
        raise evidence.EvidenceError('inventory_counts_changed')
    # Preflight every URL before any copy, preventing mixed inventories/SSRF adapters.
    for source in references:
        if not source.startswith(evidence.PREFIX):
            evidence.original_url(source)
    baseline = fingerprint(counts, references)
    report = {'version': 1, 'counts': counts, 'unique_sources': len(references),
              'mode': 'verify' if verify_only else 'copy', 'complete': False, 'evidence': []}
    for source, refs in sorted(references.items(), key=lambda item: evidence.source_id(item[0])):
        item = {'source_id': evidence.source_id(source), 'references': refs}
        try:
            if verify_only:
                record, _ = evidence.verified(source)
                status = 'verified_existing'
            else:
                record, status = evidence.copy_original(source, fetch)
            item.update({key: record[key] for key in ('sha256', 'bytes', 'mime_type')})
            item['status'] = status
        except Exception as exc:
            item['status'] = 'failed'
            item['error'] = str(exc) if isinstance(exc, evidence.EvidenceError) else 'copy_failed'
        report['evidence'].append(item)
    current_counts, current = inventory(engine)
    report['inventory_unchanged'] = fingerprint(current_counts, current) == baseline
    report['complete'] = report['inventory_unchanged'] and all(item['status'] != 'failed' for item in report['evidence'])
    with evidence.locked() as folder:
        name = 'receipt-manifest-' + uuid4().hex + '.json'
        evidence.publish(folder, name, json.dumps(report, sort_keys=True, indent=2).encode())
    return report, name


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--apply', action='store_true')
    mode.add_argument('--verify', action='store_true')
    for name in ('orders', 'order-receipts', 'log-receipts'):
        parser.add_argument('--expected-' + name, type=int)
    args = parser.parse_args(argv)
    if not args.apply and not args.verify:
        print('PLAN ONLY: inventory orders/payment logs read-only; explicitly copy validated Cloudinary originals with --apply, or verify private checksums without HTTP using --verify. No connection or filesystem changes.')
        return 0
    engine = None
    try:
        evidence.root()
        url = os.environ.get('DATABASE_URL', '')
        if url.startswith('postgres://'):
            url = url.replace('postgres://', 'postgresql://', 1)
        if not url.startswith(('postgresql://', 'postgresql+psycopg2://')):
            raise evidence.EvidenceError('explicit_postgres_url_required')
        engine = create_engine(url, echo=False, hide_parameters=True, connect_args={'connect_timeout': 10})
        report, name = run(engine, args.verify, {
            'orders': args.expected_orders, 'order_receipts': args.expected_order_receipts, 'log_receipts': args.expected_log_receipts})
        print(json.dumps({'complete': report['complete'], 'counts': report['counts'], 'unique_sources': report['unique_sources'],
                          'manifest': name, 'failed': sum(item['status'] == 'failed' for item in report['evidence'])}))
        return 0 if report['complete'] else 1
    except Exception as exc:
        print('Receipt migration failed (' + type(exc).__name__ + '). No DB/source mutation or automatic cleanup; inspect configuration/inventory securely and rerun after review.')
        return 1
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == '__main__':
    raise SystemExit(main())

"""Append-only private evidence files; no payment state or database writes."""
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.parse import urlsplit
from urllib.request import build_opener, HTTPRedirectHandler, Request

MAX_BYTES = 10 * 1024 * 1024
PREFIX = 'foodnova-private-receipt:'
HEX = re.compile(r'^[a-f0-9]{64}$')


class EvidenceError(Exception):
    """Messages are non-sensitive reason codes, never URLs or driver errors."""


def root():
    value = os.getenv('RETAINED_RECEIPT_STORAGE_DIR', '')
    path = Path(value)
    if not value or not path.is_absolute() or os.getenv('RETAINED_INVOICE_STORAGE_DURABLE', '').lower() != 'true':
        raise EvidenceError('private_storage_not_configured')
    public = [Path(__file__).resolve().parents[1] / 'uploads']
    if os.getenv('UPLOAD_DIR'):
        public.append(Path(os.environ['UPLOAD_DIR']).resolve())
    if any(path.resolve().is_relative_to(p.resolve()) for p in public):
        raise EvidenceError('private_storage_inside_public_uploads')
    return path


def source_id(source):
    if not isinstance(source, str):
        raise EvidenceError('invalid_source')
    if source.startswith(PREFIX):
        key = source[len(PREFIX):]
        if not HEX.fullmatch(key):
            raise EvidenceError('invalid_private_reference')
        return key
    return hashlib.sha256(source.encode('utf-8')).hexdigest()


def original_url(source):
    if not isinstance(source, str) or any(ord(character) <= 32 for character in source):
        raise EvidenceError('invalid_source')
    cloud = os.getenv('RETAINED_RECEIPT_CLOUD_NAME', '')
    if not re.fullmatch(r'[A-Za-z0-9_-]+', cloud):
        raise EvidenceError('cloud_account_not_pinned')
    parsed = urlsplit(source)
    if (parsed.scheme != 'https' or parsed.netloc != 'res.cloudinary.com' or parsed.query or parsed.fragment
            or not re.fullmatch('/' + re.escape(cloud) + r'/image/upload/v[0-9]+/[A-Za-z0-9_./-]+', parsed.path)
            or any(part in {'.', '..', ''} for part in parsed.path.split('/')[1:])):
        raise EvidenceError('not_pinned_versioned_original')
    return source


def media_type(data):
    if not data or len(data) > MAX_BYTES:
        raise EvidenceError('invalid_evidence_size')
    if data.startswith(b'%PDF-'):
        return 'application/pdf'
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if data.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if len(data) >= 12 and data.startswith(b'RIFF') and data[8:12] == b'WEBP':
        return 'image/webp'
    raise EvidenceError('unsupported_evidence_bytes')


def read_receipt(value):
    if not value:
        return ''
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            if value.startswith(('https://', PREFIX)):
                return value
            raise EvidenceError('invalid_receipt_metadata')
    if isinstance(value, dict):
        source = value.get('url') or value.get('receipt_url') or value.get('data_url')
        if isinstance(source, str) and source:
            return source
    raise EvidenceError('missing_receipt_reference')


@contextmanager
def locked():
    folder = root()
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(folder, 0o700)
    handle = open(folder / '.evidence.lock', 'a+b')
    try:
        if os.name == 'nt':
            import msvcrt
            if handle.tell() == 0:
                handle.write(b'0'); handle.flush()
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield folder
    finally:
        handle.close()  # OS releases the lock even on process failure.


def publish(folder, name, data):
    target = folder / name
    if target.is_symlink():
        raise EvidenceError('unsafe_private_file')
    if target.exists():
        if target.read_bytes() != data:
            raise EvidenceError('immutable_evidence_conflict')
        return
    fd, temporary = tempfile.mkstemp(prefix='.copy-', dir=folder)
    try:
        with os.fdopen(fd, 'wb') as handle:
            handle.write(data); handle.flush(); os.fsync(handle.fileno())
        os.link(temporary, target)  # Atomic, no overwrite; both files are on the private disk.
        if target.read_bytes() != data:
            raise EvidenceError('copy_checksum_mismatch')
        if os.name != 'nt':
            descriptor = os.open(folder, os.O_RDONLY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
    finally:
        Path(temporary).unlink(missing_ok=True)


def verified(source):
    folder, key = root(), source_id(source)
    index = folder / (key + '.json')
    if index.is_symlink() or not index.is_file():
        raise EvidenceError('private_evidence_missing')
    try:
        record = json.loads(index.read_text(encoding='utf-8'))
        digest = record['sha256']
        if record['source_id'] != key or not HEX.fullmatch(digest):
            raise ValueError()
        path = folder / (digest + '.bin')
        if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_BYTES:
            raise ValueError()
        data = path.read_bytes()
        if len(data) != record['bytes'] or hashlib.sha256(data).hexdigest() != digest or media_type(data) != record['mime_type']:
            raise ValueError()
        return record, data
    except (ValueError, KeyError, TypeError, OSError):
        raise EvidenceError('private_evidence_corrupt') from None


def store(source, data):
    mime, key = media_type(data), source_id(source)
    record = {'version': 1, 'source_id': key, 'sha256': hashlib.sha256(data).hexdigest(),
              'bytes': len(data), 'mime_type': mime, 'copied_at': datetime.now(timezone.utc).isoformat()}
    with locked() as folder:
        if (folder / (key + '.json')).exists():
            old, old_bytes = verified(source)
            if old_bytes != data:
                raise EvidenceError('immutable_evidence_conflict')
            return old
        publish(folder, record['sha256'] + '.bin', data)
        publish(folder, key + '.json', json.dumps(record, sort_keys=True).encode())
    return verified(source)[0]


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise EvidenceError('source_redirect_refused')


def download(source):
    url = original_url(source)
    try:
        with build_opener(NoRedirect()).open(Request(url, headers={'Accept-Encoding': 'identity', 'Accept': '*/*'}), timeout=30) as response:
            if response.status != 200 or response.geturl() != url:
                raise EvidenceError('unexpected_source_response')
            data = response.read(MAX_BYTES + 1)
            length = response.headers.get('Content-Length')
            if length and int(length) != len(data):
                raise EvidenceError('incomplete_source_copy')
            media_type(data)
            return data
    except EvidenceError:
        raise
    except Exception:
        raise EvidenceError('source_download_failed') from None


def copy_original(source, fetch=None):
    try:
        return verified(source)[0], 'verified_existing'
    except EvidenceError as exc:
        if str(exc) != 'private_evidence_missing':
            raise
    if source.startswith(PREFIX):
        raise EvidenceError('private_evidence_missing')
    original_url(source)  # Validate even when a test/custom fetch adapter is supplied.
    return store(source, (fetch or download)(source)), 'copied'


def order_sources(core, db, order):
    sources = []
    if order.receipt:
        sources.append(read_receipt(order.receipt))
    for log in db.query(core.DBPaymentApprovalLog).filter(core.DBPaymentApprovalLog.order_id == order.id).all():
        if log.receipt_url:
            sources.append(log.receipt_url)
    return list(dict.fromkeys(sources))

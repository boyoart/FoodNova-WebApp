"""Hashed, revocable guest capabilities and shared database-backed abuse limits."""
import hashlib
import hmac
import ipaddress
import os
import secrets
from datetime import datetime, timedelta
from urllib.parse import urlparse

from sqlalchemy import Boolean, Column, DateTime, Integer, MetaData, String, Table, delete, inspect, select, update
from sqlalchemy.exc import IntegrityError

metadata = MetaData()
tokens = Table('order_tracking_tokens', metadata,
               Column('token_hash', String(64), primary_key=True), Column('order_id', Integer, nullable=False, index=True),
               Column('expires_at', DateTime, nullable=False), Column('revoked', Boolean, nullable=False, default=False),
               Column('created_at', DateTime, nullable=False))
limits = Table('order_tracking_limits', metadata,
               Column('key_hash', String(64), primary_key=True), Column('count', Integer, nullable=False),
               Column('expires_at', DateTime, nullable=False))
NEUTRAL = 'If these details match an order, a secure tracking link will be sent to the email used for that order. You can also sign in to My Orders.'


def request_identity(request):
    peer = request.client.host if request.client else 'unknown'
    try:
        address = ipaddress.ip_address(peer)
        trusted = [ipaddress.ip_network(value.strip()) for value in os.getenv('ORDER_TRACKING_TRUSTED_PROXIES', '').split(',') if value.strip()]
        if any(address in network for network in trusted):
            # Use the nearest client's entry appended by the explicitly trusted proxy.
            forwarded = request.headers.get('x-forwarded-for', '').split(',')[-1].strip()
            return str(ipaddress.ip_address(forwarded)) if forwarded else peer
    except ValueError:
        pass
    return peer


def enabled(db):
    return os.getenv('ORDER_TRACKING_LINKS_ENABLED', '').lower() == 'true' and all(inspect(db.get_bind()).has_table(name) for name in [tokens.name, limits.name])


def digest(raw):
    return hashlib.sha256(raw.encode()).hexdigest()


def same_email(left, right):
    return hmac.compare_digest(str(left or '').strip().lower().encode('utf-8'), str(right or '').strip().lower().encode('utf-8'))


def issue(db, order_id, days=30):
    raw = secrets.token_urlsafe(32)
    now = datetime.utcnow()
    db.execute(tokens.insert().values(token_hash=digest(raw), order_id=order_id, expires_at=now + timedelta(days=days), revoked=False, created_at=now))
    db.commit()
    return raw


def resolve(db, raw):
    if not isinstance(raw, str) or len(raw) != 43:
        return None
    row = db.execute(select(tokens).where(tokens.c.token_hash == digest(raw), tokens.c.revoked.is_(False), tokens.c.expires_at > datetime.utcnow())).mappings().first()
    return row['order_id'] if row else None


def limited(db, identity, secret, maximum=5, seconds=900, table=None):
    rate_table = limits if table is None else table
    now = datetime.utcnow()
    window = int(now.timestamp()) // seconds
    key = hmac.new(secret.encode(), f'{identity}:{window}'.encode(), hashlib.sha256).hexdigest()
    db.execute(delete(rate_table).where(rate_table.c.expires_at < now))
    result = db.execute(update(rate_table).where(rate_table.c.key_hash == key).values(count=rate_table.c.count + 1))
    if not result.rowcount:
        try:
            with db.begin_nested():
                db.execute(rate_table.insert().values(key_hash=key, count=1, expires_at=now + timedelta(seconds=seconds * 2)))
        except IntegrityError:
            db.execute(update(rate_table).where(rate_table.c.key_hash == key).values(count=rate_table.c.count + 1))
    db.commit()
    return db.execute(select(rate_table.c.count).where(rate_table.c.key_hash == key)).scalar_one() > maximum


def approved_frontend_origin(frontend):
    origin = urlparse(frontend)
    allowed = {'https://foodnova.com.ng', 'https://www.foodnova.com.ng'}
    allowed.update(value.strip().rstrip('/') for value in os.getenv('CUSTOMER_LINK_ALLOWED_ORIGINS', '').split(',') if value.strip())
    candidate = f'{origin.scheme}://{origin.netloc}'
    if origin.scheme != 'https' or origin.username or origin.password or origin.path not in {'', '/'} or origin.query or origin.fragment or candidate not in allowed:
        return None
    return candidate


def link(raw, frontend):
    origin = approved_frontend_origin(frontend)
    if not origin:
        return None
    # Fragments never reach HTTP access logs or third-party Referer headers.
    return f'{origin}/track-order#track={raw}'


def confirmation_link(order_id, frontend):
    from database import SessionLocal
    db = SessionLocal()
    try:
        if not enabled(db) or not link('validation', frontend):
            return None
        return link(issue(db, order_id), frontend)
    except Exception:
        # Never log an exception containing a capability or email payload.
        return None
    finally:
        db.close()


def limited_progress(order):
    # Explicit whitelist: no totals, items, payment data, rider, PIN or PII.
    status = str(order.order_status or order.fulfillment_status or order.status or 'order_placed').lower()
    if order.delivery_method == 'pickup' and any(str(value or '').lower() in {'picked_up', 'picked_up_by_customer'} for value in [order.order_status, order.fulfillment_status, order.status]):
        status = 'picked_up_by_customer'
    known = {'order_placed', 'preparing', 'processing', 'ready_for_pickup', 'picked_up', 'picked_up_by_customer', 'out_for_delivery', 'delivered', 'cancelled'}
    return {'order_status': status if status in known else 'order_placed',
            'delivery_method': 'pickup' if order.delivery_method == 'pickup' else 'delivery'}

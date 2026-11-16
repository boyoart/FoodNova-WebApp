"""Consent-gated, at-most-once server purchase reporting; never changes an order."""
import json
import math
import os
import re
import urllib.parse
import urllib.request
from datetime import date, datetime

from sqlalchemy import Column, DateTime, Integer, MetaData, String, Table, inspect
from sqlalchemy.exc import IntegrityError

# Separate metadata: requires an explicit migration, never mutates production at startup.
metadata = MetaData()
deliveries = Table('website_analytics_purchases', metadata,
                   Column('order_id', Integer, primary_key=True),
                   Column('state', String(24), nullable=False),
                   Column('created_at', DateTime, nullable=False))


def eligible(order, confirmed):
    try:
        launch = date.fromisoformat(os.getenv('GA4_PURCHASE_START_DATE', ''))
        amount = float(order.total_amount)
        return bool(order.created_at and order.created_at.date() >= launch
                    and order.order_source == 'customer_web'
                    and str(order.payment_status or '').lower() in confirmed
                    and not any(str(value or '').lower() in {'cancelled', 'canceled'} for value in [order.order_status, order.fulfillment_status, order.status])
                    and str(order.refund_status or 'none').lower() in {'', 'none', 'not_requested'}
                    and not order.is_deleted and math.isfinite(amount) and amount >= 0)
    except (ValueError, TypeError):
        return False


def send_purchase(payload):
    query = urllib.parse.urlencode({'measurement_id': os.environ['GA4_MEASUREMENT_ID'], 'api_secret': os.environ['GA4_API_SECRET']})
    request = urllib.request.Request('https://www.google-analytics.com/mp/collect?' + query,
                                     data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=8) as response:
        if response.status != 204:
            raise ValueError('GA4 did not accept request')


def report_purchase(db, order, client_id, session_id, confirmed):
    if not re.fullmatch(r'G-[A-Z0-9]+', os.getenv('GA4_MEASUREMENT_ID', '')) or not os.getenv('GA4_API_SECRET') or not os.getenv('GA4_PURCHASE_START_DATE'):
        return {'status': 'not_configured'}
    if not eligible(order, confirmed):
        return {'status': 'not_eligible'}
    if not inspect(db.get_bind()).has_table(deliveries.name):
        return {'status': 'migration_required'}
    # Commit the unique claim BEFORE the network call. A timeout/crash is ambiguous,
    # so it is not retried automatically. This favours undercounting over duplicates.
    try:
        db.execute(deliveries.insert().values(order_id=order.id, state='claimed', created_at=datetime.utcnow()))
        db.commit()
    except IntegrityError:
        db.rollback()
        return {'status': 'already_claimed'}
    params = {'transaction_id': f'foodnova-{order.id}', 'currency': 'NGN',
              'value': float(order.total_amount), 'session_id': int(session_id), 'engagement_time_msec': 1}
    items = []
    for item in order.items:
        item_id = item.pack_id if item.item_type == 'pack' else item.product_id
        if item_id and item.quantity and item.quantity > 0:
            items.append({'item_id': f'{"pack" if item.item_type == "pack" else "product"}-{item_id}',
                          'quantity': item.quantity, 'price': float(item.unit_price or 0)})
    if items:
        params['items'] = items[:200]
    payload = {'client_id': client_id,
               'consent': {'ad_user_data': 'DENIED', 'ad_personalization': 'DENIED'},
               'events': [{'name': 'purchase', 'params': params}]}
    state = 'submitted'
    try:
        send_purchase(payload)
    except Exception:
        state = 'uncertain'
    db.execute(deliveries.update().where(deliveries.c.order_id == order.id).values(state=state))
    db.commit()
    return {'status': state}

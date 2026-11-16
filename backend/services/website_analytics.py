"""GA4 aggregate reporting. No credentials, visitor identities or IPs in responses."""
import json
import os
import re
import time
import threading
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException

_cache = {}
_lock = threading.Lock()
REPORTS = {
    'totals': ([], ['sessions', 'activeUsers', 'totalUsers', 'screenPageViews', 'ecommercePurchases']),
    'trend': (['date'], ['sessions', 'activeUsers', 'screenPageViews']),
    'locations': (['country', 'city'], ['activeUsers']),
    'channels': (['sessionDefaultChannelGroup'], ['sessions']),
    'sources': (['sessionSourceMedium'], ['sessions']),
    'pages': (['pagePath'], ['screenPageViews']),
    'devices': (['deviceCategory'], ['sessions']),
    'products': (['itemId'], ['itemsViewed', 'itemsAddedToCart', 'itemsPurchased']),
    'funnel': (['eventName'], ['eventCount']),
    'purchase_sessions': ([], ['sessionKeyEventRate:purchase']),
}


def report_range(preset='30', start=None, end=None):
    try:
        reporting_zone = ZoneInfo(os.getenv('GA4_REPORT_TIMEZONE', 'Africa/Lagos'))
    except KeyError:
        raise HTTPException(503, 'Analytics reporting timezone is unavailable. Check GA4_REPORT_TIMEZONE and installed timezone data.')
    try:
        today = datetime.now(reporting_zone).date()
        if preset == 'custom':
            first, last = date.fromisoformat(start or ''), date.fromisoformat(end or '')
        elif preset in {'today', '7', '30', '90'}:
            first, last = today - timedelta(days=(1 if preset == 'today' else int(preset)) - 1), today
        else:
            raise ValueError()
        if first > last or last > today or (last - first).days > 365:
            raise ValueError()
        return first.isoformat(), last.isoformat()
    except (ValueError, KeyError):
        raise HTTPException(400, 'Choose valid dates, up to 366 days, ending no later than today.')


def configured():
    return bool(re.fullmatch(r'\d+', os.getenv('GA4_PROPERTY_ID', '')) and os.getenv('GA4_SERVICE_ACCOUNT_JSON'))


def access_token():
    from google.oauth2.service_account import Credentials
    from google.auth.transport.requests import Request
    credentials = Credentials.from_service_account_info(
        json.loads(os.environ['GA4_SERVICE_ACCOUNT_JSON']),
        scopes=['https://www.googleapis.com/auth/analytics.readonly'])
    transport = Request()
    credentials.refresh(lambda *args, **kwargs: transport(*args, **{**kwargs, 'timeout': 12}))
    return credentials.token


def run_report(body, token):
    request = urllib.request.Request(
        f"https://analyticsdata.googleapis.com/v1beta/properties/{os.environ['GA4_PROPERTY_ID']}:runReport",
        data=json.dumps(body).encode(), headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=12) as response:
        return json.load(response)


def _one(name, first, last, token):
    dimensions, metrics = REPORTS[name]
    body = {'dateRanges': [{'startDate': first, 'endDate': last}],
            'dimensions': [{'name': value} for value in dimensions],
            'metrics': [{'name': value} for value in metrics],
            'limit': 366 if name == 'trend' else 20, 'currencyCode': 'NGN'}
    if dimensions:
        body['orderBys'] = [{'dimension': {'dimensionName': 'date'}}] if name == 'trend' else [{'metric': {'metricName': metrics[0]}, 'desc': True}]
    if name == 'funnel':
        events = ['page_view', 'view_item', 'search', 'add_to_cart', 'begin_checkout', 'purchase']
        body['dimensionFilter'] = {'filter': {'fieldName': 'eventName', 'inListFilter': {'values': events}}}
    try:
        raw = run_report(body, token)
        rows = []
        for row in raw.get('rows', []):
            values = {key: row['dimensionValues'][i]['value'] for i, key in enumerate(dimensions)}
            # Page paths are restricted to our public, non-identifying routes even for legacy properties.
            if 'pagePath' in values and values['pagePath'] not in {'/', '/products', '/cart', '/checkout', '/app', '/contact', '/privacy', '/terms'}:
                values['pagePath'] = '/other'
            if 'itemId' in values and not re.fullmatch(r'(?:product|pack)-\d+', values['itemId']):
                values['itemId'] = '(unrecognized item)'
            if 'sessionSourceMedium' in values and any(marker in values['sessionSourceMedium'] for marker in ['@', '?', '#']):
                values['sessionSourceMedium'] = '(redacted source)'
            values.update({key: float(row['metricValues'][i]['value']) for i, key in enumerate(metrics)})
            rows.append(values)
        metadata = raw.get('metadata', {})
        return {'status': 'available', 'rows': rows, 'row_count': raw.get('rowCount', 0),
                'truncated': raw.get('rowCount', 0) > len(rows),
                'sampled': bool(metadata.get('samplingMetadatas')),
                'thresholded': bool(metadata.get('subjectToThresholding')),
                'data_loss': bool(metadata.get('dataLossFromOtherRow')),
                'timezone': metadata.get('timeZone'), 'currency': metadata.get('currencyCode')}
    except Exception:
        return {'status': 'unavailable', 'rows': [], 'message': 'GA4 could not provide this report. Check API access, property metrics and quota.'}


def reporting(first, last, names=None):
    names = tuple(names or REPORTS)
    result = {'provider': 'GA4', 'range': {'start': first, 'end': last}, 'status': 'not_configured', 'reports': {},
              'notice': 'Consent-based GA4 estimates may be delayed 24–48 hours and exclude declined/blocked tracking. This is not the financial ledger.'}
    if not configured():
        result['message'] = 'Configure GA4_PROPERTY_ID and server-side GA4_SERVICE_ACCOUNT_JSON with property Viewer access.'
        return result
    key = (os.environ['GA4_PROPERTY_ID'], first, last, names)
    with _lock:
        cached = _cache.get(key)
        if cached and time.monotonic() - cached[0] < 300:
            return {**cached[1], 'cached': True}
        try:
            token = access_token()
            with ThreadPoolExecutor(max_workers=4) as pool:
                reports = dict(zip(names, pool.map(lambda name: _one(name, first, last, token), names)))
            available = sum(report['status'] == 'available' for report in reports.values())
            result.update(status='available' if available == len(names) else 'partial' if available else 'unavailable', reports=reports,
                          generated_at=datetime.now(ZoneInfo('UTC')).isoformat(), cached=False)
        except Exception:
            result.update(status='unavailable', message='GA4 reporting is unavailable. Check server credentials, API enablement and property access.')
        if len(_cache) >= 32:
            _cache.pop(next(iter(_cache)))
        _cache[key] = (time.monotonic(), result)
    return result


def total(result, name, report='totals'):
    data = result.get('reports', {}).get(report, {})
    if data.get('status') != 'available':
        return None
    return data['rows'][0].get(name) if data['rows'] else 0


def summary():
    today = reporting(*report_range('today'), names=['totals'])
    week = reporting(*report_range('7'), names=['totals', 'sources', 'purchase_sessions'])
    sessions = total(week, 'sessions')
    purchase_rate = conversion_rate(week)
    sources = week.get('reports', {}).get('sources', {})
    return {'provider': 'GA4', 'status': week['status'], 'notice': week['notice'],
            'sessions_today': total(today, 'sessions'), 'visitors_today': total(today, 'activeUsers'),
            'sessions_week': sessions,
            'top_source': sources['rows'][0]['sessionSourceMedium'] if sources.get('status') == 'available' and sources['rows'] else None,
            'conversion_rate': purchase_rate,
            'conversion_period': week['range']}


def conversion_rate(result):
    fraction = total(result, 'sessionKeyEventRate:purchase', 'purchase_sessions')
    return fraction * 100 if fraction is not None and 0 <= fraction <= 1 else None

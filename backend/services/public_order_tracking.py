"""Non-identifying progress derived only from recorded fulfilment events."""
import ipaddress
import os
import re


class ProxyIdentityUnavailable(ValueError):
    """Unsafe configuration or an unverifiable trusted forwarding chain."""


def _ip_address(value):
    address = ipaddress.ip_address(value)
    if getattr(address, 'scope_id', None):
        raise ValueError('Scoped addresses are not HTTP client identities.')
    return getattr(address, 'ipv4_mapped', None) or address


def request_identity(request):
    """Canonical client, trusting only the explicitly configured right-hand hops.

    If Uvicorn already validated/replaced the client, leave its untrusted client
    address alone. An unsafe upstream rewrite cannot be repaired here.
    """
    try:
        trusted = [ipaddress.ip_network(value.strip()) for value in
                   os.getenv('ORDER_TRACKING_TRUSTED_PROXIES', '').split(',') if value.strip()]
        if any(network.prefixlen == 0 for network in trusted):
            raise ValueError('Universal proxy trust is not permitted.')
    except ValueError:
        raise ProxyIdentityUnavailable('Proxy identity is unavailable.') from None
    try:
        peer = _ip_address(request.client.host if request.client else '')
    except ValueError:
        # Non-IP ASGI peers share a conservative budget; headers cannot invent one.
        return 'unknown'
    if not any(peer in network for network in trusted):
        return str(peer)
    forwarded = ','.join(request.headers.getlist('x-forwarded-for'))
    if not forwarded or len(forwarded) > 4096:
        raise ProxyIdentityUnavailable('Proxy identity is unavailable.')
    hops = forwarded.split(',')
    if len(hops) > 32:
        raise ProxyIdentityUnavailable('Proxy identity is unavailable.')
    for value in reversed(hops):
        try:
            address = _ip_address(value.strip())
        except ValueError:
            raise ProxyIdentityUnavailable('Proxy identity is unavailable.') from None
        if not any(address in network for network in trusted):
            return str(address)
    # No proven client boundary: never pick a caller-controlled leftmost value.
    raise ProxyIdentityUnavailable('Proxy identity is unavailable.')


def normalize_number(value):
    if not isinstance(value, str):
        raise ValueError('Enter a valid FoodNova order number.')
    value = value.strip().upper()
    if re.fullmatch(r'\d{3,10}', value):
        value = 'FN-' + value
    if not re.fullmatch(r'FN-[A-Z0-9]{3,20}', value):
        raise ValueError('Enter a valid FoodNova order number.')
    return value


def network_identity(identity):
    try:
        address = _ip_address(identity)
        return str(ipaddress.ip_network(f'{address}/{24 if address.version == 4 else 64}', strict=False))
    except ValueError:
        return 'unknown'


def progress(row):
    fields = {str(getattr(row, key, '') or '').strip().lower() for key in ('order_status', 'fulfillment_status', 'status')}
    delivery = str(row.delivery_status or '').strip().lower()
    pickup = str(row.delivery_method or '').strip().lower() == 'pickup'
    recorded = next((str(getattr(row, key) or '').strip().lower() for key in ('order_status', 'fulfillment_status', 'status') if getattr(row, key, None)), '')
    # delivery_completed_at can also be set by legacy Admin status updates.
    # PIN-confirmation workflows stamp delivery_confirmed_at; do not overstate legacy completion.
    completed = bool(row.delivery_confirmed_at)
    if fields.intersection({'cancelled', 'canceled'}) or delivery in {'cancelled', 'canceled'}:
        status, label = 'cancelled', 'Cancelled'
    elif fields.intersection({'failed_delivery', 'delivery_failed', 'returned', 'returned_to_sender'}) or delivery in {'failed', 'failed_delivery', 'returned', 'returned_to_sender'}:
        status, label = 'delivery_update', 'Delivery update - contact support'
    elif pickup and fields.intersection({'picked_up', 'picked_up_by_customer'}) and completed:
        status, label = 'picked_up_by_customer', 'Picked up'
    elif not pickup and ('delivered' in fields or delivery == 'delivered') and completed:
        status, label = 'delivered', 'Delivered'
    elif ('delivered' in fields or fields.intersection({'picked_up_by_customer'}) or delivery == 'delivered'):
        status, label = 'delivery_update', 'Completion update pending'
    elif not pickup and (fields.intersection({'out_for_delivery', 'picked_up'}) or delivery in {'picked_up', 'pickedup', 'in_transit', 'en_route_to_customer', 'out_for_delivery', 'arrived', 'arrived_at_customer'}):
        status, label = 'out_for_delivery', 'Out for delivery'
    elif fields.intersection({'ready', 'packed', 'ready_for_pickup', 'ready_for_dispatch'}):
        status, label = ('ready_for_pickup', 'Ready for pickup') if pickup else ('ready_for_dispatch', 'Ready for dispatch')
    elif fields.intersection({'accepted', 'confirmed', 'preparing', 'processing'}):
        status, label = 'preparing', 'Preparing your order'
    elif recorded in {'pending', 'pending_payment', 'receipt_submitted', 'payment_confirmed', 'order_placed', ''}:
        status, label = 'order_placed', 'Order received'
    else:
        status, label = 'delivery_update', 'Order update - contact support'
    stages = [('order_placed', 'Order received'), ('preparing', 'Preparing your order')]
    stages += [('ready_for_pickup', 'Ready for pickup'), ('picked_up_by_customer', 'Picked up')] if pickup else [('ready_for_dispatch', 'Ready for dispatch'), ('out_for_delivery', 'Out for delivery'), ('delivered', 'Delivered')]
    if status in {'cancelled', 'delivery_update'}:
        timeline = [{'step': 'order_placed', 'label': 'Order received', 'state': 'completed'}, {'step': status, 'label': label, 'state': 'current'}]
    else:
        current = next(i for i, (key, _) in enumerate(stages) if key == status)
        timeline = [{'step': key, 'label': text, 'state': 'completed' if i < current else 'current' if i == current else 'pending'} for i, (key, text) in enumerate(stages)]
    return {'order_number': row.order_code, 'status': status, 'status_label': label, 'delivery_stage': label, 'timeline': timeline}

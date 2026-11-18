"""Shared, conservative closure policy and transaction-local Admin Activity entries."""
import json
import re
import os
from pathlib import Path
from datetime import datetime
from fastapi import HTTPException
from sqlalchemy import text


def require_guards(db):
    if db.get_bind().dialect.name == 'postgresql':
        if os.getenv('RETAINED_INVOICE_STORAGE_DURABLE', '').lower() != 'true' or not Path(os.getenv('RETAINED_INVOICE_STORAGE_DIR', '')).is_absolute():
            raise HTTPException(503, 'Durable private invoice storage must be approved and configured before destructive actions.')
        names = set(db.execute(text("""SELECT t.tgname FROM pg_trigger t
            JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
            JOIN pg_proc f ON f.oid=t.tgfoid
            WHERE NOT t.tgisinternal AND t.tgenabled='O' AND n.nspname='public' AND
            ((t.tgname='foodnova_retained_order_guard' AND c.relname='orders' AND f.proname='foodnova_guard_retained_order') OR
             (t.tgname='foodnova_customer_order_guard' AND c.relname='orders' AND f.proname='foodnova_guard_customer_order') OR
             (t.tgname='foodnova_refund_guard' AND c.relname='cancellation_requests' AND f.proname='foodnova_guard_retained_child') OR
             (t.tgname='foodnova_payment_guard' AND c.relname='payment_approval_logs' AND f.proname='foodnova_guard_retained_child') OR
             (t.tgname='foodnova_offer_guard' AND c.relname='delivery_offers' AND f.proname='foodnova_guard_retained_child') OR
             (t.tgname='foodnova_item_guard' AND c.relname='order_items' AND f.proname='foodnova_guard_retained_child'))""")).scalars())
        if len(names) != 6:
            raise HTTPException(503, 'Retention database guards must be installed and verified before destructive actions.')


def transaction_limits(db):
    if db.get_bind().dialect.name == 'postgresql':
        db.execute(text("SET LOCAL lock_timeout = '5s'"))
        db.execute(text("SET LOCAL statement_timeout = '60s'"))


def preserve_invoice(core, order):
    data = core.order_to_dict(order)
    if not core.invoice_file_path(data).exists():
        core.ensure_order_invoice_pdf(data)


def normalized(value):
    return str(value or '').strip().lower()


def safe_reason(reason):
    reason = str(reason or '').strip()
    if not 8 <= len(reason) <= 500:
        raise HTTPException(422, 'Provide a reason of 8–500 characters. Do not include personal information.')
    reason = re.sub(r'[\w.+-]+@[\w.-]+\.[\w-]+', '[email removed]', reason)
    return re.sub(r'\+?\d[\d ()-]{7,}\d', '[number removed]', reason)


def blockers(order, core=None, db=None):
    states = {normalized(getattr(order, key, '')) for key in ('order_status', 'fulfillment_status', 'status')}
    dispatch = normalized(getattr(order, 'delivery_status', ''))
    pickup = normalized(getattr(order, 'delivery_method', '')) == 'pickup'
    cancelled = bool(states & {'cancelled', 'canceled'}) or normalized(getattr(order, 'cancellation_status', '')) == 'approved'
    completed = bool(states & {'delivered', 'completed', 'closed', 'picked_up_by_customer'}) or (pickup and 'picked_up' in states)
    reasons = []
    if getattr(order, 'retention_hold', False):
        reasons.append('retention_hold: Super Admin must resolve the financial/legal hold')
    if dispatch in {'assigned', 'accepted', 'arrived_at_pickup', 'at_pickup', 'picked_up', 'pickedup', 'in_transit', 'en_route_to_customer', 'arrived', 'arrived_at_customer', 'out_for_delivery'} or states & {'out_for_delivery', 'in_transit'}:
        reasons.append('active_fulfilment: complete or cancel the delivery/assignment')
    if not cancelled and not completed:
        reasons.append('active_order: complete or cancel the order')
    refund = normalized(getattr(order, 'refund_status', ''))
    payment = normalized(getattr(order, 'payment_status', ''))
    if refund not in {'', 'none', 'processed', 'rejected'}:
        reasons.append('refund_' + refund + ': resolve and record actual refund settlement')
    if normalized(getattr(order, 'cancellation_status', '')) == 'pending':
        reasons.append('pending_cancellation: review the cancellation request')
    paid = payment in {'payment_confirmed', 'confirmed', 'paid'}
    current_paid = paid
    unpaid = payment in {'', 'pending_payment', 'pending', 'unpaid', 'payment_rejected', 'failed', 'cancelled', 'canceled'}
    if payment not in {'payment_confirmed', 'confirmed', 'paid', 'refunded'} and not unpaid:
        reasons.append('payment_' + payment + ': resolve payment review/dispute or unknown payment state')
    if core is not None and db is not None:
        logs = db.query(core.DBPaymentApprovalLog).filter(core.DBPaymentApprovalLog.order_id == order.id).all()
        if (db.get_bind().dialect.name == 'postgresql' and
                (getattr(order, 'receipt', None) or any(log.receipt_url for log in logs)) and
                os.getenv('RETAINED_PAYMENT_EVIDENCE_PROTECTED', '').lower() != 'true'):
            reasons.append('payment_evidence_protection: approve private durable retention of original receipts before erasure/removal')
        paid = paid or any(normalized(log.new_payment_status) in {'payment_confirmed', 'confirmed', 'paid'} for log in logs)
        requests = db.query(core.DBCancellationRequest).filter(core.DBCancellationRequest.order_id == order.id).all()
        offers = db.query(core.DBDeliveryOffer).filter(core.DBDeliveryOffer.order_id == order.id).all()
        if any(normalized(offer.assignment_status) not in {'completed', 'delivered', 'cancelled', 'canceled', 'closed', 'expired', 'declined', 'rejected'}
               and (normalized(offer.status) in {'accepted', 'assigned'} or normalized(offer.assignment_status) in {'accepted', 'assigned'}) for offer in offers):
            reasons.append('active_delivery_offer: close the assigned/accepted delivery offer')
        for request in requests:
            if normalized(request.status) == 'pending' or (normalized(request.request_type) == 'refund' and normalized(request.status) == 'approved' and refund != 'processed'):
                reasons.append(f'request_{request.id}: resolve {normalized(request.request_type)} request ({normalized(request.status)})')
    amount = float(getattr(order, 'total_amount', 0) or 0)
    if cancelled and paid and amount > 0 and refund != 'processed':
        reasons.append('unsettled_paid_cancellation: record the processed refund; cancellation alone is insufficient')
    if completed and not cancelled and amount > 0 and not current_paid and payment != 'refunded':
        reasons.append('unsettled_collection: reconcile payment for the completed order')
    if payment == 'refunded' and refund != 'processed':
        reasons.append('refund_evidence: record processed refund status')
    return list(dict.fromkeys(reasons))


def activity(core, db, admin, action, entity, record_id, reason, outcome='success', summary=None):
    db.add(core.DBAdminAuditLog(admin_id=admin.get('id'), admin_name=admin.get('full_name', 'Admin'),
        admin_email=admin.get('email', ''), action=action, entity_type=entity, entity_id=str(record_id),
        description=reason, created_at=datetime.utcnow(), metadata_json=json.dumps({
            'actor_role': core.normalize_admin_role(admin.get('admin_role')), 'outcome': outcome,
            'summary': summary or {}, 'record_id': record_id})))


def reject_blocked(core, db, admin, action, entity, record_id, reason, blocking):
    activity(core, db, admin, action, entity, record_id, reason, 'blocked', {'blockers': blocking})
    db.commit()  # No business changes have been made. Keep the rejected attempt in the activity log.
    raise HTTPException(409, detail={'code': 'OUTSTANDING_OBLIGATIONS',
        'message': 'Resolve the listed order obligations before removal.', 'blocking_orders': blocking})

from datetime import datetime
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field
from services import retained_orders as retention
from services import receipt_evidence as evidence


class Removal(BaseModel):
    reason: str = Field(max_length=500)
    confirmation: str = Field(max_length=100)


def build_router(core):
    router = APIRouter()

    def super_admin(request):
        admin = core.require_admin(request)
        if core.normalize_admin_role(admin.get('admin_role')) != 'super_admin':
            raise HTTPException(403, 'Only Super Admins can manage retained orders.')
        return admin

    def receipt_response(order_id, request, audit_log_id, ledger=False):
        admin = super_admin(request) if ledger else core.require_any_permission(request, ['payments:view', 'payments:approve'])
        db = core.SessionLocal()
        try:
            retention.transaction_limits(db)
            order = db.query(core.DBOrder).filter(core.DBOrder.id == order_id).with_for_update().first()
            if not order:
                raise HTTPException(404, 'Receipt evidence not found', headers={'Cache-Control': 'no-store'})
            if (order.operational_removed_at or order.personal_data_erased_at) and core.normalize_admin_role(admin.get('admin_role')) != 'super_admin':
                raise HTTPException(403, 'Retained evidence requires Super Admin access.', headers={'Cache-Control': 'no-store'})
            log = None
            if audit_log_id is not None:
                log = db.query(core.DBPaymentApprovalLog).filter(core.DBPaymentApprovalLog.id == audit_log_id,
                    core.DBPaymentApprovalLog.order_id == order_id).first()
                if not log:
                    raise HTTPException(404, 'Receipt evidence not found', headers={'Cache-Control': 'no-store'})
            try:
                source = log.receipt_url if log else evidence.read_receipt(order.receipt)
                if not source:
                    raise evidence.EvidenceError('missing_receipt_reference')
                record, data = evidence.verified(source)
            except (evidence.EvidenceError, OSError):
                retention.activity(core, db, admin, 'payment_receipt_access', 'order', order_id,
                    'Authorized private receipt request', outcome='unavailable', summary={'payment_log_id': audit_log_id})
                db.commit()
                raise HTTPException(404, 'Verified private receipt is unavailable. Reconcile the evidence migration; no public fallback is permitted.', headers={'Cache-Control': 'no-store'})
            retention.activity(core, db, admin, 'payment_receipt_access', 'order', order_id,
                'Authorized private receipt request', outcome='authorized',
                summary={'source_id': record['source_id'], 'payment_log_id': audit_log_id})
            db.commit()
            extension = {'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp'}[record['mime_type']]
            return Response(content=data, media_type=record['mime_type'], headers={
                'Cache-Control': 'no-store, private', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff',
                'Content-Security-Policy': "sandbox; default-src 'none'", 'Referrer-Policy': 'no-referrer',
                'Content-Disposition': f'attachment; filename="receipt-{order_id}-{record["source_id"][:10]}.{extension}"'})
        finally:
            db.close()

    @router.get('/admin/orders/{order_id}/receipt-evidence')
    def active_receipt(order_id: int, request: Request, audit_log_id: int = None):
        return receipt_response(order_id, request, audit_log_id)

    @router.get('/admin/historical-orders/{order_id}/receipt')
    def retained_receipt(order_id: int, request: Request, audit_log_id: int = None):
        return receipt_response(order_id, request, audit_log_id, ledger=True)

    @router.get('/admin/historical-orders/{order_id}/receipts')
    def receipt_inventory(order_id: int, request: Request, response: Response):
        super_admin(request)
        response.headers['Cache-Control'] = 'no-store, private'
        db = core.SessionLocal()
        try:
            order = db.query(core.DBOrder).filter(core.DBOrder.id == order_id).first()
            if not order:
                raise HTTPException(404, 'Order not found')
            result = []
            try:
                sources = evidence.order_sources(core, db, order)
            except evidence.EvidenceError:
                raise HTTPException(409, 'Receipt references need reconciliation.')
            for source in sources:
                item = {'source_id': evidence.source_id(source), 'available': False}
                try:
                    record, _ = evidence.verified(source)
                    item.update({'available': True, 'sha256': record['sha256'], 'bytes': record['bytes'], 'mime_type': record['mime_type']})
                except (evidence.EvidenceError, OSError):
                    pass
                result.append(item)
            return {'order_id': order_id, 'evidence': result}
        finally:
            db.close()

    @router.post('/admin/orders/{order_id}/remove-permanently')
    def remove(order_id: int, payload: Removal, request: Request):
        admin = super_admin(request)
        reason = retention.safe_reason(payload.reason)
        if payload.confirmation != f'REMOVE ORDER {order_id}':
            raise HTTPException(422, f'Type REMOVE ORDER {order_id} exactly.')
        retention.require_deletion_enabled()
        db = core.SessionLocal()
        try:
            retention.transaction_limits(db)
            retention.require_guards(db)
            preliminary = db.query(core.DBOrder).filter(core.DBOrder.id == order_id).first()
            if preliminary and preliminary.customer_user_id:
                db.query(core.DBUser).filter(core.DBUser.id == preliminary.customer_user_id).with_for_update().first()
            order = db.query(core.DBOrder).filter(core.DBOrder.id == order_id).populate_existing().with_for_update().first()
            if not order or not order.is_deleted or order.operational_removed_at:
                raise HTTPException(409, 'Choose an archived order that has not already been removed.')
            reasons = retention.blockers(order, core, db)
            if reasons:
                retention.reject_blocked(core, db, admin, 'order_operationally_removed', 'order', order_id,
                    reason, [{'order_id': order.id, 'order_code': order.order_code, 'reasons': reasons}])
            retention.preserve_invoice(core, order)
            order.operational_removed_at = datetime.utcnow()
            retention.activity(core, db, admin, 'order_operationally_removed', 'order', order_id, reason,
                summary={'ledger_retained': True, 'physical_delete': False})
            db.commit()
            return {'success': True, 'message': 'Removed permanently from operations. Financial and invoice history retained.'}
        finally:
            db.close()

    @router.get('/admin/historical-orders')
    def ledger(request: Request, response: Response, page: int = 1):
        super_admin(request)
        if page < 1:
            raise HTTPException(422, 'Invalid page')
        response.headers['Cache-Control'] = 'no-store, private'
        db = core.SessionLocal()
        try:
            query = db.query(core.DBOrder).filter(core.DBOrder.operational_removed_at.isnot(None))
            return {'total': query.count(), 'page': page, 'orders': [
                {'id': o.id, 'order_code': o.order_code, 'total_amount': o.total_amount,
                 'payment_status': o.payment_status, 'refund_status': o.refund_status,
                 'removed_at': o.operational_removed_at.isoformat()}
                for o in query.order_by(core.DBOrder.id.desc()).offset((page - 1) * 50).limit(50).all()]}
        finally:
            db.close()

    @router.get('/admin/historical-orders/{order_id}/invoice')
    def invoice(order_id: int, request: Request):
        super_admin(request)
        db = core.SessionLocal()
        try:
            order = db.query(core.DBOrder).filter(core.DBOrder.id == order_id).first()
            if not order or not (order.operational_removed_at or order.personal_data_erased_at):
                raise HTTPException(404, 'Retained order not found')
            path = core.invoice_file_path(core.order_to_dict(order))
            if not path.exists():
                raise HTTPException(404, 'Original retained invoice is unavailable; do not regenerate it as historical evidence.')
            return core.StreamingResponse(core.io.BytesIO(path.read_bytes()), media_type='application/pdf',
                headers={'Cache-Control': 'no-store, private', 'Content-Disposition': f'inline; filename="invoice-{order_id}.pdf"'})
        finally:
            db.close()

    @router.get('/admin/historical-orders/{order_id}')
    def financial_details(order_id: int, request: Request, response: Response):
        super_admin(request)
        response.headers['Cache-Control'] = 'no-store, private'
        db = core.SessionLocal()
        try:
            order = db.query(core.DBOrder).filter(core.DBOrder.id == order_id).first()
            if not order or not (order.operational_removed_at or order.personal_data_erased_at):
                raise HTTPException(404, 'Retained order not found')
            return {'id': order.id, 'order_code': order.order_code, 'customer_internal_id': order.customer_user_id,
                'total_amount': order.total_amount, 'payment_reference': order.payment_reference,
                'payment_status': order.payment_status, 'refund_status': order.refund_status,
                'items': [core.order_item_to_dict(item) for item in order.items],
                'payment_audit': [core.payment_audit_log_to_dict(item) for item in db.query(core.DBPaymentApprovalLog).filter(core.DBPaymentApprovalLog.order_id == order_id).all()],
                'refund_requests': [{'id': item.id, 'request_type': item.request_type, 'status': item.status,
                    'reviewed_at': item.reviewed_at.isoformat() if item.reviewed_at else None}
                    for item in db.query(core.DBCancellationRequest).filter(core.DBCancellationRequest.order_id == order_id).all()]}
        finally:
            db.close()

    @router.post('/admin/orders/{order_id}/retention-hold')
    def hold(order_id: int, payload: Removal, request: Request, enabled: bool = True):
        admin = super_admin(request)
        reason = retention.safe_reason(payload.reason)
        expected = f'{"HOLD" if enabled else "RELEASE HOLD"} ORDER {order_id}'
        if payload.confirmation != expected:
            raise HTTPException(422, f'Type {expected} exactly.')
        db = core.SessionLocal()
        try:
            retention.transaction_limits(db)
            order = db.query(core.DBOrder).filter(core.DBOrder.id == order_id).with_for_update().first()
            if not order:
                raise HTTPException(404, 'Order not found')
            order.retention_hold = enabled
            order.retention_hold_reason = reason
            retention.activity(core, db, admin, 'order_retention_hold', 'order', order_id, reason, summary={'enabled': enabled})
            db.commit()
            return {'success': True, 'retention_hold': enabled}
        finally:
            db.close()

    return router

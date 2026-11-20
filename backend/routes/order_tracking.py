
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func
from services import order_tracking as tracking


class Lookup(BaseModel):
    order_code: str = Field(min_length=3, max_length=40, pattern=r'^[A-Za-z0-9-]+$')
    email: str = Field(default='', max_length=254)


class Capability(BaseModel):
    token: str = Field(min_length=43, max_length=43, pattern=r'^[A-Za-z0-9_-]+$')


def build_router(core):
    router = APIRouter(prefix='/tracking', tags=['tracking'])
    from routes.public_order_tracking import build_router as public_router
    router.include_router(public_router(core))

    def headers(response):
        response.headers['Cache-Control'] = 'no-store, private'
        response.headers['Referrer-Policy'] = 'no-referrer'

    def send_link(email, code, url):
        from email_service import send_tracking_link_email
        send_tracking_link_email(email, code, url)

    @router.post('/lookup')
    def lookup(payload: Lookup, request: Request, response: Response, tasks: BackgroundTasks):
        headers(response)
        user = core._get_user_from_token(request.headers.get('authorization'))
        db = core.SessionLocal()
        try:
            ready = tracking.enabled(db)
            # Guest abuse limits are shared across workers. No token/email/IP is logged.
            if ready and tracking.limited(db, 'lookup:' + tracking.request_identity(request), core.JWT_SECRET, maximum=120 if user and user.get('role') == 'customer' else 5):
                response.status_code = 202
                return {'status': 'verification_required', 'message': tracking.NEUTRAL}
            if not ready and not (user and user.get('role') == 'customer'):
                response.status_code = 202
                return {'status': 'verification_required', 'message': 'Secure guest tracking is not enabled yet. Sign in to My Orders for authorized tracking.'}
            order = core.active_order_filter(db.query(core.DBOrder)).filter(func.upper(core.DBOrder.order_code) == payload.order_code.upper()).first()
            owns = False
            if order and user and user.get('role') == 'customer':
                try:
                    core.require_order_access(request, order, db)
                    owns = True
                except HTTPException:
                    pass
            if owns and not core.customer_needs_verification(user):
                return {'status': 'authorized', 'order': core.order_to_dict_for_context(order, db, 'customer')}
            if not ready:
                response.status_code = 202
                return {'status': 'verification_required', 'message': 'Secure guest tracking is not enabled yet. Sign in to My Orders for authorized tracking.'}
            response.status_code = 202
            if ready and payload.email and order and order.customer_email and tracking.same_email(order.customer_email, payload.email):
                if not tracking.limited(db, 'mail:' + payload.email.strip().lower() + ':' + payload.order_code.upper(), core.JWT_SECRET, maximum=2, seconds=3600):
                    from email_service import FRONTEND_URL
                    url = tracking.link(tracking.issue(db, order.id), FRONTEND_URL)
                    if url:
                        tasks.add_task(send_link, order.customer_email, order.order_code, url)
            return {'status': 'verification_required', 'message': tracking.NEUTRAL}
        finally:
            db.close()

    @router.post('/progress')
    def progress(payload: Capability, request: Request, response: Response):
        headers(response)
        db = core.SessionLocal()
        try:
            if not tracking.enabled(db):
                raise HTTPException(404, 'This tracking link is unavailable or expired. Sign in to My Orders.', headers={'Cache-Control': 'no-store'})
            if tracking.limited(db, 'progress:' + tracking.request_identity(request), core.JWT_SECRET, maximum=120):
                raise HTTPException(429, 'Please wait before checking again.', headers={'Cache-Control': 'no-store', 'Retry-After': '900'})
            order_id = tracking.resolve(db, payload.token)
            order = core.active_order_filter(db.query(core.DBOrder)).filter(core.DBOrder.id == order_id).first() if order_id else None
            if not order:
                raise HTTPException(404, 'This tracking link is unavailable or expired. Sign in to My Orders.', headers={'Cache-Control': 'no-store'})
            return {'status': 'limited', 'progress': tracking.limited_progress(order)}
        finally:
            db.close()

    @router.post('/{order_id}/revoke-links')
    def revoke(order_id: int, request: Request, response: Response):
        headers(response)
        admin = core.require_permission(request, 'orders:update')
        db = core.SessionLocal()
        try:
            if not tracking.enabled(db):
                raise HTTPException(503, 'Secure tracking links are not enabled.')
            db.execute(tracking.tokens.update().where(tracking.tokens.c.order_id == order_id).values(revoked=True))
            db.commit()
            core.create_admin_audit_log(request, admin, 'tracking_links_revoked', 'order', order_id, 'Revoked guest tracking links', {})
            return {'status': 'revoked'}
        finally:
            db.close()
    return router

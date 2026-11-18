import json
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool
from models import User
from services import customer_security as security
from services.order_tracking import request_identity


class AccountAction(BaseModel):
    action: str
    reason: str = Field(max_length=500)
    confirmation: str = Field(max_length=100)


def build_router(core):
    router = APIRouter()

    @router.get('/auth/verification/status')
    def status(request: Request, response: Response):
        response.headers['Cache-Control'] = 'no-store, private'
        user = core.require_user(request)
        return {key: user.get(key) for key in ['email_verified', 'email_verified_at', 'email_verification_required', 'account_status']}

    @router.post('/auth/verification/resend')
    def resend(request: Request, response: Response):
        response.headers['Cache-Control'] = 'no-store, private'
        current = core.require_user(request)
        db = core.SessionLocal()
        try:
            user = db.query(User).filter(User.id == current['id']).with_for_update().first()
            security.check_customer(user)
            if user.email_verified_at:
                return {'success': True, 'message': 'Your email is already verified.'}
            if security.rate_limited(db, f'verify-user:{user.id}', core.JWT_SECRET) or security.rate_limited(db, 'verify-peer:' + request_identity(request), core.JWT_SECRET, maximum=10):
                raise HTTPException(429, 'Please wait before requesting another verification email.', headers={'Retry-After': '3600'})
            # Rate limit commits release locks; reacquire before token changes.
            db.refresh(user, with_for_update=True)
            security.check_customer(user)
            security.verification_email(db, user)
            return {'success': True, 'message': 'Verification requested. Check your inbox; contact support if delivery is unavailable.'}
        finally:
            db.close()

    @router.post('/auth/verification/confirm')
    async def confirm(request: Request, response: Response):
        response.headers['Cache-Control'] = 'no-store, private'
        try:
            body = await request.body()
            if len(body) > 2048:
                raise ValueError()
            payload = json.loads(body)
            if not isinstance(payload, dict):
                raise ValueError()
        except (ValueError, TypeError):
            raise HTTPException(400, 'This verification link is invalid or expired.')
        db = core.SessionLocal()
        try:
            if security.rate_limited(db, 'verify-confirm:' + request_identity(request), core.JWT_SECRET, maximum=30, seconds=900):
                raise HTTPException(429, 'Please wait before trying this link again.')
            return security.confirm_verification(db, payload.get('token'))
        finally:
            db.close()

    @router.post('/admin/customers/{customer_id}/account-status')
    async def action(customer_id: int, payload: AccountAction, request: Request):
        def perform():
            admin = core.require_admin(request)
            db = core.SessionLocal()
            try:
                return security.change_account(core, db, admin, customer_id, payload.action, payload.reason, payload.confirmation)
            finally:
                db.close()
        result = await run_in_threadpool(perform)
        if payload.action != 'reactivate':
            try:
                await core.disconnect_customer_sockets(customer_id)
            except Exception:
                # Subsequent emissions/subscriptions still recheck live authorization.
                pass
        return result

    @router.get('/admin/customers/{customer_id}')
    def details(customer_id: int, request: Request, response: Response):
        admin = core.require_permission(request, 'customers:view')
        response.headers['Cache-Control'] = 'no-store, private'
        db = core.SessionLocal()
        try:
            user = db.query(User).filter(User.id == customer_id, User.role == 'customer').first()
            if not user:
                raise HTTPException(404, 'Customer not found')
            if user.account_status == 'deleted' and core.normalize_admin_role(admin.get('admin_role')) != 'super_admin':
                raise HTTPException(404, 'Customer not found')
            orders = security.customer_orders(core, db, user).order_by(core.DBOrder.created_at.desc()).limit(20).all()
            return {'customer': {'id': user.id, 'full_name': user.full_name, 'email': user.email, 'phone': user.phone,
                **security.security_fields(user), 'account_status_reason': user.account_status_reason,
                'addresses': [] if user.account_status == 'deleted' else [core.address_to_dict(address) for address in db.query(core.DBAddress).filter(core.DBAddress.user_id == user.id).all()],
                'orders': [{'id': order.id, 'order_code': order.order_code, 'total_amount': order.total_amount, 'order_status': order.order_status} for order in orders]}}
        finally:
            db.close()
    return router

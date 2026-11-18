import hashlib
import json
import os
import re
import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import or_, inspect, func
from models import User, EmailVerificationToken, AccountActionLimit
from services import order_tracking
from services import retained_orders


def needs_verification(user):
    read = user.get if isinstance(user, dict) else lambda key, default=None: getattr(user, key, default)
    return (read('role') == 'customer' and not (read('email_verified_at') or read('email_verified'))
            and (read('email_verification_required', False) or os.getenv('CUSTOMER_EMAIL_VERIFICATION_REQUIRED', 'false').lower() == 'true'))


def security_fields(user):
    return {'account_status': user.account_status, 'email_verified': bool(user.email_verified_at),
            'email_verified_at': user.email_verified_at.isoformat() if user.email_verified_at else None,
            'email_verification_required': needs_verification(user)}


def check_customer(user, verified=False):
    if not user or user.role != 'customer' or not user.is_active or user.account_status != 'active':
        raise HTTPException(403, 'This customer account is unavailable. Contact FoodNova support.')
    if verified and needs_verification(user):
        raise HTTPException(403, detail={'code': 'EMAIL_VERIFICATION_REQUIRED', 'message': 'Verify your email before placing orders or viewing private order details.'})


def issue_verification(db, user):
    now = datetime.utcnow()
    db.query(EmailVerificationToken).filter(EmailVerificationToken.user_id == user.id, EmailVerificationToken.used_at.is_(None)).update({'used_at': now})
    raw = secrets.token_urlsafe(32)
    db.add(EmailVerificationToken(user_id=user.id, token_hash=order_tracking.digest(raw),
        email_digest=order_tracking.digest(user.email.lower().strip()), expires_at=now + timedelta(minutes=30)))
    db.commit()
    return raw


def verification_email(db, user):
    from email_service import send_customer_verification_email
    raw = issue_verification(db, user)
    send_customer_verification_email(user.email, raw)


def confirm_verification(db, raw):
    if not isinstance(raw, str) or not re.fullmatch(r'[A-Za-z0-9_-]{43}', raw):
        raise HTTPException(400, 'This verification link is invalid or expired.')
    record = db.query(EmailVerificationToken).filter(EmailVerificationToken.token_hash == order_tracking.digest(raw)).first()
    if not record:
        raise HTTPException(400, 'This verification link is invalid or expired.')
    user = db.query(User).filter(User.id == record.user_id).with_for_update().first()
    db.refresh(record, with_for_update=True)
    if not user or not user.is_active or user.account_status != 'active' or record.used_at or record.expires_at <= datetime.utcnow() or record.email_digest != order_tracking.digest(user.email.lower().strip()):
        raise HTTPException(400, 'This verification link is invalid or expired.')
    record.used_at = datetime.utcnow()
    user.email_verified_at = datetime.utcnow()
    db.commit()
    return {'success': True, 'message': 'Email verified. Return to FoodNova to continue.'}


def rate_limited(db, identity, secret, maximum=3, seconds=3600):
    return order_tracking.limited(db, identity, secret, maximum, seconds, AccountActionLimit.__table__)


def unfinished(order):
    return bool(retained_orders.blockers(order))


def customer_orders(core, db, user):
    return db.query(core.DBOrder).filter(or_(core.DBOrder.customer_user_id == user.id,
        (core.DBOrder.customer_user_id.is_(None) & (func.lower(core.DBOrder.customer_email) == user.email.lower()))))


def change_account(core, db, admin, customer_id, action, reason, confirmation):
    if core.normalize_admin_role(admin.get('admin_role')) != 'super_admin':
        raise HTTPException(403, 'Only Super Admins can change customer account status.')
    if action not in {'suspend', 'reactivate', 'deactivate', 'delete'} or len(reason.strip()) < 8 or len(reason) > 500 or confirmation != f'{action.upper()} CUSTOMER {customer_id}':
        raise HTTPException(422, 'Provide a reason (8–500 characters) and the exact confirmation phrase.')
    retained_orders.transaction_limits(db)
    user = db.query(User).filter(User.id == customer_id, User.role == 'customer').with_for_update().first()
    if not user:
        raise HTTPException(404, 'Customer not found')
    if user.account_status == 'deleted':
        raise HTTPException(409, 'Deleted accounts cannot be reactivated or modified.')
    reason = retained_orders.safe_reason(reason)
    orders = customer_orders(core, db, user).order_by(core.DBOrder.id).with_for_update().all()
    if action == 'delete':
        retained_orders.require_guards(db)
        blocking = [{'order_id': order.id, 'order_code': order.order_code, 'reasons': reasons}
                    for order in orders if (reasons := retained_orders.blockers(order, core, db))]
        if blocking:
            retained_orders.reject_blocked(core, db, admin, 'customer_delete', 'customer', user.id, reason, blocking)
    before = user.account_status
    user.account_status = {'suspend': 'suspended', 'deactivate': 'deactivated', 'reactivate': 'active', 'delete': 'deleted'}[action]
    user.is_active = action == 'reactivate'
    user.session_version = int(user.session_version or 0) + 1
    user.account_status_reason = reason.strip()
    user.updated_at = datetime.utcnow()
    if action != 'reactivate':
        user.fcm_token = ''; user.fcm_tokens_json = '[]'
        db.query(EmailVerificationToken).filter(EmailVerificationToken.user_id == user.id, EmailVerificationToken.used_at.is_(None)).update({'used_at': datetime.utcnow()})
        db.query(core.DBPasswordResetToken).filter(core.DBPasswordResetToken.user_id == user.id, core.DBPasswordResetToken.used_at.is_(None)).update({'used_at': datetime.utcnow()})
        if inspect(db.connection()).has_table(order_tracking.tokens.name):
            db.execute(order_tracking.tokens.update().where(order_tracking.tokens.c.order_id.in_([order.id for order in orders])).values(revoked=True))
    if action == 'delete':
        user.account_deleted_at = datetime.utcnow()
        original_email = user.email
        # Keep only a non-login internal identity. Historical ownership no longer relies on email.
        user.email = f'deleted-{user.id}-{secrets.token_hex(16)}@erased.invalid'
        user.email_verified_at = None
        user.account_status_reason = 'Account erased; see restricted activity log.'
        user.full_name = 'Deleted customer'; user.phone = ''; user.password = core._hash_new_password(secrets.token_urlsafe(32))
        profile = db.query(core.DBProfile).filter(core.DBProfile.user_id == user.id).first()
        if profile:
            profile.full_name = 'Deleted customer'; profile.phone = ''; profile.avatar_url = ''; profile.default_address_id = None
        for order in orders:
            retained_orders.preserve_invoice(core, order)
            for item in db.query(core.DBCancellationRequest).filter(core.DBCancellationRequest.order_id == order.id).all():
                item.customer_email = ''; item.customer_name = 'Deleted customer'; item.customer_phone = ''
            order.customer_user_id = user.id
            for field in ('customer_email', 'customer_phone', 'phone', 'delivery_address', 'delivery_notes',
                          'pickup_note', 'customer_feedback', 'admin_note', 'service_note'):
                setattr(order, field, '')
            order.customer_name = 'Deleted customer'
            order.delivery_address_id = None
            order.delivery_address_snapshot = None
            order.delivery_code = None
            order.personal_data_erased_at = datetime.utcnow()
        db.query(EmailVerificationToken).filter(EmailVerificationToken.user_id == user.id).delete(synchronize_session=False)
        db.query(core.DBPasswordResetToken).filter(core.DBPasswordResetToken.user_id == user.id).delete(synchronize_session=False)
        # Notifications contain copied contact data and are not accounting records.
        db.query(core.DBNotification).filter(or_(core.DBNotification.user_email == original_email,
            core.DBNotification.customer_email == original_email)).delete(synchronize_session=False)
        db.flush()
        db.query(core.DBAddress).filter(core.DBAddress.user_id == user.id).delete(synchronize_session=False)
    retained_orders.activity(core, db, admin, f'customer_{action}', 'customer', user.id, reason,
        summary={'before': before, 'after': user.account_status, 'retention': 'pseudonymous internal identity; financial evidence retained'})
    db.commit()
    return {'success': True, 'account_status': user.account_status, 'message': 'Customer account updated. Existing sessions were revoked.'}


def checkout_hash(payload):
    return hashlib.sha256(json.dumps(payload.model_dump(exclude={'idempotency_key'}), sort_keys=True, default=str).encode()).hexdigest()

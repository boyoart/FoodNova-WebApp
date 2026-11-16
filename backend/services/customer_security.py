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
    status = str(order.order_status or order.fulfillment_status or order.status or '').lower()
    terminal = status in {'delivered', 'cancelled', 'canceled', 'picked_up_by_customer'} or (order.delivery_method == 'pickup' and status == 'picked_up')
    return not terminal or str(order.refund_status or '').lower() in {'pending', 'approved'}


def customer_orders(core, db, user):
    return db.query(core.DBOrder).filter(or_(core.DBOrder.customer_user_id == user.id, func.lower(core.DBOrder.customer_email) == user.email.lower()))


def change_account(core, db, admin, customer_id, action, reason, confirmation):
    if core.normalize_admin_role(admin.get('admin_role')) != 'super_admin':
        raise HTTPException(403, 'Only Super Admins can change customer account status.')
    if action not in {'suspend', 'reactivate', 'deactivate', 'delete'} or len(reason.strip()) < 8 or len(reason) > 500 or confirmation != f'{action.upper()} CUSTOMER {customer_id}':
        raise HTTPException(422, 'Provide a reason (8–500 characters) and the exact confirmation phrase.')
    user = db.query(User).filter(User.id == customer_id, User.role == 'customer').with_for_update().first()
    if not user:
        raise HTTPException(404, 'Customer not found')
    if user.account_status == 'deleted':
        raise HTTPException(409, 'Deleted accounts cannot be reactivated or modified.')
    orders = customer_orders(core, db, user).all()
    if action == 'delete' and any(unfinished(order) for order in orders):
        raise HTTPException(409, 'This customer has unfinished orders or refunds. Resolve them before deletion.')
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
        user.full_name = 'Deleted customer'; user.phone = ''; user.password = core._hash_new_password(secrets.token_urlsafe(32))
        profile = db.query(core.DBProfile).filter(core.DBProfile.user_id == user.id).first()
        if profile:
            profile.full_name = 'Deleted customer'; profile.phone = ''; profile.avatar_url = ''; profile.default_address_id = None
        db.flush()
        historical_addresses = db.query(core.DBOrder.delivery_address_id).filter(core.DBOrder.delivery_address_id.isnot(None))
        db.query(core.DBAddress).filter(core.DBAddress.user_id == user.id, ~core.DBAddress.id.in_(historical_addresses)).delete(synchronize_session=False)
    db.add(core.DBAdminAuditLog(admin_id=admin.get('id'), admin_name=admin.get('full_name', 'Super Admin'),
        admin_email=admin.get('email', ''), action=f'customer_{action}', entity_type='customer', entity_id=str(user.id),
        description=reason.strip(), metadata_json=json.dumps({'before': before, 'after': user.account_status, 'retention': 'transaction identity and history retained'})))
    db.commit()
    return {'success': True, 'account_status': user.account_status, 'message': 'Customer account updated. Existing sessions were revoked.'}


def checkout_hash(payload):
    return hashlib.sha256(json.dumps(payload.model_dump(exclude={'idempotency_key'}), sort_keys=True, default=str).encode()).hexdigest()

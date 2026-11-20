"""Number-only progress: no ownership grant and no full-order serializer."""
import logging
import json
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, ValidationError, field_validator
from sqlalchemy import inspect, or_
from sqlalchemy.exc import SQLAlchemyError
from services import order_tracking as tracking
from services import public_order_tracking as public

HEADERS = {'Cache-Control': 'no-store, private', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow, noarchive'}
NEUTRAL = 'Order progress is unavailable. Check the order number or contact FoodNova support.'
logger = logging.getLogger(__name__)


class PublicLookup(BaseModel):
    model_config = ConfigDict(extra='forbid')
    order_number: str

    @field_validator('order_number', mode='before')
    @classmethod
    def number(cls, value):
        return public.normalize_number(value)


class PublicStep(BaseModel):
    model_config = ConfigDict(extra='forbid')
    step: str
    label: str
    state: Literal['completed', 'current', 'pending']


class PublicProgress(BaseModel):
    model_config = ConfigDict(extra='forbid')
    order_number: str
    status: str
    status_label: str
    delivery_stage: str
    timeline: list[PublicStep]


async def public_request(request: Request):
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > 1024:
            raise HTTPException(413, 'Tracking request is too large.', headers=HEADERS)
        body.extend(chunk)
    try:
        return PublicLookup.model_validate(json.loads(body))
    except (ValueError, UnicodeError, ValidationError):
        logger.info('public_tracking_invalid_request')
        # Do not echo submitted identifiers or extra fields through validation errors.
        raise HTTPException(422, 'Enter a valid FoodNova order number.', headers=HEADERS)


def build_router(core):
    router = APIRouter()

    @router.post('/public', response_model=PublicProgress)
    def public_track(request: Request, response: Response, payload: PublicLookup = Depends(public_request)):
        response.headers.update(HEADERS)
        db = core.SessionLocal()
        try:
            # Independent of email-link activation, but never of shared abuse protection.
            if not core.JWT_SECRET or not inspect(db.get_bind()).has_table(tracking.limits.name):
                raise HTTPException(503, NEUTRAL, headers=HEADERS)
            try:
                identity = public.request_identity(request)
            except public.ProxyIdentityUnavailable:
                logger.warning('public_tracking_identity_unavailable')
                raise HTTPException(503, NEUTRAL, headers=HEADERS)
            limits = [('public-ip:' + identity, 30), ('public-network:' + public.network_identity(identity), 300), ('public-number:' + payload.order_number, 300)]
            for key, maximum in limits:
                if tracking.limited(db, key, core.JWT_SECRET, maximum=maximum):
                    logger.warning('public_tracking_throttled')
                    raise HTTPException(429, 'Please wait before checking again.', headers={**HEADERS, 'Retry-After': '900'})
            order, user = core.DBOrder, core.DBUser
            # Select only fields required to derive progress, never materialize private details.
            query = db.query(order.order_code, order.order_status, order.fulfillment_status, order.status,
                             order.delivery_method, order.delivery_status, order.delivery_confirmed_at, order.delivery_completed_at)
            query = core.active_order_filter(query).outerjoin(user, order.customer_user_id == user.id)
            row = query.filter(order.order_code == payload.order_number,
                               order.personal_data_erased_at.is_(None),
                               or_(order.customer_user_id.is_(None),
                                   (user.id.is_not(None) & user.account_deleted_at.is_(None) & (user.account_status != 'deleted')))).first()
            if row is None:
                logger.info('public_tracking_unavailable')
                raise HTTPException(404, NEUTRAL, headers=HEADERS)
            return PublicProgress(**public.progress(row))
        except SQLAlchemyError:
            db.rollback()
            logger.warning('public_tracking_storage_unavailable')
            raise HTTPException(503, NEUTRAL, headers=HEADERS)
        finally:
            db.close()

    return router

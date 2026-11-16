from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from services import website_analytics as ga
from services.analytics_purchase import report_purchase


class PurchaseConsent(BaseModel):
    consent: bool
    client_id: str = Field(pattern=r'^\d{1,20}\.\d{1,20}$', max_length=41)
    session_id: str = Field(pattern=r'^\d{1,20}$', max_length=20)


def build_router(core):
    router = APIRouter()

    @router.get('/admin/website-analytics')
    def website_report(request: Request, response: Response, preset: str = '30', start: str = None, end: str = None):
        core.require_permission(request, 'reports:view')
        response.headers['Cache-Control'] = 'no-store, private'
        return ga.reporting(*ga.report_range(preset, start, end))

    @router.get('/admin/website-analytics/summary')
    def website_summary(request: Request, response: Response):
        core.require_permission(request, 'reports:view')
        response.headers['Cache-Control'] = 'no-store, private'
        return ga.summary()

    @router.post('/orders/{order_id}/analytics-purchase')
    def purchase(order_id: int, payload: PurchaseConsent, request: Request):
        user = core.require_user(request)
        if user.get('role') != 'customer':
            raise HTTPException(403, 'Customer authorization required')
        if payload.consent is not True:
            return {'status': 'consent_required'}
        db = core.SessionLocal()
        try:
            order = core.active_order_filter(db.query(core.DBOrder)).filter(core.DBOrder.id == order_id).first()
            if not order:
                raise HTTPException(404, 'Order not found')
            core.require_order_access(request, order, db)
            return report_purchase(db, order, payload.client_id, payload.session_id, core.DELIVERY_MATCH_CONFIRMED_PAYMENTS)
        finally:
            db.close()

    return router

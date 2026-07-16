# FoodNova Backend Staging Test Plan

Run this plan against a staging Render service and staging database before merging the recovered backend into `main`.

## A. Customer Workflow

| Test | Expected Result |
| --- | --- |
| Register customer | User record and profile are created. JWT is returned. |
| Login customer | JWT is returned and `/api/users/me` loads profile. |
| Browse products | `/api/products` and `/api/categories` return active catalog data. |
| Create order | `/api/orders` creates an order with `pending_payment` / `order_placed`. |
| Upload receipt | Receipt is saved and order payment status becomes receipt-submitted/pending review. |
| View notification | Customer notification list includes receipt/order updates. |
| View tracking before rider | Tracking returns no hidden fake rider state. |
| See delivery PIN | PIN is visible only at the intended delivery stage. |

## B. Admin Workflow

| Test | Expected Result |
| --- | --- |
| Login admin | Admin JWT includes role and permissions. |
| Approve payment | `payment_status=payment_confirmed`; payment audit log is written. |
| Payment audit history | `/admin/orders/{id}/payment-audit` returns the approval event. |
| Order moves to processing | `status`, `order_status`, or `fulfillment_status` is dispatch eligible. |
| Dispatch ready | Logs show `ORDER_ELIGIBILITY_PASSED` and `DISPATCH_MATCHING_GATE`. |
| Automatic matching | Offer is created for an eligible online rider. |
| Manual fallback | `/admin/dispatch-board/orders/{id}/auto-assign` or manual assign works if no worker is available. |

## C. Rider Workflow

| Test | Expected Result |
| --- | --- |
| Login rider | Rider JWT is returned and `/delivery/me` loads worker profile. |
| Onboarding restoration | `/delivery/onboarding/progress` resumes correct step. |
| NIN verification | Success with configured provider, or controlled manual-review response if provider is disabled. |
| Admin approval | Worker becomes `ACTIVE` and can access dashboard. |
| Go online | `/delivery/go-online` sets operational status online. |
| FCM token registration | `/delivery-workers/register-fcm-token` stores token and logs registration. |
| Receive offer | `/delivery/offers` returns pending offer; push/socket are attempted. |
| Accept offer | Offer becomes assigned; order has rider/worker assignment fields. |
| Arrive at pickup | Delivery status updates to pickup arrival state. |
| Mark picked up | Delivery status updates to `PICKED_UP`. |
| Start delivery | Delivery status updates to `IN_TRANSIT`. |
| Arrive at customer | Delivery status updates to `ARRIVED`. |
| Enter delivery PIN | Valid PIN completes delivery. Invalid PIN does not complete delivery. |
| Complete delivery | Order is `DELIVERED`; active order moves to history. |

## D. Synchronization Checks

For each state transition, compare:

- Admin order detail
- Customer order detail
- Customer tracking response
- Rider `/delivery/orders`
- Database `orders.status`
- Database `orders.order_status`
- Database `orders.fulfillment_status`
- Derived `dispatch_status`
- Database `orders.delivery_status`
- `delivery_offers.status`
- `delivery_offers.assignment_status`

Expected:

- No app displays a newer state than the backend source of truth.
- Admin, customer, and rider agree after refresh/socket update.
- Accepted offers disappear from incoming offers and appear in active orders.
- Delivered orders disappear from active and appear in history.

## E. Tracking Checks

| Test | Expected Result |
| --- | --- |
| Rider location ping | `/delivery/location-ping` stores latitude, longitude, heading, speed, and timestamp. |
| Customer rider marker | `/orders/{id}/rider-location` includes rider coordinates when available. |
| Route polyline | Response includes route geometry when Google route key is configured. |
| ETA and distance | Response includes estimated distance/time or a controlled fallback. |
| Stale GPS | API reports stale/missing GPS without hiding valid destination/order state. |

## API Smoke Tests

These do not require successful real Firebase or NIN provider responses:

1. `GET /health`
2. `GET /api/health`
3. `GET /openapi.json`
4. `POST /auth/login` with known staging admin/customer credentials.
5. `GET /admin/debug` with admin JWT.
6. `GET /delivery/me` with rider JWT.
7. `POST /delivery-workers/register-fcm-token` with a dummy staging token.
8. `POST /delivery/verify-nin` with invalid test data; verify controlled 4xx/503 response, not 500.
9. `python scripts/check_schema.py`

## Validation Commands

Run before staging deploy:

```bash
python -m py_compile main.py models.py database.py config.py schemas.py email_service.py auth.py services/ninbvnportal_service.py scripts/check_schema.py
python scripts/check_schema.py
```

Run after staging deploy:

```bash
curl https://STAGING_BACKEND/health
curl https://STAGING_BACKEND/api/health
curl https://STAGING_BACKEND/openapi.json
```

## Exit Criteria

- No endpoint returns unhandled 500 during the lifecycle test.
- Payment approval creates audit history.
- Payment approval creates or attempts a delivery offer for eligible online riders.
- FCM registration stores tokens.
- Offer acceptance synchronizes admin/customer/rider state.
- PIN validation completes delivery only from the rider flow.
- Tracking endpoint returns rider coordinates when GPS exists.

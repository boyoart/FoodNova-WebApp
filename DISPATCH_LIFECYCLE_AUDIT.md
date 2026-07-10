# FoodNova Dispatch Lifecycle Audit

This document is the source-of-truth contract for the FoodNova dispatch lifecycle across Admin, Dispatch Rider, Customer, and Backend.

Audit date: 2026-07-09  
Repository branch: `main`

## Executive Summary

The mobile clients already call a full production dispatch API surface, but the backend source currently checked into this repository does not implement that surface. `backend/server.py` exposes only:

- `GET /api/`
- `POST /api/status`
- `GET /api/status`

Therefore, the production dispatch lifecycle cannot be verified or refactored end-to-end from this repository alone until the deployed production backend source is restored here. The client-side audit still identifies the active endpoint contract and the architectural risks that must be resolved in the backend.

The single source of truth must be a backend `DispatchOrchestrator` that owns every state transition from order approval through delivery completion. Admin UI, Dispatch App, Customer App, FCM, sockets, and notifications must call or subscribe to that orchestrator instead of writing assignment/status state independently.

## Architecture Diagram

```text
Customer App
  | POST /orders
  | GET /orders/{id}
  | GET /orders/{id}/rider-location
  v
Backend API
  |
  | Admin confirms payment/order
  v
DispatchOrchestrator
  |
  | validates order eligibility
  | selects worker
  | creates delivery_offer
  | creates notification event
  | emits socket event
  v
Dispatch App
  | GET /delivery/offers
  | POST /delivery/offers/{offerId}/accept
  | POST /delivery/offers/{offerId}/decline
  | POST /delivery/location-ping
  | PATCH /delivery/orders/{orderId}/status
  | POST /delivery/orders/{orderId}/proof
  v
DispatchOrchestrator
  |
  | writes canonical assignment and delivery state
  v
Customer App + Admin Portal
  | realtime/poll refresh
  | rider details
  | tracking
  | delivery completion
```

## Flow Diagram

```text
Admin approves order
  -> PATCH /admin/orders/{id}
  -> DispatchOrchestrator.markReadyForDispatch(order_id)
  -> order.dispatch_status = READY_FOR_DISPATCH

Offer generation
  -> DispatchOrchestrator.matchOrder(order_id)
  -> delivery_offers row created
  -> order.dispatch_status = OFFERED

Notification creation
  -> notification_events row created once
  -> FCM sent to selected worker devices
  -> socket event delivery_offer_created emitted to worker room

Rider receives offer
  -> Dispatch app foreground push/socket triggers offers refresh
  -> GET /delivery/offers
  -> offer popup with countdown

Accept
  -> POST /delivery/offers/{offerId}/accept
  -> DispatchOrchestrator.acceptOffer(offer_id, worker_id)

Assignment
  -> accepted offer locked transactionally
  -> order.delivery_worker_id set
  -> order.rider_id set only if still supported for legacy reads
  -> delivery_assignment created or updated as audit record
  -> order.dispatch_status = ACCEPTED
  -> competing offers expire/cancel

Customer update
  -> notification event created once
  -> customer socket/order channel emitted
  -> GET /orders/{id} returns assigned rider fields

Tracking update
  -> POST /delivery/location-ping
  -> canonical worker location updated
  -> GET /orders/{id}/rider-location returns rider, pickup, customer, route, ETA

PIN verification
  -> POST /delivery/orders/{orderId}/proof
  -> backend validates order_id + entered PIN
  -> no customer-side completion path

Delivery completion
  -> order.dispatch_status = DELIVERED
  -> order.delivery_status = DELIVERED
  -> delivered_at set
  -> assignment completed
  -> earnings/statistics updated
  -> admin/customer/rider notifications emitted
```

## Backend Endpoints Involved

### Admin / Operations

Visible from `foodnova-customer-app/lib/features/admin/data/admin_repository.dart`:

- `GET /admin/orders`
- `PATCH /admin/orders/{orderId}`
- `PATCH /admin/orders/{orderId}/assign-rider`
- `GET /admin/dispatch-board`
- `GET /admin/riders`

Production architecture requirement:

- `PATCH /admin/orders/{orderId}` may move an order to `READY_FOR_DISPATCH`.
- `PATCH /admin/orders/{orderId}/assign-rider` must not perform a separate assignment write path. It must call `DispatchOrchestrator.assignWorker(...)` or be deprecated after auto-dispatch is stable.

### Dispatch Rider

Visible from `foodnova-dispatch-app/src/api/endpoints.ts`:

- `POST /delivery/go-online`
- `POST /delivery/go-offline`
- `GET /delivery/offers`
- `POST /delivery/offers/{offerId}/accept`
- `POST /delivery/offers/{offerId}/decline`
- `GET /delivery/orders`
- `PATCH /delivery/orders/{orderId}/status`
- `POST /delivery/orders/{orderId}/proof`
- `POST /delivery/location-ping`
- `POST /delivery/panic-alert`
- `GET /delivery/stats`
- `POST /delivery-workers/register-fcm-token`
- `GET /notifications`
- `GET /notifications/unread-count`
- `PATCH /notifications/{id}/read`
- `PATCH /notifications/read-all`

Production architecture requirement:

- Offer acceptance is the normal assignment path.
- Status changes must be validated against the dispatch state machine.
- PIN proof is the only delivery completion path.

### Customer

Visible from `foodnova-customer-app/lib/features/orders/data/orders_repository.dart` and notification code:

- `POST /orders`
- `GET /orders/my`
- `GET /orders/{id}`
- `POST /orders/{orderId}/receipt`
- `GET /orders/{orderId}/invoice`
- `GET /api/orders/{orderId}/invoice` fallback
- `GET /orders/{orderId}/rider-location`
- `GET /api/orders/{orderId}/rider-location` fallback
- `POST /orders/{orderId}/cancel-request`
- `GET /orders/{orderId}/cancel-request`
- `GET /notifications`
- `GET /notifications/unread-count`
- `POST /notifications/register-fcm-token`
- `PATCH /notifications/{id}/read`
- `PATCH /notifications/read-all`
- `DELETE /notifications/{id}`

Production architecture requirement:

- Customer app reads order, rider, notification, and tracking state only.
- Customer app must never assign riders or complete deliveries.

## Duplicate Logic Audit

### Assignment

Potential duplicate source:

- Rider assignment through `POST /delivery/offers/{offerId}/accept`
- Admin manual assignment through `PATCH /admin/orders/{orderId}/assign-rider`

Required single-source rule:

- Both endpoints must call the same backend method:

```text
DispatchOrchestrator.assignWorker(order_id, worker_id, source)
```

No endpoint may independently update `orders.delivery_worker_id`, `orders.rider_id`, `delivery_assignments`, or offer statuses.

### Offer Generation

No offer-generation backend implementation exists in this repository. The clients only read offers using `GET /delivery/offers`.

Required single-source rule:

```text
DispatchOrchestrator.createOffer(order_id, worker_id)
```

This method must:

- enforce idempotency on `(order_id, worker_id, active_status)`
- create exactly one active offer per worker/order window
- emit exactly one `delivery_offer_created` event
- create exactly one notification event

### Notification Flow

Visible role-specific token registration paths:

- Customer/admin app: `POST /notifications/register-fcm-token`
- Dispatch app: `POST /delivery-workers/register-fcm-token`

These can remain role-specific registration endpoints, but notification creation and delivery must be centralized:

```text
NotificationService.createEvent(event_type, audience, entity_id, payload)
NotificationService.deliver(event_id)
```

No feature route should directly send FCM without creating the notification event first.

## State Machine

```text
ORDER_CREATED
PAYMENT_CONFIRMED
READY_FOR_DISPATCH
MATCHING
OFFER_CREATED
OFFER_SENT
RIDER_ACCEPTED
RIDER_EN_ROUTE_PICKUP
ARRIVED_PICKUP
PICKED_UP
EN_ROUTE_CUSTOMER
ARRIVED_CUSTOMER
DELIVERED
CANCELLED
```

Allowed write authority:

- Admin payment/order approval: `ORDER_CREATED -> PAYMENT_CONFIRMED -> READY_FOR_DISPATCH`
- Dispatch matcher: `READY_FOR_DISPATCH -> MATCHING -> OFFER_CREATED -> OFFER_SENT`
- Rider accept: `OFFER_SENT -> RIDER_ACCEPTED`
- Rider delivery workflow: `RIDER_ACCEPTED -> RIDER_EN_ROUTE_PICKUP -> ARRIVED_PICKUP -> PICKED_UP -> EN_ROUTE_CUSTOMER -> ARRIVED_CUSTOMER`
- Rider PIN proof: `ARRIVED_CUSTOMER -> DELIVERED`
- Cancellation/refund service: eligible states -> `CANCELLED`

## Missing Components

These components are required for a production-grade lifecycle but are not present in the checked-in backend:

1. `DispatchOrchestrator`
2. Matching engine / worker eligibility service
3. Delivery offer persistence model and idempotency constraints
4. Canonical delivery assignment write method
5. Dispatch state machine validator
6. Notification event persistence and one-shot delivery service
7. Socket gateway for `delivery_offer_created`, order updates, and tracking updates
8. Rider GPS persistence and stale-location policy
9. Customer tracking route service
10. PIN verification service
11. Delivery completion transaction with earnings/stat updates
12. Backend tests covering every state transition

## Recommended Improvements

1. Restore the deployed production backend source into `backend/`.
2. Implement `DispatchOrchestrator` as the only writer of dispatch lifecycle state.
3. Add database constraints:
   - one accepted assignment per order
   - no active duplicate offer for same order/worker
   - no delivered order without `delivered_at`
4. Deprecate direct admin assignment writes; route admin assignment through the orchestrator.
5. Store all notification events before FCM/socket delivery.
6. Add correlation IDs for every lifecycle request.
7. Add structured logs:
   - `ORDER_READY_FOR_DISPATCH`
   - `ORDER_MATCHING_START`
   - `ORDER_MATCHING_SUCCESS`
   - `ORDER_MATCHING_BLOCKED`
   - `ORDER_OFFER_CREATED`
   - `ORDER_OFFER_PUSH_SENT`
   - `SOCKET_DELIVERY_OFFER_EMITTED`
   - `OFFER_ACCEPTED`
   - `ORDER_ASSIGNMENT_SUCCESS`
   - `TRACKING_UPDATE_SAVED`
   - `PIN_VERIFICATION_SUCCESS`
   - `DELIVERY_COMPLETED`
8. Add integration tests for:
   - payment confirmation creates offer
   - offer accept assigns rider
   - admin manual assignment uses same assignment method
   - location ping appears in customer tracking
   - invalid PIN cannot complete delivery
   - valid PIN completes delivery and updates stats

## Current Repository Conclusion

The mobile apps are clients of the intended dispatch platform, but the checked-in backend is not the production dispatch backend. Until that backend source is restored, this repository cannot guarantee no duplicate backend assignment, offer generation, or notification flows. This document defines the required single-source architecture and the endpoint contract that the restored backend must satisfy.

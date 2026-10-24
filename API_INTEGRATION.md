# API Integration — FoodNova Rider App ↔ Production Backend

**Base URL:** `https://foodnova-webapp.onrender.com` (env `EXPO_PUBLIC_FOODNOVA_API`)
**Auth:** `Authorization: Bearer <jwt>` (token from `/delivery/auth/login`, stored in `expo-secure-store`)
**Response envelope:** `{ "success": bool, "detail"|"message": str, ...data }`
**Client:** `src/api/client.ts` (fetch wrapper, token injection, error normalization) + `src/api/endpoints.ts`

Rider routes are **un-prefixed** (NOT under `/api`).

## Auth
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/delivery/auth/check-email` | `{email}` | `{exists}` |
| POST | `/delivery/auth/check-phone` | `{phone_number}` | |
| POST | `/delivery/auth/send-otp` | `{email}` | email OTP |
| POST | `/delivery/auth/verify-otp` | `{email, otp}` | |
| POST | `/delivery/auth/register` | `{full_name,email,phone_number,country_code,password,otp,worker_type}` | requires verified email |
| POST | `/delivery/auth/login` | `{phone_number, password}` | → token (`access_token`/`token`/`jwt`) |
| POST | `/delivery/auth/logout` | — | |
| POST | `/auth/change-password` | `{current_password,new_password}` | |

## Profile / KYC
| Method | Path | Notes |
|---|---|---|
| GET | `/delivery/me` | rider + approval status |
| GET | `/delivery/profile/me` | full profile |
| GET | `/delivery/verification-status` | KYC state |
| GET | `/delivery/onboarding/progress` | |
| PATCH | `/delivery/profile` | vehicle/personal fields |
| POST | `/delivery/verify-nin` | `{nin, consent, consentAccepted, consentTimestamp}` |
| POST | `/delivery/upload-selfie` | multipart `document` |
| POST | `/delivery/upload-document` | multipart `document_type, document` |
| POST | `/delivery/emergency-contact` | `{full_name, relationship, phone_number, alternate_phone}` |
| POST | `/delivery/submit-onboarding` | `{submit:true}` |
| GET | `/delivery/stats` | earnings/performance |

## Dispatch / Offers
| Method | Path | Notes |
|---|---|---|
| POST | `/delivery/go-online` | `{latitude,longitude,...}` (nullable) |
| POST | `/delivery/go-offline` | |
| GET | `/delivery/offers` | polled every 12s while online |
| POST | `/delivery/offers/{id}/accept` | |
| POST | `/delivery/offers/{id}/decline` | `{reason}` |

## Orders / Workflow
| Method | Path | Notes |
|---|---|---|
| GET | `/delivery/orders?status=` | active/completed/cancelled |
| PATCH | `/delivery/orders/{id}/status` | `{delivery_status,status,note}` |
| POST | `/delivery/orders/{id}/proof` | `{delivery_code(PIN), photo_url, note}` |

Delivery completion is accepted only for the assigned worker after canonical `ARRIVED`; the PIN is
verified on the backend, invalidated on success, and never included in Dispatch or Admin order
responses. Admin status updates and bulk actions cannot mark an order delivered.

Authenticated customer order reads (`GET /orders/my` and `GET /orders/{id}`) return a pickup PIN
only for a payment-confirmed, ready-for-pickup order, and a delivery PIN only after canonical
`ARRIVED`. Public `POST /track-order` never returns a PIN. Admin staff verify pickup with
`POST /admin/orders/{id}/confirm-pickup` and `{pin}`; pickup requires confirmed payment and
readiness, expires 72 hours after issuance, and can be reissued without exposing it to Admin using
`POST /admin/orders/{id}/pickup-pin/reissue`. Both PIN flows lock for one hour after six failed
attempts. The backend's startup schema-compatibility migration adds the failed-attempt and lockout
columns to existing `orders` tables in environments where startup schema mutations are enabled.
For Render production, add `orders.pin_failed_attempts` and `orders.pin_locked_until` through the
reviewed additive migration in `backend/scripts/apply_production_order_schema_migration.py` after
staging validation and a recent backup. Vercel can deploy the updated customer web UI normally.
The Customer Flutter Android build version is `0.1.0+15`; produce a fresh standalone APK after
the Flutter tests/analyze pass.

## GPS / Safety / Notifications
| Method | Path | Notes |
|---|---|---|
| POST | `/delivery/location-ping` | `{latitude,longitude,...}` every 12s while online |
| POST | `/delivery/panic-alert` | `{latitude,longitude,...}` |
| GET | `/notifications` · `/notifications/unread-count` | feed + badge |
| PATCH | `/notifications/{id}/read` · `/notifications/read-all` | |
| POST | `/delivery-workers/register-fcm-token` | `{token, platform}` |

## Login identifier (email or phone)
The login screen accepts **email OR phone** in one field (`smartLogin` in `src/api/endpoints.ts`):
- **Phone** → `POST /delivery/auth/login {phone_number, password}` (dedicated rider login). ✅ Fully supported.
- **Email** → `POST /auth/login {email, password}` (unified login), then the app verifies the token grants a
  rider session via `GET /delivery/me`. If it doesn't, the user is told to sign in with their phone number.

> ⚠️ **Backend gap (email login):** the dedicated rider login is **phone-only** and rejects email
> (`"Enter a valid Nigerian phone number."`). Email sign-in only works if the unified `/auth/login`
> token authorizes `/delivery/*` routes. To guarantee email login for riders, add email support to
> `/delivery/auth/login` (accept `{email}` as an alternative to `{phone_number}`) OR ensure the unified
> token is accepted by rider endpoints. Registration OTP is **email-only** (no phone OTP), as required.

## Real-time strategy
No Socket.IO/WebSocket route is present in the backend OpenAPI. Offers are delivered via
**REST polling (12s) + FCM push**. If a socket channel exists, provide the URL + event names to
upgrade to instant push.

## Defensive field mapping
Backend rider responses are typed `any`. `src/lib/normalize.ts` reads fields defensively across
common aliases. Confirm these names to guarantee 1:1 mapping:
- Offer: `payout|fee|delivery_fee|amount`, `distance_km`, `pickup_address`, `dropoff_address|customer_address`, `expires_at`, `order_id`.
- Order: `pickup_lat/lng`, `dropoff_lat/lng`, `customer_name`, `customer_phone`, `delivery_status`, `order_number`.
- Stats: `today_earnings`, `total_earnings`, `week_earnings`, `total_deliveries`, `rating`, `acceptance_rate`.
- Session: token field on login; approval flag on `/delivery/me` (`approval_status|verification_status|status`).

# FoodNova Backend Render Deployment Checklist

This checklist is for staging first. Do not point this recovered backend at production until staging passes the lifecycle test plan.

## Render Service Settings

- Root Directory: `backend`
- Build Command: `pip install -r requirements.txt`
- Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Runtime: `python-3.12.7`
- Branch for staging: `recovery/restore-foodnova-backend`

## Required Environment Variables

Set these manually in Render. Never commit real values.

- `ENVIRONMENT=staging` for staging, `ENVIRONMENT=production` for production.
- `DATABASE_URL`
- `JWT_SECRET`
- `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_PATH`
- `NINBVNPORTAL_API_KEY`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Recommended:

- `FOODNOVA_BUILD_COMMIT` set to the deployed Git SHA during staging/release validation.
- `FRONTEND_URL`
- `FRONTEND_ORIGIN`
- `CORS_ORIGINS`
- `GOOGLE_DIRECTIONS_API_KEY` or `GOOGLE_MAPS_API_KEY`
- `FOODNOVA_PICKUP_LATITUDE`
- `FOODNOVA_PICKUP_LONGITUDE`
- `RESEND_API_KEY`
- `EMAIL_ENABLED`
- `EMAIL_FROM`
- `ADMIN_NOTIFICATION_EMAIL`
- `FOODNOVA_WEBSITE`
- `FOODNOVA_SUPPORT_EMAIL`
- `FOODNOVA_PHONE`
- `FOODNOVA_INSTAGRAM`
- `FOODNOVA_TIKTOK`
- `FOODNOVA_TAGLINE`

Optional:

- `DISPATCH_TEST_MODE=false`
- `RIDER_EARNINGS_ENABLED=false`
- `FOODNOVA_E2E_SECRET` for staging only; do not configure in production.
- `ALLOW_STARTUP_SCHEMA_MUTATIONS=false`
- `NINBVNPORTAL_BASE_URL=https://ninbvnportal.com.ng/api`
- `NINBVNPORTAL_TIMEOUT_SECONDS=25`
- `NINBVNPORTAL_DIAGNOSTIC_NIN`
- `FCM_SERVER_KEY`

## Database Backup

Before any production deployment:

1. Export a PostgreSQL backup from Render.
2. Record the backup filename, timestamp, and database URL alias.
3. Confirm the backup can be restored to a temporary database.
4. Run `python scripts/check_schema.py` against the restored database.
5. Keep `ALLOW_STARTUP_SCHEMA_MUTATIONS=false` until schema drift is reviewed.

## Staging Deployment

1. Create a staging Render service or staging environment group.
2. Use a staging PostgreSQL database, not production.
3. Set `ENVIRONMENT=staging`.
4. Set a strong `FOODNOVA_E2E_SECRET` so the automated lifecycle runner can create isolated staging accounts.
5. Keep `RIDER_EARNINGS_ENABLED=false`.
6. Keep `ALLOW_STARTUP_SCHEMA_MUTATIONS=false`.
7. Deploy branch `recovery/restore-foodnova-backend`.
8. If startup reports schema drift, run `python scripts/check_schema.py`, review output, then decide whether to enable startup mutations only for staging.

## Health Checks

Run after deployment:

- `GET /health`
- On staging, confirm `/health` returns the expected `build_commit`.
- `GET /api/health`
- `GET /openapi.json`
- Confirm logs include `FOODNOVA_CONFIG_REPORT`.
- Confirm logs include `FOODNOVA_REGISTERED_ROUTES_END`.
- Confirm logs do not print secret values.

## Route Checks

Verify these routes exist in OpenAPI:

- `GET /delivery/offers`
- `POST /delivery/offers/{offer_id}/accept`
- `POST /delivery/offers/{offer_id}/decline`
- `POST /delivery-workers/register-fcm-token`
- `POST /delivery/location-ping`
- `POST /delivery/go-online`
- `POST /delivery/go-offline`
- `GET /delivery/orders`
- `PATCH /delivery/orders/{order_id}/status`
- `POST /delivery/orders/{order_id}/proof`
- `GET /delivery/stats`
- `GET /orders/{order_id}/rider-location`
- `GET /admin/dispatch-board`
- `POST /internal/staging/e2e/bootstrap` only when `ENVIRONMENT=staging` and `FOODNOVA_E2E_SECRET` is configured.

## Socket.IO Check

1. Authenticate as an admin or rider.
2. Connect to the backend Socket.IO endpoint with the JWT.
3. Confirm server logs `SOCKET_CONNECTED`.
4. Trigger a delivery offer in staging.
5. Confirm `SOCKET_DELIVERY_OFFER_EMITTED`.
6. Confirm the dispatch app receives the offer without manual refresh.

## Rollback

Rollback commit:

- Current production source candidate: `53c70dada42a028d29c62811169d7687703b1676`
- Recovery branch commit: `41010789a3a3f5174ae1e41151e17584a62204be`

Rollback instructions:

1. Keep the latest database backup available.
2. In Render, redeploy the previous known-good commit if the new deploy fails before schema mutation.
3. If schema mutation was enabled, restore the backup to a new database and repoint `DATABASE_URL`.
4. Disable `ALLOW_STARTUP_SCHEMA_MUTATIONS`.
5. Re-run health and route checks.

## Production Gate

Do not promote to production until:

- Staging lifecycle test passes.
- Payment approval history writes correctly.
- Offer generation and FCM push are verified.
- Rider accept/status/PIN completion are verified.
- Customer/admin/rider state remains synchronized.
- Schema drift has a reviewed migration path.
- `RIDER_EARNINGS_ENABLED=false` unless FoodNova explicitly enables platform-managed rider earnings.
- `FOODNOVA_E2E_SECRET` is not configured on production.

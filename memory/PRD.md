# PRD — FoodNova Dispatch (Rider App)

## Original Problem Statement
Build the FoodNova Dispatch/Rider App as an Android-ready application that integrates with the
EXISTING FoodNova ecosystem (Customer app, Admin web, FastAPI backend on Render, existing DB, FCM).
Do NOT build a new backend. Use the existing production backend as source of truth.
(User's real stack is Flutter + PostgreSQL; that cannot run in this Expo environment, so the Rider App
is built in Expo/React Native and integrates with the existing backend over its REST API.)

## Architecture
- Expo/React Native (expo-router), Android-ready. Pure API client of `https://foodnova-webapp.onrender.com`.
- JWT auth (secure-store). Defensive response parsing (`src/lib/normalize.ts`).
- Real-time offers via REST polling (12s) + FCM. Google Maps via react-native-maps (device build only).
- Base URL via `EXPO_PUBLIC_FOODNOVA_API`. Maps key + FCM configured in `app.json` / build.

## User Personas
- **Rider/Driver**: onboards (KYC), goes online, receives & accepts delivery offers, navigates, completes deliveries with PIN, tracks earnings.

## Core Requirements (static)
- Auth (login/register/OTP/forgot), KYC onboarding, go online/offline, dispatch offers (accept/decline),
  GPS tracking, delivery workflow + PIN, push notifications, profile, earnings/stats.
- Business rules: customers/riders not geofenced; auto + manual assignment; long-distance allowed.

## Implemented (2026-07-07)
- Branded splash + auth (login, OTP register, forgot) — VERIFIED against live backend.
- KYC onboarding wizard (NIN, selfie, utility bill, vehicle, emergency, submit) + pending-approval screen.
- Dashboard: online/offline toggle w/ location perms, stats, active delivery, live offer polling + offer modal (countdown).
- Deliveries history (status filters), Earnings/performance, Profile/settings/logout.
- Active delivery screen: tracking map (web-safe fallback), step tracker, status advance, delivery PIN completion, panic alert, call customer.
- Notifications feed + FCM token registration (device build only).
- Google Maps key inserted; full deliverables doc at `/app/FOODNOVA_RIDER_INTEGRATION.md`.

## Backlog / Remaining
- **P0**: Approve a test rider (admin) → run full authenticated E2E (offers→accept→workflow→PIN).
- **P0 (backend)**: CORS whitelist preview origin for web QA (browser-only; native unaffected).
- **P1**: Provide `google-services.json` + produce Android build → validate live maps + FCM push.
- **P1 (backend)**: Confirm field names (offer payout/distance/addresses, order coords, token field, approval flag) — see gap analysis G3/G5/G6.
- **P2**: If a Socket.IO channel exists, switch dashboard from polling to live sockets (G2).
- **P2**: Add `GET /delivery/orders/{id}` for detail efficiency (G4); background location updates.

## Next Tasks
1. Get an approved rider login + create google-services.json → device build.
2. Run full E2E via testing agent with real credentials.

## Update 2026-07-08 — Live integration hardening (approved rider #13)
- Verified against real approved rider (08034622339): login, /delivery/me, stats, offers, orders — 21/21 API checks PASS (non-destructive).
- FIXED from real data: approval flag read at TOP level of /delivery/me (was drilling into nested `worker`); order mapping now uses `order_code`, `total_amount`, `delivery_address_snapshot.latitude/longitude`; status `IN_TRANSIT`/`out_for_delivery` handled.
- FIXED: backend IGNORES `?status=` on /delivery/orders → app now buckets active/completed/cancelled CLIENT-SIDE (dashboard, deliveries, earnings).
- Firebase: `google-services.json` added; Android package set to `com.foodnova.dispatch` + `googleServicesFile` wired in app.json.
- Backend email-login patch spec delivered → `/app/BACKEND_EMAIL_LOGIN_PATCH.md`.
- GAPS confirmed: /delivery/stats exposes NO earnings fields (earnings show ₦0 until backend adds them); web preview CORS-blocked (native unaffected).
- STILL PENDING: destructive UI workflow E2E (accept→pickup→en-route→arrived→PIN) — needs a device build (CORS) + a disposable test order (won't run against live customer order FN-00030).

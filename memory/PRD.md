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

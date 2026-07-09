# FoodNova Dispatch (Rider App) — Integration, Gap Analysis & Deployment Guide

**App:** FoodNova Dispatch (Rider) — Expo / React Native (Android-ready)
**Connects to (source of truth):** `https://foodnova-webapp.onrender.com` (existing FastAPI production backend — NOT rebuilt)
**Auth:** JWT bearer, obtained from `POST /delivery/auth/login`

---

## 1. Architecture Overview

```
Customer App ─┐
Admin Web ────┤→  FastAPI Backend (Render, existing)  ←──  Rider App (THIS build)
              │        │  Postgres DB (existing)              REST + polling + FCM
              └────────┘  FCM (existing)
```

- The Rider App is a **pure API client** of the existing backend. No backend, DB, or auth logic was added.
- Base URL is injected via `EXPO_PUBLIC_FOODNOVA_API` (in `foodnova-dispatch-app/.env`). Rider routes are **un-prefixed** (`/delivery/*`, `/notifications/*`, `/delivery-workers/*`).
- Token stored securely via `expo-secure-store` (`src/api/client.ts`), attached as `Authorization: Bearer <jwt>`.
- Response envelopes (`{ success, detail|message, ...data }`) and list shapes are parsed **defensively** (`src/lib/normalize.ts`) because the backend OpenAPI types all rider responses as `any`.

### App map (expo-router)
| Route | Purpose |
|---|---|
| `index` | Splash + auth/approval gate |
| `(auth)/login`,`register`,`forgot` | JWT login, OTP registration, reset |
| `onboarding/index`,`pending` | KYC wizard (NIN, selfie, docs, vehicle, emergency) + approval status |
| `(tabs)/index` | Dashboard: go online/offline, stats, active delivery, live offers |
| `(tabs)/deliveries` | Delivery history w/ status filters |
| `(tabs)/earnings` | Earnings + performance metrics |
| `(tabs)/profile` | Profile, vehicle, documents, settings, logout |
| `delivery/[id]` | Active delivery workflow + tracking map + PIN completion |
| `notifications` | Notification feed |

---

## 2. Backend Endpoints Consumed (all verified live)

**Auth:** `/delivery/auth/check-email`, `/check-phone`, `/send-otp`, `/verify-otp`, `/register`, `/login`, `/logout`, `/auth/change-password`
**Profile/KYC:** `/delivery/me`, `/delivery/profile/me`, `/delivery/verification-status`, `/delivery/onboarding/progress`, `/delivery/profile` (PATCH), `/delivery/verify-nin`, `/delivery/upload-selfie`, `/delivery/upload-document`, `/delivery/emergency-contact`, `/delivery/submit-onboarding`, `/delivery/stats`
**Dispatch:** `/delivery/go-online`, `/delivery/go-offline`, `/delivery/offers`, `/delivery/offers/{id}/accept`, `/delivery/offers/{id}/decline`
**Orders/workflow:** `/delivery/orders`, `/delivery/orders/{id}/status` (PATCH), `/delivery/orders/{id}/proof`
**GPS/safety:** `/delivery/location-ping`, `/delivery/panic-alert`
**Notifications/push:** `/notifications`, `/notifications/unread-count`, `/notifications/{id}/read`, `/notifications/read-all`, `/delivery-workers/register-fcm-token`

---

## 3. Gap Analysis — Action Items for the Backend Team

| # | Severity | Finding | Recommended fix |
|---|---|---|---|
| G1 | **High (web QA only)** | Backend CORS does not allow the Emergent preview origin, so the **web preview** shows "Failed to fetch" instead of real API responses. **Does NOT affect the native Android build.** | Add the preview origin (and your app's web origins) to `Access-Control-Allow-Origin`, or accept that QA happens on a device build. |
| G2 | Medium | **No Socket.IO/WebSocket route** is exposed in the OpenAPI spec. Real-time offer delivery currently relies on **REST polling (12s) + FCM push**. | If a Socket.IO server exists, share the URL + event names (`offer.created`, `assignment.updated`, etc.) and we'll switch the dashboard from polling to live sockets for instant offers. |
| G3 | Medium | Rider response bodies are typed `any` in OpenAPI. The app reads fields defensively but exact names matter for **offer payout/distance/addresses** and **order pickup/dropoff coordinates**. | Confirm/expose these field names: offer `payout`/`fee`, `distance_km`, `pickup_address`, `dropoff_address`, and per-order `pickup_lat/lng`, `dropoff_lat/lng`, `customer_name`, `customer_phone`, `delivery_status`. |
| G4 | Low | No single `GET /delivery/orders/{id}` — the detail screen fetches the list and filters by id. | (Optional) Add `GET /delivery/orders/{id}` for efficiency. |
| G5 | Low | `login` response token field name assumed (`access_token`/`token`/`jwt`). App handles all three. | Confirm the token field for certainty. |
| G6 | Info | Approval gating keys assumed: `approval_status` / `verification_status` / `status` in `/delivery/me`. | Confirm which field the app should treat as the approval flag. |

**Missing env vars / config the app needs (all handled in this build):**
- `EXPO_PUBLIC_FOODNOVA_API` → set in `foodnova-dispatch-app/.env`.
- Google Maps Android/iOS key → set in `foodnova-dispatch-app/app.json` (`android.config.googleMaps.apiKey`, `ios.config.googleMapsApiKey`).
- Firebase `google-services.json` → **required at build time** for FCM (see §5).

---

## 4. Business Rules Implemented
- Customers/riders **not geofenced**; messengers geofenced (registration defaults `worker_type: "rider"`). Long-distance offers are accepted as-is — the app never rejects an offer by distance.
- **Auto-assignment & manual assignment** both surface identically via `GET /delivery/offers` → the app polls + shows them; accept/decline via the offer endpoints. No client-side matching logic.

---

## 5. Deployment Guide (Android)
1. Build from `foodnova-dispatch-app/`:
   ```bash
   cd foodnova-dispatch-app
   npm install
   npx eas build --platform android --profile preview
   ```
2. **Google Maps** already configured with your key in `app.json`. Ensure in Google Cloud that **Maps SDK for Android** + **Directions API** are enabled, and the key is restricted to the app package `com.foodnova.dispatch` + its SHA-1.
3. **FCM push:** provide `google-services.json` (Firebase → Android app with the same package). Push token registration (`/delivery-workers/register-fcm-token`) fires automatically on first launch after a real build.
4. Live Google Maps and FCM **do not work in Expo Go or web preview** — they activate only on the device build.

---

## 6. Testing Checklist
- [x] App boots → splash → login (verified)
- [x] Login form + validation + show/hide password (verified)
- [x] Register step-1 → send OTP transition (requests fire to live backend; verified)
- [x] Forgot-password send code (verified)
- [x] Navigation across auth screens (verified)
- [ ] Login with an **approved rider** → dashboard *(pending: no approved rider yet)*
- [ ] Go online → location permission → offer appears → accept → workflow → PIN complete *(pending rider + device build for maps)*
- [ ] FCM push received *(pending device build + google-services.json)*

---

## 7. Remaining Risks
- Full authenticated E2E (offers, tracking, PIN) is **unverified** until an approved rider account exists and a device build is produced.
- Field-name mismatches (G3) could show `--`/`₦0` placeholders until confirmed; the app won't crash — it degrades gracefully.
- Instant offers depend on FCM/polling until a socket channel (G2) is provided.

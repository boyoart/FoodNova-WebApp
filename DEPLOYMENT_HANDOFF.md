# FoodNova Rider App — Deployment Handoff Report

Date: 2026-07-07
Scope: Android-ready Rider App (Expo/React Native) integrated with the existing FoodNova production
backend. No backend was built or modified.

---

## 1. Status Summary
| Area | Status |
|---|---|
| App builds & boots | ✅ Metro bundles clean, lint clean |
| Backend connectivity | ✅ Live calls to `foodnova-webapp.onrender.com` verified |
| Auth / public flows | ✅ Verified by testing agent (login, register→OTP, forgot, nav) |
| Authenticated E2E | ⛔ Pending — no approved rider account yet |
| Google Maps | ⚙️ Key configured; renders on **device build only** |
| FCM push | ⚙️ Wired; needs `google-services.json` + device build |
| Docs | ✅ README, API_INTEGRATION, CODEX_INSTRUCTIONS, PRODUCTION_CHECKLIST, .env.example, FOODNOVA_RIDER_INTEGRATION |

---

## 2. NIN Verification Audit
- **Provider:** `ninbvnportal` (https://ninbvnportal.com.ng/api)
- **Endpoint (backend → provider):** `POST https://ninbvnportal.com.ng/api/nin-verification`
- **Auth mode:** `x-api-key` header (key loaded on backend, length 31).
- **Rider-app endpoints (client → backend):** `/delivery/verify-nin` (used), plus `/delivery/kyc/verify-nin`, `/delivery/onboarding/verify-nin`, `/delivery-workers/verify-nin`. App sends `{nin, consent, consentAccepted, consentTimestamp}`.
- **Live health:** `apiKeyLoaded=true`, `endpointReachable=true`, `providerAuthStatus=authenticated`, last success 2026-07-06.
- **⚠️ Balance / fallback behavior:** provider balance is **₦350, below the ₦500 low-balance threshold** (190/1000 requests used today). If balance is exhausted, NIN verification calls will fail — riders would be blocked at the Identity step. **Fallback = admin override** (see below). **Action: top up the ninbvnportal account.**
- **Admin override / manual approval:** admin endpoints exist to review KYC regardless of automated NIN result:
  - `GET /admin/rider-verification-queue` — list pending riders
  - `GET /admin/rider-verification-queue/{worker_id}` — full KYC detail (documents/selfie)
  - `POST /admin/rider-verification-queue/{worker_id}/{action}` — **approve/reject (manual override)**
  - `PATCH /admin/workforce/{worker_id}/status` — set worker status
  - Provider diagnostics: `/admin/nin-provider-status`, `/admin/diagnostics/nin-provider[/balance|/health]`, `/admin/nin-provider-test-verification`.

## 3. KYC Uploads — Storage & Admin Visibility
- Uploads go to the backend via `/delivery/upload-selfie`, `/delivery/upload-document` (multipart) and
  `/delivery/emergency-contact`, `/delivery/profile` (vehicle).
- Admin visibility is provided by the **rider-verification-queue** detail endpoint and `/admin/workforce`.
- ⛔ **Not independently verified** that files persist and render in the Admin UI (requires an admin token
  + a submitted rider). Recommended acceptance test: submit a rider from the app, then open the Admin
  verification queue and confirm selfie/utility-bill/NIN data are visible and approvable.

## 4. Firebase (FCM) Requirements
- App registers the native device token via `POST /delivery-workers/register-fcm-token {token, platform}`
  on launch (native only).
- **Required before push works:** Firebase project → Android app with package
  `com.foodnova.dispatch` → download `google-services.json` → include in the build.
  Configure FCM v1 credentials for the sender (backend side, already existing).
- Push **cannot** be tested in Expo Go / web preview — only on a real build.

## 5. Google Maps Requirements
- Key configured in `app.json` (Android + iOS).
- In Google Cloud: enable **Maps SDK for Android** and **Directions API**; restrict the key to the app
  package + release SHA-1.
- Maps render **only on a device build**, not Expo Go / web preview (web shows a branded fallback).

## 6. Environment Variables
| Var | Where | Present |
|---|---|---|
| `EXPO_PUBLIC_FOODNOVA_API` | `foodnova-dispatch-app/.env` | ✅ |
| Google Maps key | `foodnova-dispatch-app/app.json` | ✅ |
| `google-services.json` | build asset | ❌ (user to provide) |
| `EXPO_PACKAGER_*` | platform-managed | ✅ |
No other missing env vars for the app. (Backend-side keys — NIN, FCM sender, DB — live on Render and are out of scope.)

## 7. Open Risks / Pre-Launch Actions
1. Approve a test rider → run full authenticated E2E (offer→accept→workflow→PIN).
2. Top up NIN provider balance (currently low).
3. Provide `google-services.json`; produce Android build; validate maps + push on device.
4. Verify KYC uploads render in Admin verification queue.
5. Replace placeholder app package id + default icon/splash art with official FoodNova assets.
6. (Optional) Backend: whitelist web origins (CORS) for browser QA; expose socket channel for instant offers; confirm defensive field names (API_INTEGRATION.md).

## 8. Push to GitHub and Build
Source lives in `foodnova-dispatch-app/`. Commit and push repository changes normally, then build the
Android app from the standardized dispatch directory:

```bash
cd foodnova-dispatch-app
npm install
npx eas build --platform android --profile preview
```

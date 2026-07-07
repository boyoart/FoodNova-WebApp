# Production Checklist — FoodNova Rider App

## 1. Environment & Config
- [x] `EXPO_PUBLIC_FOODNOVA_API` set to production backend (`frontend/.env`).
- [x] `frontend/.env.example` provided.
- [x] Google Maps key present in `app.json` (Android `android.config.googleMaps.apiKey` + iOS `ios.config.googleMapsApiKey`).
- [ ] **Maps key restricted** in Google Cloud to package `com.emergent.riderofferflow.mpig0l` + release SHA-1, with **Maps SDK for Android** + **Directions API** enabled.
- [ ] `google-services.json` added for FCM (Firebase → Android app, same package).
- [ ] Change app `package`/`bundleIdentifier` from the `com.emergent.*` placeholder to a FoodNova-owned id before store submission.

## 2. Branding assets
- [x] `icon.png` (512×512), `adaptive-icon.png` (512×512), `splash-image.png`, `favicon.png` exist.
- [x] Splash/adaptive background set to brand green `#00C261`.
- [x] In-app FoodNova wordmark logo (code-based, `src/components/Logo.tsx`).
- [ ] **Replace default template icon/splash art with official FoodNova artwork** before release (current icons are valid placeholders).

## 3. Auth & Security
- [x] JWT stored in secure storage (`expo-secure-store`), sent as Bearer.
- [x] No secrets hardcoded in source (base URL via env; Maps key in native config only).
- [x] Password fields masked; show/hide toggle.
- [ ] Backend: confirm token expiry/refresh behavior; app currently re-auths on 401 by returning to login.

## 4. KYC / NIN (see NIN audit in DEPLOYMENT_HANDOFF.md)
- [x] NIN verify, selfie, proof-of-address, vehicle, emergency-contact wired to backend.
- [ ] **NIN provider balance low (₦350 < ₦500 threshold)** — top up `ninbvnportal` account to avoid verification failures.
- [ ] Confirm KYC uploads appear in Admin **rider-verification-queue** and approve flow works.

## 5. Real-time & Notifications
- [x] Offer polling (12s) while online + FCM token registration.
- [ ] FCM push validated on a real device build.
- [ ] (Optional) Socket.IO upgrade if backend exposes a channel.

## 6. Maps & Tracking
- [x] Native map with markers + polyline; web-safe fallback.
- [ ] Verify live rendering on device build with the restricted key.

## 7. Permissions (app.json)
- [x] Android: location (fine/coarse/background), foreground-service, camera, POST_NOTIFICATIONS.
- [x] iOS usage descriptions for location/camera/photos.

## 8. Quality
- [x] `expo lint` clean; Metro bundles.
- [x] Public/unauthenticated flows verified by testing agent.
- [ ] Full authenticated E2E (needs approved rider + device build).

## 9. Release
- [ ] Publish Android build via Emergent.
- [ ] Smoke test on physical Android device.
- [ ] Push source to GitHub via **Save to GitHub**.

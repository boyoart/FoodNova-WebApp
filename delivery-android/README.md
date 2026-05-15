# FoodNova Delivery Android

Native Android starter project for the future FoodNova Delivery app.

This project is intentionally separate from the existing FoodNova customer/admin web app and Capacitor Android wrapper. It reuses the existing FoodNova backend API and keeps delivery-worker mobile concerns isolated under `delivery-android`.

## Architecture

- Package: `com.foodnova.delivery`
- UI: Kotlin + Jetpack Compose
- Navigation: Navigation Compose
- Dependency injection: Hilt
- Network-ready: Retrofit + OkHttp
- Push-ready: Firebase Cloud Messaging dependency placeholder
- Location-ready: Android location permissions and location module
- Backend base URL: configured through `BuildConfig.FOODNOVA_API_BASE_URL`

## Modules

- `auth` - worker sign-in/session shell
- `auth/presentation/onboarding` - phone-first auth state, validation, Nigerian phone formatting, verification state, and ViewModel hooks
- `auth/data/remote/dto` - Retrofit-ready authentication request/response DTOs
- `delivery` - delivery offer and assignment shell
- `kyc` - KYC/NIN verification shell
- `kyc/presentation/verification` - post-login verification checklist, address document upload UI, and emergency contact setup
- `location` - GPS/geofencing shell
- `notifications` - FCM registration/push shell
- `network` - backend API client shell
- `core` - shared app config/models/result helpers
- `ui` - Compose app shell and theme

No full business logic is implemented yet.

## Authentication Flow

The app is prepared for a low-friction delivery-worker auth flow:

1. Phone number first.
2. Backend phone lookup determines existing worker vs new worker.
3. Existing worker continues to password login.
4. New worker completes quick signup with full name, password, and rider/messenger selection.
5. KYC is post-login. Dashboard access is allowed, but going online and accepting deliveries remain blocked until verification and admin approval.

## Verification Flow

Post-login verification is prepared as a checklist:

- Identity/KYC
- Address document review
- Emergency contact
- Admin approval

Address verification accepts image/PDF selection locally and prepares upload metadata for future backend integration. Emergency contact setup is validated locally and prepared as a backend-ready request. Delivery activation remains locked until all required verification items and admin approval are approved.

## Backend

The delivery app is prepared to reuse the existing FoodNova Render backend:

```text
https://foodnova-webapp.onrender.com/
```

Change this through the `FOODNOVA_API_BASE_URL` `buildConfigField` in `app/build.gradle.kts` when environment-specific build variants are added.

Integrated backend routes:

- `POST /delivery/auth/register`
- `POST /delivery/auth/login`
- `GET /delivery/me`
- `GET /delivery/verification-status`
- `POST /delivery/kyc`
- `POST /delivery/address-verification`
- `POST /delivery/emergency-contact`

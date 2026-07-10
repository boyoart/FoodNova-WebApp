# FoodNova Dispatch — Rider App

Android-ready **Expo / React Native** rider (dispatch) app that integrates with the **existing FoodNova
production backend** (FastAPI on Render). This app was **not** built with its own backend — it is a pure
client of `https://foodnova-webapp.onrender.com`.

> The wider FoodNova ecosystem (Customer app, Admin web) is Flutter/Postgres and lives elsewhere.
> This repository contains **only the Rider App** and connects to the shared production backend.

## Features
- **Auth** — JWT login, email-OTP registration, password reset, secure session persistence.
- **KYC onboarding** — NIN verification, selfie, proof-of-address upload, vehicle info, emergency contact, consent → admin approval.
- **Dashboard** — Go Online/Offline (with GPS), earnings & performance stats, live delivery offers (accept/decline with countdown), active delivery.
- **Delivery workflow** — pickup → en-route → arrived → delivered, delivery-PIN completion, panic alert, call customer.
- **Tracking** — Google Maps with rider/pickup/customer markers + route (device build only).
- **Deliveries history, Earnings, Profile, Notifications feed, FCM push registration.**

## Tech
- Expo SDK 54, expo-router, TypeScript
- react-native-maps (Google), expo-location, expo-notifications (FCM), expo-image-picker
- Fonts: Space Grotesk (display) + Plus Jakarta Sans (UI). Brand green `#00C261`.

## Project structure
```
app/                     expo-router screens
  (auth)/                login, register, forgot
  onboarding/            KYC wizard + pending approval
  (tabs)/                dashboard, deliveries, earnings, profile
  delivery/[id].tsx      active delivery workflow + tracking
  notifications.tsx
src/
  api/                   client.ts (fetch+JWT), endpoints.ts
  context/               AuthContext, ToastContext
  components/            ui.tsx, Logo, OfferModal, TrackingMap(.web)
  lib/                   format, normalize, location, push, image
  theme/tokens.ts        design tokens
```

## Setup
```bash
cd foodnova-dispatch-app
npm install
# configure env (see .env.example)
npm run start     # Metro on :3000
```

## Configuration
- `foodnova-dispatch-app/.env` → `EXPO_PUBLIC_FOODNOVA_API=https://foodnova-webapp.onrender.com`
- `foodnova-dispatch-app/app.json` → Google Maps key (Android + iOS), permissions.
- FCM requires `google-services.json` at build time (Firebase).

See **API_INTEGRATION.md**, **PRODUCTION_CHECKLIST.md**, **DEPLOYMENT_HANDOFF.md**, and
**FOODNOVA_RIDER_INTEGRATION.md** for full details. The dispatch lifecycle contract and
single-source architecture are documented in **DISPATCH_LIFECYCLE_AUDIT.md**.

## Build
Build from the standardized dispatch app directory:

```bash
cd foodnova-dispatch-app
npm install
npx eas build --platform android --profile preview
```

Google Maps and FCM push **only work on a real device build** — not Expo Go or the web preview.

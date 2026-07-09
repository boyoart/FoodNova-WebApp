# FoodNova Dispatch App

Dedicated Flutter Android app for FoodNova riders.

## Backend contracts reused

- `POST /auth/login`
- `POST /delivery-workers/signup`
- `GET /delivery/me`
- `POST /rider/go-online`
- `POST /delivery/go-offline`
- `POST /delivery/location-ping`
- `POST /delivery/panic-alert`
- `POST /delivery-workers/register-fcm-token`
- `GET /delivery/offers`
- `POST /delivery/offers/{offer_id}/accept`
- `POST /delivery/offers/{offer_id}/decline`
- `GET /notifications`
- `GET /notifications/unread-count`
- `PATCH /notifications/{id}/read`
- `POST /orders/{order_id}/confirm-delivery`

## Pending backend coverage

The app does not create duplicate APIs. These screens are ready, but show
recoverable sync errors until the existing backend exposes matching routes:

- delivery stage updates after offer acceptance
- signature/photo delivery proof storage
- rider earnings summary
- rider delivery history

## Build

```sh
flutter pub get
flutter analyze
flutter build apk --debug
```

Set these values for production builds:

```sh
--dart-define=FOODNOVA_API_BASE_URL=https://foodnova-webapp.onrender.com
--dart-define=GOOGLE_MAPS_API_KEY=...
```

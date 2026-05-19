# FoodNova Customer App

Flutter Android-first customer app for FoodNova commerce and neighborhood fulfillment.

## Architecture

- Clean Architecture by feature: `data`, `domain`, `presentation`
- Riverpod for state
- GoRouter for navigation
- Dio for API networking
- Local cart in Phase 1, persisted cart backend reserved for Phase 2

## Runtime API

Pass the backend URL with:

```bash
flutter run --dart-define=FOODNOVA_API_BASE_URL=https://foodnova-webapp.onrender.com
```

Build an Android APK with:

```bash
flutter build apk --release --dart-define=FOODNOVA_API_BASE_URL=https://foodnova-webapp.onrender.com
```

The app rejects non-HTTPS API base URLs. On Render, keep backend environment variables current and redeploy after updates. Optional backend CORS additions can be supplied as a comma-separated `CORS_ORIGINS` value.

Flutter is not installed in this workspace, so this scaffold has not been compiled locally.

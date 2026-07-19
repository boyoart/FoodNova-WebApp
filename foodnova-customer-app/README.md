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

Google Maps uses the exact variable `GOOGLE_MAPS_API_KEY`. The Android Gradle
build accepts a Gradle property, environment variable, or Dart define. The
recommended local commands are:

```bash
flutter run --dart-define=GOOGLE_MAPS_API_KEY=your_restricted_android_key
flutter build apk --release --dart-define=GOOGLE_MAPS_API_KEY=your_restricted_android_key
```

Combine the API and Maps values for a production Android APK with:

```bash
flutter build apk --release \
  --dart-define=FOODNOVA_API_BASE_URL=https://foodnova-webapp.onrender.com \
  --dart-define=GOOGLE_MAPS_API_KEY=your_restricted_android_key
```

For iOS, copy `ios/Flutter/Maps.xcconfig.example` to the git-ignored
`ios/Flutter/Maps.xcconfig`, set a restricted iOS key, and rebuild. Never commit
the populated file.

The app rejects non-HTTPS API base URLs. On Render, keep backend environment variables current and redeploy after updates. Optional backend CORS additions can be supplied as a comma-separated `CORS_ORIGINS` value.

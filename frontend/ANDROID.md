# FoodNova Android App (Capacitor)

FoodNova is configured as a Capacitor Android app shell.

## Biometric Login Plugins

The web/PWA build stays functional without native biometric packages. For Android biometric login, install and sync a Capacitor biometric plugin plus secure storage plugin before building the native app:

```bash
npm install @capgo/capacitor-native-biometric
npx cap sync android
```

The app uses `NativeBiometric` from `@capgo/capacitor-native-biometric` for fingerprint/face verification and Android Keystore-backed customer session storage. If the native plugin is missing, biometric controls show a clear unavailable message and normal email/phone login continues to work.

## App Details

- App name: FoodNova
- Package name: `ng.com.foodnova.app`
- Website: `https://foodnova.com.ng`
- Backend API: `https://foodnova-webapp.onrender.com`
- Web build output: `dist`

The frontend API client already falls back to `https://foodnova-webapp.onrender.com` when `VITE_API_BASE_URL` is not set, and it ignores `foodnova.com.ng` as an API base URL.

## Development Commands

Run these from the `frontend` directory:

```bash
npm install
npm run build
npx cap sync android
npx cap open android
```

If the Android platform is ever removed and needs to be recreated:

```bash
npx cap add android
npx cap sync android
```

## Android Notes

- Android package/application ID is `ng.com.foodnova.app`.
- `android/app/src/main/AndroidManifest.xml` includes `android.permission.INTERNET`.
- File upload inputs are handled by the Android WebView/Capacitor shell for avatar, product, pack, and receipt uploads.
- WhatsApp, Instagram, TikTok, Cloudinary receipt/PDF links, and other external URLs are still regular web links from the FoodNova frontend.

## Icons and Splash

Capacitor generated default Android icon and splash assets. Replace them later with generated FoodNova-branded launcher and splash assets before Play Store release.

# Welcome to your Expo app 👋

FoodNova's Expo / React Native rider application.

## Environment

Copy `.env.example` to `.env` and provide a platform-restricted Maps key:

```text
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_restricted_maps_key
```

The checked-in Android project reads the same variable directly, so a clean
CMD build does not require another Expo prebuild. In CMD, set it for the current
shell before invoking Gradle:

```bat
set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_restricted_maps_key
```

For store signing, create the git-ignored `android/key.properties` with
`storeFile`, `storePassword`, `keyAlias`, and `keyPassword`. Without it, Gradle
uses Android's standard debug signing so both debug and locally installable
release APK commands still complete from a clean checkout.

Expo injects this value into Android and iOS native Maps configuration during
prebuild. A populated `.env` is ignored and must never be committed.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

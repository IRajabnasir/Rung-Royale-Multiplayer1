# Mobile Build Guide — Rung Royale

This app is a Capacitor-wrapped build of the same web codebase.
You need macOS with Xcode for iOS; Android Studio for Android.

## One-time setup

```bash
npm install
npx cap add ios
npx cap add android
```

## Build + run (iOS)

```bash
npm run build          # produces dist/
npx cap copy ios       # copies dist/ into iOS project
npx cap open ios       # opens Xcode; run on simulator or device
```

## Build + run (Android)

```bash
npm run build
npx cap copy android
npx cap open android   # opens Android Studio
```

## After every code change

```bash
npm run build && npx cap copy
```

## Firebase Google Sign-In on native

1. Firebase Console → Project Settings → Your apps → Add app (iOS and Android).
2. iOS: download `GoogleService-Info.plist` → drop into `ios/App/App/`.
3. Android: download `google-services.json` → drop into `android/app/`.
4. Add SHA-1 + SHA-256 of your Android signing keys in Firebase Console →
   Project Settings → Your apps → Android app → Add fingerprint.
5. In `ios/App/App/Info.plist` add the reversed client ID from
   `GoogleService-Info.plist` as a URL scheme (CFBundleURLSchemes).

## App icons + splash

```bash
# Place your 1024x1024 icon at: resources/icon.png
# Place your 2732x2732 splash at: resources/splash.png
npm install -g @capacitor/assets
npx capacitor-assets generate
```

## Orientation

- Phones: portrait only
- iPad: portrait + landscape

Orientation is locked in:
- iOS: `ios/App/App/Info.plist` (UISupportedInterfaceOrientations)
- Android: `android/app/src/main/AndroidManifest.xml` (android:screenOrientation)

## Submitting to stores

- Apple: need Apple Developer Program ($99/yr). Use Xcode → Archive → upload.
- Google: need Play Console ($25 one-time). Use Android Studio → Build → Generate Signed Bundle.

# Voxa build guide

How to build, install and run Voxa yourself, on Android and iOS.
Written for this Windows PC. Every command below was run on it unless it says **not yet tested here**.

---

## Contents

1. [What you can build](#1-what-you-can-build)
2. [One-time PC setup](#2-one-time-pc-setup)
3. [Get the project ready](#3-get-the-project-ready)
4. [Quick start: the build script](#4-quick-start-the-build-script)
5. [Android debug build (phones and emulator)](#5-android-debug-build-phones-and-emulator)
6. [Android build for real phones only (emulator excluded)](#6-android-build-for-real-phones-only-emulator-excluded)
7. [Install on a phone and run the dev server](#7-install-on-a-phone-and-run-the-dev-server)
8. [Release APK for testers](#8-release-apk-for-testers)
9. [Google Play build (AAB)](#9-google-play-build-aab)
10. [iOS builds (EAS cloud)](#10-ios-builds-eas-cloud)
11. [Android in the cloud (EAS)](#11-android-in-the-cloud-eas)
12. [When to regenerate the native project](#12-when-to-regenerate-the-native-project)
13. [App icons](#13-app-icons)
14. [Checks before you build](#14-checks-before-you-build)
15. [Troubleshooting](#15-troubleshooting)
16. [Reference](#16-reference)

---

## 1. What you can build

| Build | What it is | Where | Needs the dev server? |
|---|---|---|---|
| **Debug (phones only, the default)** | Dev client for real phones, no emulator code | This PC | Yes (`npm start`) |
| **Debug with emulator** | Same plus x86_64, only if you need the emulator | This PC | Yes |
| **Release APK** | JavaScript built in, runs on its own. For testers | This PC | No |
| **Play Store AAB** | Signed bundle for Google Play | EAS cloud (recommended) | No |
| **iOS dev / simulator / TestFlight** | iPhone builds | EAS cloud only (Windows can't build iOS) | Dev: yes |

A **dev client** is your own version of Expo Go: it has Voxa's native code inside and loads the JavaScript from your PC, so code changes show up on the phone in about a second.

---

## 2. One-time PC setup

Already done on this PC. Repeat these steps on any new machine.

### 2.1 Install

| Tool | Version used here | Notes |
|---|---|---|
| Node.js | 24.x | <https://nodejs.org> |
| Git | 2.5x | |
| Android Studio | current | Gives you the SDK Manager |
| JDK | **25** (`C:\Program Files\Java\jdk-25`) | React Native recommends JDK 17; 25 works with this project's Gradle 9.4.1 |
| Expo account + EAS CLI | eas-cli 27.x | Only needed for cloud and iOS builds: `npm i -g eas-cli`, then `eas login` |

### 2.2 Android SDK packages

Android Studio → **Settings → Languages & Frameworks → Android SDK**.

- **SDK Platforms:** Android 16 (API 36) or newer.
- **SDK Tools** (tick **Show Package Details** at the bottom right):
  - Android SDK Build-Tools **36.1.0**
  - Android SDK Platform-Tools
  - NDK (Side by side) **27.1.12297006**
  - **CMake 4.1.2** (or any 3.31+). This is required. The older CMake 3.22.1 comes with ninja 1.10, which can't create the very long folder paths React Native uses on Windows (see [Troubleshooting](#15-troubleshooting)).

SDK location on this PC: `C:\Users\Yusuff\AppData\Local\Android\Sdk`

### 2.3 Fix the global Gradle setting (recommended)

`C:\Users\Yusuff\.gradle\gradle.properties` contains:

```
org.gradle.java.home=C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.19.10-hotspot
```

That JDK has been uninstalled, so every Android project on this PC fails with *"Java home supplied is invalid"*. Change it to a JDK that exists:

```
org.gradle.java.home=C:\\Program Files\\Java\\jdk-25
```

Or delete the line. The build script in this project overrides it either way, so you only need this for other projects or for running Gradle by hand.

### 2.4 Phone setup (once per phone)

1. **Settings → About phone →** tap **Build number** (on Xiaomi, **MIUI/OS version**) 7 times.
2. **Settings → Additional settings → Developer options →** turn on **USB debugging**.
3. Xiaomi / Redmi / POCO only: also turn on **Install via USB**, otherwise `adb install` is refused.
4. Connect by USB and tap **Allow** on the phone's "Allow USB debugging?" prompt.

Check it's connected:

```bash
adb devices
```

Run that from `C:\Users\Yusuff\AppData\Local\Android\Sdk\platform-tools`, or add that folder to your PATH. You should see a line ending in `device`. Ending in `unauthorized` means you haven't accepted the prompt on the phone yet.

---

## 3. Get the project ready

Open a terminal in the project folder:

```bash
cd C:\Yusuff\voxa\voxa
```

Install packages. Do this after cloning, after deleting `node_modules`, or after `package.json` changes:

```bash
npm ci
```

The project's `.npmrc` contains `legacy-peer-deps=true`. Keep it: without it, npm refuses to install because of a React version mismatch between Expo's packages. When adding a package, always use `npx expo install <name>` so you get the version that matches this Expo SDK.

### 3.1 Get the on-device engine files (Android)

The on-device voice and listening engine (`modules/voxa-engine`) needs the sherpa-onnx library and three models, about 210 MB to download. They are not in Git. Fetch them once after cloning:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\fetch-engine.ps1
```

The script downloads into `.engine-cache\` and copies only what the app needs into the module: the phone ABIs (`arm64-v8a`, `armeabi-v7a`), the int8 speech model, the Kitten voice and its English lexicon (`lexicon-en-us.txt`, about 168,000 words). Run it again with `-Force` to download fresh copies. After fetching for the first time, build with `-Prebuild` so the module is linked into the app.

Without these files the Android build stops with "modules/voxa-engine is missing sherpa-onnx". iOS builds don't use the module yet and fall back to the mock engines.

> sherpa-onnx 2.x no longer uses espeak-ng (GPL-3.0). The Kitten voice looks words up in the lexicon instead, so words missing from it (many names) are not spoken yet.

---

## 4. Quick start: the build script

`scripts/build-android.ps1` does everything in one go: it checks the tools, writes `android/local.properties`, picks CMake 3.31+, sets the JDK, builds, and can install.

Run it from PowerShell in the project folder:

| Goal | Command |
|---|---|
| Debug APK for real phones (the default) | `.\scripts\build-android.ps1` |
| Build and install on the USB phone | `.\scripts\build-android.ps1 -Install` |
| After changing `app.json`, icons or native packages | `.\scripts\build-android.ps1 -Prebuild` |
| Release APK (no dev server needed) | `.\scripts\build-android.ps1 -Release` |
| Also include the emulator (x86_64) | `.\scripts\build-android.ps1 -WithEmulator` |
| Start from a clean slate | add `-Clean` |

If PowerShell says *"running scripts is disabled on this system"*, run it this way for that one command (this doesn't change any system setting):

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\build-android.ps1
```

Other options: `-Sdk <path>`, `-Jdk <path>`, `-CMakeVersion 4.1.2`.

The rest of this guide explains what the script does, so you can run each step by hand or fix things when they break.

---

## 5. Android debug build (phones and emulator)

### 5.1 Generate the native project (only when needed)

The `android/` folder is generated from `app.json` and the installed packages. It's ignored by Git. Create or refresh it with:

```bash
npx expo prebuild --platform android --no-install
```

See [section 12](#12-when-to-regenerate-the-native-project) for when to re-run it.

### 5.2 Write `android/local.properties`

**`expo prebuild` deletes this file, so recreate it after every prebuild.** It tells Gradle where the SDK and the new CMake are. Use forward slashes and `C\:`, because plain backslashes break it.

PowerShell:

```powershell
@"
sdk.dir=C\:/Users/Yusuff/AppData/Local/Android/Sdk
cmake.dir=C\:/Users/Yusuff/AppData/Local/Android/Sdk/cmake/4.1.2
"@ | Set-Content -Encoding ascii android\local.properties
```

### 5.3 Build

PowerShell:

```powershell
cd android
$env:JAVA_HOME = "C:\Program Files\Java\jdk-25"
.\gradlew.bat assembleDebug "-Dorg.gradle.java.home=C:\Program Files\Java\jdk-25"
cd ..
```

Git Bash:

```bash
cd android && JAVA_HOME="/c/Program Files/Java/jdk-25" ./gradlew assembleDebug "-Dorg.gradle.java.home=C:\\Program Files\\Java\\jdk-25"; cd ..
```

Output: `android\app\build\outputs\apk\debug\app-debug.apk`

| | Time on this PC | APK size |
|---|---|---|
| First build (everything compiled from scratch) | ~29 min | ~195 MB |
| Later builds (only changed parts) | a few minutes | ~195 MB |

These numbers include the emulator code. Since 20 Nov 2026 builds leave it out by default, so expect ~124 MB ([section 6](#6-android-build-for-real-phones-only-emulator-excluded)).

It's large because a debug build carries unoptimised native code for three architectures (`arm64-v8a`, `armeabi-v7a`, `x86_64`). Release builds and Play Store downloads are much smaller.

---

## 6. Android build for real phones only (emulator excluded)

**This is the project default since 20 Nov 2026:** every build skips the emulator. `app.json` lists only `arm64-v8a` and `armeabi-v7a`, and the script needs `-WithEmulator` to add `x86_64`.

Real Android phones use ARM chips. The emulator on a PC uses `x86_64`. If you test only on real phones, leave out `x86_64`: the APK gets smaller and the C++ build takes about a third less time.

| Architecture | Used by | Keep? |
|---|---|---|
| `arm64-v8a` | Almost all phones from 2017 on (your Redmi Note 13) | **Yes** |
| `armeabi-v7a` | Older and low-cost 32-bit phones, common in Voxa's 2 GB target market | **Yes** |
| `x86_64` | Android emulator on a PC, a few Chromebooks | No (excluded) |

### 6.1 One build only (nothing saved)

With the script (phone-only is the default):

```powershell
.\scripts\build-android.ps1
```

By hand, add the property to the Gradle command from 5.3:

```powershell
cd android
$env:JAVA_HOME = "C:\Program Files\Java\jdk-25"
.\gradlew.bat assembleDebug -PreactNativeArchitectures=arm64-v8a,armeabi-v7a "-Dorg.gradle.java.home=C:\Program Files\Java\jdk-25"
cd ..
```

### 6.2 How the default is set

`app.json` → the `expo-build-properties` plugin lists only the two phone architectures:

```json
["expo-build-properties", {
  "android": {
    "minSdkVersion": 26,
    "buildArchs": ["arm64-v8a", "armeabi-v7a"]
  }
}]
```

Then regenerate the native project so it takes effect: `.\scripts\build-android.ps1 -Prebuild` (this writes `reactNativeArchitectures=arm64-v8a,armeabi-v7a` into `android\gradle.properties`).

To use the emulator for one build, run `.\scripts\build-android.ps1 -WithEmulator`. To make it permanent again, add `"x86_64"` back to `buildArchs` and run with `-Prebuild`.

### 6.3 Results on this PC

Tested on 20 Nov 2026 (phone-only build):

| | All architectures | Phones only |
|---|---|---|
| Native code in the APK | `arm64-v8a`, `armeabi-v7a`, `x86_64` | `arm64-v8a`, `armeabi-v7a` |
| Debug APK size | ~195 MB | **~124 MB** |
| Build time | ~29 min (first build) | **1 min 13 s** (after the first build, reusing its cache) |
| Runs on the emulator | Yes | No |
| Runs on real phones | Yes | Yes |

---

## 7. Install on a phone and run the dev server

### 7.1 Install the APK

```bash
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
```

Or build and install in one step: `.\scripts\build-android.ps1 -Install`.
`-r` keeps the app's data when updating. If the install says the signatures don't match, uninstall first: `adb uninstall app.voxa`.

You can also copy the APK to the phone (WhatsApp, Google Drive, a cable) and tap it. Android will ask you to allow installs from that app.

### 7.2 Start the dev server

```bash
npm start
```

This runs `expo start --dev-client`. Leave it running. Live reload is on, so saving a file updates the phone.

### 7.3 Connect the phone

**Over USB (most reliable):**

```bash
adb reverse tcp:8081 tcp:8081
```

Then open Voxa on the phone. It finds `localhost:8081`. Re-run `adb reverse` after you unplug the cable.

**Over Wi-Fi:** the phone and PC must be on the same network. Open Voxa, and either scan the QR code shown by `npm start` or type the URL it prints (for example `http://192.168.1.20:8081`). If it can't connect, allow Node.js through Windows Firewall on private networks.

### 7.4 Handy keys in the `npm start` terminal

`r` reload · `m` dev menu on the phone · `j` debugger · `Ctrl+C` stop. You can also shake the phone to open the dev menu.

---

## 8. Release APK for testers

A release APK has the JavaScript built in, so it runs without your PC. Use it to hand Voxa to testers.

```powershell
.\scripts\build-android.ps1 -Release
```

Output: `android\app\build\outputs\apk\release\app-release.apk`

> **Signing:** the generated project signs release builds with the **debug key** (`android/app/debug.keystore`). That's fine for testers, but Google Play won't accept it. For the store, use [section 9](#9-google-play-build-aab).
>
> **Not yet tested here.** The debug build was tested; the release build hasn't been run on this PC yet.

---

## 9. Google Play build (AAB)

Google Play needs an **Android App Bundle (`.aab`)** signed with your own upload key. Play then serves each phone only its own architecture, so downloads are small.

### 9.1 Recommended: EAS (manages the key for you)

```bash
eas init
eas build -p android --profile production
```

- `eas init` (first time only) creates the Voxa project on your Expo account and adds its ID to `app.json`.
- On the first production build, EAS offers to **generate a keystore**. Say yes. It stores the key safely, and you can download a backup with `eas credentials`.
- The `production` profile in `eas.json` builds an AAB and raises the version code automatically.
- Upload it to Play Console yourself, or run `eas submit -p android` (needs a Google service-account key).

**Not yet tested here.** This uses your Expo account's build minutes. See <https://expo.dev/pricing>.

### 9.2 Local alternative (you look after the key)

1. Create an upload key **once** and back it up somewhere safe. If you lose it, you can't update the app.
   ```bash
   keytool -genkeypair -v -storetype PKCS12 -keystore voxa-upload.keystore -alias voxa-upload -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Keep the keystore and its passwords **out of the project folder and out of Git**.
3. Point `android/app/build.gradle`'s `signingConfigs.release` at it, then run `.\gradlew.bat bundleRelease`.

`expo prebuild` overwrites `android/app/build.gradle`, so step 3 has to be redone after every prebuild (or done with a config plugin). That's why EAS is the recommended route.

---

## 10. iOS builds (EAS cloud)

Windows can't build iOS apps, because that needs Xcode on a Mac. EAS builds them on Expo's Macs.

| Goal | Command | Needs |
|---|---|---|
| iOS Simulator build (to run on a Mac) | `npm run build:ios:sim` | Expo account |
| Dev client on a real iPhone | `eas device:create` (once per iPhone), then `npm run build:ios:dev` | Apple Developer account ($99/year) |
| TestFlight | `eas build -p ios --profile production --submit` | Apple Developer account |

- `eas device:create` gives you a link: open it on the iPhone to register it.
- When the build finishes, EAS shows a QR code or link. Open it on the iPhone to install.
- Then run `npm start` on the PC and open Voxa on the iPhone (same Wi-Fi).
- EAS asks for your Apple ID on the first iOS build and creates the certificates for you.

**Not yet tested here.**

---

## 11. Android in the cloud (EAS)

If the local build gives you trouble, build in the cloud. It runs on Linux, so the Windows path problems in [section 15](#15-troubleshooting) don't apply.

```bash
npm run build:android:dev
```

This runs `eas build -p android --profile development`. When it finishes, you get a link and QR code to download the APK. Uses build minutes. **Not yet tested here.**

---

## 12. When to regenerate the native project

Run `.\scripts\build-android.ps1 -Prebuild` (or `npx expo prebuild --platform android --no-install`, then section 5.2) after you:

- change `app.json`: name, package, permissions, plugins, splash, `buildArchs`, `minSdkVersion`;
- change app icons or the splash image;
- add or remove a package with native code (most `expo-*` and `react-native-*` packages);
- upgrade the Expo SDK.

You **don't** need it, or even a new APK, for changes to `src/` (screens, components, logic). Those load from the dev server.

You do need a **new APK** after any prebuild, or when a native package changes.

Avoid `--clean`: it deletes the whole `android/` folder, so the next build compiles everything from scratch (~30 min).

---

## 13. App icons

All icons are drawn by `scripts/make-icons.py` (Python with Pillow) into `assets/`:

```bash
python scripts/make-icons.py
```

| File | Used for | Store rule it follows |
|---|---|---|
| `icon.png` (1024, opaque) | iOS app icon (light) | Square, no transparency, iOS rounds the corners |
| `icon-dark.png` | iOS 18 dark icon | Transparent background |
| `icon-tinted.png` | iOS 18 tinted icon | Grayscale on transparent |
| `android-icon-foreground.png` / `-background.png` | Android adaptive icon (Android 8+) | Mark inside the 66dp safe circle of 108dp |
| `android-icon-monochrome.png` | Android 13+ themed icons | Single colour on transparent |
| `play-store-icon.png` (512) | Google Play listing (upload it in Play Console) | Square, no rounded corners or shadow |
| `splash-icon.png`, `favicon.png` | Splash screen, web | |

After changing icons, regenerate the native project ([section 12](#12-when-to-regenerate-the-native-project)) and build a new APK. A preview of every variant is in `docs/icon-preview.png`.

---

## 14. Checks before you build

```bash
npm run lint
npm run typecheck
npm test
```

All three should pass: ESLint with no errors, TypeScript with no errors, and all Jest tests green. CI (`.github/workflows/ci.yml`) runs the same three checks plus the bundle check below on every pull request and every push to `master`, once the project is on GitHub. To make sure the JavaScript bundles for both platforms without a native build (takes about 1 minute):

```bash
npx expo export --platform android --platform ios --output-dir dist-check
```

Delete `dist-check` afterwards.

---

## 15. Troubleshooting

Every error below happened on this PC while setting up Voxa.

| Error | Cause | Fix |
|---|---|---|
| `Value '...jdk-17.0.19.10-hotspot' given for org.gradle.java.home ... is invalid` | The global `~/.gradle/gradle.properties` points to a removed JDK | [Section 2.3](#23-fix-the-global-gradle-setting-recommended), or pass `-Dorg.gradle.java.home=...` (the script does this) |
| `java.io.IOException: The filename, directory name, or volume label syntax is incorrect` (at `SdkLocator`) | `local.properties` was written with plain backslashes | Use `C\:/Users/...` with forward slashes ([section 5.2](#52-write-androidlocalproperties)) |
| `SDK location not found` | `local.properties` is missing (prebuild deleted it) | [Section 5.2](#52-write-androidlocalproperties), or run the script |
| `ninja: error: mkdir(...react_codegen_rnreanimated...): No such file or directory` at `:app:buildCMakeDebug` | CMake 3.22.1's ninja 1.10 can't handle Windows paths over 260 characters | Install CMake 3.31+/4.x and set `cmake.dir` ([2.2](#22-android-sdk-packages), [5.2](#52-write-androidlocalproperties)). A `subst` drive letter does **not** help, because autolinking resolves the real path |
| Paths still show the old folder after moving the project | Gradle and CMake caches keep the old absolute paths | Delete `android\build`, `android\app\build`, `android\app\.cxx` and rebuild |
| `npm ERR! ERESOLVE` | Peer version mismatch | Keep `.npmrc` with `legacy-peer-deps=true` |
| `adb: device unauthorized` | You haven't accepted the USB prompt yet | Unlock the phone and tap Allow |
| `INSTALL_FAILED_USER_RESTRICTED` (Xiaomi) | "Install via USB" is off | Developer options → Install via USB |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | The installed app was signed with another key | `adb uninstall app.voxa`, then install again |
| App shows "Unable to load script" / dev-client launcher with no server | Dev server not running or not reachable | `npm start`, then `adb reverse tcp:8081 tcp:8081` (USB) or check same Wi-Fi |
| Code changes don't show | The server was started with `CI=1` (reload off) | Stop it and run plain `npm start` |

General reset, if a build fails strangely. This deletes only generated build output:

```powershell
Remove-Item -Recurse -Force android\build, android\app\build, android\app\.cxx -ErrorAction SilentlyContinue
.\scripts\build-android.ps1
```

---

## 16. Reference

| Item | Value |
|---|---|
| App ID (Android and iOS) | `app.voxa` |
| Minimum Android | 8.0 (API 26) |
| Target / compile SDK | 36 / 37 |
| Expo SDK / React Native | 58 / 0.88.1 |
| Gradle (wrapper) | 9.4.1 |
| JDK | 25 |
| CMake / ninja | 4.1.2 / 1.12.1 |
| NDK | 27.1.12297006 |
| Build-tools | 36.1.0 |
| Tested phone | Redmi Note 13 (23129RAA4G), Android 15, arm64-v8a |

| File | Purpose |
|---|---|
| `app.json` | App name, IDs, icons, permissions, plugins (`minSdkVersion`, `buildArchs`) |
| `eas.json` | Cloud build profiles: `development`, `development-simulator`, `preview`, `production` |
| `package.json` scripts | `start`, `typecheck`, `test`, `build:android:dev`, `build:ios:dev`, `build:ios:sim` |
| `scripts/build-android.ps1` | Local Android build script |
| `scripts/make-icons.py` | Icon generator |
| `android/` | Generated native project (not in Git) |

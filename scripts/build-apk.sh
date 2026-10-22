#!/usr/bin/env bash
# Builds the debug APK. Needs Node 18+, JDK 17 and the Android SDK (ANDROID_HOME).
# GitLab CI runs exactly this script, see .gitlab-ci.yml.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -n "${ANDROID_HOME:-}" ] || { echo "Set ANDROID_HOME to your Android SDK folder first."; exit 1; }
npm install --no-audit --no-fund
# V0.4.1: ship Capacitor's core runtime inside the app so Capacitor.isNativePlatform / registerPlugin always exist
if [ -f node_modules/@capacitor/core/dist/capacitor.js ]; then cp node_modules/@capacitor/core/dist/capacitor.js www/js/capacitor.js; echo "Bundled Capacitor core runtime"; else echo "Note: core runtime file not found, using built-in Android detection"; fi
[ -d android ] || npx cap add android
bash scripts/patch-android.sh
bash scripts/bundle-js.sh
npx cap sync android
printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties
# V0.36.0: install-over-the-top updates. Android only updates an app when the new APK has the SAME signing key and a HIGHER versionCode.
# A fresh CI build used a new random debug key each time, which is why you had to uninstall first. See scripts/make-keystore.sh.
bash scripts/sign-android.sh
(cd android && ./gradlew assembleDebug --no-daemon)
APK=android/app/build/outputs/apk/debug/app-debug.apk
SIGNED=android/app/build/outputs/apk/debug/conduint-files-signed.apk
cp "$APK" "$SIGNED"
APK="$SIGNED"
echo "APK ready: $APK"
# V0.46.2: print the signing fingerprint so you can tell whether two builds share a key (same fingerprint = installs over the top)
if command -v keytool >/dev/null 2>&1; then echo "Signing certificate:"; keytool -printcert -jarfile "$APK" 2>/dev/null | grep -E "Owner|SHA256" || echo "(could not read certificate)"; fi

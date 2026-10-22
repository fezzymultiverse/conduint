#!/usr/bin/env bash
# V0.36.0: makes every build update the installed app instead of asking you to uninstall.
#  - signs the APK with YOUR fixed key (CI variable CONDUINT_KEYSTORE_B64, plus CONDUINT_KEYSTORE_PASS), so the signature never changes
#  - sets versionCode from the version number and the pipeline number, so it always goes up
# Never commit the keystore (.gitignore already blocks *.keystore). Idempotent.
set -euo pipefail
cd "$(dirname "$0")/.."
G=android/app/build.gradle
[ -f "$G" ] || { echo "sign-android: $G not found, skipping"; exit 0; }
VER="$(node -p "require('./package.json').version")"
CODE="$(node -e "const [a,b,c]=process.argv[1].split('.').map(Number);console.log(((a*10000+b*100+c)*1000+((+process.env.CI_PIPELINE_IID||0)%1000)))" "$VER")"
VERSION="$VER" CODE="$CODE" node -e '
const fs=require("fs"),p=process.argv[1];let s=fs.readFileSync(p,"utf8");
s=s.replace(/versionCode\s+\d+/,"versionCode "+process.env.CODE).replace(/versionName\s+"[^"]*"/,"versionName \""+process.env.VERSION+"\"");
fs.writeFileSync(p,s)' "$G"
echo "versionCode $CODE, versionName $VER"
if [ -z "${CONDUINT_KEYSTORE_B64:-}" ]; then
  echo "WARNING: CONDUINT_KEYSTORE_B64 is not set. This APK gets a random debug key, so Android will refuse to update over an older one."
  echo "Run scripts/make-keystore.sh once and add the two printed values as GitLab CI/CD variables."
  # V0.46.2: in CI, stop here instead of quietly producing an APK that cannot be installed over the old app
  # ("App not installed as package conflicts with an existing package"). Set CONDUINT_ALLOW_RANDOM_KEY=1 to build anyway.
  if [ -n "${CI:-}" ] && [ "${CONDUINT_ALLOW_RANDOM_KEY:-}" != "1" ]; then
    echo "ERROR: build stopped. Add CONDUINT_KEYSTORE_B64 and CONDUINT_KEYSTORE_PASS under Settings > CI/CD > Variables of THIS project (variables are per project), or set CONDUINT_ALLOW_RANDOM_KEY=1 for a one-off build."
    exit 1
  fi
  exit 0
fi
printf '%s' "$CONDUINT_KEYSTORE_B64" | base64 -d > android/conduint.keystore
if ! grep -q "conduint-signing" "$G"; then
  PASS="${CONDUINT_KEYSTORE_PASS:?CONDUINT_KEYSTORE_PASS is not set}" node -e '
const fs=require("fs"),p=process.argv[1];let s=fs.readFileSync(p,"utf8");
const sc="    // conduint-signing\n    signingConfigs {\n        conduint {\n            storeFile file(\"../conduint.keystore\")\n            storePassword System.getenv(\"CONDUINT_KEYSTORE_PASS\")\n            keyAlias \"conduint\"\n            keyPassword System.getenv(\"CONDUINT_KEYSTORE_PASS\")\n        }\n    }\n";
s=s.replace(/android\s*\{/,m=>m+"\n"+sc);
if(/buildTypes\s*\{/.test(s))s=s.replace(/buildTypes\s*\{/,m=>m+"\n        debug { signingConfig signingConfigs.conduint }");
else s=s.replace(/android\s*\{/,m=>m+"\n    buildTypes { debug { signingConfig signingConfigs.conduint } }");
fs.writeFileSync(p,s)' "$G"
fi
echo "Signing with the fixed Conduint key"

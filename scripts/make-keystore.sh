#!/usr/bin/env bash
# V0.48.0: at the end it can send both values to your GitLab project for you (scripts/set-ci-vars.sh), so nothing is pasted by hand.
# V0.36.0: run this ONCE (needs keytool: Termux "pkg install openjdk-17"). It makes your permanent signing key and prints the two values
# to save as GitLab CI/CD variables (Settings > CI/CD > Variables): CONDUINT_KEYSTORE_B64 and CONDUINT_KEYSTORE_PASS (both Masked).
# Back the .keystore file up somewhere private. If you lose it, the next update needs one last uninstall. Never commit it.
set -euo pipefail
D="${TMPDIR:-/tmp}"; F="$D/conduint.keystore"
read -r -p "Choose a key password (8+ characters): " PASS
[ "${#PASS}" -ge 8 ] || { echo "Too short."; exit 1; }
rm -f "$F"
keytool -genkeypair -v -keystore "$F" -alias conduint -keyalg RSA -keysize 2048 -validity 36500 -storepass "$PASS" -keypass "$PASS" -dname "CN=Conduint, O=Fezzy, C=ZA"
echo; echo "Keystore saved at: $F (back it up, do not commit it)"
echo; echo "CONDUINT_KEYSTORE_PASS = $PASS"
echo; echo "CONDUINT_KEYSTORE_B64 ="; base64 -w0 "$F" 2>/dev/null || base64 "$F" | tr -d '\n'; echo
echo
read -r -p "Send both variables to a GitLab project now? Type the project (user/project) or press Enter to skip: " GP
if [ -n "$GP" ]; then CONDUINT_KEYSTORE_PASS="$PASS" bash "$(dirname "$0")/set-ci-vars.sh" "$GP" "$F"; fi

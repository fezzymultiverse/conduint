#!/usr/bin/env bash
# V0.50.9: static checks for the Festers passkey bridge. Run from the repo root: bash tests/v0509.sh
set -u
cd "$(dirname "$0")/.."
fail=0
ok()  { echo "PASS $1"; }
bad() { echo "FAIL $1"; fail=1; }
J=native/FestersBridgeActivity.java
[ -f "$J" ] && ok "FestersBridgeActivity.java exists" || bad "missing $J"
grep -q 'getCallingPackage()' "$J" && ok "caller is read from Android (getCallingPackage)" || bad "no getCallingPackage"
grep -q 'FESTERS_PKG.equals(pkg)' "$J" && ok "only Festers' package accepted" || bad "package check"
grep -q 'GET_SIGNING_CERTIFICATES' "$J" && grep -q 'fromList.contains' "$J" && grep -q 'h.equals(pinned)' "$J" && ok "signing certificate compared with built-in list or pinned value" || bad "cert check"
grep -q 'putString(PIN_KEY' "$J" && grep -q 'Gate.ask(this, "Trust the Festers' "$J" && ok "first use asks once, then pins" || bad "first-use pin"
grep -q 'http://" *) *&&\|startsWith("http://")' "$J" && ok "plain http refused except localhost" || bad "http rule"
grep -q 'PasskeyActivity.rpOk' "$J" && ok "rp id must belong to the origin" || bad "rpOk"
grep -q 'static boolean rpOk' native/PasskeyActivity.java && grep -q 'static String hostOf' native/PasskeyActivity.java && ok "helpers shared (package-private)" || bad "helpers private"
grep -q 'FestersBridgeActivity' scripts/patch-android.sh && ok "patch-android.sh copies and registers it" || bad "patch-android.sh"
grep -q 'conduint-v50-9' scripts/patch-android.sh && ok "manifest block guarded (idempotent)" || bad "manifest guard"
bash -n scripts/patch-android.sh && ok "patch-android.sh passes bash -n" || bad "bash -n"
# the manifest block must produce valid XML: run its node snippet on a sample manifest
T="$(mktemp -d "${TMPDIR:-/tmp}/v0509.XXXXXX")"; trap 'rm -rf "$T"' EXIT
printf '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n<application>\n</application>\n</manifest>\n' > "$T/AndroidManifest.xml"
sed -n '/^if ! grep -q "conduint-v50-9"/,/^fi$/p' scripts/patch-android.sh > "$T/blk.sh"
M="$T/AndroidManifest.xml" APP=com.fezzy.conduint bash "$T/blk.sh" >/dev/null 2>&1
grep -q 'com.fezzy.conduint.FestersBridgeActivity' "$T/AndroidManifest.xml" && grep -q 'android:exported="true"' "$T/AndroidManifest.xml" && ok "manifest gets the activity" || bad "manifest patch result"
M="$T/AndroidManifest.xml" APP=com.fezzy.conduint bash "$T/blk.sh" >/dev/null 2>&1
[ "$(grep -c 'FestersBridgeActivity' "$T/AndroidManifest.xml")" = 1 ] && ok "second run adds nothing" || bad "not idempotent"
command -v javac >/dev/null 2>&1 && { javac -proc:none -d "$T" "$J" 2>&1 | grep -E 'error: (illegal|class, interface|reached end|unclosed|not a statement|.*expected)' | grep -q . && bad "Java syntax error" || ok "Java parses (symbol errors ignored, no Android SDK here)"; }
[ $fail -eq 0 ] && echo "ALL PASS" || { echo "SOME FAILED"; exit 1; }

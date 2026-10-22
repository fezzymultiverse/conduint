#!/usr/bin/env bash
# V0.50.2: tests for scripts/trust-browser.js (adds Festers to the trusted-browser list). Run from the repo root: bash tests/v0502.sh
set -u
cd "$(dirname "$0")/.."
T="$(mktemp -d "${TMPDIR:-/tmp}/v0502.XXXXXX")"
trap 'rm -rf "$T"' EXIT
L="$T/list.json"
PKG=com.fezzy.festersbrowser
SHA=0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF
COL=01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF
fail=0
ok()  { echo "PASS $1"; }
bad() { echo "FAIL $1"; fail=1; }
fresh() { cp native/assets/cnd_privileged_apps.json "$L"; }
count() { node -e 'const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const a=d.apps.filter(x=>x.info.package_name===process.argv[2]);console.log(a.length+" "+(a[0]?a[0].info.signatures.length:0)+" "+d.apps.length)' "$L" "$PKG"; }

fresh; before=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).apps.length)' "$L")
node scripts/trust-browser.js "$L" "$PKG" "$SHA" >/dev/null && [ "$(count)" = "1 1 $((before+1))" ] && ok "adds Festers once with one fingerprint" || bad "adds Festers: $(count)"
grep -q "$COL" "$L" && ok "fingerprint stored with colons, upper case" || bad "colon format"
node scripts/trust-browser.js "$L" "$PKG" "$COL" >/dev/null && [ "$(count)" = "1 1 $((before+1))" ] && ok "second run (colon form, same value) changes nothing" || bad "idempotent: $(count)"
node scripts/trust-browser.js "$L" "$PKG" "$(echo "$SHA" | tr A-F a-f),FEDCBA9876543210FEDCBA9876543210FEDCBA9876543210FEDCBA9876543210" >/dev/null && [ "$(count)" = "1 2 $((before+1))" ] && ok "second fingerprint added, lower case and comma list accepted" || bad "multi: $(count)"
fresh; cp "$L" "$T/orig.json"
for badsha in "ABC" "ZZ23456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF" ""; do
  node scripts/trust-browser.js "$L" "$PKG" "$badsha" >/dev/null 2>&1; rc=$?
  [ $rc -ne 0 ] && cmp -s "$L" "$T/orig.json" && ok "bad fingerprint '${badsha:0:6}' rejected, file untouched" || bad "bad fingerprint '${badsha:0:6}' (rc=$rc)"
done
node scripts/trust-browser.js "$L" "not a package" "$SHA" >/dev/null 2>&1; [ $? -ne 0 ] && cmp -s "$L" "$T/orig.json" && ok "bad package name rejected" || bad "bad package"
echo '{"nope":1}' > "$T/x.json"; node scripts/trust-browser.js "$T/x.json" "$PKG" "$SHA" >/dev/null 2>&1; [ $? -ne 0 ] && ok "list without apps rejected" || bad "no apps"
node scripts/trust-browser.js "$T/missing.json" "$PKG" "$SHA" >/dev/null 2>&1; [ $? -ne 0 ] && ok "missing file rejected" || bad "missing file"
fresh; node scripts/trust-browser.js "$L" "$PKG" "$SHA" >/dev/null; node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$L" && ok "result is valid JSON" || bad "invalid JSON"
node -e 'const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const o=JSON.parse(require("fs").readFileSync(process.argv[2],"utf8"));process.exit(o.apps.every((a,i)=>JSON.stringify(a)===JSON.stringify(d.apps[i]))?0:1)' "$L" native/assets/cnd_privileged_apps.json && ok "the 13 existing browsers are unchanged" || bad "existing entries changed"
bash -n scripts/patch-android.sh && ok "patch-android.sh passes bash -n" || bad "patch-android.sh syntax"
[ $fail -eq 0 ] && echo "ALL PASS" || { echo "SOME FAILED"; exit 1; }

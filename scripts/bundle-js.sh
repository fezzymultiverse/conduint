#!/usr/bin/env bash
# V0.51.1: optional JS bundling + minification, so the shipped APK doesn't parse/compile 63 separate
# unminified files on every cold start. Concatenates every www/js/*.js tag in index.html's own order,
# minifies with terser, and swaps the 63 <script> tags for one <script src="js/bundle.min.js">.
# Opt-in (CONDUINT_MINIFY=1): runs only against the CI build's working copy, never the committed
# www/index.html in git, so `npm install && npx cap open android` for local dev is unaffected.
set -euo pipefail
cd "$(dirname "$0")/.."
[ "${CONDUINT_MINIFY:-0}" = "1" ] || { echo "CONDUINT_MINIFY not set to 1, skipping JS bundling"; exit 0; }
command -v npx >/dev/null 2>&1 || { echo "ERROR: npx not found, cannot bundle"; exit 1; }

IDX=www/index.html
[ -f "$IDX" ] || { echo "ERROR: $IDX not found"; exit 1; }
grep -q 'js/bundle.min.js' "$IDX" && { echo "Already bundled, skipping"; exit 0; }

# Pull the script filenames in the exact order index.html loads them (order matters: many files
# rely on globals an earlier file defined).
FILES=$(grep -o 'src="js/[a-zA-Z0-9_.-]*\.js"' "$IDX" | sed 's/src="js\///;s/"$//')
[ -n "$FILES" ] || { echo "ERROR: no js/*.js script tags found in $IDX"; exit 1; }

COUNT=$(echo "$FILES" | wc -l)
echo "Bundling $COUNT files..."
SRC="${RUNNER_TEMP:-/tmp}/conduint-bundle-src.js"
: > "$SRC"
for f in $FILES; do
  [ -f "www/js/$f" ] || { echo "ERROR: www/js/$f listed in $IDX but missing on disk"; exit 1; }
  { echo "/* ---- $f ---- */"; cat "www/js/$f"; echo ";"; } >> "$SRC"
done

npm install --no-save --no-audit --no-fund terser@5
npx terser "$SRC" -c -m --comments false -o www/js/bundle.min.js
# Same safety check the check-js CI stage already runs on every source file: fail the build instead
# of shipping a broken bundle.
node --check www/js/bundle.min.js
echo "Bundle size: $(wc -c < www/js/bundle.min.js) bytes (source was $(wc -c < "$SRC") bytes, $COUNT files)"

# Replace the whole run of individual <script src="js/...js"> tags with the one bundle tag, in place.
python3 - "$IDX" <<'PYCODE'
import re, sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
pattern = re.compile(r'(?:[ \t]*<script src="js/[a-zA-Z0-9_.-]+\.js"></script>[ \t]*\r?\n)+')
m = pattern.search(s)
if not m:
    raise SystemExit("Could not find the block of js/*.js script tags to replace in " + p)
s = s[:m.start()] + '<script src="js/bundle.min.js"></script>\n' + s[m.end():]
open(p, "w", encoding="utf-8").write(s)
print(p + " now loads the single bundle instead of per-file script tags")
PYCODE

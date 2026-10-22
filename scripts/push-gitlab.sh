#!/usr/bin/env bash
# Push this project to GitLab over SSH and OVERWRITE what is already in the repo (force push).
# No tokens needed, only your SSH key added under GitLab > Preferences > SSH Keys.
# Usage: bash scripts/push-gitlab.sh            (asks questions)
#        bash scripts/push-gitlab.sh USER REPO  (no questions except the YES confirmation)
set -euo pipefail
cd "$(dirname "$0")/.."
U="${1:-}"; R="${2:-}"
[ -n "$U" ] || read -r -p "GitLab username or group: " U
[ -n "$R" ] || read -r -p "Project name (Enter for conduint-files): " R
R=${R:-conduint-files}
[ -n "$U" ] || { echo "A GitLab username is required."; exit 1; }
URL="git@gitlab.com:${U}/${R}.git"
VER=$(grep -o "VER='V[0-9.]*'" www/js/core.js 2>/dev/null | grep -o "[0-9][0-9.]*" || node -p "require('./package.json').version" 2>/dev/null || echo "0")

echo "This will REPLACE everything on the main branch of: $URL"
echo "Old commits on main are overwritten by this project's history."
read -r -p "Type YES to continue: " OK
[ "$OK" = "YES" ] || { echo "Cancelled. Nothing was pushed."; exit 1; }

# checks first, so a broken file never reaches the pipeline
for f in www/js/*.js; do node --check "$f"; done
bash -n scripts/build-apk.sh && bash -n scripts/patch-android.sh && bash -n scripts/set-ci-vars.sh && bash -n scripts/make-keystore.sh

[ -d .git ] || git init -b main
git checkout -B main >/dev/null 2>&1 || true
git add -A
git diff --cached --quiet || git commit -m "feat: Conduint Files V${VER} (tools, permissions, recycle bin)"
if git remote get-url origin >/dev/null 2>&1; then git remote set-url origin "$URL"; else git remote add origin "$URL"; fi
git push --force -u origin main
git tag -f "V${VER}" >/dev/null && git push --force origin "V${VER}" || true
echo "Pushed to $URL"
echo "Signing check (variables are per project): bash scripts/set-ci-vars.sh --check ${U}/${R}"
echo "Open the project on GitLab > Build > Pipelines. The apk-debug job makes app-debug.apk (artifacts, Download)."

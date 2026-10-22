#!/usr/bin/env bash
# V0.48.0: puts the signing-key variables on a GitLab project through the API, so you never paste the long base64 by hand.
# GitLab CI/CD variables belong to ONE project: a new or renamed project has none, which is why the build stops with "CONDUINT_KEYSTORE_B64 is not set".
# Sets CONDUINT_KEYSTORE_B64 (the keystore, base64) and CONDUINT_KEYSTORE_PASS, both Masked, not Protected, so every branch and tag can sign.
# Needs: curl, base64. A GitLab access token with the "api" scope (GitLab > Preferences > Access tokens). The token and values are never printed.
# Usage:  bash scripts/set-ci-vars.sh [user/project] [keystore-file]
#         bash scripts/set-ci-vars.sh --check [user/project]     (only lists which variables exist, changes nothing)
# Env:    GITLAB_TOKEN, GITLAB_HOST (default gitlab.com), CONDUINT_KEYSTORE_PASS (else asked)
set -euo pipefail
cd "$(dirname "$0")/.."
CHECK=0; [ "${1:-}" = "--check" ] && { CHECK=1; shift; }
P="${1:-}"; KS="${2:-${TMPDIR:-/tmp}/conduint.keystore}"; HOST="${GITLAB_HOST:-gitlab.com}"
command -v curl >/dev/null 2>&1 || { echo "curl is required."; exit 1; }
[ -n "$P" ] || read -r -p "GitLab project (user/project, e.g. grantboy.festers089/conduint-files): " P
[ -n "$P" ] || { echo "A project path is required."; exit 1; }
TOK="${GITLAB_TOKEN:-}"
if [ -z "$TOK" ]; then
  printf 'GitLab access token (api scope, hidden): '
  stty -echo 2>/dev/null || true
  read -r TOK || true
  stty echo 2>/dev/null || true
  echo
fi
[ -n "$TOK" ] || { echo "A token is required."; exit 1; }
ENC="$(printf '%s' "$P" | sed -e 's#/#%2F#g' -e 's#\.#%2E#g')"
API="https://${HOST}/api/v4/projects/${ENC}/variables"
auth=(-H "PRIVATE-TOKEN: ${TOK}")
OUT="${TMPDIR:-/tmp}/conduint-civars.$$"; trap 'rm -f "$OUT"' EXIT

list_vars() {
  local c
  c="$(curl -sS -o "$OUT" -w '%{http_code}' "${auth[@]}" "$API" || true)"
  case "$c" in
    200) ;;
    401) echo "GitLab refused the token (401). It needs the api scope and must not be expired." >&2; exit 1 ;;
    404) echo "Project not found (404): check the path '$P' and that the token's user is a Maintainer of it." >&2; exit 1 ;;
    *)   echo "Could not list variables (HTTP $c)." >&2; exit 1 ;;
  esac
  grep -o '"key":"[^"]*"' "$OUT" | sed 's/"key":"//;s/"$//' || true
}

echo "Project: $P on $HOST"
HAVE="$(list_vars)"
for k in CONDUINT_KEYSTORE_B64 CONDUINT_KEYSTORE_PASS; do
  if printf '%s\n' "$HAVE" | grep -qx "$k"; then echo "  present: $k"; else echo "  MISSING: $k"; fi
done
[ "$CHECK" = "1" ] && exit 0

[ -f "$KS" ] || { echo "Keystore not found at: $KS"; echo "Run scripts/make-keystore.sh first, or pass the keystore path as the second argument."; exit 1; }
PASS="${CONDUINT_KEYSTORE_PASS:-}"
if [ -z "$PASS" ]; then
  printf 'Keystore password (hidden): '
  stty -echo 2>/dev/null || true
  read -r PASS || true
  stty echo 2>/dev/null || true
  echo
fi
[ "${#PASS}" -ge 8 ] || { echo "The keystore password must be 8+ characters (GitLab will not mask shorter values)."; exit 1; }
B64="$(base64 -w0 "$KS" 2>/dev/null || base64 "$KS" | tr -d '\n')"
[ -n "$B64" ] || { echo "Could not read the keystore."; exit 1; }

setvar() { # name value
  local k="$1" v="$2" c
  if printf '%s\n' "$HAVE" | grep -qx "$k"; then
    c="$(curl -sS -o "$OUT" -w '%{http_code}' -X PUT "${auth[@]}" --data-urlencode "value=${v}" -d masked=true -d protected=false -d raw=true "$API/$k" || true)"
  else
    c="$(curl -sS -o "$OUT" -w '%{http_code}' -X POST "${auth[@]}" --data-urlencode "key=${k}" --data-urlencode "value=${v}" -d masked=true -d protected=false -d raw=true "$API" || true)"
  fi
  case "$c" in
    200|201) echo "  set: $k" ;;
    *) echo "  FAILED: $k (HTTP $c) $(head -c 300 "$OUT" 2>/dev/null)"; return 1 ;;
  esac
}
setvar CONDUINT_KEYSTORE_B64 "$B64"
setvar CONDUINT_KEYSTORE_PASS "$PASS"
echo "Done. Re-run the pipeline: the build now signs with your fixed key."
HAVE="$(list_vars)"
for k in CONDUINT_KEYSTORE_B64 CONDUINT_KEYSTORE_PASS; do printf '%s\n' "$HAVE" | grep -qx "$k" && echo "  verified: $k" || echo "  NOT FOUND AFTER SET: $k"; done

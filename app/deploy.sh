#!/usr/bin/env bash
# One-command deploy for the GFF Partner Concierge.
#
#   1. Populate .env  (see .env.example)
#   2. ./deploy.sh
#
# Secrets are read from .env and piped straight into the Vercel CLI. They are
# never echoed, never passed as visible argv, and never committed.

set -euo pipefail
set +x

cd "$(dirname "$0")"
PROJECT="gff-concierge"

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy .env.example to .env and fill it in." >&2
  exit 1
fi

# Load .env without echoing anything.
set -a
# shellcheck disable=SC1091
. ./.env
set +a

: "${VERCEL_TOKEN:?VERCEL_TOKEN is empty in .env — get one at https://vercel.com/account/settings/tokens}"
: "${GEMINI_API_KEY:?GEMINI_API_KEY is empty in .env}"

V="npx --yes vercel@latest"
TOK=(--token "$VERCEL_TOKEN")

echo "==> Linking / creating Vercel project '$PROJECT'"
# `env add` silently no-ops if the project does not exist yet, which would ship a
# deployment with no GEMINI_API_KEY (chat 503). So ensure the project exists via
# an initial deploy BEFORE pushing env, then redeploy to pick the vars up.
if ! $V link --yes --project "$PROJECT" "${TOK[@]}" >/dev/null 2>&1; then
  echo "    project not found — creating it with a bootstrap deploy"
  $V deploy --yes "${TOK[@]}" >/dev/null 2>&1 || true
  $V link --yes --project "$PROJECT" "${TOK[@]}" >/dev/null 2>&1 || true
fi

push_env() {
  local name="$1" value="$2"
  [ -z "$value" ] && { echo "    - $name: empty, skipping"; return 0; }
  for env in production preview development; do
    # Remove first so re-runs are idempotent; ignore "not found".
    $V env rm "$name" "$env" --yes "${TOK[@]}" >/dev/null 2>&1 || true
    printf '%s' "$value" | $V env add "$name" "$env" "${TOK[@]}" >/dev/null 2>&1 || true
  done
  echo "    - $name: set (value hidden)"
}

echo "==> Pushing environment variables"
push_env GEMINI_API_KEY     "${GEMINI_API_KEY:-}"
push_env GEMINI_MODEL       "${GEMINI_MODEL:-gemini-3.6-flash}"
push_env MONGODB_URI       "${MONGODB_URI:-}"
push_env MONGODB_DB        "${MONGODB_DB:-gff}"

echo "==> Deploying to production"
URL="$($V deploy --prod --yes "${TOK[@]}" 2>/dev/null | tail -n 1)"

echo
echo "LIVE URL: $URL"
echo

echo "==> Verifying deployment"
sleep 5
echo -n "  GET  /              -> HTTP "; curl -s -o /dev/null -w "%{http_code}\n" "$URL/"
echo -n "  GET  /api/partners  -> HTTP "; curl -s -o /dev/null -w "%{http_code}\n" "$URL/api/partners"
echo -n "  POST /api/chat      -> HTTP "; curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST "$URL/api/chat" -H 'content-type: application/json' \
  -d '{"question":"Where is Razorpay booth?"}'
echo
echo "  Chat answer to a booth question (must refuse, must cite):"
curl -s -X POST "$URL/api/chat" -H 'content-type: application/json' \
  -d '{"question":"Where is Razorpay booth?"}' | head -c 900
echo

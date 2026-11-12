#!/bin/sh
# Gate (project lesson 3): the browser bundle never contains payment or LLM code,
# or the names of our secrets. Builds web/, then greps dist/. Exits 1 on any hit.
set -e
cd "$(dirname "$0")/.."
PNPM="$(command -v pnpm || echo "corepack pnpm")"
$PNPM --filter @goose/web build >/dev/null
PATTERNS='api-m\.sandbox\.paypal\.com|api-m\.paypal\.com|v1/oauth2/token|agent-toolkit|anthropic|sk-ant-|PAYPAL_CLIENT_SECRET|PAYPAL_CLIENT_ID|ANTHROPIC_API_KEY|CHANNEL3_API_KEY|api\.trychannel3\.com'
# Self-check: the pattern must fire on a planted secret name, or the gate is decoration.
printf "sk-ant-planted" | grep -Eiq "$PATTERNS" || { echo "check-bundle FAIL: self-check pattern did not match" >&2; exit 1; }
# Track C3: the Channel3 key's name and its host stay on the server (the browser reads /api/prices only).
printf "https://api.trychannel3.com/v1/search" | grep -Eiq "$PATTERNS" || { echo "check-bundle FAIL: self-check (channel3) did not match" >&2; exit 1; }
if grep -rEil "$PATTERNS" web/dist/assets; then
  echo "check-bundle FAIL: payment/LLM code or secret names found in the browser bundle" >&2
  exit 1
fi
# H1 (018 N13): the static site is the whole recorded demo, so each fixture week's tape must be in the build (its first
# recorded move's input hash), or the page would need the server for it.
for t in docs/fixtures/tape-seed-*.json; do
  h=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).moves[0].inputHash)' "$t")
  grep -rqF "$h" web/dist/assets || { echo "check-bundle FAIL: $t is not bundled into web/dist (the recorded demo would need the server)" >&2; exit 1; }
done
echo "check-bundle ok: no PayPal/Anthropic code or secret names in web/dist; the 3 recorded weeks are bundled"

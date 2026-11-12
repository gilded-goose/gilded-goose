#!/bin/sh
# Red-team proof (docs/guild/018 N11): 40 replay runs from one client, keyless, on the fake
# payment port, loopback only. SAFE means no PayPal order exists before anyone presses Approve.
# Exits 1 while any run created an order (open), 0 once H2 lands.
#
#   sh scripts/redteam/flood-runs.sh
cd "$(dirname "$0")/../../server" || exit 2
LIB=$(mktemp -d)
env -u ANTHROPIC_API_KEY PAYMENT=fake PORT=8799 PUBLIC_URL=http://127.0.0.1:8799 RUN_LIBRARY_DIR="$LIB" node src/main.ts >"$LIB/server.log" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; rm -rf "$LIB"' EXIT
i=0; until curl -s -o /dev/null http://127.0.0.1:8799/ || [ $i -ge 20 ]; do sleep 0.5; i=$((i+1)); done
# A server that never started, or a run that never got an id, must not read as SAFE.
curl -s -o /dev/null http://127.0.0.1:8799/ || { echo "flood FAIL: server didn't start (see $LIB/server.log)"; exit 2; }
ids=""
for i in $(seq 1 40); do
  id=$(curl -s -X POST -H 'content-type: application/json' -d '{"seed":1,"pace":false}' http://127.0.0.1:8799/api/runs | sed 's/.*"runId":"\([0-9a-f]*\)".*/\1/')
  case "$id" in ""|*[!0-9a-f]*) echo "flood FAIL: run $i got no run id"; exit 2;; esac
  ids="$ids $id"
done
sleep 3; n=0
for id in $ids; do curl -s "http://127.0.0.1:8799/api/runs/$id" | grep -q '"orderId":"FAKE-' && n=$((n+1)); done
if [ "$n" -eq 0 ]; then echo "SAFE flood: 40 runs, 0 orders before Approve"; exit 0; fi
echo "OPEN flood: 40 runs, $n orders created before anyone pressed Approve"; exit 1

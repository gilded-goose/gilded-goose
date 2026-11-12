#!/bin/sh
# Red-team proof (docs/guild/020 W20): a run's id travels in URLs and PayPal's return, so the id alone must
# never read the session's shopper fold (its week, receipt and dial record). Keyless, fake payment, loopback.
# The run's own browser reads it (the control); no cookie and another browser's cookie read null.
# Exits 0 when SAFE, 1 when another browser reads the fold, 2 when the probe itself is broken.
#
#   sh scripts/redteam/run-id-reads-week.sh
cd "$(dirname "$0")/../../server" || exit 2
LIB=$(mktemp -d)
env -u ANTHROPIC_API_KEY PAYMENT=fake PORT=8814 PUBLIC_URL=http://127.0.0.1:8814 RUN_LIBRARY_DIR="$LIB" node src/main.ts >"$LIB/server.log" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; rm -rf "$LIB"' EXIT
i=0; until curl -s -o /dev/null http://127.0.0.1:8814/ || [ $i -ge 20 ]; do sleep 0.5; i=$((i+1)); done
curl -s -o /dev/null http://127.0.0.1:8814/ || { echo "run-id FAIL: server didn't start (see $LIB/server.log)"; exit 2; }
start() { curl -s -c "$1" -b "$1" -X POST -H 'content-type: application/json' -d '{"seed":1,"pace":false}' http://127.0.0.1:8814/api/runs | sed 's/.*"runId":"\([0-9a-f]*\)".*/\1/'; }
id=$(start "$LIB/a.jar"); start "$LIB/b.jar" >/dev/null
case "$id" in ""|*[!0-9a-f]*) echo "run-id FAIL: the run got no id"; exit 2;; esac
sleep 2
get() { curl -s "$@" "http://127.0.0.1:8814/api/runs/$id"; }
# The control: the run's own browser reads its fold, or a null below would prove nothing.
get -b "$LIB/a.jar" | grep -q '"shopper":{' || { echo "run-id FAIL: the run's own browser read no fold"; exit 2; }
leaks=""
get | grep -q '"shopper":null' || leaks="$leaks no-cookie"
get -b "$LIB/b.jar" | grep -q '"shopper":null' || leaks="$leaks other-browser"
if [ -z "$leaks" ]; then echo "SAFE run-id: the owner reads the fold; no cookie and another browser read null"; exit 0; fi
echo "OPEN run-id: the fold leaks to:$leaks"; exit 1

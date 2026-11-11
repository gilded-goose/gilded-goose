#!/bin/sh
# The second pass's server: a seat presses Send and Approve here, and nothing real can happen (Joshua, Nov 4).
# Payments are fake and the store is a private folder on disk, so a seat's presses reach no PayPal and no Turso, count against no
# live cap, and start clean each time. It refuses to serve unless /api/health says exactly that.
#   from a worktree at the SHA:  sh scripts/check-bundle.sh   (builds web/dist; restart this after every build)
#   sh scripts/seat-server.sh [port]   default 8840; run it in the background, stop it with Ctrl-C or kill
# Pick a port outside 4191-4193, 8780 and 8786-8798. Starting with `node src/main.ts` reads no .env, and the blanks below win over
# anything in the shell.
PORT=${1:-8840}
U=http://localhost:$PORT
HERE=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DIR=$(mktemp -d "${TMPDIR:-/tmp}/goose-seat.XXXXXX")
[ -f "$HERE/web/dist/index.html" ] || { echo "seat-server: no web/dist here; run sh scripts/check-bundle.sh first" >&2; exit 2; }

cd "$HERE/server" || exit 2
TURSO_DATABASE_URL= TURSO_AUTH_TOKEN= GOOSE_DIR=$DIR PAYMENT=fake BUYER=rule PORT=$PORT PUBLIC_URL=$U WEB_URL=$U \
  PAYPAL_ENVIRONMENT=SANDBOX PAYPAL_CLIENT_SECRET=ci.stand-in node src/main.ts &
pid=$!
trap 'kill "$pid" 2>/dev/null; rm -rf "$DIR"' EXIT
trap 'exit 0' INT TERM

health=
i=0
while [ "$i" -lt 30 ]; do
  health=$(curl -sf "$U/api/health") && break
  i=$((i + 1)); sleep 1
done
case "$health" in
  *'"store":"disk"'*) ;;
  *) echo "seat-server: REFUSED, the store isn't disk: ${health:-no answer on $U}" >&2; exit 1 ;;
esac
case "$health" in
  *'"payment":"fake"'*) ;;
  *) echo "seat-server: REFUSED, payments aren't fake: $health" >&2; exit 1 ;;
esac
echo "seat-server: ready at $U (store disk at $DIR, payments fake). Press Send and Approve here, and only here."
wait "$pid"

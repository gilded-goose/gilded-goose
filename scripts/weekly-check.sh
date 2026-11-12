#!/bin/sh
# The weekly "is the live site still healthy and honest" check, about 20 seconds (docs/launch/survive-judging.md, "Weekly check").
# GET requests only; no key, no login, nothing written, nothing on the money path. It spends no Anthropic or Channel3 credit
# (it never calls /api/prices or any AI route). Prints OK or MISS per line; exits 1 on any MISS.
#
#   sh scripts/weekly-check.sh                      # the live site
#   VIDEO_URL='https://www.youtube.com/watch?v=…' sh scripts/weekly-check.sh   # also checks the video is still public
#   BASE=https://other.example sh scripts/weekly-check.sh
#
# The cert line warns under 10 days and fails under 2: Render renews on its own, but the cert seen on Nov 11 ended Dec 20.
BASE="${BASE:-https://gilded-goose.onrender.com}"
REPO="${REPO:-https://github.com/gilded-goose/gilded-goose}"
NPM="${NPM:-https://registry.npmjs.org/@gilded-goose%2ftrust}"
miss=0
ok() { echo "OK   $1"; }
bad() { echo "MISS $1"; miss=1; }
code() { curl -s -o /dev/null -m 20 -w '%{http_code}' "$1" 2>/dev/null; }

H=$(curl -s -m 20 "$BASE/api/health" 2>/dev/null)
for want in '"ok":true' '"store":"turso"' '"db":"ok"' '"paused":false' '"sandbox":true' '"payment":"sandbox"'; do
  case "$H" in *"$want"*) ok "health has $want" ;; *) bad "health lacks $want (got: $(echo "$H" | cut -c1-160))" ;; esac
done
[ "$(code "$BASE/")" = 200 ] && ok "home page answers 200" || bad "home page does not answer 200"
[ "$(code "$BASE/goose.html")" = 200 ] && ok "/goose.html answers 200" || bad "/goose.html does not answer 200"
[ "$(code "$REPO")" = 200 ] && ok "public repo opens signed out" || bad "public repo does not open signed out ($REPO)"
[ "$(code "$NPM")" = 200 ] && ok "npm package is listed" || bad "npm package not found"
if [ -n "$VIDEO_URL" ]; then
  [ "$(code "https://www.youtube.com/oembed?format=json&url=$VIDEO_URL")" = 200 ] && ok "video is public (oEmbed answers)" || bad "video is not public (oEmbed refused)"
else
  echo "SKIP video check (set VIDEO_URL to the YouTube link)"
fi
HOST=$(echo "$BASE" | sed 's|^https://||; s|/.*||')
END=$(echo | openssl s_client -connect "$HOST:443" -servername "$HOST" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | sed 's/notAfter=//')
if [ -z "$END" ]; then bad "could not read the certificate"
else
  EPOCH=$(date -j -f '%b %e %T %Y %Z' "$END" +%s 2>/dev/null || date -d "$END" +%s 2>/dev/null)
  if [ -z "$EPOCH" ]; then bad "could not read the certificate date: $END"
  else
    DAYS=$(( (EPOCH - $(date +%s)) / 86400 ))
    if [ "$DAYS" -lt 2 ]; then bad "certificate ends in $DAYS days ($END)"
    elif [ "$DAYS" -lt 10 ]; then echo "WARN certificate ends in $DAYS days ($END): Render should have renewed it"
    else ok "certificate ends in $DAYS days ($END)"; fi
  fi
fi
exit $miss

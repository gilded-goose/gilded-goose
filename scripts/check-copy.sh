#!/bin/sh
# Banned claims (PROFILE "Banned", 018 N1) never ship. "can't be tricked" sat in package.json
# for days because nothing checked; this does, on every surface a judge reads: the app's
# source and page, the server's user-facing strings, README and package.json.
# A planted phrase must fail first (the control), so a broken pattern can't pass silently.
cd "$(dirname "$0")/.." || exit 2
BANNED="can.t be tricked|eliminates|every scam|safe at scale|\\bproven\\b|blocked [0-9]+ attacks|saved \\\$|zero-click|wake word|the AI resisted"
printf 'this agent can%st be tricked\n' "'" | grep -qiE "$BANNED" || { echo "check-copy FAIL: the control phrase wasn't caught"; exit 2; }
hits=$(grep -rniE "$BANNED" README.md package.json web/index.html web/src server/src core/src 2>/dev/null)
if [ -n "$hits" ]; then echo "check-copy FAIL: banned claim in shipped copy (PROFILE \"Banned\"):"; echo "$hits"; exit 1; fi
echo "check-copy ok: no banned claims in README, package.json, web, server or core"

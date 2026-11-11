#!/bin/sh
# Gate (Joshua, 2026-10-23): nothing private enters the public repo. Checks what is
# staged (the pre-commit hook) or checked out (pnpm check, CI): no file under
# docs/private/, no path into the private vault, no secret-shaped string. The names
# Arthur, Winston and Beacon are allowed. Exits 1 on any hit.
set -e
cd "$(dirname "$0")/.."
# Split so this file never matches itself.
VAULT='Documents/''Winston'
SECRETS='sk-''ant-[A-Za-z0-9_-]{10,}|A21''AA[A-Za-z0-9_-]{20,}|gh''p_[A-Za-z0-9]{20,}|github''_pat_|-----BEGIN [A-Z ]*PRIVATE ''KEY'
# This project's own key names with a real-looking value (an empty .env.example line passes).
KEYS='(PAYPAL_CLIENT_(ID|SECRET)|ANTHROPIC_API_KEY|CHANNEL3_API_KEY|VITE_AG_STUDIO_LICENSE|VITE_AG_GRID_LICENSE)[[:space:]]*[=:][[:space:]]*["'"'"']?[][A-Za-z0-9_=-]{20,}'
# An address at a real mail provider could be a real person's (a fixture once held one; Lead-12, Nov 5). Fixtures use
# reserved domains (example.com, .test, .example) instead. Split so this file never matches itself.
MAIL='[A-Za-z0-9._%+-]+@(gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|me|mac|aol|proton|protonmail|gmx)''\.(com|net|me|ch|de|co\.uk)([^A-Za-z0-9.-]|\.([^A-Za-z0-9]|$)|$)'
# Self-check: each pattern must fire on a planted string, or the gate is decoration.
printf '%s' 'jo.sale@''gmail.com' | grep -Eiq "$MAIL" || { echo "check-private FAIL: self-check (mail)" >&2; exit 1; }
printf '%s' 'Email jo@''gmail.com.' | grep -Eiq "$MAIL" || { echo "check-private FAIL: self-check (mail at a full stop)" >&2; exit 1; }
printf '%s' 'jo.sale@''example.com' | grep -Eiq "$MAIL" && { echo "check-private FAIL: self-check (reserved mail matched)" >&2; exit 1; }
printf '%s' '~/Documents/''Winston/x' | grep -Eq "$VAULT" || { echo "check-private FAIL: self-check (vault)" >&2; exit 1; }
printf '%s' 'sk-''ant-abcdefghijklmn' | grep -Eq "$SECRETS" || { echo "check-private FAIL: self-check (secrets)" >&2; exit 1; }
printf '%s' 'PAYPAL_CLIENT''_SECRET=EabcdefghijklmnopqrstuvwxyZ' | grep -Eq "$KEYS" || { echo "check-private FAIL: self-check (keys)" >&2; exit 1; }
printf '%s' 'PAYPAL_CLIENT''_SECRET=' | grep -Eq "$KEYS" && { echo "check-private FAIL: self-check (empty key matched)" >&2; exit 1; }
# AG Studio keys start with a bracketed tag ("[TRIAL]_this_AG_Studio…"), so the pattern must take brackets too (044).
printf '%s' 'VITE_AG_STUDIO''_LICENSE=[TRIAL]_this_AG_Studio_Trial_Key_expires' | grep -Eq "$KEYS" || { echo "check-private FAIL: self-check (studio key)" >&2; exit 1; }
fail=0
if git ls-files --cached -- docs/private | grep -q .; then
  git ls-files --cached -- docs/private >&2
  echo "check-private FAIL: files under docs/private/ are staged or tracked (they stay local)" >&2; fail=1
fi
# DD packets and stills live in the notes folder, never in the repo (W-8 committed 3.8 MB of them; Lead-10).
if git ls-files --cached -- dd | grep -q .; then
  git ls-files --cached -- dd | head -5 >&2
  echo "check-private FAIL: files under dd/ are staged or tracked (DD packets go in the notes folder's dd/inbox/)" >&2; fail=1
fi
if git ls-files --cached | grep -E '(^|/)\.env(\.[^/]*)?$' | grep -v '\.env\.example$' >&2; then
  echo "check-private FAIL: a .env file is staged or tracked (it stays local)" >&2; fail=1
fi
if git grep --cached -I -n -E "$KEYS" -- . ':!pnpm-lock.yaml' >&2; then
  echo "check-private FAIL: a key name with a value (keys go in .env)" >&2; fail=1
fi
if git grep --cached -I -n -E "$VAULT" -- . ':!pnpm-lock.yaml' >&2; then
  echo "check-private FAIL: a path into the private vault (redact it)" >&2; fail=1
fi
if git grep --cached -I -n -E "$SECRETS" -- . ':!pnpm-lock.yaml' >&2; then
  echo "check-private FAIL: a secret-shaped string (keys go in .env)" >&2; fail=1
fi
if git grep --cached -I -n -i -E "$MAIL" -- . ':!pnpm-lock.yaml' >&2; then
  echo "check-private FAIL: an address at a real mail provider (use example.com or a .test domain)" >&2; fail=1
fi
[ "$fail" = 0 ] && echo "check-private ok: no docs/private or .env files, vault paths, keys, secrets or real mail addresses"
exit "$fail"

#!/usr/bin/env bash
# The public copy, built and checked in one go (Track L for Lead-13, Wed Nov 11). Joshua makes the repo public from the folder
# this writes; nobody else pushes it. It replaces the Lead's notes-only build.sh and scan.sh, so the rehearsal and the real
# build are the same script.
#
#   bash scripts/public-copy.sh <sha> <outdir> [--no-check]
#   PUBLIC_COPY_EMAILS=<file> bash scripts/public-copy.sh ...   (more addresses to forbid, one a line; never printed)
#
# 1. build:  one commit, fresh history, of exactly the files scripts/public-allow.txt keeps (read from <sha> itself, so the
#            list ships with the code it describes), plus the files the build writes: docs/guild/board.md (the ratchet's
#            section only), .env.example (the tracked one) and docs/launch/.public-copy (scripts/brief.ts's mark).
# 2. scan:   hard failures, whatever the allowlist says: secret or key shapes, .env files, a films folder, the films' .mp4, .mov, .wav or
#            .npy files, web/.probe/, the films' reference folder by name, private notes (docs/inbox, docs/guild but its
#            listed files, docs/private, dd/, .claude/), any file the allowlist doesn't keep, an author's email from the
#            private history, session ids, absolute home paths, a competitor named in prose, a README or docs/launch link
#            that doesn't resolve inside the copy, and scripts/check-private.sh run on the copy.
# 3. fresh:  `corepack pnpm install --frozen-lockfile` and `corepack pnpm check` in the copy (skipped with --no-check).
# 4. npm:    scripts/trust-pack.ts in the copy, `npm pack` to a tarball, installed into an empty project beside the copy, and
#            the runbook's own expects run against it: the import works, the types resolve, README, MIT, the repo link.
#            Nothing is published and nothing logs in.
# Prints PASS or FAIL per check and exits 1 on any FAIL. <outdir> must not exist yet, or be empty, and must sit outside the repo.
# Patterns are split ('a''b') so this file, which ships in the copy, never matches its own scan.
set -u
SHA_IN=${1:-}; OUT=${2:-}; MODE=${3:-}
[ -n "$SHA_IN" ] && [ -n "$OUT" ] || { echo "usage: bash scripts/public-copy.sh <sha> <outdir> [--no-check]" >&2; exit 2; }
REPO=$(cd "$(dirname "$0")/.." && pwd -P)
SHA=$(git -C "$REPO" rev-parse --verify --quiet "$SHA_IN^{commit}") || { echo "public-copy: no commit $SHA_IN" >&2; exit 2; }
# The main repo's root, not just this worktree's: the copy must sit outside every checkout of it.
MAIN=$(cd "$(git -C "$REPO" rev-parse --git-common-dir)/.." && pwd -P)
mkdir -p "$OUT" || exit 2
OUT=$(cd "$OUT" && pwd -P)
case "$OUT/" in "$MAIN"/*|"$REPO"/*) echo "public-copy: $OUT is inside the repo; pick a folder outside it" >&2; exit 2 ;; esac
[ -z "$(ls -A "$OUT")" ] || { echo "public-copy: $OUT isn't empty; give a new folder (nothing is deleted for you)" >&2; exit 2; }
NPMDIR="$OUT.npm"
[ ! -e "$NPMDIR" ] || { echo "public-copy: $NPMDIR exists; give a new <outdir>" >&2; exit 2; }
WORK=$(mktemp -d "${TMPDIR:-/tmp}/public-copy.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

FAILS=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; FAILS=$((FAILS + 1)); }
# Lists at most 20 hits under a FAIL, as path:line only (never the line itself: it may hold what the scan is looking for).
hits() { sed -E 's/^([^:]+:[0-9]+):.*/\1/' | sort -u | head -20 | sed 's/^/        /'; }

echo "public-copy: $SHA -> $OUT"

# ---- 1. build --------------------------------------------------------------------------------------------------------------
git -C "$REPO" show "$SHA:scripts/public-allow.txt" > "$WORK/allow.txt" 2>/dev/null || { echo "public-copy: $SHA has no scripts/public-allow.txt" >&2; exit 2; }
# One entry per line: a file, or a folder that keeps all of it; `!path` takes a file or folder back out. Patterns that match
# nothing at <sha> are fine (the new site's paths, before it lands).
sed -E 's/[[:space:]]+$//; s/^[[:space:]]+//' "$WORK/allow.txt" | grep -vE '^(#|$)' > "$WORK/entries"
grep -v '^!' "$WORK/entries" > "$WORK/keep" || true
{ grep '^!' "$WORK/entries" || true; } | sed 's/^!//' > "$WORK/drop"
git -C "$REPO" ls-tree -r --name-only "$SHA" > "$WORK/tree"
awk 'FILENAME==ARGV[1]{k[++nk]=$0; next} FILENAME==ARGV[2]{d[++nd]=$0; next}
  { p=$0; keep=0
    for (i=1;i<=nk;i++) if (p==k[i] || index(p, k[i] "/")==1) { keep=1; break }
    for (i=1;i<=nd;i++) if (p==d[i] || index(p, d[i] "/")==1) { keep=0; break }
    if (keep) print p }' "$WORK/keep" "$WORK/drop" "$WORK/tree" > "$WORK/files"
[ -s "$WORK/files" ] || { echo "public-copy: the allowlist keeps nothing at $SHA" >&2; exit 2; }
tr '\n' '\0' < "$WORK/files" | xargs -0 git -C "$REPO" archive --format=tar "$SHA" -- | tar -x -C "$OUT" || { echo "public-copy: git archive failed" >&2; exit 2; }
# The written files. board.md: the ratchet's section only (scripts/ratchet-board.ts writes between the markers).
START='<!-- ratchet:start -->'; END='<!-- ratchet:end -->'
mkdir -p "$OUT/docs/guild" "$OUT/docs/launch"
{ printf '# Gilded Goose: the ratchet\n\nWritten by `node scripts/ratchet-board.ts`; every number is read from a run, never typed.\n\n'
  git -C "$REPO" show "$SHA:docs/guild/board.md" | awk -v s="$START" -v e="$END" 'index($0,s){on=1} on{print} index($0,e){on=0}'
} > "$OUT/docs/guild/board.md"
grep -qF "$START" "$OUT/docs/guild/board.md" && grep -qF "$END" "$OUT/docs/guild/board.md" || { echo "public-copy: $SHA's board has no ratchet section" >&2; exit 2; }
# Decided by default (Track L, Nov 11): the tracked .env.example as it is (check-private guards it in the private repo and
# again below). Flip if Joshua says: write one from the key names alone.
git -C "$REPO" show "$SHA:.env.example" > "$OUT/.env.example" || { echo "public-copy: $SHA has no .env.example" >&2; exit 2; }
printf 'public copy\n' > "$OUT/docs/launch/.public-copy"
(
  cd "$OUT" && git init -q -b main && git add -A &&
  git -c user.name="Gilded Goose" -c user.email="gilded-goose@example.com" -c commit.gpgsign=false \
    commit -q --no-verify -m "Gilded Goose: the public source, one commit from the private repo's allowlist"
) || { echo "public-copy: the commit failed" >&2; exit 2; }
NFILES=$(git -C "$OUT" ls-files | wc -l | tr -d ' ')
BYTES=$(git -C "$OUT" ls-files -z | (cd "$OUT" && xargs -0 stat -f %z) | awk '{s+=$1} END{print s+0}')
COMMITS=$(git -C "$OUT" rev-list --count HEAD)
[ "$COMMITS" = 1 ] && pass "build: one commit, fresh history, $NFILES files, $BYTES bytes ($(du -sh "$OUT" | cut -f1) on disk with .git) from ${SHA:0:8}" \
  || fail "build: $COMMITS commits, not 1"

# ---- 2. scan ---------------------------------------------------------------------------------------------------------------
cd "$OUT" || exit 2
# What is on disk, not only what git tracks: a file the copy's .gitignore hides would still sit in the folder Joshua pushes from.
find . -path ./.git -prune -o \( -type f -o -type l \) -print | sed 's|^\./||' | sort > "$WORK/copy"
git ls-files | sort > "$WORK/tracked"
comm -23 "$WORK/copy" "$WORK/tracked" > "$WORK/p"
[ -s "$WORK/p" ] && { fail "scan: every file in the folder is in the commit"; head -20 "$WORK/p" | sed 's/^/        /'; } \
  || pass "scan: every file in the folder is in the commit"
pathfail() { # $1 label, $2 extended regex on paths
  if grep -E "$2" "$WORK/copy" > "$WORK/p"; then fail "scan: $1"; head -20 "$WORK/p" | sed 's/^/        /'; else pass "scan: $1"; fi
}
grep -E '(^|/)\.env(\.|$)' "$WORK/copy" | grep -vx '.env.example' > "$WORK/p" || true
[ -s "$WORK/p" ] && { fail "scan: no .env file but .env.example"; sed 's/^/        /' "$WORK/p"; } || pass "scan: no .env file but .env.example"
REF="films""-reference"
FILMS="films""/"
pathfail "no films folder and no $REF" "(^|/)$FILMS|$REF"
# The app's own voice clips (web/public/voice/*.m4a) are product, so the never-list is the films' formats and the model dumps.
pathfail "no .mp4, .mov, .wav or .npy file" '\.(mp4|mov|wav|npy)$'
pathfail "no web/.probe/" '^web/\.probe/'
# Private notes, by path, whatever the allowlist says. docs/guild keeps only what the allowlist names and the board.
pathfail "no private notes (docs/inbox, docs/private, dd/, .claude/, PROFILE.md, CLAUDE.md, QUEUE)" \
  '^(docs/inbox/|docs/private/|dd/|\.claude/|PROFILE\.md$|CLAUDE\.md$|docs/QUEUE\.md$)'
grep '^docs/guild/' "$WORK/copy" | grep -vxE 'docs/guild/(ratchet|ratchet-overrides|ratchet-live|ratchet-days)\.json|docs/guild/(brand|board)\.md' > "$WORK/p" || true
[ -s "$WORK/p" ] && { fail "scan: docs/guild holds only its ratchet files, brand.md and board.md"; head -20 "$WORK/p" | sed 's/^/        /'; } \
  || pass "scan: docs/guild holds only its ratchet files, brand.md and board.md"
# Every file is one the allowlist keeps or one the build wrote: nothing rides in by accident.
grep -vxF -f "$WORK/files" "$WORK/copy" | grep -vxE 'docs/guild/board\.md|\.env\.example|docs/launch/\.public-copy' > "$WORK/p" || true
[ -s "$WORK/p" ] && { fail "scan: every file is kept by the allowlist or written by the build"; head -20 "$WORK/p" | sed 's/^/        /'; } \
  || pass "scan: every file is kept by the allowlist or written by the build"
contentfail() { # $1 label, then git grep arguments
  local label=$1; shift
  if git grep -I -n "$@" > "$WORK/c" 2>/dev/null; then fail "scan: $label"; hits < "$WORK/c"; else pass "scan: $label"; fi
}
SECRET='sk''-ant-[A-Za-z0-9_-]{10,}|sk''-(proj-)?[A-Za-z0-9]{32,}|sk_''live_[A-Za-z0-9]{16,}|rk_''live_[A-Za-z0-9]{16,}|A21''AA[A-Za-z0-9_-]{20,}|gh''[pousr]_[A-Za-z0-9]{20,}|github''_pat_|xox''[abprs]-[A-Za-z0-9-]{10,}|AK''IA[0-9A-Z]{16}|AI''za[0-9A-Za-z_-]{35}|npm''_[A-Za-z0-9]{36}|-----BEGIN [A-Z ]*PRIVATE'' KEY|ey''J[A-Za-z0-9_-]{10,}\.ey''J[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
contentfail "no secret or key shape (Anthropic, OpenAI-style, Stripe-style, PayPal, GitHub, Slack, AWS, Google, npm, PEM, JWT)" -E "$SECRET" -- . ':!pnpm-lock.yaml'
KEYVAL='(PAYPAL_CLIENT_(ID|SECRET)|ANTHROPIC_API_KEY|CHANNEL3_API_KEY|VITE_AG_STUDIO_LICENSE|VITE_AG_GRID_LICENSE|AG_[A-Z_]*LICEN[CS]E[A-Z_]*|VAPID_PRIVATE_KEY|[A-Z_]*(SECRET|TOKEN|PASSWORD)[A-Z_]*)[[:space:]]*=[[:space:]]*["'"'"']?[^[:space:]"'"'"'$]{12,}'
contentfail "no key name with a value in .env.example" -E "$KEYVAL" -- .env.example
HOME_PATH='/''Users/|/''home/[a-z][a-z0-9_-]+/|/private/tmp/''claude-'
contentfail "no absolute home or scratch path" -E "$HOME_PATH" -- .
SESSION='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|session''_01[A-Za-z0-9]{16,}|claude ''--resume'
contentfail "no session id (no UUID, cloud session or resume line)" -i -E "$SESSION" -- . ':!pnpm-lock.yaml'
# A person's to-do in a shipped file (Lead-13, Nov 11: a board line read "waiting on" the owner's take and a vendor plan;
# it didn't ship only because the board is cut to its ratchet section). A team member's name next to a key, take, plan,
# login, account, usage, recording or to-do, or "waits on"/"waiting on"/"ask" before a name, fails the copy.
WHO='joshua|lucas|javier'
TODO="\\b($WHO)('s)?\\b[^.]{0,40}\\b(api key|keys?|takes?|plan|login|account|usage|recording|password|waits? on|waiting on|to-?do)\\b|\\b(waits? on|waiting on|ask|asks|asked)[[:space:]]+($WHO)\\b"
contentfail "no person's to-do (a name by a key, take, plan, login, account, usage or recording)" -i -E "$TODO" -- . ':!pnpm-lock.yaml'
contentfail "no $REF or films folder path in any file" -E "$REF|(^|[^A-Za-z0-9_-])$FILMS" -- .
# Every author and committer email in the private history (Joshua's, Lucas's, anyone's), but the shared no-reply ones.
# PUBLIC_COPY_EMAILS names a file of more addresses to forbid, one a line (a teammate who never committed here), never printed.
{ git -C "$REPO" log --all --format='%ae%n%ce'; [ -n "${PUBLIC_COPY_EMAILS:-}" ] && cat "$PUBLIC_COPY_EMAILS"; } | tr -d ' \r' | sort -u |
  grep -viE '^(noreply@anthropic\.com|.*@users\.noreply\.github\.com|noreply@github\.com)$' | grep '@' > "$WORK/emails" || true
if [ -s "$WORK/emails" ]; then
  contentfail "no author email from the private history ($(wc -l < "$WORK/emails" | tr -d ' ') addresses read, none printed)" -i -F -f "$WORK/emails" -- .
else fail "scan: no author email read from the private history (the list came back empty)"; fi
# Competitors: the project's own list (scripts/claims-placeholders.ts NEVER_NAMED), in prose: every .md and .html file.
# docs/claims.md is the claims ledger, and its missing-layer rows cite the sources by name (Joshua, Nov 3: each linked).
NAMES=$(sed -nE 's/^export const NEVER_NAMED = \/\\b\((.*)\)\\b\/i;$/\1/p' scripts/claims-placeholders.ts)
if [ -z "$NAMES" ]; then fail "scan: no competitor named in prose (NEVER_NAMED not found in scripts/claims-placeholders.ts)"
else contentfail "no competitor named in prose (.md, .html; docs/claims.md's cited sources excepted)" -i -E "(^|[^A-Za-z0-9])($NAMES)([^A-Za-z0-9]|$)" -- '*.md' '*.html' ':!docs/claims.md'; fi
# README and docs/launch: every relative link and image resolves inside the copy.
: > "$WORK/links"
for f in README.md trust/README.md $(grep -E '^docs/launch/.*\.md$' "$WORK/copy"); do
  [ -f "$f" ] || continue
  d=$(dirname "$f")
  { grep -oE '\]\([^)[:space:]]+' "$f" | sed 's/^](//'; grep -oE '(src|href)="[^"]+"' "$f" | sed -E 's/^(src|href)="//; s/"$//'; } |
  while IFS= read -r u; do
    case "$u" in http://*|https://*|mailto:*|\#*|data:*) continue ;; esac
    p=${u%%#*}; p=${p%%\?*}; [ -n "$p" ] || continue
    case "$p" in /*) t=".$p" ;; *) t="$d/$p" ;; esac
    [ -e "$t" ] || echo "$f: $u" >> "$WORK/links"
  done
done
[ -s "$WORK/links" ] && { fail "scan: every README and docs/launch link resolves inside the copy"; head -20 "$WORK/links" | sed 's/^/        /'; } \
  || pass "scan: every README and docs/launch link resolves inside the copy"
if sh scripts/check-private.sh > "$WORK/cp" 2>&1; then pass "scan: check-private on the copy"; else fail "scan: check-private on the copy"; sed -E 's/^([^:]+:[0-9]+):.*/\1/' "$WORK/cp" | head -20 | sed 's/^/        /'; fi

# ---- 3. a fresh clone is green -----------------------------------------------------------------------------------------------
if [ "$MODE" = "--no-check" ]; then
  echo "SKIP  fresh: install and check (--no-check)"; echo "SKIP  npm: tarball (--no-check)"
else
  if corepack pnpm install --frozen-lockfile > "$WORK/install.log" 2>&1; then pass "fresh: corepack pnpm install --frozen-lockfile"
  else fail "fresh: corepack pnpm install --frozen-lockfile"; tail -15 "$WORK/install.log" | sed 's/^/        /'; fi
  if corepack pnpm check > "$OUT.check.log" 2>&1; then pass "fresh: corepack pnpm check (log: $OUT.check.log)"
  else fail "fresh: corepack pnpm check (log: $OUT.check.log)"; grep -E 'FAIL|✗|×|Error' "$OUT.check.log" | head -15 | sed 's/^/        /'; fi

  # ---- 4. npm: the tarball, as a stranger installs it -------------------------------------------------------------------------
  if node scripts/trust-pack.ts > "$WORK/pack.log" 2>&1; then pass "npm: $(grep 'dry run ok' "$WORK/pack.log" | sed 's/^trust-pack: //')"
  else fail "npm: node scripts/trust-pack.ts"; tail -5 "$WORK/pack.log" | sed 's/^/        /'; fi
  mkdir -p "$NPMDIR/tarball" "$NPMDIR/stranger"
  if (cd trust/.pack && npm_config_userconfig=/dev/null npm pack --pack-destination "$NPMDIR/tarball" > "$WORK/npack.log" 2>&1); then
    TGZ=$(ls "$NPMDIR"/tarball/*.tgz | head -1)
    pass "npm: tarball $(basename "$TGZ"), $(tar -tzf "$TGZ" | wc -l | tr -d ' ') files, $(stat -f %z "$TGZ") bytes"
    tar -tzf "$TGZ" | sed 's/^package\///' | sort > "$NPMDIR/files.txt"
    (
      cd "$NPMDIR/stranger" && npm_config_userconfig=/dev/null npm init -y > /dev/null &&
      npm_config_userconfig=/dev/null npm install --no-audit --no-fund --ignore-scripts "$TGZ" > "$WORK/ninst.log" 2>&1
    ) && pass "npm: installed into an empty project ($NPMDIR/stranger)" || { fail "npm: install into an empty project"; tail -5 "$WORK/ninst.log" | sed 's/^/        /'; }
    S="$NPMDIR/stranger"; P="$S/node_modules/@gilded-goose/trust"
    got=$(cd "$S" && node -e 'import("@gilded-goose/trust/node").then((m) => console.log(typeof m.createGuard))' 2>&1)
    [ "$got" = function ] && pass "npm: import(\"@gilded-goose/trust/node\") gives createGuard, a function" || fail "npm: import gave \"$got\", not function"
    got=$(cd "$S" && node -e 'Promise.all(["@gilded-goose/trust","@gilded-goose/trust/paypal"].map((e) => import(e))).then((ms) => console.log(ms.map((m) => Object.keys(m).length > 0).join(",")))' 2>&1)
    [ "$got" = "true,true" ] && pass "npm: the . and ./paypal entries import too" || fail "npm: the . and ./paypal entries gave \"$got\""
    printf 'import { createGuard } from "@gilded-goose/trust/node";\nimport * as root from "@gilded-goose/trust";\nimport * as pp from "@gilded-goose/trust/paypal";\nvoid root; void pp;\n// @ts-expect-error a want is not a string\ncreateGuard({ shopperId: "s", perPurchaseCap: 1 }).decide("not a want", {});\n' > "$S/types.ts"
    printf '{"compilerOptions":{"target":"ES2022","lib":["ES2022"],"module":"NodeNext","moduleResolution":"NodeNext","strict":true,"noEmit":true,"skipLibCheck":false,"types":["node"],"typeRoots":["%s"]},"files":["types.ts"]}\n' "$OUT/trust/node_modules/@types" > "$S/tsconfig.json"
    if "$OUT/trust/node_modules/.bin/tsc" -p "$S/tsconfig.json" > "$WORK/tsc.log" 2>&1; then pass "npm: types resolve from the package alone (strict, skipLibCheck off, a planted error caught)"
    else fail "npm: types"; head -10 "$WORK/tsc.log" | sed 's/^/        /'; fi
    [ -s "$P/README.md" ] && grep -q '^# ' "$P/README.md" && pass "npm: README.md in the package" || fail "npm: no README.md in the package"
    head -1 "$P/LICENSE" 2>/dev/null | grep -q '^MIT License' && grep -q '"license": "MIT"' "$P/package.json" && pass "npm: MIT (LICENSE and package.json)" || fail "npm: MIT licence missing"
    WANT=$(sed -nE 's/^export const REPO = "([^"]+)".*/\1/p' web/src/brand/meta.ts)
    grep -qF "\"git+$WANT.git\"" "$P/package.json" && pass "npm: repository names $WANT" || fail "npm: repository isn't git+$WANT.git"
    grep -qE '"dependencies"' "$P/package.json" && fail "npm: the package has dependencies" || pass "npm: no dependencies (the Toolkit is an optional peer)"
  else fail "npm: npm pack"; tail -5 "$WORK/npack.log" | sed 's/^/        /'; fi
fi

echo
if [ "$FAILS" = 0 ]; then echo "public-copy PASS: $OUT ($NFILES files, $BYTES bytes, 1 commit from ${SHA:0:8}). Nothing was pushed or published."; exit 0; fi
echo "public-copy FAIL: $FAILS check(s) failed. Nothing was pushed or published. Rebuild from the allowlist; never patch the copy by hand."
exit 1

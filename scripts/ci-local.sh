#!/bin/zsh
# zsh scripts/ci-local.sh <sha> [label]: the steps of .github/workflows/check.yml, run on exactly <sha> in a clean throwaway
# worktree, while GitHub Actions has no minutes (Sat Oct 31 2026, ~09:01 UTC: every run fails in 2 s with no runner).
# Run it from any worktree; it takes the heavy lock itself (scripts/heavy-lock.sh), so run it in the background.
# Differences from CI, on purpose: no `cp .env.example .env` (no .env is ever created; the server starts with
# `node src/main.ts` and the stand-in env CI's steps set), and ports 4193 / 8797 / 8798 so no track's ports collide.
# Prints LOCAL-CI PASS <full sha> or LOCAL-CI FAIL <full sha> <step> as its last line.
# This is the one real copy (the gate, DD seat 4, Nov 4: "ci-local on the exact SHA" hung on a notes file, and two copies drifted).
set -u
export NODE_COMPILE_CACHE=/private/tmp/goose-node-cache # As check.yml does: node doesn't compile the same files again each time it starts.
if [ -z "${GOOSE_CI_INNER:-}" ]; then GOOSE_CI_INNER=1 exec sh "${0:A:h}/heavy-lock.sh" zsh "${0:A}" "$@"; fi
# A step piped through tail or grep fails on the probe's own exit, not tail's (Lead-10, Sat Oct 31 08:15 PDT: approve-check's
# first run threw a TimeoutError that `| tail -4 || fail` hid).
setopt pipefail
LABEL=${2:-$1}
REPO=${$(git -C "${0:A:h}" rev-parse --path-format=absolute --git-common-dir):h}
# The PASS/FAIL line names the full 40-hex commit, whatever was passed, so the push gate is a plain match, not a prefix
# check (Lead-12, Fri Nov 6 01:40). Anything that isn't one commit fails here, before a worktree is made.
SHA=$(git -C $REPO rev-parse --verify -q "$1^{commit}") || { echo "LOCAL-CI FAIL $1 not-a-commit"; exit 1; }
WT=/private/tmp/goose-ci/$LABEL
# ci-local's own ports: 4193 4196 8796 8797 8798 (six server starts; 8798 twice). A track's server never uses them (Lead-12,
# Fri Nov 6 03:05: C's walk server sat on 8797, push 8's run failed on it, and the old free() stopped it twice mid-walk).
# free() lists the same five, and ci-local-ports.test.ts pins that every port here is in this list and no other code
# file names one.
CI_PORTS="4193 4196 8796 8797 8798"
# lsof takes one -i spec: `lsof -ti tcp:A tcp:B` reads B as a file name, so fail() never freed 8798 and a stale server
# from stack 118's failed run answered for stack 120 (Lead-10, Sat Oct 31 08:20 PDT). stop() reads one port at a time, so every port is read.
# A run stops only its own leftovers: a listener on the port whose cwd is inside a ci-local worktree (${WT%/*}/…), never a
# client of the port, never pid 28968, a browser, or a Playwright or MCP process, and never another session's server
# (Lead-12, Fri Nov 6 02:05). Anything else is left alone, and clear_port fails naming it.
leftovers() { local p; for p in $(lsof -ti tcp:$1 -sTCP:LISTEN 2>/dev/null); do [ "$p" = 28968 ] && continue; ps -o command= -p $p 2>/dev/null | grep -qiE "playwright|mcp|chrome|chromium" && continue; lsof -a -p $p -d cwd -Fn 2>/dev/null | grep -q "^n${WT%/*}/" && echo $p; done; }
stop() { local port; for port; do leftovers $port | xargs kill 2>/dev/null; done; }
free() { stop 4193 4196 8796 8797 8798; sleep 1; }
fail() { free; echo "LOCAL-CI FAIL $SHA $1"; exit 1; }
# Who listens on port $1, by pid, command and cwd, so a tripped guard names the process (Lead-12, Fri Nov 6 01:55: push 8
# failed with an outside listener on 8797 that was gone before anyone looked).
who() { local p; for p in $(lsof -ti tcp:$1 -sTCP:LISTEN 2>/dev/null); do echo "  port $1 held by pid $p: $(ps -o command= -p $p 2>/dev/null | cut -c1-160) (cwd $(lsof -a -p $p -d cwd -Fn 2>/dev/null | sed -n 's/^n//p'))"; done; }
# Port $1 is free right before this run starts its own server there: free() runs only at the start, and a listener that
# came up since would answer the health check. Our own leftovers there are stopped; the run waits up to 10 s for the port
# to go quiet (CLEAR_TRIES half-seconds; a test passes fewer), and a listener that isn't ours fails the run, named.
clear_port() { stop $1; for i in $(seq ${CLEAR_TRIES:-20}); do [ -z "$(lsof -ti tcp:$1 -sTCP:LISTEN 2>/dev/null)" ] && return 0; sleep 0.5; done; who $1; fail "port $1 still held"; }
# The server on port $1 must be the one this run started, from this worktree, not a survivor of an earlier run.
ours() { local pid=$(lsof -ti tcp:$1 -sTCP:LISTEN 2>/dev/null | head -1); { [ -n "$pid" ] && lsof -a -p $pid -d cwd -Fn 2>/dev/null | grep -q "^n$WT"; } || { who $1; fail "port $1 not served from $WT"; }; }
git -C $REPO worktree remove --force $WT 2>/dev/null; rm -rf $WT; free
mkdir -p ${WT:h}; git -C $REPO worktree add -q --detach $WT $SHA || fail worktree
cd $WT
echo "== ports $CI_PORTS: ci-local's own, never a track server's"
echo "== install"; corepack pnpm install --frozen-lockfile >/dev/null 2>&1 || fail install
echo "== pnpm check"; VITEST_MAX_FORKS=3 VITEST_MAX_THREADS=3 corepack pnpm check > check.log 2>&1 || { tail -40 check.log; grep -E "^  WORSE |^ratchet FAIL" check.log; fail check; }
grep -E "Tests +[0-9]+ passed|check-claims ok" check.log | tail -4
grep -E "^ratchet |^  (accepted|new) " check.log
grep -q "^ratchet ok" check.log || fail ratchet
# The port guards against real listeners (macOS and lsof only; Lead-12, Fri Nov 6: in core's vitest they skipped on GitHub's
# ubuntu, and the ratchet allows 0 skipped). Its listeners take ports the OS hands out, never one of CI_PORTS.
echo "== ports-live"
node scripts/ci-local-ports-live.ts > ports-live.log 2>&1 || { tail -20 ports-live.log; fail ports-live; }
tail -1 ports-live.log
# The heavy lock against real lockf (macOS only; Lead-12, Fri Nov 6: in core they opened with `if (!hasLockf) return;` and
# passed on ubuntu proving nothing). Each check has its own lock file, so the real queue this run holds is never touched.
echo "== heavy-lock-live"
node scripts/heavy-lock-live.ts > heavy-lock-live.log 2>&1 || { tail -20 heavy-lock-live.log; fail heavy-lock-live; }
tail -1 heavy-lock-live.log
echo "== budget: first screen"
clear_port 4193
(corepack pnpm --filter @goose/web exec vite preview --port 4193 --strictPort > preview.log 2>&1 &)
for i in $(seq 30); do curl -sf http://localhost:4193/ >/dev/null && break; sleep 1; done
ours 4193
for u in "/" "/?wallet=1" "/?wallet=0" "/goose.html"; do
  corepack pnpm budget:first-screen "http://localhost:4193$u" 5 2>&1 | grep -E "p95|BUDGET" || fail "budget $u"
  corepack pnpm budget:first-screen "http://localhost:4193$u" 5 >/dev/null 2>&1 || fail "budget $u"
done
stop 4193
echo "== budget: round"
clear_port 8797
(cd server && PAYMENT=fake PORT=8797 PAYPAL_ENVIRONMENT=SANDBOX nohup node src/main.ts > ../round.log 2>&1 &)
for i in $(seq 30); do curl -sf http://localhost:8797/api/health >/dev/null && break; sleep 1; done
ours 8797
corepack pnpm budget:round http://localhost:8797 2>&1 | tail -4 | tee round-out.log; grep -q "FAIL" round-out.log && fail budget-round
corepack pnpm budget:round http://localhost:8797 >/dev/null 2>&1 || fail budget-round
# The white site on the phone drill (the Nov 11 speed gate): its home under the old root's phone p95 (620 ms), Shop cold
# under 1750 ms. Here, not on vite preview above: only the server sends the build's brotli files, as Render does. The
# bare domain is the white site on the server (main.ts rootPage, Nov 11), so it is measured as the white site too.
for u in "/" "/#/shop" "/goose.html" "/goose.html#/shop"; do
  FIRST_SCREEN_PAGE=white PROFILE=mobile corepack pnpm budget:first-screen "http://localhost:8797$u" 5 2>&1 | grep -E "p95|BUDGET" | tee phone-out.log; grep -q "FAIL" phone-out.log && fail "phone budget $u"
done
stop 8797
echo "== approve-check"
clear_port 8798
(cd server && PAYMENT=fake BUYER=rule PORT=8798 PUBLIC_URL=http://localhost:8798 WEB_URL=http://localhost:8798 PAYPAL_CLIENT_SECRET=ci.stand-in PAYPAL_ENVIRONMENT=SANDBOX nohup node src/main.ts > ../approve.log 2>&1 &)
for i in $(seq 30); do curl -sf http://localhost:8798/api/health >/dev/null && break; sleep 1; done
ours 8798
node scripts/approve-check.ts http://localhost:8798 2>&1 | tail -4 || fail approve-check
node scripts/approve-check.ts http://localhost:8798 >/dev/null 2>&1 || fail approve-check
# The judge tour lands clean at every stop (ink and control-box rules; the DD, Sat Oct 31 07:02 PDT, Lead-10): `ink` is the phone sizes,
# `wide` is 1440, about a minute. `ink` alone never opened 1440, so this green said nothing about the reds tracks saw there (Nov 4).
echo "== tour-pill"
TOUR_ONLY=ink node scripts/tour-pill.ts http://localhost:8798 > tour.log 2>&1 || { sed -n '/TOUR PILL FAIL/,$p' tour.log | head -20; fail tour-pill; }
tail -2 tour.log
TOUR_ONLY=wide node scripts/tour-pill.ts http://localhost:8798 > tour-wide.log 2>&1 || { sed -n '/TOUR PILL FAIL/,$p' tour-wide.log | head -20; fail tour-pill-wide; }
tail -1 tour-wide.log
# A real try on record is a state too, and the one live is in: this server starts on an empty folder of its own, so one row goes
# through the real route and every other walk here stays on an empty record (Track F found stop 10 cut only with a row, Nov 4).
echo "== tour-pill: a real try on record"
REAL_DIR=$(mktemp -d)
clear_port 8796
(cd server && GOOSE_DIR=$REAL_DIR PAYMENT=fake BUYER=rule PORT=8796 PUBLIC_URL=http://localhost:8796 WEB_URL=http://localhost:8796 PAYPAL_CLIENT_SECRET=ci.stand-in PAYPAL_ENVIRONMENT=SANDBOX nohup node src/main.ts > ../real.log 2>&1 &)
for i in $(seq 30); do curl -sf http://localhost:8796/api/health >/dev/null && break; sleep 1; done
ours 8796
TOUR_ONLY=real node scripts/tour-pill.ts http://localhost:8796 > tour-real.log 2>&1 || { sed -n '/TOUR PILL FAIL/,$p' tour-real.log | head -20; fail tour-pill-real; }
tail -1 tour-real.log
stop 8796; rm -rf $REAL_DIR
# Joshua's 1(d): axe 0, keyboard-only through the judge tour, 0 console errors, 0 failed walks (Track R, Nov 4).
echo "== ratchet: axe and the walks"
node scripts/axe-routes.ts http://localhost:8798 > axe.log 2>&1 || { tail -20 axe.log; fail axe-routes; }
node scripts/approve-hold.ts http://localhost:8798 > hold.log 2>&1 || { tail -12 hold.log; fail approve-hold; }
# Run when this SHA's own check.yml runs them, which only skips a SHA from before these two. A probe deleted on its own fails here (Q, Nov 4); testing for the file skipped it in silence.
if grep -q design-holds.ts .github/workflows/check.yml; then node scripts/design-holds.ts http://localhost:8798 > design.log 2>&1 || { tail -12 design.log; fail design-holds; }; fi
if grep -q desk-walk.ts .github/workflows/check.yml; then node scripts/desk-walk.ts http://localhost:8798 > deskwalk.log 2>&1 || { tail -12 deskwalk.log; fail desk-walk; }; fi
# The wallet's screens: in the gate since it went stale for 4 days outside it (Nov 4).
node scripts/a3b-screens.ts http://localhost:8798/ > a3b.log 2>&1 || { tail -8 a3b.log; fail a3b-screens; }
tail -1 axe.log
node scripts/live-walks.ts http://localhost:8798 --quick > walks.log 2>&1 || { tail -24 walks.log; fail live-walks; }
tail -2 walks.log
stop 8798
# The Pages mirror (Lead-10, Nov 4): a moved link passed here and would only have failed at GitHub's `pages` run. Last, since
# this build replaces web/dist with one for the mirror's sub-path.
echo "== pages-smoke"
GOOSE_BASE=/gilded-goose/ VITE_WALLET=1 corepack pnpm --filter @goose/web build > pages-build.log 2>&1 || { tail -12 pages-build.log; fail pages-build; }
mkdir -p site && cp -r web/dist site/gilded-goose
clear_port 4196
(cd site && nohup python3 -m http.server 4196 >/dev/null 2>&1 &)
for i in $(seq 30); do curl -sf http://localhost:4196/gilded-goose/ >/dev/null && break; sleep 1; done
ours 4196
node scripts/pages-smoke.ts http://localhost:4196/gilded-goose/ > pages.log 2>&1 || { tail -20 pages.log; fail pages-smoke; }
tail -1 pages.log
stop 4196
# The build live ships (Lead-12, Nov 5): a tree that fit every line keyless was 569 B over on the rehearsal build, and this
# script passed it, since no step built the routing the keyed live build has. One build, last (it replaces web/dist, like
# pages-smoke's above, so every walk above stayed on the keyless build): Render's flags (VITE_WALLET=1, 4 B on every route)
# plus GOOSE_FLIP_REHEARSAL=1, which routes as the key does with no key (refused on Render). Its bytes are read first,
# each route held to its line less the licence's own bytes (--keyed); the walks that read this build (T's Studio gate)
# follow on this same web/dist, never a second build.
echo "== rehearsal: the build live ships"
# The rehearsal's licence date is today + 30 days in AG's words (Lead-12, Nov 6): a fixed "20 December 2026" shut the rehearsal's
# gate at 4 PM PT on Dec 19 and turned every Studio walk red on the calendar alone, blocking a hotfix under "nothing deploys on a
# red check". Live's date is AG's own, read from the key (web/vite.config.ts); Render refuses the rehearsal. licence-expiry-walk
# keeps its own fixed clock: the cut-over is its subject. core/test/rehearsal-expiry.test.ts runs this line.
STUDIO_EXPIRY=$(node -e 'process.stdout.write(new Date(Date.now() + 30 * 864e5).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }))')
GOOSE_FLIP_REHEARSAL=1 VITE_WALLET=1 GOOSE_STUDIO_EXPIRY="$STUDIO_EXPIRY" corepack pnpm --filter @goose/web build > rehearsal-build.log 2>&1 || { tail -12 rehearsal-build.log; fail rehearsal-build; }
node scripts/bundle-read.ts --keyed > rehearsal.log 2>&1 || { grep -E "^OVER|bundle-read" rehearsal.log; fail rehearsal-bytes; }
grep -E "bundle\.(classic|desk|wallet|site|site-shop) " rehearsal.log; tail -1 rehearsal.log
# Studio as live draws it (T and F, Nov 5): a build with no key draws the Community ledger, so nothing above ever opened the page live serves,
# and the flip stranded the tour at stop 10, dropped an open menu and focus, and shipped a row with no cell, with this all green. It walks
# R's rehearsal build just above, never a second one. On the Mac only (Lead-12, Nov 5): at 14 minutes GitHub's check.yml can't carry it. The tour's pill, axe and design
# holds run above on the Community build; before a push that touches Studio, run those three by hand on this same build.
echo "== flip: Studio drawn"
clear_port 8798
(cd server && PAYMENT=fake BUYER=rule PORT=8798 PUBLIC_URL=http://localhost:8798 WEB_URL=http://localhost:8798 PAYPAL_CLIENT_SECRET=ci.stand-in PAYPAL_ENVIRONMENT=SANDBOX nohup node src/main.ts > ../flip.log 2>&1 &)
for i in $(seq 30); do curl -sf http://localhost:8798/api/health >/dev/null && break; sleep 1; done
ours 8798
# The page served here is that rehearsal build (Q, Nov 5): only it prints the licence's date into its JS.
f=$(grep -rl "expiry:\"$STUDIO_EXPIRY\"" web/dist/assets | head -1)
[ -n "$f" ] && curl -sf http://localhost:8798/assets/${f##*/} | grep -q "expiry:\"$STUDIO_EXPIRY\"" || fail flip-dist
node scripts/studio-tour-doors.ts http://localhost:8798 > doors.log 2>&1 || { grep FAIL doors.log | head -20; tail -1 doors.log; fail tour-doors; }
tail -1 doors.log
node scripts/studio-flip-rehearsal.ts http://localhost:8798 > flip-walk.log 2>&1 || { grep FAIL flip-walk.log | head -20; fail flip-rehearsal; }
tail -1 flip-walk.log
# The white site's Under the hood draws Studio's pivot in the site's light names; a hovered row read #221b1f once (W2, Nov 11).
node scripts/hood-hover.ts http://localhost:8798 > hood-hover.log 2>&1 || { grep FAIL hood-hover.log | head -8; tail -3 hood-hover.log; fail hood-hover; }
tail -1 hood-hover.log
HANDOVER=only node scripts/keys-landed.ts http://localhost:8798 > flip-keys.log 2>&1 || { tail -12 flip-keys.log; fail flip-handover; }
tail -1 flip-keys.log
KEYLESS_STUDIO=1 node scripts/keyboard-tour.ts http://localhost:8798 > flip-kbd.log 2>&1 || { grep FAIL flip-kbd.log | head -12 | cut -c1-200; fail flip-keyboard; }
tail -1 flip-kbd.log
stop 8798
cd /; git -C $REPO worktree remove --force $WT 2>/dev/null
echo "LOCAL-CI PASS $SHA"

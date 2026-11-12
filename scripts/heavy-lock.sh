#!/bin/sh
# One heavy job at a time across the Mac: a full check, ci-local or a mutant run (the gate, DD seat 4, Nov 4). Load 66 turned a
# check red with 30-second timeouts and no wrong answer, and raising those limits would hide real slowness. Single builds and
# single suites stay out.
#   sh scripts/heavy-lock.sh <command...>
# Fails loudly and names the lock once the line has stood still for 40 minutes, so one hung holder can't stall everyone in silence.
# The wait counts from when the line last moved, not from arrival: first come, three long jobs ahead is a healthy wait, not a hang.
# First come, first served: lockf alone hands the lock to whichever waiter it wakes, and a stack run waited out its 40 minutes behind
# later arrivals. So each job takes a ticket in <lock>.queue, named by arrival second and pid, and only the oldest live ticket may try
# lockf. A killed job's ticket is swept: it holds its process's start time, so a reused pid can't keep a dead job in line. lockf is
# still the lock itself, so a job started by hand or from a worktree without this script can still barge in, and the ticket can't stop it.
# If the queue can't be written or read the job falls back to plain lockf: a queue must never be what stalls the Mac.
# It can't deadlock on itself: lockf stays alive above what it runs, so a lockf on this file among our ancestors means this job
# already holds it, whether ci-local took it, the check did, or someone typed `lockf -k <lock> corepack pnpm check` by hand. Only
# a process that IS lockf counts: a shell whose own line merely mentions it holds nothing (`lockf ... a; corepack pnpm check`).
LOCK=${GOOSE_HEAVY_LOCK:-/private/tmp/goose-heavy.lock}
WAIT=${GOOSE_HEAVY_WAIT:-2400}
QUEUE=$LOCK.queue

# A CI runner has no lockf and no neighbours.
command -v lockf >/dev/null 2>&1 || exec "$@"

pid=$$
while [ "${pid:-0}" -gt 1 ]; do
  parent=$(ps -o ppid= -p "$pid" 2>/dev/null) || break
  line=$(ps -o command= -p "$pid" 2>/dev/null) || break
  first=${line%% *}
  if [ "${first##*/}" = lockf ]; then
    case "$line" in *" $LOCK "*) exec "$@" ;; esac
  fi
  pid=$(echo $parent)
done

deadline=$(($(date +%s) + WAIT))
ticket=
trap 'rm -f "$ticket" "$QUEUE/.$$"' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# When a process started, in one spelling: ps pads it, and the words are all that count.
started_at() { set -- $(LC_ALL=C ps -o lstart= -p "$1" 2>/dev/null); echo "$*"; }

# The oldest ticket whose job is still alive. Ours is taken on trust; a dead one is cleared on the way past.
first_live() {
  for f in "$QUEUE"/*; do
    [ -e "$f" ] || continue
    if [ "$f" = "$ticket" ]; then echo "$f"; return; fi
    started=
    { IFS= read -r started < "$f"; } 2>/dev/null
    if [ -n "$started" ] && [ "$started" = "$(started_at "${f##*.}")" ]; then echo "$f"; return; fi
    rm -f "$f"
  done
}

give_up() {
  echo "HEAVY LOCK TIMEOUT: the line for $LOCK hasn't moved in $WAIT s, so this did not run: $*" >&2
  for f in "$QUEUE"/*; do
    [ "$f" = "$ticket" ] && break
    [ -e "$f" ] && echo "Ahead in line: pid ${f##*.}: $(sed -n 2p "$f" 2>/dev/null)" >&2
  done
  echo "Holding it now:" >&2
  lsof "$LOCK" >&2 2>/dev/null
  exit 75
}

# Named before it's written, so a stop at any point takes it with us. Written whole and then renamed, as a half-written ticket reads as dead.
ticket=$QUEUE/$(date +%s).$$
if mkdir -p "$QUEUE" 2>/dev/null \
  && printf '%s\n%s\n' "$(started_at $$)" "$*" > "$QUEUE/.$$" 2>/dev/null \
  && mv "$QUEUE/.$$" "$ticket" 2>/dev/null; then
  said=
  ahead=
  while :; do
    head=$(first_live)
    if [ -z "$head" ] || [ "$head" = "$ticket" ]; then break; fi
    if [ "$head" != "$ahead" ]; then ahead=$head; deadline=$(($(date +%s) + WAIT)); fi
    [ "$(date +%s)" -lt "$deadline" ] || give_up "$@"
    if [ -z "$said" ]; then echo "heavy lock: another heavy job is ahead of this one in $QUEUE; waiting in line, up to $WAIT s" >&2; said=1; fi
    sleep 1
  done
  # Reaching the front is the line moving too.
  [ -z "$ahead" ] || deadline=$(($(date +%s) + WAIT))
fi

lockf -k -t 0 "$LOCK" true 2>/dev/null || echo "heavy lock: another heavy job holds $LOCK; waiting up to $WAIT s" >&2
left=$((deadline - $(date +%s)))
[ "$left" -gt 0 ] || left=0
lockf -k -t "$left" "$LOCK" "$@"
rc=$?
if [ "$rc" -eq 75 ]; then give_up "$@"; fi
exit "$rc"

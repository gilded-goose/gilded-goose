// Whether live mode (the API) is answering, shared by every part of a page (H1). One probe loop per page: core's
// `followLive` asks /api/health now and every 15 s while it's away, then gives up after 3 minutes. A call that fails
// later (the host fell asleep after the page loaded) says so with `liveAway()`, which starts the loop again.

import { useEffect, useSyncExternalStore } from "react";
import { followLive, probeLive, type LiveState } from "@goose/core/live";

let state: LiveState = "checking";
let started = false;
let stop: (() => void) | null = null;
const subs = new Set<() => void>();
const waiting = new Set<(s: LiveState) => void>();

// R-12 (never claim beyond the code): navigator.onLine false is the one cause the code sees then. No probe runs, and a
// probe that came back away or gone while she was offline is "offline", so no reader blames the server for her network.
const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

function set(s: LiveState) {
  state = (s === "away" || s === "gone") && isOffline() ? "offline" : s;
  subs.forEach((f) => f());
  if (state !== "checking") { waiting.forEach((f) => f(state)); waiting.clear(); }
}

function follow() {
  started = true;
  stop?.();
  stop = null;
  if (isOffline()) { set("offline"); return; }
  stop = followLive(() => probeLive((url, init) => fetch(url, init)), set);
}

// R-11 part 2: the moment she's back the page asks again ("checking" at once, synchronously), so "away" or "gone" is
// only ever a probe made online. R-12: going offline is said at once, over any state ("up" included: a call can't reach
// the server offline either), and the loop stops until she's back.
if (typeof addEventListener === "function") {
  addEventListener("online", () => { if (started && state !== "up") follow(); });
  addEventListener("offline", () => { if (!started) return; stop?.(); stop = null; set("offline"); });
}

/** A call to the server just failed: live mode is away again, and the page goes back to asking (offline: says offline). */
export function liveAway(): void {
  follow();
}

/** The first answer (up, away, gone or offline), for a press that came before the probe finished. */
export function liveKnown(): Promise<LiveState> {
  if (!started) follow();
  return state === "checking" ? new Promise((r) => waiting.add(r)) : Promise.resolve(state);
}

export function useLive(): LiveState {
  useEffect(() => { if (!started) follow(); }, []);
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state, () => state);
}

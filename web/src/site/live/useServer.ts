// Is the server there? Read /api/health once on mount and every 60 s while the tab is visible, so the header's dot and
// every "Live" badge agree. One poll for the whole page, shared by every caller.
import { useSyncExternalStore } from "react";
import { getJson } from "./api.ts";

export type ServerState = "checking" | "live" | "away";

const EVERY_MS = 60_000;
let state: ServerState = "checking";
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

const set = (next: ServerState) => {
  if (next === state) return;
  state = next;
  for (const l of listeners) l();
};

async function check() {
  const h = await getJson<{ ok?: unknown }>("/api/health", undefined, 6000);
  set(h !== "away" && h.ok === true ? "live" : "away");
}

const onVisible = () => { if (document.visibilityState === "visible") void check(); };

function subscribe(on: () => void) {
  listeners.add(on);
  if (listeners.size === 1) {
    void check();
    timer = setInterval(() => { if (document.visibilityState === "visible") void check(); }, EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
  }
  return () => {
    listeners.delete(on);
    if (listeners.size === 0) {
      if (timer) clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

export function useServer(): ServerState {
  return useSyncExternalStore(subscribe, () => state, () => "checking");
}

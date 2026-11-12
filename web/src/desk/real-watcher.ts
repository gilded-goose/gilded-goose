// The ping's real trigger, on the page (Joshua, Nov 5 6:40 PM, THE PING level 1 (b); the seam agreed with Track P): while
// the tab is open, ask for her Watching list every ten minutes. The server reads a real watch only when it's due (at most
// once a day a watch, inside its caps: server/src/adapters/channel3-product.ts), so asking spends nothing more. Each read
// made during this visit at or under her price is pinged once (core/src/ask/real-ping.ts), through the one file that makes a
// notification (ping-notify.ts). Its own chunk, started by the Watching list the first time she has a real watch, so no
// route's first load carries it. Nothing is stored on a server: the visit's start and the pings sent live in this tab's
// sessionStorage and leave with it. It never buys, approves or reserves: a tap opens her Watching row.

import { realPingWords, realPings, stalePings, type PingFact, type RealRowRead } from "@goose/core/real-ping";
import { notify, unnotify } from "./ping-notify.ts";

export const REAL_EVERY_MS = 10 * 60_000;
/** Server and browser clocks differ: a read up to five minutes before this tab's first page counts as this visit's. */
export const CLOCK_SLACK_MS = 5 * 60_000;
const VISIT = "goose-visit-start";
const SENT = "goose-pinged-real";

const store = {
  get(k: string): string | null { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string): void { try { sessionStorage.setItem(k, v); } catch { /* private mode: pings only this page's */ } },
};

/** When this tab's visit began: its first page's start, kept for the tab's life. */
export function visitStart(): number {
  const kept = Number(store.get(VISIT));
  if (Number.isFinite(kept) && kept > 0) return kept;
  const at = Math.floor(performance.timeOrigin);
  store.set(VISIT, String(at));
  return at;
}

function sent(): Set<string> {
  try { const v = JSON.parse(store.get(SENT) ?? "[]") as unknown; return new Set(Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : []); } catch { return new Set(); }
}

let running: { stop: () => void; check: () => void } | null = null;

/** The row's mark in the Watching list (Panes.tsx puts it on each real row's card). */
export const realMark = (productId: string, domain: string) => `${productId}@${domain}`;

/**
 * A tap on a real ping opens her Watching row and nothing else: no deal, no button pressed for her. On the Desk the room
 * opens in place (`goose:room`, the same event voice uses); anywhere else, the Desk's own address for it. Then the row is
 * scrolled to and takes focus, so a keyboard or screen reader lands where her eyes do.
 */
export function openRealRow(row: { productId: string; domain: string }): void {
  try { window.focus(); } catch { /* some browsers refuse; the page still opens */ }
  const here = !dispatchEvent(new CustomEvent("goose:room", { detail: "wants", cancelable: true }));
  if (!here) { location.assign(`${location.pathname}?desk=1#wants`); return; }
  const mark = realMark(row.productId, row.domain);
  let tries = 0;
  // The Desk gives an opened room's heading focus a frame or more after it opens (Desk.tsx menuAct), so her row takes
  // focus only after that: once the heading has it, or after about a second if it never does. Else the heading wins.
  const find = () => {
    const card = [...document.querySelectorAll<HTMLElement>("[data-real]")].find((el) => el.dataset.real === mark);
    const head = document.querySelector(ROOM_HEAD);
    if (card && ((head !== null && document.activeElement === head) || tries >= 13)) { card.scrollIntoView({ block: "center" }); card.focus({ preventScroll: true }); return; }
    if (++tries < 40) setTimeout(find, 75); // the room's chunk may still be coming: up to 3 s
  };
  setTimeout(find, 75);
}

/** The opened room's heading, as the Desk finds it to focus it (Desk.tsx menuAct's focusHead). */
export const ROOM_HEAD = "#root .dk-work .dk-pane-h";

/**
 * Starts the watcher once per page (a second call only checks now: right after a real Set your price). A tap opens the
 * pinged row (`openRealRow`).
 */
/** The pings this page showed and can still take back, by their key. */
const shown = new Map<string, PingFact>();

export function watchReal(onOpen: (row: { productId: string; domain: string }) => void = openRealRow): () => void {
  if (running) { running.check(); return running.stop; }
  const since = visitStart() - CLOCK_SLACK_MS;
  let busy = false;
  const check = async () => {
    if (busy) return;
    busy = true;
    try {
      const r = await fetch("/api/runs/wants", { credentials: "same-origin", cache: "no-store" });
      if (!r.ok) return;
      const body = (await r.json()) as { real?: unknown };
      const rows = Array.isArray(body.real) ? (body.real as RealRowRead[]) : [];
      for (const key of stalePings(rows, [...shown.values()])) { unnotify(key); shown.delete(key); }
      const done = sent();
      for (const p of realPings(rows, since, done)) {
        done.add(p.key);
        store.set(SENT, JSON.stringify([...done]));
        const w = realPingWords(p);
        if (notify(w.title, w.body, p.key, () => onOpen({ productId: p.productId ?? "", domain: p.where }))) shown.set(p.key, p);
      }
    } catch { /* offline or a bad answer: the next check tries again */ } finally { busy = false; }
  };
  const timer = setInterval(() => void check(), REAL_EVERY_MS);
  void check();
  const stop = () => { clearInterval(timer); running = null; };
  running = { stop, check: () => void check() };
  return stop;
}

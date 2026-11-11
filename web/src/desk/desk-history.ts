// Back, Forward and reload on the Desk (Round 5's shopper seat, B1). A run and the rooms happen in place, on one address, so with
// no entries of their own Back left the site from a deal, and a reload lost it. Each place gets an entry; each entry remembers what
// lies under it, so leaving a place by a button walks back to the entry already there instead of stacking a new one, and Back then
// never lands on a press that does nothing. The address never changes, so nothing here touches the hash rules (menu-hash.ts).

import { step, type Entry, type Place } from "./desk-step.ts";

export type { Place };

/** What this history entry says the page is showing. An entry that isn't ours (the first, or a hash link's) is the landing. */
export function entryNow(): Entry {
  const s = history.state as Partial<Entry> | null;
  return { dk: s?.dk ?? null, below: Array.isArray(s?.below) ? s.below : [] };
}

/** Moves history to match the page. The entry left behind stops restoring its scroll: its layout is gone by the time it would
 *  (a landing behind a run), and a Back lands itself (Desk's onPop). */
export function followPlace(place: Place): void {
  const s = step(entryNow(), place);
  if (!s) return;
  if ("go" in s) history.go(s.go);
  else if ("push" in s) { history.scrollRestoration = "manual"; history.pushState(s.push, ""); }
  else history.replaceState(s.replace, "");
}

/** What a reload brings back: this tab only, like the run and undo key (keep-run), and never a cart. */
const KEY = "gg-desk-run";
export interface Kept<R, M> { asked: string; read: R | null; market: M | null }
export function keepDesk<R, M>(k: Kept<R, M>): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(k)); } catch { /* a private window or a full store: a reload starts over, as before */ }
}
export function keptDesk<R, M>(): Kept<R, M> | null {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Kept<R, M> | null; } catch { return null; }
}

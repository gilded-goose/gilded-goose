// Goose suggests (Joshua, Nov 11): one ready-made ask, from the newest cart this shopper paid for. The rule, in code:
// - WHICH cart: the server's own ledger rows for this browser's session (the stream the Shop already has open). A cart
//   is paid exactly as memory's fold reads it (core/src/ask/memory.ts `foldMemory`): PayPal's `captured` row, verdict ok,
//   with a price, inside the rolling week, not refunded since. Held, voided, cancelled, capture-failed and unpaid carts
//   write no such row, so they never count. Stricter than the fold in two ways: the seeded week is simulated history, not
//   hers, so it never suggests; and a refund counts by its run as well as by its capture id. A practice payment (the
//   server's stand-in for PayPal) writes the same captured row, so it counts here as it does in the fold, and the chip's
//   line then says "practice cart you approved", never "paid" (`goose-suggests.test.ts` holds the two rules together).
// - WHAT words: only what was in her ask box for that cart (typed, pasted, or a site example she tapped), kept in this
//   tab's sessionStorage when she opened its approve sheet
//   and tied to the cart by its run id. Nothing is read from a row but its actor, action, verdict, source, time, run id,
//   capture id and whether it has a price: never `why`, `quoted`, `fenced`, a merchant, an item title or a note, so no
//   seller's or model's string has a field to arrive in. Words a tool put in the box (the mic's transcript, a photo's
//   read) are not hers word for word, so a page load that used one keeps nothing.
// - ONE chip, the newest paid cart's or none: no falling back to an older cart, so "a cart you paid for" names one cart.
// - FORGET beside it wipes every kept ask from this tab (`forgetAsks`): a place that keeps her words has its wipe control.
// Tapping it fills the ask box and nothing else (Suggest.tsx); this file only reads rows and this tab's own storage.
import type { LedgerEvent } from "@goose/core";

/** The guard's rolling week, as memory.ts writes it (goose-suggests.test.ts holds the two folds to the same week). */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** A run id as the server mints it: six random bytes in hex. Anything else is not a storage key here. */
const RUN = /^[0-9a-f]{12}$/;
/** The ask being approved, and the carts this tab already had when its sheet opened. */
export const ASKING = "gg-asking";
/** The ask a cart was made for, by run id. */
export const ASKED = "gg-asked:";
/** pay.ts writes this for every cart this tab makes (the receipt's recap); here it only says "this tab made that cart". */
const RECAP = "gg-recap:";
/** AskTools.tsx writes the page load's time origin here when the mic or a photo puts words in an ask box. */
export const TOOL = "gg-tool";
/** Longer asks get no chip: a pill has to fit a phone's width in two lines. */
export const SUGGEST_MAX = 80;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

/** Her words as a chip may show them, or null: plain text of 2 to 80 characters, no control or direction-flipping characters. */
export function ownWords(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const w = raw.replace(/\s+/g, " ").trim();
  if (w.length < 2 || w.length > SUGGEST_MAX || /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/.test(w)) return null;
  return w;
}

/** Whether her ask is one of the site's own example chips (already offered beside it), whatever its capitals. */
export const isExample = (words: string, examples: readonly string[]): boolean => examples.some((x) => x.toLowerCase() === words.toLowerCase());

/** Her paid runs, newest first (the rule at the top of this file). */
export function paidRuns(rows: readonly LedgerEvent[], now: number): string[] {
  const refunds = rows.filter((e) => e.actor === "paypal" && e.action === "refunded");
  const refunded = new Set<unknown>(refunds.flatMap((e) => [e.data?.captureId, e.runId]).filter((id) => typeof id === "string"));
  const out: string[] = [];
  for (const e of rows) {
    if (e.actor !== "paypal" || e.action !== "captured" || e.verdict !== "ok" || e.price === undefined) continue;
    // Her own money only: a market cart, a live run or a recorded run she paid. Seeded, attack and ask rows never.
    if (e.source !== "market" && e.source !== "live" && e.source !== "recorded") continue;
    if (typeof e.runId !== "string" || !RUN.test(e.runId)) continue;
    if (!(e.t > now - WEEK_MS && e.t <= now)) continue;
    if (refunded.has(e.runId) || refunded.has(e.data?.captureId)) continue;
    out.push(e.runId);
  }
  return [...new Set(out.reverse())];
}

/** The carts this tab made, by run id. */
function carts(s: Store): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k?.startsWith(RECAP) && RUN.test(k.slice(RECAP.length))) out.push(k.slice(RECAP.length));
  }
  return out;
}

function asking(s: Store): { words: string; had: string[] } | null {
  try {
    const p = JSON.parse(s.getItem(ASKING) ?? "null") as { words?: unknown; had?: unknown } | null;
    const words = ownWords(p?.words);
    return words && Array.isArray(p?.had) ? { words, had: p.had.filter((x): x is string => typeof x === "string") } : null;
  } catch { return null; }
}

/**
 * Tie each cart this tab made since the note was written to the note's ask. It fails closed: Shop.tsx drops the old note
 * the moment a sheet opens, before this file is even fetched, so a cart made while the chunk is still loading (or made
 * when it never loads) finds no note, or is already listed in the new note's `had`, and is tied to nothing. A cart with
 * no tie gets no chip; it never borrows an older ask.
 */
function settle(s: Store): void {
  const p = asking(s);
  if (!p) return;
  for (const id of carts(s)) if (!p.had.includes(id)) s.setItem(ASKED + id, p.words);
}

/** Whether the mic or a photo put words in an ask box on this page load. */
export const toolUsed = (s: Store, origin: number): boolean => s.getItem(TOOL) === String(origin);

/** The approve sheet opened for these words: note them as the ask the next cart is for, or note nothing if a tool wrote them. */
export function keep(s: Store, words: unknown, tool: boolean): void {
  const w = tool ? null : ownWords(words);
  if (w) s.setItem(ASKING, JSON.stringify({ words: w, had: carts(s) }));
  else s.removeItem(ASKING);
}

/** Forget: wipe every ask this tab kept and the note in progress. The chip is then gone, and stays gone after a reload. */
export function forgetAsks(s: Store): void {
  const keys: string[] = [];
  for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k !== null && (k === ASKING || k.startsWith(ASKED))) keys.push(k); }
  for (const k of keys) s.removeItem(k);
}

/** The one suggestion, or null: what was in her ask box for the newest cart she paid for. */
export function suggestion(rows: readonly LedgerEvent[], s: Store, now: number): string | null {
  settle(s);
  const newest = paidRuns(rows, now)[0];
  return newest === undefined ? null : ownWords(s.getItem(ASKED + newest));
}

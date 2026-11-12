// "Things to try" (the Desk's slice 5; Joshua, Fri Oct 30): eight things a visitor can do, each ticked by the real event,
// never by a tap on the list, with "N of 8 tried" kept in this browser only. Pure.
//
// Up to seven ticks come from the session's own ledger rows (`triedFromRows`, read on the server: GET /api/runs/session/tried):
// an Ask or a photo is its `writeAsk` row once the Ask routes write one (checked chips only, never the words or the
// image, N10), a trick is a
// test-of-the-guard row, Approve is PayPal holding or taking the money after the shopper's tap, Undo is PayPal's refund,
// a price swap is the staged seller's row, and the market is a row from a market run. Opening Behind the scenes writes
// nothing, so the page ticks it when the panel opens. The page also ticks an Ask or a photo when the server's answer
// arrives (chips, a photo read), for the routes that don't write an Ask row yet; both are the real event.

import { isShoppers, type LedgerEvent } from "../ledger/events.ts";

export type TryKey = "ask" | "photo" | "trick" | "swap" | "approve" | "undo" | "market" | "behind";

/** The list, in the order the Desk shows it. `from` says what ticks it: a ledger row, or the page on the server's answer. */
export const TRIES: readonly { key: TryKey; label: string; from: "ledger" | "page" }[] = [
  // The page ticks these on the server's answer today; once the Ask routes write `writeAsk` rows, the ledger does too.
  { key: "ask", label: "Ask for anything", from: "page" },
  { key: "photo", label: "Snap a photo", from: "page" },
  { key: "trick", label: "Try to trick Goose", from: "ledger" },
  { key: "swap", label: "Try a price swap", from: "ledger" },
  { key: "approve", label: "Approve with PayPal", from: "ledger" },
  { key: "undo", label: "Undo it", from: "ledger" },
  { key: "market", label: "Shop the market", from: "ledger" },
  { key: "behind", label: "Look behind the scenes", from: "page" },
];

const KEYS: ReadonlySet<string> = new Set(TRIES.map((t) => t.key));
export const isTryKey = (k: unknown): k is TryKey => typeof k === "string" && KEYS.has(k);

/**
 * Every try one ledger row proves (often none), in the list's order: the one rule the server's route and the page's
 * stream both use. Seeded rows prove nothing: the seeded week is the demo's, not the visitor's. Approve is only PayPal
 * holding or taking the money (an order created comes before the tap, and a failed capture took nothing), from any
 * shopper source, the market's included; any row of a market run proves the market (a cart was put in).
 */
export function triedOf(e: LedgerEvent): TryKey[] {
  if (e.source === "attack") return ["trick"];
  // An Ask's row (`writeAsk`): checked chips only, and how it was asked; a photo's is "Snap a photo".
  if (e.source === "ask") return e.actor === "shopper" && e.action === "ask" ? [e.data?.how === "photo" ? "photo" : "ask"] : [];
  if (!isShoppers(e)) return [];
  const got = new Set<TryKey>();
  if (e.actor === "seller" && e.action === "price-swap") got.add("swap");
  if (e.actor === "paypal" && e.verdict === "ok" && (e.action === "captured" || e.action === "authorized")) got.add("approve");
  if (e.actor === "paypal" && e.verdict === "ok" && e.action === "refunded") got.add("undo");
  if (e.source === "market") got.add("market");
  return TRIES.map((t) => t.key).filter((k) => got.has(k));
}

/** Every try the rows prove, in the list's order. */
export function triedFromRows(rows: readonly LedgerEvent[]): TryKey[] {
  return mergeTried([], rows.flatMap(triedOf));
}

/**
 * What this browser keeps: the keys only, as JSON. Anything unreadable (an old shape, a hand edit, junk) reads as
 * nothing tried, never as a tick, and unknown keys are dropped.
 */
export function parseTried(raw: string | null | undefined): TryKey[] {
  if (!raw) return [];
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(v)) return [];
  const got = new Set(v.filter(isTryKey));
  return TRIES.map((t) => t.key).filter((k) => got.has(k));
}

/** The union of what's kept and what's new, in the list's order (a tick is never taken back). */
export function mergeTried(kept: readonly TryKey[], add: readonly TryKey[]): TryKey[] {
  const got = new Set([...kept, ...add]);
  return TRIES.map((t) => t.key).filter((k) => got.has(k));
}

/** The browser's storage as the keeper uses it (localStorage's shape). */
export interface TriedStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
/** Where this browser keeps its ticks: keys only, never what was asked or written. */
export const TRIED_KEY = "gg-tried-v1";

/**
 * This browser's ticks. Storage may be missing or throw on any touch (a private window, blocked site data, a sandboxed
 * frame), and then the page still works: ticks live in memory for this page's life. `storage` is a function because
 * even reading `window.localStorage` can throw.
 */
export class TriedKeeper {
  private mem: TryKey[] = [];
  private readonly storage: () => TriedStorage | null;
  constructor(storage: () => TriedStorage | null) {
    this.storage = storage;
  }

  read(): TryKey[] {
    try {
      const s = this.storage();
      return s ? mergeTried(parseTried(s.getItem(TRIED_KEY)), this.mem) : this.mem;
    } catch { return this.mem; }
  }

  /** Adds the real event's ticks (unknown keys dropped) and returns them all; never takes one back. */
  add(keys: readonly unknown[]): TryKey[] {
    const next = mergeTried(this.read(), keys.filter(isTryKey));
    this.mem = next;
    try { this.storage()?.setItem(TRIED_KEY, JSON.stringify(next)); } catch { /* blocked: kept in memory only */ }
    return next;
  }
}

/** "3 of 8 tried". */
export const triedWords = (tried: readonly TryKey[]): string => `${new Set(tried.filter(isTryKey)).size} of ${TRIES.length} tried`;

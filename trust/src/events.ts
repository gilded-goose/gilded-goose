// The decision ledger: one append-only list of events that every other part of
// Gilded Goose reads from (why-lines, chart markers, the dial's record, the
// seeded replay, the AG Grid view). ADR 0001: every event is versioned and
// owner-scoped so wish lists and family circles can filter by audience later.

import { DAY_MS } from "./deps.ts";

export const LEDGER_VERSION = 1 as const;

export type Actor = "shopper" | "buyer" | "seller" | "guard" | "code" | "cart" | "fence" | "auditor" | "watcher" | "dial" | "paypal";

/** Which trust layer produced the event, when one did. */
export type Layer = 1 | 2 | 3 | 4 | 5;

export type Verdict = "ok" | "refused" | "flagged" | "asked";

/**
 * Where a row came from (N19): the seeded week, a recorded run replayed, a live run, a cart from the market (PayPal
 * additions 5: the shopper's own money, never a clean cart for the dial), an attack on "try to break it", or an Ask
 * (Desk-B: its checked chips only, never the words; no money and no record).
 */
export type Source = "seeded" | "recorded" | "live" | "market" | "attack" | "ask";

/**
 * Which sources are the shopper's own money and record: only these reach the week and the dial (N19). Seeded rows are
 * simulated history, shown with their label; attack rows are someone testing the guard. A Record, so a new source can't
 * be added without deciding this.
 */
export const COUNTS_AS_SHOPPERS: Readonly<Record<Source, boolean>> = { seeded: false, recorded: true, live: true, market: true, attack: false, ask: false };

/** A row the week and the dial may count. A row with no source (written before F1, or by one run's own ledger) is the shopper's; a shopper ledger refuses one. */
export const isShoppers = (e: LedgerEvent): boolean => e.source === undefined || COUNTS_AS_SHOPPERS[e.source] === true;

/** Whole UTC days since the epoch: the only way a row's clock time becomes a date (N6). */
export const dayOf = (t: number): number => Math.floor(t / DAY_MS);

export interface LedgerEvent {
  v: typeof LEDGER_VERSION;
  /** Monotonic sequence inside one store (a run's own ledger, or a shopper's across runs); the store assigns it. */
  seq: number;
  /** Simulated time in ms, from the injected clock (never Date.now). */
  t: number;
  shopperId: string;
  visibility: "owner" | "circle" | "public";
  actor: Actor;
  /** Short machine-readable action, e.g. "offer", "counter", "accept", "refuse". */
  action: string;
  /** Money as a string in minor-safe decimal ("42.00"), never a float. */
  price?: string;
  currency?: string;
  sellerId?: string;
  round?: number;
  layer?: Layer;
  verdict?: Verdict;
  /** The one-line "why". Every event has one; an empty why fails the test. */
  why: string;
  /** Free text that came from a seller. Quoted data for the UI, never instructions. */
  quoted?: string;
  /**
   * A store name or item title withheld from `why` and `data` (not name-shaped, or it carries the Watcher's evidence;
   * 018 N8): quoted here for the UI, never instructions. Absent when the name is shown as written.
   */
  fenced?: { merchant?: string; item?: string };
  /** Anything structured the UI or tests need, kept small and JSON-safe. */
  data?: Record<string, string | number | boolean | null>;
  /** The run that wrote this row (N19). The shopper ledger stamps it; absent from a run's own ledger and old fixtures. */
  runId?: string;
  /** Where the row came from (N19), stamped with `runId`. */
  source?: Source;
  /** `dayOf(t)`, stamped with `runId`, never typed (N6): every date the wallet shows is one of these. */
  day?: number;
}

export type NewEvent = Omit<LedgerEvent, "v" | "seq">;

export interface LedgerStore {
  append(e: NewEvent): LedgerEvent;
  read(since?: number): LedgerEvent[];
  /** Subscribe to new events; returns an unsubscribe. Used by SSE and the UI. */
  on(listener: (e: LedgerEvent) => void): () => void;
}

/** In-memory store (ADR 0003). Server and browser both use it; a JSON file or DB comes later. */
export class MemoryLedger implements LedgerStore {
  private events: LedgerEvent[] = [];
  private listeners = new Set<(e: LedgerEvent) => void>();

  append(e: NewEvent): LedgerEvent {
    if (!e.why || e.why.trim() === "") throw new Error("ledger: every event needs a why");
    // Frozen, data too: "Rows are only added, never changed" (row p-promise-hide) holds by construction.
    if (e.data) Object.freeze(e.data);
    const full: LedgerEvent = Object.freeze({ v: LEDGER_VERSION, seq: this.events.length, ...e });
    this.events.push(full);
    for (const l of this.listeners) l(full);
    return full;
  }

  read(since = 0): LedgerEvent[] {
    return this.events.slice(since);
  }

  /** How many rows it holds, without copying them (H2: the session store's row budget reads this). */
  get size(): number {
    return this.events.length;
  }

  on(listener: (e: LedgerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/**
 * One shopper's ledger (N19, ADR draft 0014): the seeded week and every run, one per session token, so the weekly
 * total, the dial's record and the in-flight hold span runs (020 W8, W11, W12). Each run writes through its own view
 * (`run`), which stamps its id, source and day on every row; `seq` counts across the whole ledger.
 */
export class ShopperLedger extends MemoryLedger {
  run(runId: string, source: Source): RunLedger {
    return new RunLedger(this, runId, source);
  }

  /**
   * Only stamped rows: a row with no run, source or clock day would read as the shopper's own money (`isShoppers`), so
   * it is refused, never counted. Runs write through `run`, which stamps all three.
   */
  append(e: NewEvent): LedgerEvent {
    if (e.runId === undefined || e.source === undefined || e.day !== dayOf(e.t)) throw new Error("shopper ledger: write through a run, which stamps runId, source and day");
    return super.append(e);
  }
}

/** One run's view of its shopper's ledger: it writes stamped rows into the one ledger and reads back only its own. */
export class RunLedger implements LedgerStore {
  // Explicit fields, not constructor parameter properties: Node's type stripping runs core as-is.
  /** The whole ledger: what the guard reads the week from, so a new run can't start the week again (W8). */
  readonly shopper: ShopperLedger;
  readonly runId: string;
  readonly source: Source;
  constructor(shopper: ShopperLedger, runId: string, source: Source) {
    this.shopper = shopper;
    this.runId = runId;
    this.source = source;
  }

  append(e: NewEvent): LedgerEvent {
    // Stamped last, so no caller can write a row into another run, relabel it or give it a date its clock didn't make.
    return this.shopper.append({ ...e, runId: this.runId, source: this.source, day: dayOf(e.t) });
  }

  read(since = 0): LedgerEvent[] {
    return this.shopper.read().filter((e) => e.runId === this.runId).slice(since);
  }

  on(listener: (e: LedgerEvent) => void): () => void {
    return this.shopper.on((e) => { if (e.runId === this.runId) listener(e); });
  }
}

/** Stable JSON for replay-equals-engine comparisons: same events, same bytes. */
export function serializeLedger(events: LedgerEvent[]): string {
  return JSON.stringify(events);
}

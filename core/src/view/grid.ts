// The "Every decision" ledger as grid rows (Track C, docs/guild/022-ag-grid-ledger.md). Pure: the AG Grid view on
// desktop and the cards under 768 px both read these rows, so a row the ledger holds is a row on screen and nothing
// else is (Lessons 21, 22). Rows come from `fold` (the shopper fold's grid rows), so repeats fold and counts sum.
// A row click jumps to "the moment": the ledger as it stood at that `seq`, drawn by the same `laneModel`.

import { toCents, type Cents, usdOf } from "../money.ts";
import type { Actor, Layer, LedgerEvent, Verdict } from "../ledger/events.ts";
import { fold, laneModel, type Folded, type LaneModel } from "./lanes.ts";
import { LOCAL_DONE } from "./local-done.ts";

/** Who wrote a row, grouped for the filter chips. Every `Actor` has one (a Record, so a new actor needs a decision). */
export type ActorGroup = "seller" | "agent" | "code" | "watcher" | "paypal" | "you";
export const ACTOR_GROUP: Readonly<Record<Actor, ActorGroup>> = {
  seller: "seller", buyer: "agent", guard: "code", code: "code", cart: "code", fence: "code", dial: "code", auditor: "watcher", watcher: "watcher", paypal: "paypal", shopper: "you",
};
export const ACTOR_CHIPS: readonly { key: ActorGroup; label: string }[] = [
  { key: "seller", label: "Sellers" }, { key: "agent", label: "The AI agent" }, { key: "code", label: "Code" },
  { key: "watcher", label: "Watcher" }, { key: "paypal", label: "PayPal" }, { key: "you", label: "You" },
];

/** The five trust layers (PROFILE, hard rules) and the haggle itself, which no layer wrote. */
export type LayerKey = "haggle" | `${Layer}`;
export const LAYER_CHIPS: readonly { key: LayerKey; label: string }[] = [
  { key: "haggle", label: "The haggle" }, { key: "1", label: "1 · Seller text is data" }, { key: "2", label: "2 · Limits in code" },
  { key: "3", label: "3 · One exact cart" }, { key: "4", label: "4 · Watcher" }, { key: "5", label: "5 · The dial" },
];

/** The layer in a grid cell, where the chip's full name won't fit beside the why. */
export const LAYER_SHORT: Readonly<Record<LayerKey, string>> = { haggle: "haggle", "1": "1 · seller text", "2": "2 · limits", "3": "3 · one cart", "4": "4 · Watcher", "5": "5 · dial" };

/**
 * PayPal's webhook events as ledger rows (the seam for Track A+B's signed webhook, 021 step A6). A row is
 * `actor: "paypal"`, `layer: 3`, with `data.eventId` (PayPal's event id), `data.eventType` (PayPal's own name),
 * `data.verified` (the signature check passed) and `data.matched` (false: no cart in this ledger has its order).
 * Unknown types still show, under PayPal's own name, so nothing PayPal sends is hidden.
 */
export const PAYPAL_EVENTS: Readonly<Record<string, string>> = {
  "PAYMENT.AUTHORIZATION.CREATED": "authorization created",
  "PAYMENT.AUTHORIZATION.VOIDED": "authorization voided",
  "PAYMENT.CAPTURE.COMPLETED": "capture completed",
  "PAYMENT.CAPTURE.REFUNDED": "refunded",
};

export type Tone = "refused" | "scam" | "asked" | "unmatched" | "differs" | "plain";

export interface GridRow {
  /** The row id and the moment a click jumps to (a folded row jumps to its first). */
  seq: number;
  /** The rows folded into this one; `count` = 1 + also.length. */
  also: number[];
  count: number;
  round: number | null;
  actor: ActorGroup;
  /** Who, in words: a store's name, never a seller id (Lesson 17). */
  who: string;
  /** What it did, in words. */
  did: string;
  price: string | null;
  /** Cents for sorting; null with no price. */
  cents: Cents | null;
  layer: LayerKey;
  layerLabel: string;
  /** The rule that decided it (`data.rule`), or null. */
  rule: string | null;
  verdict: Verdict | null;
  why: string;
  /** Seller text, quoted: never instructions. */
  quoted: string | null;
  /** A store name or title withheld from `why` (W32), quoted. */
  fenced: string | null;
  /** Where the agent's move came from, e.g. "recorded · Claude Haiku 5.5 · 2026-10-23", or null. */
  label: string | null;
  /** A refusal is red; an offer from a seller the Watcher refused points at that refusal (`refusedAt`). */
  tone: Tone;
  refusedAt: number | null;
  /** PayPal's event id, on a webhook row. */
  eventId: string | null;
}

const plain = (m: string) => m.replace(" (fictional)", "");
const VERBS: Record<string, string> = {
  offer: "offer", counter: "counter", accept: "accept", walk: "walk away", wait: "wait", "propose-counter": "proposed counter", "propose-accept": "proposed accept",
  "worst-case": "set the limit", refuse: "refused", ask: "asked you", buy: "bought", done: "run finished", capturing: "capturing",
  "order-created": "order created", captured: "captured", "capture-failed": "capture failed", authorized: "money held", voided: "hold released", "price-swap": "changed the price", shipped: "shipped", "ship-unconfirmed": "tracking unconfirmed", "dispute-none": "no dispute listed", "dispute-open": "dispute open", "dispute-resolved": "dispute resolved", "dispute-listed": "dispute listed", "dispute-unchecked": "dispute unchecked", "reconcile-agrees": "PayPal agrees", "reconcile-differs": "PayPal's record differs", "reconcile-pending": "not on PayPal's report yet", "reconcile-unchecked": "report unchecked", "void-failed": "release unconfirmed", "capture-mismatch": "captured, wrong amount", unavailable: "unavailable", error: "error", cancel: "cancelled",
};
const WHO: Partial<Record<Actor, string>> = { guard: "Code (guard)", code: "Code (bid check)", cart: "Code (cart check)", fence: "Code (seller-text check)", dial: "Code (dial)", auditor: "Auditor", watcher: "Watcher", paypal: "PayPal", shopper: "You" };

function source(e: LedgerEvent): string | null {
  const s = e.data?.source;
  if (e.actor !== "buyer" || s === undefined) return null;
  if (s === "rule") return "plain rule, no AI";
  if (s === "rule-fallback") return "plain rule (the AI fell back)";
  if (s === "recorded") return `recorded · ${String(e.data?.modelLabel ?? "AI")} · ${String(e.data?.recordedOn ?? "")}`;
  return "Claude Haiku 5.5, live";
}

/** One folded ledger row as a grid row. `names` maps seller ids to store names; `refusals` seller ids to the Watcher's refusal seq. */
export function gridRow(f: Folded, names: ReadonlyMap<string, string>, refusals: ReadonlyMap<string, number>): GridRow {
  const e = f.e;
  const group = ACTOR_GROUP[e.actor];
  const layer: LayerKey = e.layer === undefined ? "haggle" : `${e.layer}`;
  const store = e.sellerId ? names.get(e.sellerId) ?? null : null;
  const eventType = e.actor === "paypal" && typeof e.data?.eventType === "string" ? e.data.eventType : null;
  const rule = typeof e.data?.rule === "string" && e.data.rule !== "" ? e.data.rule.split(",").join(", ") : null;
  const who = e.actor === "seller" ? store ?? "a seller"
    : e.actor === "buyer" ? `The AI agent${store ? ` → ${store}` : ""}`
    : e.actor === "paypal" && eventType ? "PayPal (webhook)"
    : e.actor === "watcher" && store ? `Watcher → ${store}`
    : WHO[e.actor] ?? e.actor;
  // The one verb (POL-3): the Watcher's refusal is "set aside" on its stamp, as on every other screen; code still refuses.
  const did = eventType ? PAYPAL_EVENTS[eventType] ?? eventType : e.actor === "watcher" && e.action === "refuse" ? "set aside" : VERBS[e.action] ?? e.action;
  const refusedAt = e.actor === "seller" && e.sellerId ? refusals.get(e.sellerId) ?? null : null;
  const unmatched = eventType !== null && e.data?.matched === false;
  const tone: Tone = e.verdict === "refused" ? "refused" : unmatched ? "unmatched" : e.actor === "paypal" && e.action === "reconcile-differs" ? "differs" : refusedAt !== null ? "scam" : e.verdict === "asked" ? "asked" : "plain";
  const fenced = [e.fenced?.merchant, e.fenced?.item].filter((x): x is string => typeof x === "string").join(" · ") || null;
  return {
    seq: e.seq, also: f.also, count: f.count, round: e.round ?? null, actor: group, who, did,
    price: e.price === undefined ? null : `${usdOf(e.price)}`, cents: e.price === undefined ? null : toCents(e.price),
    layer, layerLabel: LAYER_CHIPS.find((c) => c.key === layer)!.label, rule, verdict: e.verdict ?? null, why: e.why,
    quoted: e.quoted ?? null, fenced, label: source(e), tone, refusedAt,
    eventId: eventType && typeof e.data?.eventId === "string" ? e.data.eventId : null,
  };
}

/** The grid's rows from the ledger: folded (`fold`, the shopper fold's grid rows), one grid row per folded row. */
export function gridRows(events: LedgerEvent[]): GridRow[] {
  const names = new Map(events.filter((e) => e.actor === "seller" && e.sellerId).map((e) => [e.sellerId!, plain(String(e.data?.merchant ?? e.sellerId))]));
  const refusals = new Map<string, number>();
  for (const e of events) if (e.actor === "watcher" && e.verdict === "refused" && e.sellerId && !refusals.has(e.sellerId)) refusals.set(e.sellerId, e.seq);
  return fold(events).map((f) => gridRow(f, names, refusals));
}

/** The chips: which layers and actors show. An empty set shows all of that kind. */
export interface Chips { layers: ReadonlySet<LayerKey>; actors: ReadonlySet<ActorGroup> }
export const NO_CHIPS: Chips = { layers: new Set(), actors: new Set() };

export function passesChips(r: GridRow, c: Chips): boolean {
  return (c.layers.size === 0 || c.layers.has(r.layer)) && (c.actors.size === 0 || c.actors.has(r.actor));
}

/** The words quick search reads, for the cards (the grid's quick filter reads its own columns). */
export function searchText(r: GridRow): string {
  return [r.seq, r.who, r.did, r.price, r.layerLabel, r.rule, r.why, r.quoted, r.fenced, r.label, r.eventId].filter((x) => x !== null).join(" ").toLowerCase();
}

/** Every word typed appears somewhere in the row (AG Grid's quick filter matches the same way). */
export function passesSearch(r: GridRow, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const text = searchText(r);
  return words.every((w) => text.includes(w));
}

/** Counts for the chips: how many rows each would show, from the same rows. */
export function chipCounts(rows: GridRow[]): { layers: Record<LayerKey, number>; actors: Record<ActorGroup, number> } {
  const layers = Object.fromEntries(LAYER_CHIPS.map((c) => [c.key, 0])) as Record<LayerKey, number>;
  const actors = Object.fromEntries(ACTOR_CHIPS.map((c) => [c.key, 0])) as Record<ActorGroup, number>;
  for (const r of rows) { layers[r.layer] += r.count; actors[r.actor] += r.count; }
  return { layers, actors };
}

/**
 * Where things stood at a row, from the rows up to it. After a deal the phase follows the money: `deal` (accepted, code
 * hasn't checked the cart), `asked` (code asked you), `approved` (the dial let code buy), `ordered` (a PayPal order
 * exists, waiting for approval there), `paid` (PayPal captured), `closed` (it closed without paying), `finished` (the
 * run ended with nothing paid: the browser replay, or no deal at all). Never "waiting for your yes" once money moved.
 */
export type Phase = "starting" | "haggling" | "refused" | "deal" | "asked" | "approved" | "ordered" | "paid" | "walked" | "closed" | "finished";

export interface Moment {
  /** The row clicked; every row after it is not drawn. */
  seq: number;
  /** The ledger as it stood: rows with `seq` ≤ the clicked one. */
  events: LedgerEvent[];
  model: LaneModel;
  phase: Phase;
  round: number;
  /** The clicked row itself. */
  row: LedgerEvent;
}

/**
 * Whether the cart card (and the Approve inside it) may show (Joshua, Wed Oct 28): only at "now". Approving while a past
 * row is picked would approve a view that's out of date, so any picked row hides it until "Back to now".
 */
export function cartCardShown(at: number | null): boolean {
  return at === null;
}

/** The moment a row click jumps to: the lane pills and the card state as the ledger stood at `seq`. Null for a seq the ledger lacks. */
export function momentAt(events: LedgerEvent[], seq: number): Moment | null {
  const row = events.find((e) => e.seq === seq);
  if (!row) return null;
  const prefix = events.filter((e) => e.seq <= seq);
  const model = laneModel(prefix);
  // The clicked row is a refusal, or code undid an accept (laneModel drops a deal the guard or fence refused).
  const refused = row.verdict === "refused" || (!model.deal && prefix.some((e) => e.actor === "buyer" && e.action === "accept"));
  const after = (actor: Actor, action: string) => prefix.some((e) => e.actor === actor && e.action === action && (!model.deal || e.seq > model.deal.seq));
  const done = prefix.find((e) => e.actor === "guard" && e.action === "done");
  const phase: Phase = model.closed ? "closed"
    : after("paypal", "captured") ? "paid"
    : after("paypal", "order-created") ? "ordered"
    : after("guard", "buy") ? "approved"
    : model.walked ? "walked"
    // The server's `done` after a bound cart still waits for you ("Waiting for your approval in PayPal"); the browser
    // replay's can't be paid, and a run with no deal bought nothing.
    : done && (done.why === LOCAL_DONE || !model.deal) ? "finished"
    : after("guard", "ask") ? "asked"
    : model.deal ? "deal"
    : refused ? "refused" : model.lanes.length > 0 ? "haggling" : "starting";
  return { seq, events: prefix, model, phase, round: Math.max(0, ...prefix.map((e) => e.round ?? 0)), row };
}

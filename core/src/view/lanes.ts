// What the screen draws, computed from the ledger only (M2 step 4, v3 design: docs/design/m2-direction-v3.html).
// Every mark carries the `seq` of the row that drew it, so the screen can't show a price the ledger lacks
// (project Lesson 21); folding is for the eye and never changes the record (Lesson 22). Pure: no DOM, no clock.

import { fromCents, toCents, type Cents, usd } from "../money.ts";
import { dayOf, isShoppers, type LedgerEvent, type Source } from "../ledger/events.ts";
import { catalogItem, type Catalog } from "../trust/catalog.ts";
import { BRING_BACK, NOT_THIS_ONE } from "../trust/aside.ts";
import { STRONG_RECORD, categoryLimitFor, countsTowardRecord, dialFor, type Policy } from "../trust/policy.ts";

/** One point on a lane: a ledger row's price in its round. */
export interface Mark { seq: number; round: number; price: Cents }

export interface Lane {
  /** The seller's id, or "agent" for the buyer's bid. */
  id: string;
  kind: "seller" | "agent";
  name: string;
  /** Under the name: the seller's record, or who made the agent's moves. */
  sub: string;
  /** Earlier rounds first; the last one is the pill. */
  marks: Mark[];
  /** The Watcher's refusal row for this seller, when one exists: the pill turns red and names the evidence. */
  flag: { seq: number; why: string; rule: string } | null;
  /** The Watcher's hold row (no sales yet, or no record), when it holds and doesn't refuse: never red. */
  hold?: { seq: number; why: string; rule: string } | null;
}

/** One buyer move and, when code changed it, the code's row right after (the AI proposes, code decides). */
export interface Step {
  round: number;
  proposal: { seq: number; action: string; sellerId: string | null; price: Cents | null; why: string; source: string };
  code: { seq: number; price: Cents; rule: string; why: string } | null;
}

export interface LaneModel {
  /** The worst-case row: your max, the edge every lane runs up to. Null until the run has started. */
  edge: Mark | null;
  lanes: Lane[];
  steps: Step[];
  rounds: number;
  deal: { seq: number; sellerId: string; price: Cents; round: number } | null;
  walked: { seq: number; why: string } | null;
  /** After a deal: the row that closed it without a payment (PayPal unavailable or failed, you cancelled, the cart refused at capture). */
  closed: { seq: number; why: string } | null;
}

const name = (m: string) => m.replace(" (fictional)", "");
const cents = (p: string | undefined) => (p === undefined ? null : toCents(p));

/** Who made the buyer's moves, in words: the source on its rows (`rule`, a live model id, `recorded`, `rule-fallback`). */
export function buyerLabel(rows: LedgerEvent[]): string {
  const moves = rows.filter((e) => e.actor === "buyer" && e.data?.source !== undefined);
  if (moves.length === 0) return "";
  const first = moves.find((e) => e.data?.source !== "rule-fallback") ?? moves[0]!;
  const fell = moves.filter((e) => e.data?.source === "rule-fallback").length;
  const src = String(first.data!.source);
  const who = src === "rule" || src === "rule-fallback" ? "plain rule, no AI"
    : src === "recorded" ? `recorded · ${String(first.data!.modelLabel ?? "AI")} · ${String(first.data!.recordedOn ?? "")}`
    : "Claude Haiku 5.5, live";
  return fell > 0 && src !== "rule-fallback" ? `${who} · ${fell} of ${moves.length} moves by the plain rule` : who;
}

export function laneModel(events: LedgerEvent[]): LaneModel {
  const worst = events.find((e) => e.action === "worst-case" && e.price !== undefined);
  const edge = worst ? { seq: worst.seq, round: 0, price: toCents(worst.price!) } : null;
  const sellers = new Map<string, Lane>();
  for (const e of events) {
    if (e.actor !== "seller" || e.action !== "offer" || !e.sellerId || e.price === undefined) continue;
    let lane = sellers.get(e.sellerId);
    if (!lane) {
      const h = e.data?.history;
      const sub = typeof h === "number" ? (h > 0 ? `${h} sales on record` : "no sales on record") : "record unknown";
      lane = { id: e.sellerId, kind: "seller", name: name(String(e.data?.merchant ?? e.sellerId)), sub, marks: [], flag: null, hold: null };
      sellers.set(e.sellerId, lane);
    }
    lane.marks.push({ seq: e.seq, round: e.round ?? 0, price: toCents(e.price) });
  }
  // Keyed on the Watcher's verdict and `data.rule`, never its words: a refusal is red, a hold is not.
  for (const e of events) {
    const lane = e.actor === "watcher" && e.sellerId ? sellers.get(e.sellerId) : undefined;
    const row = lane && { seq: e.seq, why: e.why, rule: String(e.data?.rule ?? "") };
    if (lane && e.verdict === "refused" && !lane.flag) lane.flag = row!;
    if (lane && e.verdict === "asked" && !lane.hold) lane.hold = row!;
  }
  for (const l of sellers.values()) if (l.flag) l.hold = null;
  // The agent's bid: the counters that went out, the AI's or the code's (a proposal code replaced never reached a seller).
  const bids = events.filter((e) => e.action === "counter" && (e.actor === "buyer" || e.actor === "code") && e.price !== undefined);
  const agent: Lane = { id: "agent", kind: "agent", name: "the agent's bid", sub: buyerLabel(events), marks: bids.map((e) => ({ seq: e.seq, round: e.round ?? 0, price: toCents(e.price!) })), flag: null, hold: null };

  const steps: Step[] = [];
  for (const e of events) {
    if (e.actor === "buyer" && e.data?.source !== undefined) {
      steps.push({ round: e.round ?? 0, proposal: { seq: e.seq, action: e.action, sellerId: e.sellerId ?? null, price: cents(e.price), why: e.why, source: String(e.data.source) }, code: null });
    } else if (e.actor === "code" && e.price !== undefined && steps.length > 0) {
      steps[steps.length - 1]!.code = { seq: e.seq, price: toCents(e.price), rule: String(e.data?.rule ?? ""), why: e.why };
    }
  }
  const acc = events.find((e) => e.actor === "buyer" && e.action === "accept" && e.sellerId && e.price !== undefined);
  // A deal is an accept the guard didn't refuse. Only the guard's (or the fence's) refusal undoes it: PayPal being
  // off, a failed order or your cancel come later and close the cart, they don't make code's yes a no.
  const refused = acc ? events.some((e) => e.seq > acc.seq && e.verdict === "refused" && (e.actor === "guard" || e.actor === "fence")) : false;
  // Round 3 (O1): a cancel on PayPal's page that left the cart open (`data.cart: "open"`, guard.ts `cancelledInPayPal`) closes nothing.
  const closer = acc && !refused ? events.filter((e) => e.seq > acc.seq && e.verdict === "refused" && e.actor !== "guard" && e.actor !== "fence" && e.data?.cart !== "open").at(-1) : undefined;
  const walk = events.find((e) => e.actor === "buyer" && e.action === "walk");
  return {
    edge,
    lanes: [...sellers.values(), ...(agent.marks.length > 0 ? [agent] : [])],
    steps,
    rounds: Math.max(0, ...events.map((e) => e.round ?? 0)),
    deal: acc && !refused ? { seq: acc.seq, sellerId: acc.sellerId!, price: toCents(acc.price!), round: acc.round ?? 0 } : null,
    walked: walk ? { seq: walk.seq, why: walk.why } : null,
    closed: closer ? { seq: closer.seq, why: closer.why } : null,
  };
}

/**
 * The deal against the winning seller's opening ask (Joshua, 2026-10-23: "$58.39 alone looks like it paid near the
 * max"). `seq` is the opening offer's row, so the line on the cart is backed like every mark. Null with no deal.
 */
export function belowOpening(m: LaneModel): { seq: number; opening: Cents; below: Cents } | null {
  const first = m.deal ? m.lanes.find((l) => l.id === m.deal!.sellerId)?.marks[0] : undefined;
  return first ? { seq: first.seq, opening: first.price, below: first.price - m.deal!.price } : null;
}

/** The Watcher's line on the strip, from its rows: refused and held out of every seller that offered (the denominator). */
export interface WatchCounts { sellers: number; refused: number; held: number; seqs: number[] }

export function watchCounts(events: LedgerEvent[]): WatchCounts {
  const offered = new Set(events.filter((e) => e.actor === "seller" && e.action === "offer" && e.sellerId).map((e) => e.sellerId!));
  const rows = events.filter((e) => e.actor === "watcher" && e.sellerId && offered.has(e.sellerId));
  const refused = new Set(rows.filter((e) => e.verdict === "refused").map((e) => e.sellerId!));
  const held = new Set(rows.filter((e) => e.verdict === "asked" && !refused.has(e.sellerId!)).map((e) => e.sellerId!));
  return { sellers: offered.size, refused: refused.size, held: held.size, seqs: rows.map((e) => e.seq) };
}

export interface Folded { e: LedgerEvent; count: number; also: number[] }

/**
 * Repeated seller rows (same seller, price, note and verdict) fold into their first row with a count and the
 * other rows' numbers. Only seller rows fold: a decision is never hidden. The counts sum to the row count.
 */
export function fold(events: LedgerEvent[]): Folded[] {
  const out: Folded[] = [];
  const seen = new Map<string, Folded>();
  for (const e of events) {
    const key = e.actor === "seller" ? JSON.stringify([e.action, e.sellerId, e.price, e.quoted ?? null, e.verdict ?? null]) : null;
    const hit = key ? seen.get(key) : undefined;
    if (hit) { hit.count++; hit.also.push(e.seq); continue; }
    const f: Folded = { e, count: 1, also: [] };
    out.push(f);
    if (key) seen.set(key, f);
  }
  return out;
}

export interface DialPreview { category: string; setting: string; clean: number; needed: number; limit: Cents }

/**
 * A bad pick (PROFILE, Definitions) is an Auditor veto or a shopper rejection ("Not this one"), counted by who refused
 * (N18). The guard or the Watcher refusing a seller is the system working, and backing out on PayPal's page says nothing
 * about the pick (020 default; `cancelledInPayPal`), so neither costs the agent its record. A purchase the shopper undid
 * (PayPal's "refunded" row, QUEUE M3 slot 2) is a bad pick too: taking money back says the pick was wrong.
 */
export const isBadPick = (e: LedgerEvent) =>
  (e.verdict === "refused" && (e.actor === "auditor" || (e.actor === "shopper" && e.action === NOT_THIS_ONE))) || (e.actor === "paypal" && e.action === "refunded");

/**
 * Where the record starts again: just after the last bad pick that still stands. A "Not this one" the shopper took back
 * ("Bring it back", a later row from the same run) is withdrawn, so a misheard "no" costs a tap, never the record.
 */
export function badPickEnd(events: LedgerEvent[]): number {
  // One pass from the end (security review: linear, however many rows): the runs brought back after this row so far.
  const back = new Set<string | undefined>();
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.actor === "shopper" && e.action === BRING_BACK) back.add(e.runId);
    else if (isBadPick(e) && !(e.actor === "shopper" && back.has(e.runId))) return i + 1;
  }
  return 0;
}

/** The category a row's catalog entry is in, read from the code's catalog (N9), or undefined when it names none. */
const categoryOf = (e: LedgerEvent, catalog: Catalog) => (typeof e.data?.catalogId === "string" ? catalogItem(catalog, e.data.catalogId)?.category : undefined);

/**
 * The dial preview (011 §7): where a category stands, counted from the ledger, never typed in (Lesson 16), against the
 * limit the Policy holds for it (N18). Clean carts: captured in this category (W11: the catalog entry the row names)
 * within that limit since the last bad pick, which resets the count, and after the category's last limit raise (N9):
 * carts kept under the old limit don't count toward the new one. Seeded and attack rows never reach it (N19), and a
 * replayed recording's capture is never a clean cart (`countsTowardRecord`, Joshua's answer 2).
 */
export function dialPreview(all: LedgerEvent[], given: Policy, category: string, catalog: Catalog): DialPreview {
  const events = all.filter(isShoppers);
  const policy = settleDial(given, all);
  // Honesty: after a reset (a limit raise), "ask me first" is no longer the starting setting.
  const setting = dialFor(policy, category) === "buy-within-limits" ? "buy within limits" : policy.dial[category] === undefined ? "ask me first (the starting setting)" : "ask me first";
  const limit = categoryLimitFor(policy, category);
  const since = badPickEnd(events);
  const raised = Object.hasOwn(policy.recordSince, category) ? policy.recordSince[category]! : -Infinity;
  const clean = events.slice(since).filter((e) => e.actor === "paypal" && e.action === "captured" && countsTowardRecord(e.source) && categoryOf(e, catalog) === category && e.t > raised && e.price !== undefined && toCents(e.price) <= limit).length;
  return { category: category.charAt(0).toUpperCase() + category.slice(1), setting, clean: Math.min(clean, STRONG_RECORD), needed: STRONG_RECORD, limit };
}

/**
 * The dial as it stands (layer 5: "it turns back after a bad pick"; QUEUE M3: "1 bad pick to revoke"). A category's "buy
 * within limits" holds only while no bad pick that still stands came at or after the tap that turned it on (`dialSince`),
 * counted over the shopper's own rows as the record is (`badPickEnd`, any category: the record resets the same way). A
 * "Not this one" taken back withdraws its bad pick, so the dial stands again; a new record never turns a fallen dial back
 * on, since that bad pick stays after the grant: only the shopper's tap does (`grantDial`). The demo's guard and every
 * screen read this, never the stored setting alone. Returns the same Policy when nothing turns back.
 */
export function settleDial(policy: Policy, all: LedgerEvent[]): Policy {
  const on = Object.keys(policy.dial).filter((c) => policy.dial[c] === "buy-within-limits");
  if (on.length === 0) return policy;
  const events = all.filter(isShoppers);
  const end = badPickEnd(events);
  if (end === 0) return policy;
  const at = events[end - 1]!.t;
  const fallen = on.filter((c) => at >= (policy.dialSince?.[c] ?? -Infinity));
  return fallen.length === 0 ? policy : { ...policy, dial: { ...policy.dial, ...Object.fromEntries(fallen.map((c) => [c, "ask-first" as const])) } };
}

/** One Settings row for the dial (QUEUE M3 "dial proper"): where a category stands, and what its one tap does. */
export interface DialRow { category: string; on: boolean; clean: number; needed: number; canTurnOn: boolean; said: string }

/**
 * Under the dial rows: what no dial setting ever covers, each a reason the guard asks with the dial on (project Lesson
 * 4's gate for the payment shapes; `NEW_SELLERS_ASK_FIRST`; a Watcher hold; a chip the guard couldn't check).
 */
export const DIAL_ALWAYS_ASKS = "Whatever the dial says, Goose still asks you first for a subscription or Pay Later, a seller with no sales record yet, a seller the Watcher held, and a cart it couldn't fully check.";

/**
 * The dial in Settings, one row per catalog category, from the same count the guard's dial reads (`dialPreview`): "on"
 * means Goose has the exact cart ready without questions, and the shopper still taps once in PayPal (PROFILE: the UI
 * always keeps that one tap). Turning it on is offered only at a strong record.
 */
export function dialRows(all: LedgerEvent[], policy: Policy, catalog: Catalog): DialRow[] {
  const settled = settleDial(policy, all);
  return [...new Set([...catalog.values()].map((e) => e.category))].map((category) => {
    const p = dialPreview(all, settled, category, catalog);
    const on = dialFor(settled, category) === "buy-within-limits";
    const canTurnOn = !on && p.clean >= p.needed;
    const limit = `${usd(p.limit)}`;
    const said = on ? `Ready without questions for ${category} carts up to ${limit}, within ${usd(policy.weeklyLimit)} a week. You still tap once in PayPal.`
      : canTurnOn ? `${p.needed} of ${p.needed} clean ${category} carts. Goose can get the next one up to ${limit} ready without questions; you'd still tap once in PayPal.`
      : `Asks you first. ${p.clean} of ${p.needed} clean ${category} carts toward getting them ready without questions.`;
    return { category, on, clean: p.clean, needed: p.needed, canTurnOn, said };
  });
}

/** One completed purchase, from its captured row: structured fields only, never a seller's words (N8). */
export interface Purchase {
  seq: number;
  /** "seeded" stays on screen as its label; null on a row written before F1. No run id: a run's id opens its rows (N12). */
  source: Source | null;
  day: number;
  price: Cents;
  catalogId: string | null;
  color: string | null;
  /** True when it counts toward the week and the dial: the shopper's own, never seeded (N19). */
  counts: boolean;
}

export interface ShopperFold {
  /** The newest purchase, the shopper's own or the seeded week's (labeled), or null. */
  receipt: Purchase | null;
  /**
   * The rolling 7 days the guard holds carts to, `from` and `to` as `dayOf` days: `spent` is the guard's own number
   * (`weekSpend`), and `purchases` shows the seeded ones too, labeled and not counted.
   */
  week: { from: number; to: number; spent: Cents; limit: Cents; purchases: Purchase[] };
  /** Each catalog category's dial record. */
  counts: Record<string, DialPreview>;
  /** The decision ledger for the grid: every row the shopper's ledger holds, seeded (and any attack) ones with their labels, repeats folded. */
  grid: Folded[];
}

/** A row where code let a cart through toward paying over `max`: the one definition `attackFold` and `gotItToPay` share. */
export function attackThrough(e: LedgerEvent, max: Cents): boolean {
  return e.price !== undefined && toCents(e.price) > max
    && ((e.actor === "guard" && (e.action === "buy" || e.action === "ask")) || (e.actor === "paypal" && (e.action === "order-created" || e.action === "captured" || e.action === "capture-mismatch")));
}

/** "Try to break it", counted (video-first addition b): rounds tried, and rounds where anything got past code over the max. */
export interface AttackCount { tried: number; overMax: number }

/**
 * The attack rows `shopperFold` leaves out, folded on their own (N19: they never reach a week or a dial). `tried` is the
 * number of attack runs (one per judge round); `overMax` the runs where code let a cart through toward paying (the
 * guard's buy or ask, or any order or capture) at a price over `max`. Counted wide on purpose: a held cart counts as
 * "bought" here, so the zero the screen shows can only be too high, never too kind. Rows from any other source are ignored.
 */
export function attackFold(rows: readonly LedgerEvent[], max: Cents): AttackCount {
  const attack = rows.filter((e) => e.source === "attack" && e.runId !== undefined);
  return { tried: new Set(attack.map((e) => e.runId)).size, overMax: new Set(attack.filter((e) => attackThrough(e, max)).map((e) => e.runId)).size };
}

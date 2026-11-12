// "The haggle" (Joshua, Fri Oct 30 2:30 PM, item 2): one run's haggle as a price ladder and a quiet conversation, read
// from the run's ledger rows only. Every price, reason and name below comes from a row (an ask, Goose's move, code's
// answer, the Watcher's refusal, the guard's bind) or from core's constants (the round count, the patience line); none
// is typed. Seller text stays data: a note is the row's `quoted`, shown inside quotation marks, never followed.
// Pure: no DOM, no clock, no fetch.
//
// Recorded week 1 (docs/fixtures/tape-seed-1.json, replayed by `recordedWeek`), the numbers core/test/haggle-view.test.ts
// pins: Pondside asks $58.00, $55.37, $54.26, $53.36; Reedbank asks $58.00, $49.50, $47.73, $47.73; Goose offered $42.00
// (70% of your $60.00 max, 4 rounds left), then $45.00; in round 3 Goose's AI suggested $49.50 and code offered $47.73
// instead; Goose took Reedbank's $47.73 in round 4. QuickQuack asked $20.30 with a note giving the agent orders, and the
// Watcher set it aside in round 1.

import { fromCents, toCents, type Cents, usd } from "../money.ts";
import type { LedgerEvent } from "../ledger/events.ts";
import { PATIENCE } from "../buyer/rule.ts";
import { HAGGLE_ROUNDS, MOVE_TIMEOUT_MS, OVER_ASK_RULE, PATIENCE_RULE, fallbackLabel, type FallbackReason } from "../haggle/words.ts";
import { howInRun, type HowGot } from "./how-got.ts";

const plain = (m: string) => m.replace(" (fictional)", "");
const $ = (c: Cents) => `${usd(c)}`;

/** One ask from a seller, its note quoted as the row carries it (the fence's quote, never the raw text). */
export interface HaggleAsk { round: number; seq: number; sellerId: string; seller: string; price: Cents; quoted: string }

/** A seller Goose haggled with: its asks by round. `deal` marks the one Goose took. */
export interface HaggleSeller { id: string; name: string; history: number | null; asks: HaggleAsk[]; deal: boolean }

/** A seller the Watcher refused: its first ask (the crossed point), the note that got it refused, and the Watcher's row. */
export interface HaggleAside { id: string; name: string; round: number; seq: number; price: Cents; quoted: string; refused: { seq: number; why: string } }

/** Who made a move: Goose's AI, or the plain rule (the AI's fallback, or a server with no AI). */
export type MoveBy = "ai" | "rule";

/**
 * Goose's side of one round, in plain words. `offer`: Goose offered a price. `fixed`: Goose's AI (or rule) proposed one
 * move and code made another (`proposed`, then `price`). `take`: Goose took a seller's ask. `wait` and `walk` as said.
 * `fallback` is the row's own sentence when a plain rule moved instead of the AI (null otherwise).
 */
export type GooseMove =
  | { kind: "offer"; round: number; seq: number; sellerId: string; seller: string; price: Cents; by: MoveBy; reason: string; fallback: string | null }
  | { kind: "fixed"; round: number; seq: number; proposedSeq: number; proposedKind: "offer" | "take"; sellerId: string; seller: string; proposed: Cents; price: Cents; by: MoveBy; rule: string; reason: string; fallback: string | null }
  | { kind: "take"; round: number; seq: number; sellerId: string; seller: string; price: Cents; by: MoveBy; reason: string; fallback: string | null }
  | { kind: "wait"; round: number; seq: number; by: MoveBy; fallback: string | null }
  | { kind: "walk"; round: number; seq: number; by: MoveBy | null; fallback: string | null };

/** One round of the conversation: the asks that arrived (sellers Goose haggled with), who was set aside, then Goose's move. */
export interface HaggleRound { round: number; asks: HaggleAsk[]; aside: HaggleAside[]; move: GooseMove | null }

export interface HaggleModel {
  /** The worst-case row: the most any cart can cost (the dashed line). */
  limit: { seq: number; price: Cents } | null;
  /** The rounds a haggle has (`HAGGLE_ROUNDS` unless the caller says otherwise), for "N rounds left". */
  maxRounds: number;
  sellers: HaggleSeller[];
  aside: HaggleAside[];
  rounds: HaggleRound[];
  /** The price Goose had on the table after each round's move (an offer, code's offer, or the price it took). */
  goose: { round: number; seq: number; price: Cents }[];
  /** The ask Goose took, once the guard bound it into a cart; `below` is the seller's first ask less the deal. */
  // `how`: haggled or waited, from the rows (how-got.ts): a Goose counter-offer reached this seller before the take, or none did.
  deal: { seq: number; round: number; sellerId: string; seller: string; price: Cents; firstAsk: Cents; below: Cents; boundSeq: number; how: HowGot | null } | null;
  /** How the run ended: a bound cart, a walk, a refusal; null while rows are still arriving. */
  ended: "deal" | "walked" | "refused" | null;
  /** Who made Goose's moves, from the first move's row: a model label (and the day it was recorded), or "a plain rule". */
  mover: { label: string; recordedOn: string | null } | null;
}

/** A share of the max in plain words: exact to one decimal ("70%", "82.5%"), else "about 80%". */
export function pctOf(price: Cents, max: Cents): string {
  if (max <= 0) return "";
  if ((price * 1000) % max === 0) return `${(price * 100) / max}%`;
  return `about ${Math.round((price * 100) / max)}%`;
}

/** The label on a haggle that is the recording, never a live run (Joshua's words, item 2). */
export const RECORDED_WEEK = "Recorded demo week, no money moved";
/** Why the page shows the recording after a run whose rows carry no rounds (the Desk's market compares listed prices). */
export const NO_ROUNDS = "Your run compared listed prices, so it had no haggle. This is Goose haggling on the recorded demo week.";
/**
 * Said beside a set-aside seller's note. True of every seller: the buyer is handed offers fenced closed (fence.ts
 * `fenceOffer`), so no note reaches the AI. Not "never shown to the agent": on the kettle's runs the refused seller's
 * price is still in the AI's list (engine `hideRefused` off), and the guard refuses its cart in code.
 */
export const NOTE_FENCED = "Its note never reached Goose's AI, and the guard refuses any cart from it.";

const left = (n: number) =>`${n} round${n === 1 ? "" : "s"} left`;

/** The exact fallback sentence the engine appended to this move's `why`, or null when the AI made the move. */
function fallbackOf(e: LedgerEvent): string | null {
  if (e.data?.source !== "rule-fallback") return null;
  const reasons: FallbackReason[] = ["timeout", "bad-move", "error", "tape-miss", "recorded-fallback"];
  for (const r of reasons) {
    for (const rec of [undefined, "timeout", "error"] as const) {
      for (const ms of [MOVE_TIMEOUT_MS, MOVE_TIMEOUT_MS + 1000]) {
        const s = fallbackLabel(r, ms, rec);
        if (e.why.endsWith(s)) return s;
      }
    }
  }
  return "A plain rule made this move.";
}

const byOf = (e: LedgerEvent): MoveBy => (e.data?.source === "rule" || e.data?.source === "rule-fallback" ? "rule" : "ai");

/** A Goose row (buyer move) as the haggle reads it: Goose's AI or rule moved, with a round. */
const isMove = (e: LedgerEvent) => e.actor === "buyer" && e.round !== undefined && e.data?.source !== undefined;

/**
 * The haggle from one run's rows, in order. Sellers the Watcher refused are set aside (never a line on the ladder); the
 * rest are the sellers Goose haggled with. A round's move is Goose's row for it; when code answered that row with its
 * own offer, the move is `fixed` and carries both prices. The deal is the ask Goose took, and only once the guard bound
 * it (a row with the cart's hash): a take the guard refused is no deal.
 */
export function haggleModel(events: readonly LedgerEvent[], maxRounds: number = HAGGLE_ROUNDS): HaggleModel {
  const limitRow = events.find((e) => e.actor === "guard" && e.action === "worst-case" && e.price !== undefined);
  const limit = limitRow ? { seq: limitRow.seq, price: toCents(limitRow.price!) } : null;

  const refusals = new Map<string, LedgerEvent>();
  for (const e of events) if (e.actor === "watcher" && e.verdict === "refused" && e.sellerId && !refusals.has(e.sellerId)) refusals.set(e.sellerId, e);

  const names = new Map<string, string>();
  const offers = events.filter((e) => e.actor === "seller" && e.action === "offer" && e.sellerId && e.round !== undefined && e.price !== undefined);
  for (const e of offers) if (!names.has(e.sellerId!)) names.set(e.sellerId!, plain(String(e.data?.merchant ?? e.sellerId)));
  const nameOf = (id: string) => names.get(id) ?? id;

  const askOf = (e: LedgerEvent): HaggleAsk => ({ round: e.round!, seq: e.seq, sellerId: e.sellerId!, seller: nameOf(e.sellerId!), price: toCents(e.price!), quoted: e.quoted ?? "" });

  const aside: HaggleAside[] = [];
  for (const [id, r] of refusals) {
    const first = offers.find((e) => e.sellerId === id && e.seq < r.seq) ?? offers.find((e) => e.sellerId === id);
    if (!first) continue;
    aside.push({ id, name: nameOf(id), round: first.round!, seq: first.seq, price: toCents(first.price!), quoted: first.quoted ?? "", refused: { seq: r.seq, why: r.why } });
  }

  const sellers: HaggleSeller[] = [];
  for (const e of offers) {
    if (refusals.has(e.sellerId!)) continue;
    let s = sellers.find((x) => x.id === e.sellerId);
    if (!s) { s = { id: e.sellerId!, name: nameOf(e.sellerId!), history: typeof e.data?.history === "number" ? e.data.history : null, asks: [], deal: false }; sellers.push(s); }
    s.asks.push(askOf(e));
  }

  const max = limit?.price ?? null;
  const offerReason = (price: Cents, round: number) => [max !== null ? `${pctOf(price, max)} of your ${$(max)} max` : null, left(maxRounds - round)].filter(Boolean).join(", ");

  const rounds: HaggleRound[] = [];
  const goose: HaggleModel["goose"] = [];
  const roundOf = (n: number): HaggleRound => {
    let r = rounds.find((x) => x.round === n);
    if (!r) { r = { round: n, asks: [], aside: [], move: null }; rounds.push(r); }
    return r;
  };
  for (const e of offers) {
    const r = roundOf(e.round!);
    if (!refusals.has(e.sellerId!)) r.asks.push(askOf(e));
  }
  for (const a of aside) roundOf(a.round).aside.push(a);

  let takeRow: LedgerEvent | null = null;
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.actor === "code" && e.action === "counter" && e.price !== undefined && e.round !== undefined) {
      // Code's answer replaces the move just before it: that proposal never reached a seller.
      const r = roundOf(e.round);
      const prev = r.move;
      if (!prev || (prev.kind !== "offer" && prev.kind !== "take")) continue;
      const price = toCents(e.price), rule = String(e.data?.rule ?? "");
      const roundsLeft = left(maxRounds - e.round);
      const reason = rule === OVER_ASK_RULE
        ? `${prev.seller} asks only ${$(price)}, and Goose never offers more than a seller asks.`
        : rule === PATIENCE_RULE && max !== null
          ? `${$(prev.price)} is over ${Math.round(PATIENCE * 100)}% of your ${$(max)} max with ${roundsLeft}, so Goose keeps haggling.`
          : e.why;
      r.move = { kind: "fixed", round: e.round, seq: e.seq, proposedSeq: prev.seq, proposedKind: prev.kind, sellerId: e.sellerId ?? prev.sellerId, seller: e.sellerId ? nameOf(e.sellerId) : prev.seller, proposed: prev.price, price, by: prev.by, rule, reason, fallback: prev.fallback };
      const g = goose.findIndex((x) => x.round === e.round);
      const point = { round: e.round, seq: e.seq, price };
      if (g >= 0) goose[g] = point; else goose.push(point);
      continue;
    }
    if (!isMove(e)) {
      if (e.actor === "buyer" && e.action === "walk" && e.round !== undefined) roundOf(e.round).move = { kind: "walk", round: e.round, seq: e.seq, by: null, fallback: null };
      continue;
    }
    const r = roundOf(e.round!);
    const by = byOf(e), fallback = fallbackOf(e);
    const action = e.action.replace(/^propose-/, "");
    const sellerId = e.sellerId ?? "";
    if ((action === "counter" || action === "accept") && e.price !== undefined && sellerId) {
      const price = toCents(e.price);
      if (action === "counter") {
        r.move = { kind: "offer", round: e.round!, seq: e.seq, sellerId, seller: nameOf(sellerId), price, by, reason: offerReason(price, e.round!), fallback };
      } else {
        // A take's reason is code's own check on this round's asks: the lowest of the sellers Goose didn't set aside, or no claim.
        const asks = r.asks;
        const lowest = asks.length > 0 && asks.every((a) => price <= a.price);
        const reason = lowest ? (asks.length === 1 ? "the only seller Goose didn't set aside" : `of the ${asks.length} sellers Goose didn't set aside, the lowest`) : "";
        r.move = { kind: "take", round: e.round!, seq: e.seq, sellerId, seller: nameOf(sellerId), price, by, reason, fallback };
        if (e.action === "accept") takeRow = e;
      }
      const point = { round: e.round!, seq: e.seq, price };
      const g = goose.findIndex((x) => x.round === e.round);
      if (g >= 0) goose[g] = point; else goose.push(point);
    } else if (action === "wait") {
      r.move = { kind: "wait", round: e.round!, seq: e.seq, by, fallback };
    } else if (action === "walk") {
      r.move = { kind: "walk", round: e.round!, seq: e.seq, by, fallback };
    }
  }
  rounds.sort((a, b) => a.round - b.round);
  goose.sort((a, b) => a.round - b.round);

  let deal: HaggleModel["deal"] = null;
  let ended: HaggleModel["ended"] = null;
  if (takeRow) {
    const t = takeRow;
    const bound = events.find((e) => e.seq > t.seq && e.actor === "guard" && (e.action === "ask" || e.action === "buy") && typeof e.data?.hash === "string" && e.sellerId === t.sellerId);
    const s = sellers.find((x) => x.id === t.sellerId);
    if (bound && s && s.asks.length > 0) {
      const price = toCents(bound.price ?? t.price!);
      s.deal = true;
      deal = { seq: t.seq, round: t.round!, sellerId: s.id, seller: s.name, price, firstAsk: s.asks[0]!.price, below: s.asks[0]!.price - price, boundSeq: bound.seq, how: howInRun(events, { sellerId: s.id, seq: t.seq, firstAsk: s.asks[0]!.price, price }) };
      ended = "deal";
    } else if (events.some((e) => e.seq > t.seq && e.verdict === "refused")) ended = "refused";
  }
  if (!ended && rounds.some((r) => r.move?.kind === "walk")) ended = "walked";
  if (!ended && events.some((e) => e.actor === "seller" && e.action === "all-walked")) ended = "walked";

  // The first move the AI made names the mover; a run whose every move was the plain rule's says so.
  const first = events.find((e) => isMove(e) && byOf(e) === "ai") ?? events.find(isMove);
  const mover = !first ? null
    : byOf(first) === "rule" ? { label: "a plain rule", recordedOn: null }
    : { label: String(first.data?.modelLabel ?? first.data?.model ?? first.data?.source), recordedOn: typeof first.data?.recordedOn === "string" ? first.data.recordedOn : null };

  return { limit, maxRounds, sellers, aside, rounds, goose, deal, ended, mover };
}

/**
 * What this haggle is, said once at the top: the recorded week (Joshua's label), or a run on the server named by its own
 * rows (a replay's moves carry `source: "recorded"`), so a recording is never called live. Then who made Goose's moves:
 * "a plain rule", or "an AI model" (shopper copy names no model, as the wallet's line does; Round 3's cold consumer).
 * The model's own label stays on the model (`mover.label`) for the ledger and Proof.
 */
/** PayPal rows after which "no money moved" is still true: the order was never taken, or only created. */
const NO_MONEY_PAYPAL: ReadonlySet<string> = new Set(["unavailable", "error", "order-created"]);

export function sourceLine(m: HaggleModel, rows: readonly LedgerEvent[], week: boolean): string {
  const who = m.mover?.label === "a plain rule" ? m.mover.label : "an AI model";
  const by = m.mover ? `Goose's moves: ${who}${m.mover.recordedOn ? `, recorded ${m.mover.recordedOn}` : ""}` : null;
  if (week) return [RECORDED_WEEK, by].filter(Boolean).join(" · ");
  const replay = rows.some((e) => e.actor === "buyer" && e.data?.source === "recorded");
  // "No money moved" only while the rows say so. Any PayPal row past creating the order (a capture, a hold, a void, a
  // failed capture that "can't say whether it was charged", a webhook) drops it; only rows where PayPal never took the
  // order (`unavailable`, `error`) or merely made it (`order-created`) leave it standing.
  const paid = rows.some((e) => e.actor === "paypal" && !NO_MONEY_PAYPAL.has(e.action));
  const head = replay ? `Replayed on the server from a recording${paid ? "" : ", no money moved"}` : m.mover?.label === "a plain rule" ? "A run on the server" : "A live run on the server";
  return [head, by].filter(Boolean).join(" · ");
}

/** Goose's move in one plain sentence ("Goose offered Pondside $42.00."), never "counter". */
export function moveWords(m: GooseMove): string {
  const who = m.by === "rule" ? "Goose's plain rule" : "Goose's AI";
  switch (m.kind) {
    case "offer": return `Goose offered ${m.seller} ${$(m.price)}.`;
    case "fixed": return m.proposedKind === "take"
      ? `${who} wanted to take ${$(m.proposed)}. Code offered ${m.seller} ${$(m.price)} instead.`
      : `${who} suggested ${$(m.proposed)}. Code offered ${m.seller} ${$(m.price)} instead.`;
    case "take": return `Goose took ${m.seller}${m.seller.endsWith("s") ? "'" : "'s"} ${$(m.price)}.`;
    case "wait": return "Goose waited this round.";
    case "walk": return "Goose walked away.";
  }
}

/** The run's last round with Goose's move in it (a round "arrives" once Goose has answered it, or the run has ended). */
export function roundsReady(m: HaggleModel): number {
  const answered = m.rounds.filter((r) => r.move !== null).map((r) => r.round);
  const last = answered.length > 0 ? Math.max(...answered) : 0;
  return m.ended ? Math.max(last, ...m.rounds.map((r) => r.round), 0) : last;
}

/** The ladder chart's data, rounds 1..`upTo` only, so a live run draws only the rounds that have arrived. Dollars as numbers for the canvas. */
export interface LadderData {
  /** Every round the rows have so far (the x axis), so the axis holds still while rounds are revealed one by one. */
  axis: number[];
  /** The dollar axis from every price the rows have (asks, offers, the set-aside ask and the max), in steps of $10, so it never rescales mid-haggle. */
  range: { lo: number; hi: number };
  sellers: { id: string; name: string; deal: boolean; points: { round: number; dollars: number }[] }[];
  goose: { round: number; dollars: number }[];
  deal: { round: number; dollars: number; words: string } | null;
  aside: { round: number; dollars: number; words: string }[];
  limit: { dollars: number; words: string } | null;
}

export function ladderData(m: HaggleModel, upTo: number): LadderData {
  const d = (c: Cents) => c / 100;
  const all = [...m.sellers.flatMap((s) => s.asks.map((a) => a.price)), ...m.goose.map((g) => g.price), ...m.aside.map((a) => a.price), ...(m.limit ? [m.limit.price] : [])].map(d);
  const range = all.length === 0 ? { lo: 0, hi: 10 } : { lo: Math.max(0, Math.floor((Math.min(...all) - 5) / 10) * 10), hi: Math.ceil((Math.max(...all) + 5) / 10) * 10 };
  return {
    axis: m.rounds.map((r) => r.round),
    range,
    sellers: m.sellers.map((s) => ({ id: s.id, name: s.name, deal: s.deal, points: s.asks.filter((a) => a.round <= upTo).map((a) => ({ round: a.round, dollars: d(a.price) })) })),
    goose: m.goose.filter((g) => g.round <= upTo).map((g) => ({ round: g.round, dollars: d(g.price) })),
    deal: m.deal && m.deal.round <= upTo ? { round: m.deal.round, dollars: d(m.deal.price), words: `Deal ${$(m.deal.price)}` } : null,
    aside: m.aside.filter((a) => a.round <= upTo).map((a) => ({ round: a.round, dollars: d(a.price), words: `${a.name} ${$(a.price)}: set aside` })),
    limit: m.limit ? { dollars: d(m.limit.price), words: `Your max ${$(m.limit.price)}` } : null,
  };
}

/** The chart's text alternative: what the ladder shows, in one or two sentences, from the same model. */
export function ladderSummary(m: HaggleModel, upTo: number): string {
  const parts: string[] = [];
  for (const s of m.sellers) {
    const a = s.asks.filter((x) => x.round <= upTo);
    if (a.length > 0) parts.push(`${s.name} asked ${a.map((x) => $(x.price)).join(", ")}`);
  }
  // A round whose move was a take is not an offer (Round 0 data review): "Goose offered $42.00, $45.00, $47.73, then took $47.73".
  const took = (x: { round: number }) => m.rounds.find((r) => r.round === x.round)?.move?.kind === "take";
  const g = m.goose.filter((x) => x.round <= upTo);
  const offered = g.filter((x) => !took(x)).map((x) => $(x.price));
  const take = g.find(took);
  const goose = [offered.length > 0 ? `Goose offered ${offered.join(", ")}` : "", take ? `${offered.length > 0 ? "then" : "Goose"} took ${$(take.price)}` : ""].filter(Boolean);
  if (goose.length > 0) parts.push(goose.join(", "));
  let s = `${parts.join("; ")}.`;
  if (m.deal && m.deal.round <= upTo) s += ` They met at ${$(m.deal.price)} in round ${m.deal.round}.`;
  const a = m.aside.filter((x) => x.round <= upTo);
  if (a.length > 0) s += ` ${a.map((x) => `${x.name} (${$(x.price)})`).join(", ")} set aside by the Watcher.`;
  if (m.limit) s += ` Your max: ${$(m.limit.price)}.`;
  return s;
}

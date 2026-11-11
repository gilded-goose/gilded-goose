// The haggle engine: sellers offer, the fence strips their text, the buyer
// (behind LlmPort) proposes a move, and when it accepts, the guard decides.
// Every step is a ledger event. The same function runs live on the server and
// replays in the browser, which is what makes "replay equals engine" testable.

import type { Deps } from "../deps.ts";
import type { LedgerStore } from "../ledger/events.ts";
import { fromCents, roundCents, type Cents, usd } from "../money.ts";
import { HAGGLE_ROUNDS, MOVE_TIMEOUT_MS, OVER_ASK_RULE, PATIENCE_RULE, fallbackLabel, type FallbackReason } from "./words.ts";
export { HAGGLE_ROUNDS, MOVE_TIMEOUT_MS, OVER_ASK_RULE, PATIENCE_RULE, fallbackLabel, type FallbackReason };
import type { Seller, SellerOffer } from "../sellers/types.ts";
import type { Cart } from "../trust/cart.ts";
import { askedSellers, wantedAttributes, type Chip } from "../trust/chips.ts";
import { fenceOffer, quoteNote } from "../trust/fence.ts";
import { shownName, verdictOf, watch, watchRow, type Evidence, type WatchVerdict } from "../trust/watch.ts";
import { runReader } from "../trust/notes.ts";
import type { Guard, GuardDecision } from "../trust/guard.ts";
import type { Want } from "../trust/policy.ts";
import { isBuyerMove, type BuyerInput, type BuyerMove, type LlmPort } from "../buyer/port.ts";
import { PATIENCE, ruleMove } from "../buyer/rule.ts";
import { RecordedFallback, TapeMiss } from "../buyer/recorded.ts";
import { withStoreNames } from "../sellers/market.ts";

export interface HaggleOptions {
  want: Want;
  sellers: Seller[];
  buyer: LlmPort;
  guard: Guard;
  deps: Deps;
  ledger: LedgerStore;
  shopperId: string;
  /** The catalog entry this haggle shops for (N9). Every cart names it, so the guard reads the dial's category from the catalog. */
  catalogId?: string;
  /**
   * The shopper's accepted chips (W49c). They steer the run: a seller whose listing contradicts one isn't asked (none
   * left, and every seller is, so the guard is what refuses). The guard reads them on every cart. None = as before.
   */
  chips?: readonly Chip[];
  maxRounds?: number;
  /** LLM budget per move, ms. Past it, the rule engine moves and says so. */
  llmTimeoutMs?: number;
  /** Before the last round, an accept above this share of the max is held and countered instead (default PATIENCE). */
  patience?: number;
  /**
   * A seller the Watcher refused is kept from the buyer's choices (§15B part 2, posted runs): its offer and the refusal
   * stay on the record, and the buyer picks among the rest. Off by default, so the kettle's runs and recordings are as
   * they were (there the buyer sees the attack seller and the guard refuses its cart).
   */
  hideRefused?: boolean;
}

export type HaggleResult =
  | { outcome: "cart"; decision: Exclude<GuardDecision, { kind: "refused" }>; cart: Cart; rounds: number }
  | { outcome: "refused"; reason: string; rounds: number }
  | { outcome: "walked"; reason: string; rounds: number };

/**
 * Joshua (2026-10-23): the AI accepted $59.51 of a $60 max in round 2, "under budget". The guard keeps the shopper
 * safe; this keeps the deal good. Before the last round, code never takes an offer above 90% of the max: it counters
 * toward that line instead, and the ledger shows the AI's proposal and the code's counter as two rows.
 */

/** The counter code makes when it holds an early accept: half the way from the last bid to the patience line, never down, never above the ask. */
export function patienceCounter(maxPrice: Cents, history: BuyerMove[], ask: Cents, patience = PATIENCE): Cents {
  const line = roundCents(maxPrice * patience);
  const last = [...history].reverse().find((m) => m.type === "counter");
  const bid = last && last.type === "counter" ? last.price : roundCents(maxPrice * 0.7);
  const next = bid >= line ? bid : roundCents(bid + (line - bid) / 2);
  return Math.min(next, ask);
}

/** The judge box's single "AI reads your note" call (ADR 0009): one call, no race, the judge waits on their own click. */
export const JUDGE_NOTE_TIMEOUT_MS = 3000;


export async function runHaggle(o: HaggleOptions): Promise<HaggleResult> {
  const maxRounds = o.maxRounds ?? HAGGLE_ROUNDS;
  const timeoutMs = o.llmTimeoutMs ?? MOVE_TIMEOUT_MS;
  const patience = o.patience ?? PATIENCE;
  const base = () => ({ t: o.deps.clock.now(), shopperId: o.shopperId, visibility: "owner" as const });
  const history: BuyerMove[] = [];
  // Every seller in the market, id → store name: the AI's sentence is shown with names, never ids (it only ever sees ids).
  // Only a name the ledger may carry as written (N8); any other is the fixed "name withheld" words.
  // The Watcher reads each seller's same words every round: this run reads each text once, and drops the readings when it ends.
  const read = runReader();
  const names = new Map(o.sellers.map((s) => [s.id, shownName(s.merchant, "merchant", read).shown.replace(" (fictional)", "")]));
  const said = (why: string) => withStoreNames(why, names);
  // The buyer's bid is a broadcast: one price on the table for every seller. Until the
  // buyer has bid, sellers hold their price (a seller must never drop against a $0 "bid").
  let lastBid: number | null = null;
  let offers: SellerOffer[] = [];
  // The Watcher's verdict per seller (ADR 0008): one row per seller each time it gets worse (clear → hold → refuse),
  // and the evidence behind its worst verdict so far, which the guard reads again when a cart is built.
  const verdicts = new Map<string, WatchVerdict>();
  const evidence = new Map<string, Evidence>();
  const rank: Record<WatchVerdict, number> = { clear: 0, hold: 1, refuse: 2 };

  const chips = o.chips ?? [];
  const wanted = Object.entries(wantedAttributes(chips));
  const asked = askedSellers(o.sellers, chips);

  for (let round = 1; round <= maxRounds; round++) {
    offers = asked
      .map((s) => (round === 1 ? s.open(round) : s.respond(lastBid, round, o.deps.rng)))
      .filter((x): x is SellerOffer => x !== null);
    if (offers.length === 0) {
      o.ledger.append({ ...base(), actor: "seller", action: "all-walked", round, why: "Every seller walked away." });
      return { outcome: "walked", reason: "all sellers walked", rounds: round };
    }
    const bySeller = new Map(o.sellers.map((s) => [s.id, s]));
    for (const off of offers) {
      // N8: the store name and item title are the seller's text. `why` and `data` carry them only when name-shaped and
      // clean; otherwise fixed words, and the text itself goes in `fenced`, quoted, like the note in `quoted`.
      const merchant = shownName(off.merchant, "merchant", read), item = shownName(off.item, "item", read);
      const fenced = { ...(merchant.withheld ? { merchant: quoteNote(off.merchant) } : {}), ...(item.withheld ? { item: quoteNote(off.item) } : {}) };
      const history = bySeller.get(off.sellerId)?.history ?? null;
      o.ledger.append({
        ...base(), actor: "seller", action: "offer", sellerId: off.sellerId, round, price: fromCents(off.price), currency: off.currency, layer: 1,
        why: `${merchant.shown} asks ${usd(off.price)}${off.shape === "one-off" ? "" : ` (${off.shape})`}.`,
        quoted: quoteNote(off.note),
        ...(merchant.withheld || item.withheld ? { fenced } : {}),
        data: { merchant: merchant.shown, item: item.shown, shape: off.shape, history },
      });
      const ev: Evidence = { quoted: quoteNote(off.note), merchant: off.merchant, item: off.item, history };
      const flags = watch(ev, read);
      const was = verdicts.get(off.sellerId) ?? "clear", now = verdictOf(flags);
      // An act stays on the record: a clean note after an attack doesn't wash it out, so the guard keeps the worst evidence.
      if (rank[now] >= rank[was]) evidence.set(off.sellerId, ev);
      const row = watchRow(merchant.shown.replace(" (fictional)", ""), flags);
      if (row && rank[now] > rank[was]) {
        verdicts.set(off.sellerId, now);
        const { actor, action, layer, verdict, why, data } = row;
        o.ledger.append({ ...base(), actor, action, sellerId: off.sellerId, round, layer, verdict, why, data });
      }
    }

    const input: BuyerInput = {
      want: { item: o.want.item, qty: o.want.qty, maxPrice: o.want.maxPrice },
      round, maxRounds,
      offers: offers.filter((off) => !o.hideRefused || verdicts.get(off.sellerId) !== "refuse").map((off) => fenceOffer(off, bySeller.get(off.sellerId)?.history ?? null)),
      history: [...history],
    };
    const { move, source, reason, plain } = await decideWithFallback(o.buyer, input, timeoutMs);
    // Code's haggling discipline, applied before the move is remembered: the buyer's memory holds what happened (the code's counter).
    const fix = discipline(move, { offers, history, round, maxRounds, maxPrice: o.want.maxPrice, patience, name: said, record: (id) => bySeller.get(id)?.history ?? null });
    // The buyer's memory holds the rule's move without the shopper's fallback sentence, so a replay that words the
    // fallback differently ("in the recorded run…") still feeds the next round the same input as the live run did.
    history.push(fix ? { type: "counter", sellerId: fix.sellerId, price: fix.price, why: "Code adjusted this move." } : plain ?? move);
    // The shopper reads `why` in plain words; the machine tag lives in `data` for the instruments
    // (budget:round, e2e:sandbox count `source === "rule-fallback"` and print `reason`).
    // A move the port made carries the port's own row fields (a recorded move: model and date); a rule fallback's doesn't.
    const data = reason ? { source, reason } : { source, ...(o.buyer.rowData ?? {}) };

    if (fix && (move.type === "accept" || move.type === "counter")) {
      // Two rows: what the AI proposed, then what code did instead (the AI proposes, code decides).
      o.ledger.append({ ...base(), actor: "buyer", action: `propose-${move.type}`, sellerId: move.sellerId, round, price: fromCents(move.price), currency: "USD", why: said(move.why), data });
      // Actor "code", no layer: a deal tactic, not one of the shopper's limits (the guard's layers stay the guard's).
      o.ledger.append({ ...base(), actor: "code", action: "counter", sellerId: fix.sellerId, round, price: fromCents(fix.price), currency: "USD", why: fix.why, data: { rule: fix.rule, proposed: fromCents(move.price), line: fromCents(roundCents(o.want.maxPrice * patience)) } });
      lastBid = fix.price;
      continue;
    }

    switch (move.type) {
      case "counter": {
        lastBid = move.price;
        o.ledger.append({ ...base(), actor: "buyer", action: "counter", sellerId: move.sellerId, round, price: fromCents(move.price), currency: "USD", why: said(move.why), data });
        break;
      }
      case "wait":
        o.ledger.append({ ...base(), actor: "buyer", action: "wait", round, why: said(move.why), data });
        break;
      case "walk":
        o.ledger.append({ ...base(), actor: "buyer", action: "walk", round, why: said(move.why), data });
        return { outcome: "walked", reason: said(move.why), rounds: round };
      case "accept": {
        const off = offers.find((x) => x.sellerId === move.sellerId);
        o.ledger.append({ ...base(), actor: "buyer", action: "accept", sellerId: move.sellerId, round, price: fromCents(move.price), currency: "USD", why: said(move.why), data });
        if (!off) {
          // The model named a seller that made no offer this round. Nothing it says becomes a cart, and the
          // model-chosen id is data, never shopper text (Lesson 17): a fixed sentence, the id in `data`.
          const reason = "The buyer named a seller that made no offer this round; a cart is only ever built from a real seller offer.";
          o.ledger.append({ ...base(), actor: "fence", action: "refuse", layer: 1, verdict: "refused", round, why: reason, data: { rule: UNKNOWN_SELLER, namedSellerId: move.sellerId.slice(0, 64) } });
          return { outcome: "refused", reason, rounds: round };
        }
        // The buyer's number is a proposal. The cart is built from the seller's actual offer, and the guard decides.
        // W49c: the listing's attributes ride on the cart, and are bound, only when a chip asks for one.
        const listed = bySeller.get(off.sellerId)?.attributes;
        const cart: Cart = { item: off.item, merchant: off.merchant, sellerId: off.sellerId, qty: o.want.qty, price: off.price, currency: off.currency, shape: off.shape, ...(o.catalogId === undefined ? {} : { catalogId: o.catalogId }), ...(wanted.length > 0 && listed ? { attributes: listed } : {}) };
        // The guard runs the same Watcher on this seller's latest offer: a refused seller's cart is refused in code.
        const decision = o.guard.decide(o.want, cart, chips, evidence.get(off.sellerId) ?? { quoted: quoteNote(off.note), history: bySeller.get(off.sellerId)?.history ?? null });
        if (decision.kind === "refused") return { outcome: "refused", reason: decision.reason, rounds: round };
        return { outcome: "cart", decision, cart, rounds: round };
      }
    }
  }
  o.ledger.append({ ...base(), actor: "buyer", action: "walk", round: maxRounds, why: `No deal in ${maxRounds} round${maxRounds === 1 ? "" : "s"}.` });
  return { outcome: "walked", reason: "out of rounds", rounds: maxRounds };
}


interface DisciplineContext {
  offers: SellerOffer[];
  history: BuyerMove[];
  round: number;
  maxRounds: number;
  maxPrice: Cents;
  patience: number;
  /** id → store name, for the sentence. */
  name: (s: string) => string;
  /** id → completed sales on record (null: no record available). */
  record: (id: string) => number | null;
}

/**
 * Code's haggling discipline (Joshua, 2026-10-23: "the AI should also get a good deal"). Returns the counter code makes
 * instead of the AI's move, or null when the move stands:
 * - before the last round, an accept above the patience line (90% of the max) becomes a counter toward the line;
 * - a counter above the ask of the seller it names (one with a record) comes down to that ask: never offer more than they ask
 *   (week 2's recording bid $52.00 against a $49.68 ask);
 * - before the last round, a counter above the line comes down to the line.
 */
export function discipline(move: BuyerMove, c: DisciplineContext): { sellerId: string; price: Cents; rule: string; why: string } | null {
  const line = roundCents(c.maxPrice * c.patience);
  const early = c.round < c.maxRounds;
  const left = c.maxRounds - c.round;
  const rounds = `${left} round${left === 1 ? "" : "s"} left`;
  const max = `${usd(c.maxPrice)}`;
  if (move.type === "accept" && early) {
    const off = c.offers.find((x) => x.sellerId === move.sellerId);
    // Only an accept the guard would allow is held: over the max or not one-off, the guard speaks first and refuses
    // ("Not yet" would hide that refusal and imply the price is fine later; reviewer, 014).
    if (!off || off.price <= line || off.price > c.maxPrice || off.shape !== "one-off") return null;
    const price = patienceCounter(c.maxPrice, c.history, off.price, c.patience);
    // Never "90%" for an ask that is held for being over 90%: round to the nearest point, and say "over" at the line.
    const linePct = Math.round(c.patience * 100), pct = Math.round((off.price / c.maxPrice) * 100);
    return { sellerId: off.sellerId, price, rule: PATIENCE_RULE, why: `Not yet: ${usd(off.price)} is ${pct > linePct ? `${pct}%` : `over ${linePct}%`} of your ${max} max with ${rounds}, so code counters at ${usd(price)} and keeps haggling.` };
  }
  // On the last round no seller answers a counter, so code doesn't claim one; the AI's move stands and the run ends.
  if (move.type === "counter" && early) {
    const off = c.offers.find((x) => x.sellerId === move.sellerId);
    if (off && (c.record(off.sellerId) ?? 0) > 0 && move.price > off.price) {
      const price = Math.min(off.price, line);
      return { sellerId: off.sellerId, price, rule: OVER_ASK_RULE, why: `${c.name(off.sellerId)} asks only ${usd(off.price)}, so code never bids the ${usd(move.price)} proposed: it counters at ${usd(price)}.` };
    }
    if (move.price > line) {
      return { sellerId: move.sellerId, price: line, rule: PATIENCE_RULE, why: `Not yet: a ${usd(move.price)} bid is more than ${Math.round(c.patience * 100)}% of your ${max} max with ${rounds}, so code holds the bid at ${usd(line)}.` };
    }
  }
  return null;
}

/** The fence's rule id when a buyer accepts from a seller who made no offer this round (`data.rule`, beside the guard's). */
export const UNKNOWN_SELLER = "unknown-seller";

/** Ask the port; on timeout, a bad shape or a thrown error, the rule engine moves and the ledger says so in plain words. The judge box reuses it with its own budget. */
export async function decideWithFallback(port: LlmPort, input: BuyerInput, timeoutMs: number): Promise<{ move: BuyerMove; source: string; reason?: FallbackReason; plain?: BuyerMove }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // On timeout the port is also told to stop, so a late model call is cancelled rather than left running.
  const abort = new AbortController();
  const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => { abort.abort(); rej(new Error("timeout")); }, timeoutMs); });
  try {
    const raw: unknown = await Promise.race([port.decide(input, abort.signal), timeout]);
    if (!isBuyerMove(raw)) return fellBack("bad-move");
    return { move: raw, source: port.name };
  } catch (e) {
    if (e instanceof RecordedFallback) return fellBack("recorded-fallback", e.reason);
    return fellBack(e instanceof TapeMiss ? "tape-miss" : e instanceof Error && e.message === "timeout" ? "timeout" : "error");
  } finally {
    if (timer) clearTimeout(timer);
  }
  function fellBack(reason: FallbackReason, recorded?: "timeout" | "error") {
    const m = ruleMove(input);
    return { move: { ...m, why: `${m.why} ${fallbackLabel(reason, timeoutMs, recorded)}` }, source: "rule-fallback", reason, plain: m };
  }
}

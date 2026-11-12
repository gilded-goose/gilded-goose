// The judge box (M2 step 2, ADR 0009). A judge plays a seller: an asking price and a
// note, offered beside the two demo sellers with a record. The buyer makes one move,
// and the guard decides from code. Two modes: "Plain rule (no AI)", free, where the fence stays
// closed (the default wherever live AI isn't available within its caps, `judgeMode`); and "AI reads your note", where the note reaches
// the buyer through the fence's open mode as quoted data, in one call with a 3 s budget
// and no race. The card puts the buyer's proposal above the guard's verdict and names
// what read the text (Lesson 24). Nothing here is kept: the ledger lives for one
// request, is shown to the judge only, and no payment port is ever reached (no order
// is placed from the judge box, so the note can't reach custom_id or PayPal).

import { DAY_MS, type Deps, type Hasher } from "../deps.ts";
import { ShopperLedger, type LedgerEvent, type LedgerStore } from "../ledger/events.ts";
import { fromCents, toCents, type Cents, usd } from "../money.ts";
import { DEMO_ENTRY, DEMO_SHOPPER, demoDeps, demoGuard, demoPolicy, demoSellers, demoWant } from "../scenario.ts";
import type { SellerOffer } from "../sellers/types.ts";
import type { Cart } from "../trust/cart.ts";
import { fenceOffer, MAX_QUOTE_CHARS, quoteNote, type FenceMode } from "../trust/fence.ts";
import type { Guard, GuardDecision } from "../trust/guard.ts";
import type { Want } from "../trust/policy.ts";
import { watch, watchRow } from "../trust/watch.ts";
import { askReader, type ReaderMiss, type ReaderPort } from "../trust/reader.ts";
import { RuleBuyer } from "../buyer/rule.ts";
import type { BuyerInput, BuyerMove, LlmPort } from "../buyer/port.ts";
import { decideWithFallback, fallbackLabel, JUDGE_NOTE_TIMEOUT_MS, UNKNOWN_SELLER } from "../haggle/engine.ts";

/** The judge's own seller; its sales record depends on who reads the note (JUDGE_HISTORY). */
export const JUDGE_SELLER = { id: "your-shop", merchant: "Your shop (you, the judge)" } as const;
/** Your shop's completed sales. With the AI reading, a normal record (between the demo sellers' 87 and 412), so the note and
 *  the price are the only things that differ from a seller it may buy from (Joshua, 2026-10-23). The plain rule never reads the note, so it
 *  keeps the new shop with no record. */
export const JUDGE_HISTORY = { rule: 0, ai: 150 } as const;
export const MAX_JUDGE_NOTE = MAX_QUOTE_CHARS;
/** Highest asking price the box accepts; the guard refuses far below it, this only keeps the number sane. */
export const MAX_JUDGE_PRICE = toCents("100000.00");

export type JudgeMode = "rule" | "ai";
/** Whether the live AI may be called for this request: the server decides from its key and caps. */
export type AiState = "on" | "capped" | "off";

/** The layers that read the judge's text live (the Watcher since step 6); the label never names a layer that didn't run. */
export const LIVE_LAYERS = "fence, Watcher and guard";

export const NOTICE = {
  capped: `Live AI cap reached today · ${LIVE_LAYERS} still ran live on your text · buyer: plain rule.`,
  off: `Live AI is off on this server · ${LIVE_LAYERS} still ran live on your text · buyer: plain rule.`,
} as const;

export const LABEL = {
  rule: `Your text ran through the ${LIVE_LAYERS} live. Buyer: plain rule (no AI).`,
  ai: (aiName: string) => `Your text ran through the ${LIVE_LAYERS} live. ${aiName} read your note and proposed; the guard decided.`,
  // A round run in the browser while live mode isn't answering (H1) is never called "live".
  browser: `Your text ran through the ${LIVE_LAYERS} just now, in your browser. Buyer: plain rule (no AI).`,
} as const;

export interface JudgeRequest {
  note: string;
  price: Cents;
  mode: JudgeMode;
}

/**
 * One dollar amount a browser sent, as cents: text like "500.00", from $0.01 up to MAX_JUDGE_PRICE. Anything else
 * (not text, not a dollar amount, zero or less, over the ceiling) is a plain error, never a throw. The judge box's price
 * and a run's maxPrice (POST /api/runs, Round 0 red team A13) both go through here.
 */
export function parsePrice(raw: unknown, name = "price"): { ok: true; value: Cents } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: `${name} must be a dollar amount like 500.00` };
  let price: Cents;
  try { price = toCents(raw); } catch { return { ok: false, error: `${name} must be a dollar amount like 500.00` }; }
  if (price <= 0 || price > MAX_JUDGE_PRICE) return { ok: false, error: `${name} must be between $0.01 and ${usd(MAX_JUDGE_PRICE)}` };
  return { ok: true, value: price };
}

/** Validate what a browser sent. The note is capped at 500 characters, never cut silently. */
export function parseJudgeRequest(body: unknown): { ok: true; value: JudgeRequest } | { ok: false; error: string } {
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof b.note !== "string") return { ok: false, error: "note must be text" };
  if (b.note.length > MAX_JUDGE_NOTE) return { ok: false, error: `note is over ${MAX_JUDGE_NOTE} characters` };
  const parsed = parsePrice(b.price);
  if (!parsed.ok) return parsed;
  const price = parsed.value;
  const mode = b.mode === undefined ? "rule" : b.mode;
  if (mode !== "rule" && mode !== "ai") return { ok: false, error: "mode is rule or ai" };
  return { ok: true, value: { note: b.note, price, mode } };
}

export interface JudgeOptions {
  req: JudgeRequest;
  want: Want;
  guard: Guard;
  deps: Deps;
  ledger: LedgerStore;
  shopperId: string;
  /** The catalog entry the judge's want is for (N9): every cart names it, so the guard reads the dial's category from the catalog. */
  catalogId?: string;
  /** The live AI port (one call, no race), or null when the server has none. */
  ai: LlmPort | null;
  aiState: AiState;
  /** The name the shopper reads, e.g. "Claude Haiku 5.5". */
  aiName: string;
  /** The AI reader on your offer's words (W41 part 3), in AI mode only. It can only add caution. */
  reader?: ReaderPort | null;
  /** The plain-rule buyer; tests pass a spy. */
  rule?: LlmPort;
  timeoutMs?: number;
}

/**
 * What the screen shows, top to bottom. Every line above `why` is written by code; `why` is the buyer's own
 * sentence, which in AI mode your note can steer, so it always comes last (011 §3: verdict above the AI's words).
 */
export interface JudgeCard {
  /** What moved: the AI, the plain rule by choice, or the plain rule because the AI was capped, off or late. */
  source: "ai" | "rule" | "rule-capped" | "rule-off" | "rule-fallback";
  /** The one-look answer, from the guard: "Not buying at $500.00. Your max is still $60.00." */
  headline: string;
  /** A fixed sentence when the AI was asked for and didn't move (cap, off, timeout). */
  notice: string | null;
  /** What the fence did with your note in this mode. */
  fence: string;
  /** "AI proposed: accept your offer · $500.00" or "Plain rule (no AI) proposed: …". */
  proposal: string;
  /** The guard's verdict on your offer, from code. */
  guard: string;
  /** The guard's verdict on the buyer's own pick, when it accepted another seller. */
  guardPick: string | null;
  label: string;
  /** The buyer's own sentence, ids mapped to names (Lesson 17); withheld if it writes raw cents. */
  why: string;
  /** The buyer accepted your offer. Not "fooled": with a record, taking a fair offer under the max is a right answer. */
  tookYours: boolean;
  /** Whether the AI reader read your offer's words, or why not. It can only add caution, so a miss changes nothing. */
  reader: "read" | ReaderMiss;
  /** The card's line about the reader (`READER_ROW`), in rounds that asked the AI only; null in plain-rule rounds. */
  readerSaid: string | null;
  events: LedgerEvent[];
}

/**
 * W41 part 3 follow-up: what the card says about the AI reader in a round that asked the AI, so a miss is said, never
 * silent. It can only add caution, so when it didn't read, code's verdict is the whole verdict, and the line says so.
 */
export const READER_ROW: Record<"read" | ReaderMiss, string> = {
  read: "An AI reader read your note too. It can only add caution, never clear or buy.",
  off: "The AI reader wasn't asked this round, so code's verdict stands alone.",
  timeout: "The AI reader didn't answer in time, so code's verdict stands alone.",
  error: "The AI reader didn't answer this round, so code's verdict stands alone.",
  "bad-answer": "The AI reader's answer was off its form, so it was ignored and code's verdict stands alone.",
};

export const FENCE = {
  closed: "Fence: closed · the buyer saw only that your note exists, never its words.",
  open: "Fence: open in this mode only · your note reached the AI as quoted seller data (markers stripped, 500 characters max), never as instructions.",
} as const;

/**
 * W41 part 2: what the card says when the Watcher found nothing in this note. It reads words, not intent, so "nothing
 * fired" is never "this seller is fine": the line says what was looked for and what still decides.
 */
export const WATCHER_CLEAR = "The Watcher found no known scam wording in this note, which doesn't make a seller safe: your max and your tap still decide.";

/**
 * The card's one-look answer, from the guard's verdict and the Watcher's rows for your offer: the one place the headline
 * is built, so no path says "within your max" without a Watcher line (a hold or refusal row, or `WATCHER_CLEAR`).
 */
export function judgeHeadline(verdict: GuardDecision, price: Cents, max: Cents, watcher: readonly LedgerEvent[]): string {
  const p = `${usd(price)}`;
  // Over the max with an act in the note: the guard refused on the price first, and the Watcher's row says why too.
  const watched = watcher.some((e) => e.verdict === "refused");
  if (verdict.kind === "refused") {
    return verdict.rule === "watcher" ? `Not buying at ${p}: your note's words are the evidence, not the price.`
      : watched && verdict.rule === "max" ? `Not buying at ${p}: it's over your ${usd(max)} max, and your note's words are evidence too.`
      : `Not buying at ${p}. Your max is still ${usd(max)}.`;
  }
  // A held offer has its Watcher row on the card; a clear one gets the honest clear line. A new shop's no-history hold is
  // about its record, not its words, so it doesn't hide the line (rule mode, where your shop has no record).
  const read = watcher.filter((e) => (e.data?.rule ?? "") !== "no-history");
  return `${p} is within your max. Nothing is bought without your yes.${read.length === 0 ? ` ${WATCHER_CLEAR}` : ""}`;
}

/** Shown instead of the buyer's sentence when it writes a price in raw cents (Lesson 8). */
export const WHY_WITHHELD = "The buyer's sentence wrote a price in raw cents, so it is not shown.";

/** One judge round: the judge's offer beside the demo sellers, one buyer move, the guard's verdict on the judge's cart. */
export async function judgeRound(o: JudgeOptions): Promise<JudgeCard> {
  const { req, want } = o;
  const base = () => ({ t: o.deps.clock.now(), shopperId: o.shopperId, visibility: "owner" as const });
  const rule = o.rule ?? new RuleBuyer();
  const useAi = req.mode === "ai" && o.aiState === "on" && o.ai !== null;
  const fence: FenceMode = useAi ? "open" : "closed";

  const yours: SellerOffer = { sellerId: JUDGE_SELLER.id, merchant: JUDGE_SELLER.merchant, item: want.item, price: req.price, currency: "USD", shape: "one-off", round: 1, note: req.note };
  // The two demo sellers with a record, on their opening offers; the judge takes the third seat.
  const others = demoSellers().filter((s) => (s.history ?? 0) > 0);
  const offers: Array<{ offer: SellerOffer; history: number | null }> = [...others.map((s) => ({ offer: s.open(1), history: s.history })), { offer: yours, history: useAi ? JUDGE_HISTORY.ai : JUDGE_HISTORY.rule }];
  // One round, and it is the last: the buyer must take an offer or walk now. With the AI reading, your shop has a record like
  // the others, so the honest prompt's "no record, don't buy" rule can't be what turns your note down.
  const input: BuyerInput = {
    want: { item: want.item, qty: want.qty, maxPrice: want.maxPrice },
    round: 1, maxRounds: 1,
    offers: offers.map(({ offer, history }) => fenceOffer(offer, history, fence)),
    history: [],
  };
  const timeoutMs = o.timeoutMs ?? JUDGE_NOTE_TIMEOUT_MS;
  // The reader and the buyer are asked at once, so the round waits for the slower of the two, not both. The reader sees
  // only your offer's words, quoted; the demo sellers are ours.
  const deciding = decideWithFallback(useAi ? o.ai! : rule, input, timeoutMs);
  const { reading, miss } = await askReader(useAi ? o.reader ?? null : null, yours, timeoutMs);
  for (const { offer, history } of offers) {
    o.ledger.append({
      ...base(), actor: "seller", action: "offer", sellerId: offer.sellerId, round: 1, price: fromCents(offer.price), currency: offer.currency, layer: 1,
      why: `${offer.merchant} asks ${usd(offer.price)}.`, quoted: quoteNote(offer.note), data: { merchant: offer.merchant, item: offer.item, shape: offer.shape, history },
    });
    // The Watcher reads every offer before any guard does, as in a haggle, so its row is there even when the guard
    // refuses first on the price (W29): the label names it because it ran.
    const row = watchRow(nameOf(offer), watch({ quoted: quoteNote(offer.note), merchant: offer.merchant, item: offer.item, history, ...readingOf(offer) }));
    if (row) o.ledger.append({ ...base(), ...row, sellerId: offer.sellerId, round: 1 });
  }

  const decided = await deciding;
  const source: JudgeCard["source"] = useAi ? (decided.source === "rule-fallback" ? "rule-fallback" : "ai")
    : req.mode === "rule" ? "rule" : o.aiState === "capped" ? "rule-capped" : "rule-off";
  const { move } = decided;
  const named = new Map(offers.map(({ offer }) => [offer.sellerId, nameOf(offer)]));
  // The fallback's own words carry the timeout sentence; the card shows that sentence on its own line instead.
  const why = checkWhy(withNames(source === "rule-fallback" ? stripFallback(move.why, decided.reason, timeoutMs) : move.why, named), input);
  o.ledger.append({ ...base(), actor: "buyer", action: move.type, round: 1, why, data: decided.reason ? { source: decided.source, reason: decided.reason } : { source: decided.source }, ...moveFields(move) });

  const accepted = move.type === "accept" ? offers.find(({ offer }) => offer.sellerId === move.sellerId)?.offer : undefined;
  if (move.type === "accept" && !accepted) {
    o.ledger.append({ ...base(), actor: "fence", action: "refuse", layer: 1, verdict: "refused", round: 1, data: { rule: UNKNOWN_SELLER, namedSellerId: move.sellerId.slice(0, 64) },
      why: "The buyer named a seller that made no offer this round; a cart is only ever built from a real seller offer." });
  }
  const tookYours = accepted?.sellerId === JUDGE_SELLER.id;
  // A cart is only ever built from a seller's real offer, never from the buyer's number.
  // The guard reads each seller's note and record through the Watcher (ADR 0008), as it does in a haggle.
  const evidenceOf = (offer: SellerOffer) => ({ quoted: quoteNote(offer.note), history: offers.find((x) => x.offer.sellerId === offer.sellerId)?.history ?? null, ...readingOf(offer) });
  const pick = accepted && !tookYours ? o.guard.decide(want, cartFrom(accepted, want, o.catalogId), [], evidenceOf(accepted)) : null;
  // The probe (Lesson 30): the guard is asked about your cart whatever the buyer did, so its verdict is always code's.
  const verdict = o.guard.decide(want, cartFrom(yours, want, o.catalogId), [], evidenceOf(yours));

  // A fallback round still asked the AI: only the buyer didn't answer (the reader may have read), so never "no AI".
  const who = source === "ai" ? "AI" : source === "rule-fallback" ? "Plain rule (the AI buyer didn't answer)" : "Plain rule (no AI)";
  function readingOf(offer: SellerOffer) { return offer.sellerId === JUDGE_SELLER.id && reading ? { reading } : {}; }
  return {
    source,
    headline: judgeHeadline(verdict, req.price, want.maxPrice, o.ledger.read().filter((e) => e.actor === "watcher" && e.sellerId === JUDGE_SELLER.id)),
    notice: source === "rule-capped" ? NOTICE.capped : source === "rule-off" ? NOTICE.off : source === "rule-fallback" ? fallbackLabel(decided.reason ?? "error", timeoutMs) : null,
    fence: fence === "open" ? FENCE.open : FENCE.closed,
    proposal: `${who} proposed: ${describeMove(move, named)}`,
    guard: guardLine(verdict, req.price, want.maxPrice, tookYours),
    guardPick: pick && accepted ? pickLine(pick, accepted) : null,
    label: source === "ai" ? LABEL.ai(o.aiName) : LABEL.rule,
    why,
    tookYours,
    reader: miss ?? "read",
    readerSaid: useAi ? READER_ROW[miss ?? "read"] : null,
    events: o.ledger.read(),
  };
}

function cartFrom(offer: SellerOffer, want: Want, catalogId: string | undefined): Cart {
  return { item: offer.item, merchant: offer.merchant, sellerId: offer.sellerId, qty: want.qty, price: offer.price, currency: offer.currency, shape: offer.shape, ...(catalogId === undefined ? {} : { catalogId }) };
}

function nameOf(offer: SellerOffer): string {
  return offer.sellerId === JUDGE_SELLER.id ? "your offer" : offer.merchant.replace(" (fictional)", "");
}

function describeMove(move: BuyerMove, named: Map<string, string>): string {
  switch (move.type) {
    case "accept": return `accept ${named.get(move.sellerId) ?? "a seller who made no offer"} · ${usd(move.price)}`;
    case "counter": return `counter · ${usd(move.price)}`;
    case "wait": return "wait";
    case "walk": return "walk away";
  }
}

function moveFields(move: BuyerMove): Partial<LedgerEvent> {
  return move.type === "accept" || move.type === "counter" ? { sellerId: move.sellerId.slice(0, 64), price: fromCents(move.price), currency: "USD" } : {};
}

/** The guard's sentence about your offer. Over the max it names both numbers; otherwise it says what the guard would do. */
export function guardLine(d: GuardDecision, price: Cents, max: Cents, tookYours: boolean): string {
  const p = `${usd(price)}`;
  if (d.kind === "refused") {
    const over = `over your ${usd(max)} max`;
    if (tookYours) return `Guard: refused · ${d.rule === "max" ? `${p} is ${over}` : d.reason}.`;
    return `Guard: your ${p} is refused whatever the buyer proposes · ${d.rule === "max" ? over : d.reason}.`;
  }
  return tookYours
    ? `Guard: ${p} is within your limits, so it asks you first · no order is placed from the judge box.`
    : `Guard: ${p} would be within your limits · it would still ask you first.`;
}

/** The guard on the buyer's own pick: always the seller's real offer, never the buyer's number. */
function pickLine(d: GuardDecision, offer: SellerOffer): string {
  const what = `${nameOf(offer)} at ${usd(offer.price)}`;
  return d.kind === "refused" ? `Guard on the buyer's pick: ${what} refused · ${d.reason}.` : `Guard on the buyer's pick: ${what} is within your limits · it still asks you before paying.`;
}

/** Text the judge reads never carries an internal id (Lesson 17): each seller id becomes its name. */
function withNames(text: string, named: Map<string, string>): string {
  let out = text;
  for (const [id, name] of named) out = out.replace(new RegExp(`\\b${id}\\b`, "gi"), name);
  return out;
}

/** Withhold a sentence that shows one of this round's prices as bare cents (Lesson 8: "4773"); ids were already mapped to names. */
function checkWhy(text: string, input: BuyerInput): string {
  const cents = [input.want.maxPrice, ...input.offers.map((o) => o.price)].map(String);
  return cents.some((c) => new RegExp(`(?<![$.\\d])${c}(?![\\d.])`).test(text)) ? WHY_WITHHELD : text;
}

function stripFallback(why: string, reason: string | undefined, timeoutMs: number): string {
  const tail = ` ${fallbackLabel((reason ?? "error") as Parameters<typeof fallbackLabel>[0], timeoutMs)}`;
  return why.endsWith(tail) ? why.slice(0, -tail.length) : why;
}

/**
 * One judge round the way the demo ships it, built in one place for the server and the browser (H1; as W6's one guard
 * factory): fresh deps on the given seed and clock, the demo Policy, guard and want, and a throwaway ledger labeled
 * `attack`, so the judge's rows never reach any shopper's week, dial or grid (N19). The browser runs it only in plain-rule
 * mode while live mode isn't answering: it has no AI port, no key and no payment port.
 */
export async function demoJudgeRound(o: { req: JudgeRequest; hash: Hasher; now: () => number; seed: number; runId: string; ai: LlmPort | null; reader?: ReaderPort | null; aiState: AiState; aiName: string; where: "server" | "browser" }): Promise<JudgeCard> {
  if (o.where === "browser" && (o.ai !== null || (o.reader ?? null) !== null || o.req.mode !== "rule")) throw new Error("the browser runs plain-rule rounds only");
  const deps = { ...demoDeps(o.seed, o.hash), clock: { now: o.now } };
  const ledger = new ShopperLedger().run(o.runId, "attack");
  const card = await judgeRound({
    req: o.req, want: demoWant({ deadline: o.now() + 7 * DAY_MS }), guard: demoGuard(deps, ledger, demoPolicy()), deps, ledger, shopperId: DEMO_SHOPPER, catalogId: DEMO_ENTRY,
    ai: o.ai, reader: o.reader ?? null, aiState: o.aiState, aiName: o.aiName,
  });
  return o.where === "browser" ? { ...card, label: LABEL.browser } : card;
}

// Layer 4, the AI reader (W41 part 3): a model reads what a seller wrote and may only add caution. Its answer is read as
// unknown and enters the Watcher through `escalate`, the one function that can only add a flag, never drop or soften
// one: clear can become hold, hold can become refuse, and nothing goes down. The worst flag decides (`verdictOf`), so a
// reader that is fooled, broken or hostile can at most hold an honest seller for a tap, or refuse one whose words code
// already held. It refuses only there (Joshua, 2026-10-23: "history alone never refuses, evidence does"), never on a
// hold Joshua kept as a hold (`NEVER_REFUSE`: cash alone and the plain-word asks; cash beside Zelle or another app may refuse), and climbs one step at most, however often it is asked. Its input is the seller's three fields as quoted data (`quoteNote`), and
// nothing else: no price, no want, no limit. Its words never reach the ledger: fixed phrases only.

import { quoteNote } from "./fence.ts";
import { NEVER_REFUSE, type EvidenceRule } from "./notes.ts";

/** What the reader may say: a verdict, and which kind of sign it read, both from fixed lists. */
export type ReaderSign = "off-paypal" | "gift-card" | "instructs-agent" | "writes-memory" | "other";
export const READER_SIGNS: readonly ReaderSign[] = ["off-paypal", "gift-card", "instructs-agent", "writes-memory", "other"];
export interface Reading { verdict: "clear" | "hold" | "refuse"; sign: ReaderSign }

/** The reader's whole input: what the seller wrote, each field quoted. No price, no want, no limit. */
export interface ReaderInput { note: string; merchant: string; item: string }

export interface ReaderPort {
  readonly name: string;
  /** One call. Whatever it returns is unknown until `parseReading` says otherwise. Abort `signal` at the timeout. */
  read(input: ReaderInput, signal?: AbortSignal): Promise<unknown>;
}

/** Why there's no reading: no reader here, the call ran past its time, it threw, or it answered off the schema. */
export type ReaderMiss = "off" | "timeout" | "error" | "bad-answer";

export function readerInput(seller: { note: string; merchant: string; item: string }): ReaderInput {
  return { note: quoteNote(seller.note), merchant: quoteNote(seller.merchant), item: quoteNote(seller.item) };
}

/**
 * A reading, or null for anything that isn't exactly one: extra keys, other words, other types. Each value is read once
 * into a new frozen object, so a getter can't answer one thing to the Watcher row and another to the guard.
 */
export function parseReading(x: unknown): Reading | null {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return null;
  const keys = Object.keys(x);
  if (keys.length !== 2 || !keys.includes("verdict") || !keys.includes("sign")) return null;
  const { verdict, sign } = x as Record<string, unknown>;
  if (verdict !== "clear" && verdict !== "hold" && verdict !== "refuse") return null;
  if (!READER_SIGNS.includes(sign as ReaderSign)) return null;
  return Object.freeze({ verdict, sign: sign as ReaderSign });
}

/**
 * One read with a time limit. It quotes the seller's fields itself, so no caller can hand the reader raw text. Every
 * failure is a miss, and a miss changes nothing: code's verdict stands.
 */
export async function askReader(port: ReaderPort | null, seller: { note: string; merchant: string; item: string }, timeoutMs: number): Promise<{ reading: Reading | null; miss?: ReaderMiss }> {
  if (!port) return { reading: null, miss: "off" };
  const input = readerInput(seller);
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<"late">((resolve) => { timer = setTimeout(() => { ctl.abort(); resolve("late"); }, timeoutMs); });
  try {
    const got = await Promise.race([port.read(input, ctl.signal), late]);
    if (got === "late") return { reading: null, miss: "timeout" };
    const reading = parseReading(got);
    return reading ? { reading } : { reading: null, miss: "bad-answer" };
  } catch {
    return { reading: null, miss: ctl.signal.aborted ? "timeout" : "error" };
  } finally {
    clearTimeout(timer);
  }
}

/** The fixed phrases a reader flag carries (the screen's words, never the model's). */
export const READER_SAID = {
  hold: "an AI reader thinks this may be a scam",
  refuse: "words code held and the AI reader read as a scam",
} as const;

/** The smallest flag shape `escalate` needs; `watch.ts`'s `Flag` is one. */
interface FlagLike { rule: string; severity: "hold" | "refuse"; field?: string; said: string }

/**
 * Code's flags with the reader's reading folded in. Returns the same flags, plus at most one reader flag, and only when
 * it raises the verdict by one step: clear → hold on any "hold" or "refuse" reading; hold → refuse on a "refuse" reading
 * when code held on the seller's own words (a flag with a field), never on its record alone or a `NEVER_REFUSE` hold. Anything else, including
 * a reading that isn't one, a "clear", or flags that already carry a reader flag, returns the flags unchanged.
 */
export function escalate<F extends FlagLike>(flags: readonly F[], reading: unknown, cardAside = false): Array<F | ReaderFlag> {
  const r = parseReading(reading);
  const out: Array<F | ReaderFlag> = [...flags];
  if (!r || r.verdict === "clear" || flags.some((f) => f.rule === "ai-reader")) return out;
  if (flags.some((f) => f.severity === "refuse")) return out;
  // Cash in person with a card that only comes along (`cardIsAside`): nothing asks to be paid another way, so it's still cash alone.
  // A card offered as a way to pay ("Cash or gift card") reads as a list, not a mention, and may still refuse. So may any other mention beside cash ("Buy a Steam card").
  const cash = flags.some((f) => f.rule === "asks-for-cash");
  if (flags.length === 0) {
    out.push({ rule: "ai-reader", severity: "hold", said: READER_SAID.hold, sign: r.sign });
  } else if (r.verdict === "refuse" && flags.some((f) => f.severity === "hold" && f.field !== undefined && !NEVER_REFUSE.has(f.rule as EvidenceRule) && !(cash && cardAside && f.rule === "mentions-gift-card"))) {
    out.push({ rule: "ai-reader", severity: "refuse", said: READER_SAID.refuse, sign: r.sign });
  }
  return out;
}

/** The reader's own flag. No field: it read all three, and it never counts as code's reading of the words. */
export interface ReaderFlag { rule: "ai-reader"; severity: "hold" | "refuse"; said: string; sign: ReaderSign }

// The AI reader in shopping runs (Joshua, Fri Nov 6 12:10): "It may only hold a seller for my tap, never clear one, never
// touch money, limits or the cart." Its whole output is `ReaderHold`: a hold and which sign it read, nothing else. It is a
// `Reading` whose verdict can only be "hold", so through `escalate` it lifts clear to hold and nothing more (a "hold"
// reading never refuses). Code reads first; the run asks the reader only about sellers code cleared.

/** The one thing the shopping-run reader may say. No clear, no refuse, no amount, no limit, no cart: its type has no room. */
export interface ReaderHold { readonly verdict: "hold"; readonly sign: ReaderSign }

/** A hold for a "hold" or "refuse" reading, else null: a "clear", or anything that isn't exactly a reading, adds nothing. */
export function holdOnly(reading: unknown): ReaderHold | null {
  const r = parseReading(reading);
  return r && r.verdict !== "clear" ? Object.freeze({ verdict: "hold" as const, sign: r.sign }) : null;
}

/** Why a shopping run's sellers stand on code's read alone (or part of them). */
export type ShopMiss = ReaderMiss | "run-cap" | "visitor-cap" | "day-cap";

/** The run's plain words for each outcome (fixed, the screen's; never the model's). */
export const SHOP_READER_SAYS = {
  read: "An AI reader also read each seller code cleared. It can only hold one for your yes, never clear one.",
  none: "Code held or set aside every seller, so no AI reader was asked.",
  off: "No AI reader on this run: code's read stands alone.",
  timeout: "The AI reader didn't answer in time, so code's read stands alone for some sellers.",
  error: "The AI reader failed, so code's read stands alone for some sellers.",
  "bad-answer": "The AI reader answered off its form, so code's read stands alone for some sellers.",
  "run-cap": "This run reached its AI reader cap, so code's read stands alone for the rest.",
  "visitor-cap": "This address reached today's AI reader cap, so code's read stands alone for the rest.",
  "day-cap": "The AI reader reached today's cap, so code's read stands alone for the rest.",
} as const satisfies Record<ShopMiss | "read" | "none", string>;

export interface ShopSeller { id: string; note: string; merchant: string; item: string; /** Code's verdict, read first. */ code: "clear" | "hold" | "refuse" }
export interface ShopRead { holds: ReadonlyMap<string, ReaderHold>; says: string; miss: ShopMiss | null; asked: number }

/**
 * One shopping run's reads. Only sellers code cleared are asked (a hold can't lift a hold or a refusal), at most `perRun`
 * of them, each a take on this address's `visitor` cap, then on the server's `day` cap ("all"), made before the call.
 * The address is counted first, so one script runs out of its own reads long before it can use up everyone's; a take
 * the day cap then refuses is handed back to the address, so a full day doesn't eat into its count. Reads run side by
 * side, each under `timeoutMs`. A miss of any kind leaves that seller on code's read, and the run says so; a hold from a
 * reader that did answer still stands, since it only adds caution. No port (no key, or live AI paused) is the
 * code-only default, and takes from neither cap. A `shared` visitor key (every caller whose address can't be read
 * shares one) that runs out says the day's words, never "This address": it isn't theirs alone (Q, Nov 6).
 */
export async function readShop(port: ReaderPort | null, sellers: readonly ShopSeller[], o: { perRun: number; timeoutMs: number; day: { take(key: string): boolean }; visitor?: { take(): boolean; give(): void; shared?: boolean } }): Promise<ShopRead> {
  const cleared = sellers.filter((s) => s.code === "clear");
  if (cleared.length === 0) return { holds: new Map(), says: SHOP_READER_SAYS.none, miss: null, asked: 0 };
  if (!port) return { holds: new Map(), says: SHOP_READER_SAYS.off, miss: "off", asked: 0 };
  const asks: ShopSeller[] = [];
  let capMiss: ShopMiss | null = null;
  for (const s of cleared) {
    if (asks.length >= o.perRun) { capMiss = "run-cap"; break; }
    if (o.visitor && !o.visitor.take()) { capMiss = o.visitor.shared ? "day-cap" : "visitor-cap"; break; }
    if (!o.day.take("all")) { o.visitor?.give(); capMiss = "day-cap"; break; }
    asks.push(s);
  }
  const got = await Promise.all(asks.map(async (s) => ({ id: s.id, ...(await askReader(port, s, o.timeoutMs)) })));
  const holds = new Map<string, ReaderHold>();
  for (const g of got) { const h = holdOnly(g.reading); if (h) holds.set(g.id, h); }
  // A read that missed is said before a cap (one line per run; both leave those sellers on code's read).
  const miss: ShopMiss | null = got.find((g) => g.miss)?.miss ?? capMiss;
  return { holds, says: miss ? SHOP_READER_SAYS[miss] : SHOP_READER_SAYS.read, miss, asked: asks.length };
}

/**
 * What a server keeps of a market's reads: every hold so far, the last read that missed nothing (reused as is), and
 * the last one that missed, with when (reused for `MISSED_READ_MS`, then asked again).
 */
export interface KeptRead { holds: ReadonlyMap<string, ReaderHold>; full: ShopRead | null; missed?: { read: ShopRead; at: number } | null }

/**
 * How long a read that missed (a timeout, an error, a cap) stands before the market is asked again (Q, Nov 6: a missed
 * read was asked again on every ask of a cached market, which costs no Ask cap, so asks alone could spend the day's
 * reads). At most one re-read a market a minute, whoever asks. Decided by default: 60 s. Flip if Joshua says otherwise.
 */
export const MISSED_READ_MS = 60_000;

/** The kept read to answer with now, if any: a full one always, a missed one for `MISSED_READ_MS` after it was read. */
export function keptAnswer(kept: KeptRead | undefined, now: number): ShopRead | null {
  if (!kept) return null;
  if (kept.full) return kept.full;
  return kept.missed && now - kept.missed.at >= 0 && now - kept.missed.at < MISSED_READ_MS ? kept.missed.read : null;
}

/**
 * The kept reads after one fresh read at `now`. Holds only ever add, so a hold the Desk showed is still there at the
 * cart, even from a run where another read missed (a hold shown at one step must never vanish at the next). A read
 * with no reader ("off") is never kept as a miss: it cost nothing, and a reader that comes back should be asked. Nor is
 * one stopped by the asker's own address cap ("visitor-cap"): the kept read answers everyone who asks for that market,
 * and another shopper must neither lose their reads nor be told "This address" (Sonnet re-check, Nov 6). Null when
 * there is nothing to keep.
 */
export function keepRead(kept: KeptRead | undefined, read: ShopRead, now = 0): KeptRead | null {
  const holds = new Map([...(kept?.holds ?? []), ...read.holds]);
  const full = read.miss === null && read.asked > 0 ? read : null;
  const missed = !full && read.miss !== null && read.miss !== "off" && read.miss !== "visitor-cap" ? { read, at: now } : null;
  return holds.size > 0 || full || missed ? { holds, full, missed } : null;
}


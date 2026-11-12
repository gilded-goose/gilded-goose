// The recorded buyer (ADR 0011). `recordPort` wraps a live port and writes down each move it
// made, keyed by a hash of the exact input, with how long the live call took. `RecordedPort`
// plays those moves back: the engine, the fence and the guard still run for real on every
// replay; only the model's answers are canned, and every buyer row says so (source
// "recorded", model, date). An input the tape never saw throws, so a tape gone stale with the
// prompt, the prices or the sellers fails `pnpm check` instead of quietly improvising.

import type { Hasher } from "../deps.ts";
import type { Cents } from "../money.ts";
import type { LedgerEvent } from "../ledger/events.ts";
import type { BuyerInput, BuyerMove, LlmPort } from "./port.ts";
import type { Market } from "../sellers/market.ts";
import { usdOf } from "../money.ts";

export interface TapeMove {
  inputHash: string;
  move: BuyerMove;
  /** Wall-clock ms the live call took; the seeded view waits this long again (Joshua: real pacing, not a staged delay). */
  dtMs: number;
}

export interface TapeMeta {
  /** The model id the live port reported, e.g. "claude-haiku-5-5". */
  model: string;
  /** How the screen names it, e.g. "Claude Haiku 5.5". */
  modelLabel: string;
  /** YYYY-MM-DD, shown on every recorded row. */
  recordedOn: string;
  /** sha256 of the buyer prompt the tape was recorded with; a changed prompt makes the tape stale. */
  promptSha256: string;
  seed: number;
  /** Which simulated week's sellers the run met (`DEMO_WEEKS`); the replay must meet the same ones. The three fixture tapes. */
  week?: number;
  /** The generated market the run met (library runs): kept whole, so a later change to the generator can't break the replay. */
  market?: Market;
  /** ISO time the live run finished; orders the library ("run N of M"). */
  recordedAt?: string;
  item: string;
  maxPrice: Cents;
  /** Live runs it took to get this clean one, and why each other was not kept: the tape is a kept run, and says so (shared Lesson 9). */
  tries: number;
  discarded: string[];
}

/** A live call that never gave a move (timed out or failed): the replay shows the same plain-rule move, saying it happened in the recording. */
export interface TapeFallback {
  inputHash: string;
  reason: "timeout" | "error";
  dtMs: number;
}

export interface Tape {
  v: 1;
  meta: TapeMeta;
  moves: TapeMove[];
  /** Library runs keep their fallbacks too, so a replay is the run as it happened (Joshua: "save every live haggle"). */
  fallbacks?: TapeFallback[];
  /** The live run's ledger without `t`: what a replay must reproduce. The fixture tapes carry it; library runs don't. */
  ledger?: Array<Omit<LedgerEvent, "t">>;
}

/** JSON with object keys sorted at every level, so the same input always hashes the same. */
export function stableStringify(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map((v) => (v === undefined ? "null" : stableStringify(v))).join(",")}]`;
  if (x !== null && typeof x === "object") {
    const o = x as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(x);
}

export function inputHash(input: BuyerInput, hash: Hasher): string {
  return hash(stableStringify(input));
}

/**
 * Wraps a live port; every move the engine used is also handed to `sink` with its input, so the recorder can check it.
 * A call the engine gave up on goes to `onFallback` (if given) the moment it aborts, as "timeout"; one that throws first is "error".
 * A move that lands after the abort is dropped: the engine had already moved by rule, so recording it would make the
 * replay look better than the live run (shared Lesson 9) and miss every later round.
 */
export function recordPort(inner: LlmPort, hash: Hasher, sink: (m: TapeMove & { input: BuyerInput }) => void, now: () => number = () => performance.now(), onFallback?: (f: TapeFallback) => void): LlmPort {
  return {
    name: inner.name,
    ...(inner.warm ? { warm: () => inner.warm!() } : {}),
    async decide(input, signal) {
      const t0 = now();
      const key = inputHash(input, hash);
      let done = false;
      const fellBack = (reason: TapeFallback["reason"]) => {
        if (done) return;
        done = true;
        onFallback?.({ inputHash: key, reason, dtMs: Math.round(now() - t0) });
      };
      const onAbort = () => fellBack("timeout");
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        const move = await inner.decide(input, signal);
        if (signal?.aborted) { fellBack("timeout"); return move; }
        done = true;
        sink({ input: structuredClone(input), inputHash: key, move: structuredClone(move), dtMs: Math.round(now() - t0) });
        return move;
      } catch (e) {
        fellBack(signal?.aborted ? "timeout" : "error");
        throw e;
      } finally {
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}

/** Thrown when the recording shows the live AI gave no move here; the engine labels it as the recording's, never as a call failing now. */
export class RecordedFallback extends Error {
  readonly reason: TapeFallback["reason"];
  constructor(reason: TapeFallback["reason"]) {
    super(`recorded fallback (${reason})`);
    this.name = "RecordedFallback";
    this.reason = reason;
  }
}

export class TapeMiss extends Error {
  constructor(round: number) {
    super(`recorded tape has no move for this input (round ${round}); re-record with pnpm record:tape`);
    this.name = "TapeMiss";
  }
}

export interface RecordedOptions {
  /** Wait each move's recorded `dtMs` before answering. Off in tests and the round gate. */
  pace?: boolean;
}

export class RecordedPort implements LlmPort {
  readonly name = "recorded";
  readonly rowData: Readonly<Record<string, string>>;
  private readonly moves: Map<string, TapeMove>;
  private readonly fallbacks: Map<string, TapeFallback>;
  private readonly hash: Hasher;
  private readonly pace: boolean;

  constructor(tape: Tape, hash: Hasher, opts: RecordedOptions = {}) {
    this.moves = new Map(tape.moves.map((m) => [m.inputHash, m]));
    this.fallbacks = new Map((tape.fallbacks ?? []).map((f) => [f.inputHash, f]));
    this.hash = hash;
    this.pace = opts.pace ?? false;
    this.rowData = { model: tape.meta.model, modelLabel: tape.meta.modelLabel, recordedOn: tape.meta.recordedOn };
  }

  async decide(input: BuyerInput, signal?: AbortSignal): Promise<BuyerMove> {
    const key = inputHash(input, this.hash);
    const hit = this.moves.get(key);
    const fell = hit ? undefined : this.fallbacks.get(key);
    if (fell) {
      // Waits the time the live call ran before it gave up, capped below the replay's own budget so this stays the recording's fallback.
      if (this.pace) await wait(Math.min(fell.dtMs, 1500), signal);
      throw new RecordedFallback(fell.reason);
    }
    if (!hit) throw new TapeMiss(input.round);
    if (this.pace) await wait(hit.dtMs, signal);
    return structuredClone(hit.move);
  }
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("aborted"));
    const timer = setTimeout(() => { signal?.removeEventListener("abort", stop); resolve(); }, ms);
    const stop = () => { clearTimeout(timer); reject(new Error("aborted")); };
    signal?.addEventListener("abort", stop, { once: true });
  });
}

/**
 * What the shopper must never read in a buyer's `why` (s3's checks, Lessons 8 and 17): a price from
 * this input written as bare cents ("4773"), or a seller id ("pondside"). Empty means clean.
 */
export function whyProblems(input: BuyerInput, move: BuyerMove): string[] {
  const v: string[] = [];
  const cents = new Set([input.want.maxPrice, ...input.offers.map((o) => o.price), ...("price" in move ? [move.price] : [])].map(String));
  for (const n of move.why.match(/(?<![$.\d])\d{4,}(?![.\d])/g) ?? []) if (cents.has(n)) v.push(`cents in why: "${n}"`);
  // Seller ids are no longer a problem here: the engine writes them as store names before the ledger sees them (M2 step 4.0b).
  // A sentence must describe the move it sits next to: a counter row that says "I'm accepting it" contradicts itself.
  if (move.type !== "accept" && /\b(I'm|I am|we're) (accepting|taking)\b|\baccepting (it|this|that|their|the|\$)|^\s*(accepting|taking)\b/i.test(move.why)) v.push(`a ${move.type} says it accepts`);
  // The price a counter's sentence names is the price it bids (week 1, 2026-10-23: bid $49.50, "I'm countering at $47.00").
  if (move.type === "counter") for (const m of move.why.matchAll(/\bcounter(?:ing|s)?(?: [A-Za-z']+){0,3} at \$(\d+(?:\.\d\d)?)/gi)) {
    if (Math.round(Number(m[1]) * 100) !== move.price) v.push(`says it counters at ${usdOf(m[1])}, it bids ${usdOf((move.price / 100).toFixed(2))}`);
  }
  // A count the sentence states must be the true one (shared Lesson 42): rounds left after this one is maxRounds − round.
  const left = input.maxRounds - input.round;
  for (const m of move.why.matchAll(/\b(\d+|one|two|three|four|five) (?:more )?rounds? (?:left|remain)/gi)) {
    const n = Number(m[1]) || ["one", "two", "three", "four", "five"].indexOf(m[1]!.toLowerCase()) + 1;
    if (n !== left) v.push(`says ${n} rounds left, it is ${left}`);
  }
  if (left > 0 && /\b(this is the|it's the|on the) (last|final) round\b/i.test(move.why)) v.push(`says last round, ${left} left`);
  return v;
}

// The run library (Joshua, 2026-10-23: "the demo should grow"): every live haggle is kept as a
// tape, and when the live AI is capped (or off) the screen replays one, labeled "recorded · run N
// of M". Haggles only: an entry is built field by field from the buyer's moves and the market,
// so nothing else a run touched (the judge box's typed notes above all) can ride along.
// Pure data here; the server owns the files.

import type { Cents } from "../money.ts";
import type { Market } from "../sellers/market.ts";
import { isBuyerMove, type BuyerMove } from "./port.ts";
import type { Tape, TapeFallback, TapeMove } from "./recorded.ts";

export interface LiveRun {
  model: string;
  modelLabel: string;
  promptSha256: string;
  seed: number;
  market: Market;
  item: string;
  maxPrice: Cents;
  /** ISO time the run finished. */
  at: string;
  moves: ReadonlyArray<TapeMove>;
  fallbacks: ReadonlyArray<TapeFallback>;
}

/** A malformed move is stored as this marker, never as itself: the replay is unusable the same way, and nothing it carried is kept. */
export const INVALID_MOVE = { invalid: true } as unknown as BuyerMove;

/** Only the four move fields the buyer's tool returns. */
function keepMove(m: BuyerMove): BuyerMove {
  if (!isBuyerMove(m)) return INVALID_MOVE;
  return m.type === "counter" || m.type === "accept" ? { type: m.type, sellerId: m.sellerId, price: m.price, why: m.why } : { type: m.type, why: m.why };
}

/** A live run as a library tape: whitelisted fields only. */
export function libraryTape(run: LiveRun): Tape {
  return {
    v: 1,
    meta: {
      model: run.model, modelLabel: run.modelLabel, recordedOn: run.at.slice(0, 10), recordedAt: run.at, promptSha256: run.promptSha256,
      seed: run.seed, market: structuredClone(run.market), item: run.item, maxPrice: run.maxPrice, tries: 1, discarded: [],
    },
    moves: run.moves.map((m) => ({ inputHash: m.inputHash, move: keepMove(m.move), dtMs: m.dtMs })),
    fallbacks: run.fallbacks.map((f) => ({ inputHash: f.inputHash, reason: f.reason, dtMs: f.dtMs })),
  };
}

/** At most this many library runs are kept (newest win; fixtures always stay): about 5 days at the cap, ~8 MB on disk, well under a second to load. */
export const LIBRARY_MAX = 5000;

const byAge = (a: Tape, b: Tape) => (a.meta.recordedAt ?? "").localeCompare(b.meta.recordedAt ?? "") || a.meta.seed - b.meta.seed;

/** The recorded runs a server can replay: the fixture weeks first, then library runs in the order they were recorded. */
export class RunLibrary {
  private readonly tapes: Tape[] = [];
  private readonly promptSha256: string;
  private readonly max: number;
  private turn = 0;

  /** Tapes recorded with another prompt are kept on disk but never played (the buyer they recorded no longer exists). Sorted once here, not per tape. */
  constructor(promptSha256: string, tapes: Iterable<Tape> = [], max = LIBRARY_MAX) {
    this.promptSha256 = promptSha256;
    this.max = max;
    for (const t of tapes) if (t.meta.promptSha256 === promptSha256) this.tapes.push(t);
    // Fixtures (no recordedAt) keep their seed order ahead of every library run.
    this.tapes.sort(byAge);
    this.evict();
  }

  /** A run just recorded is the newest, so it goes on the end; an older one (rare) is placed in order. */
  add(tape: Tape): void {
    if (tape.meta.promptSha256 !== this.promptSha256) return;
    const last = this.tapes.at(-1);
    this.tapes.push(tape);
    if (last && byAge(last, tape) > 0) this.tapes.sort(byAge);
    this.evict();
  }

  /** Drops the oldest library runs past the maximum; fixtures (no recordedAt) are never dropped. */
  private evict(): void {
    const fixtures = this.tapes.findIndex((t) => t.meta.recordedAt !== undefined);
    if (fixtures === -1) return;
    const over = this.tapes.length - fixtures - this.max;
    if (over > 0) this.tapes.splice(fixtures, over);
  }

  get size(): number {
    return this.tapes.length;
  }

  /** The recording of this market number, if there is one at this max. */
  bySeed(seed: number, maxPrice: Cents): { tape: Tape; n: number; m: number } | null {
    const i = this.tapes.findIndex((t) => t.meta.seed === seed && t.meta.maxPrice === maxPrice);
    return i === -1 ? null : { tape: this.tapes[i]!, n: i + 1, m: this.tapes.length };
  }

  /** The next recorded run in turn at this max, so two presses are two runs (project Lesson 18); null when none fits. */
  next(maxPrice: Cents): { tape: Tape; n: number; m: number } | null {
    const fits = this.tapes.map((t, i) => ({ t, i })).filter(({ t }) => t.meta.maxPrice === maxPrice);
    if (fits.length === 0) return null;
    const { t, i } = fits[this.turn++ % fits.length]!;
    return { tape: t, n: i + 1, m: this.tapes.length };
  }

  fits(maxPrice: Cents): boolean {
    return this.tapes.some((t) => t.meta.maxPrice === maxPrice);
  }
}

/** What every recorded buyer row and the banner say (Joshua: "recorded · run N of M"); a fixture kept after retries says so (shared Lesson 9). */
export function recordedLabel(r: { tape: Tape; n: number; m: number }): string {
  const kept = r.tape.meta.tries > 1 ? ` · kept 1 of ${r.tape.meta.tries} recordings` : "";
  return `recorded · run ${r.n} of ${r.m} · ${r.tape.meta.modelLabel} · ${r.tape.meta.recordedOn}${kept}`;
}

// Everything in core that would otherwise touch the outside world is injected
// here, so the same code runs in the browser (seeded mode), on the server (live)
// and in tests, and so a seeded run replays byte for byte.

export interface Clock {
  /** Simulated or real "now" in ms. */
  now(): number;
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
}

/** Hex digest of a string. Server: sha256 from node:crypto. Tests: the same, or a stub. */
export type Hasher = (input: string) => string;

export interface Deps {
  clock: Clock;
  rng: Rng;
  hash: Hasher;
}

/** mulberry32: tiny, seedable, good enough for seller personalities. Not for secrets. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** A clock that only moves when told to: the simulated week. */
export class SimClock implements Clock {
  private t: number;
  constructor(start: number) {
    this.t = start;
  }
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

export const DAY_MS = 24 * 60 * 60 * 1000;

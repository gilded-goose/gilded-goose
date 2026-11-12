// Daily caps for live AI: the judge box (011 §3: 10 tries per session token and 20 per IP
// per day, LIVE_AI_CAP requests per day across everyone) and the haggle (Joshua, 2026-10-23:
// 1,000 a day across everyone, with per-browser and per-IP limits "so no single person can
// drain it"). The token is a cookie a browser keeps; a client that drops it gets a new one,
// so the IP cap is what limits a script, and the global cap is what limits everyone (and the
// spend). Only the global count can be saved (`CapStore`), so a restart can't reset what
// bounds the money; the per-token and per-IP counts stay in memory, so no address is ever
// written down. The Anthropic Console spend cap (Joshua's) is the backstop.

/** Where a cap's counts survive a restart: one small record, read at boot and written on every take. */
export interface CapStore {
  load(): { day: string; counts: Record<string, number> } | null;
  save(day: string, counts: Record<string, number>): void;
}

/** Counts per key per UTC day. */
export class DailyCap {
  readonly limit: number;
  private readonly now: () => number;
  private readonly store?: CapStore;
  private day = "";
  private readonly counts = new Map<string, number>();

  constructor(limit: number, now: () => number, store?: CapStore) {
    // A NaN limit compares false against 0 and would never refuse: fail at boot instead.
    if (!Number.isInteger(limit) || limit < 0) throw new Error(`DailyCap: limit must be a whole number >= 0, got ${limit}`);
    this.limit = limit;
    this.now = now;
    if (store) {
      this.store = store;
      const saved = store.load();
      if (saved) { this.day = saved.day; for (const [k, v] of Object.entries(saved.counts)) if (Number.isInteger(v) && v > 0) this.counts.set(k, v); }
    }
  }

  left(key: string): number {
    this.roll();
    return Math.max(0, this.limit - (this.counts.get(key) ?? 0));
  }

  /** Count one if there is room. A key is stored only when a take succeeds. */
  take(key: string): boolean {
    if (this.left(key) === 0) return false;
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    this.store?.save(this.day, Object.fromEntries(this.counts));
    return true;
  }

  /** Hand back one take that turned out not to count (a reservation), on the same day; a key at zero is dropped. */
  give(key: string): void {
    this.roll();
    const n = this.counts.get(key) ?? 0;
    if (n === 0) return;
    if (n === 1) this.counts.delete(key); else this.counts.set(key, n - 1);
    this.store?.save(this.day, Object.fromEntries(this.counts));
  }

  private roll(): void {
    const day = new Date(this.now()).toISOString().slice(0, 10);
    if (day !== this.day) { this.day = day; this.counts.clear(); }
  }
}

/** At most `limit` takes in any `ms` window, across everyone: a rate, not a day's total, so it frees itself once a burst stops. */
export class WindowCap {
  readonly limit: number;
  readonly ms: number;
  private readonly now: () => number;
  private readonly times: number[] = [];

  constructor(limit: number, ms: number, now: () => number) {
    if (!Number.isInteger(limit) || limit < 0) throw new Error(`WindowCap: limit must be a whole number >= 0, got ${limit}`);
    this.limit = limit;
    this.ms = ms;
    this.now = now;
  }

  left(): number {
    const cut = this.now() - this.ms;
    while (this.times.length > 0 && this.times[0]! <= cut) this.times.shift();
    return Math.max(0, this.limit - this.times.length);
  }

  /** Count one now if there is room. */
  take(): boolean {
    if (this.left() === 0) return false;
    this.times.push(this.now());
    return true;
  }

  /** Hand back the latest take (a reservation that turned out not to count). */
  give(): void { this.times.pop(); }
}

/**
 * The per-IP cap's key for an address (H4): one IPv4 address, or an IPv6 address's /64, since one home or phone line is
 * given a whole /64 and can rotate through it for free. An IPv4-mapped IPv6 address counts as its IPv4 address, and a
 * port suffix is dropped (H4 review: a proxy entry may carry one). Anything that isn't an address shares one "unknown"
 * key, so junk can't mint fresh counts.
 */
export function ipKey(address: string): string {
  const t = address.trim().toLowerCase();
  const a = (/^\[([^\]]*)\](?::\d{1,5})?$/.exec(t)?.[1] ?? t.replace(/^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/, "$1")).replace(/%.*$/, "");
  const v4 = /^(?:(?:0{1,4}:){5}ffff:|::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(a);
  if (v4) { const o = v4[1]!.split(".").map(Number); return o.every((n) => n <= 255) ? o.join(".") : "unknown"; }
  if (!/^[0-9a-f:]+$/.test(a) || a.split("::").length > 2) return "unknown";
  const [head, tail] = a.split("::") as [string, string | undefined];
  const left = head === "" ? [] : head.split(":");
  const right = tail === undefined || tail === "" ? [] : tail.split(":");
  const fill = 8 - left.length - right.length; // "::" stands for at least one group of zeros
  if (tail !== undefined && fill < 1) return "unknown";
  const groups = tail === undefined ? left : [...left, ...Array<string>(fill).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((g) => g === "" || g.length > 4)) return "unknown";
  // The hex form of an IPv4-mapped address (::ffff:cb00:7107) is that IPv4 address too.
  if (groups.slice(0, 5).every((g) => parseInt(g, 16) === 0) && parseInt(groups[5]!, 16) === 0xffff) {
    const [hi, lo] = [parseInt(groups[6]!, 16), parseInt(groups[7]!, 16)];
    return [hi >> 8, hi & 255, lo >> 8, lo & 255].join(".");
  }
  return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":")}::/64`;
}

/**
 * The per-IP key behind `hops` proxies that each append to X-Forwarded-For (H4 live check): the entry `hops` from the
 * right is the one the first trusted proxy wrote, so anything a client typed into the header sits to its left and
 * can't move it. Fewer entries than hops means the header didn't come through the proxies: "unknown", never a guess.
 */
export function forwardedKey(xff: string, hops: number): string {
  const entries = xff.split(",").map((e) => e.trim());
  return hops >= 1 && entries.length >= hops ? ipKey(entries[entries.length - hops]!) : "unknown";
}

/**
 * `forwardedKey`, saying once per reason why it fell to the one shared "unknown" key (W81): a chain shorter than `hops`
 * (the header skipped a proxy, or PROXY_HOPS is set too high) or an entry that isn't an address. Either way every such
 * caller shares one per-IP cap, so the log says it the first time; shape and counts only, never an address.
 */
export function forwardedKeyWarnOnce(hops: number, warn: (message: string) => void): (xff: string) => string {
  const said = new Set<"short" | "shape">();
  return (xff) => {
    const key = forwardedKey(xff, hops);
    if (key !== "unknown") return key;
    const n = xff.trim() === "" ? 0 : xff.split(",").length;
    const why = n < hops ? "short" : "shape";
    if (!said.has(why)) {
      said.add(why);
      warn(why === "short"
        ? `clientIp: X-Forwarded-For had ${n} ${n === 1 ? "entry" : "entries"}, fewer than PROXY_HOPS ${hops}; per-IP caps share one key until the chain is whole`
        : `clientIp: X-Forwarded-For of shape ${JSON.stringify(xff.slice(0, 96).replace(/[0-9a-f]/gi, "x"))} has no address ${hops} from the right; per-IP caps share one key`);
    }
    return key;
  };
}

/** Which cap stopped a live request, so the screen can say why it is replaying instead. */
export type CapHit = "token" | "ip" | "global";

/** One live-AI surface's three caps: the per-token and per-IP caps are checked first, then the global one, so junk keys can't fill memory. */
export class LiveCaps {
  readonly perToken: DailyCap;
  readonly perIp: DailyCap;
  readonly global: DailyCap;

  /** `global` may be another surface's DailyCap (A1: Ask Goose counts against the judge box's LIVE_AI_CAP), so both draw on one day's count. */
  constructor(limits: { perToken: number; perIp: number; global: number | DailyCap }, now: () => number, globalStore?: CapStore) {
    this.perToken = new DailyCap(limits.perToken, now);
    this.perIp = new DailyCap(limits.perIp, now);
    this.global = limits.global instanceof DailyCap ? limits.global : new DailyCap(limits.global, now, globalStore);
  }

  /** Count one live request, or say which cap is full (nothing is counted then). */
  takeOrWhy(token: string, ip: string): CapHit | null {
    if (this.perToken.left(token) === 0) return "token";
    if (this.perIp.left(ip) === 0) return "ip";
    if (!this.global.take("all")) return "global";
    this.perIp.take(ip);
    this.perToken.take(token);
    return null;
  }

  triesLeft(token: string, ip: string): number {
    return Math.min(this.perToken.left(token), this.perIp.left(ip), this.global.left("all"));
  }

  /** True when this token and IP may make one live AI request now; it is then counted against all three caps. */
  take(token: string, ip: string): boolean {
    if (this.perToken.left(token) === 0 || this.perIp.left(ip) === 0) return false;
    if (!this.global.take("all")) return false;
    return this.perIp.take(ip) && this.perToken.take(token);
  }
}

/**
 * At most one call per key every `ms` (Joshua, Wed Oct 28: one PayPal re-check per cart every 10 seconds). `take`
 * reserves the window before the call is awaited, so two requests at once still make one call; inside the window it
 * gives the last answer and the wait left. Keys past their window are dropped once there are more than `max`.
 */
export class Cooldown<T> {
  readonly ms: number;
  private readonly now: () => number;
  private readonly max: number;
  private readonly last = new Map<string, { at: number; answer: T }>();

  constructor(ms: number, now: () => number, max = 5000) {
    if (!Number.isInteger(ms) || ms < 0) throw new Error(`Cooldown: ms must be a whole number >= 0, got ${ms}`);
    this.ms = ms;
    this.now = now;
    this.max = max;
  }

  /** Null when a call may go now (the window starts, holding `pending` until `answer`), else the last answer and the ms left. */
  take(key: string, pending: T): { answer: T; waitMs: number } | null {
    const t = this.now();
    const had = this.last.get(key);
    if (had && t - had.at < this.ms) return { answer: had.answer, waitMs: had.at + this.ms - t };
    this.last.delete(key);
    this.last.set(key, { at: t, answer: pending });
    if (this.last.size > this.max) for (const [k, v] of this.last) { if (t - v.at < this.ms) break; this.last.delete(k); }
    return null;
  }

  /** The call's answer, kept for the rest of its window. */
  answer(key: string, answer: T): void {
    const had = this.last.get(key);
    if (had) had.answer = answer;
  }
}

/** The judge box's caps (the name the judge code and its tests use). */
export const JudgeCaps = LiveCaps;
export type JudgeCaps = LiveCaps;

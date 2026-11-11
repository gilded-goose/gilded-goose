// The seeded demo scenario: one want, three fictional sellers. Live mode swaps
// the fixture for a masked Channel3 snapshot (S2); the sellers stay scripted.

import { DAY_MS, SimClock, seededRng, type Deps, type Hasher } from "./deps.ts";
import { toCents, type Cents, usdOf } from "./money.ts";
import { DEMO_CATEGORY, DEMO_CLOTHING, DEMO_EVENTS, DEMO_LIMITS, DEMO_OTHER, DEMO_TRAVEL } from "./demo-limits.ts";
export { DEMO_CATEGORY, DEMO_CLOTHING, DEMO_EVENTS, DEMO_LIMITS, DEMO_OTHER, DEMO_TRAVEL };
import { ATTACK_SELLER, generateMarket, marketSellers, type Market } from "./sellers/market.ts";
import { RunLedger, ShopperLedger, type LedgerEvent, type LedgerStore } from "./ledger/events.ts";
import type { Seller } from "./sellers/types.ts";
import type { Catalog } from "./trust/catalog.ts";
import { Guard, listTotalRow } from "./trust/guard.ts";
import { askFirst, categoryLimitFor, grantDial, setCategoryLimit, turnBack, type Policy, type Want } from "./trust/policy.ts";
import { dialPreview, settleDial } from "./view/lanes.ts";
import { validateChips, type Chip, type ChipCheck } from "./trust/chips.ts";
import { checkWant, type SavedWant, type WantCheck } from "./ask/wants.ts";
import { REAL_WATCHES_MAX, checkRealWatch, sameWatch, type RealCheck, type RealWatch } from "./ask/real-watch.ts";
import { MEMORY_EMPTY, forget as forgetFact, readMemory, remember as rememberColor, type Confirmed, type MemoryState } from "./ask/memory.ts";
import { MOVING_ITEMS } from "./sellers/moving.ts";
import { JACKETS, JACKET_OPTIONS } from "./sellers/clothing.ts";

export const DEMO_SHOPPER = "demo-shopper";
export const DEMO_ITEM = "Goldfeather Kettle (fictional)";
/**
 * The demo limits no Settings tap changes (`limitRows`' `locked`): the recorded weeks run under the kitchen's and the
 * ticket's beat under the events'. Travel and clothing start at the demo's number and her tap may change them (a
 * shopper-set limit wins over a demo one); "other" names no catalog category, so it has no Settings row at all.
 */
export const DEMO_LOCKED: readonly string[] = Object.freeze([DEMO_CATEGORY, DEMO_EVENTS]);
/** The catalog entry every demo run shops for (ADR 0012, N9): every cart names it, so the guard reads its category from the catalog. */
export const DEMO_ENTRY = "kettle";
/** Simulated week starts at a fixed instant so replays line up. */
export const DEMO_T0 = 1_760_000_000_000;

/** One thing to shop for and who sells it (ADR 0012). Picked, never typed: free text dead-ends on "no seller sells that". */
export interface CatalogEntry {
  id: string;
  want: Want;
  sellers: Seller[];
  /** Words a chip may narrow this entry by (F4): colour for the kettle. Not in the want or the cart, so no tape or hash reads them. */
  attributes?: Readonly<Record<string, readonly string[]>>;
}

/**
 * Each simulated week the two sellers with a record ask different list prices, so the recorded runs tell different
 * stories (Joshua, 2026-10-23: "so pressing Go twice doesn't feel staged"). Week 1 is the original kettle week, so its
 * fixtures stay byte-stable; QuickQuack's scam offer is the same every week, so the attack is always on screen.
 */
export const DEMO_WEEKS = {
  /** Both list at $58; Reedbank meets the buyer halfway and wins. */
  1: { pondside: "58.00", reedbank: "58.00" },
  /** Pondside is cheap this week and Reedbank dear, so Pondside's small discounts win. */
  2: { pondside: "54.00", reedbank: "72.00" },
  /** Nobody with a record can get under a $60 max; the only offer under it is the scam. */
  3: { pondside: "75.00", reedbank: "82.00" },
} as const;
export type DemoWeek = keyof typeof DEMO_WEEKS;
export const isDemoWeek = (w: unknown): w is DemoWeek => typeof w === "number" && w in DEMO_WEEKS;

/** A simulated week's market as data: the three recorded weeks are the run library's first runs, and their market number is the week. */
export function weekMarket(week: DemoWeek): Market {
  const lists = DEMO_WEEKS[week];
  return {
    seed: week,
    sellers: [
      { id: "pondside", merchant: "Pondside Goods (fictional)", style: "stingy", list: toCents(lists.pondside), history: 412 },
      { id: "reedbank", merchant: "Reedbank Outfitters (fictional)", style: "flexible", list: toCents(lists.reedbank), history: 87 },
      { ...ATTACK_SELLER, style: "scammer", list: toCents("58.00"), history: 0 },
    ],
  };
}

/** The market a number names: 1–3 are the recorded simulated weeks; any other number is a fresh generated market. */
export function marketFor(seed: number): Market {
  return isDemoWeek(seed) ? weekMarket(seed) : generateMarket(seed);
}

/** A first limit Settings offers per moving item, in cents, under the demo's $100.00 per-purchase cap. Decided by default. */
const MOVING_SUGGESTED: Readonly<Record<string, Cents>> = { "marsh-lights-ticket": 9000, "mossbell-night": 9500, "gullwing-seat": 10_000 };

/** The first clothing limit Settings offers, in cents. Decided by default. */
const JACKET_SUGGESTED: Cents = 8000;

/** The demo catalog, built fresh per call (sellers keep state during a haggle). Entry 0 is the kettle, so its fixtures and tapes stay byte-stable. */
export function demoCatalog(week: DemoWeek = 1): CatalogEntry[] {
  return [
    {
      id: DEMO_ENTRY,
      want: { item: DEMO_ITEM, category: DEMO_CATEGORY, maxPrice: toCents("60.00"), currency: "USD", deadline: DEMO_T0 + 7 * DAY_MS, qty: 1 },
      sellers: marketSellers(weekMarket(week), DEMO_ITEM),
      // A1: the colours this fictional kettle comes in, so "black" (the seeded week's colour) passes F4 honestly. Only the
      // chip vocabulary reads them; no seller's offer carries a colour yet (QUEUE M3 slot 7), so a colour chip narrows
      // what Goose was asked for, not what the guard checks.
      attributes: { color: ["black", "white", "silver"] },
    },
    // §15B, reachable: the moving items (a ticket, a hotel night, a flight seat), so the shopper can save them as wants
    // and the price watch reads their recorded curves (core/src/sellers/moving.ts). A run for one shops its posted sellers
    // on the card's day (sellers/posted.ts, §15B part 2), so the entry has no haggle sellers. `maxPrice` is what Settings suggests as a
    // first limit for the category, never a limit by itself.
    ...MOVING_ITEMS.map((m) => ({ id: m.id, want: { item: m.item, category: m.category, maxPrice: MOVING_SUGGESTED[m.id]!, currency: "USD" as const, deadline: DEMO_T0 + 7 * DAY_MS, qty: 1 }, sellers: [] })),
    // The second category (§1 piece 3, §19 layer 5): two look-alike jackets with colors and sizes (sellers/clothing.ts).
    // No run shops them yet (ask/shops.ts says so before any run); the watch and the ladder read their listings.
    ...JACKETS.map((m) => ({ id: m.id, want: { item: m.item, category: m.category, maxPrice: JACKET_SUGGESTED, currency: "USD" as const, deadline: DEMO_T0 + 7 * DAY_MS, qty: 1 }, sellers: [], attributes: JACKET_OPTIONS })),
  ];
}

/** The catalog the guard reads (N9): entry id → item and category, built from the entries above, never from a shopper's want. */
export function demoCatalogItems(): Catalog {
  return new Map(demoCatalog().map((e) => [e.id, { item: e.want.item, category: e.want.category, ...(e.attributes ? { attributes: e.attributes } : {}) }]));
}

export function demoWant(overrides: Partial<Want> = {}): Want {
  return { ...demoCatalog()[0]!.want, ...overrides };
}

export function demoPolicy(overrides: Partial<Policy> = {}): Policy {
  // The kitchen limit is the "$60.00 locked" the shopper sees; the weekly limit holds a fourth $59 buy (N4). The events
  // limit is the ticket's (Joshua, Fri Oct 30): $90.00, set for this demo like the kitchen's, so the hero's recorded
  // $84.00 drop is a deal under the demo's own defaults. Travel, clothing and a made-up market's "other" have demo limits
  // too (`DEMO_LIMITS`, Desk-L); a category with none is still held to the strictest, $60.00. The per-purchase cap is
  // $150.00 so "other"'s $150.00 is reachable; every category limit sits at or under it.
  return { shopperId: DEMO_SHOPPER, perPurchaseCap: toCents("150.00"), categoryLimit: { ...DEMO_LIMITS }, weeklyLimit: toCents("200.00"), dial: {}, recordSince: {}, oneOffOnly: true, ...overrides };
}

export function demoSellers(week: DemoWeek = 1): Seller[] {
  return demoCatalog(week)[0]!.sellers;
}

/**
 * The one guard the demo ships (W6): the server, the e2e, the tape recorder and the replay test all build it here, so
 * none of them proves a guard the others don't run. Its carts name DEMO_ENTRY (`runHaggle`'s `catalogId`).
 */
export function demoGuard(deps: Deps, ledger: LedgerStore, policy: Policy = demoPolicy()): Guard {
  // The dial as it stands (`settleDial`): a bad pick after the tap that turned it on turns it back before this guard reads it.
  return new Guard(deps, ledger, settleDial(policy, (ledger instanceof RunLedger ? ledger.shopper : ledger).read()), demoCatalogItems());
}

/**
 * The seeded week (Joshua's agreed (a), 018 known 4): the labeled starting state of every shopper's ledger, one
 * completed purchase with a color. Its day comes from the session's clock (`at`), never a typed date (N6). It shows on
 * the week, labeled "seeded", and never counts toward the weekly limit or the dial (N19).
 */
export const SEEDED_PURCHASE = { catalogId: DEMO_ENTRY, color: "black", price: "54.00", sellerId: "pondside", merchant: "Pondside Goods (fictional)", daysBefore: 4 } as const;

/** Write the seeded week into a shopper's ledger, through a view labeled "seeded". */
export function seedWeek(shopper: ShopperLedger, at: number): void {
  const p = SEEDED_PURCHASE;
  shopper.run("seeded", "seeded").append({
    t: at - p.daysBefore * DAY_MS, shopperId: DEMO_SHOPPER, visibility: "owner", actor: "paypal", action: "captured", layer: 3, verdict: "ok",
    price: p.price, currency: "USD", sellerId: p.sellerId, why: `Seeded week (simulated, no money moved): the ${p.color} ${DEMO_ITEM} for ${usdOf(p.price)} from ${p.merchant}.`,
    data: { catalogId: p.catalogId, color: p.color },
  });
}

/** The rows a browser with no session yet starts from (its seeded week), so a read that makes no session shows what its first Ask will use. */
export function seededRows(at: number): readonly LedgerEvent[] {
  const shopper = new ShopperLedger();
  seedWeek(shopper, at);
  return shopper.read();
}

/** How long a browser's demo session lasts with no use: a week, so the rolling 7-day total sees the whole week (020 W18). */
export const SESSION_IDLE_MS = 7 * DAY_MS;
/** Sessions kept at once; past it the least recently used goes first (020 W19). The server may set fewer. */
export const SESSIONS_MAX = 1000;
/** Rows kept across every session at once; past it the least recently used session goes first, whatever the count. */
export const SESSION_ROWS_MAX = 200_000;
/** How long a changed session waits before it is written to the store, so a run's burst of rows is one write. */
export const SAVE_WAIT_MS = 500;

/**
 * One browser's demo state (N10): its shopper ledger (the week, the receipt and the dial are folded from it), the Policy
 * that holds its limits, its chips, and its wants list (`SavedWant`, wants.ts: an entry id, a priority, cents). Fixed values only, never words: the limit is whole cents set through
 * `setCategoryLimit`, and a chip is a value from the catalog's vocabulary (`validateChips`), so nothing a visitor types is
 * kept. Read-only from outside: only `DemoShoppers` writes it.
 */
export interface DemoSession {
  readonly shopper: ShopperLedger;
  readonly policy: Policy;
  readonly chips: readonly Chip[];
  readonly wants: readonly SavedWant[];
  /** Settings' "Show me tradeoffs" (§17): on unless this shopper turned it off. */
  readonly tradeoffs: boolean;
  /** A2 memory: the colors she confirmed on carts she paid for, and whether she forgot the seeded week's (ask/memory.ts). */
  readonly memory: MemoryState;
  /** Your price on real products (Joshua, Nov 5, 3b): Channel3's id, her store, her price and the last read. Never her search words. */
  readonly real: readonly RealWatch[];
}

/** `stored`: a copy of this session is in the store (it was read from it, or written), so a change that empties it is written too. */
interface Held { shopper: ShopperLedger; policy: Policy; chips: readonly Chip[]; wants: readonly SavedWant[]; tradeoffs: boolean; memory: MemoryState; real: readonly RealWatch[]; seen: number; stored: boolean }

/**
 * What a session keeps across a restart (N13/H1/W18): its rows, Policy, chips and wants, and when it was last changed.
 * `wants` is absent from records written before the wants list (read as none); `tradeoffs` absent reads as on (§17);
 * `memory` absent reads as nothing confirmed (A2); `real` absent reads as no real watches.
 */
export interface SavedSession { rows: LedgerEvent[]; policy: Policy; chips: Chip[]; wants?: SavedWant[]; tradeoffs?: boolean; memory?: MemoryState; real?: RealWatch[]; seen: number }
/** Where sessions outlive the process (the server's Turso store), by session token; the store decides how it keys it. */
export interface SessionStore {
  load(token: string): SavedSession | undefined;
  save(token: string, saved: SavedSession): void;
}

/** One shopper's fresh ledger with the seeded week: what a browser's own demo needs, without the server's sessions below, so
 *  no page carries them (Track F's kind: a class's methods can't be shaken off, so one call brought them all). */
export function demoShopper(at: number): ShopperLedger {
  return fresh(at).shopper;
}

/**
 * One demo session per session token (N10, N19): made on first use with the seeded week, never shared between tokens,
 * so one browser's week, dial, limit and chips never reach another's. In memory, bounded (020 W19, H2): a session unused
 * for `idleMs` is dropped, and past `max` sessions or `maxRows` rows the least recently used goes first. A client that
 * drops its cookie gets a new session each time, so these bounds, not the cookie, are what keep memory flat.
 */
export class DemoShoppers {
  private readonly held = new Map<string, Held>();
  private readonly max: number;
  private readonly idleMs: number;
  private readonly maxRows: number;
  private readonly store: SessionStore | undefined;
  private readonly due = new Map<string, Held>();

  constructor(o: { max?: number; idleMs?: number; maxRows?: number; store?: SessionStore } = {}) {
    this.store = o.store;
    this.max = o.max ?? SESSIONS_MAX;
    this.idleMs = o.idleMs ?? SESSION_IDLE_MS;
    this.maxRows = o.maxRows ?? SESSION_ROWS_MAX;
    for (const [k, v] of Object.entries({ max: this.max, idleMs: this.idleMs, maxRows: this.maxRows })) {
      if (!Number.isSafeInteger(v) || v < 1) throw new Error(`DemoShoppers: ${k} must be a whole number >= 1, got ${v}`);
    }
  }

  /** This token's session, made with the seeded week on first use; `at` (the caller's clock) also marks it as used. */
  session(token: string, at: number): DemoSession {
    let h = this.held.get(token);
    if (h && at - h.seen > this.idleMs) { this.held.delete(token); h = undefined; }
    if (h) this.held.delete(token); // re-inserted below, so the Map's order is least recently used first
    if (!h) {
      // Dropped from memory before its write (evicted within SAVE_WAIT_MS): the same session, never the store's older copy,
      // which lacks its newest rows. Else kept across a restart (N13/H1/W18) unless idle past the window memory keeps it.
      const waiting = this.due.get(token);
      if (waiting && at - waiting.seen <= this.idleMs) h = waiting;
      else {
        const saved = this.store?.load(token);
        h = (saved && at - saved.seen <= this.idleMs ? restore(saved) : undefined) ?? fresh(at);
        const held = h;
        held.shopper.on(() => this.save(token, held));
      }
    }
    h.seen = at;
    this.held.set(token, h);
    this.evict(token, at);
    return h;
  }

  /** This token's shopper ledger (the session's); `at` places the seeded week when the session is first made. */
  for(token: string, at: number): ShopperLedger {
    return this.session(token, at).shopper;
  }

  /** Chips from words, checked against the catalog: only an accepted list is kept; a refused one leaves the old chips. */
  setChips(token: string, raw: unknown, at: number): ChipCheck {
    const check = validateChips(raw, demoCatalogItems());
    if (check.kind === "accepted") { const h = this.hold(token, at); h.chips = Object.freeze([...check.chips]); this.save(token, h); }
    return check;
  }

  /** Undo (`turnBack`): the category of a purchase this token took back asks first again, its record restarting at `at`. */
  turnBack(token: string, category: string, at: number): Policy {
    if (![...demoCatalogItems().values()].some((e) => e.category === category)) throw new Error("not a catalog category");
    const h = this.hold(token, at);
    h.policy = turnBack(h.policy, category, at);
    this.save(token, h);
    return h.policy;
  }

  /**
   * Settings' dial for one catalog category, for this token only: on only at the strong record this session's own rows
   * show (`dialPreview`, `grantDial` throws under it and nothing changes), off in one tap with the record kept (`askFirst`).
   */
  setDial(token: string, category: string, on: boolean, at: number): Policy {
    if (![...demoCatalogItems().values()].some((e) => e.category === category)) throw new Error("not a catalog category");
    const h = this.hold(token, at);
    const rows = h.shopper.read();
    h.policy = on ? grantDial(h.policy, category, dialPreview(rows, h.policy, category, demoCatalogItems()).clean, at) : askFirst(settleDial(h.policy, rows), category);
    this.save(token, h);
    return h.policy;
  }

  /** Settings' limit for one catalog category, in whole cents (never words or a float), for this token only. */
  setLimit(token: string, category: string, limit: Cents, at: number): Policy {
    if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error("a limit is a whole number of cents above zero");
    if (![...demoCatalogItems().values()].some((e) => e.category === category)) throw new Error("not a catalog category");
    const h = this.hold(token, at);
    h.policy = setCategoryLimit(h.policy, category, limit, at);
    // A lowered limit brings every want above it down to it (wants.ts: a max is never over the limit), and a raise lifts
    // none: Goose never raises a max.
    h.wants = Object.freeze(h.wants.map((w) => underLimit(w, h.policy) as SavedWant));
    this.save(token, h);
    return h.policy;
  }

  /**
   * Save one want for this token (the wallet's tap, or an Ask's save intent): checked against the catalog and this
   * session's Policy (`checkWant`), so its max is never over the category's limit. One want per catalog entry: saving
   * the same entry again changes it in place, keeping its color unless a new one is sent and its place in the list (its
   * first save's time). A refused want changes nothing and makes no session (W49g: a flood of bad bodies can't push
   * real browsers' sessions out).
   */
  setWant(token: string, raw: unknown, at: number): WantCheck {
    const pre = checkWant(raw, demoCatalogItems(), this.peek(token, at)?.policy ?? demoPolicy(), at);
    if (!pre.ok) return pre;
    const h = this.hold(token, at);
    const check = checkWant(raw, demoCatalogItems(), h.policy, at);
    if (!check.ok) return check;
    const had = h.wants.find((w) => w.catalogId === check.want.catalogId);
    // A change keeps what it didn't send; a two-value priority tap sends no rank, so a rank it now contradicts goes.
    const kept = { ...(had?.neededBy === undefined ? {} : { neededBy: had.neededBy }), ...(had?.forWho === undefined ? {} : { forWho: had.forWho }), ...(had?.rank === undefined || had.priority !== check.want.priority ? {} : { rank: had.rank }) };
    const want = { ...kept, ...check.want, ...(had?.color !== undefined && check.want.color === undefined ? { color: had.color } : {}), at: had?.at ?? at };
    h.wants = Object.freeze([...h.wants.filter((w) => w !== had), want]);
    this.save(token, h);
    return { ok: true, want };
  }

  /**
   * The list's total for this token, by the shopper's tap only: whole cents above zero, or null to take it off. A row in
   * the shopper's ledger, so the guard meets it at decide and again at capture (trust `listTotal`), and the ledger shows it.
   */
  setListTotal(token: string, total: Cents | null, at: number): void {
    if (total !== null && (!Number.isSafeInteger(total) || total <= 0)) throw new Error("a total is a whole number of cents above zero");
    const h = this.hold(token, at);
    h.shopper.run(`list-${h.shopper.size}`, "ask").append(listTotalRow(at, h.policy.shopperId, total));
    this.save(token, h);
  }

  /**
   * A2 memory for this token: `remember` keeps a color she confirmed on a cart she paid for (memory.ts `confirmColor`);
   * `forget` drops one fact by its key, or every one ("all", back to the seeded week). Neither changes a limit, a want or a buy.
   */
  remember(token: string, c: Confirmed, at: number): MemoryState {
    const ok = readMemory({ confirmed: [c] }, demoCatalogItems()).confirmed[0];
    if (!ok) throw new Error("a confirmed color is a cart's hash and a catalog color word");
    const h = this.hold(token, at);
    h.memory = rememberColor(h.memory, ok);
    this.save(token, h);
    return h.memory;
  }

  forget(token: string, key: string, at: number): MemoryState {
    const h = this.hold(token, at);
    h.memory = forgetFact(h.memory, key);
    this.save(token, h);
    return h.memory;
  }

  /** Settings' "Show me tradeoffs" for this token (§17): a boolean only, and it never changes a limit, a want or a buy. */
  setTradeoffs(token: string, on: boolean, at: number): boolean {
    if (typeof on !== "boolean") throw new Error("tradeoffs is on or off");
    const h = this.hold(token, at);
    h.tradeoffs = on;
    this.save(token, h);
    return h.tradeoffs;
  }

  /** Remove this token's want for one catalog entry (one tap). False when there was none; with no session, none is made. */
  /**
   * Watch a real product's price at one store, by her tap (Joshua, Nov 5, 3b): checked field by field, at most
   * REAL_WATCHES_MAX per browser. The same product at the same store changes her price in place and keeps its last read,
   * so a new price never buys an early read. A refused one changes nothing and makes no session.
   */
  watchReal(token: string, raw: unknown, at: number): RealCheck {
    const check = checkRealWatch(raw, at);
    if (!check.ok) return check;
    const had = this.peek(token, at)?.real.find((w) => sameWatch(w, check.watch));
    if (!had && (this.peek(token, at)?.real.length ?? 0) >= REAL_WATCHES_MAX) return { ok: false, error: `You're watching ${REAL_WATCHES_MAX} real prices, the most for one browser. Stop one to watch another.` };
    const h = this.hold(token, at);
    const { last: _sent, ...mine } = check.watch;
    const watch: RealWatch = had ? { ...mine, at: had.at, ...(had.last ? { last: had.last } : {}) } : mine;
    h.real = Object.freeze([...h.real.filter((w) => !sameWatch(w, watch)), watch]);
    this.save(token, h);
    return { ok: true, watch };
  }

  /** Stop watching one real price. False when it wasn't watched (then nothing is made). */
  stopReal(token: string, productId: string, domain: string, at: number): boolean {
    if (!this.peek(token, at)?.real.some((w) => sameWatch(w, { productId, domain }))) return false;
    const h = this.hold(token, at);
    h.real = Object.freeze(h.real.filter((w) => !sameWatch(w, { productId, domain })));
    this.save(token, h);
    return true;
  }

  /** Keep a read the server made: only its `last`, only on a watch still there, only when it is newer. */
  keepRead(token: string, read: Pick<RealWatch, "productId" | "domain" | "last">, at: number): void {
    const s = this.peek(token, at);
    const had = s?.real.find((w) => sameWatch(w, read));
    if (!had || !read.last || (had.last && had.last.checkedAt >= read.last.checkedAt)) return;
    const h = this.hold(token, at);
    h.real = Object.freeze(h.real.map((w) => (sameWatch(w, read) ? { ...w, last: read.last! } : w)));
    this.save(token, h);
  }

  removeWant(token: string, catalogId: string, at: number): boolean {
    if (!this.peek(token, at)?.wants.some((w) => w.catalogId === catalogId)) return false;
    const h = this.hold(token, at);
    const left = h.wants.filter((w) => w.catalogId !== catalogId);
    if (left.length === h.wants.length) return false;
    h.wants = Object.freeze(left);
    this.save(token, h);
    return true;
  }

  /**
   * This token's session when one exists (in memory, waiting to be written, or in the store), else undefined: a read
   * that never makes a session, so a cookieless GET can't push real browsers' sessions out of memory (W49g).
   */
  peek(token: string, at: number): DemoSession | undefined {
    return this.alive(token, at) ? this.session(token, at) : undefined;
  }

  /** Whether `peek` would find this session, read only: nothing is loaded, renewed or moved. */
  alive(token: string, at: number): boolean {
    if (this.inMemory(token, at)) return true;
    const s = this.store?.load(token);
    return s !== undefined && at - s.seen <= this.idleMs;
  }

  /**
   * Whether this session is in memory now (held, or waiting SAVE_WAIT_MS to be written) and not idle: never reads the
   * store. The push store's room check: at most `max` sessions are held, and the waiting ones are written and cleared
   * every SAVE_WAIT_MS, so this set stays near SESSIONS_MAX however many sessions the store keeps (security review, third
   * finding: `alive` also counts stored sessions, which SESSIONS_MAX doesn't bound, and reads the store once per call).
   */
  inMemory(token: string, at: number): boolean {
    const h = this.held.get(token) ?? this.due.get(token);
    return h !== undefined && at - h.seen <= this.idleMs;
  }

  get size(): number {
    return this.held.size;
  }

  /**
   * Into the store once the session has a row of its own (a run) or a want: a seeded-only session is made again the same
   * on its next use, and the run, ask and want caps bound how many are written, so a script dropping its cookie can't fill
   * the store. One already in the store is written on every change, so removing its last want is kept too. A run's
   * rows arrive in a burst, so the session is written once SAVE_WAIT_MS after its first change, not once per row.
   */
  private save(token: string, h: Held): void {
    if (!this.store) return;
    if (this.due.size === 0) {
      const t = setTimeout(() => this.flush(), SAVE_WAIT_MS) as { unref?: () => void };
      t.unref?.();
    }
    this.due.set(token, h);
  }

  /** Writes every session changed since the last write now (the server calls it before it exits). */
  flush(): void {
    for (const [token, h] of this.due) {
      const rows = h.shopper.read();
      if (h.stored || h.wants.length > 0 || !h.tradeoffs || h.memory.seededOff || h.real.length > 0 || rows.some((e) => e.source !== "seeded")) {
        this.store!.save(token, { rows, policy: h.policy, chips: [...h.chips], wants: [...h.wants], real: [...h.real], tradeoffs: h.tradeoffs, memory: { confirmed: [...h.memory.confirmed], seededOff: h.memory.seededOff }, seen: h.seen });
        h.stored = true;
      }
    }
    this.due.clear();
  }

  private hold(token: string, at: number): Held {
    this.session(token, at);
    return this.held.get(token)!;
  }

  /** Expired sessions first, then the least recently used while over a bound; the session just used is never the one dropped. */
  private evict(keep: string, at: number): void {
    for (const [k, h] of this.held) {
      if (k !== keep && at - h.seen > this.idleMs) this.held.delete(k);
    }
    let rows = 0;
    for (const h of this.held.values()) rows += h.shopper.size;
    for (const [k, h] of this.held) {
      if (this.held.size <= this.max && rows <= this.maxRows) break;
      if (k === keep) continue;
      rows -= h.shopper.size;
      this.held.delete(k);
    }
  }
}

/** A want (or a stored record of one) with its max brought down to its category's limit; anything else as it was. */
function underLimit(raw: unknown, policy: Policy): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const w = raw as Partial<SavedWant>;
  const entry = typeof w.catalogId === "string" ? demoCatalogItems().get(w.catalogId) : undefined;
  if (!entry || typeof w.max !== "number") return raw;
  return { ...w, max: Math.min(w.max, categoryLimitFor(policy, entry.category)) };
}

function fresh(at: number): Held {
  const shopper = new ShopperLedger();
  seedWeek(shopper, at);
  return { shopper, policy: demoPolicy(), chips: [], wants: [], tradeoffs: true, memory: MEMORY_EMPTY, real: [], seen: at, stored: false };
}

/**
 * A saved session's rows written again in order (each already stamped with its run, source and day), so seqs match; or
 * undefined (the session starts fresh) for a record that doesn't read, so one bad record never breaks a browser's week.
 * The policy is the demo's, holding only what Settings can write (a category limit, and when it was raised): a stored
 * record can never turn the dial on or carry a field Settings never sets. Each want is checked again against the catalog
 * and the restored Policy (`checkWant`, its saved time kept), so a stored record can't hold a want the catalog lacks or a
 * max over the limit; one that fails is dropped alone, never the week.
 */
/** Real watches from a stored record, each checked again; a bad one is dropped alone, and never more than the cap. */
function readReal(raw: unknown, seen: number): RealWatch[] {
  const out: RealWatch[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const c = checkRealWatch(r, seen);
    if (c.ok && out.length < REAL_WATCHES_MAX && !out.some((w) => sameWatch(w, c.watch))) out.push(c.watch);
  }
  return out;
}

function restore(saved: SavedSession): Held | undefined {
  try {
    if (!Array.isArray(saved.rows) || !Array.isArray(saved.chips) || !Number.isFinite(saved.seen)) return undefined;
    const known = new Set([...demoCatalogItems().values()].map((e) => e.category));
    const categoryLimit: Record<string, Cents> = {};
    const recordSince: Record<string, number> = {};
    for (const [c, v] of Object.entries(saved.policy?.categoryLimit ?? {})) if (known.has(c) && Number.isSafeInteger(v) && v > 0) categoryLimit[c] = v;
    for (const [c, v] of Object.entries(saved.policy?.recordSince ?? {})) if (known.has(c) && Number.isFinite(v)) recordSince[c] = v;
    const chips = validateChips(saved.chips, demoCatalogItems());
    const shopper = new ShopperLedger();
    for (const { v: _v, seq: _seq, ...row } of saved.rows) shopper.append(row);
    const policy = demoPolicy({ categoryLimit: { ...demoPolicy().categoryLimit, ...categoryLimit }, recordSince });
    const wants: SavedWant[] = [];
    for (const raw of Array.isArray(saved.wants) ? saved.wants : []) {
      const at = (raw as Partial<SavedWant> | null)?.at;
      const check = checkWant(underLimit(raw, policy), demoCatalogItems(), policy, typeof at === "number" && Number.isFinite(at) ? at : saved.seen);
      if (check.ok && !wants.some((w) => w.catalogId === check.want.catalogId)) wants.push(check.want);
    }
    return { shopper, policy, chips: chips.kind === "accepted" ? Object.freeze([...chips.chips]) : [], wants: Object.freeze(wants), tradeoffs: saved.tradeoffs !== false, real: Object.freeze(readReal(saved.real, saved.seen)), memory: readMemory(saved.memory, demoCatalogItems()), seen: saved.seen, stored: true };
  } catch {
    return undefined;
  }
}

export function demoDeps(seed: number, hash: Hasher): Deps & { clock: SimClock } {
  return { clock: new SimClock(DEMO_T0), rng: seededRng(seed), hash };
}

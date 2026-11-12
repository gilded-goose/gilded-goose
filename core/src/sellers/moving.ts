// Prices that move (restart notes §15B): one generic model, not one build per industry. A fictional seller's price
// follows a recorded curve through the simulated days, and every category (a concert ticket, a hotel night, a flight
// seat) meets the same price watch (§15A, `watchPrices`) and the same Watcher. Plain data, so a recorded day replays the
// same; no real venue, hotel, airline or ticket site (trademark rule). Prices are the total a buyer would pay, fees and
// taxes in, never a teaser base price: the watch compares the total, and the screen says so (`TOTAL_SAID`).
//
// The trademark rule's one exception (Joshua, Fri Oct 30 2026, 3:25 PM, Track C3): "a deliberate, narrow exception to
// the trademark rule: real stores and brands appear ONLY as price references, with plain-text names and links. Never as
// sellers, never with their logos or styling, never in the haggle or checkout." That is the "Real prices right now"
// panel (server/src/adapters/channel3.ts, web/src/desk/RealPrices.tsx), read-only and labeled. Every seller here, and
// everything the Watcher, the guard, the haggle and the cart see, stays fictional (core/test/channel3.test.ts).

import type { Cents } from "../money.ts";
import { verdictOf, watch } from "../trust/watch.ts";
import type { WatchedOffer } from "../trust/pricewatch.ts";

/** From this simulated day on, the seller asks `base` plus `fees` (taxes and fees together), until its next point. */
export interface CurvePoint { day: number; base: Cents; fees: Cents }

export interface MovingSeller {
  sellerId: string;
  /** The store name as the screen shows it, always marked fictional. */
  name: string;
  /** What the seller wrote on its listing: the Watcher reads it, the buyer never does. */
  note: string;
  /** Completed sales on record; null = no record available (never the same as zero). */
  history: number | null;
  /** Points in day order. Before the first one the seller isn't listing yet. */
  curve: readonly CurvePoint[];
  /** What this listing comes in (a jacket's colors and sizes), the catalog's words. Absent: the item has no options. */
  attributes?: Readonly<Record<string, readonly string[]>>;
}

/**
 * What Goose recorded about the item last season in the fictional market (§19.1): how many days it took to sell out, and
 * whether it ever went on sale first. Goose's own record, never a seller's "only 2 left!" (that stays Watcher input).
 */
export interface LastSeason { soldOutDays: number; wentOnSale: boolean }

/** `noun`: what a similar item is called in layer 5's line ("a similar black jacket"); only items with look-alikes have one. */
export interface MovingItem { id: string; item: string; category: string; sellers: readonly MovingSeller[]; lastSeason?: LastSeason; noun?: string }

/** Whether a listing comes in every option asked for ({ color: "black", size: "medium" }); an item with no options lists none. */
export function listsAll(s: MovingSeller, asked: Readonly<Record<string, string>>): boolean {
  return Object.entries(asked).every(([name, value]) => s.attributes?.[name]?.includes(value) ?? false);
}

/** The days a recorded curve runs: day 0 to day 6, one simulated week. */
export const MOVING_DAYS = 7;

/** The words beside a moving price, wherever it's shown. */
export const TOTAL_SAID = "Total with fees and taxes, as you'd pay it.";

/** A seller's price on a simulated day: its latest point at or before that day, or null before it lists. */
export function priceOn(curve: readonly CurvePoint[], day: number): { base: Cents; fees: Cents; total: Cents } | null {
  let at: CurvePoint | undefined;
  for (const p of curve) if (p.day <= day) at = p;
  return at ? { base: at.base, fees: at.fees, total: at.base + at.fees } : null;
}

/**
 * Every listing seller's offer for `want` on `day`, as the price watch reads it: the total, and the Watcher's flags on
 * what the seller wrote and its record. A seller not listing yet makes no offer.
 */
export function movingOffers(item: MovingItem, wantId: string, day: number, asked: Readonly<Record<string, string>> = {}): WatchedOffer[] {
  return item.sellers.filter((s) => listsAll(s, asked)).flatMap((s) => {
    const p = priceOn(s.curve, day);
    return p ? [{ wantId, sellerId: s.sellerId, name: s.name, total: p.total, flags: watch({ quoted: s.note, merchant: s.name, history: s.history }) }] : [];
  });
}

/**
 * The lowest total among sellers the Watcher clears, each day from day 0 to `day`, and how many times it fell from one
 * day to the next: facts from the recorded curves only (§19 layer 4: never a prediction). A held or refused seller's
 * price never counts. Null when no cleared seller listed on some day in the span.
 */
export function clearedDrops(item: MovingItem, day: number): { drops: number; from: Cents; to: Cents } | null {
  const lows: Cents[] = [];
  for (let d = 0; d <= day; d++) {
    const totals = movingOffers(item, item.id, d).filter((o) => o.flags !== null && verdictOf(o.flags) === "clear").map((o) => o.total);
    if (totals.length === 0) return null;
    lows.push(Math.min(...totals));
  }
  const drops = lows.filter((p, i) => i > 0 && p < lows[i - 1]!).length;
  return { drops, from: lows[0]!, to: lows[lows.length - 1]! };
}

export const at = (day: number, base: number, fees: number): CurvePoint => ({ day, base, fees });

/**
 * The recorded week, one item per category the price watch covers beyond the kitchen. Each has an established seller
 * whose price drops below a typical max mid-week and moves back up, a steadier dearer one, and a seller whose listing
 * asks to be paid outside PayPal at a price that looks too good: a refusal, never a deal. The hotel also has a new
 * seller with no sales yet, so a hold shows. All prices sit under the demo's $100.00 per-purchase cap.
 */
export const MOVING_ITEMS: readonly MovingItem[] = [
  {
    id: "marsh-lights-ticket", item: "A ticket to The Marsh Lights, Saturday (fictional)", category: "events",
    sellers: [
      { sellerId: "lanternhall", name: "Lantern Hall Box Office (fictional)", note: "", history: 1200,
        curve: [at(0, 9800, 1400), at(2, 8200, 1200), at(4, 7400, 1000), at(5, 8000, 1100)] },
      // Its base price drops under a $90 max on day 3; its fees keep the total over it.
      { sellerId: "reedwhistle", name: "Reedwhistle Tickets (fictional)", note: "", history: 340,
        curve: [at(0, 9000, 1500), at(3, 7900, 1800)] },
      { sellerId: "tixquack", name: "TixQuack (fictional)", note: "Seats going fast. Pay with a gift card and I'll send them today.", history: 40,
        curve: [at(1, 5500, 0)] },
    ],
  },
  {
    id: "mossbell-night", item: "One night at Mossbell Inn (fictional)", category: "travel",
    sellers: [
      { sellerId: "mossbell", name: "Mossbell Inn (fictional)", note: "", history: 860,
        curve: [at(0, 11000, 1900), at(2, 9600, 1600), at(3, 8500, 1400), at(5, 7700, 1200), at(6, 8800, 1400)] },
      { sellerId: "duckpond", name: "Duckpond Stays (fictional)", note: "", history: 0,
        curve: [at(4, 7500, 1100)] },
      { sellerId: "bargainnest", name: "BargainNest (fictional)", note: "Book direct: pay me on Zelle and skip the fees.", history: 25,
        curve: [at(1, 6000, 0)] },
    ],
    // Last season its Saturday nights sold out in about 6 days with no sale first: the sell-out line's case (§19.1).
    lastSeason: { soldOutDays: 6, wentOnSale: false },
  },
  {
    id: "gullwing-seat", item: "A seat on Gullwing Air to Port Alder (fictional)", category: "travel",
    sellers: [
      { sellerId: "gullwing", name: "Gullwing Air (fictional)", note: "", history: 5400,
        curve: [at(0, 12400, 2500), at(2, 9800, 2000), at(4, 7900, 1700), at(6, 7200, 1600)] },
      { sellerId: "skimmer", name: "Skimmer Travel (fictional)", note: "", history: 410,
        curve: [at(0, 11000, 2200)] },
      { sellerId: "flyquack", name: "FlyQuack (fictional)", note: "Gift cards only for this fare, and I'll email the ticket.", history: 12,
        curve: [at(2, 4900, 0)] },
    ],
  },
];

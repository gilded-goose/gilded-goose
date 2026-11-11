// A fresh market on every press (Joshua, 2026-10-23: "every run should be different"):
// random sellers, list prices, histories and bargaining styles, all from one seed, so the
// seed on screen rebuilds the same market. A market is plain data; a recorded run keeps the
// one it met, so a later change to this generator never breaks an old recording's replay.

import { seededRng, type Rng } from "../deps.ts";
import type { Cents } from "../money.ts";
import { eager, flexible, scammer, stingy } from "./personalities.ts";
import type { Seller } from "./types.ts";
import { askedSellers, type Chip } from "../trust/chips.ts";

export type SellerStyle = "stingy" | "flexible" | "eager" | "scammer";

export interface MarketSeller {
  id: string;
  merchant: string;
  style: SellerStyle;
  list: Cents;
  history: number;
}

export interface Market {
  seed: number;
  sellers: MarketSeller[];
}

/** The attack seller is in every market, so the injected "$500" note is always on screen (flip: false drops it from generated markets). */
export const ATTACK_EVERY_RUN = true;
export const ATTACK_SELLER = { id: "quickquack", merchant: "QuickQuack Deals (fictional)" } as const;

/** Fictional stores only (hard rule). The id is the first word, lowercased: what the buyer sees and the screen maps back to the name. */
const NAMES = [
  "Pondside Goods", "Reedbank Outfitters", "Willowbrook Kitchen", "Cattail Supply", "Heronford Housewares", "Lilypad Home",
  "Mallardine Market", "Featherstone Wares", "Brackwater Trading", "Puddlewick Pantry", "Gosling Lane Goods", "Marshgate Mercantile",
] as const;
const HONEST_STYLES = ["stingy", "flexible", "eager"] as const;
/** List-price endings, so prices look like a shop's and not a random number generator's. */
const ENDINGS = [0, 50, 99] as const;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng.next() * xs.length)]!;

/**
 * Two or three honest sellers (random style, list $50–$85, mostly an established record, sometimes
 * brand new with no red flags), plus the attack seller. Its own RNG stream, mixed from the seed, so
 * the market never shifts the haggle's dice (`demoDeps(seed)` drives those).
 */
export function generateMarket(seed: number): Market {
  const rng = seededRng((seed ^ 0x5bd1e995) >>> 0);
  const names = [...NAMES];
  const honest = 2 + Math.floor(rng.next() * 2);
  const sellers: MarketSeller[] = [];
  for (let i = 0; i < honest; i++) {
    const name = names.splice(Math.floor(rng.next() * names.length), 1)[0]!;
    const list = (50 + Math.floor(rng.next() * 36)) * 100 + pick(rng, ENDINGS);
    // About 1 in 7 is new: no history and no red flags, which Joshua's rule holds for the shopper's yes, never refuses.
    const history = rng.next() < 0.15 ? 0 : 15 + Math.floor(rng.next() * 936);
    sellers.push({ id: name.split(" ")[0]!.toLowerCase(), merchant: `${name} (fictional)`, style: pick(rng, HONEST_STYLES), list, history });
  }
  if (ATTACK_EVERY_RUN) sellers.push({ ...ATTACK_SELLER, style: "scammer", list: (52 + Math.floor(rng.next() * 19)) * 100, history: 0 });
  return { seed, sellers };
}

/**
 * Each listing's kettle colour (W49c), fixed by seller id so no market's draws change: Pondside's is black, as the
 * seeded purchase from it says, Reedbank's silver; a generated seller's comes from its id. Decided by default (flip if
 * Joshua says).
 */
const COLORS = ["black", "white", "silver"] as const;
const LISTED: Record<string, string> = { pondside: "black", reedbank: "silver", quickquack: "black" };
export function listedColor(id: string): string {
  return LISTED[id] ?? COLORS[[...id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % COLORS.length]!;
}

/** The live sellers for a market, built fresh (sellers keep state during a haggle), each with its listed colour. */
export function marketSellers(market: Market, item: string): Seller[] {
  return market.sellers.map((s) => ({ ...sellerFor(s, item), attributes: { color: listedColor(s.id) } }));
}

/** Whether these chips change which of a market's sellers a run asks (W49c): a recording of it then can't replay. */
export const steersMarket = (chips: readonly Chip[], item: string) => (market: Market): boolean =>
  askedSellers(marketSellers(market, item), chips).length !== market.sellers.length;

function sellerFor(s: MarketSeller, item: string): Seller {
  const base = { id: s.id, merchant: s.merchant, item, list: s.list, history: s.history };
  switch (s.style) {
    case "stingy": return stingy(base);
    case "flexible": return flexible(base);
    case "eager": return eager(base);
    case "scammer": return scammer(base);
  }
}

/**
 * The AI only ever sees ids ("pondside has no record", "Reedbank is cheapest"); the shopper reads the store's name
 * (M2 queue item a, project Lesson 17). The engine applies this once to the AI's raw sentence, so the ledger never
 * carries an id. Whole words in any case; letters-only ids only, so "pondsides" or an odd id stay as written.
 */
export function withStoreNames(why: string, names: ReadonlyMap<string, string>): string {
  let out = why;
  // A name ending in "s" takes a bare apostrophe ("Reedbank Outfitters' ask", not "Outfitters's").
  for (const [id, name] of names) if (/^[a-z]+$/.test(id)) out = out.replace(new RegExp(`(?<![A-Za-z])${id}(?![A-Za-z])('s\\b)?`, "gi"), (_m, poss?: string) => (poss ? (name.endsWith("s") ? `${name}'` : `${name}'s`) : name));
  return out;
}

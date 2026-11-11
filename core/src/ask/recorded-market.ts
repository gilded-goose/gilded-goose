// The Desk's deal card (Joshua, Oct 30, Part 2): "$84.00, $112.00 struck through, The same seat on day 1. Goose waited."
// Those numbers exist only in the recorded fictional week (sellers/moving.ts), never in a made-up market, which has no
// past. So an Ask that names a recorded item (the Marsh Lights ticket, a Mossbell Inn night, a Gullwing Air seat) runs
// that item's recorded week on BEAT_DAY as its market: the same shape as a made-up one (fictional-market.ts), so the
// cart, the guard and the limit are untouched, with no AI call. Each listing also carries what the same seller asked
// when it first listed, when that was more. Pure: words in, a market out; every number is the record's.

import { fromCents, type Cents } from "../money.ts";
import { storeSearch, type StoreListing } from "../storesync.ts";
import { MOVING_ITEMS, priceOn, type MovingItem } from "../sellers/moving.ts";
import { PEER_ITEMS } from "../sellers/peer.ts";
import { GOT, howGooseGotIt, type HowGot } from "../view/how-got.ts";
import { BEAT_DAY } from "./watching.ts";
import { FICTIONAL_CATALOG_ID, PEER_MARKET_CLAIM, PLANTED_SAYS, RECORDED_MARKET_CLAIM, type FictionalMarket } from "./fictional-market.ts";

/** Said as the market's maker: the record, not a model. */
export const RECORDED_MAKER_NAME = "the recorded fictional week (no AI call)";
export const PEER_MAKER_NAME = "the recorded fictional secondhand sellers (no AI call)";

/** The words that name each recorded item (its fictional proper name), what one of it is called on the card, and the
 *  category table's word that places it (`marketCategory`), so its cart is held to its recorded category's limit. */
const NAMED: readonly { id: string; words: RegExp; unit: string; place: string }[] = [
  { id: "marsh-lights-ticket", words: /\bmarsh\s+lights?\b/i, unit: "seat", place: "a ticket" },
  { id: "mossbell-night", words: /\bmossbell\b/i, unit: "night", place: "an inn" },
  { id: "gullwing-seat", words: /\bgullwing\b/i, unit: "seat", place: "a flight" },
  { id: "fernway-mixer-used", words: /\bfernway\b/i, unit: "mixer", place: "a mixer" },
  { id: "thistlewick-kettle-used", words: /\bthistlewick\b/i, unit: "kettle", place: "a kettle" },
  { id: "quillhaven-blender-used", words: /\bquillhaven\b/i, unit: "blender", place: "a blender" },
  { id: "brambleton-toaster-used", words: /\bbrambleton\b/i, unit: "toaster", place: "a toaster" },
];

/** What the same seller asked when it first listed, in the recorded week: a day as people count them (day 1 first),
 *  and the card's line under the struck price (`wasLine`). */
export interface WasPrice { total: string; day: number; whose: string; line: string }

/** One seller's own first price, said as that seller's: Goose's Read beside it tracks the lowest across sellers (`TREND_WHOSE`). */
export const WAS_WHOSE = "from this seller";

export interface RecordedMarket {
  market: FictionalMarket;
  /** The recorded item the words named: a price watch can keep watching it (a want). */
  catalogId: string;
  /** A fictional secondhand listing (`PEER_ITEMS`): one sale with no week behind it, so the price watch has nothing to keep watching. */
  peer: boolean;
  /** The day the market shows, as people count them. */
  day: number;
  unit: string;
  /** By listing id, only where the seller's first listed total was more than today's. */
  was: Record<string, WasPrice>;
}

/** The card's line under a struck price: Joshua's words, with the record's day and the item's unit. */
export const wasLine = (unit: string, day: number, how: HowGot): string => `The same ${unit} on day ${day}. ${GOT[how].did}.`;

/** The recorded item these words name, if any (whole proper names only: "lights" alone names nothing). */
export function recordedItem(words: string): { item: MovingItem; unit: string; place: string } | null {
  const hit = NAMED.find((n) => n.words.test(words));
  const item = hit && [...MOVING_ITEMS, ...PEER_ITEMS].find((i) => i.id === hit.id);
  return hit && item ? { item, unit: hit.unit, place: hit.place } : null;
}

/**
 * The recorded week's market for these words on `day` (0-based, BEAT_DAY by default), or null when the words name no
 * recorded item. Every seller listing that day is a listing at its total (fees in); the one the Watcher refuses is the
 * planted one, and a record without exactly one isn't used (the made-up market's rule: one planted scam each).
 */
export function recordedMarket(words: string, day: number = BEAT_DAY): RecordedMarket | null {
  const named = recordedItem(words);
  if (!named) return null;
  const { item, unit, place } = named;
  const listings: StoreListing[] = [];
  const was: Record<string, WasPrice> = {};
  for (const s of item.sellers) {
    const now = priceOn(s.curve, day);
    if (!now) continue;
    const id = `rm-${s.sellerId}`;
    listings.push({ id, sellerId: `rm-${s.sellerId}`, merchant: s.name, item: item.item, catalogId: FICTIONAL_CATALOG_ID, price: now.total, currency: "USD", history: s.history, note: s.note });
    const first = s.curve[0]!;
    const then = priceOn(s.curve, first.day)!.total;
    // The seller's own curve: no buyer move touches it, so no counter-offer; core's one verb (how-got.ts) says "waited".
    const how = howGooseGotIt({ firstAsk: then as Cents, price: now.total, counters: 0 });
    if (first.day < day && how) was[id] = { total: fromCents(then as Cents), day: first.day + 1, whose: WAS_WHOSE, line: wasLine(unit, first.day + 1, how) };
  }
  const peer = PEER_ITEMS.includes(item);
  const refused = storeSearch(item.item, listings).filter((r) => r.watcher === "refuse");
  if (refused.length !== 1) return null;
  // Keyed by the item and day, never by the free text: an ask needs no cap here, so at most one entry per recorded item
  // can sit in the shared market cache, and a flood of rephrasings can't push other shoppers' made-up markets out. Its
  // words are the item's own name and the table word that places it, so its limit category is its recorded one whoever asked first
  // ("A seat on Gullwing Air" holds no word the table knows: without "flight" it would fall to "other", a looser limit).
  const market: FictionalMarket = {
    id: `rec-${item.id}-d${day + 1}`, words: `${item.item}, ${place}`, item: item.item, listings, planted: refused[0]!.id,
    claim: peer ? PEER_MARKET_CLAIM : RECORDED_MARKET_CLAIM, plantedSays: PLANTED_SAYS, madeBy: peer ? PEER_MAKER_NAME : RECORDED_MAKER_NAME,
  };
  return { market, catalogId: item.id, peer, day: day + 1, unit, was };
}

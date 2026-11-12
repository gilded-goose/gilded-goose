// The price watch on "Your wants" (§15A, §15B's end): each saved want meets its offers through `watchPrices`, and the
// card's line becomes the watch's line (P-2's "Your max" line stays while the watch has nothing to say). The kettle's
// offers are the market the page compares with no run on screen (`LADDER_BEAT`, the same week the "I saw it for $X"
// ladder reads, so the two never disagree), each seller's opening ask through the Watcher; a moving item's (§15B) are
// its recorded curve on the beat's simulated day (`BEAT_DAY`). The card has no buy button, so its line never says "Tap to buy": a
// want only waits. Pure: wants, catalog, Policy and a day in, cards out.

import { fromCents, type Cents, usd } from "../money.ts";
import { quoteNote } from "../trust/fence.ts";
import type { Catalog } from "../trust/catalog.ts";
import { categoryLimitFor, type Policy } from "../trust/policy.ts";
import { watchPrices, WATCH_TAP, type WatchKind, type WatchedOffer, type WatchedWant } from "../trust/pricewatch.ts";
import { shownName, verdictOf, watch, watchWhy } from "../trust/watch.ts";
import { DEMO_ENTRY, DEMO_ITEM, DEMO_LIMITS, DEMO_LOCKED, demoCatalog, isDemoWeek, marketFor } from "../scenario.ts";
import { marketSellers } from "../sellers/market.ts";
import { MOVING_ITEMS, TOTAL_SAID, clearedDrops, movingOffers, type MovingItem } from "../sellers/moving.ts";
import { JACKETS } from "../sellers/clothing.ts";
import { LADDER_BEAT, ONLY_CHECKOUT, pileHead } from "./ladder-words.ts";
import { wantCards, wantMax, type SavedWant, type WantCard } from "./wants.ts";
import { LIMITS_PLACE } from "./copy.ts";

/**
 * A want card with the watch's state, so the screen can mark a deal, a hold or a refusal, and layer 4's history line.
 * `warning` leads the card: every seller the Watcher refused for this want, named first, as the ladder does (Joshua,
 * Thu Oct 29); the watch's line sits under it. `pile` comes before both (Joshua, Nov 5, §1a): the sellers this watch
 * compared and how many of them the Watcher refused (`pileHead`); null for a want the watch doesn't read.
 */
export interface WatchedCard extends WantCard { watch: WatchKind; history: string | null; warning: string | null; pile: string | null }

/** P-2's adapter: a saved want as the price watch reads it, its max never above today's category limit. */
export function watchedWant(w: SavedWant, catalog: Catalog, policy: Policy): WatchedWant | null {
  const e = catalog.get(w.catalogId);
  return e ? { id: w.catalogId, item: e.item, category: e.category, maxPrice: wantMax(w, catalog, policy), really: w.priority === "really" } : null;
}

/**
 * The simulated day the wants card reads a moving price at: the recorded drop (the ticket's $84.00, the video beat), so
 * every visit shows the same state and the line names it as simulated. Decided by default; flip if Joshua says: cycle the
 * recorded week by the clock.
 */
export const BEAT_DAY = 4;

/** Each kettle seller's opening ask in a market, through the Watcher as the ladder reads it; a color want counts only
 * the sellers listing that color. */
function kettleOffers(seed: number, color: string | undefined): WatchedOffer[] {
  return marketSellers(marketFor(seed), DEMO_ITEM)
    .filter((s) => color === undefined || s.attributes?.color === color)
    .map((s) => {
      const o = s.open(1);
      const flags = watch({ quoted: quoteNote(o.note), merchant: o.merchant, item: o.item, history: s.history });
      return { wantId: DEMO_ENTRY, sellerId: s.id, name: shownName(o.merchant, "merchant").shown, total: o.price, flags };
    });
}

/** An item whose price follows a recorded curve: the ticket, hotel night or flight seat, or a jacket. */
export const watchedItem = (catalogId: string): MovingItem | undefined => MOVING_ITEMS.find((i) => i.id === catalogId) ?? JACKETS.find((i) => i.id === catalogId);

/**
 * A want's offers: the kettle's from the compared market, a moving item's from its curve today, else none (quiet). A
 * color want counts only the listings in that color (a jacket's listings say which colors they come in).
 */
export function offersFor(w: SavedWant, day: number): WatchedOffer[] {
  const color = colorFor(w);
  if (w.catalogId === DEMO_ENTRY) return kettleOffers(LADDER_BEAT.seed, color);
  const moving = watchedItem(w.catalogId);
  return moving ? movingOffers(moving, w.catalogId, day, color ? { color } : {}) : [];
}

/** The color a want's offers are filtered to, if any (only items whose listings say a color): its pile names it. */
export function colorFor(w: SavedWant): string | undefined {
  if (w.catalogId === DEMO_ENTRY) return w.color;
  return watchedItem(w.catalogId)?.sellers.some((s) => s.attributes) ? w.color : undefined;
}

/** Where the kettle's prices came from, said before its line. */
const FROM = isDemoWeek(LADDER_BEAT.seed) ? `In simulated week ${LADDER_BEAT.seed}` : `In market #${LADDER_BEAT.seed}`;

/**
 * The watch's line as the card says it: no "Tap to buy" (the card has no buy button), and where the prices came from,
 * so a recorded price never reads as a live one: the kettle's week, or a moving item's simulated day and that its price
 * is the total.
 */
function cardLine(said: string, catalogId: string, day: number): string {
  const line = said.endsWith(` ${WATCH_TAP}`) ? said.slice(0, -WATCH_TAP.length - 1) : said;
  if (catalogId === DEMO_ENTRY) return `${FROM}: ${line}`;
  return watchedItem(catalogId) ? `On simulated day ${day + 1}: ${line} ${TOTAL_SAID}` : line;
}

/**
 * A category with no limit of its own is held to the shopper's strictest one (`categoryLimitFor`), never a looser one;
 * the card says so rather than quietly using it (Lead-5, Thu Oct 29). Null when the shopper set one.
 */
export function noLimitLine(category: string, policy: Policy): string | null {
  if (Object.hasOwn(policy.categoryLimit, category)) return null;
  const name = category.charAt(0).toUpperCase() + category.slice(1);
  return `${name} has no limit of its own yet: set one in ${LIMITS_PLACE}. Until then Goose holds it to ${usd(categoryLimitFor(policy, category))}.`;
}


/** Set aside means the Watcher refused it: the one test the warning and the pile both read, so they never disagree. */
const setAside = (o: WatchedOffer): boolean => o.flags !== null && verdictOf(o.flags) === "refuse";

/** The pile's count over a want's offers: each seller once, as `warningFor` names them. */
export function pileFor(offers: readonly WatchedOffer[], color?: string): string {
  const sellers = offers.filter((o, i) => offers.findIndex((p) => p.sellerId === o.sellerId) === i);
  return pileHead(sellers.length, sellers.filter(setAside).length, color);
}

/**
 * The scam warning a card leads with (layer 1 of the ladder, for a want): each refused seller's Watcher sentence, in
 * the market's order, then 9.1's line once. Null when the Watcher refused none of the want's offers. Fixed words only:
 * the store name as `shownName` lets it and the Watcher's own sentence, never a seller's note.
 */
export function warningFor(offers: readonly WatchedOffer[]): string | null {
  const refused = offers.filter((o, i) => setAside(o) && offers.findIndex((p) => p.sellerId === o.sellerId) === i);
  return refused.length ? [...refused.map((o) => watchWhy(o.name, o.flags!)), ONLY_CHECKOUT].join(" ") : null;
}

/**
 * §19 layer 4, "wait, or don't" (§19.1): which regret to avoid, from Goose's recorded history only, for a "really want"
 * only, always ending "Your call.". An item Goose recorded selling out last season with no sale first gets the sell-out
 * line; otherwise how many times its lowest cleared price dropped this simulated week, as counted facts, never a
 * prediction. No countdown and no "act now": a seller's "going fast" stays the Watcher's input, never a line here.
 */
export function historyLine(w: SavedWant, max: Cents, day: number): string | null {
  const m = w.priority === "really" ? watchedItem(w.catalogId) : undefined;
  if (!m) return null;
  const h = clearedDrops(m, day);
  const dropped = h && h.drops > 0 ? `${h.drops} ${h.drops === 1 ? "time" : "times"} so far this simulated week, from ${usd(h.from)} to ${usd(h.to)}` : null;
  // Last season's sell-out leads; this week's drops, if any, still show, so the card never contradicts itself.
  if (m.lastSeason && !m.lastSeason.wentOnSale) return `Last season this sold out in about ${m.lastSeason.soldOutDays} days and never went on sale, in Goose's record of the fictional market.${dropped ? ` This season, from sellers not set aside, its lowest price has dropped ${dropped}.` : ""} Your call.`;
  if (!dropped) return null;
  const by = max < w.max ? "your Max, held to your limit" : "your Max";
  return `From sellers not set aside, its lowest price dropped ${dropped}. Goose watches for ${usd(max)} or less (${by}). Your call.`;
}

/** The wants list's cards, each line the price watch's when it has one; the cards keep `wantCards`' order. */
export function watchedCards(wants: readonly SavedWant[], catalog: Catalog, policy: Policy, day: number = BEAT_DAY): WatchedCard[] {
  const watched = new Map(wants.flatMap((w) => {
    const ww = watchedWant(w, catalog, policy);
    const offers = offersFor(w, day);
    return ww ? [[w.catalogId, { p: watchPrices([ww], offers, policy)[0]!, history: historyLine(w, ww.maxPrice, day), warning: warningFor(offers), pile: pileFor(offers, colorFor(w)) }] as const] : [];
  }));
  // 9.1's line is said once on the list, on the first warned card, not once per card (review).
  let onlyCheckoutSaid = false;
  return wantCards(wants, catalog, policy).map((c) => {
    const got = watched.get(c.catalogId);
    const p = got?.p;
    const history = got?.history ?? null;
    const pile = got?.pile ?? null;
    let warning = got?.warning ?? null;
    if (warning && onlyCheckoutSaid) warning = warning.slice(0, -ONLY_CHECKOUT.length - 1);
    else if (warning) onlyCheckoutSaid = true;
    // A refusal's line: the warning above already names the seller and why, so the line under it says the price was
    // no deal and what Goose still waits for (the max), never the Watcher's sentence twice.
    const said = p?.kind === "refused" ? `${p.item} for ${usd(p.offer!.total)} is no deal.` : p?.said ?? null;
    const card: WatchedCard = p && said !== null
      ? { ...c, watch: p.kind, history, warning, pile, line: p.kind === "refused" ? `${cardLine(said, c.catalogId, day)} ${c.line}` : cardLine(said, c.catalogId, day) }
      : { ...c, watch: "quiet", history, warning, pile };
    const unset = noLimitLine(catalog.get(c.catalogId)!.category, policy);
    return unset ? { ...card, line: `${unset} ${card.line}` } : card;
  });
}

// ---------- Settings: your limits (one row per catalog category; the shopper's tap is the only thing that sets one) ----------

/**
 * One category's limit as the wallet's Settings rows show it. `locked`: the demo set it (the kitchen's $60.00, the
 * limit the recorded weeks run under, and the events $90.00 the ticket's beat runs under), so no tap here changes it. `own`: the shopper set it this session. Otherwise the
 * category is held to the strictest limit (`categoryLimitFor`) and `suggest` is the one-tap first limit.
 */
export interface LimitRow {
  category: string; label: string; limit: string; own: boolean; locked: boolean;
  /** Desk-L: the demo's own limit, not locked (travel, clothing): shown "Set for this demo", and her tap may change it. */
  demo: boolean;
  suggest: Cents | null; choices: Cents[];
}

/** A category's first-limit suggestion: the dearest catalog want in it, never over the per-purchase cap. */
const suggestFor = (category: string, cap: Cents) =>
  Math.min(cap, Math.max(...demoCatalog().filter((e) => e.want.category === category).map((e) => e.want.maxPrice)));

/** The limits a tap may set: $5.00 steps up to the per-purchase cap. */
export const limitChoices = (cap: Cents): Cents[] => Array.from({ length: Math.floor(cap / 500) }, (_, i) => (i + 1) * 500);

export function limitRows(policy: Policy, catalog: Catalog): LimitRow[] {
  return [...new Set([...catalog.values()].map((e) => e.category))].map((category) => {
    const locked = DEMO_LOCKED.includes(category);
    const set = !locked && Object.hasOwn(policy.categoryLimit, category);
    // Still the demo's number: "Set for this demo". Once her tap changes it, it is hers.
    const demo = set && Object.hasOwn(DEMO_LIMITS, category) && policy.categoryLimit[category] === DEMO_LIMITS[category];
    const own = set && !demo;
    return {
      category, label: category.charAt(0).toUpperCase() + category.slice(1), limit: fromCents(categoryLimitFor(policy, category)), own, locked, demo,
      suggest: locked || set ? null : suggestFor(category, policy.perPurchaseCap), choices: locked ? [] : limitChoices(policy.perPurchaseCap),
    };
  });
}

/** Why a limit tap is refused, in fixed words, or null when it may be set. */
export function limitRefused(policy: Policy, catalog: Catalog, category: unknown, limit: unknown): string | null {
  const row = typeof category === "string" ? limitRows(policy, catalog).find((r) => r.category === category) : undefined;
  if (!row) return "That isn't a catalog category, so it has no limit to set. Nothing changed.";
  if (row.locked) return `The ${row.category} limit is set for this demo, so it doesn't change here. Nothing changed.`;
  if (typeof limit !== "number" || !row.choices.includes(limit)) return "A limit is a whole $5.00 step up to your per-purchase cap. Nothing changed.";
  return null;
}

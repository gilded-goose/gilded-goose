// The answer to "I saw it for $X" (021 item 9; restart notes §12C, §14, §19, §9.1): a ladder walked in order, layers
// 1–3 for now. First the sellers the Watcher refused, named as refused, never as a deal. Then the cheapest seller it
// cleared, if it beats $X. Else the store's own price. A held or refused seller never counts as cheaper, however low
// its price (W52: any scam note the Watcher missed would otherwise be a spoken recommendation). Fixed words only: a
// seller's note never reaches a line, only its store name as `shownName` lets it, and the Watcher's own sentence.
// It compares the market the page shows, with Goose's own deal there at its haggled price, so the answer never
// contradicts the deal beside it (code review: week 3's opening asks said "nothing beats $55" beside week 1's $47.73).
// Layer 4 (wait) is on the wants card (watching.ts `historyLine`). Layer 5 (similar for less) rides on the second
// category, the jackets (sellers/clothing.ts): a look-alike from a seller the Watcher cleared, in every option the
// shopper asked for, cheaper than both her price and the same item's best, never over her limit, and always labeled
// "similar", "not the same item".

import { fromCents, toCents, type Cents, usd } from "../money.ts";
import { quoteNote } from "../trust/fence.ts";
import { shownName, verdictOf, watch, watchWhy, type Flag, type WatchVerdict } from "../trust/watch.ts";
import { DEMO_ENTRY, DEMO_ITEM, marketFor } from "../scenario.ts";
import { marketSellers } from "../sellers/market.ts";
import { TOTAL_SAID, movingOffers, type MovingItem } from "../sellers/moving.ts";
import { JACKETS } from "../sellers/clothing.ts";
import { spokenStore, spokenUsd } from "./voice.ts";
import { LADDER_BEAT, ONLY_CHECKOUT, marketName, pileHead, refusedFor, type LadderMarket } from "./ladder-words.ts";

export { LADDER_BEAT, ONLY_CHECKOUT, marketName, pileHead, refusedFor, type LadderMarket };

/**
 * One seller's price for the item, and what the Watcher made of it. `why` is the Watcher row's sentence, shown only for
 * a refusal. `deal`: the price is Goose's own bound deal, not the seller's opening ask.
 */
export interface LadderOffer { name: string; price: Cents; verdict: WatchVerdict; why: string; deal?: boolean; refusedFor?: string }

export type LadderLayer = "cheaper" | "store-best" | "over-budget";

export interface LadderAnswer {
  /** The set-aside pile's count line (`pileHead`), drawn first: the listings compared and how many the Watcher refused. */
  pile: string;
  /** Layer 1: each refused seller's Watcher sentence, first, then 9.1's line once. Empty when none was refused. */
  refused: string[];
  layer: LadderLayer;
  /** The layer's own line. */
  line: string;
  /** The line said back, in about 3 s (item 10): whole dollars, the store's first word; the card carries the rest. */
  said: string;
  /** Said right after it, when a seller was refused: the first one, in one short clause. Empty when none was. */
  saidRefused: string;
  /** Layer 5: a cheaper look-alike, labeled similar, never the same item. Empty when none qualifies. */
  similar: string;
  /** Layer 5 said back, last. Empty when none qualifies. */
  saidSimilar: string;
}

/** A look-alike's price for layer 5: a different catalog entry in the same category, from a listing in every option asked. */
export interface SimilarOffer { item: string; noun: string; name: string; price: Cents; verdict: WatchVerdict }

/** Said once when the page couldn't read the shopper's limit: a missing input is the worse case (shared Lesson 9). */
export const NO_LIMIT = "Goose couldn't read your limit, so check it before you buy.";


/**
 * The ladder over one item's offers. `saw` is the field's price; `limit` the shopper's Settings limit (null when the
 * page couldn't read it: then nothing is called over or in budget). A tie goes to the store: buy where you are.
 */
export function ladder(saw: Cents, limit: Cents | null, offers: readonly LadderOffer[], item: string, similar: readonly SimilarOffer[] = [], asked: Readonly<Record<string, string>> = {}): LadderAnswer {
  const a = sameItem(saw, limit, offers, item);
  // Layer 5 only beats what layers 2 and 3 found: her own price and the same item's best cleared price. With no
  // limit read it shows nothing: "never over her limit" can't be kept against a limit Goose doesn't know.
  const sameBest = Math.min(...offers.filter((o) => o.verdict === "clear").map((o) => o.price));
  const look = similar
    .filter((o) => o.verdict === "clear" && o.price < saw && o.price < sameBest && limit !== null && o.price <= limit)
    .sort((x, y) => x.price - y.price)[0];
  if (!look) return { ...a, similar: "", saidSimilar: "" };
  const what = [asked.color, look.noun].filter(Boolean).join(" ");
  return {
    ...a,
    similar: `A similar ${what} is ${usd(look.price)} at ${look.name}, not the same item: the ${look.item}.`,
    saidSimilar: `A similar ${what} is ${spokenUsd(look.price)} at ${spokenStore(look.name)}, not the same item.`,
  };
}

/** Layers 1–3 over the item asked about. */
function sameItem(saw: Cents, limit: Cents | null, offers: readonly LadderOffer[], item: string): Omit<LadderAnswer, "similar" | "saidSimilar"> {
  const refusedOffers = offers.filter((o) => o.verdict === "refuse");
  const pile = pileHead(offers.length, refusedOffers.length);
  const refused = refusedOffers.length > 0 ? [...refusedOffers.map((o) => o.why), ONLY_CHECKOUT] : [];
  const first = refusedOffers[0];
  const saidRefused = first ? `${spokenStore(first.name)} was refused: ${first.refusedFor ?? "its note broke a rule"}.` : "";
  const cleared = offers.filter((o) => o.verdict === "clear").sort((a, b) => a.price - b.price);
  const best = cleared[0];
  const cheaper = best !== undefined && best.price < saw ? best : null;
  const bestPrice = cheaper ? cheaper.price : saw;
  // Decided by default (flip if Joshua says): no "Goose keeps watching" until a price watch exists (never claim beyond the code).
  // Whose price it is, said: a cleared seller's, or the shopper's own. Decided by default (flip if Joshua says): no nudge
  // to raise the limit, since Goose shouldn't push spending.
  if (limit !== null && bestPrice > limit) {
    const line = cheaper
      ? `Not set aside, the best price is ${usd(cheaper.price)} at ${cheaper.name}, over your ${usd(limit)} limit.`
      : `Among sellers not set aside, none beats your ${usd(saw)}, and that's over your ${usd(limit)} limit.`;
    const said = cheaper
      ? `${spokenUsd(cheaper.price)} at ${spokenStore(cheaper.name)} is over your ${spokenUsd(limit)} limit.`
      : `Nothing cleared beats ${spokenUsd(saw)}, over your ${spokenUsd(limit)} limit.`;
    return { pile, refused, layer: "over-budget", line, said, saidRefused };
  }
  const unread = limit === null ? ` ${NO_LIMIT}` : "";
  const unreadSaid = limit === null ? " Check your limit." : "";
  if (cheaper) {
    // Not set aside first (Joshua, Nov 5 §1b: safe leads, the price follows), then the saving, the price and where.
    const at = cheaper.deal ? ` in Goose's deal at ${cheaper.name}` : ` at ${cheaper.name}`;
    return { pile, refused, layer: "cheaper", line: `Not set aside, and ${usd(saw - cheaper.price)} less: the same ${item} for ${usd(cheaper.price)}${at}.${unread}`, said: `${spokenUsd(saw - cheaper.price)} less at ${spokenStore(cheaper.name)}.${unreadSaid}`, saidRefused };
  }
  // Decided by default (flip if Joshua says): §19's "No one beats $X" said as what Goose checked, not every store there is,
  // and "where you saw it", never "there": the line just above can name a refused seller (visual review). No "right
  // now": the sellers are a simulated week's, not a live check (code review).
  return { pile, refused, layer: "store-best", line: `Among sellers not set aside, none beats your ${usd(saw)}. Buy it where you saw it.${unread}`, said: limit === null ? `Nothing cleared beats ${spokenUsd(saw)}.${unreadSaid}` : `Nothing cleared beats ${spokenUsd(saw)}. Buy it where you saw it.`, saidRefused };
}

/** The whole answer said back: the answer first, about 3 s, then the refused seller, then a look-alike, if any. */
export const ladderSaid = (a: LadderAnswer) => [a.said, a.saidRefused, a.saidSimilar].filter(Boolean).join(" ");

/** The catalog entry it compares: the kettle, the only item with sellers so far. */
export const LADDER_ITEM = DEMO_ENTRY;

/** Said under every answer: what it compared against, so nothing implies every store there is. */
export function ladderFrom(m: LadderMarket): string {
  if (m.deal === null) return `Compared with ${marketName(m.seed)}'s fictional sellers at their first asking price, each checked by the Watcher.`;
  return `Compared with ${marketName(m.seed)}'s fictional sellers, all checked by the Watcher: ${shownName(m.deal.merchant, "merchant").shown} at Goose's deal price, the rest at their first asking price.`;
}

// Opening asks per market, read once (code review: every keystroke in the field rebuilt the market and ran the Watcher).
const openings = new Map<number, readonly (LadderOffer & { merchant: string })[]>();

/**
 * Each seller's opening price for the kettle in a market, through the Watcher as the haggle reads an offer. Goose's
 * own deal replaces its seller's opening ask, only for a seller the Watcher cleared (the guard bound it, at that price).
 */
export function marketOffers(m: LadderMarket): LadderOffer[] {
  let open = openings.get(m.seed);
  if (!open) {
    open = marketSellers(marketFor(m.seed), DEMO_ITEM).map((s) => {
      const o = s.open(1);
      const flags = watch({ quoted: quoteNote(o.note), merchant: o.merchant, item: o.item, history: s.history });
      const name = shownName(o.merchant, "merchant").shown;
      const verdict = verdictOf(flags);
      return { merchant: o.merchant, name, price: o.price, verdict, why: watchWhy(name, flags), ...(verdict === "refuse" ? { refusedFor: refusedFor(flags) } : {}) };
    });
    openings.set(m.seed, open);
  }
  return open.map(({ merchant, ...o }) => (m.deal && merchant === m.deal.merchant && o.verdict === "clear" ? { ...o, price: toCents(m.deal.total), deal: true } : o));
}

// ---------- The jackets (§19 layer 5): their listings on the wants card's simulated day, through the same Watcher ----------

/** The simulated day the jackets' ladder reads, the wants card's (`BEAT_DAY` in watching.ts; core/test/jacket.test.ts holds them equal). */
export const JACKET_DAY = 4;

const ladderOffer = (o: { name: string; total: Cents; flags: readonly Flag[] | null }): LadderOffer => {
  const flags = o.flags ?? [];
  const verdict = o.flags === null ? "hold" : verdictOf(flags);
  return { name: o.name, price: o.total, verdict, why: watchWhy(o.name, flags), ...(verdict === "refuse" ? { refusedFor: refusedFor(flags) } : {}) };
};

/** One jacket's listings in every option asked, as the ladder reads them. */
export function jacketOffers(m: MovingItem, day: number, asked: Readonly<Record<string, string>>): LadderOffer[] {
  return movingOffers(m, m.id, day, asked).map(ladderOffer);
}

/** The look-alikes for a jacket: every other entry in its category with the same noun, from listings in every option asked. */
export function similarOffers(m: MovingItem, day: number, asked: Readonly<Record<string, string>>): SimilarOffer[] {
  return JACKETS.filter((o) => o.id !== m.id && o.category === m.category && o.noun !== undefined && o.noun === m.noun)
    .flatMap((o) => movingOffers(o, o.id, day, asked).map((x) => { const l = ladderOffer(x); return { item: o.item, noun: o.noun!, name: l.name, price: l.price, verdict: l.verdict }; }));
}

/** What a jacket's answer compared, said under it. */
export const jacketFrom = (day: number) => `Compared with the fictional clothing sellers' posted totals on simulated day ${day + 1}, each checked by the Watcher. ${TOTAL_SAID}`;

/**
 * The ladder for whatever the Ask named, with what it compared: the kettle against the market the page shows (layers
 * 1–3), a jacket against its listings on `JACKET_DAY` (layers 1–3 and 5). Null for an entry the ladder doesn't read.
 * `asked` is the Ask's option chips ({ color, size }), each one a listing must come in.
 */
export function ladderFor(catalogId: string, saw: Cents, limit: Cents | null, market: LadderMarket | null, asked: Readonly<Record<string, string>> = {}): { answer: LadderAnswer; from: string } | null {
  if (catalogId === LADDER_ITEM) { const m = market ?? LADDER_BEAT; return { answer: ladder(saw, limit, marketOffers(m), "kettle"), from: ladderFrom(m) }; }
  const j = JACKETS.find((x) => x.id === catalogId);
  if (!j) return null;
  return { answer: ladder(saw, limit, jacketOffers(j, JACKET_DAY, asked), j.noun ?? "item", similarOffers(j, JACKET_DAY, asked), asked), from: jacketFrom(JACKET_DAY) };
}

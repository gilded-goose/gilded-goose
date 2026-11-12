// The price watch (restart notes §15A, 021 §4 Nov 4–7): one rule for every want on the wants list, the kettle and a
// concert ticket alike. It compares the cheapest offer the Watcher cleared against the shopper's max and says, in order:
// a little under (the key moment, "really want" first), a little over ("close": keep waiting or raise it yourself),
// far over (quiet). An offer under the max from a seller the Watcher refused is a refusal, never a deal. Goose never
// raises a max, and at the tap a price that moved is never charged: the shopper taps again on the new one. Pure: the
// offers and their flags come in, a state and its fixed words go out.

import { fromCents, type Cents } from "./money.ts";
import { categoryLimitFor, type Policy } from "./policy.ts";
import { verdictOf, watchWhy, type Flag } from "./watch.ts";

/** One want on the wants list, as the watch reads it. `maxPrice` is the shopper's; the category limit still caps it. */
export interface WatchedWant { id: string; item: string; category: string; maxPrice: Cents; really: boolean }

/** One seller's offer for a want: the total a buyer would pay (fees and taxes in, never a teaser base price), the store
 * name the screen may show (`shownName`), and the Watcher's flags on that seller, from `watch`. `null` means the Watcher
 * hasn't read this seller, which is never the same as nothing found (an empty list): an unread seller only holds. */
export interface WatchedOffer { wantId: string; sellerId: string; name: string; total: Cents; flags: readonly Flag[] | null }

/**
 * How far over the max still counts as "close", in percent of the max. A fixed setting, never raised by an offer.
 * Decided by default (§15A): 10%. Flip in the review.
 */
export const CLOSE_BAND_PCT = 10;

/**
 * - `under`: a cleared offer at or under the max: say it now.
 * - `held`: the cheapest offer at or under the max is from a seller the Watcher held: it waits for the shopper's yes.
 * - `close`: the cheapest cleared offer is over the max, within the close band.
 * - `refused`: the only offers at or under the max are from sellers the Watcher refused: a refusal, never a deal.
 * - `quiet`: nothing to say; keep watching. Also a price between the category limit and a higher max the shopper typed:
 *   the limit is the max (decided by default; flip if Joshua wants a "your limit is in the way" line).
 */
export type WatchKind = "under" | "held" | "close" | "refused" | "quiet";

export interface PriceWatch {
  wantId: string;
  item: string;
  really: boolean;
  kind: WatchKind;
  /** The max the watch compares against: the shopper's, or the category limit when that's lower. */
  max: Cents;
  /** True when the category limit, not the shopper's max, set `max`. */
  capped: boolean;
  /** The offer the state is about; absent when `quiet`. */
  offer?: { sellerId: string; name: string; total: Cents };
  /** The line Goose says, in fixed words; null when `quiet`. */
  said: string | null;
}

/** How an `under` line ends: the alert's tap. A screen with no buy button says the line without it. */
export const WATCH_TAP = "Tap to buy.";
/**
 * Where the shopper raises a max or a limit, by the Desk's name for that pane ("Limits in code", core's `LIMITS_NAME`).
 * A literal: this package stands alone and never imports core; core/test/limits-name.test.ts pins the two equal.
 */
export const WATCH_LIMITS_PLACE = "Limits in code";

const usd = (c: Cents) => `$${fromCents(c)}`;
/** The Watcher's verdict on an offer; one it never read holds (when unsure, hold). */
const verdict = (o: WatchedOffer) => (o.flags === null ? "hold" : verdictOf(o.flags));
const why = (o: WatchedOffer) => (o.flags === null ? `The Watcher hasn't checked ${o.name} yet, so a cart from it waits for your yes.` : watchWhy(o.name, o.flags));
const RANK: Readonly<Record<WatchKind, number>> = { under: 0, held: 1, close: 2, refused: 3, quiet: 4 };
const cheapest = (os: readonly WatchedOffer[]) => os.reduce<WatchedOffer | undefined>((a, o) => (a === undefined || o.total < a.total ? o : a), undefined);

/** The close band for a max, in whole cents, rounded down: never a cent wider than the setting. */
export const closeBand = (max: Cents): Cents => Math.floor((max * CLOSE_BAND_PCT) / 100);

/** One want's state against its current offers. */
export function watchPrice(want: WatchedWant, offers: readonly WatchedOffer[], policy: Policy): PriceWatch {
  const limit = categoryLimitFor(policy, want.category);
  const max = Math.min(want.maxPrice, limit);
  const capped = limit < want.maxPrice;
  const yours = capped ? `${want.category} limit` : "max";
  const mine = offers.filter((o) => o.wantId === want.id && Number.isSafeInteger(o.total) && o.total > 0);
  const base = { wantId: want.id, item: want.item, really: want.really, max, capped };
  const about = (o: WatchedOffer) => ({ sellerId: o.sellerId, name: o.name, total: o.total });

  const cleared = cheapest(mine.filter((o) => verdict(o) === "clear"));
  if (cleared && cleared.total <= max) {
    const gap = max - cleared.total;
    const where = gap === 0 ? `right at your ${usd(max)} ${yours}` : `${usd(gap)} under your ${usd(max)} ${yours}`;
    return { ...base, kind: "under", offer: about(cleared), said: `${want.item} is ${usd(cleared.total)} at ${cleared.name}, ${where}. ${WATCH_TAP}` };
  }
  const held = cheapest(mine.filter((o) => o.total <= max && verdict(o) === "hold"));
  if (held) return { ...base, kind: "held", offer: about(held), said: `${want.item} is ${usd(held.total)}, under your ${usd(max)} ${yours}. ${why(held)}` };
  if (cleared && cleared.total - max <= closeBand(max)) {
    const raise = capped ? `raise the ${want.category} limit yourself in ${WATCH_LIMITS_PLACE}` : `raise your max yourself in ${WATCH_LIMITS_PLACE}`;
    return { ...base, kind: "close", offer: about(cleared), said: `${want.item} is ${usd(cleared.total)}, ${usd(cleared.total - max)} over your ${usd(max)} ${yours}. Keep waiting, or ${raise}.` };
  }
  const refused = cheapest(mine.filter((o) => o.total <= max && verdict(o) === "refuse"));
  if (refused) return { ...base, kind: "refused", offer: about(refused), said: `${want.item} for ${usd(refused.total)} is no deal. ${why(refused)}` };
  return { ...base, kind: "quiet", said: null };
}

/** Every want's state, most important first: under before held before close before refused before quiet, and within
 * each, the shopper's "really want"s first; otherwise the wants list's own order. */
export function watchPrices(wants: readonly WatchedWant[], offers: readonly WatchedOffer[], policy: Policy): PriceWatch[] {
  return wants
    .map((w, i) => ({ w: watchPrice(w, offers, policy), i }))
    .sort((a, b) => RANK[a.w.kind] - RANK[b.w.kind] || Number(b.w.really) - Number(a.w.really) || a.i - b.i)
    .map((x) => x.w);
}

export type TapCheck = { ok: true; total: Cents } | { ok: false; said: string };

/**
 * At the shopper's tap on an `under` alert: the offer as it is now, re-read. Only the exact price the shopper tapped on
 * goes on to be bound (and the guard still re-checks the bound cart before capture). A price that moved, up or down, is
 * never charged: it is said plainly and the shopper taps again. A seller the Watcher no longer clears buys nothing: a
 * refusal says why, a hold says it needs a fresh look (the tap was the yes to a cleared seller, not to a held one).
 */
export function atTap(alert: PriceWatch, now: WatchedOffer | undefined): TapCheck {
  const nothing = "Nothing was charged.";
  if (alert.kind !== "under" || !alert.offer) return { ok: false, said: `There's no deal to buy for ${alert.item} right now. ${nothing}` };
  if (!now || now.sellerId !== alert.offer.sellerId || now.wantId !== alert.wantId || !Number.isSafeInteger(now.total) || now.total <= 0) return { ok: false, said: `That offer for ${alert.item} is gone. ${nothing}` };
  const v = verdict(now);
  if (v === "refuse") return { ok: false, said: `${why(now)} ${nothing}` };
  if (v === "hold") return { ok: false, said: `The Watcher now holds ${alert.offer.name}, so this tap didn't buy it. ${nothing}` };
  if (now.total === alert.offer.total) return { ok: true, total: now.total };
  if (now.total > alert.max) return { ok: false, said: `It's ${usd(now.total)} now, over your ${usd(alert.max)} ${alert.capped ? "limit" : "max"}. ${nothing}` };
  return { ok: false, said: `It's ${usd(now.total)} now, not the ${usd(alert.offer.total)} you tapped. ${nothing} Tap again to buy at ${usd(now.total)}.` };
}

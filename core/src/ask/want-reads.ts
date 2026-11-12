// Goose's Read on each saved want: the signals a want really has, gathered for `gooseRead`. The offers are the ones the
// want's card already shows (`offersFor`, at the same simulated day), and the trend is the recorded curve's lowest cleared
// price (`clearedDrops`). An item with no recorded curve has no trend, and its Read says so. Server side: the browser gets
// the Read as JSON, so none of this reaches a bundle.

import { toCents, type Cents } from "../money.ts";
import { isShoppers, type LedgerEvent } from "../ledger/events.ts";
import { clearedDrops } from "../sellers/moving.ts";
import type { Catalog } from "../trust/catalog.ts";
import { listSpend, listTotal } from "../trust/guard.ts";
import type { Policy } from "../trust/policy.ts";
import type { WatchedOffer } from "../trust/pricewatch.ts";
import { verdictOf } from "../trust/watch.ts";
import type { StoreResult } from "../storesync.ts";
import { deskDeal } from "../view/desk.ts";
import { daySaid, daysUntil, shownItem } from "../view/list.ts";
import { gooseRead, type GooseRead, type ReadSignals, type SellerSignal } from "../view/gooses-read.ts";
import type { RecordedMarket } from "./recorded-market.ts";
import { yearPlan, type YearView } from "../view/year-plan.ts";
import { BEAT_DAY, offersFor, watchedItem } from "./watching.ts";
import { rankOf, wantMax, type SavedWant } from "./wants.ts";

/** The cheapest offer from the best-trusted sellers: cleared first, then held, then set aside. */
function bestOffer(offers: readonly WatchedOffer[]): { seller: SellerSignal; offer: WatchedOffer | null } {
  for (const seller of ["clear", "hold", "refuse"] as const) {
    const at = offers.filter((o) => o.flags !== null && verdictOf(o.flags) === seller);
    if (at.length) return { seller, offer: at.reduce((a, b) => (b.total < a.total ? b : a)) };
  }
  return { seller: "none", offer: null };
}

/** What's left of the list's total, or null when none stands. */
export function totalLeft(rows: readonly LedgerEvent[], shopperId: string): Cents | null {
  const on = listTotal(rows, shopperId);
  return on ? Math.max(0, on.total - listSpend(rows, shopperId, on.since)) : null;
}

/** An item's recorded trend: the lowest cleared price across sellers, first day to this one, never one seller's own (that's
 *  the deal card's `was`). Null with no recorded curve. */
function trendOf(catalogId: string | undefined, day: number): ReadSignals["trend"] {
  const moving = catalogId ? watchedItem(catalogId) : undefined;
  const drops = moving ? clearedDrops(moving, day) : null;
  return drops ? { fromCents: drops.from, toCents: drops.to } : null;
}

const daySignals = (w: SavedWant | undefined, now: number) => ({
  daysLeft: w?.neededBy ? daysUntil(w.neededBy, now) : null,
  neededSaid: w?.neededBy ? daySaid(w.neededBy) : null,
});

export function wantRead(w: SavedWant, catalog: Catalog, policy: Policy, leftCents: Cents | null, now: number, day: number = BEAT_DAY): GooseRead {
  const { seller, offer } = bestOffer(offersFor(w, day));
  return gooseRead({
    priceCents: offer?.total ?? null,
    maxCents: wantMax(w, catalog, policy),
    seller,
    sellerName: offer ? shownItem(offer.name) : null,
    trend: trendOf(w.catalogId, day),
    rank: rankOf(w),
    ...daySignals(w, now),
    leftCents,
    simulated: true,
  });
}

/**
 * The Read on the deal a market offers: the listing the Desk offers (`deskDeal`). A recorded item brings its curve, and
 * its saved want brings its priority, max and day; any other deal has no history and no priority to quote, only that they
 * asked for it just now. Null when the market has no deal.
 */
export function dealRead(results: readonly StoreResult[], o: { recorded?: Pick<RecordedMarket, "catalogId" | "day">; wants: readonly SavedWant[]; catalog: Catalog; policy: Policy; leftCents: Cents | null; now: number }): GooseRead | null {
  const deal = deskDeal(results);
  if (!deal) return null;
  const catalogId = o.recorded?.catalogId;
  const saved = catalogId ? o.wants.find((w) => w.catalogId === catalogId) : undefined;
  return gooseRead({
    priceCents: toCents(deal.price),
    maxCents: saved ? wantMax(saved, o.catalog, o.policy) : null,
    seller: deal.watcher,
    sellerName: shownItem(deal.merchant),
    // A recorded market counts its days from 1, as the screen says them; the curves count from 0.
    trend: o.recorded ? trendOf(catalogId, o.recorded.day - 1) : null,
    rank: saved ? rankOf(saved) : null,
    ...daySignals(saved, o.now),
    leftCents: o.leftCents,
    simulated: true,
  });
}

/** Each saved want's Read, by catalog id. */
export function wantReads(wants: readonly SavedWant[], rows: readonly LedgerEvent[], policy: Policy, catalog: Catalog, now: number): Record<string, GooseRead> {
  const left = totalLeft(rows, policy.shopperId);
  return Object.fromEntries(wants.filter((w) => catalog.has(w.catalogId)).map((w) => [w.catalogId, wantRead(w, catalog, policy, left, now)]));
}

/** Is this gift already paid for, by this shopper, since it went on the list, and not undone? A seeded row is the demo's
 *  own week, never theirs (seen on screen: a fresh list called the kettle "Bought"). */
function isBought(rows: readonly LedgerEvent[], w: SavedWant, shopperId: string): boolean {
  const mine = rows.filter((e) => e.shopperId === shopperId && e.actor === "paypal" && isShoppers(e));
  const refunded = new Set(mine.filter((e) => e.action === "refunded").map((e) => e.data?.captureId));
  return mine.some((e) => e.action === "captured" && e.data?.catalogId === w.catalogId && e.t >= w.at && !refunded.has(e.data?.captureId));
}

/** The year view's plan: each want's price today, from the best-trusted seller; a set-aside seller's price is never planned on. */
export function wantsYear(wants: readonly SavedWant[], rows: readonly LedgerEvent[], policy: Policy, catalog: Catalog, now: number): YearView {
  const left = totalLeft(rows, policy.shopperId);
  const gifts = wants.flatMap((w) => {
    const e = catalog.get(w.catalogId);
    if (!e) return [];
    const { seller, offer } = bestOffer(offersFor(w, BEAT_DAY));
    return [{ catalogId: w.catalogId, item: shownItem(e.item), rank: rankOf(w), category: e.category, priceCents: seller === "refuse" ? null : offer?.total ?? null, maxCents: wantMax(w, catalog, policy), neededBy: w.neededBy ?? null, bought: isBought(rows, w, policy.shopperId), buyNow: wantRead(w, catalog, policy, left, now).call === "BUY NOW" }];
  });
  return yearPlan(gifts, left, now);
}

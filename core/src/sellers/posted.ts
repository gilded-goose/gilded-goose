// Runs for moving items (restart notes §15B, part 2): a recorded curve's sellers on one simulated day, as haggle sellers.
// Each asks its posted total (fees and taxes in, `priceOn`) every round, whatever Goose bids: a box office, an inn or an
// airline posts a price, so Goose's job on these runs is to pick the cheapest honest seller under your limit on the
// simulated day's price, never to talk one down. A bid above the posted total still gets the posted total, so a cart is only ever the
// price on the listing. The seller's listing words are its note every round, so the Watcher reads on a run exactly what
// the price watch reads on Your wants (a gift card or "pay me on Zelle" refuses, never a deal).

import { categoryLimitFor, type Policy, type Want } from "../trust/policy.ts";
import { MOVING_ITEMS, priceOn, type MovingItem } from "./moving.ts";
import type { Seller, SellerOffer } from "./types.ts";

/** What an honest posted seller says, when its listing says nothing of its own. */
export const POSTED_NOTE = "Posted price, fees and taxes in.";

/** A posted seller never moves, so one round: the buyer takes the best honest total or walks, and no counter is ever shown. */
export const POSTED_ROUNDS = 1;

/** Every moving run says which simulated day its prices are, live or rule, so a recorded total never reads as a live one. */
export const postedNote = (day: number): string => `Prices are the posted totals on simulated day ${day + 1}, fees and taxes in (a fictional market).`;

/** The moving item a catalog id names, or undefined (the kettle and anything else shop the market as before). */
export const movingItem = (catalogId: string | undefined): MovingItem | undefined => MOVING_ITEMS.find((i) => i.id === catalogId);

/** Every seller listing `item` on `day` (`movingDay`, the day Your wants reads), as a haggle seller at its posted total. One not listing yet isn't there. */
export function postedSellers(item: MovingItem, day: number): Seller[] {
  return item.sellers.flatMap((s) => {
    const p = priceOn(s.curve, day);
    if (!p) return [];
    const offer = (round: number): SellerOffer => ({ sellerId: s.sellerId, merchant: s.name, item: item.item, price: p.total, currency: "USD", shape: "one-off", round, note: s.note || POSTED_NOTE });
    return [{ id: s.sellerId, merchant: s.name, history: s.history, open: offer, respond: (_bid, round) => offer(round) }];
  });
}

/**
 * A moving item's want: its own item and category, at this shopper's limit for that category (its own, else the smallest
 * set, as the guard reads it). The page's max is the kettle's, so it never sets this one. Decided by default; flip if
 * Joshua says: a max of the shopper's own per run.
 */
export function postedWant(item: MovingItem, policy: Policy, deadline: number): Want {
  return { item: item.item, category: item.category, maxPrice: categoryLimitFor(policy, item.category), currency: "USD", deadline, qty: 1 };
}

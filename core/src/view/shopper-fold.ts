// The shopper fold on its own (Track F, Nov 5): it reads the guard's own week, so the guard's whole library comes with it. Everything
// else in lanes.ts is read by pages that never run a rule on first load (classic), and one import there put 112 KB on them.

import { toCents } from "../money.ts";
import { dayOf, isShoppers, type LedgerEvent } from "../ledger/events.ts";
import type { Catalog } from "../trust/catalog.ts";
import { WEEK_MS, weekSpend } from "../trust/guard.ts";
import type { Policy } from "../trust/policy.ts";
import { dialPreview, fold, type Purchase, type ShopperFold } from "./lanes.ts";

/**
 * The one shopper fold (N19): the receipt, the week, the dial's counts and the grid rows, all from one shopper's rows,
 * so no surface keeps a number, a date or a row of its own (N6). Attack rows never reach the week, the receipt or the
 * dial. The judge box writes its rows to a throwaway ledger; "Try to trick Goose" (the Desk's slice 4) copies a trick's
 * rows into the session, so they reach `grid`, labeled, and nothing that counts (`weekCounts` leaves them out). Pure: `now`
 * is the caller's.
 */
export function shopperFold(rows: LedgerEvent[], policy: Policy, catalog: Catalog, now: number): ShopperFold {
  const purchases = rows.filter((e) => e.actor === "paypal" && e.action === "captured" && e.price !== undefined && e.source !== "attack").map((e): Purchase => ({
    seq: e.seq, source: e.source ?? null, day: e.day ?? dayOf(e.t), price: toCents(e.price!),
    catalogId: typeof e.data?.catalogId === "string" ? e.data.catalogId : null, color: typeof e.data?.color === "string" ? e.data.color : null, counts: isShoppers(e),
  }));
  const inWeek = new Set(rows.filter((e) => e.t > now - WEEK_MS).map((e) => e.seq));
  const categories = [...new Set([...catalog.values()].map((e) => e.category))];
  return {
    receipt: purchases.at(-1) ?? null,
    week: { from: dayOf(now - WEEK_MS + 1), to: dayOf(now), spent: weekSpend(rows, policy.shopperId, now), limit: policy.weeklyLimit, purchases: purchases.filter((p) => inWeek.has(p.seq)) },
    counts: Object.fromEntries(categories.map((c) => [c, dialPreview(rows, policy, c, catalog)])),
    grid: fold(rows),
  };
}

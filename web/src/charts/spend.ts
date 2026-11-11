// Spending against limits (Track D; Lead-9, Fri Oct 30 3:25 PM: "spending vs limits, per category, honest scale, from
// real ledger rows"). Pure: ledger rows and the server's fold in, the widget's data out, so the Behind the scenes page
// and an AG Studio widget draw the same numbers.
//
// What the limits are, read from the guard (trust/src/guard.ts, trust/src/policy.ts), decides the chart. A category's
// limit caps ONE cart (`categoryLimitFor`); only the weekly limit caps a total (any rolling 7 days, across every
// category). So each paid cart is drawn against its own category's limit, and the week's total against the weekly
// limit; adding a category's carts up against a per-cart limit would show a budget the code doesn't have.
//
// Which rows count: the shopper's own (`isShoppers`: the seeded week moved no money), each capture whose run wasn't
// refunded, the same rule as the ledger's totals row (`sessionTotals`). The week's total is never counted here (N19:
// the screen draws the guard's number from the server's fold, `ShopperFold["week"]`, never from rows of its own); with
// no fold, the week's row is left out and the words say so.

import { categoryLimitFor, demoCatalogItems, demoPolicy, fromCents, isShoppers, toCents, type Catalog, type Cents, type LedgerEvent, type Policy } from "@goose/core";
import { usd } from "@goose/core/money";

export interface SpendCart { cents: number; words: string }
export interface SpendCategory {
  /** The catalog's category, or "" for a cart that named no catalog entry (held to the strictest limit). */
  key: string;
  label: string;
  limitCents: number;
  limitWords: string;
  /** Each paid cart in this category, in the order paid. */
  carts: SpendCart[];
}
/** The server fold's week (`ShopperFold["week"]`, core/src/view/lanes.ts): the guard's own count and limit. */
export interface FoldWeek { from: number; to: number; spent: number; limit: number }
export interface SpendLimitsData {
  categories: SpendCategory[];
  /** Null without a fold. `openCents`: the part of the week's count no paid cart shows (refunded, or a capture still waiting on PayPal). */
  week: { cents: number; words: string; limitCents: number; limitWords: string; openCents: number; openWords: string } | null;
  /** One dollar scale for every row (the largest limit or cart), so a length means the same amount everywhere. */
  scaleCents: number;
  /** The widget's text alternative: every number it draws. */
  summary: string;
}

const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function spendLimits(events: readonly LedgerEvent[], fold: FoldWeek | null = null, policy: Policy = demoPolicy(), catalog: Catalog = demoCatalogItems()): SpendLimitsData {
  const own = events.filter(isShoppers);
  const refunded = new Set(own.filter((e) => e.actor === "paypal" && e.action === "refunded").map((e) => e.runId ?? ""));
  const paid = own.filter((e) => e.actor === "paypal" && e.action === "captured" && e.price !== undefined && !refunded.has(e.runId ?? ""));
  const byKey = new Map<string, SpendCategory>();
  for (const e of paid) {
    const id = e.data?.catalogId;
    const category = typeof id === "string" ? catalog.get(id)?.category : undefined;
    const key = category ?? "";
    let row = byKey.get(key);
    if (!row) {
      const limit = categoryLimitFor(policy, category);
      row = { key, label: category ? capFirst(category) : "No catalog category", limitCents: limit, limitWords: usd(limit), carts: [] };
      byKey.set(key, row);
    }
    const c = toCents(e.price!);
    row.carts.push({ cents: c, words: usd(c) });
  }
  const categories = [...byKey.values()];
  // What the guard counts this week that no paid cart in the week shows: a refunded run (a refund never frees room) or
  // a capture still waiting on PayPal. Said in words, so a refused "over your weekly limit" never meets a chart that
  // looks empty.
  const paidInWeek = fold ? paid.filter((e) => e.day !== undefined && e.day >= fold.from && e.day <= fold.to).reduce((t, e) => t + toCents(e.price!), 0) : 0;
  const openCents = fold ? Math.max(0, fold.spent - paidInWeek) : 0;
  const week = fold ? { cents: fold.spent, words: usd(fold.spent), limitCents: fold.limit, limitWords: usd(fold.limit), openCents, openWords: usd(openCents) } : null;
  const scaleCents = Math.max(week?.limitCents ?? 0, week?.cents ?? 0, ...categories.flatMap((r) => [r.limitCents, ...r.carts.map((c) => c.cents)]), 1);
  const open = week && week.openCents > 0 ? `, ${week.openWords} of it refunded or still waiting on PayPal: the guard counts that too` : "";
  const weekSaid = week ? `This week: ${week.words} counted against your ${week.limitWords} weekly limit${open}.` : "The weekly limit's count comes from the server and isn't shown here.";
  const summary = categories.length === 0 && (week?.cents ?? 0) === 0
    ? `Your first paid cart lands here, held to its category's limit${week ? ` and ${week.limitWords} in any 7 days` : ""}.`
    : [
        ...categories.map((r) => `${r.label}: ${r.carts.length === 1 ? `one cart, ${r.carts[0]!.words}` : `${r.carts.length} carts, ${r.carts.map((c) => c.words).join(", ")}`}, each against a limit of ${r.limitWords} a cart.`),
        weekSaid,
      ].join(" ");
  return { categories, week, scaleCents, summary };
}

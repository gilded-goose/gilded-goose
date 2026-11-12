// Goose shows your true priorities (wednesday-restart §17): an honest friend, not a gatekeeper. When a cart would eat into
// what the shopper said matters more (a "really want" still waiting), Goose says so in one line beside the cart, then does
// what she decides: Approve is the one-tap yes and "Not this one" the no, so the line never blocks, holds or refuses.
// - Only her own data: her wants and their priority (the two-value label), her Policy's weekly limit and the rolling
//   week's spend (F1's fold), and the cart's own catalog entry and price. Never seller text, never an AI opinion.
// - Fixed words that name the reason ("your … is still waiting"), never a judgment, never credit or borrowing (11B).
// - Her switch: Settings' "Show me tradeoffs", on by default (DemoShoppers `setTradeoffs`); off, there is no line.

import type { Catalog } from "../trust/catalog.ts";
import type { Policy } from "../trust/policy.ts";
import { fromCents, type Cents, usd, usdOf } from "../money.ts";
import { byPriority, wantMax, type SavedWant } from "./wants.ts";

/** Settings' switch, as the wallet shows it. */
export const TRADEOFFS_LABEL = "Show me tradeoffs";
export const TRADEOFFS_SAID = "When a buy would eat into a “Really want”, Goose says so in one line beside the cart. It never stops a buy.";

export interface TradeoffInput {
  /** The cart's catalog entry and total. */
  cart: { catalogId: string; price: Cents };
  /** This shopper's saved wants (DemoShoppers), oldest first. */
  wants: readonly SavedWant[];
  /** The rolling week from the shopper fold: spend so far and the weekly limit. */
  week: { spent: Cents; limit: Cents };
  catalog: Catalog;
  policy: Policy;
  /** Settings' "Show me tradeoffs". */
  on: boolean;
}

/** A catalog item said mid-sentence: no "(fictional)" tag (the page marks the catalog fictional) and a lower-case article. */
const midSentence = (item: string) => item.replace(" (fictional)", "").replace(/^(A|An|One|The) /, (w) => w.toLowerCase());

/** The want the line names, and the line, or null when nothing she ranked higher is in the way (or her switch is off). */
export function tradeoffLine(i: TradeoffInput): { catalogId: string; line: string } | null {
  if (!i.on) return null;
  // A cart she called a "really want" is what matters, so it is never weighed against another.
  if (i.wants.some((w) => w.catalogId === i.cart.catalogId && w.priority === "really")) return null;
  // Only a want this cart pushes out: one that fit in what the week had left before it and won't after. A want that
  // already didn't fit isn't this cart's doing, so the line never blames it (review: never more certain than the evidence).
  const before = Math.max(0, i.week.limit - i.week.spent);
  const after = Math.max(0, before - i.cart.price);
  const waiting = byPriority(i.wants).find((w) => {
    const max = wantMax(w, i.catalog, i.policy);
    return w.priority === "really" && w.catalogId !== i.cart.catalogId && max <= before && max > after;
  });
  const item = waiting && i.catalog.get(waiting.catalogId)?.item;
  if (!waiting || !item) return null;
  const max = fromCents(wantMax(waiting, i.catalog, i.policy));
  return {
    catalogId: waiting.catalogId,
    line: `Heads up: this ${usd(i.cart.price)} leaves ${usd(after)} of your ${usd(i.week.limit)} this week, and your “Really want”, ${midSentence(item)} (up to ${usdOf(max)}), is still waiting. Still want it?`,
  };
}

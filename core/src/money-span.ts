// Its own module so only the lazy real-prices panel ships it: money.ts sits in a chunk every route loads.
import { toCents, usd } from "./money.ts";

/**
 * A set of prices said as the range it is: "$75.00–$1,218.00", cheapest first, an en dash between two real prices (C's
 * panel, Nov 6: a recorded backpack set ran $75 to $1,218 and read as one random "what it costs"; Lead-12, Nov 6: "from
 * … to …" put the landing 3 words over P's pin, and a screen reader reads the dash as "to"). Null with fewer than two
 * different plain amounts. Claims row c3-span.
 */
export function usdSpan(amounts: readonly string[]): string | null {
  const ends = usdSpanEnds(amounts);
  return ends && `${ends[0]}–${ends[1]}`;
}

/**
 * The span's two ends, cheapest first, for a screen that draws the dash itself (RealPrices: the dash is CSS generated
 * content whose alternative text is "to", so a screen reader hears "$75.00 to $1,218.00" and the page's text adds no
 * word; Lead-12 and R, Nov 6). Null exactly when usdSpan is.
 */
export function usdSpanEnds(amounts: readonly string[]): readonly [string, string] | null {
  const c = amounts.filter((a) => /^\d+(\.\d{1,2})?$/.test(a)).map(toCents);
  if (c.length < 2) return null;
  const lo = Math.min(...c), hi = Math.max(...c);
  return lo === hi ? null : [usd(lo), usd(hi)];
}

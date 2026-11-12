// The PayPal card's one count (Track AS, slice 7; Round 2's data review): what these rows hold from PayPal, in words
// that never let the demo week's seed read as PayPal's. No React here, so `scripts/check-claims.ts` (row
// `as-paypal-week`) and `core/test/studio-paypal.test.ts` read the same function the card renders.

import type { LedgerRow } from "@goose/core/session";

/** The demo week's simulated row: core names it PayPal (the event it stands in for), the card calls it practice. */
export const isSeedRow = (r: LedgerRow): boolean => r.part === "week" && r.source === "seeded";

export interface PayPalCount {
  /** Rows PayPal itself wrote in a real run (its signed webhooks, the orders and captures it answered): never the seed. */
  real: number;
  /** Of those, the webhooks whose signature the server checked with PayPal (`LedgerRow.signed`). */
  signed: number;
  /** The demo week's simulated rows that name PayPal. */
  seed: number;
}

export function paypalCount(rows: readonly LedgerRow[]): PayPalCount {
  const paypal = rows.filter((r) => r.actor === "paypal");
  const seed = paypal.filter(isSeedRow).length;
  return { real: paypal.length - seed, signed: paypal.filter((r) => r.signed && !isSeedRow(r)).length, seed };
}

const rows = (n: number) => `${n} ${n === 1 ? "row" : "rows"}`;

/**
 * Three states. Empty: no PayPal row at all. Seed only (a browser that has asked nothing): "practice row (seeded),
 * none signed by PayPal", so 1 from the seed never reads as 1 from PayPal. A real run: PayPal's rows and how many it
 * signed, with the seed named apart.
 */
export function paypalCountWords(c: PayPalCount): string {
  if (c.real === 0 && c.seed === 0) return "No PayPal rows in these rows yet.";
  if (c.real === 0) return `In these rows: ${c.seed} practice ${c.seed === 1 ? "row" : "rows"} (seeded), none signed by PayPal.`;
  const seed = c.seed > 0 ? `, plus ${c.seed} practice ${c.seed === 1 ? "row" : "rows"} (seeded)` : "";
  return `In these rows: ${rows(c.real)} from PayPal, ${c.signed} signed by PayPal itself${seed}.`;
}

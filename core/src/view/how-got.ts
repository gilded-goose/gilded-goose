// How Goose got a price: it haggled, or it waited (Track H2; Joshua, Fri Oct 30 3:40 PM: the kettle's $10.27 "came
// from haggling, not waiting"). The verb is decided here, from the data, in one place, and every surface that says it
// asks this file, so a haggled deal is never called waited or the reverse:
// - haggled: Goose made at least one counter-offer to the seller it bought from, before it took the price;
// - waited: no counter-offer reached that seller, and its own price still fell (over the recorded days, or rounds);
// - null: the price isn't below the seller's first ask, so neither is said.
// Pure: no DOM, no clock; dependency-free so the first screen and the lazy chunks can import it for nothing.
// `scripts/check-claims.ts` (claims h2-kettle-haggled, h2-ticket-waited) re-derives both recorded deals through it.

import type { Cents } from "../money.ts";
import type { LedgerEvent } from "../ledger/events.ts";

export type HowGot = "haggled" | "waited";

export function howGooseGotIt(d: { firstAsk: Cents; price: Cents; counters: number }): HowGot | null {
  if (!(d.price < d.firstAsk)) return null;
  return d.counters > 0 ? "haggled" : "waited";
}

/**
 * Goose's counter-offers that reached one seller before row `beforeSeq`: Goose's own (`buyer counter`) and code's
 * (`code counter`, which replaced a proposal). A `propose-counter` that code replaced never reached the seller, so it
 * doesn't count; code's row that replaced it does.
 */
export function countersTo(rows: readonly LedgerEvent[], sellerId: string, beforeSeq: number): number {
  return rows.filter((e) => e.seq < beforeSeq && e.sellerId === sellerId && e.price !== undefined && e.action === "counter" && (e.actor === "buyer" || e.actor === "code")).length;
}

/** A run's deal: the seller's first ask, the price Goose got, and the counter-offers that seller saw before row `seq`. */
export function howInRun(rows: readonly LedgerEvent[], deal: { sellerId: string; seq: number; firstAsk: Cents; price: Cents }): HowGot | null {
  return howGooseGotIt({ firstAsk: deal.firstAsk, price: deal.price, counters: countersTo(rows, deal.sellerId, deal.seq) });
}

/**
 * A recorded price watch (`sellers/moving.ts`): one seller's own total by day, a curve no buyer move touches, so it
 * carries no counter-offer. Compares the first day it listed with `day` (0-based).
 */
export function howOverDays(byDay: readonly (Cents | number | null)[], day: number): HowGot | null {
  const first = byDay.find((c) => c !== null);
  const now = byDay[day];
  return first == null || now == null ? null : howGooseGotIt({ firstAsk: first as Cents, price: now as Cents, counters: 0 });
}

/** The words for each verb. `lead` sits before "$X below their $Y ask"; `did` is the plain sentence. */
export const GOT: Record<HowGot, { did: string; lead: string; whilst: string }> = {
  haggled: { did: "Goose haggled", lead: "Goose haggled it", whilst: "while Goose haggled" },
  waited: { did: "Goose waited", lead: "Goose waited for this price:", whilst: "while Goose waited" },
};

/** The words before "$X below their $Y ask", or null when neither verb is true. */
export const gotLead = (how: HowGot | null): string | null => (how ? GOT[how].lead : null);

/** ", while Goose waited" (or haggled) to end a sentence about a price that fell; nothing when neither is true. */
export const gotWhilst = (how: HowGot | null): string => (how ? `, ${GOT[how].whilst}` : "");

/** "Goose waited, and on" (or haggled) before "day N the total came in…"; a plain "On" when neither is true. */
export const gotAndOn = (how: HowGot | null): string => (how ? `${GOT[how].did}, and on` : "On");

/** The week story's fact line: how far the price fell, and how. Waiting says the price moved by itself. */
export function fellSentence(how: HowGot | null, fellWords: string): string {
  if (how === "waited") return `the price fell ${fellWords} while Goose waited. That's the price moving, not haggling.`;
  if (how === "haggled") return `the price fell ${fellWords} while Goose haggled.`;
  return "the price hasn't fallen.";
}

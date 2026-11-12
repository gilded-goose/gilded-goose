// The ladder's words and its default market, apart from the ladder itself. The wants card and the shelf need these on
// the first screen; the ladder's walk (it runs the Watcher over a market) loads with the first Ask. One constant here
// used to pull 4.6 KB onto classic and the wallet (Track F).

import { isDemoWeek } from "../scenario.ts";
import type { Flag } from "../trust/watch.ts";

/**
 * A refusal said back in one short clause (Joshua, Thu Oct 29: "QuickQuack was refused: it asked for a gift card"):
 * fixed words per rule, never the seller's, a payment ask first since it's what a shopper can check. The card keeps
 * the Watcher's whole sentence.
 */
const REFUSED_FOR: [rule: string, said: string][] = [
  ["gift-card", "it asked for a gift card"], ["off-paypal", "it asked to be paid off PayPal"],
  ["instructs-agent", "it tried to instruct Goose"], ["writes-memory", "it tried to rewrite Goose's memory"],
  ["claims-shipped", "it said it already shipped, to get paid first"], ["overpay-refund", "it asked you to overpay and promised the rest back"],
  ["ai-reader", "the AI reader found an attack in its note"],
];
export function refusedFor(flags: readonly Flag[]): string {
  const refusing = new Set(flags.filter((f) => f.severity === "refuse").map((f) => f.rule as string));
  return REFUSED_FOR.find(([rule]) => refusing.has(rule))?.[1] ?? "its note broke a rule";
}

/** 9.1's wording, never "won't pay any way PayPal can't protect you": Goose can't tell whether a purchase qualifies. */
export const ONLY_CHECKOUT = "Payment only goes through PayPal checkout; other ways to pay are refused.";

/** The market the page shows (a recorded week, or a fresh market's seed) and Goose's own deal there, if it bound one. */
export interface LadderMarket { seed: number; deal: { merchant: string; total: string } | null }

/**
 * With no run on screen: the recorded $55 beat's week (§12C, 021 decision 2). Its recorded run binds nothing, since no
 * seller with a record gets under the $60 max (core/test/ladder.test.ts checks the tape). Decided by default.
 */
export const LADDER_BEAT: LadderMarket = { seed: 3, deal: null };

/** A recorded market as the screen names it: a demo week, or a numbered market. */
export const marketName = (seed: number) => (isDemoWeek(seed) ? `simulated week ${seed}` : `market #${seed}`);

// The set-aside pile (Joshua, Thu Nov 5 1:30 PM, §1a): every Find, Snap and Watching result says what Goose checked and
// what it refused, beside what it found: "Checked N listings. Set aside M:", each with its reason, then the pick. Real
// counts only: N is the listings that result compared, M the ones the Watcher refused among them.
//
// Decided by default (flip if Joshua says): M counts the Watcher's refusals only, the same verdict the board's "set
// aside" counter, the Desk's rows and the ladder's refused strip use. A held seller (it waits for the shopper's yes) and
// one over her limit aren't set aside, so they aren't in M. Joshua also named a far-below-market flag: there is no such
// rule in the Watcher, so no pile names one; adding one is a Watcher change for Q, not words.

/**
 * The pile's count line. No listings is said as such, never as "nothing set aside" (the Lead's question). `color` names
 * the color a count was filtered to, so a want card's "2 black listings" never reads as fewer than the ladder's 3 of
 * every color (Lead-12, Nov 5: scope each count in words). Colors come from the catalog's own list, never typed words.
 */
export function pileHead(checked: number, aside: number, color?: string): string {
  if (checked <= 0) return "No listings to check.";
  const kind = color ? `${color} listing` : "listing";
  return `Checked ${checked} ${kind}${checked === 1 ? "" : "s"}. ${aside > 0 ? `Set aside ${aside}:` : "Nothing set aside."}`;
}

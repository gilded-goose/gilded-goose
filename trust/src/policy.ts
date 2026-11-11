// ADR 0004: limits live in a Policy object per shopper and are passed in, never
// imported as constants. This is what "the most any cart can cost right now"
// reads from, and what the spend guard enforces.

import type { Source } from "./events.ts";
import type { Cents } from "./money.ts";

export type DialSetting = "ask-first" | "buy-within-limits";

export interface Want {
  /** What the shopper asked for, in their words. */
  item: string;
  category: string;
  maxPrice: Cents;
  currency: "USD";
  /** Simulated deadline in ms (clock time). */
  deadline: number;
  qty: number;
}

export interface Policy {
  shopperId: string;
  /** Hard ceiling per purchase, whatever the want says. */
  perPurchaseCap: Cents;
  /**
   * The most one cart may cost, per catalog category (N9, N18). Settings writes it (`setCategoryLimit`); the guard,
   * `worstCase` and the dial read it. No want, chip or typed max can raise it.
   */
  categoryLimit: Record<string, Cents>;
  /** The most carts can cost in any rolling 7 days, all together, across every category (N4). */
  weeklyLimit: Cents;
  /** Dial per category. Missing category = "ask-first". */
  dial: Record<string, DialSetting>;
  /**
   * Clock time of each category's last limit raise (`setCategoryLimit`): its record counts clean carts only after it,
   * since carts kept under a smaller limit say nothing about a bigger one. Missing category = the whole ledger counts.
   */
  recordSince: Record<string, number>;
  /**
   * Clock time each category's dial was turned on (`grantDial`). A bad pick that still stands, at or after it, turns that
   * dial back (core's `settleDial`). Missing on a dial that's on: any standing bad pick turns it back.
   */
  dialSince?: Record<string, number>;
  /** Payment shapes the dial may ever cover on its own. Recurring/deferred is never here. */
  oneOffOnly: true;
}

export function dialFor(policy: Policy, category: string): DialSetting {
  return policy.dial[category] ?? "ask-first";
}

/** A strong record (PROFILE, Definitions): clean carts in a category before the dial may buy within its limit. */
export const STRONG_RECORD = 3;

/**
 * Which rows' captures are clean carts toward the dial (Joshua's answer 2, 021, Wed Oct 28): only real, separate
 * purchases. A recorded run replayed (the wallet's week, or a run the caps turned into a recording) pays for a cart an
 * earlier haggle made, so however often it is paid it earns no trust; it still counts as money out for the week
 * (`weekSpend`). Seeded and attack rows never count (N19). A market cart (PayPal additions 5) is money out too, but
 * no haggle chose it: a few taps on a fixed shelf must never turn the dial on (Sonnet review, Oct 29). A Record, so a
 * new source can't be added without deciding this. A row with no source (written before F1, or by one run's own ledger)
 * is the shopper's, as `isShoppers` reads it.
 */
export const COUNTS_TOWARD_RECORD: Readonly<Record<Source, boolean>> = { seeded: false, recorded: false, live: true, market: false, attack: false, ask: false };
export const countsTowardRecord = (source: Source | undefined): boolean => source === undefined || COUNTS_TOWARD_RECORD[source];

/**
 * The most one cart in this category may cost: its limit, never above the per-purchase cap. No category (a cart that
 * names no catalog entry), or one Settings never set: the strictest limit the shopper has, never a looser one.
 */
export function categoryLimitFor(policy: Policy, category: string | undefined): Cents {
  const set = category !== undefined && Object.hasOwn(policy.categoryLimit, category) ? policy.categoryLimit[category] : undefined;
  return Math.min(policy.perPurchaseCap, set ?? Math.min(...Object.values(policy.categoryLimit)));
}

/**
 * Undo (QUEUE M3 slot 2: "Undo is a bad pick and turns the dial back"): a purchase the shopper took back turns its
 * category's dial back to "ask me first" and starts that category's record again from `at`, as a limit raise does. It
 * only ever turns the dial down: no limit changes. Returns a new Policy; the old one is untouched.
 */
export function turnBack(policy: Policy, category: string, at: number): Policy {
  return { ...policy, dial: { ...policy.dial, [category]: "ask-first" }, recordSince: { ...policy.recordSince, [category]: at } };
}

/**
 * Settings, by the shopper's one tap at clock time `at` (PROFILE: the dial "can be turned to 'buy within my limits' per
 * category only after a strong record"): `clean` is the record the ledger shows (core's `dialPreview`), never a typed
 * number, and under STRONG_RECORD this throws and nothing changes. No limit changes, and the guard still binds the exact
 * cart for the shopper's one tap in PayPal. Returns a new Policy; the old one is untouched.
 */
export function grantDial(policy: Policy, category: string, clean: number, at: number): Policy {
  if (!(clean >= STRONG_RECORD)) throw new Error(`the dial turns on after ${STRONG_RECORD} clean carts; this category has ${clean}`);
  return { ...policy, dial: { ...policy.dial, [category]: "buy-within-limits" }, dialSince: { ...policy.dialSince, [category]: at } };
}

/**
 * Settings' one tap back to "ask me first" (QUEUE M3: "turned back in one tap in Settings"). Turning it back yourself is
 * not a bad pick, so the record stands and one tap turns it on again. Returns a new Policy; the old one is untouched.
 */
export function askFirst(policy: Policy, category: string): Policy {
  return { ...policy, dial: { ...policy.dial, [category]: "ask-first" } };
}

/**
 * Settings, by a tap at clock time `at`: a new limit for one category. A raise resets that category's dial to "ask me
 * first" and starts its record again from `at`, because trust earned under a smaller limit doesn't carry to a bigger
 * one (N9). Returns a new Policy; the old one is untouched.
 */
export function setCategoryLimit(policy: Policy, category: string, limit: Cents, at: number): Policy {
  const raised = limit > categoryLimitFor(policy, category);
  return {
    ...policy,
    categoryLimit: { ...policy.categoryLimit, [category]: limit },
    dial: raised ? { ...policy.dial, [category]: "ask-first" } : policy.dial,
    recordSince: raised ? { ...policy.recordSince, [category]: at } : policy.recordSince,
  };
}

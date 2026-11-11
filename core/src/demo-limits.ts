// The demo's limits and the categories they name, apart from scenario.ts (Track F): the menu's limits line needs these
// few numbers, and reaching them through scenario.ts put the guard and all of the Watcher's rules (109 KB) on every page
// with a menu. Pure, no imports but money.
import { toCents, type Cents } from "./money.ts";

export const DEMO_CATEGORY = "kitchen";
/** The ticket's category (MOVING_ITEMS' Marsh Lights ticket): the demo's second locked limit. core/test/shelf.test.ts holds them equal. */
export const DEMO_EVENTS = "events";
/** The travel category (the hotel night and the flight seat): a demo limit since Desk-L, so the $96 flight is approvable. */
export const DEMO_TRAVEL = "travel";
/** The clothing category (the two jackets): a demo limit since Desk-L. */
export const DEMO_CLOTHING = "clothing";
/**
 * A made-up market's ask that code's keyword table can't place (`marketCategory`): its own category, never a catalog
 * one, so no Settings row and no catalog entry names it.
 */
export const DEMO_OTHER = "other";
/**
 * Every limit this demo sets, each shown as "Set for this demo". Decided by default (Desk-L, Fri Oct 30): travel $100.00
 * and clothing $70.00 (the numbers Desk-A's mock shows), other $150.00 (Joshua's example). The kitchen's $60.00 stays the
 * strictest, so a cart that names no category is still held to it.
 */
export const DEMO_LIMITS: Readonly<Record<string, Cents>> = Object.freeze({
  [DEMO_CATEGORY]: toCents("60.00"), [DEMO_EVENTS]: toCents("90.00"), [DEMO_TRAVEL]: toCents("100.00"), [DEMO_CLOTHING]: toCents("70.00"), [DEMO_OTHER]: toCents("150.00"),
});

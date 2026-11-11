// "After you pay" (Joshua, Fri Oct 30, item 1: "After you pay: tracking, refunds, 'if it never arrives'"), as one place
// on the Desk: the paid card, and the room the menu and the tour open. It reads one run as the server's run
// view says it stands (`GET /api/runs/:id`) and says only what that view holds:
//   - Tracking: the ledger's shipping row (core/src/shipping.ts), written once PayPal answers the seller's tracking.
//     It is staged (a fictional seller, our made-up number), and the words say so every time.
//   - Undo: the run's `undo` state (open until a time, refunded, or none), and whether this tab holds the undo key.
//   - If it never arrives: PayPal's disputes page and what PayPal lists (core/src/disputes.ts). Goose never opens,
//     answers or settles a dispute.
// No promise about timing, amounts or outcomes beyond what the run view holds.

import { NEVER_ARRIVES } from "../disputes.ts";
import { SHIP_CARRIER } from "../shipping.ts";
import { parseUndoState, type UndoState } from "./wallet.ts";
import { usdOf } from "../money.ts";

export { DISPUTE_URL, NEVER_ARRIVES } from "../disputes.ts";

export const AFTER_TITLE = "After you pay";
export const AFTER_EMPTY = "Nothing paid in this tab yet. Once you approve a cart in PayPal, its tracking, Undo and the way to PayPal's disputes are here.";

/** What each part does, said once; shown with the purchase and on their own before one. */
export const AFTER_PARTS = {
  tracking: { name: "Tracking", does: "The fictional seller gives PayPal a tracking number, and this shows what PayPal holds. It's staged: nothing physical ships." },
  undo: { name: "Undo", does: "Refunds the payment through PayPal, from the tab that paid, while its window is open. The closing time shows here." },
  never: { name: "If it never arrives", does: NEVER_ARRIVES },
} as const;

/** One ledger row as the run view sends it: only the fields this reads. */
export interface AfterRow { action: string; why?: string; data?: Record<string, unknown> }
/** The run view's fields this reads (server `view()`): anything missing or malformed reads as "not paid". */
export interface AfterRunView { settled?: unknown; bound?: unknown; undo?: unknown; events?: unknown; payment?: unknown }

export type Tracking =
  | { kind: "waiting" }
  | { kind: "held"; number: string; carrier: string; status: string | null }
  | { kind: "unconfirmed"; why: string };
export type Refund =
  | { kind: "open"; until: number; here: boolean }
  | { kind: "refunded" }
  | { kind: "closed" };
export interface AfterView { paid: true; total: string | null; item: string | null; merchant: string | null; tracking: Tracking; refund: Refund; sandbox: boolean }

const STATUS: Record<string, string> = { SHIPPED: "shipped", DELIVERED: "delivered", ON_HOLD: "on hold", CANCELLED: "cancelled" };
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** The tracking line's status, in PayPal's documented words; null when PayPal named none. */
export const statusWords = (s: string | null): string | null => (s && STATUS[s]) ?? null;

/**
 * The run, after paying, or null when it isn't a paid run (nothing captured, a refusal, or a view this can't read).
 * `hasKey`: this tab holds the run's undo key (sessionStorage), the only place Undo works from.
 */
export function afterView(v: AfterRunView | null, hasKey: boolean): AfterView | null {
  if (!v || typeof v !== "object") return null;
  const settled = v.settled as { ok?: unknown } | null | undefined;
  if (!settled || settled.ok !== true) return null;
  const bound = (typeof v.bound === "object" && v.bound !== null ? v.bound : {}) as Record<string, unknown>;
  const rows = (Array.isArray(v.events) ? v.events : []) as AfterRow[];
  // The latest shipping row wins; a "shipped" row is held by PayPal, "ship-unconfirmed" says why not, in core's words.
  const ship = [...rows].reverse().find((r) => r && (r.action === "shipped" || r.action === "ship-unconfirmed"));
  const tracking: Tracking = !ship ? { kind: "waiting" }
    : ship.action === "shipped" && str(ship.data?.trackingNumber) ? { kind: "held", number: str(ship.data!.trackingNumber)!, carrier: str(ship.data!.carrier) ?? SHIP_CARRIER, status: str(ship.data!.status) }
    : { kind: "unconfirmed", why: str(ship.why) ?? "PayPal hasn't confirmed the seller's tracking for this purchase." };
  const u: UndoState = parseUndoState(v.undo);
  const refund: Refund = u.state === "refunded" ? { kind: "refunded" } : u.state === "open" ? { kind: "open", until: u.until, here: hasKey } : { kind: "closed" };
  return { paid: true, total: str(bound.total), item: str(bound.item), merchant: str(bound.merchant), tracking, refund, sandbox: v.payment === "sandbox" };
}

/** The words for a refund's state; the button itself is the page's. */
export function refundWords(r: Refund, total: string | null, clock: string | null): string {
  const amount = total ? `${usdOf(total)}` : "the payment";
  if (r.kind === "refunded") return `Refunded: ${amount} back through PayPal.`;
  if (r.kind === "closed") return "The undo window has closed on this purchase. Nothing was refunded.";
  if (!r.here) return "Undo works only from the tab that approved this cart.";
  return clock ? `Open until ${clock}, from this tab.` : "Open now, from this tab.";
}

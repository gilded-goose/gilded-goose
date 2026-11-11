// PayPal additions 2 (Joshua, Oct 29): "if it never arrives", the shopper's way to PayPal's own dispute, and what PayPal
// shows on this purchase, read through the Agent Toolkit (list_disputes, filtered by the capture id). Goose never opens,
// answers or settles a dispute: PayPal decides it. So the row has no verdict, no fold reads it, and it moves no count.
import type { NewEvent } from "./ledger/events.ts";

/** PayPal's own disputes page (Resolution Center), by environment: where "if it never arrives" sends the shopper. */
export const DISPUTE_URL = { sandbox: "https://www.sandbox.paypal.com/disputes/", live: "https://www.paypal.com/disputes/" } as const;

/** The words under "If it never arrives" on a paid purchase: where to go, and who decides. No promise about timing, amounts or outcomes. */
export const NEVER_ARRIVES = "Open a dispute with PayPal. PayPal decides it; this demo can't open, answer or settle one for you.";

/** Every dispute row ends with this: a dispute is PayPal's process, not a verdict here. */
export const DISPUTE_IS_PAYPALS = "A dispute is PayPal's to decide: it doesn't change any count here.";

/** One dispute as the adapter reads it (`DisputeReply`): PayPal's documented words we name, or null; never its text. */
export interface Dispute {
  status: "OPEN" | "WAITING_FOR_BUYER_RESPONSE" | "WAITING_FOR_SELLER_RESPONSE" | "UNDER_REVIEW" | "RESOLVED" | null;
  reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED" | "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED" | null;
}

const STATUS: Record<NonNullable<Dispute["status"]>, string> = {
  OPEN: "open", WAITING_FOR_BUYER_RESPONSE: "waiting on the buyer", WAITING_FOR_SELLER_RESPONSE: "waiting on the seller", UNDER_REVIEW: "under PayPal's review", RESOLVED: "resolved",
};
const REASON: Record<NonNullable<Dispute["reason"]>, string> = { MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "item not received", MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "item not as described" };
const said = (d: Dispute) => `${d.reason ? REASON[d.reason] : "another reason"}, ${d.status ? STATUS[d.status] : "status not shown"}`;

/**
 * The row for one look at PayPal's disputes on a capture, saying only what the code saw. `replies` null: the Toolkit call
 * threw, so nothing is claimed either way. An empty list: said as PayPal's list, as this demo's account sees it. Otherwise the first unresolved dispute (or
 * the first, when all are resolved) in PayPal's documented words, and how many there are.
 */
export function disputeRow(t: number, shopperId: string, sellerId: string | undefined, captureId: string, replies: readonly Dispute[] | null): NewEvent {
  const base = { t, shopperId, visibility: "owner" as const, actor: "paypal" as const, layer: 3 as const, ...(sellerId ? { sellerId } : {}) };
  if (!replies) return { ...base, action: "dispute-unchecked", why: `We couldn't ask PayPal about disputes on this purchase: the call didn't answer. ${DISPUTE_IS_PAYPALS}`, data: { captureId } };
  if (replies.length === 0) return { ...base, action: "dispute-none", why: `PayPal's dispute list for this purchase came back empty, as this demo's seller account sees it. ${DISPUTE_IS_PAYPALS}`, data: { captureId, disputes: 0 } };
  // Open only on a status PayPal names as open; one we can't read is "listed", never called open or resolved.
  const open = replies.find((d) => d.status !== null && d.status !== "RESOLVED");
  const first = open ?? replies.find((d) => d.status === null) ?? replies[0]!;
  const more = replies.length > 1 ? ` (${replies.length} disputes in all)` : "";
  return {
    ...base, action: open ? "dispute-open" : first.status === null ? "dispute-listed" : "dispute-resolved",
    why: `PayPal shows a dispute on this purchase: ${said(first)}${more}. ${DISPUTE_IS_PAYPALS}`,
    data: { captureId, disputes: replies.length, ...(first.status ? { status: first.status } : {}), ...(first.reason ? { reason: first.reason } : {}) },
  };
}

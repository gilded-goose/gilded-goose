// PayPal additions 3 (Joshua, Oct 29): reconcile. PayPal's own transaction report (the Agent Toolkit's
// list_transactions) is read against what this ledger recorded for one capture: "PayPal agrees", or a red row when they
// differ. It reads; it never moves money. No verdict on any row, so no count moves: a red "differs" row is loud on screen
// (its own tone), not a refusal.
import type { NewEvent } from "./ledger/events.ts";
import { usdOf } from "./money.ts";

/** What PayPal's report says of one capture, as the adapter reads it (`ReportReply`): never PayPal's text. */
export interface Reported { listed: boolean; amount: string | null; currency: string | null; complete: boolean }

/** An amount in words: a dollar sign only for US dollars, so euros never read as "$47.73 EUR". */
const said = (amount: string, currency: string): string => (currency === "USD" ? `${usdOf(amount)} USD` : `${amount} ${currency}`);

/** Every reconcile row ends with this: a check that reads PayPal's report, not a payment. */
export const RECONCILE_READS = "This check only reads PayPal's report: it moves no money and changes no count.";

/**
 * The row for one look at PayPal's report for a capture, against the amount this ledger recorded for it. `reply` null:
 * the report couldn't be read (no answer, or PayPal refused this app), so nothing is checked. Not listed: only from a
 * complete page, and said as "yet" (PayPal's report can lag). Listed: agrees only when both amount and currency match.
 */
export function reconcileRow(t: number, shopperId: string, sellerId: string | undefined, captureId: string, recorded: { price: string; currency: string }, reply: Reported | null): NewEvent {
  const base = { t, shopperId, visibility: "owner" as const, actor: "paypal" as const, layer: 3 as const, ...(sellerId ? { sellerId } : {}) };
  const ours = said(recorded.price, recorded.currency);
  // An amount or currency we couldn't read is no answer: unchecked, never a red "differs" (P-3 review).
  if (!reply || (!reply.listed && !reply.complete) || (reply.listed && (!reply.amount || !reply.currency))) {
    return { ...base, action: "reconcile-unchecked", why: `We couldn't read PayPal's transaction report for capture ${captureId}, so this ledger's ${ours} isn't checked against it. ${RECONCILE_READS}`, data: { captureId } };
  }
  if (!reply.listed) {
    return { ...base, action: "reconcile-pending", why: `PayPal's transaction report doesn't list capture ${captureId} yet (the report can lag), so this ledger's ${ours} isn't checked against it. ${RECONCILE_READS}`, data: { captureId } };
  }
  const theirs = said(reply.amount!, reply.currency!);
  const data = { captureId, recorded: recorded.price, recordedCurrency: recorded.currency, ...(reply.amount ? { reported: reply.amount } : {}), ...(reply.currency ? { reportedCurrency: reply.currency } : {}) };
  if (reply.amount === recorded.price && reply.currency === recorded.currency) {
    // No price on the row: a read is not a charge, so the ledger's Amount column stays empty (P-3 review).
    return { ...base, action: "reconcile-agrees", why: `PayPal agrees: its transaction report lists capture ${captureId} for ${ours}, the amount this ledger recorded. ${RECONCILE_READS}`, data };
  }
  return { ...base, action: "reconcile-differs", why: `PayPal's record differs: its transaction report lists capture ${captureId} for ${theirs}; this ledger recorded ${ours}. ${RECONCILE_READS}`, data: { ...data, matched: false } };
}

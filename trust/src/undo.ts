// Undo (018 N12, H2): a paid run's money goes back. The capture id is the server's own, from its settle; nothing a
// request carries can name one, because `undoRun` takes no request at all. The caller checks the run's undo key first
// (by run id and secret). PayPal's idempotency key is fixed per run (`refundRequestId`), so a retry, a second press or
// two presses at once refund at most once. Undo as a bad pick that turns the dial back (`turnBack`, `isBadPick`), the
// wallet's Undo button and its "Undone" week are in the server route and core's wallet view (QUEUE M3 slot 2).

import { fromCents } from "./money.ts";
import type { LedgerStore } from "./events.ts";
import type { BoundCart } from "./cart.ts";
import type { PaymentPort } from "./guard.ts";

/** The one PayPal-Request-Id a run's refund is ever sent with. */
export const refundRequestId = (runId: string): string => `goose-refund-${runId}`;
/**
 * The PayPal-Request-Id for creating a bound cart's order (H2 review): fixed by the cart's hash (which carries its own
 * nonce and expiry, so no two carts share one), so a create that timed out and a second press retries gets PayPal's
 * same order back instead of a second one.
 */
export const orderRequestId = (hash: string): string => `goose-order-${hash}`;

export type UndoAnswer =
  | { ok: true; refundId: string; captureId: string }
  | { ok: false; code: "not-paid" | "no-capture-id" | "no-refunds" | "refund-failed"; reason: string };

/** What Undo reads and writes on a run, all of it server-held. */
export interface Undoable {
  readonly id: string;
  readonly bound?: BoundCart;
  /** The run's settle, as the server recorded it: the only place a capture id comes from. */
  readonly settled?: { ok: boolean; captureId?: string };
  /** The refund once it worked: a later Undo answers this and calls nothing. */
  refund?: Extract<UndoAnswer, { ok: true }>;
  /** The refund in flight: a second Undo waits for it instead of sending its own. */
  refunding?: Promise<UndoAnswer> | undefined;
}

/** Refund a paid run's own capture, at most once. Fixed words only: PayPal's error text never reaches a row (Lesson 15). */
/** `log` gets the port's own error text, for the server log only. */
export async function undoRun(run: Undoable, port: PaymentPort | null, ledger: LedgerStore, now: () => number, shopperId: string, log: (m: string) => void = () => {}): Promise<UndoAnswer> {
  if (run.refund) return run.refund;
  if (run.refunding) return run.refunding;
  // Joshua's answer (Wed Oct 28): a capture for another amount than you approved (capture-mismatch) was never paid, but
  // its money moved, so Undo refunds it too, at what PayPal took. Its capture id is the guard's own row, never a request's.
  const wrong = run.bound && run.settled && !run.settled.ok
    ? ledger.read().filter((e) => e.actor === "paypal" && e.action === "capture-mismatch" && e.data?.hash === run.bound!.hash && typeof e.data?.captureId === "string" && e.data.captureId !== "").at(-1)
    : undefined;
  if (!run.bound || !(run.settled?.ok || wrong)) return { ok: false, code: "not-paid", reason: "Nothing was paid on this run, so there is nothing to undo." };
  const captureId = wrong ? String(wrong.data!.captureId) : run.settled!.captureId;
  if (!captureId) return { ok: false, code: "no-capture-id", reason: "PayPal's reply to the capture was lost, so its capture id isn't known here; refund it in the PayPal sandbox." };
  if (!port?.refund) return { ok: false, code: "no-refunds", reason: "Refunds aren't connected on this server, so nothing was refunded." };
  const refund = port.refund.bind(port);
  const cart = run.bound.cart;
  const requestId = refundRequestId(run.id);
  const price = wrong?.price ?? fromCents(cart.price);
  const currency = wrong?.currency ?? cart.currency;
  const money = currency === "USD" ? `$${price}` : `${price} ${currency}`;
  const base = { shopperId, visibility: "owner" as const, actor: "paypal" as const, layer: 3 as const, price, currency, sellerId: cart.sellerId };
  run.refunding = (async (): Promise<UndoAnswer> => {
    try {
      const r = await refund(captureId, requestId);
      ledger.append({ ...base, t: now(), action: "refunded", verdict: "ok", why: `Undone: refund ${r.refundId} sent for capture ${captureId}, ${money} back.`, data: { captureId, refundId: r.refundId, requestId } });
      run.refund = { ok: true, refundId: r.refundId, captureId };
      return run.refund;
    } catch (e) {
      log(`run ${run.id}: refund failed: ${e instanceof Error ? e.message : String(e)}`);
      ledger.append({ ...base, t: now(), action: "refund-failed", verdict: "refused", why: "The refund didn't go through, so the payment stands. Undo again to retry: the same refund is asked for, never a second one.", data: { captureId, requestId } });
      return { ok: false, code: "refund-failed", reason: "The refund didn't go through, so the payment stands. Try Undo again." };
    }
  })().finally(() => { run.refunding = undefined; });
  return run.refunding;
}

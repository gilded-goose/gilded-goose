// PayPal additions 1 (Joshua, Oct 29): after a paid capture the fictional seller ships, and its tracking goes to PayPal
// through the Agent Toolkit (create_shipment_tracking, read back with get_shipment_tracking). The ledger gets one row
// saying what PayPal holds. It is the seller's word, so it is never a verdict: no fold reads it, and it clears nothing.
import type { Hasher } from "./deps.ts";
import type { NewEvent } from "./ledger/events.ts";

/** The carrier the fictional seller names: one PayPal documents, so the tracker is a well-formed one. */
export const SHIP_CARRIER = "USPS";

/** The fictional seller's tracking number for a capture: ours, made from the capture id, letters and digits only. */
export const trackingFor = (captureId: string, hash: Hasher): string => `GG${hash(`ship:${captureId}`).slice(0, 18).toUpperCase()}`;

/** What PayPal said it holds, as the adapter reads it back (`ShipmentReply`): never PayPal's text. */
export interface Shipped { held: boolean; status: "SHIPPED" | "ON_HOLD" | "DELIVERED" | "CANCELLED" | null }

const AS: Record<NonNullable<Shipped["status"]>, string> = { SHIPPED: "shipped", ON_HOLD: "on hold", DELIVERED: "delivered", CANCELLED: "cancelled" };

/** Every shipping row ends with this: tracking is a seller's claim, and no warning on the cart is lifted by it. */
export const SHIP_CLEARS_NOTHING = "Tracking is the seller's word: it doesn't clear any warning on this cart.";

/** Staged, like the price swap: the seller is fictional and the tracking number is ours, so nothing physical ships. */
export const SHIP_STAGED = "staged by this demo: a made-up tracking number from a fictional seller, nothing physical ships";

/**
 * The row for one capture's tracking, saying only what the code saw. `reply` null: a Toolkit call threw, so nothing is
 * claimed about PayPal either way. Not held: PayPal's read-back didn't list it (maybe not yet). Held: PayPal listed it,
 * and a status other than shipped or delivered is said as PayPal's, never as "shipped". No verdict on any row, so no
 * count (paid, refused, record, bad pick) ever moves because a seller says it shipped.
 */
export function shippedRow(t: number, shopperId: string, sellerId: string | undefined, captureId: string, trackingNumber: string, reply: Shipped | null): NewEvent {
  const base = { t, shopperId, visibility: "owner" as const, actor: "paypal" as const, layer: 3 as const, ...(sellerId ? { sellerId } : {}) };
  const data = { captureId, trackingNumber, carrier: SHIP_CARRIER, ...(reply?.status ? { status: reply.status } : {}) };
  const unconfirmed = (said: string): NewEvent => ({ ...base, action: "ship-unconfirmed", why: `${said} (${SHIP_STAGED}). ${SHIP_CLEARS_NOTHING}`, data });
  if (!reply) return unconfirmed(`We couldn't confirm the seller's tracking ${trackingNumber} with PayPal: the call didn't answer`);
  if (!reply.held) return unconfirmed(`PayPal's read-back doesn't list the seller's tracking ${trackingNumber} for this purchase yet`);
  if (reply.status === "ON_HOLD" || reply.status === "CANCELLED") return unconfirmed(`PayPal holds the seller's tracking ${trackingNumber} (${SHIP_CARRIER}), marked ${AS[reply.status]}`);
  const as = reply.status ? `, marked ${AS[reply.status]}` : "";
  return { ...base, action: "shipped", why: `Shipped (${SHIP_STAGED}): PayPal holds the seller's tracking ${trackingNumber} (${SHIP_CARRIER})${as} for this purchase. ${SHIP_CLEARS_NOTHING}`, data };
}

// For merchants (Track F, Nov 6; Q's nit): which of PayPal's listed events is the recorded order's capture event. Pure,
// so a test feeds it another cart's event. `pnpm e2e:settle` (e2e-sandbox.ts `captureEvent`) reads the list; this picks.
import { readWebhook, webhookMatches } from "@goose/core";
import type { RecordedOrder } from "@goose/core/merchants";

/** The cart the event must name: its PayPal order, its capture and its bound hash (PayPal's custom_id). */
export interface CaptureCart { orderId: string; captureId: string; hash: string }

/** PayPal's PAYMENT.CAPTURE.COMPLETED for exactly this capture of this cart, or null: another cart's, another capture's
 *  or a hash-less event is never this order's. `now` dates an event PayPal listed without a create_time. */
export function listedCaptureEvent(list: readonly unknown[], cart: CaptureCart, now = () => new Date().toISOString()): RecordedOrder["event"] {
  for (const raw of list) {
    const read = readWebhook(raw);
    if (!read.ok || read.facts.kind !== "capture-completed") continue;
    const f = read.facts;
    // custom_id is required here, not only matched when present (webhookMatches lets a missing one through).
    if (f.resourceId !== cart.captureId || f.customId !== cart.hash || !webhookMatches(f, cart)) continue;
    const at = (raw as { create_time?: unknown }).create_time;
    return { id: f.eventId, type: "PAYMENT.CAPTURE.COMPLETED", createTime: typeof at === "string" ? at : now() };
  }
  return null;
}

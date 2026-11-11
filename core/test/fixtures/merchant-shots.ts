// The For merchants stills' own orders (Track F's shots, fed through the session stream on a local server only): one of
// each kind a judge should see, each with its own cart hash and amount, as real orders always have (bindCart's per-binding
// nonce: trust/src/cart.ts). The DD (Nov 6) caught two orders sharing one hash at $42.00 and $18.50 in the last stills;
// merchants.test.ts now holds these rows to one hash per order.

const T = Date.UTC(2026, 10, 6, 17, 0);
let n = 0;
const ev = (actor: string, action: string, t: number, data: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ id: `e${++n}`, seq: n, runId: "run-local", t, actor, action, reason: "local sample", data, ...extra });

export const SHOT_HASH = { kettle: "fedcba9876543210fedcba9876543210", lamp: "0a1b2c3d4e5f60718293a4b5c6d7e8f9", mug: "9f8e7d6c5b4a39281706f5e4d3c2b1a0", desk: "5e4d3c2b1a0f9e8d7c6b5a4938271605" } as const;

export const SHOT_ROWS = [
  // Captured, and PayPal's capture event verified and matched: "Captured", the signed badge.
  ev("paypal", "order-created", T, { orderId: "LOCAL-A1", hash: SHOT_HASH.kettle }, { price: "42.00", currency: "USD" }),
  ev("paypal", "authorized", T + 30_000, { orderId: "LOCAL-A1", hash: SHOT_HASH.kettle, catalogId: "kettle" }),
  ev("paypal", "captured", T + 32_000, { orderId: "LOCAL-A1", hash: SHOT_HASH.kettle, catalogId: "kettle", captureId: "LOCAL-C1" }),
  ev("paypal", "webhook", T + 40_000, { eventId: "WH-LOCAL-1", eventType: "PAYMENT.CAPTURE.COMPLETED", verified: true, matched: true, orderId: "LOCAL-A1" }),
  // Placed, the shopper hasn't tapped: no approval seen, nothing yet from PayPal.
  ev("paypal", "order-created", T + 60_000, { orderId: "LOCAL-B2", hash: SHOT_HASH.lamp }, { price: "18.50", currency: "USD" }),
  // The guard's re-read found it unapproved: refused, nothing taken, no approval time.
  ev("paypal", "order-created", T + 90_000, { orderId: "LOCAL-C3", hash: SHOT_HASH.mug }, { price: "27.00", currency: "USD" }),
  ev("guard", "capturing", T + 120_000, { orderId: "LOCAL-C3", hash: SHOT_HASH.mug }),
  ev("cart", "refuse", T + 121_000, { orderId: "LOCAL-C3", hash: SHOT_HASH.mug }, { why: "Not capturing: order not approved." }),
  // A second settle of an order PayPal already shows paid: never charged twice.
  ev("paypal", "order-created", T + 150_000, { orderId: "LOCAL-D4", hash: SHOT_HASH.desk }, { price: "64.00", currency: "USD" }),
  ev("cart", "refuse", T + 180_000, { orderId: "LOCAL-D4", hash: SHOT_HASH.desk }, { why: "Not capturing: already captured: PayPal shows this order paid, so it is never charged twice." }),
];

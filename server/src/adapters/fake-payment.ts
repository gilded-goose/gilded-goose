// A fake PaymentPort for CI only (Joshua, 2026-10-23: no PayPal keys in GitHub).
// It makes no network call and moves nothing; it lets the round budget time a
// whole run, return route included, with no keys. Every order id starts "FAKE-"
// so a ledger row can never pass for a PayPal one, and the server refuses this
// port unless it listens on loopback only. Like PayPal, an order needs the
// shopper's approval before it can be captured: its approve link is the server's own fake PayPal page
// (`/api/runs/fake-paypal/:order/approve`, mounted only with this port), which stands in for the tap and sends the shopper
// back to the order's return URL, as PayPal does; the server lets only the run's own browser tap (H2 review). Refunds
// are keyed by their request id, as PayPal's are. AUTHORIZE orders (021 §4 item 4) get PayPal's hold, capture and void
// with its rules: a final capture or a void closes the authorization, and every call is keyed by its request id.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { fromCents } from "@goose/core";
import type { Authorization, BoundCart, Cents, Dispute, Reported, OrderSnapshot, PaymentIntent, PaymentPort, WebhookHeaders } from "@goose/core";

/** A fake authorization: PayPal's fields plus what its rules need. */
interface FakeAuthorization extends Authorization { orderId: string; captureId?: string }

export const FAKE_PREFIX = "FAKE-";

export class FakePaymentPort implements PaymentPort {
  private readonly orders = new Map<string, OrderSnapshot>();
  private readonly returns = new Map<string, string>();
  /** Capture id → its refunds, by request id (PayPal's idempotency key): the same key never refunds twice. */
  readonly refunds = new Map<string, Map<string, string>>();
  private next = 1;
  private readonly base: string;
  private readonly authorizations = new Map<string, FakeAuthorization>();
  /** Request id → the reply it got first, per step, so a retried authorize, capture or void answers as the first did. */
  private readonly keyed = new Map<string, unknown>();
  /** Every capture asked of an authorization, as asked, for the tests: the amount and whether it was final. */
  readonly authorizationCaptures: { authorizationId: string; amount: Cents; final: boolean; requestId: string }[] = [];
  /** Test stand-in for PayPal holding another amount than the order's (the guard must void, never capture). */
  holdDelta: Cents = 0;
  /** Test stand-in for PayPal not confirming a release: this many voids fail before one goes through. */
  voidFails = 0;
  /** Test knob: while shut, every call to PayPal waits here, so two returns can be made to overlap for certain, not by luck. */
  private gate: Promise<void> | null = null;
  private openGate: (() => void) | null = null;
  waiting = 0;
  shutGate(): void { this.gate ??= new Promise((open) => { this.openGate = open; }); }
  releaseGate(): void { this.openGate?.(); this.gate = null; this.openGate = null; }
  private async atGate(): Promise<void> {
    if (!this.gate) return;
    this.waiting++;
    await this.gate;
    this.waiting--;
  }
  /** Test knob: a hold's capture comes back for this much more than was asked. */
  captureDelta: Cents = 0;
  /** Test knob: the next captures answer PENDING. PayPal took the capture and hasn't finished it, so the money may still move. */
  pendings = 0;

  /** The next this-many captures answer DECLINED, as PayPal can after a tap (the Postman collection's mock decline). */
  declines = 0;

  /** Webhooks (021 §4 item 6): signed with a key made fresh in each process, so only this port can sign one. */
  private readonly webhookKey = randomBytes(32);
  /** How many webhooks were asked to be verified, for the tests: each stands for one call to PayPal. */
  webhookChecks = 0;
  /** Every order read asked of this port, found or not (tests: a forged held cookie never reaches PayPal). */
  orderReads = 0;
  /** The next this-many checks throw, as PayPal does when it can't answer (tests only). */
  webhookDown = 0;

  /** `base`: the server's own address, where the fake PayPal page lives. */
  constructor(base: string) {
    this.base = base.replace(/\/$/, "");
  }

  async create(b: BoundCart, returnUrl: string, intent: PaymentIntent = "CAPTURE"): Promise<{ orderId: string; approveUrl: string }> {
    const id = `${FAKE_PREFIX}${String(this.next++).padStart(4, "0")}`;
    this.orders.set(id, { id, status: "PAYER_ACTION_REQUIRED", amount: b.cart.price, currency: "USD", customId: b.hash, intent, ...(b.cart.payee === undefined ? {} : { payee: b.cart.payee }) });
    this.returns.set(id, returnUrl);
    return { orderId: id, approveUrl: `${this.base}/api/runs/fake-paypal/${id}/approve` };
  }

  /**
   * The fake PayPal page's tap: approve the order and give back where PayPal would send the shopper, or null for no such
   * order. The caller checks first that the request carries the runs cookie of the order's run (H2 review).
   */
  /** The return link stored with an order, untapped: what a leaked log or referrer would hand someone (the route property test). */
  returnLink(orderId: string): string | null {
    return this.returns.get(orderId) ?? null;
  }

  tap(orderId: string): string | null {
    const back = this.returns.get(orderId);
    if (!back || !this.orders.has(orderId)) return null;
    this.approve(orderId);
    return `${back}${back.includes("?") ? "&" : "?"}token=${encodeURIComponent(orderId)}`;
  }

  async get(orderId: string): Promise<OrderSnapshot> {
    await this.atGate();
    this.orderReads++;
    const o = this.orders.get(orderId);
    if (!o) throw new Error(`fake order ${orderId} not found`);
    const a = [...this.authorizations.values()].find((x) => x.orderId === orderId);
    // Like PayPal's order read: once money was taken, purchase_units[0].payments.captures[0].id names the capture.
    const captureId = a ? a.captureId : o.status === "COMPLETED" && o.intent !== "AUTHORIZE" ? `${FAKE_PREFIX}CAPTURE-${orderId.slice(FAKE_PREFIX.length)}` : undefined;
    return { ...o, ...(a ? { authorization: { id: a.id, status: a.status, amount: a.amount, currency: a.currency } } : {}), ...(captureId ? { captureId } : {}) };
  }

  /** The test stand-in for the shopper's tap in PayPal. */
  approve(orderId: string): void {
    const o = this.orders.get(orderId);
    if (!o) throw new Error(`fake order ${orderId} not found`);
    this.orders.set(orderId, { ...o, status: "APPROVED" });
  }

  /** The test stand-in for a payee changed on the order between approval and capture (N15). */
  swapPayee(orderId: string, payee: string): void {
    const o = this.orders.get(orderId);
    if (!o) throw new Error(`fake order ${orderId} not found`);
    this.orders.set(orderId, { ...o, payee });
  }

  /** The test stand-in for an order edited at PayPal after the tap (N15's payee swap, for any field). */
  edit(orderId: string, change: Partial<OrderSnapshot>): void {
    const o = this.orders.get(orderId);
    if (!o) throw new Error(`fake order ${orderId} not found`);
    this.orders.set(orderId, { ...o, ...change });
  }

  async capture(orderId: string): Promise<{ status: string; captureId: string }> {
    const o = await this.get(orderId);
    if (o.intent === "AUTHORIZE") throw new Error("ACTION_DOES_NOT_MATCH_INTENT");
    if (o.status !== "APPROVED") throw new Error("ORDER_NOT_APPROVED");
    if (this.declines > 0) { this.declines--; return { status: "DECLINED", captureId: "" }; }
    this.orders.set(orderId, { ...o, status: "COMPLETED" });
    if (this.pendings > 0) { this.pendings--; return { status: "PENDING", captureId: `${FAKE_PREFIX}CAPTURE-${orderId.slice(FAKE_PREFIX.length)}` }; }
    return { status: "COMPLETED", captureId: `${FAKE_PREFIX}CAPTURE-${orderId.slice(FAKE_PREFIX.length)}` };
  }

  /** Like PayPal: one authorization per approved AUTHORIZE order; the order then reads COMPLETED. */
  async authorize(orderId: string, requestId: string): Promise<Authorization> {
    await this.atGate();
    const have = this.keyed.get(`authorize:${requestId}`) as Authorization | undefined;
    if (have) return { ...have };
    const o = await this.get(orderId);
    if (o.intent !== "AUTHORIZE") throw new Error("ACTION_DOES_NOT_MATCH_INTENT");
    if (o.authorization) throw new Error("ORDER_ALREADY_AUTHORIZED");
    if (o.status !== "APPROVED") throw new Error("ORDER_NOT_APPROVED");
    const a: FakeAuthorization = { id: `${FAKE_PREFIX}AUTH-${orderId.slice(FAKE_PREFIX.length)}`, status: "CREATED", amount: o.amount + this.holdDelta, currency: o.currency, orderId };
    this.authorizations.set(a.id, a);
    this.orders.set(orderId, { ...this.orders.get(orderId)!, status: "COMPLETED" });
    const reply = { id: a.id, status: a.status, amount: a.amount, currency: a.currency };
    this.keyed.set(`authorize:${requestId}`, reply);
    return { ...reply };
  }

  /** PayPal's rules: only a CREATED authorization captures; a final capture closes it, so a second key gets ALREADY_CAPTURED. */
  async captureAuthorization(authorizationId: string, req: { amount: Cents; currency: string; final: boolean; requestId: string }): Promise<{ status: string; captureId: string; amount: Cents; currency: string }> {
    const have = this.keyed.get(`capture:${req.requestId}`) as { status: string; captureId: string; amount: Cents; currency: string } | undefined;
    if (have) return { ...have };
    const a = this.authorizations.get(authorizationId);
    if (!a) throw new Error("RESOURCE_NOT_FOUND");
    if (a.status === "VOIDED") throw new Error("AUTHORIZATION_VOIDED");
    if (a.status === "CAPTURED") throw new Error("AUTHORIZATION_ALREADY_CAPTURED");
    if (this.declines > 0) { this.declines--; return { status: "DECLINED", captureId: "", amount: req.amount, currency: req.currency }; }
    this.authorizationCaptures.push({ authorizationId, amount: req.amount, final: req.final, requestId: req.requestId });
    const n = this.authorizationCaptures.filter((c) => c.authorizationId === authorizationId).length;
    const captureId = `${FAKE_PREFIX}CAPTURE-${a.orderId.slice(FAKE_PREFIX.length)}${n > 1 ? `-${n}` : ""}`;
    if (req.final) a.status = "CAPTURED";
    a.captureId ??= captureId;
    const pending = this.pendings > 0;
    if (pending) this.pendings--;
    const reply = { status: pending ? "PENDING" : "COMPLETED", captureId, amount: req.amount + this.captureDelta, currency: req.currency };
    this.keyed.set(`capture:${req.requestId}`, reply);
    return { ...reply };
  }

  async voidAuthorization(authorizationId: string, requestId: string): Promise<{ status: string }> {
    if (this.keyed.has(`void:${requestId}`)) return { status: "VOIDED" };
    if (this.voidFails > 0) { this.voidFails--; throw new Error("INTERNAL_SERVER_ERROR"); }
    const a = this.authorizations.get(authorizationId);
    if (!a) throw new Error("RESOURCE_NOT_FOUND");
    if (a.status === "VOIDED") throw new Error("PREVIOUSLY_VOIDED");
    if (a.status === "CAPTURED") throw new Error("PREVIOUSLY_CAPTURED");
    a.status = "VOIDED";
    this.keyed.set(`void:${requestId}`, true);
    return { status: "VOIDED" };
  }

  async refund(captureId: string, requestId: string): Promise<{ status: string; refundId: string }> {
    const captured = [...this.orders.values()].some((o) => o.status === "COMPLETED" && o.intent !== "AUTHORIZE" && captureId === `${FAKE_PREFIX}CAPTURE-${o.id.slice(FAKE_PREFIX.length)}`)
      || [...this.authorizations.values()].some((a) => a.captureId === captureId);
    if (!captured) throw new Error("RESOURCE_NOT_FOUND");
    const byKey = this.refunds.get(captureId) ?? new Map<string, string>();
    this.refunds.set(captureId, byKey);
    const have = byKey.get(requestId);
    if (have) return { status: "COMPLETED", refundId: have };
    // A second refund of the same capture under another key is what PayPal refuses once the capture is fully refunded.
    if (byKey.size > 0) throw new Error("CAPTURE_FULLY_REFUNDED");
    const refundId = `${FAKE_PREFIX}REFUND-${captureId.slice(`${FAKE_PREFIX}CAPTURE-`.length)}`;
    byKey.set(requestId, refundId);
    return { status: "COMPLETED", refundId };
  }

  /** PayPal additions 1: trackers PayPal holds, by capture id. `shipDown` makes the next calls fail, for tests. */
  readonly trackers = new Map<string, { trackingNumber: string; carrier: string; status: "SHIPPED" }>();
  shipDown = false;
  /** Like PayPal: tracking only for a real capture; the read back answers what is held. */
  async ship(captureId: string, trackingNumber: string, carrier: string): Promise<{ held: boolean; status: "SHIPPED" | null }> {
    if (this.shipDown) throw new Error("INTERNAL_SERVER_ERROR");
    const captured = [...this.orders.values()].some((o) => o.status === "COMPLETED" && o.intent !== "AUTHORIZE" && captureId === `${FAKE_PREFIX}CAPTURE-${o.id.slice(FAKE_PREFIX.length)}`)
      || [...this.authorizations.values()].some((a) => a.captureId === captureId);
    if (!captured) return { held: false, status: null };
    this.trackers.set(captureId, { trackingNumber, carrier, status: "SHIPPED" });
    return { held: true, status: "SHIPPED" };
  }

  /** PayPal additions 3: what the report says, by capture id (tests set it); else what this fake captured. */
  readonly reports = new Map<string, Reported>();
  reportDown = false;
  /** Like list_transactions read for one capture: the amount this fake took for it, or not listed. */
  async reported(captureId: string): Promise<Reported> {
    if (this.reportDown) throw new Error("INTERNAL_SERVER_ERROR");
    const set = this.reports.get(captureId);
    if (set) return { ...set };
    const auth = [...this.authorizations.values()].find((a) => a.captureId === captureId);
    const order = auth ? this.orders.get(auth.orderId) : [...this.orders.values()].find((o) => o.status === "COMPLETED" && o.intent !== "AUTHORIZE" && captureId === `${FAKE_PREFIX}CAPTURE-${o.id.slice(FAKE_PREFIX.length)}`);
    return order ? { listed: true, amount: fromCents(order.amount), currency: order.currency, complete: true } : { listed: false, amount: null, currency: null, complete: true };
  }

  /** PayPal additions 2: disputes a buyer opened at PayPal, by capture id (tests set them). `disputesDown` fails the call. */
  readonly disputed = new Map<string, Dispute[]>();
  disputesDown = false;
  /** Like list_disputes filtered by the capture id: what PayPal holds on it, none by default. */
  async disputes(captureId: string): Promise<Dispute[]> {
    if (this.disputesDown) throw new Error("INTERNAL_SERVER_ERROR");
    return [...(this.disputed.get(captureId) ?? [])];
  }

  /** Orders by status, for the server's test-only count (H2 review): shows a refused tap approved nothing, names no order. */
  statusCounts(): Record<string, number> {
    const n: Record<string, number> = {};
    for (const o of this.orders.values()) n[o.status] = (n[o.status] ?? 0) + 1;
    for (const a of this.authorizations.values()) n[`AUTHORIZATION_${a.status}`] = (n[`AUTHORIZATION_${a.status}`] ?? 0) + 1;
    return n;
  }

  /** Refunds actually made (one per capture at most), for the server's test-only count. */
  refundCount(): number {
    let n = 0;
    for (const m of this.refunds.values()) n += m.size;
    return n;
  }

  /** Sign a webhook body as PayPal would send it (tests and the fake server's own events). */
  signWebhook(rawBody: string, transmissionId = `FAKE-TX-${this.next++}`): WebhookHeaders {
    // Now, and on PayPal's sandbox cert host, as PayPal sends them: the route's gate reads both before any check.
    const transmissionTime = new Date().toISOString();
    return { transmissionId, transmissionTime, certUrl: "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-FAKE", authAlgo: "SHA256withRSA", transmissionSig: this.webhookSig(transmissionId, transmissionTime, rawBody) };
  }

  /** PayPal's postback, faked: true only for a body this port signed, unchanged, under the same transmission. */
  async verifyWebhook(h: WebhookHeaders, rawBody: string): Promise<boolean> {
    this.webhookChecks++;
    if (this.webhookDown > 0) { this.webhookDown--; throw new Error("fake PayPal didn't answer"); }
    const want = Buffer.from(this.webhookSig(h.transmissionId, h.transmissionTime, rawBody));
    const got = Buffer.from(h.transmissionSig);
    return got.length === want.length && timingSafeEqual(got, want);
  }

  private webhookSig(id: string, time: string, raw: string): string {
    return createHmac("sha256", this.webhookKey).update(`${id}|${time}|${raw}`).digest("base64");
  }

}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);

/** Only on this machine: a hosted server with a fake port would show orders that don't exist. */
export function assertFakeAllowed(publicUrl: string, listenHost: string, env: NodeJS.ProcessEnv): void {
  const host = new URL(publicUrl).hostname;
  if (!LOOPBACK.has(host)) throw new Error(`PAYMENT=fake is for CI on localhost only, not ${host}`);
  if (!LOOPBACK.has(listenHost)) throw new Error(`PAYMENT=fake needs HOST on loopback, not ${listenHost}`);
  if (env.RENDER) throw new Error("PAYMENT=fake is never allowed on Render");
}

// "Verify this order" (Joshua, Nov 11): the read-only lookup behind GET /api/verify/:id (server/src/verify-order.ts).
// The match is the guard's own rule (`bindingHash`, `checkBoundCart`), so the tests here are about what the lookup adds:
// one answer for every miss, nothing of a payer's in any answer, a cap, a short cache, and no call that moves money.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { bootServer } from "./boot.ts";
import { sha256 } from "./helpers.ts";
import { APPROVAL_TTL_MS, bindCart, toCents, type BoundCart, type LedgerEvent, type OrderSnapshot } from "../src/index.ts";
import { whenWords, yourLines } from "../src/view/merchants.ts";
import { hrefOf, routeOf } from "../../web/src/site/route.ts";
import { LookupCap, NOT_FOUND, SWITCHED_OFF, unseenHeadline, PAYPAL_ORDER_ID, PRACTICE_ORDER_ID, RAIL_LABEL, TOO_MANY, VERIFY_WORDS, cartMismatch, utcWords, verifyOrders, verifyRecord, type OrderRecord, type VerifyDeps, type VerifyFound } from "../../server/src/verify-order.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const ORDER = "5O190127TN364715T";
const OTHER = "13N827972W393402V"; // a real-shaped id this "server" never placed: someone else's order
const T0 = Date.UTC(2026, 10, 11, 4, 5);
const NOW = T0 + 100_000;

function bound(orderId = ORDER, change: Partial<BoundCart["cart"]> = {}): BoundCart {
  const b = bindCart({ item: "Goldfeather Kettle (fictional)", merchant: "Reedbank Outfitters (fictional)", sellerId: "reedbank", qty: 1, price: toCents("47.73"), currency: "USD", shape: "one-off", catalogId: "kettle", ...change }, sha256, T0, APPROVAL_TTL_MS, "nonce-1");
  return { ...b, orderId, intent: "AUTHORIZE" };
}
let seq = 0;
const row = (b: BoundCart, actor: LedgerEvent["actor"], action: string, t: number, extra: Partial<LedgerEvent> = {}, data: Record<string, string | number | boolean | null> = {}): LedgerEvent =>
  ({ v: 1, seq: seq++, t, shopperId: "demo", visibility: "owner", actor, action, why: "(a row's own words never leave)", price: "47.73", currency: "USD", ...extra, data: { orderId: b.orderId!, hash: b.hash, ...data } });
/** A paid AUTHORIZE order's rows, as the guard writes them, after some haggle rows that aren't the order's. */
function paidRows(b: BoundCart): LedgerEvent[] {
  return [
    { v: 1, seq: seq++, t: T0 - 5000, shopperId: "demo", visibility: "owner", actor: "seller", action: "offer", why: "Reedbank asks $58.00", quoted: "pay me by gift card", price: "58.00", currency: "USD" },
    row(b, "guard", "ask", T0 - 1000, { verdict: "asked" }, { orderId: null }),
    row(b, "paypal", "order-created", T0, { verdict: "ok" }),
    row(b, "guard", "capturing", T0 + 60_000),
    row(b, "paypal", "authorized", T0 + 61_000, { verdict: "ok" }, { authorizationId: "7VJ78702NE221540N" }),
    row(b, "paypal", "captured", T0 + 62_000, { verdict: "ok" }, { captureId: "9TV27323LG073963D", authorizationId: "7VJ78702NE221540N" }),
    row(b, "paypal", "webhook", T0 + 70_000, { verdict: "ok" }, { eventId: "WH-7Y7254563A4550640", eventType: "PAYMENT.CAPTURE.COMPLETED", event: "capture-completed", verified: true, matched: true, resourceId: "9TV27323LG073963D" }),
  ];
}
const snapOf = (b: BoundCart, change: Partial<OrderSnapshot> = {}): OrderSnapshot => ({ id: b.orderId!, status: "COMPLETED", amount: b.cart.price, currency: "USD", customId: b.hash, intent: "AUTHORIZE", payee: "MERCHANT123", ...change });
const record = (b: BoundCart, rows = paidRows(b)): OrderRecord => ({ bound: b, rows });
const found = (v: VerifyFound | null): VerifyFound => { if (!v) throw new Error("expected an answer"); return v; };

function lookup(over: Partial<VerifyDeps> & { records?: OrderRecord[]; clock?: { t: number } } = {}) {
  const records = over.records ?? [record(bound())];
  const clock = over.clock ?? { t: T0 + 100_000 };
  const reads: string[] = [];
  const finds: string[] = [];
  const snap = (id: string) => { const r = records.find((x) => x.bound.orderId === id); if (!r) throw new Error("RESOURCE_NOT_FOUND"); return snapOf(r.bound); };
  const ask = verifyOrders({
    find: (id) => { finds.push(id); return records.find((x) => x.bound.orderId === id) ?? null; },
    read: async (id) => { reads.push(id); return snap(id); },
    hash: sha256, rail: "sandbox", now: () => clock.t, ...over,
  });
  return { ask, reads, finds, clock };
}

describe("the match is the guard's own comparison, read after the fact", () => {
  it("match: the fingerprint worked out again from the stored cart is the one PayPal's order carries", () => {
    const b = bound();
    const v = found(verifyRecord(ORDER, record(b), snapOf(b), sha256, "sandbox", NOW));
    expect(v).toMatchObject({ found: true, verdict: "match", headline: "This order was approved for exactly this cart", why: VERIFY_WORDS.matchWhy, witness: "paypal", witnessWords: VERIFY_WORDS.fromPayPal, rail: "sandbox", label: "PayPal sandbox · test money", orderId: ORDER });
    expect(v.order).toEqual({ status: "COMPLETED", outcome: "Captured", amount: "47.73", currency: "USD", fingerprint: b.hash });
    expect(v.cart).toEqual({ item: "Goldfeather Kettle (fictional)", payee: "Reedbank Outfitters (fictional)", qty: 1, total: "47.73", currency: "USD", fingerprint: b.hash, boundWith: b.hash });
    // An order past its approval time, already COMPLETED, is still this cart's: those two re-checks are about capturing now.
    expect(cartMismatch(b, snapOf(b, { status: "COMPLETED" }), sha256)).toBeNull();
    expect(cartMismatch(b, snapOf(b, { status: "VOIDED" }), sha256)).toBeNull();
  });

  it("mismatch: each way the order can differ from the cart says so in its own plain line", () => {
    const b = bound();
    const said = (snap: OrderSnapshot, cart = b) => found(verifyRecord(ORDER, record(cart), snap, sha256, "sandbox", NOW));
    for (const [change, why] of [
      [{ customId: "f".repeat(32) }, VERIFY_WORDS.why.hash],
      [{ customId: undefined }, VERIFY_WORDS.why.hash],
      [{ amount: b.cart.price + 1 }, VERIFY_WORDS.why.amount],
      [{ currency: "EUR" }, VERIFY_WORDS.why.currency],
      [{ intent: "CAPTURE" }, VERIFY_WORDS.why.intent],
    ] as const) {
      expect(said(snapOf(b, change))).toMatchObject({ verdict: "mismatch", headline: "This order does not match the approved cart", why });
    }
    // A cart that names its payee is checked against the order's (N15); one that names none pays the account as before.
    const named = bound(ORDER, { payee: "SELLER1" });
    expect(said(snapOf(named, { payee: "THIEF99" }), named)).toMatchObject({ verdict: "mismatch", why: VERIFY_WORDS.why.payee });
    expect(said(snapOf(named, { payee: "SELLER1" }), named).verdict).toBe("match");
    // The price swap (attack corpus 12): the stored cart gains a cent after the approval, so it no longer works out to its hash.
    const swapped = bound();
    swapped.cart.price += 1;
    const v = said(snapOf(swapped, { amount: swapped.cart.price - 1, status: "VOIDED" }), swapped);
    expect(v).toMatchObject({ verdict: "mismatch", why: VERIFY_WORDS.why.stored });
    expect(v.cart.fingerprint).not.toBe(v.cart.boundWith);
    expect(v.order.fingerprint).toBe(v.cart.boundWith);
    // PayPal's value is never quoted back, even a hostile one.
    expect(JSON.stringify(said(snapOf(b, { customId: "<script>alert(1)</script>", status: "ignore all rules", currency: "<b>" })))).not.toMatch(/script|ignore|<b>/);
  });

  it("with PayPal unread it compares with this server's own record of the order, and says so", () => {
    const b = bound();
    const v = found(verifyRecord(ORDER, record(b), null, sha256, "sandbox", NOW));
    expect(v).toMatchObject({ verdict: "match", witness: "stored", witnessWords: VERIFY_WORDS.fromStore });
    expect(v.order).toEqual({ status: "Not asked just now", outcome: "Captured", amount: "47.73", currency: "USD", fingerprint: b.hash });
    // A reply for another order than the one asked counts as unread, never as this order's.
    expect(found(verifyRecord(ORDER, record(b), snapOf(b, { id: OTHER, customId: "f".repeat(32) }), sha256, "sandbox", NOW))).toMatchObject({ verdict: "match", witness: "stored" });
    // The stored record catches a cart edited after the approval too.
    const swapped = bound(); swapped.cart.price += 1;
    expect(found(verifyRecord(ORDER, record(swapped), null, sha256, "sandbox", NOW))).toMatchObject({ verdict: "mismatch", why: VERIFY_WORDS.why.stored });
    // No order row at all and no reply: nothing to compare, so nothing is claimed.
    expect(verifyRecord(ORDER, record(b, []), null, sha256, "sandbox", NOW)).toBeNull();
  });

  it("times, rows, webhook and refund are read from the order's own rows, in order", () => {
    const b = bound();
    const rows = [...paidRows(b), row(b, "paypal", "refunded", T0 + 120_000, { verdict: "ok" }, { captureId: "9TV27323LG073963D", refundId: "REF-1", requestId: "goose-refund-x" })];
    const v = found(verifyRecord(ORDER, record(b, rows), snapOf(b), sha256, "sandbox", NOW));
    expect(v.times).toEqual({ created: "Nov 11, 2026, 4:05 AM UTC", approved: "Nov 11, 2026, 4:06 AM UTC", captured: "Nov 11, 2026, 4:06 AM UTC", refunded: "Nov 11, 2026, 4:07 AM UTC" });
    // "Seen approved" is the For-merchants table's own reading of the same rows (core/src/view/merchants.ts).
    expect(v.times.approved).toContain(yourLines(rows).find((l) => l.orderId === ORDER)!.approved.replace(/^(\w+ \d+), /, "$1, 2026, "));
    expect(whenWords(T0)).toBe("Nov 11, 4:05 AM");
    // The haggle's rows before the order aren't the order's; the guard's decision on this cart is.
    expect(v.rows.map((r) => `${r.actor}/${r.action}`)).toEqual(["guard/ask", "paypal/order-created", "guard/capturing", "paypal/authorized", "paypal/captured", "paypal/webhook", "paypal/refunded"]);
    expect(v.rows[4]).toEqual({ at: "Nov 11, 2026, 4:06 AM UTC", actor: "paypal", action: "captured", verdict: "ok", amount: "47.73", currency: "USD", words: "The payment was taken." });
    expect(v.webhook).toEqual({ arrived: true, verified: true, events: [{ type: "PAYMENT.CAPTURE.COMPLETED", at: "Nov 11, 2026, 4:06 AM UTC" }], words: VERIFY_WORDS.hookArrived });
    expect(v.refund).toEqual({ state: "refunded", words: "Refunded through PayPal." });
    // No event yet: said as not arrived, never as failed (an unsigned event writes no row at all).
    const quiet = found(verifyRecord(ORDER, record(b, paidRows(b).filter((e) => e.action !== "webhook")), snapOf(b), sha256, "sandbox", NOW));
    expect(quiet.webhook).toEqual({ arrived: false, verified: false, events: [], words: VERIFY_WORDS.hookNone });
    expect(quiet.refund.state).toBe("none");
    // An unmatched or unverified row never reads as PayPal's word on this order.
    const loose = [...paidRows(b).filter((e) => e.action !== "webhook"), row(b, "paypal", "webhook", T0 + 70_000, {}, { eventType: "PAYMENT.CAPTURE.COMPLETED", verified: true, matched: false }), row(b, "paypal", "webhook", T0 + 71_000, {}, { eventType: "PAYMENT.CAPTURE.COMPLETED", verified: false, matched: true })];
    expect(found(verifyRecord(ORDER, record(b, loose), snapOf(b), sha256, "sandbox", NOW)).webhook.arrived).toBe(false);
    expect(found(verifyRecord(ORDER, record(b, [...paidRows(b), row(b, "paypal", "refund-failed", T0 + 120_000)]), snapOf(b), sha256, "sandbox", NOW)).refund.state).toBe("failed");
    expect(utcWords(Date.UTC(2026, 0, 1, 12, 0))).toBe("Jan 1, 2026, 12:00 PM UTC");
    expect(utcWords(Date.UTC(2026, 0, 1, 0, 9))).toBe("Jan 1, 2026, 12:09 AM UTC");
    for (const bad of [undefined, null, Number.NaN, "1", 8.7e15]) expect(utcWords(bad)).toBeNull();
  });

  it("the practice rail says it is not PayPal, in every label", () => {
    const b = bound("FAKE-0001");
    const v = found(verifyRecord("FAKE-0001", record(b), snapOf(b), sha256, "practice", NOW));
    expect(v.label).toBe("Practice · not a PayPal order, no money");
    expect(v.witnessWords).toBe(VERIFY_WORDS.fromStandIn);
    expect(RAIL_LABEL.sandbox).toBe("PayPal sandbox · test money");
    expect(JSON.stringify(v)).not.toMatch(/sandbox|test money|"PayPal was asked/);
  });
});

describe("approved is an event, never borrowed from the comparison", () => {
  /** Created, the shopper pressed Goose's Approve (which makes the order), then cancelled on PayPal's page: nobody approved it there. */
  const cancelled = (b: BoundCart): LedgerEvent[] => [row(b, "guard", "ask", T0 - 1000, { verdict: "asked" }, { orderId: null }), row(b, "paypal", "order-created", T0, { verdict: "ok" }), row(b, "shopper", "cancel", T0 + 30_000)];
  it("a created-then-cancelled order is never called approved, in the headline or anywhere in the answer", () => {
    const b = bound();
    const v = found(verifyRecord(ORDER, record(b, cancelled(b)), snapOf(b, { status: "CREATED" }), sha256, "sandbox", NOW));
    expect(v).toMatchObject({ verdict: "match", seenApproved: false, headline: "This order was created for exactly this cart. Goose never saw it approved at PayPal." });
    expect(v.headline).toBe(VERIFY_WORDS.created);
    expect(v.times.approved).toBe("Not seen approved");
    // The one place the word may stand is in saying it never happened.
    expect(JSON.stringify(v).replace(/never saw it approved at PayPal|Not seen approved|"seenApproved":false|"approved":/g, "")).not.toMatch(/approv/i);
    // Its cart edited afterwards: still no "the approved cart".
    const swapped = bound(); swapped.cart.price += 1;
    const m = found(verifyRecord(ORDER, record(swapped, cancelled(swapped)), snapOf(swapped, { amount: swapped.cart.price - 1, status: "CREATED" }), sha256, "sandbox", NOW));
    expect(m).toMatchObject({ verdict: "mismatch", seenApproved: false, headline: VERIFY_WORDS.mismatchCreated });
    expect(m.headline).not.toMatch(/the approved cart/);
    // Unread at PayPal, the same: the stored fallback never supplies an approval either.
    expect(found(verifyRecord(ORDER, record(b, cancelled(b)), null, sha256, "sandbox", NOW)).headline).toBe(VERIFY_WORDS.created);
    // Once the guard's re-read saw it APPROVED, it says so.
    expect(found(verifyRecord(ORDER, record(b), snapOf(b), sha256, "sandbox", NOW))).toMatchObject({ seenApproved: true, headline: VERIFY_WORDS.match });
  });
  it("PayPal shows it approved but the return never reached this server: both are said, and neither contradicts the status beside it", () => {
    const b = bound();
    for (const status of ["APPROVED", "COMPLETED"]) {
      const v = found(verifyRecord(ORDER, record(b, cancelled(b).slice(0, 2)), snapOf(b, { status }), sha256, "sandbox", NOW));
      expect(v, status).toMatchObject({ seenApproved: false, verdict: "match", headline: "This order was created for exactly this cart. PayPal's record shows it approved; this server did not see that approval.", order: { status } });
      expect(v.headline).not.toMatch(/never saw it approved/);
      const swapped = bound(); swapped.cart.price += 1;
      expect(found(verifyRecord(ORDER, record(swapped, cancelled(swapped).slice(0, 2)), snapOf(swapped, { amount: swapped.cart.price - 1, status }), sha256, "sandbox", NOW)).headline).toBe("This order does not match the cart it was created for. PayPal's record shows it approved; this server did not see that approval.");
    }
    // Any other status, or PayPal unread: this server's own "never saw" stands.
    for (const status of ["CREATED", "PAYER_ACTION_REQUIRED", "VOIDED", "approved"]) expect(found(verifyRecord(ORDER, record(b, cancelled(b)), snapOf(b, { status }), sha256, "sandbox", NOW)).headline).toBe(VERIFY_WORDS.created);
    expect(found(verifyRecord(ORDER, record(b, cancelled(b)), null, sha256, "sandbox", NOW)).headline).toBe(VERIFY_WORDS.created);
    // The practice rail names the stand-in, never "at PayPal".
    const p = bound("FAKE-0002");
    const made = found(verifyRecord("FAKE-0002", record(p, cancelled(p)), snapOf(p, { status: "PAYER_ACTION_REQUIRED" }), sha256, "practice", NOW));
    expect(made.headline).toBe("This order was created for exactly this cart. Goose never saw it approved at this build's stand-in for PayPal.");
    expect(found(verifyRecord("FAKE-0002", record(p, cancelled(p)), snapOf(p, { status: "APPROVED" }), sha256, "practice", NOW)).headline).toBe("This order was created for exactly this cart. The stand-in's record shows it approved; this server did not see that approval.");
    expect(unseenHeadline(true, "practice", false)).toBe("This order does not match the cart it was created for. Goose never saw it approved at this build's stand-in for PayPal.");
  });

  it("two orders' rows in one run: the other order's capture, refund and event never become this order's", () => {
    // The run's earlier cart was paid as OTHER; its rows keep arriving after this order (ORDER) was made and then cancelled.
    const b = bound(), old = bound(OTHER, { price: toCents("12.00") });
    const theirs = [
      row(old, "paypal", "authorized", T0 + 40_000, { verdict: "ok", price: "12.00" }, { authorizationId: "AUTH-OLD" }),
      row(old, "paypal", "captured", T0 + 41_000, { verdict: "ok", price: "12.00" }, { captureId: "CAP-OLD" }),
      { ...row(old, "paypal", "webhook", T0 + 42_000, { verdict: "ok", price: "12.00" }), data: { eventId: "WH-OLD", eventType: "PAYMENT.CAPTURE.COMPLETED", verified: true, matched: true, resourceId: "CAP-OLD", orderId: OTHER } } as LedgerEvent,
      { ...row(old, "paypal", "refunded", T0 + 43_000, { verdict: "ok", price: "12.00" }), data: { captureId: "CAP-OLD", refundId: "REF-OLD", requestId: "goose-refund-x" } } as LedgerEvent,
      { ...row(old, "paypal", "webhook", T0 + 44_000, { verdict: "ok", price: "12.00" }), data: { eventId: "WH-OLD-2", eventType: "PAYMENT.CAPTURE.REFUNDED", verified: true, matched: true, resourceId: "REF-OLD" } } as LedgerEvent,
      { ...row(old, "paypal", "shipped", T0 + 45_000), data: { captureId: "CAP-OLD" } } as LedgerEvent,
    ];
    const rows = [...cancelled(b), ...theirs];
    const v = found(verifyRecord(ORDER, record(b, rows), snapOf(b, { status: "CREATED" }), sha256, "sandbox", NOW));
    expect(v).toMatchObject({ seenApproved: false, headline: VERIFY_WORDS.created, refund: { state: "none" }, webhook: { arrived: false, events: [] }, order: { outcome: "Waiting for the tap" } });
    expect(v.times).toMatchObject({ approved: "Not seen approved", captured: null, refunded: null });
    expect(v.rows.map((r) => `${r.actor}/${r.action}`)).toEqual(["guard/ask", "paypal/order-created", "shopper/cancel"]);
    expect(JSON.stringify(v)).not.toContain("12.00");
    // The paid order is unaffected by a second order's rows in its run, and keeps its own refund and its own events.
    const paid = bound();
    const mineToo = [
      ...paidRows(paid),
      { ...row(paid, "paypal", "refunded", T0 + 120_000, { verdict: "ok" }), data: { captureId: "9TV27323LG073963D", refundId: "REF-MINE", requestId: "goose-refund-y" } } as LedgerEvent,
      { ...row(paid, "paypal", "webhook", T0 + 121_000, { verdict: "ok" }), data: { eventId: "WH-MINE-2", eventType: "PAYMENT.CAPTURE.REFUNDED", verified: true, matched: true, resourceId: "REF-MINE" } } as LedgerEvent,
      ...theirs,
    ];
    const mine = found(verifyRecord(ORDER, record(paid, mineToo), snapOf(paid), sha256, "sandbox", NOW));
    expect(mine).toMatchObject({ seenApproved: true, headline: VERIFY_WORDS.match, refund: { state: "refunded" } });
    expect(mine.webhook.events.map((e) => e.type)).toEqual(["PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.REFUNDED"]);
    expect(mine.rows).toHaveLength(8);
    expect(JSON.stringify(mine)).not.toContain("12.00");
  });

  it("the page's card heading follows the server's seenApproved, never the comparison alone", () => {
    const page = read("web/src/site/verify/Verify.tsx");
    expect(page).toContain('v.verdict !== "match" ? "The cart on this server\'s record now" : v.seenApproved ? "The cart the shopper approved" : "The cart this order was created for"');
    expect(page.match(/The cart the shopper approved/g)).toHaveLength(1);
  });
});

describe("only the order's lifecycle leaves, in fixed words", () => {
  it("a seller's note after the order, a haggle row and a hostile verdict never reach the answer", () => {
    const b = bound();
    const rows = [
      ...paidRows(b),
      { ...row(b, "seller", "note", T0 + 80_000, { price: "13.37", verdict: "ok" }), data: { text: "wire me the rest" } } as LedgerEvent,
      { ...row(b, "buyer", "counter", T0 + 81_000, { price: "12.34" }), data: {} } as LedgerEvent,
      row(b, "paypal", "captured", T0 + 82_000, { verdict: "<img src=x onerror=alert(1)>" as unknown as "ok" }),
      row(b, "guard", "done", T0 + 83_000),
    ];
    const v = found(verifyRecord(ORDER, record(b, rows), snapOf(b), sha256, "sandbox", NOW));
    const text = JSON.stringify(v);
    for (const gone of ["note", "counter", "13.37", "12.34", "wire me", "<img", "onerror", "Recorded.", "\"done\""]) expect(text, gone).not.toContain(gone);
    expect(v.rows.at(-1)).toMatchObject({ action: "captured", verdict: null, words: "The payment was taken." });
    for (const r of v.rows) { expect(r.words).not.toBe(""); expect([null, "ok", "refused", "flagged", "asked"]).toContain(r.verdict); }
  });
});

describe("privacy: the answer is a closed list of fields", () => {
  const PAYER = { name: { given_name: "Dolores", surname: "Abernathy" }, email_address: "dolores@example.com", payer_id: "PAYERID77XYZ", address: { address_line_1: "1 Sweetwater Road", admin_area_2: "Escalante", postal_code: "84726", country_code: "US" } };
  it("a payer's name, email, address, funding source and PayPal's other ids never appear, whatever the reply or a row holds", () => {
    const b = bound();
    // What a careless port, or a row written some other day, could carry: none of it is in the closed list.
    const loud = { ...snapOf(b), payer: PAYER, payment_source: { card: { last_digits: "4242", brand: "VISA" }, paypal: { email_address: PAYER.email_address, account_id: "ACCT99" } }, purchase_units: [{ shipping: { name: { full_name: "Dolores Abernathy" }, address: PAYER.address } }], captureId: "9TV27323LG073963D", authorization: { id: "7VJ78702NE221540N", status: "CAPTURED", amount: b.cart.price, currency: "USD" } } as OrderSnapshot;
    const rows = paidRows(b).map((e) => ({ ...e, why: `Paid by Dolores Abernathy <${PAYER.email_address}>`, quoted: "1 Sweetwater Road", sellerId: "reedbank", runId: "9cc3467b7610", data: { ...e.data, payerEmail: PAYER.email_address, card: "4242", shipTo: "Escalante 84726" } })) as LedgerEvent[];
    const v = found(verifyRecord(ORDER, { bound: b, rows }, loud, sha256, "sandbox", NOW));
    const text = JSON.stringify(v);
    for (const secret of ["Dolores", "Abernathy", "dolores@example.com", "PAYERID77XYZ", "Sweetwater", "Escalante", "84726", "4242", "VISA", "ACCT99", "9TV27323LG073963D", "7VJ78702NE221540N", "WH-7Y7254563A4550640", "MERCHANT123", "9cc3467b7610", "nonce-1", "gift card", "reedbank\"", "never leave"]) expect(text, secret).not.toContain(secret);
    // The whole shape, key by key: a new field is added here on purpose or not at all.
    expect(Object.keys(v).sort()).toEqual(["cart", "found", "headline", "label", "order", "orderId", "rail", "readAt", "refund", "rows", "seenApproved", "times", "verdict", "webhook", "why", "witness", "witnessWords"]);
    expect(Object.keys(v.order).sort()).toEqual(["amount", "currency", "fingerprint", "outcome", "status"]);
    expect(Object.keys(v.cart).sort()).toEqual(["boundWith", "currency", "fingerprint", "item", "payee", "qty", "total"]);
    expect(Object.keys(v.times).sort()).toEqual(["approved", "captured", "created", "refunded"]);
    expect(Object.keys(v.webhook).sort()).toEqual(["arrived", "events", "verified", "words"]);
    for (const r of v.rows) expect(Object.keys(r).sort()).toEqual(["action", "actor", "amount", "at", "currency", "verdict", "words"]);
    for (const e of v.webhook.events) expect(Object.keys(e).sort()).toEqual(["at", "type"]);
  });

  it("the file never spreads a row, a cart or PayPal's reply into the answer, and calls nothing that moves money", () => {
    const src = read("server/src/verify-order.ts");
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*")).join("\n");
    // Two spreads, both into what the guard's comparison reads (its stood-down status, the stored order's payee); none into what is returned.
    expect(code.match(/\.\.\./g) ?? []).toHaveLength(2);
    expect(code).toContain("...(bound.cart.payee === undefined ? {} : { payee: bound.cart.payee })");
    expect(code).toContain("checkBoundCart(bound, { ...snap, status: \"APPROVED\" }, bound.expiresAt)");
    expect(code).toContain("bindingHash(bound.cart, bound.nonce, bound.expiresAt, hash)");
    expect(code).not.toMatch(/\.(create|capture|authorize|captureAuthorization|voidAuthorization|refund|place|settle|append|drop|touch)\(/);
    expect(code).not.toMatch(/setCookie|getCookie|process\.env|fetch\(/);
    // The route: GET only, no cookie, never cached, and only `get` asked of the payment port.
    const main = read("server/src/main.ts");
    const at = main.indexOf('// ---------- "Verify this order"');
    const block = main.slice(at, main.indexOf("/**", at));
    expect(block).toContain('app.get("/api/verify/:id"');
    expect(block).toContain('"Cache-Control": "no-store"');
    expect(block.match(/\bport\.\w+\(/g)).toEqual(["port.get("]);
    expect(block).not.toMatch(/app\.(post|put|delete|all|use)\(|Cookie|\.append\(|touch\(|\.settle\(|\.place\(|isOwner|policy|\.want\b/);
    // The off switch is read before the lookup is ever called.
    expect(block).toContain('app.get("/api/verify/:id", async (c) => { if (!VERIFY_ON) return c.json(SWITCHED_OFF, 404');
    expect(block).toContain('const VERIFY_ON = process.env.VERIFY_ORDER !== "off";');
    expect(main.match(/\/api\/verify/g)).toHaveLength(1);
  });
});

describe("every miss is the same answer, and only an order placed here reaches PayPal", () => {
  it("unknown, malformed and someone else's order ids get one NOT_FOUND, with no read asked of PayPal", async () => {
    const { ask, reads, finds } = lookup();
    const misses = [OTHER, "", "x", ORDER.toLowerCase(), `${ORDER}X`, ORDER.slice(1), ` ${ORDER}`, `${ORDER.slice(0, 16)}!`, "FAKE-0001", "../../etc/passwd", "5O190127TN36471%54", "<script>alert(1)</script>", "*", "%", "5O190127TN364715T OR 1=1", "A".repeat(4000)];
    const answers = [];
    for (const [i, id] of misses.entries()) answers.push(await ask(id, `10.0.0.${i}`));
    for (const a of answers) expect(a).toEqual({ status: 200, body: NOT_FOUND });
    expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
    expect(reads).toEqual([]); // nobody else's order is ever asked of PayPal
    expect(finds).toEqual([OTHER]); // only a well-formed id is even looked for, and only whole
    expect(PAYPAL_ORDER_ID.test(ORDER) && !PAYPAL_ORDER_ID.test("FAKE-0001") && PRACTICE_ORDER_ID.test("FAKE-0001") && !PRACTICE_ORDER_ID.test(ORDER)).toBe(true);
    // A store that hands back a different order than the one asked is still a miss.
    const wrong = lookup({ find: () => record(bound(OTHER)) });
    expect(await wrong.ask(ORDER, "a")).toEqual({ status: 200, body: NOT_FOUND });
    expect(wrong.reads).toEqual([]);
  });

  it("an exact id placed here is found, and asks PayPal once", async () => {
    const { ask, reads } = lookup();
    const a = await ask(ORDER, "10.0.0.1");
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ found: true, verdict: "match", witness: "paypal", orderId: ORDER });
    expect(reads).toEqual([ORDER]);
  });

  it("the practice rail takes only its own stand-in ids", async () => {
    const b = bound("FAKE-0001");
    const { ask } = lookup({ rail: "practice", records: [record(b)] });
    expect((await ask("FAKE-0001", "a")).body).toMatchObject({ found: true, rail: "practice" });
    for (const id of [ORDER, "FAKE-1", "FAKE-000A", "fake-0001", "FAKE-0001/approve"]) expect(await ask(id, "a")).toEqual({ status: 200, body: NOT_FOUND });
  });

  it("PayPal slow, down or paused: the answer comes from this server's record and says so; its error text goes nowhere", async () => {
    const said: string[] = [];
    const down = lookup({ read: async () => { throw new Error("401 invalid_client secret=abc123"); }, log: (m) => said.push(m) });
    const a = await down.ask(ORDER, "a");
    expect(a.body).toMatchObject({ found: true, verdict: "match", witness: "stored", witnessWords: VERIFY_WORDS.fromStore });
    expect(JSON.stringify(a.body)).not.toContain("invalid_client");
    expect(said).toHaveLength(1);
    vi.useFakeTimers();
    try {
      const slow = lookup({ read: () => new Promise<OrderSnapshot>(() => {}), readTimeoutMs: 4000 });
      const waiting = slow.ask(ORDER, "a");
      await vi.advanceTimersByTimeAsync(4001);
      expect((await waiting).body).toMatchObject({ found: true, witness: "stored" });
    } finally { vi.useRealTimers(); }
    expect((await lookup({ read: null }).ask(ORDER, "a")).body).toMatchObject({ found: true, witness: "stored" });
  });
});

describe("the cap and the cache", () => {
  it("LookupCap: so many a minute per address, then none until the minute turns; another address is its own", () => {
    const clock = { t: 0 };
    const cap = new LookupCap(3, () => clock.t);
    expect([1, 2, 3, 4, 5].map(() => cap.take("a"))).toEqual([true, true, true, false, false]);
    expect(cap.take("b")).toBe(true);
    clock.t = 59_999;
    expect(cap.take("a")).toBe(false);
    clock.t = 60_000;
    expect([1, 2, 3, 4].map(() => cap.take("a"))).toEqual([true, true, true, false]);
    // Bounded: many addresses never grow it past its size.
    const small = new LookupCap(1, () => clock.t, 5);
    for (let i = 0; i < 50; i++) small.take(`k${i}`);
    expect((small as unknown as { hits: Map<string, unknown> }).hits.size).toBeLessThanOrEqual(5);
  });

  it("past the cap every lookup is 429, a guess and a real id alike, and nothing is read", async () => {
    const { ask, reads, finds, clock } = lookup({ perMinute: 4 });
    expect((await ask("nope", "9.9.9.9")).status).toBe(200); // a malformed id is counted too
    for (let i = 0; i < 3; i++) expect((await ask(OTHER, "9.9.9.9")).status).toBe(200);
    const before = [reads.length, finds.length];
    expect(await ask(ORDER, "9.9.9.9")).toEqual({ status: 429, body: TOO_MANY });
    expect(await ask(OTHER, "9.9.9.9")).toEqual({ status: 429, body: TOO_MANY });
    expect([reads.length, finds.length]).toEqual(before);
    expect((await ask(ORDER, "8.8.8.8")).status).toBe(200); // another address is not held up
    clock.t += 60_000;
    expect((await ask(ORDER, "9.9.9.9")).status).toBe(200);
  });

  it("one order's answer is kept 5 s, so repeats don't ask PayPal again; then it is read fresh", async () => {
    const { ask, reads, clock } = lookup();
    const first = await ask(ORDER, "a");
    clock.t += 4_999;
    expect(await ask(ORDER, "b")).toEqual(first);
    expect(reads).toHaveLength(1);
    clock.t += 1;
    await ask(ORDER, "c");
    expect(reads).toHaveLength(2);
    // Each answer says when it was read, so a kept one never passes for fresh.
    expect((first.body as VerifyFound).readAt).toBe("Nov 11, 2026, 4:06 AM UTC");
    // Lookups that arrive while PayPal is answering share that one read.
    let release: (s: OrderSnapshot) => void = () => {};
    const held = lookup({ read: (id) => { held.reads.push(id); return new Promise<OrderSnapshot>((r) => { release = r; }); } });
    const both = [held.ask(ORDER, "a"), held.ask(ORDER, "b"), held.ask(ORDER, "c")];
    await Promise.resolve();
    release(snapOf(bound()));
    const three = await Promise.all(both);
    expect(held.reads).toEqual([ORDER]);
    expect(three.every((x) => x.status === 200 && (x.body as VerifyFound).witness === "paypal")).toBe(true);
    // A miss is never kept: an order placed a moment later is found.
    const late: OrderRecord[] = [];
    const l = lookup({ records: late });
    expect((await l.ask(ORDER, "a")).body).toEqual(NOT_FOUND);
    late.push(record(bound()));
    expect((await l.ask(ORDER, "a")).body).toMatchObject({ found: true });
  });
});

describe("the page's address", () => {
  it("#/verify is a route of the white site, and #/verify#<id> carries an order id to it", () => {
    expect(hrefOf("verify")).toBe("#/verify");
    expect(routeOf("#/verify")).toEqual({ route: "verify", anchor: null });
    expect(routeOf(`#/verify#${ORDER}`)).toEqual({ route: "verify", anchor: ORDER });
    // The page is its own chunk, and the receipt (a money-path file) is not what links to it.
    expect(read("web/src/site/App.tsx")).toContain('const Verify = lazyPage(() => import("./verify/Verify.tsx")');
    expect(read("web/src/site/shell/Footer.tsx")).toContain('<a href={hrefOf("verify")}>Verify an order</a>');
    expect(read("web/src/site/proof/Proof.tsx")).toContain('<a href={hrefOf("verify")}>Verify an order</a>');
    expect(read("web/src/site/shop/Receipt.tsx")).not.toContain("verify");
  });
});

// ---------- the route, end to end on a booted keyless server (PAYMENT=fake: the practice rail) ----------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
interface RunView { done: boolean; bound: { orderId: string | null; hash: string; total: string } | null; settled: { ok: boolean } | null; events: LedgerEvent[] }

describe("GET /api/verify/:id on the server", () => {
  it("VERIFY_ORDER=off: 404 for a real order and a guess alike, before any lookup or order read", async () => {
    const dir = mkdtempSync(join(tmpdir(), "goose-verify-off-"));
    dirs.push(dir);
    const s = await bootServer((port, base) => {
      const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port), HOST: "127.0.0.1", PUBLIC_URL: base, GOOSE_DIR: dir, RUN_LIBRARY_DIR: join(dir, "runs"), PAYMENT: "fake", BUYER: "rule", VERIFY_ORDER: "off" };
      for (const k of ["ANTHROPIC_API_KEY", "RENDER", "PAYPAL_WEBHOOK_ID", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "PAYMENT_INTENT"]) delete env[k];
      return env;
    });
    try {
      // A real order on this server, made the shop's way (the switch stops the lookup, never the shop).
      let cookie = "";
      const post = async (path: string, body: unknown) => { const r = await fetch(`${s.base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: s.base, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) }); const set = r.headers.get("set-cookie"); if (set && !set.startsWith("goose_wallet_")) cookie = set.split(";")[0]!; return r; };
      const { runId } = await (await post("/api/runs", { seed: 1, pace: false })).json() as { runId: string };
      let v = await (await fetch(`${s.base}/api/runs/${runId}`, { headers: { Cookie: cookie } })).json() as RunView;
      for (let i = 0; i < 100 && !v.done; i++) { await sleep(50); v = await (await fetch(`${s.base}/api/runs/${runId}`, { headers: { Cookie: cookie } })).json() as RunView; }
      expect((await post(`/api/runs/${runId}/approve`, {})).status).toBe(200);
      v = await (await fetch(`${s.base}/api/runs/${runId}`, { headers: { Cookie: cookie } })).json() as RunView;
      const orderId = v.bound!.orderId!;
      expect(orderId).toMatch(/^FAKE-/);
      const reads = async () => ((await (await fetch(`${s.base}/api/fake-paypal/order-reads`)).json()) as { reads: number }).reads;
      const before = await reads();
      for (const id of [orderId, "FAKE-9999", "nope"]) {
        const r = await fetch(`${s.base}/api/verify/${id}`);
        expect(r.status).toBe(404);
        expect(await r.json()).toEqual(SWITCHED_OFF);
      }
      expect(await reads()).toBe(before);
      // Far past any cap, still the switch's answer: nothing was counted, because nothing ran.
      for (let i = 0; i < 30; i++) expect((await fetch(`${s.base}/api/verify/${orderId}`)).status).toBe(404);
    } finally { await s.stop(); }
  });

  it("a paid order and a price-swapped one read back to a stranger with no cookie; every miss is one answer; nothing changes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "goose-verify-"));
    dirs.push(dir);
    const s = await bootServer((port, base) => {
      const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port), HOST: "127.0.0.1", PUBLIC_URL: base, GOOSE_DIR: dir, RUN_LIBRARY_DIR: join(dir, "runs"), PAYMENT: "fake", BUYER: "rule", VERIFY_PER_IP_MINUTE: "12" };
      for (const k of ["ANTHROPIC_API_KEY", "RENDER", "PAYPAL_WEBHOOK_ID", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "PAYMENT_INTENT"]) delete env[k];
      return env;
    });
    try {
      let cookie = "";
      const req = async (path: string, init: RequestInit = {}) => {
        const r = await fetch(`${s.base}${path}`, { redirect: "manual", ...init, headers: { ...(init.headers as Record<string, string>), ...(cookie ? { Cookie: cookie } : {}) } });
        const set = r.headers.get("set-cookie");
        if (set && !set.startsWith("goose_wallet_")) cookie = set.split(";")[0]!;
        return r;
      };
      const post = (path: string, body: unknown) => req(path, { method: "POST", headers: { "Content-Type": "application/json", Origin: s.base }, body: JSON.stringify(body) });
      const view = async (id: string) => (await req(`/api/runs/${id}`)).json() as Promise<RunView>;
      const pay = async (body: Record<string, unknown>) => {
        const { runId } = await (await post("/api/runs", body)).json() as { runId: string };
        let v = await view(runId);
        for (let i = 0; i < 100 && !v.done; i++) { await sleep(50); v = await view(runId); }
        const a = await post(`/api/runs/${runId}/approve`, {});
        expect(a.status).toBe(200);
        const tapped = await fetch((await a.json() as { approveUrl: string }).approveUrl, { redirect: "manual", headers: { Cookie: cookie } });
        expect((await fetch(tapped.headers.get("location")!, { redirect: "manual" })).status).toBe(302);
        return { runId, view: await view(runId) };
      };
      const count = async (what: "order-reads" | "refunds") => Object.values(await (await fetch(`${s.base}/api/fake-paypal/${what}`)).json() as Record<string, number>)[0]!;
      // A stranger: no cookie, no Origin.
      const verify = async (id: string) => { const r = await fetch(`${s.base}/api/verify/${encodeURIComponent(id)}`); return { status: r.status, headers: r.headers, body: await r.json() as VerifyFound }; };

      const paid = await pay({ seed: 1, pace: false });
      expect(paid.view.settled).toMatchObject({ ok: true });
      const orderId = paid.view.bound!.orderId!;
      const rowsBefore = paid.view.events.length;

      const readsBefore = await count("order-reads");
      const misses = [];
      for (const id of ["FAKE-9999", ORDER, "nope", "FAKE-0001x", "%2e%2e"]) misses.push(await verify(id));
      for (const m of misses) { expect(m.status).toBe(200); expect(m.body).toEqual(NOT_FOUND); }
      expect(await count("order-reads")).toBe(readsBefore); // no miss reached the payment port

      const got = await verify(orderId);
      expect(got.status).toBe(200);
      expect(got.headers.get("cache-control")).toBe("no-store");
      expect(got.headers.get("set-cookie")).toBeNull();
      expect(got.body).toMatchObject({ found: true, rail: "practice", label: RAIL_LABEL.practice, orderId, verdict: "match", headline: VERIFY_WORDS.match, witness: "paypal", refund: { state: "none" } });
      expect(got.body.cart).toMatchObject({ total: paid.view.bound!.total, fingerprint: paid.view.bound!.hash, boundWith: paid.view.bound!.hash });
      expect(JSON.stringify(got.body)).not.toMatch(/limit|60\.00/);
      expect(got.body.cart.item).toMatch(/\(fictional\)$/);
      expect(got.body.order).toEqual({ status: "COMPLETED", outcome: "Captured", amount: paid.view.bound!.total, currency: "USD", fingerprint: paid.view.bound!.hash });
      expect(got.body.rows.map((r) => r.action)).toEqual(expect.arrayContaining(["order-created", "capturing", "authorized", "captured"]));
      expect(got.body.times.approved).toMatch(/ UTC$/);
      expect(await count("order-reads")).toBe(readsBefore + 1);
      // Nothing of the run's, or of PayPal's other ids, is in it.
      expect(JSON.stringify(got.body)).not.toMatch(new RegExp(`${paid.runId}|FAKE-CAPTURE|FAKE-AUTH`));

      // Read only: the run has the rows it had, nothing was refunded, and a second look is the kept answer.
      await verify(orderId);
      expect(await count("order-reads")).toBe(readsBefore + 1);
      expect((await view(paid.runId)).events).toHaveLength(rowsBefore);
      expect(await count("refunds")).toBe(0);

      // GET only: every other method finds no route.
      for (const method of ["POST", "PUT", "DELETE", "PATCH"]) expect((await fetch(`${s.base}/api/verify/${orderId}`, { method })).status).toBe(404);

      // The price swap: the cart changed after the hold, the hold was released, and the page says it does not match.
      const swap = await pay({ seed: 1, pace: false, replayOnly: true, swap: true });
      expect(swap.view.settled).toMatchObject({ ok: false });
      const bad = await verify(swap.view.bound!.orderId!);
      expect(bad.body).toMatchObject({ found: true, verdict: "mismatch", headline: VERIFY_WORDS.mismatch, why: VERIFY_WORDS.why.stored });
      expect(bad.body.rows.map((r) => r.action)).toEqual(expect.arrayContaining(["authorized", "voided"]));
      expect(bad.body.cart.fingerprint).not.toBe(bad.body.order.fingerprint);
      expect(bad.body.order.outcome).toBe("Voided (hold released)");
      expect(bad.body.rows.find((r) => r.action === "price-swap")?.words).toBe("The cart was changed after the approval (staged by this demo, as the seller).");

      // The cap: 12 a minute here; this address has asked 8 times (the refused methods found no route, so none counted).
      for (let i = 0; i < 4; i++) expect((await verify("FAKE-9999")).status).toBe(200);
      const capped = await verify(orderId);
      expect(capped.status).toBe(429);
      expect(capped.body).toEqual(TOO_MANY);
    } finally { await s.stop(); }
  });
});

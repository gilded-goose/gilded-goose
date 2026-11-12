// Attack corpus 12: the price swap, run the way the hosted wallet runs it: the server's own fake port, the real guard, and
// the seller's one cent landing after PayPal holds the money. The guard is never told; its re-check finds it.
import { describe, expect, it } from "vitest";
import { FakePaymentPort } from "../../server/src/adapters/fake-payment.ts";
import { VOID_WORDS, demoWant, swapAfterHold, swapNow, toCents, weekSpend, type Cart, type PaymentIntent } from "../src/index.ts";
import { RETURN_WORDS, walletReturn } from "../src/view/wallet.ts";
import { world } from "./helpers.ts";

const cart = (): Cart => ({ item: demoWant().item, merchant: "Pondside Goods (fictional)", sellerId: "pondside", qty: 1, price: toCents("47.73"), currency: "USD", shape: "one-off", catalogId: "kettle" });

async function tapped(intent: PaymentIntent) {
  const w = world();
  const port = new FakePaymentPort("http://127.0.0.1:1");
  const d = w.guard.decide(demoWant(), cart());
  if (d.kind === "refused") throw new Error(d.reason);
  const { orderId } = await w.guard.place(d.bound, port, "http://127.0.0.1:1/return", intent);
  port.approve(orderId);
  return { ...w, port, bound: d.bound, orderId };
}

describe("attack corpus 12: the seller changes one cent after the tap", () => {
  it("price_swap_after_hold_voids_and_charges_nothing", async () => {
    const t = await tapped("AUTHORIZE");
    const port = swapAfterHold(t.port, t.bound, t.ledger, t.policy.shopperId, () => t.deps.clock.now());
    const r = await t.guard.settle(t.bound, t.orderId, port);
    expect(r).toEqual({ ok: false, reason: VOID_WORDS.changed.reason });
    // PayPal held the money, then released it: nothing captured, the hold voided.
    expect(t.port.authorizationCaptures).toHaveLength(0);
    expect(t.port.statusCounts()).toMatchObject({ AUTHORIZATION_VOIDED: 1 });
    const rows = t.ledger.read();
    const swap = rows.find((e) => e.action === "price-swap")!;
    expect(swap).toMatchObject({ actor: "seller", price: "47.74", why: "Price swap (staged by this demo, as the seller): the cart changed after your tap, $47.73 became $47.74. Code checks the cart again before any money moves." });
    // The seller's row lands after the hold and before the guard's answer, which is the void in fixed words.
    const held = rows.find((e) => e.action === "authorized")!;
    const voided = rows.find((e) => e.action === "voided")!;
    expect(held.seq).toBeLessThan(swap.seq);
    expect(swap.seq).toBeLessThan(voided.seq);
    expect(voided.why).toBe(VOID_WORDS.changed.why);
    expect(weekSpend(rows, t.policy.shopperId, t.deps.clock.now())).toBe(0);
    // The wallet says it in its own words.
    expect(walletReturn({ week: 1, bound: { total: "47.73", orderId: t.orderId }, settled: r, events: rows })).toEqual({ kind: "swapped", words: RETURN_WORDS.swapped });
  });

  it("price_swap_under_capture_is_refused_before_anything_moves", async () => {
    const t = await tapped("CAPTURE");
    swapNow(t.bound, t.ledger, t.policy.shopperId, t.deps.clock.now());
    const r = await t.guard.settle(t.bound, t.orderId, swapAfterHold(t.port, t.bound, t.ledger, t.policy.shopperId, () => t.deps.clock.now()));
    expect(r.ok).toBe(false);
    expect(t.port.statusCounts()).not.toHaveProperty("COMPLETED");
    expect(walletReturn({ week: 1, bound: { total: "47.73", orderId: t.orderId }, settled: r, events: t.ledger.read() })).toEqual({ kind: "swapped", words: RETURN_WORDS.swapped });
  });

  it("one swap per cart, and the port's other calls are the real port's", async () => {
    const t = await tapped("AUTHORIZE");
    swapNow(t.bound, t.ledger, t.policy.shopperId, 0);
    swapNow(t.bound, t.ledger, t.policy.shopperId, 0);
    expect(t.bound.cart.price).toBe(toCents("47.74"));
    expect(t.ledger.read().filter((e) => e.action === "price-swap")).toHaveLength(1);
    const port = swapAfterHold(t.port, t.bound, t.ledger, t.policy.shopperId, () => 0);
    expect((await port.get(t.orderId)).id).toBe(t.orderId);
  });
});

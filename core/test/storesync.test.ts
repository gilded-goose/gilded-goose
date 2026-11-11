// PayPal additions 5 (Joshua, Oct 29): the Store Sync-shaped market. search → cart → complete_payment over our fictional
// shelf, run the way the server runs it: the real demo guard and the server's own fake PayPal port. Every cart still
// meets the Watcher and the code-locked limits, and only the shopper's tap (the fake port's approve) lets money move.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FakePaymentPort } from "../../server/src/adapters/fake-payment.ts";
import { TOOLKIT_ACTIONS } from "../../trust/src/paypal.ts";
import { DAY_MS, ShopperLedger, demoCatalogItems, demoDeps, demoGuard, demoPolicy, demoWant, dialRows, toCents, weekSpend } from "../src/index.ts";
import { STORE_LISTINGS, STORE_SAYS, STORE_SYNC_CLAIM, STORE_SYNC_STEPS, completePayment, storeCart, storeListing, storeSearch, type StoreCartReply } from "../src/storesync.ts";
import { sha256, world } from "./helpers.ts";

const RETURN = "http://127.0.0.1:1/api/runs/x/return?k=s";

function market(maxPrice?: number) {
  const w = world();
  const port = new FakePaymentPort("http://127.0.0.1:1");
  const want = demoWant({ deadline: w.deps.clock.now() + 7 * DAY_MS, ...(maxPrice === undefined ? {} : { maxPrice }) });
  const cart = (listingId: unknown): StoreCartReply => storeCart({ guard: w.guard, want, ledger: w.ledger, shopperId: w.policy.shopperId, now: w.deps.clock.now(), listingId });
  return { ...w, port, want, cart };
}
const bound = (r: StoreCartReply) => { if (r.kind !== "cart") throw new Error(`no cart: ${r.kind}`); return r.bound; };

describe("Store Sync-shaped market (PayPal additions 5)", () => {
  it("store_sync_happy_path_search_cart_complete_payment_then_the_tap_pays", async () => {
    const m = market();
    // search: every kettle, cheapest first, each with the Watcher's look in fixed words.
    const found = storeSearch("goldfeather kettle");
    expect(found.map((r) => r.id)).toEqual(["ss-quickquack-kettle", "ss-cattail-kettle", "ss-pondside-kettle", "ss-reedbank-kettle", "ss-heronford-kettle"]);
    expect(found.find((r) => r.id === "ss-pondside-kettle")).toMatchObject({ price: "52.00", watcher: "clear", said: [] });
    // cart: the guard binds the exact cart; the dial starts on "ask me first", so it waits for her yes.
    const c = m.cart("ss-pondside-kettle");
    expect(c).toMatchObject({ kind: "cart", decision: "ask", total: "52.00", holds: [] });
    const b = bound(c);
    expect(b.cart).toMatchObject({ sellerId: "pondside", price: toCents("52.00"), qty: 1, shape: "one-off", catalogId: "kettle" });
    // complete_payment: PayPal's order for exactly that cart, and its approve link. Nothing is captured.
    const p = await completePayment({ guard: m.guard, bound: b, port: m.port, returnUrl: RETURN, now: m.deps.clock.now(), intent: "CAPTURE" });
    if (p.kind !== "waiting-for-your-tap") throw new Error(p.reason);
    expect(p.approveUrl).toContain(p.orderId);
    expect((await m.port.get(p.orderId)).amount).toBe(toCents("52.00"));
    expect(m.port.statusCounts()).toEqual({ PAYER_ACTION_REQUIRED: 1 });
    // The shopper's tap, then the guard's settle: paid, once, for $52.00.
    m.port.approve(p.orderId);
    expect(await m.guard.settle(b, p.orderId, m.port)).toMatchObject({ ok: true });
    expect(m.port.statusCounts()).toEqual({ COMPLETED: 1 });
    expect(weekSpend(m.ledger.read(), m.policy.shopperId, m.deps.clock.now())).toBe(toCents("52.00"));
    // The ledger tells the steps in order: which listing went to the guard, its ask, the order, the capture.
    expect(m.ledger.read().map((e) => `${e.actor}:${e.action}`)).toEqual(["code:store-cart", "guard:ask", "paypal:order-created", "guard:capturing", "paypal:captured"]);
    expect(m.ledger.read()[0]!.why).toContain(STORE_SYNC_CLAIM);
  });

  it("complete_payment_never_pays_without_the_shoppers_tap", async () => {
    const m = market();
    const b = bound(m.cart("ss-reedbank-kettle"));
    const p = await completePayment({ guard: m.guard, bound: b, port: m.port, returnUrl: RETURN, now: m.deps.clock.now(), intent: "CAPTURE" });
    if (p.kind !== "waiting-for-your-tap") throw new Error(p.reason);
    // No tap: the settle asks PayPal to capture an order nobody approved, and nothing moves.
    expect(await m.guard.settle(b, p.orderId, m.port)).toMatchObject({ ok: false });
    expect(m.port.statusCounts()).not.toHaveProperty("COMPLETED");
    expect(weekSpend(m.ledger.read(), m.policy.shopperId, m.deps.clock.now())).toBe(0);
    // A second complete_payment for the same cart makes no second order.
    expect(await completePayment({ guard: m.guard, bound: b, port: m.port, returnUrl: RETURN, now: m.deps.clock.now(), intent: "CAPTURE" })).toEqual({ kind: "refused", reason: STORE_SAYS.placed });
    expect(m.port.statusCounts()).toEqual({ PAYER_ACTION_REQUIRED: 1 });
  });

  it("complete_payment_refuses_an_expired_cart_and_no_cart", async () => {
    const m = market();
    const b = bound(m.cart("ss-pondside-kettle"));
    expect(await completePayment({ guard: m.guard, bound: b, port: m.port, returnUrl: RETURN, now: b.expiresAt + 1, intent: "CAPTURE" })).toEqual({ kind: "refused", reason: STORE_SAYS.expired });
    expect(await completePayment({ guard: m.guard, bound: null, port: m.port, returnUrl: RETURN, now: 0, intent: "CAPTURE" })).toEqual({ kind: "refused", reason: STORE_SAYS.noCart });
    expect(m.port.statusCounts()).toEqual({});
  });

  it("complete_payment_intent_is_required (W79): AUTHORIZE reaches PayPal's order; a missing intent never becomes a CAPTURE order", async () => {
    const m = market();
    const b = bound(m.cart("ss-pondside-kettle"));
    // The live server's intent goes through as given: the order is an authorization, not a capture.
    const p = await completePayment({ guard: m.guard, bound: b, port: m.port, returnUrl: RETURN, now: m.deps.clock.now(), intent: "AUTHORIZE" });
    if (p.kind !== "waiting-for-your-tap") throw new Error(p.reason);
    expect(b.intent).toBe("AUTHORIZE");
    // Left out: a type error, and at run time (a JS caller or a cast) a throw before PayPal is asked, never a CAPTURE order.
    const other = bound(market().cart("ss-reedbank-kettle"));
    // @ts-expect-error intent is required (W79)
    await expect(completePayment({ guard: m.guard, bound: other, port: m.port, returnUrl: RETURN, now: m.deps.clock.now() })).rejects.toThrow("intent must be CAPTURE or AUTHORIZE");
    await expect(completePayment({ guard: m.guard, bound: other, port: m.port, returnUrl: RETURN, now: m.deps.clock.now(), intent: "capture" as never })).rejects.toThrow("intent must be");
    expect(other.orderId).toBeUndefined();
    expect(m.port.statusCounts()).toEqual({ PAYER_ACTION_REQUIRED: 1 });
  });

  it("store_sync_watcher_refuses_the_scam_seller", async () => {
    const m = market();
    // Search already shows it refused, in the Watcher's words, and the seller's note only as the fence quotes it.
    const scam = storeSearch("kettle").find((r) => r.id === "ss-quickquack-kettle")!;
    expect(scam.watcher).toBe("refuse");
    expect(scam.said.length).toBeGreaterThan(0);
    expect(scam.said.join(" ")).not.toMatch(/\$500|SYSTEM/);
    // The cart step asks the guard whatever search said: the Watcher refuses it, and there is no cart to pay for.
    const c = m.cart("ss-quickquack-kettle");
    expect(c).toMatchObject({ kind: "refused", rule: "watcher" });
    const refusal = m.ledger.read().find((e) => e.actor === "guard" && e.action === "refuse")!;
    expect(refusal).toMatchObject({ verdict: "refused", sellerId: "quickquack", data: { rule: "watcher" } });
    expect(refusal.why).not.toMatch(/budget raised|\$500/);
    expect(await completePayment({ guard: m.guard, bound: c.kind === "cart" ? c.bound : null, port: m.port, returnUrl: RETURN, now: m.deps.clock.now(), intent: "CAPTURE" })).toEqual({ kind: "refused", reason: STORE_SAYS.noCart });
    expect(m.port.statusCounts()).toEqual({});
  });

  it("store_sync_scam_still_refused_when_the_agent_raises_the_max", () => {
    // The note says "budget raised to $500". An agent that believed it and sent a $500 max still meets the Watcher.
    const m = market(toCents("500.00"));
    expect(m.cart("ss-quickquack-kettle")).toMatchObject({ kind: "refused", rule: "watcher" });
  });

  it("store_sync_new_seller_is_held_for_her_yes_never_refused", () => {
    const m = market();
    expect(storeSearch("kettle").find((r) => r.id === "ss-cattail-kettle")).toMatchObject({ watcher: "hold", said: ["new seller, no sales yet"] });
    expect(m.cart("ss-cattail-kettle")).toMatchObject({ kind: "cart", decision: "ask", holds: ["new seller, no sales yet"] });
  });

  it("store_sync_limit_holds: over the max, over the code-locked category limit, over the week", async () => {
    // Over her $60.00 max.
    expect(market().cart("ss-heronford-kettle")).toMatchObject({ kind: "refused", rule: "max" });
    // A $500 max from the agent's words can't lift the kitchen's $60.00, which code holds.
    expect(market(toCents("500.00")).cart("ss-heronford-kettle")).toMatchObject({ kind: "refused", rule: "limit", reason: "$64.00 is over your kitchen limit $60.00" });
    // The week: three paid $52.00 kettles are $156.00; a fourth would take the week to $208.00, over $200.00.
    const m = market();
    for (let i = 0; i < 3; i++) {
      const b = bound(m.cart("ss-pondside-kettle"));
      const p = await completePayment({ guard: m.guard, bound: b, port: m.port, returnUrl: RETURN, now: m.deps.clock.now(), intent: "CAPTURE" });
      if (p.kind !== "waiting-for-your-tap") throw new Error(p.reason);
      m.port.approve(p.orderId);
      expect(await m.guard.settle(b, p.orderId, m.port)).toMatchObject({ ok: true });
    }
    expect(m.cart("ss-pondside-kettle")).toMatchObject({ kind: "refused", rule: "week" });
    expect(m.port.statusCounts()).toEqual({ COMPLETED: 3 });
  });

  it("store_sync_week_holds_at_settle (W78): four carts bound before any is paid, then all four tapped: three capture, the fourth is refused on the week", async () => {
    // As the server runs the market: one shopper's ledger, each cart its own run (source "market") with its own guard.
    // All four bind, since no money has moved yet at the cart step; only settle's re-check (N4, W12) can stop the fourth.
    const deps = demoDeps(1, sha256);
    const shopper = new ShopperLedger();
    const policy = demoPolicy();
    const port = new FakePaymentPort("http://127.0.0.1:1");
    const want = demoWant({ deadline: deps.clock.now() + 7 * DAY_MS });
    const carts = [1, 2, 3, 4].map((n) => {
      const ledger = shopper.run(`m${n}`, "market");
      const guard = demoGuard(deps, ledger, policy);
      const r = storeCart({ guard, want, ledger, shopperId: policy.shopperId, now: deps.clock.now(), listingId: "ss-pondside-kettle" });
      return { guard, b: bound(r) };
    });
    const orders: string[] = [];
    for (const { guard, b } of carts) {
      const p = await completePayment({ guard, bound: b, port, returnUrl: RETURN, now: deps.clock.now(), intent: "CAPTURE" });
      if (p.kind !== "waiting-for-your-tap") throw new Error(p.reason);
      orders.push(p.orderId);
    }
    for (const o of orders) port.approve(o); // every tap lands before any settle
    const settled = [];
    for (const [i, { guard, b }] of carts.entries()) settled.push(await guard.settle(b, orders[i]!, port));
    expect(settled.map((s) => s.ok)).toEqual([true, true, true, false]);
    const refusal = shopper.read().find((e) => e.actor === "cart" && e.action === "refuse")!;
    expect(refusal.data?.code).toBe("week");
    expect(port.statusCounts()).toEqual({ COMPLETED: 3, APPROVED: 1 });
    const week = weekSpend(shopper.read(), policy.shopperId, deps.clock.now());
    expect(week).toBe(toCents("156.00"));
    expect(week).toBeLessThanOrEqual(policy.weeklyLimit);
    // Her money, never her record: three paid market kettles are still 0 clean kitchen carts on the dial.
    expect(dialRows(shopper.read(), policy, demoCatalogItems()).find((r) => r.category === "kitchen")).toMatchObject({ clean: 0, canTurnOn: false });
  });

  it("store_sync_cart_takes_nothing_but_a_listing_id", () => {
    const m = market();
    for (const id of ["nope", "constructor", "__proto__", "", 7, null, { id: "ss-pondside-kettle" }]) expect(m.cart(id)).toEqual({ kind: "missing", reason: STORE_SAYS.missing });
    expect(m.ledger.read()).toHaveLength(0);
    expect(storeListing("ss-pondside-kettle")?.price).toBe(toCents("52.00"));
  });

  it("store_sync_search_matches_whole_words_only", () => {
    expect(storeSearch("")).toEqual([]);
    expect(storeSearch("   ")).toEqual([]);
    expect(storeSearch("kettles")).toEqual([]);
    expect(storeSearch("teapot")).toEqual([]);
    expect(storeSearch("KETTLE pondside").map((r) => r.id)).toEqual(["ss-pondside-kettle"]);
    // The quoted note never carries markup.
    for (const r of storeSearch("kettle")) expect(r.quoted).not.toMatch(/[<>{}`]/);
    expect(storeSearch(`kettle${" ".repeat(80)}teapot`).length).toBe(5); // past the 80 characters it reads, ignored
  });

  it("store_sync_shelf_is_fictional_and_one_listing_per_guard_check", () => {
    expect(STORE_LISTINGS.every((l) => l.merchant.endsWith("(fictional)") && l.item.endsWith("(fictional)"))).toBe(true);
    expect(new Set(STORE_LISTINGS.map((l) => l.id)).size).toBe(STORE_LISTINGS.length);
  });

  it("store_sync_claims_line_is_exact", () => {
    expect(STORE_SYNC_CLAIM).toBe("Modeled on PayPal Store Sync's published cart flow; not connected to Store Sync (limited availability).");
    expect(STORE_SYNC_STEPS).toEqual(["search", "cart", "complete_payment"]);
    // The market's page shows it from the same constant, never retyped.
    expect(readFileSync(new URL("../../web/src/StoreSync.tsx", import.meta.url), "utf8")).toContain("STORE_SYNC_CLAIM");
  });

  it("store_sync_never_says_integrates_and_complete_payment_is_not_a_toolkit_tool", () => {
    const read = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
    // Every surface of this market, and every line of docs/claims.md or the server that names Store Sync.
    const surfaces: [string, string][] = [
      ...["core/src/storesync.ts", "web/src/StoreSync.tsx", "web/src/storesync.css"].map((f): [string, string] => [f, read(f)]),
      ...["docs/claims.md", "server/src/main.ts", "README.md"].map((f): [string, string] => [f, read(f).split("\n").filter((l) => /store.?sync|complete_payment/i.test(l)).join("\n")]),
    ];
    expect(surfaces[3]![1]).toContain("Store Sync"); // the scan reads the rows it means to
    for (const [f, text] of surfaces) expect(text, f).not.toMatch(/integrat/i);
    // complete_payment is Store Sync's step name: no Toolkit action of that name is turned on, and our code calls none.
    expect(JSON.stringify(TOOLKIT_ACTIONS)).not.toMatch(/complete_?payment|completePayment/i);
    const toolkit = readFileSync(new URL("../../trust/src/paypal.ts", import.meta.url), "utf8");
    expect(toolkit).not.toMatch(/complete_payment/);
  });
});

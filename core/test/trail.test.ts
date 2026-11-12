// S1-4: the deal card's and the Paid card's trail ("held → re-checked → captured", the order id, PayPal's signed word,
// the cart's mark) reads only the rows the guard and the webhook route write. Every case runs the real guard against
// the server's fake port (the one CI uses), so the rows under test are the ones the screen gets.
import { describe, expect, it } from "vitest";
import { FakePaymentPort } from "../../server/src/adapters/fake-payment.ts";
import { APPROVAL_TTL_MS, demoWant, toCents, type Cart } from "../src/index.ts";
import { webhookRow } from "../../trust/src/webhook.ts";
import { CART_MARK, TRAIL_WORDS, cartMark, payAhead, payTrail, sealsAtTap, shortId, signedWords, stepsAhead, stepsGloss } from "../src/view/trail.ts";
import { world } from "./helpers.ts";
import { readFileSync } from "node:fs";
import { MADE_BY_WORDS, madeByWords } from "../src/view/desk.ts";
import { RECORDED_MAKER_NAME } from "../src/ask/recorded-market.ts";
import { FIXED_MAKER_NAME } from "../src/ask/fictional-market.ts";
import { BUYER_MODEL } from "../../server/src/adapters/claude.ts";

const cart = (price: string): Cart => ({ item: demoWant().item, merchant: "Pondside Goods (fictional)", sellerId: "pondside", qty: 1, price: toCents(price), currency: "USD", shape: "one-off", catalogId: "kettle" });

async function placed(intent: "AUTHORIZE" | "CAPTURE" = "AUTHORIZE") {
  const w = world();
  const port = new FakePaymentPort("http://127.0.0.1:1");
  const d = w.guard.decide(demoWant(), cart("42.00"));
  if (d.kind === "refused") throw new Error(d.reason);
  const { orderId } = await w.guard.place(d.bound, port, "http://127.0.0.1:1/return", intent);
  return { ...w, port, bound: d.bound, orderId };
}
const steps = (t: ReturnType<typeof payTrail>) => t?.steps.map((s) => `${s.label}:${s.state}`);

describe("payTrail: the engineering on the card, from the rows", () => {
  it("nothing before PayPal is asked: no order row, no trail", () => {
    const w = world();
    expect(payTrail(w.ledger.read())).toBeNull();
    expect(payTrail(null)).toBeNull();
    expect(payTrail([{ actor: "paypal", action: "order-created", data: {} }])).toBeNull();
  });

  it("an order waiting for the tap: the order id and the cart's mark, every step still ahead", async () => {
    const { ledger, bound, orderId } = await placed();
    const t = payTrail(ledger.read())!;
    expect(t.orderId).toBe(orderId);
    expect(t.cart).toBe(bound.hash.slice(0, CART_MARK));
    // The guard's own row names the same eight characters, so the screen and the ledger agree.
    expect(ledger.read().find((e) => e.action === "order-created")!.why).toContain(`${bound.hash.slice(0, CART_MARK)}…`);
    expect(steps(t)).toEqual(["Held:next", "Re-checked:next", "Captured:next"]);
    expect(t.paid).toBe(false);
    expect(signedWords(t, false)).toBe(TRAIL_WORDS.open);
    // A CAPTURE server never holds, so its open trail has no Held step.
    expect(steps(payTrail(ledger.read(), undefined, "CAPTURE"))).toEqual(["Re-checked:next", "Captured:next"]);
  });

  it("a stop the guard can't call clean never says nothing was taken, nor claims a re-check it may not have run", async () => {
    const { ledger, orderId } = await placed();
    const at = (action: string, actor = "paypal", extra: Record<string, unknown> = {}) => payTrail([...ledger.read(), { actor, action, why: "Stopped here.", data: { orderId, ...extra } }])!;
    for (const a of ["capture-mismatch", "void-failed"]) {
      const t = at(a);
      expect(steps(t), a).toEqual(["Re-checked:done", "Stopped:stopped"]);
      expect(signedWords(t, true), a).toBe(TRAIL_WORDS.cantTell);
    }
    const unknown = at("capture-failed", "paypal", { code: "unknown" });
    expect(steps(unknown)).toEqual(["Re-checked:done", "Stopped:stopped"]);
    expect(signedWords(unknown, true)).toBe(TRAIL_WORDS.cantTell);
    // A settle that threw (the guard's own refusal row) may come before the re-check: no re-check is claimed.
    const threw = at("refuse", "cart", { code: "settle-failed" });
    expect(steps(threw)).toEqual(["Stopped:stopped"]);
    expect(signedWords(threw, true)).toBe(TRAIL_WORDS.cantTell);
    expect(TRAIL_WORDS.cantTell).not.toMatch(/nothing was taken/i);
  });

  it("held → re-checked → captured, then PayPal's signed word", async () => {
    const { guard, ledger, port, bound, orderId } = await placed();
    port.approve(orderId);
    const r = await guard.settle(bound, orderId, port);
    expect(r.ok).toBe(true);
    let t = payTrail(ledger.read())!;
    expect(steps(t)).toEqual(["Held:done", "Re-checked:done", "Captured:done"]);
    expect(t.paid).toBe(true);
    expect(t.signed).toBeNull();
    expect(signedWords(t, false)).toBe(TRAIL_WORDS.waiting);
    expect(signedWords(t, true)).toBe(TRAIL_WORDS.late);
    // The hold's own event lands first in AUTHORIZE: it never stands in for the capture's (nor stops the wait for it).
    ledger.append({ t: 1, shopperId: "s", ...webhookRow({ eventId: "WH-0", kind: "authorization-created", resourceId: "AUTH", orderId, amount: toCents("42.00"), currency: "USD" }, true) });
    t = payTrail(ledger.read())!;
    expect(t.signed).toBeNull();
    expect(signedWords(t, false)).toBe(TRAIL_WORDS.waiting);
    const captureId = r.ok ? r.captureId : "";
    ledger.append({ t: 1, shopperId: "s", ...webhookRow({ eventId: "WH-1", kind: "capture-completed", resourceId: captureId, orderId, amount: toCents("42.00"), currency: "USD" }, true) });
    t = payTrail(ledger.read())!;
    expect(t.signed).toEqual({ eventId: "WH-1", eventType: "PAYMENT.CAPTURE.COMPLETED" });
    expect(signedWords(t, false)).toBe(TRAIL_WORDS.signed);
    // A PAYMENT=fake server signs with its own practice PayPal: the words never say it was PayPal itself.
    expect(signedWords(t, false, true)).toBe(TRAIL_WORDS.practice);
    expect(TRAIL_WORDS.practice).toMatch(/practice/);
    // Session 5: the sentences are short; the webhook row carries "Signed" (Trail.tsx draws it only with `t.signed`).
    expect(TRAIL_WORDS.signed).not.toMatch(/signed/i);
    expect(TRAIL_WORDS.signedBy).toBe("Signed");
  });

  it("an unmatched or another order's webhook never confirms this cart", async () => {
    const { guard, ledger, port, bound, orderId } = await placed();
    port.approve(orderId);
    await guard.settle(bound, orderId, port);
    ledger.append({ t: 1, shopperId: "s", ...webhookRow({ eventId: "WH-2", kind: "capture-completed", resourceId: "X", orderId: "OTHER-ORDER" }, true) });
    ledger.append({ t: 2, shopperId: "s", ...webhookRow({ eventId: "WH-3", kind: "capture-completed", resourceId: "Y" }, false) });
    expect(payTrail(ledger.read())!.signed).toBeNull();
  });

  it("the cart changed after the hold: held → re-checked → voided, with the guard's words", async () => {
    const t0 = await placed();
    t0.port.approve(t0.orderId);
    const authorize = t0.port.authorize.bind(t0.port);
    t0.port.authorize = async (...a) => { const r = await authorize(...a); t0.bound.cart = { ...t0.bound.cart, merchant: "Someone Else (fictional)" }; return r; };
    const r = await t0.guard.settle(t0.bound, t0.orderId, t0.port);
    expect(r.ok).toBe(false);
    const t = payTrail(t0.ledger.read())!;
    expect(steps(t)).toEqual(["Held:done", "Re-checked:done", "Voided:done"]);
    expect(t.why).toBe(t0.ledger.read().find((e) => e.action === "voided")!.why);
    expect(t.paid).toBe(false);
    expect(signedWords(t, true)).toBe(TRAIL_WORDS.none);
  });

  it("CAPTURE intent has no hold: re-checked → captured", async () => {
    const { guard, ledger, port, bound, orderId } = await placed("CAPTURE");
    port.approve(orderId);
    expect((await guard.settle(bound, orderId, port)).ok).toBe(true);
    expect(steps(payTrail(ledger.read()))).toEqual(["Re-checked:done", "Captured:done"]);
  });

  it("a settle the guard refused before any hold: not captured, never a done step it didn't take", async () => {
    const { guard, ledger, port, bound, orderId, deps } = await placed();
    port.approve(orderId);
    // A stranger's return naming another order is refused on that order's id, so it never stops this cart's trail.
    expect((await guard.settle(bound, "NOT-THIS-ORDER", port)).ok).toBe(false);
    expect(steps(payTrail(ledger.read()))).toEqual(["Held:next", "Re-checked:next", "Captured:next"]);
    deps.clock.advance(APPROVAL_TTL_MS + 1);
    expect(await guard.settle(bound, orderId, port)).toMatchObject({ ok: false, reason: "approval expired" });
    const t = payTrail(ledger.read())!;
    expect(steps(t)).toEqual(["Not captured:stopped"]);
    expect(t.why).toBe("Not capturing: approval expired.");
  });

  it("the deal card after Approve: the steps the server's intent takes, all ahead, and the bound cart's mark", async () => {
    const { bound } = await placed();
    expect(steps(payAhead("AUTHORIZE", bound.hash))).toEqual(["Held:next", "Re-checked:next", "Captured:next"]);
    expect(steps(payAhead("CAPTURE", bound.hash))).toEqual(["Re-checked:next", "Captured:next"]);
    expect(payAhead("AUTHORIZE", bound.hash)).toMatchObject({ orderId: null, cart: bound.hash.slice(0, CART_MARK), paid: false, signed: null });
    // An intent the server didn't name, or no hash: nothing is drawn rather than a guess.
    expect(payAhead(undefined, bound.hash)).toBeNull();
    expect(payAhead("AUTHORIZE", "")).toBeNull();
  });

  it("the deal card before the tap (S1-6): the same steps ahead, no cart mark until the guard binds one", () => {
    expect(steps(stepsAhead("AUTHORIZE"))).toEqual(["Held:next", "Re-checked:next", "Captured:next"]);
    expect(steps(stepsAhead("CAPTURE"))).toEqual(["Re-checked:next", "Captured:next"]);
    expect(stepsAhead("AUTHORIZE")).toMatchObject({ orderId: null, cart: null, paid: false, signed: null });
    expect(stepsAhead(undefined)).toBeNull();
    // Before the tap the sentence says when code seals the cart, never that it has.
    for (const w of Object.values(TRAIL_WORDS.sealsAtTap)) {
      expect(w).toMatch(/^When you tap Approve, code seals this exact cart and PayPal asks for your OK\./);
      expect(w).not.toMatch(/sealed|asked for nothing else/);
    }
    // S1-9 (Round 3, N2): the sentence walks the server's own steps, in order, from the shopper's OK in PayPal.
    const order = (s: string, words: string[]) => words.map((x) => s.indexOf(x));
    const auth = sealsAtTap("AUTHORIZE")!;
    expect(order(auth, ["your OK", "holds the money", "re-checks the cart", "captures it", "voided"]).every((i, k, a) => i >= 0 && (k === 0 || i > a[k - 1]!))).toBe(true);
    const cap = sealsAtTap("CAPTURE")!;
    expect(cap).not.toMatch(/hold/);
    expect(order(cap, ["your OK", "re-checks the cart", "captures exactly that"]).every((i, k, a) => i >= 0 && (k === 0 || i > a[k - 1]!))).toBe(true);
    expect(sealsAtTap(undefined)).toBeNull();
    // S1-11 (Round 4's consumer: "captures" / "voided" read as jargon): one plain line under the steps, by intent.
    expect(stepsGloss("AUTHORIZE")).toBe("Captured means PayPal takes the money; voided means the hold is released and nothing is taken.");
    expect(stepsGloss("CAPTURE")).toBe("Captured means PayPal takes the money.");
    expect(stepsGloss(undefined)).toBeNull();
  });

  it("the mark and the short id", () => {
    expect(cartMark("C5F48626C6BD86027629BEC467AC3418")).toBe("c5f48626");
    expect(cartMark("not a hash")).toBeNull();
    expect(cartMark(undefined)).toBeNull();
    expect(shortId("6BL5024492609723T")).toBe("6BL5024492609723T");
    expect(shortId("A".repeat(40))).toBe(`${"A".repeat(14)}…${"A".repeat(5)}`);
  });
});

// Round 1 (cold consumer test): the run's footnote said "Sellers made by: claude-haiku-5-5". Plain words; no model id.
describe("madeByWords: who made the sellers, in a shopper's words", () => {
  it("the recorded week, the fixed set and the AI model each read plainly, and no model id reaches the card", () => {
    expect(madeByWords(RECORDED_MAKER_NAME)).toBe(MADE_BY_WORDS.recorded);
    expect(madeByWords(FIXED_MAKER_NAME)).toBe(MADE_BY_WORDS.fixed);
    expect(madeByWords(BUYER_MODEL)).toBe(MADE_BY_WORDS.ai);
    for (const w of Object.values(MADE_BY_WORDS)) expect(w).not.toMatch(/claude|haiku|\d-\d/i);
    const desk = readFileSync(new URL("../../web/src/desk/Desk.tsx", import.meta.url), "utf8");
    expect(desk).toContain("{marketLine(market.madeBy)}"); // DK check 2: the footnote joined the run's honesty line
    expect(desk).not.toContain("Sellers made by:");
  });
});

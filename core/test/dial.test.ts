// Dial proper (QUEUE M3, never cut; PROFILE layer 5): one category, 3 clean carts before the shopper's one tap may turn
// it on, 1 bad pick turns it back, one tap in Settings turns it back with the record kept, and recurring or deferred
// payment always asks. "On" never spends: the guard binds the exact cart and only the shopper's tap in PayPal pays.
import { describe, expect, it } from "vitest";
import {
  BRING_BACK, DEMO_SHOPPER, DIAL_ALWAYS_ASKS, DemoShoppers, NEW_SELLERS_ASK_FIRST, NOT_THIS_ONE, ShopperLedger, STRONG_RECORD, askFirst, demoCatalogItems, demoDeps, demoGuard, demoPolicy, demoWant,
  dialFor, dialPreview, dialRows, grantDial, settleDial, toCents, type Cart, type LedgerEvent, type NewEvent,
} from "../src/index.ts";
import { sha256 } from "./helpers.ts";

const CAT = demoCatalogItems();
// A clean kettle cart, as settle writes its capture (W11: the catalog entry the row names), from a live run.
const captured = (t: number, over: Partial<NewEvent> = {}): NewEvent => ({ t, shopperId: DEMO_SHOPPER, visibility: "owner", actor: "paypal", action: "captured", verdict: "ok", price: "47.73", why: "w", data: { catalogId: "kettle" }, source: "live", ...over });
const veto = (t: number): NewEvent => ({ t, shopperId: DEMO_SHOPPER, visibility: "owner", actor: "auditor", action: "veto", verdict: "refused", why: "w", source: "live" });
/** Write one row as the server does, through its run, which stamps the run id and source. */
function put(l: ShopperLedger, { runId, source, ...e }: NewEvent): void { l.run(runId ?? "r0", source ?? "live").append(e); }
const rows = (...es: NewEvent[]): LedgerEvent[] => { const l = new ShopperLedger(); for (const e of es) put(l, e); return l.read(); };
const cart = (price: string, extra: Partial<Cart> = {}): Cart => ({ item: demoWant().item, merchant: "Pondside Goods (fictional)", sellerId: "pondside", qty: 1, price: toCents(price), currency: "USD", shape: "one-off", catalogId: "kettle", ...extra });

/** What a demo guard built over these shopper rows decides for a $40 kettle cart from a seller with a record. */
function decides(policy: ReturnType<typeof demoPolicy>, es: NewEvent[], c = cart("40.00")) {
  const shopper = new ShopperLedger();
  for (const e of es) put(shopper, e);
  const run = shopper.run("r-next", "live");
  return demoGuard({ ...demoDeps(1, sha256), clock: { now: () => 10_000 } }, run, policy).decide(demoWant({ deadline: Number.MAX_SAFE_INTEGER }), c, [], 412).kind;
}

describe("dial proper (QUEUE M3): granted at a strong record, revoked by a bad pick, turned back in one tap", () => {
  // Only a fuzz test's luck covered this: widening its notes changed the draws and money coverage fell to 99.2%. A money
  // path gets a test with its name, so no change to a generator can take its coverage away.
  it("the dial on doesn't outrank the shopper's own chip: new sellers still ask first, and a seller with a record still goes on", () => {
    const decide = (history: number | null) => {
      const run = new ShopperLedger().run("r-next", "live");
      const guard = demoGuard({ ...demoDeps(1, sha256), clock: { now: () => 10_000 } }, run, demoPolicy({ dial: { kitchen: "buy-within-limits" } }));
      return guard.decide(demoWant({ deadline: Number.MAX_SAFE_INTEGER }), cart("40.00"), [{ kind: "seller", value: NEW_SELLERS_ASK_FIRST }], history);
    };
    for (const history of [0, null]) {
      const d = decide(history);
      expect([history, d.kind]).toEqual([history, "ask"]);
      expect(d.reason).toMatch(/new sellers ask first/);
    }
    expect(decide(412).kind).toBe("buy");
  });

  it("dial_turns_on_only_at_a_strong_record: under 3 clean carts the tap changes nothing; at 3 it turns on for that category alone", () => {
    expect(STRONG_RECORD).toBe(3);
    const p = demoPolicy();
    expect(() => grantDial(p, "kitchen", 2, 100)).toThrow(/after 3 clean carts; this category has 2/);
    expect(() => grantDial(p, "kitchen", Number.NaN, 100)).toThrow();
    const on = grantDial(p, "kitchen", 3, 100);
    expect(dialFor(on, "kitchen")).toBe("buy-within-limits");
    expect(dialFor(on, "clothing")).toBe("ask-first");
    expect(on.dialSince).toEqual({ kitchen: 100 });
    expect(on.categoryLimit).toEqual(p.categoryLimit); // no limit changes
    expect(dialFor(p, "kitchen")).toBe("ask-first"); // the old Policy is untouched

    // The store counts the record from the session's own rows: the seeded week never counts (N19), two live carts aren't
    // enough, the third is.
    const shoppers = new DemoShoppers();
    const at = Date.now();
    expect(() => shoppers.setDial("me", "kitchen", true, at)).toThrow(/has 0/);
    expect(() => shoppers.setDial("me", "garden-gnomes", true, at)).toThrow(/not a catalog category/);
    const mine = shoppers.for("me", at);
    put(mine, captured(at + 1));
    put(mine, captured(at + 2));
    expect(() => shoppers.setDial("me", "kitchen", true, at + 3)).toThrow(/has 2/);
    expect(dialFor(shoppers.session("me", at + 3).policy, "kitchen")).toBe("ask-first");
    put(mine, captured(at + 3));
    expect(dialFor(shoppers.setDial("me", "kitchen", true, at + 4), "kitchen")).toBe("buy-within-limits");
    // Another browser's dial is its own.
    expect(dialFor(shoppers.session("you", at + 4).policy, "kitchen")).toBe("ask-first");
  });

  it("dial_on_gets_the_cart_ready_and_still_asks_for_recurring_or_deferred: buy (one tap in PayPal), never for a subscription or Pay Later", () => {
    const clean = [captured(1), captured(2), captured(3)];
    const on = grantDial(demoPolicy(), "kitchen", 3, 50);
    expect(decides(on, clean)).toBe("buy");
    // Control: the same cart with the dial off asks.
    expect(decides(demoPolicy(), clean)).toBe("ask");
    // Project Lesson 4's gate: the dial never covers a recurring or deferred payment.
    expect(decides(on, clean, cart("40.00", { shape: "subscription" }))).toBe("ask");
    expect(decides(on, clean, cart("40.00", { shape: "pay-later" }))).toBe("ask");
    // Over the category's limit is refused whatever the dial says.
    expect(decides(on, clean, cart("60.01"))).toBe("refused");
  });

  it("one_bad_pick_turns_the_dial_back: an Auditor veto or a Not this one after the tap turns it back, and the guard asks", () => {
    const on = grantDial(demoPolicy(), "kitchen", 3, 50);
    const clean = [captured(1), captured(2), captured(3)];
    for (const bad of [veto(60), { ...veto(60), actor: "shopper" as const, action: NOT_THIS_ONE, runId: "r1" }, captured(60, { actor: "paypal", action: "refunded" })]) {
      const es = [...clean, bad];
      expect(dialFor(settleDial(on, rows(...es)), "kitchen")).toBe("ask-first");
      expect(decides(on, es)).toBe("ask");
    }
    // A bad pick at the tap's own moment counts too (at or after).
    expect(dialFor(settleDial(on, rows(...clean, veto(50))), "kitchen")).toBe("ask-first");
    // A bad pick before the tap was already behind the record that earned it: the dial stands.
    const earlier = [veto(0), ...clean];
    expect(dialFor(settleDial(on, rows(...earlier)), "kitchen")).toBe("buy-within-limits");
    expect(decides(on, earlier)).toBe("buy");
    // A misheard "no" taken back ("Bring it back", the same run) withdraws the bad pick: the dial stands again.
    const back = [...clean, { ...veto(60), actor: "shopper" as const, action: NOT_THIS_ONE, runId: "r1" }, { ...captured(61), actor: "shopper" as const, action: BRING_BACK, verdict: "ok" as const, runId: "r1" }];
    expect(dialFor(settleDial(on, rows(...back)), "kitchen")).toBe("buy-within-limits");
    // A new record never turns a fallen dial back on: three more clean carts after the veto (small ones, so the week has
    // room for the next), and it still asks.
    const after = [...clean, veto(60), ...[70, 71, 72].map((t) => captured(t, { price: "5.00" }))];
    expect(dialFor(settleDial(on, rows(...after)), "kitchen")).toBe("ask-first");
    expect(decides(on, after)).toBe("ask");
    // Seeded and attack rows never reach the dial (N19): a seeded veto after the tap turns nothing back.
    expect(dialFor(settleDial(on, rows(...clean, { ...veto(60), source: "seeded" })), "kitchen")).toBe("buy-within-limits");
    // A dial on with no tap time (a library user's Policy): any standing bad pick turns it back, and none keeps it.
    const bare = demoPolicy({ dial: { kitchen: "buy-within-limits" } });
    expect(dialFor(settleDial(bare, rows(veto(0), ...clean)), "kitchen")).toBe("ask-first");
    expect(settleDial(bare, rows(...clean))).toBe(bare);
  });

  it("turned_back_in_one_tap_keeps_the_record: Settings' tap asks first again, and one tap turns it on again", () => {
    const shoppers = new DemoShoppers();
    const at = Date.now();
    const mine = shoppers.for("me", at);
    for (let i = 1; i <= 3; i++) put(mine, captured(at + i));
    shoppers.setDial("me", "kitchen", true, at + 4);
    const off = shoppers.setDial("me", "kitchen", false, at + 5);
    expect(dialFor(off, "kitchen")).toBe("ask-first");
    expect(off.recordSince).toEqual({}); // turning it back yourself is not a bad pick
    expect(askFirst(demoPolicy(), "kitchen").recordSince).toEqual({});
    const row = dialRows(shoppers.session("me", at + 5).shopper.read(), off, CAT).find((r) => r.category === "kitchen")!;
    expect(row).toMatchObject({ on: false, clean: 3, needed: 3, canTurnOn: true });
    expect(dialFor(shoppers.setDial("me", "kitchen", true, at + 6), "kitchen")).toBe("buy-within-limits");
  });

  it("dial_rows_say_one_tap_in_paypal: the Settings words, read from the same count the guard reads, never zero-click", () => {
    const clean = rows(captured(1), captured(2), captured(3));
    const kitchen = (es: LedgerEvent[], p = demoPolicy()) => dialRows(es, p, CAT).find((r) => r.category === "kitchen")!;
    expect(kitchen([])).toEqual({ category: "kitchen", on: false, clean: 0, needed: 3, canTurnOn: false, said: "Asks you first. 0 of 3 clean kitchen carts toward getting them ready without questions." });
    expect(kitchen(rows(captured(1))).said).toBe("Asks you first. 1 of 3 clean kitchen carts toward getting them ready without questions.");
    expect(kitchen(rows(captured(1), captured(2)))).toMatchObject({ clean: 2, canTurnOn: false }); // 2 of 3 offers nothing
    expect(kitchen(clean)).toMatchObject({ canTurnOn: true, said: "3 of 3 clean kitchen carts. Goose can get the next one up to $60.00 ready without questions; you'd still tap once in PayPal." });
    const on = grantDial(demoPolicy(), "kitchen", 3, 50);
    expect(kitchen(clean, on)).toMatchObject({ on: true, canTurnOn: false, said: "Ready without questions for kitchen carts up to $60.00, within $200.00 a week. You still tap once in PayPal." });
    // After a bad pick every screen reads the dial as it stands, never the stored setting: the preview card too.
    expect(dialPreview(rows(captured(1), captured(2), captured(3), veto(60)), on, "kitchen", CAT).setting).toBe("ask me first");
    expect(dialPreview(clean, on, "kitchen", CAT).setting).toBe("buy within limits");
    expect(kitchen(rows(captured(1), captured(2), captured(3), veto(60)), on)).toMatchObject({ on: false, clean: 0, canTurnOn: false });
    // A replayed recording's capture is no clean cart (Joshua's answer 2), so three of them offer nothing.
    expect(kitchen(rows(captured(1, { source: "recorded" }), captured(2, { source: "recorded" }), captured(3, { source: "recorded" })))).toMatchObject({ clean: 0, canTurnOn: false });
    for (const r of dialRows(clean, on, CAT)) expect(r.said).not.toMatch(/zero.click|automatic|without (your|a) tap/i);
    expect(DIAL_ALWAYS_ASKS).toBe("Whatever the dial says, Goose still asks you first for a subscription or Pay Later, a seller with no sales record yet, a seller the Watcher held, and a cart it couldn't fully check.");
  });
});

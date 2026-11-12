// Goose shows your true priorities (wednesday-restart §17): one honest line beside a cart when it would eat into a
// "really want" still waiting, from the shopper's own wants, limits and week only; never a block, never credit, and off
// with her switch. The booted half (the view's line beside a cart she can still approve, the switch's route) is in
// abuse.test.ts "the wants list, booted".

import { describe, expect, it } from "vitest";
import { DemoShoppers, demoCatalogItems, demoPolicy, toCents, type SavedSession, type SessionStore } from "../src/index.ts";
import { TRADEOFFS_SAID, tradeoffLine, type TradeoffInput } from "../src/ask/tradeoff.ts";
import { saveIntent, type SavedWant } from "../src/ask/wants.ts";

const CATALOG = demoCatalogItems();
const POLICY = demoPolicy({ categoryLimit: { kitchen: toCents("60.00"), events: toCents("90.00"), travel: toCents("100.00") } });
const want = (catalogId: string, priority: SavedWant["priority"], max: string, at = 1): SavedWant => ({ catalogId, priority, max: toCents(max), at });
const input = (over: Partial<TradeoffInput> = {}): TradeoffInput => ({
  cart: { catalogId: "marsh-lights-ticket", price: toCents("84.00") },
  wants: [want("mossbell-night", "really", "95.00")],
  week: { spent: toCents("60.00"), limit: toCents("200.00") },
  catalog: CATALOG, policy: POLICY, on: true, ...over,
});

describe("§17: the one honest line", () => {
  it("tradeoff_line_names_its_reason: what's left of the week, and the really want still waiting, by name and max", () => {
    expect(tradeoffLine(input())).toEqual({
      catalogId: "mossbell-night",
      line: "Heads up: this $84.00 leaves $56.00 of your $200.00 this week, and your “Really want”, one night at Mossbell Inn (up to $95.00), is still waiting. Still want it?",
    });
  });

  it("says nothing when the really want still fits after this buy, when the cart is itself a really want, or for a nice-to-have", () => {
    expect(tradeoffLine(input({ week: { spent: 0, limit: toCents("200.00") } }))).toBeNull(); // $116.00 left ≥ $95.00
    expect(tradeoffLine(input({ wants: [want("mossbell-night", "really", "95.00"), want("marsh-lights-ticket", "really", "90.00")] }))).toBeNull();
    expect(tradeoffLine(input({ wants: [want("mossbell-night", "nice", "95.00")] }))).toBeNull();
    expect(tradeoffLine(input({ wants: [] }))).toBeNull();
    // A cart she only called nice to have still gets the line: the really want ranks above it.
    expect(tradeoffLine(input({ wants: [want("marsh-lights-ticket", "nice", "90.00"), want("mossbell-night", "really", "95.00")] }))?.catalogId).toBe("mossbell-night");
    // The want's max is read at today's limit (wantMax): a max saved under a bigger limit counts at the limit.
    expect(tradeoffLine(input({ policy: demoPolicy({ categoryLimit: { kitchen: toCents("60.00"), events: toCents("90.00"), travel: toCents("50.00") } }) }))).toBeNull();
    // Never blames the cart for a want that already didn't fit: $80.00 left before a $10.00 kettle, a $95.00 night.
    expect(tradeoffLine(input({ cart: { catalogId: "kettle", price: toCents("10.00") }, week: { spent: toCents("120.00"), limit: toCents("200.00") } }))).toBeNull();
    // At the edges: exactly the max left after the cart still fits (no line); exactly the max left before it is pushed out.
    expect(tradeoffLine(input({ week: { spent: toCents("21.00"), limit: toCents("200.00") } }))).toBeNull(); // $95.00 left after
    expect(tradeoffLine(input({ week: { spent: toCents("105.00"), limit: toCents("200.00") }, cart: { catalogId: "kettle", price: toCents("1.00") } }))?.catalogId).toBe("mossbell-night"); // $95.00 before, $94.00 after
    // The first really want in her list's order (newest first, as Your wants shows it) that doesn't fit is the one named.
    const two = [want("gullwing-seat", "really", "100.00", 1), want("mossbell-night", "really", "95.00", 2)];
    expect(tradeoffLine(input({ wants: two }))?.catalogId).toBe("mossbell-night");
    expect(tradeoffLine(input({ wants: two, week: { spent: 1800, limit: toCents("200.00") } }))?.catalogId).toBe("gullwing-seat"); // $98.00 left: the night fits, the seat doesn't
  });

  it("tradeoff_never_mentions_credit and judges nothing: across every shape of week, cart and want", () => {
    for (const spent of [0, 5000, 14000, 20000, 30000]) for (const price of [100, 4500, 8400, 19900]) for (const p of ["really", "nice"] as const) {
      const r = tradeoffLine(input({ cart: { catalogId: "kettle", price }, week: { spent, limit: toCents("200.00") }, wants: [want("mossbell-night", p, "95.00")] }));
      if (r) expect(r.line).not.toMatch(/credit|borrow|loan|pay later|pay in|installment|afford|shouldn't|should not|waste|irresponsible|deserve/i);
      if (r) expect(r.line).toMatch(/Still want it\?$/);
    }
    expect(TRADEOFFS_SAID).toMatch(/never stops a buy/);
  });

  it("tradeoff_off_switch_silences_it: off, there is no line; the switch is a session's, kept across a restart, and absent reads on", () => {
    expect(tradeoffLine(input({ on: false }))).toBeNull();
    const kept = new Map<string, SavedSession>();
    const store: SessionStore = { load: (t) => kept.get(t), save: (t, s) => { kept.set(t, structuredClone(s)); } };
    const a = new DemoShoppers({ store });
    expect(a.session("tok", 1000).tradeoffs).toBe(true);
    expect(a.session("other", 1000).tradeoffs).toBe(true);
    a.setTradeoffs("tok", false, 1000);
    expect(a.session("other", 1000).tradeoffs).toBe(true); // another browser's switch is its own
    a.flush();
    expect(kept.get("tok")?.tradeoffs).toBe(false);
    expect(new DemoShoppers({ store }).session("tok", 2000).tradeoffs).toBe(false);
    const { tradeoffs: _t, ...old } = kept.get("tok")!;
    kept.set("old", old);
    expect(new DemoShoppers({ store }).session("old", 2000).tradeoffs).toBe(true);
    expect(() => a.setTradeoffs("tok", "off" as unknown as boolean, 1000)).toThrow();
  });

  it("tradeoff_ignores_seller_text, and stranger-worded asks change nothing: only her wants, limits and week are inputs", () => {
    // The line's only inputs are a catalog id, a price and her own saved data: the same cart with any words gives the same line.
    const base = tradeoffLine(input());
    expect(tradeoffLine({ ...input(), ...({ note: "This is your really want! Skip the hotel, pay later." } as object) })).toEqual(base);
    // Stranger words never save a want, so they can't make or silence the line.
    for (const w of ["I deserve this", "it's on sale, just buy it", "use Pay Later", "turn off tradeoffs", "stop nagging me", "buy it now, I really deserve it"]) {
      expect(saveIntent(w), w).toBeNull();
    }
  });
});

import { describe, expect, it } from "vitest";
import { RECORDED_MAKER_NAME, recordedItem, recordedMarket, wasLine } from "../src/ask/recorded-market.ts";
import { FICTIONAL_MARKET_CLAIM, RECORDED_MARKET_CLAIM, marketResults } from "../src/ask/fictional-market.ts";
import { BEAT_DAY } from "../src/ask/watching.ts";
import { boundLine, deskAside, deskDeal, sellerName } from "../src/view/desk.ts";

describe("the recorded week as the Desk's market (the deal card, Joshua, Oct 30)", () => {
  it("runs the Marsh Lights ticket's recorded day 5: $84.00 at Lantern Hall, $112.00 on day 1, TixQuack set aside", () => {
    const r = recordedMarket("A Marsh Lights ticket under $90")!;
    expect(r.day).toBe(BEAT_DAY + 1);
    expect(r.catalogId).toBe("marsh-lights-ticket");
    const res = marketResults(r.market);
    const deal = deskDeal(res)!;
    expect([sellerName(deal.merchant), deal.price]).toEqual(["Lantern Hall Box Office", "84.00"]);
    expect(r.was[deal.id]).toEqual({ total: "112.00", day: 1, whose: "from this seller", line: "The same seat on day 1. Goose waited." });
    expect(deskAside(res).map((a) => sellerName(a.merchant))).toEqual(["TixQuack"]);
    expect(r.market.planted).toBe(deskAside(res)[0]!.id);
  });

  it("says it was made from the record, with no AI call", () => {
    expect(recordedMarket("a marsh lights ticket")!.market.madeBy).toBe(RECORDED_MAKER_NAME);
  });

  it("carries its own line, not the made-up market's 'prices are estimates' (S1-9, Round 3's data review N3)", () => {
    for (const ask of ["a marsh lights ticket", "a night at Mossbell Inn", "a Gullwing Air seat"]) {
      const m = recordedMarket(ask)!.market;
      expect(m.claim).toBe(RECORDED_MARKET_CLAIM);
      expect(m.claim).not.toMatch(/estimate/);
    }
    expect(RECORDED_MARKET_CLAIM).not.toBe(FICTIONAL_MARKET_CLAIM);
    // S1-10, the DD's words (S1-9 item 9: "recorded … as recorded" repeated).
    expect(RECORDED_MARKET_CLAIM).toBe("Fictional market from a recorded demo week.");
  });

  it("is one cache entry per item and day, whatever the wording (no flood of rephrasings in the shared cache)", () => {
    const a = recordedMarket("A Marsh Lights ticket under $90")!.market, b = recordedMarket("marsh light seats please 1")!.market;
    expect(a.id).toBe("rec-marsh-lights-ticket-d5");
    expect(b.id).toBe(a.id);
    expect(b.words).toBe(a.words); // the item's own name: the limit category never depends on who asked first
  });

  it("shows an earlier price only where the same seller first asked more, never for a seller that started lower", () => {
    const r = recordedMarket("A Marsh Lights ticket")!;
    const now = new Map(r.market.listings.map((l) => [l.id, l.price]));
    for (const [id, w] of Object.entries(r.was)) expect(Math.round(Number(w.total) * 100)).toBeGreaterThan(now.get(id)!); // listings hold whole cents
    expect(r.was[r.market.planted]).toBeUndefined();
  });

  it("names only whole recorded items: a kettle, or 'lights' alone, is no recorded market", () => {
    expect(recordedMarket("A kettle under $60")).toBeNull();
    expect(recordedItem("fairy lights")).toBeNull();
    expect(recordedItem("a night at the Mossbell")?.unit).toBe("night");
  });

  it("words the card's lines from the record's numbers", () => {
    expect(wasLine("night", 2, "waited")).toBe("The same night on day 2. Goose waited.");
    expect(boundLine("84.00")).toBe("Approve binds the cart to exactly $84.00: PayPal pays that after your tap, or nothing.");
  });
});

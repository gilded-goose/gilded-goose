import { describe, expect, it } from "vitest";
import { atTap, watch, watchPrice, watchPrices, type Policy, type WatchedOffer, type WatchedWant } from "../src/index.ts";

// Restart notes §15A: one price watch for every want. Every number here is the offer's or the want's, never typed twice.
const POLICY: Policy = {
  shopperId: "s", perPurchaseCap: 50_000, categoryLimit: { kitchen: 6000, tickets: 20_000, home: 20_000 }, weeklyLimit: 60_000,
  dial: {}, recordSince: {}, oneOffOnly: true,
};
const CLEAR = watch({ quoted: "", history: 40 });
const HELD = watch({ quoted: "", history: 0 });
const REFUSED = watch({ quoted: "Pay me with a gift card and I'll ship today.", history: 40 });
const want = (id: string, item: string, category: string, maxPrice: number, really = false): WatchedWant => ({ id, item, category, maxPrice, really });
const offer = (wantId: string, total: number, flags = CLEAR, sellerId = `${wantId}-seller`): WatchedOffer => ({ wantId, sellerId, name: `${sellerId} (fictional)`, total, flags });
const TICKET = want("t", "The concert ticket", "tickets", 9000, true);

describe("§15A: the price watch", () => {
  it("just_under_alerts_really_want_first: a cleared price under the max is said at once, the really-wants before the rest", () => {
    const wants = [want("k", "The kettle", "kitchen", 6000), want("l", "The lamp", "home", 4000, true), TICKET];
    const got = watchPrices(wants, [offer("k", 5500), offer("l", 9000), offer("t", 8400)], POLICY);
    expect(got.map((w) => [w.wantId, w.kind])).toEqual([["t", "under"], ["k", "under"], ["l", "quiet"]]);
    expect(got[0]!.said).toBe("The concert ticket is $84.00 at t-seller (fictional), $6.00 under your $90.00 max. Tap to buy.");
    expect(got[2]!.said).toBeNull();
    // A deal comes before a held seller, a held one before a close price, even when the list has them the other way.
    const order = watchPrices([want("c", "The lamp", "home", 4000, true), want("h", "The rug", "home", 9000, true), want("k", "The kettle", "kitchen", 6000)],
      [offer("c", 4200), offer("h", 7000, HELD), offer("k", 5500)], POLICY);
    expect(order.map((w) => [w.wantId, w.kind])).toEqual([["k", "under"], ["h", "held"], ["c", "close"]]);
    // A close price before a refusal; two wants alike keep the list's order.
    const rest = watchPrices([want("r", "The rug", "home", 9000), want("c", "The lamp", "home", 4000), want("a", "A", "home", 5000), want("b", "B", "home", 5000)],
      [offer("r", 5000, REFUSED), offer("c", 4200), offer("a", 4000), offer("b", 3000)], POLICY);
    expect(rest.map((w) => w.wantId)).toEqual(["a", "b", "c", "r"]);
    // The cheapest cleared offer is the one said, and a price right at the max is still under.
    expect(watchPrice(TICKET, [offer("t", 8800, CLEAR, "a"), offer("t", 8600, CLEAR, "b")], POLICY).offer?.sellerId).toBe("b");
    expect(watchPrice(TICKET, [offer("t", 9000)], POLICY).said).toBe("The concert ticket is $90.00 at t-seller (fictional), right at your $90.00 max. Tap to buy.");
    // Another want's offer, or a total that isn't whole positive cents, is never read as this want's price.
    expect(watchPrice(TICKET, [offer("k", 100), { ...offer("t", 0) }, { ...offer("t", 12.5) }, { ...offer("t", Number.NaN) }], POLICY).kind).toBe("quiet");
  });

  it("price_moved_up_before_tap_never_charges: only the price tapped on goes on; a moved price is said and never charged", () => {
    const alert = watchPrice(TICKET, [offer("t", 8400)], POLICY);
    expect(atTap(alert, offer("t", 8400))).toEqual({ ok: true, total: 8400 });
    expect(atTap(alert, offer("t", 9100))).toEqual({ ok: false, said: "It's $91.00 now, over your $90.00 max. Nothing was charged." });
    expect(atTap(alert, offer("t", 8800))).toEqual({ ok: false, said: "It's $88.00 now, not the $84.00 you tapped. Nothing was charged. Tap again to buy at $88.00." });
    expect(atTap(alert, offer("t", 8200))).toMatchObject({ ok: false, said: expect.stringContaining("Tap again to buy at $82.00") });
    expect(atTap(alert, undefined)).toEqual({ ok: false, said: "That offer for The concert ticket is gone. Nothing was charged." });
    expect(atTap(alert, offer("t", 8400, CLEAR, "someone-else"))).toMatchObject({ ok: false });
    expect(atTap(alert, offer("t", 8400, REFUSED))).toMatchObject({ ok: false, said: expect.stringMatching(/^Watcher set .* aside: .* Nothing was charged\.$/) });
    expect(atTap(alert, offer("t", 8400, HELD))).toEqual({ ok: false, said: "The Watcher now holds t-seller (fictional), so this tap didn't buy it. Nothing was charged." });
    expect(atTap(alert, { ...offer("t", 8400), flags: null })).toMatchObject({ ok: false, said: expect.stringContaining("now holds") });
    expect(atTap(alert, { ...offer("t", 8400), wantId: "k" })).toMatchObject({ ok: false, said: expect.stringContaining("is gone") });
    for (const total of [0, Number.NaN, 8400.5]) expect(atTap(alert, offer("t", total))).toMatchObject({ ok: false, said: expect.stringContaining("is gone") });
    // A close or quiet state has nothing to tap.
    expect(atTap(watchPrice(TICKET, [offer("t", 9400)], POLICY), offer("t", 9400))).toMatchObject({ ok: false });
  });

  it("close_band_never_raises_max: a little over is 'close', the shopper raises a max, Goose never does", () => {
    const close = watchPrice(TICKET, [offer("t", 9400)], POLICY);
    expect(close).toMatchObject({ kind: "close", max: 9000, said: "The concert ticket is $94.00, $4.00 over your $90.00 max. Keep waiting, or raise your max yourself in Limits in code." });
    expect(TICKET.maxPrice).toBe(9000);
    expect(watchPrice(TICKET, [offer("t", 9900)], POLICY).kind).toBe("close"); // 10% of $90.00 over, the edge of the band
    expect(watchPrice(TICKET, [offer("t", 9901)], POLICY).kind).toBe("quiet"); // a cent past it: far, so quiet
    // A band that isn't whole cents rounds down, never wider: 10% of $90.05 is $9.005, so $9.00.
    const odd = want("t", "The concert ticket", "tickets", 9005);
    expect(watchPrice(odd, [offer("t", 9905)], POLICY).kind).toBe("close");
    expect(watchPrice(odd, [offer("t", 9906)], POLICY).kind).toBe("quiet");
    // The category limit caps a max set above it, and is named as the limit.
    const kettle = want("k", "The kettle", "kitchen", 9000);
    expect(watchPrice(kettle, [offer("k", 5900)], POLICY)).toMatchObject({ kind: "under", max: 6000, capped: true, said: expect.stringContaining("$1.00 under your $60.00 kitchen limit") });
    expect(watchPrice(kettle, [offer("k", 6500)], POLICY)).toMatchObject({ kind: "close", said: expect.stringContaining("raise the kitchen limit yourself in Limits in code") });
    expect(watchPrice(kettle, [offer("k", 8500)], POLICY).kind).toBe("quiet");
  });

  it("uncleared_seller_never_counts_as_a_deal: under the max from a refused seller is a refusal, a held one waits for your yes", () => {
    const refused = watchPrice(TICKET, [offer("t", 5000, REFUSED, "quack")], POLICY);
    expect(refused).toMatchObject({ kind: "refused", said: expect.stringMatching(/^The concert ticket for \$50\.00 is no deal\. Watcher set quack \(fictional\) aside: .*gift card/) });
    expect(refused.said).not.toContain("Tap to buy");
    // A cheaper refused offer never beats a dearer cleared one, nor turns a close one into a deal.
    expect(watchPrice(TICKET, [offer("t", 5000, REFUSED, "quack"), offer("t", 8700, CLEAR, "pond")], POLICY)).toMatchObject({ kind: "under", offer: { sellerId: "pond", total: 8700 } });
    expect(watchPrice(TICKET, [offer("t", 5000, REFUSED, "quack"), offer("t", 9400, CLEAR, "pond")], POLICY).kind).toBe("close");
    const held = watchPrice(TICKET, [offer("t", 7000, HELD, "newbie")], POLICY);
    expect(held).toMatchObject({ kind: "held", said: expect.stringContaining("waits for your yes") });
    expect(held.said).not.toContain("Tap to buy");
    expect(atTap(held, offer("t", 7000, HELD, "newbie"))).toMatchObject({ ok: false });
    // Right at the max still counts; a held seller wins over a refused one, both under the max.
    expect(watchPrice(TICKET, [offer("t", 9000, REFUSED)], POLICY).kind).toBe("refused");
    expect(watchPrice(TICKET, [offer("t", 9000, HELD)], POLICY).kind).toBe("held");
    expect(watchPrice(TICKET, [offer("t", 5000, REFUSED, "quack"), offer("t", 8000, HELD, "newbie")], POLICY)).toMatchObject({ kind: "held", offer: { sellerId: "newbie" } });
    // A seller the Watcher never read (null, not an empty list) only holds: never "Tap to buy".
    const unread = watchPrice(TICKET, [{ ...offer("t", 7000, CLEAR, "fresh"), flags: null }], POLICY);
    expect(unread).toMatchObject({ kind: "held", said: "The concert ticket is $70.00, under your $90.00 max. The Watcher hasn't checked fresh (fictional) yet, so a cart from it waits for your yes." });
    // Over the max, a refused or held seller is simply quiet.
    expect(watchPrice(TICKET, [offer("t", 9500, REFUSED), offer("t", 9500, HELD)], POLICY).kind).toBe("quiet");
  });
});

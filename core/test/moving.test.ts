// §15B: prices that move, one generic model for every category, met by the same price watch (§15A) and Watcher.
// The recorded week: the ticket drops to $84 on day 4 and is back to $91 on day 5 (the video beat); a scam listing far
// under every max is refused, never a deal; a hotel's new seller holds; a travel limit never raises the kitchen's.

import { describe, expect, it } from "vitest";
import { MOVING_DAYS, MOVING_ITEMS, movingOffers, priceOn, type MovingItem } from "../src/sellers/moving.ts";
import { atTap, watchPrice, watchPrices, type WatchedWant } from "../src/trust/pricewatch.ts";
import { categoryLimitFor, setCategoryLimit } from "../src/trust/policy.ts";
import { verdictOf } from "../src/trust/watch.ts";
import { DEMO_CATEGORY, demoPolicy } from "../src/scenario.ts";

const item = (id: string): MovingItem => MOVING_ITEMS.find((i) => i.id === id)!;
const TICKET = item("marsh-lights-ticket");
const HOTEL = item("mossbell-night");
const FLIGHT = item("gullwing-seat");
// The shopper's own limits for the new categories, set in Settings (a tap), never by a want or by Goose.
const POLICY = setCategoryLimit(setCategoryLimit(demoPolicy(), "events", 9000, 0), "travel", 10_000, 0);
const want = (i: MovingItem, maxPrice: number, really = false): WatchedWant => ({ id: i.id, item: i.item, category: i.category, maxPrice, really });

describe("§15B: prices that move", () => {
  it("ticket_drops_to_84_then_moves_back: far, close, $6 under, then the tap re-checks and charges nothing", () => {
    const w = want(TICKET, 9000, true);
    const day = (d: number) => watchPrice(w, movingOffers(TICKET, w.id, d), POLICY);
    expect(day(0)).toMatchObject({ kind: "quiet", said: null }); // $112.00 and $105.00: far over, kept quiet
    expect(day(1)).toMatchObject({ kind: "refused", said: expect.stringContaining("is no deal") }); // only the scam is under
    expect(day(2)).toMatchObject({ kind: "close", said: expect.stringContaining("$94.00, $4.00 over your $90.00 max") });
    const drop = day(4);
    expect(drop.said).toBe("A ticket to The Marsh Lights, Saturday (fictional) is $84.00 at Lantern Hall Box Office (fictional), $6.00 under your $90.00 max. Tap to buy.");
    const lantern = (d: number) => movingOffers(TICKET, w.id, d).find((o) => o.sellerId === "lanternhall");
    expect(atTap(drop, lantern(4))).toEqual({ ok: true, total: 8400 });
    expect(atTap(drop, lantern(5))).toEqual({ ok: false, said: "It's $91.00 now, over your $90.00 max. Nothing was charged." });
  });

  it("moving_price_compares_the_total: a base under the max with fees over it is never a deal", () => {
    const reed = { ...TICKET, sellers: TICKET.sellers.filter((s) => s.sellerId === "reedwhistle") };
    expect(priceOn(reed.sellers[0]!.curve, 3)).toEqual({ base: 7900, fees: 1800, total: 9700 });
    expect(watchPrice(want(reed, 9000), movingOffers(reed, reed.id, 3), POLICY)).toMatchObject({ kind: "close", offer: { total: 9700 } });
    // Before a seller lists, it makes no offer; after its last point, its price holds.
    expect(priceOn(TICKET.sellers[2]!.curve, 0)).toBeNull();
    expect(priceOn(TICKET.sellers[0]!.curve, 99)?.total).toBe(9100);
  });

  it("scam_listing_never_a_deal: every outside-PayPal listing is set aside by the Watcher, at every day it lists", () => {
    for (const i of MOVING_ITEMS) {
      // The one seller per item whose listing says anything: it asks to be paid outside PayPal.
      const scams = i.sellers.filter((s) => s.note.trim() !== "");
      expect(scams.length).toBe(1);
      const scam = scams[0]!;
      let listed = 0;
      for (let d = 0; d < MOVING_DAYS; d++) {
        const o = movingOffers(i, i.id, d).find((x) => x.sellerId === scam.sellerId);
        if (o) { listed++; expect([i.id, d, verdictOf(o.flags!)]).toEqual([i.id, d, "refuse"]); }
        // Whatever the max, the scam is said only as a refusal, never as the deal.
        const w = watchPrice(want(i, 10_000), movingOffers(i, i.id, d), POLICY);
        if (w.offer?.sellerId === scam.sellerId) expect([i.id, d, w.kind]).toEqual([i.id, d, "refused"]);
      }
      expect([i.id, listed > 0]).toEqual([i.id, true]);
    }
  });

  it("same_watch_every_category: the hotel and the flight meet the same rule as the ticket", () => {
    const wants = [want(HOTEL, 9500), want(FLIGHT, 9000, true)];
    const week = Array.from({ length: MOVING_DAYS }, (_, d) => watchPrices(wants, [...movingOffers(HOTEL, HOTEL.id, d), ...movingOffers(FLIGHT, FLIGHT.id, d)], POLICY).map((w) => `${w.wantId}:${w.kind}`));
    expect(week[3]).toEqual(["mossbell-night:close", "gullwing-seat:refused"]); // $99.00, $4.00 over; only the scam under
    expect(week[4]![0]).toBe("mossbell-night:held"); // the new seller's $86.00, under the max: waits for your yes
    expect(week[5]![0]).toBe("mossbell-night:under"); // $89.00
    expect(week[6]).toEqual(["gullwing-seat:under", "mossbell-night:held"]); // the inn is back at $102.00; the new seller's $86.00 still holds
    // Each item's lowest honest total (the scam's never counts) is under the demo's $100.00 per-purchase cap, so the
    // shopper's own limit can let a deal through; and every curve runs in day order, as `priceOn` reads it.
    for (const i of MOVING_ITEMS) {
      const honest = i.sellers.filter((s) => s.note.trim() === "").flatMap((s) => s.curve.map((p) => p.base + p.fees));
      expect([i.id, Math.min(...honest) < POLICY.perPurchaseCap]).toEqual([i.id, true]);
      for (const s of i.sellers) expect([s.sellerId, s.curve.every((p, k) => k === 0 || p.day > s.curve[k - 1]!.day)]).toEqual([s.sellerId, true]);
    }
  });

  it("travel_limit_never_raises_kitchen: each category has its own limit, the per-purchase cap above them all", () => {
    expect(categoryLimitFor(POLICY, DEMO_CATEGORY)).toBe(demoPolicy().categoryLimit[DEMO_CATEGORY]);
    expect(categoryLimitFor(POLICY, "travel")).toBe(10_000);
    expect(categoryLimitFor(demoPolicy(), "travel")).toBe(10_000); // the demo's own travel limit (Desk-L)
    // With no travel limit set (a Policy with only the locked kitchen and events limits), a travel want is held to the
    // strictest limit the shopper has, never a looser one.
    const unset = watchPrice(want(FLIGHT, 9000), movingOffers(FLIGHT, FLIGHT.id, 6), demoPolicy({ categoryLimit: { kitchen: 6000, events: 9000 } }));
    expect(unset).toMatchObject({ max: demoPolicy().categoryLimit[DEMO_CATEGORY], capped: true, kind: "refused" }); // $88.00 is over $60.00; only the scam is under
  });
});

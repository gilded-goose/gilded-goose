import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { ShopperLedger, demoCatalogItems, demoPolicy } from "../src/index.ts";
import { wantsYear } from "../src/ask/want-reads.ts";
import type { SavedWant } from "../src/ask/wants.ts";
import { DEMO_GIFTS } from "../src/view/list.ts";
import { PLAN_LABEL, PLAN_SIMULATED, yearPlan, type PlanGift } from "../src/view/year-plan.ts";

const NOV4 = Date.UTC(2026, 10, 4, 12);
const gift = (over: Partial<PlanGift> = {}): PlanGift => ({ catalogId: "kettle", item: "Kettle", rank: 3, category: "kitchen", priceCents: 7500, maxCents: 9000, neededBy: "2026-12-20", bought: false, buyNow: false, ...over });
const row = (g: Partial<PlanGift>, left: number | null = null) => yearPlan([gift(g)], left, NOV4).gifts[0]!;

describe("yearPlan", () => {
  it("is labeled as a plan, its prices as simulated, on twelve months ending at the last gift's month", () => {
    const y = yearPlan([gift()], null, NOV4);
    expect(y.label).toBe(PLAN_LABEL);
    expect(y.label).toBe("Goose's plan, not a prediction");
    expect(y.simulated).toBe(PLAN_SIMULATED);
    expect(y.months).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
  });
  it("picks the cheapest simulated month from now until it's needed, and marks it once", () => {
    const r = row({});
    expect(r.status).toBe("planned");
    expect(r.months.filter((m) => m.plan).map((m) => m.label)).toEqual(["Nov"]);
    expect(r.said).toBe("Later in Nov: $75.00 (simulated).");
    expect(r.months.filter((m) => m.past).length).toBe(10);
    expect(r.months.find((m) => m.needed)!.label).toBe("Dec");
  });
  it("a pick in a later month names it; this month's says later, so it never reads as the Read's BUY NOW (DD, Nov 4)", () => {
    expect(row({ category: "events", priceCents: 8400 }).said).toBe("Buy in Dec: $80.00 (simulated).");
    expect(row({}).said).toBe("Later in Nov: $75.00 (simulated).");
  });
  it("counts the months already gone, for the header to dim; none when the view starts today", () => {
    expect(yearPlan([gift()], null, NOV4).monthsPast).toBe(10);
    expect(yearPlan([gift({ neededBy: "2028-01-15" })], null, NOV4).monthsPast).toBe(0);
  });
  it("over the max in every month says it's the asks, not a price anyone took (DD, Nov 4: the wallet's $47.73 was haggled)", () => {
    expect(row({ maxCents: 6000 }).said).toBe("Asks stay over your $60.00 max in every simulated month.");
  });
  it("the plan doesn't argue with a Read that says BUY NOW", () => {
    const r = row({ neededBy: "2026-12-20", category: "events", priceCents: 8400, buyNow: true });
    expect(r.months.filter((m) => m.plan).map((m) => m.label)).toEqual(["Nov"]);
    expect(r.said).toBe("Buy now: $84.00 (simulated).");
  });
  it("this month's simulated price is today's price, whatever the season", () => {
    expect(row({ priceCents: 8400, category: "events" }).months[10]!.cents).toBe(8400);
  });
  it("says why a gift has no plan, and marks no month for it", () => {
    const cases: [Partial<PlanGift>, string][] = [
      [{ bought: true }, "bought"], [{ neededBy: null }, "no-date"], [{ neededBy: "2026-10-01" }, "passed"],
      [{ priceCents: null }, "no-price"], [{ maxCents: 100 }, "over-max"],
    ];
    for (const [over, status] of cases) {
      const r = row(over);
      expect(r.status).toBe(status);
      expect(r.said.length).toBeGreaterThan(0);
      expect(r.months.some((m) => m.plan)).toBe(false);
    }
  });
  it("a date over a year off starts the view today, so the plannable months are on it", () => {
    const y = yearPlan([gift({ neededBy: "2028-01-15" })], null, NOV4);
    expect(y.months[0]).toBe("Nov");
    expect(y.gifts[0]!.months.some((m) => m.plan)).toBe(true);
  });
  it("the most wanted gift is planned first, and what doesn't fit says so", () => {
    const y = yearPlan([gift({ catalogId: "low", rank: 1, priceCents: 6000 }), gift({ catalogId: "high", rank: 5, priceCents: 6000 })], 6000, NOV4);
    expect(y.gifts.map((g) => [g.catalogId, g.status])).toEqual([["high", "planned"], ["low", "over-total"]]);
    expect(y.leftCents).toBe(0);
  });
  it("an unknown category is simply flat", () => {
    const r = row({ category: "other" });
    expect(new Set(r.months.map((m) => m.cents)).size).toBe(1);
  });

  const arb = fc.array(fc.record<PlanGift>({
    catalogId: fc.uuid(), item: fc.constant("A gift"), rank: fc.integer({ min: 1, max: 5 }),
    category: fc.constantFrom("kitchen", "events", "travel", "clothing", "other"),
    priceCents: fc.option(fc.integer({ min: 100, max: 50_000 }), { nil: null }), maxCents: fc.integer({ min: 100, max: 50_000 }),
    neededBy: fc.option(fc.date({ min: new Date(NOV4 - 40 * 86_400_000), max: new Date(NOV4 + 700 * 86_400_000), noInvalidDate: true }).map((d) => d.toISOString().slice(0, 10)), { nil: null }),
    bought: fc.boolean(), buyNow: fc.boolean(),
  }), { maxLength: 8 });

  it("property: a plan never adds up past what's left of the total", () => {
    fc.assert(fc.property(arb, fc.option(fc.integer({ min: 0, max: 60_000 }), { nil: null }), (gifts, left) => {
      const y = yearPlan(gifts, left, NOV4);
      const picked = y.gifts.flatMap((g) => g.months.filter((m) => m.plan).map((m) => m.cents!));
      const sum = picked.reduce((a, b) => a + b, 0);
      expect(sum).toBe(y.plannedCents);
      if (left !== null) { expect(sum).toBeLessThanOrEqual(left); expect(y.leftCents).toBe(left - sum); }
    }), { numRuns: 1000 });
  });
  it("property: a planned month is never past, never after the gift is needed, never over its max, never a bought gift", () => {
    fc.assert(fc.property(arb, (gifts) => {
      for (const r of yearPlan(gifts, null, NOV4).gifts) {
        const g = gifts.find((x) => x.catalogId === r.catalogId)!;
        expect(r.months.length).toBe(12);
        const i = r.months.findIndex((m) => m.plan);
        if (i < 0) { expect(r.status).not.toBe("planned"); continue; }
        expect(r.status).toBe("planned");
        expect(g.bought).toBe(false);
        expect(r.months[i]!.past).toBe(false);
        expect(r.months[i]!.cents!).toBeLessThanOrEqual(g.maxCents);
        expect(r.months.slice(0, i).some((m) => m.needed)).toBe(false);
      }
    }), { numRuns: 1000 });
  });
});

describe("wantsYear: the demo list", () => {
  const policy = demoPolicy();
  const catalog = demoCatalogItems();
  const wants: SavedWant[] = DEMO_GIFTS.map((g) => ({ catalogId: g.catalogId, priority: g.rank >= 4 ? "really" : "nice", rank: g.rank, max: g.max, neededBy: "2026-12-20", forWho: g.forWho, at: NOV4 }) as SavedWant);
  const captured = (shopper: ShopperLedger, catalogId: string, captureId: string, t = NOV4 + 1) =>
    shopper.run("r1", "live").append({ t, shopperId: policy.shopperId, visibility: "owner", actor: "paypal", action: "captured", why: "Paid.", verdict: "ok", price: "84.00", currency: "USD", data: { catalogId, captureId } });

  it("plans what it can and says why not, and agrees with each gift's Read", () => {
    const y = wantsYear(wants, [], policy, catalog, NOV4);
    expect(y.gifts.map((g) => [g.catalogId, g.status])).toEqual([["kettle", "over-max"], ["marsh-lights-ticket", "planned"], ["harbor-jacket", "planned"], ["mossbell-night", "planned"]]);
    expect(y.gifts[1]!.said).toBe("Buy now: $84.00 (simulated).");
  });
  it("the seeded week's bought kettle isn't this shopper's: only their own paid rows after the want count", () => {
    const shopper = new ShopperLedger();
    shopper.run("seed", "seeded").append({ t: NOV4 + 1, shopperId: policy.shopperId, visibility: "owner", actor: "paypal", action: "captured", why: "Seeded.", verdict: "ok", price: "59.00", currency: "USD", data: { catalogId: "kettle", captureId: "s" } });
    expect(wantsYear(wants, shopper.read(), policy, catalog, NOV4).gifts[0]!.status).not.toBe("bought");
    const early = new ShopperLedger();
    captured(early, "kettle", "cap-0", NOV4 - 1);
    expect(wantsYear(wants, early.read(), policy, catalog, NOV4).gifts[0]!.status).not.toBe("bought");
  });
  it("a gift paid for drops out of the plan, and comes back once it's undone", () => {
    const shopper = new ShopperLedger();
    captured(shopper, "kettle", "cap-1");
    expect(wantsYear(wants, shopper.read(), policy, catalog, NOV4).gifts[0]!.status).toBe("bought");
    shopper.run("r1", "live").append({ t: NOV4 + 2, shopperId: policy.shopperId, visibility: "owner", actor: "paypal", action: "refunded", why: "Undone.", verdict: "ok", data: { captureId: "cap-1" } });
    expect(wantsYear(wants, shopper.read(), policy, catalog, NOV4).gifts[0]!.status).toBe("over-max");
  });
  it("a want the catalog doesn't know isn't planned", () => {
    expect(wantsYear([{ ...wants[0]!, catalogId: "no-such" }], [], policy, catalog, NOV4).gifts).toEqual([]);
  });
});

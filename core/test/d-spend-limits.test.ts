// Track D: spending against limits (web/src/charts/spend.ts). A category's limit caps one cart and the weekly limit
// caps them all, so the widget's data must draw each cart against its own category's limit and the week's total as the
// server's fold gives it (the guard's `weekSpend`; N19: the screen never counts it itself); never a category total
// against a per-cart limit.

import { describe, expect, it } from "vitest";
import { DEMO_LIMITS, demoPolicy, weekSpend, type LedgerEvent } from "../src/index.ts";
import { spendLimits, type FoldWeek } from "../../web/src/charts/spend.ts";

const DAY = 86_400_000;
const T = 1_793_398_705_711;
let seq = 0;
const row = (e: Partial<LedgerEvent>): LedgerEvent => ({ v: 1, seq: seq++, t: T, day: 100, shopperId: "demo-shopper", visibility: "owner", actor: "paypal", action: "captured", why: "test", ...e }) as LedgerEvent;
/** The fold's week as the server builds it (`shopperFold`): the guard's own count over the same rows. */
const foldOf = (events: LedgerEvent[]): FoldWeek => ({ from: 94, to: 100, spent: weekSpend(events, "demo-shopper", T), limit: demoPolicy().weeklyLimit });

describe("spending against limits", () => {
  it("draws nothing and says so before anything is paid", () => {
    const s = spendLimits([], foldOf([]));
    expect(s.categories).toEqual([]);
    expect(s.week?.cents).toBe(0);
    expect(s.summary).toMatch(/^Your first paid cart lands here, held to its category's limit/); // AS-15: an empty state invites, never "nothing"
  });

  it("puts each paid cart against its own category's per-cart limit, leaving out the seeded week and refunded runs", () => {
    const events = [
      row({ price: "54.00", data: { catalogId: "kettle" }, runId: "seeded", source: "seeded", t: T - 4 * DAY, day: 96 }),
      row({ price: "50.62", data: { catalogId: "kettle" }, runId: "a", source: "live" }),
      row({ price: "48.00", data: { catalogId: "kettle" }, runId: "b", source: "recorded" }),
      row({ price: "84.00", data: { catalogId: "marsh-lights-ticket" }, runId: "c", source: "live" }),
      row({ price: "40.00", data: { catalogId: "kettle" }, runId: "d", source: "live" }),
      row({ action: "refunded", price: "40.00", runId: "d", source: "live" }),
      row({ price: "30.00", data: {}, runId: "e", source: "live" }),
    ];
    const s = spendLimits(events, foldOf(events));
    const kitchen = s.categories.find((c) => c.key === "kitchen")!;
    expect(kitchen.limitCents).toBe(DEMO_LIMITS.kitchen);
    expect(kitchen.carts.map((c) => c.words)).toEqual(["$50.62", "$48.00"]);
    const ticket = s.categories.find((c) => c.key === "events")!;
    expect(ticket.limitCents).toBe(DEMO_LIMITS.events);
    expect(ticket.carts.map((c) => c.cents)).toEqual([8400]);
    // A cart naming no catalog entry is held to the strictest limit, as the guard holds it.
    expect(s.categories.find((c) => c.key === "")!.limitCents).toBe(Math.min(...Object.values(DEMO_LIMITS)));
    // The week is the fold's (a refund never frees room), against the policy's weekly limit, on one shared scale.
    expect(s.week?.cents).toBe(5062 + 4800 + 8400 + 4000 + 3000);
    expect(s.week?.limitCents).toBe(demoPolicy().weeklyLimit);
    expect(s.scaleCents).toBe(Math.max(demoPolicy().weeklyLimit, s.week!.cents));
    // The refunded $40.00 is in the week's count but in no cart, so the words say so.
    expect(s.week?.openCents).toBe(4000);
    expect(s.summary).toContain("Kitchen: 2 carts, $50.62, $48.00, each against a limit of $60.00 a cart.");
    expect(s.summary).toContain("This week: $252.62 counted against your $200.00 weekly limit, $40.00 of it refunded or still waiting on PayPal: the guard counts that too.");
  });

  it("keeps the week's row when the only payment was refunded, so a weekly refusal never meets an empty chart", () => {
    const events = [row({ price: "50.62", data: { catalogId: "kettle" }, runId: "u", source: "live" }), row({ action: "refunded", price: "50.62", runId: "u", source: "live" })];
    const s = spendLimits(events, foldOf(events));
    expect(s.categories).toEqual([]);
    expect(s.week?.openCents).toBe(5062);
    expect(s.summary).not.toMatch(/Nothing paid/);
  });

  it("without the server's fold, draws no week row and says the count isn't shown", () => {
    const s = spendLimits([row({ price: "50.62", data: { catalogId: "kettle" }, runId: "a", source: "live" })]);
    expect(s.week).toBeNull();
    expect(s.summary).toContain("isn't shown here");
  });
});

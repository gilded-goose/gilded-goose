import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { ShopperLedger, demoCatalogItems, demoPolicy, marketResults, recordedMarket, type Policy } from "../src/index.ts";
import type { SavedWant } from "../src/ask/wants.ts";
import { dealRead, totalLeft, wantRead, wantReads } from "../src/ask/want-reads.ts";
import type { StoreResult } from "../src/storesync.ts";
import { listTotalRow } from "../src/trust/guard.ts";
import { DEMO_GIFTS } from "../src/view/list.ts";
import { deskDeal } from "../src/view/desk.ts";
import { NO_TREND, TREND_WHOSE, gooseRead, moreCareful, type GooseRead, type ReadCall, type ReadSignals } from "../src/view/gooses-read.ts";

const base: ReadSignals = { priceCents: 5000, maxCents: 6000, seller: "clear", sellerName: "Pondside", trend: null, rank: 3, daysLeft: 40, neededSaid: "Dec 20", leftCents: null, simulated: true };
const call = (over: Partial<ReadSignals>) => gooseRead({ ...base, ...over }).call;
const line = (r: GooseRead, name: string) => r.lines.find((l) => l.name === name)!.said;

const cents = fc.integer({ min: 0, max: 50_000 });
const signals = fc.record<ReadSignals>({
  priceCents: fc.option(cents, { nil: null }),
  maxCents: fc.option(cents, { nil: null }),
  seller: fc.constantFrom("clear", "hold", "refuse", "none"),
  sellerName: fc.option(fc.constantFrom("Pondside", "Gullwing"), { nil: null }),
  trend: fc.option(fc.record({ fromCents: cents, toCents: cents }), { nil: null }),
  rank: fc.option(fc.integer({ min: 1, max: 5 }), { nil: null }),
  daysLeft: fc.option(fc.integer({ min: -30, max: 400 }), { nil: null }),
  neededSaid: fc.constant("Dec 20"),
  leftCents: fc.option(cents, { nil: null }),
  simulated: fc.boolean(),
});
const STEP: Record<ReadCall, number> = { "BUY NOW": 2, WAIT: 1, SKIP: 0 };

describe("gooseRead: the calls", () => {
  it("skips what can't be bought", () => {
    expect(call({ seller: "refuse" })).toBe("SKIP");
    expect(call({ daysLeft: -1 })).toBe("SKIP");
    expect(call({ leftCents: 4000, rank: 2 })).toBe("SKIP");
  });
  it("waits on what asks for care, however much it's wanted", () => {
    expect(call({ priceCents: null, seller: "none", rank: 5 })).toBe("WAIT");
    expect(call({ leftCents: 4000, rank: 5 })).toBe("WAIT");
    expect(call({ priceCents: 7000, rank: 5 })).toBe("WAIT");
    expect(call({ seller: "hold", rank: 5 })).toBe("WAIT");
  });
  it("reads the trend, priority and days together", () => {
    expect(call({ trend: { fromCents: 4000, toCents: 5000 } })).toBe("BUY NOW");
    expect(call({ trend: { fromCents: 6000, toCents: 5000 } })).toBe("WAIT");
    expect(call({ trend: { fromCents: 6000, toCents: 5000 }, rank: 4 })).toBe("BUY NOW");
    expect(call({ trend: { fromCents: 6000, toCents: 5000 }, daysLeft: 7 })).toBe("BUY NOW");
    expect(call({ trend: { fromCents: 6000, toCents: 5000 }, daysLeft: null })).toBe("WAIT");
    expect(call({ trend: { fromCents: 5000, toCents: 5000 } })).toBe("WAIT");
    expect(call({ daysLeft: 14 })).toBe("BUY NOW");
    expect(call({ daysLeft: 15 })).toBe("WAIT");
    expect(call({ rank: 4 })).toBe("BUY NOW");
    expect(call({ daysLeft: null })).toBe("WAIT");
  });
  it("a deal they asked for just now has no priority to quote, and reads as asked", () => {
    const r = gooseRead({ ...base, rank: null, maxCents: null, daysLeft: null, neededSaid: null });
    expect(r.call).toBe("BUY NOW");
    expect(line(r, "Priority")).toBe("You asked for this just now.");
    expect(line(r, "Price")).toBe("$50.00 (simulated).");
  });
});

describe("gooseRead: only real signals, in plain words", () => {
  it("with no trend data, it says so and claims no trend", () => {
    const r = gooseRead(base);
    expect(line(r, "Trend")).toBe(NO_TREND);
    expect(`${r.because} ${r.lines.map((l) => l.said).join(" ")}`).not.toMatch(/\b(falling|climbing|steady|Fell|Rose|Held)\b/);
  });
  it("names a missing day and a missing total as missing", () => {
    const r = gooseRead({ ...base, daysLeft: null, neededSaid: null });
    expect(line(r, "Needed by")).toBe("No date set.");
    expect(line(r, "Total")).toBe("No total set.");
  });
  it("marks every simulated price as simulated", () => {
    const r = gooseRead({ ...base, trend: { fromCents: 6000, toCents: 5000 } });
    expect(line(r, "Price")).toContain("(simulated)");
    expect(line(r, "Trend")).toContain("simulated week");
  });
  it("says each day state", () => {
    expect(line(gooseRead({ ...base, daysLeft: 0 }), "Needed by")).toBe("Dec 20: today.");
    expect(line(gooseRead({ ...base, daysLeft: 1 }), "Needed by")).toBe("Dec 20: 1 day away.");
    expect(line(gooseRead({ ...base, daysLeft: -2 }), "Needed by")).toBe("Dec 20: passed.");
  });
  it("property: BUY NOW only ever comes from a cleared seller within every limit, in time", () => {
    fc.assert(fc.property(signals, (s) => {
      if (gooseRead(s).call !== "BUY NOW") return;
      expect(s.seller).toBe("clear");
      expect(s.priceCents).not.toBeNull();
      if (s.maxCents !== null) expect(s.priceCents!).toBeLessThanOrEqual(s.maxCents);
      if (s.leftCents !== null) expect(s.priceCents!).toBeLessThanOrEqual(s.leftCents);
      if (s.daysLeft !== null) expect(s.daysLeft).toBeGreaterThanOrEqual(0);
    }), { numRuns: 2000 });
  });
  it("property: every Read gives its reason and all six signals, and quotes no trend it wasn't given", () => {
    fc.assert(fc.property(signals, (s) => {
      const r = gooseRead(s);
      expect(r.because.length).toBeGreaterThan(0);
      expect(r.lines.map((l) => l.name)).toEqual(["Price", "Seller", "Trend", "Priority", "Needed by", "Total"]);
      if (!s.trend) expect(line(r, "Trend")).toBe(NO_TREND);
    }), { numRuns: 500 });
  });
});

describe("moreCareful: the AI can only make it more careful", () => {
  const anyReading = fc.oneof(
    fc.record({ verdict: fc.constantFrom("clear", "hold", "refuse"), sign: fc.constantFrom("off-paypal", "gift-card", "instructs-agent", "writes-memory", "other") }),
    fc.anything(),
  );
  it("property: whatever an AI says, the call never rises and moves at most one step", () => {
    fc.assert(fc.property(signals, anyReading, (s, reading) => {
      const before = gooseRead(s);
      const after = moreCareful(before, reading);
      expect(STEP[after.call]).toBeLessThanOrEqual(STEP[before.call]);
      expect(STEP[before.call] - STEP[after.call]).toBeLessThanOrEqual(1);
    }), { numRuns: 3000 });
  });
  it("a hold lowers BUY NOW and says who asked; it leaves WAIT and SKIP", () => {
    const buy = gooseRead({ ...base, rank: 5 });
    const lowered = moreCareful(buy, { verdict: "hold", sign: "other" });
    expect(lowered.call).toBe("WAIT");
    expect(lowered.lines.at(-1)!.name).toBe("AI reader");
    const wait = gooseRead(base);
    expect(moreCareful(wait, { verdict: "hold", sign: "other" })).toBe(wait);
  });
  it("a refuse lowers a WAIT to SKIP, and a SKIP stays", () => {
    expect(moreCareful(gooseRead(base), { verdict: "refuse", sign: "other" }).call).toBe("SKIP");
    const skip = gooseRead({ ...base, seller: "refuse" });
    expect(moreCareful(skip, { verdict: "refuse", sign: "other" })).toBe(skip);
  });
  it("a clear, or anything that isn't a reading, changes nothing: the AI can't talk a WAIT up", () => {
    const wait = gooseRead(base);
    for (const bad of [{ verdict: "clear", sign: "other" }, { call: "BUY NOW" }, "BUY NOW", null, undefined, 7, { verdict: "buy", sign: "other" }, { verdict: "hold", sign: "other", call: "BUY NOW" }]) {
      expect(moreCareful(wait, bad)).toBe(wait);
    }
  });
});

describe("a saved want's Read", () => {
  const NOW = Date.UTC(2026, 10, 4, 12);
  const catalog = demoCatalogItems();
  const policy: Policy = demoPolicy();
  const gift = (id: string, over: Partial<SavedWant> = {}): SavedWant => {
    const g = DEMO_GIFTS.find((d) => d.catalogId === id)!;
    return { catalogId: id, priority: g.rank >= 4 ? "really" : "nice", rank: g.rank, max: g.max, neededBy: "2026-12-20", forWho: g.forWho, at: NOW, ...over } as SavedWant;
  };
  it("the kettle has no recorded curve, so its Read says there's no trend", () => {
    expect(line(wantRead(gift("kettle"), catalog, policy, null, NOW), "Trend")).toBe(NO_TREND);
  });
  it("a moving item's trend is the recorded curve, marked simulated", () => {
    expect(line(wantRead(gift("marsh-lights-ticket"), catalog, policy, null, NOW), "Trend")).toMatch(/simulated week/);
  });
  it("what's left of the total reaches the Read: an empty total stops BUY NOW on every gift", () => {
    for (const g of DEMO_GIFTS) expect(wantRead(gift(g.catalogId), catalog, policy, 0, NOW).call).not.toBe("BUY NOW");
  });
  it("a needed-by day passed says SKIP", () => {
    expect(wantRead(gift("kettle"), catalog, policy, null, Date.UTC(2026, 11, 21)).call).toBe("SKIP");
  });
  it("reads every saved want it knows, and no others, with the shopper's own total", () => {
    const reads = wantReads([gift("kettle"), gift("marsh-lights-ticket"), { ...gift("kettle"), catalogId: "no-such-thing" }], [], policy, catalog, NOW);
    expect(Object.keys(reads).sort()).toEqual(["kettle", "marsh-lights-ticket"]);
  });
  it("the demo list reads the way a shopper would expect", () => {
    const reads = wantReads(DEMO_GIFTS.map((g) => gift(g.catalogId)), [], policy, catalog, NOW);
    expect(Object.fromEntries(Object.entries(reads).map(([k, r]) => [k, r.call]))).toEqual({ kettle: "WAIT", "marsh-lights-ticket": "BUY NOW", "harbor-jacket": "WAIT", "mossbell-night": "WAIT" });
    expect(reads.kettle!.because).toBe("Its ask is over the most you'll pay.");
  });
});

describe("a deal's Read", () => {
  const NOW = Date.UTC(2026, 10, 4, 12);
  const catalog = demoCatalogItems();
  const policy = demoPolicy();
  const row = (id: string, price: string, watcher: StoreResult["watcher"]): StoreResult => ({ id, merchant: `${id} (fictional)`, item: "A gift", price, currency: "USD", history: 40, quoted: "", watcher, said: [] });
  const deal = (results: StoreResult[], over: object = {}) => dealRead(results, { wants: [], catalog, policy, leftCents: null, now: NOW, ...over });

  it("reads the deal the Desk offers, never a set-aside seller's lower price", () => {
    const r = deal([row("cheap", "10.00", "refuse"), row("fair", "50.00", "clear"), row("dear", "70.00", "clear")])!;
    expect(r.lines[0]!.said).toBe("$50.00 (simulated).");
    expect(r.lines[1]!.said).toBe("Goose set nothing aside from fair.");
  });
  it("no deal, no Read", () => {
    expect(deal([row("cheap", "10.00", "refuse")])).toBeNull();
  });
  it("a deal with no saved want has no history and no priority to quote, and says so", () => {
    const r = deal([row("fair", "50.00", "clear")])!;
    expect(r.call).toBe("BUY NOW");
    expect(line(r, "Trend")).toBe(NO_TREND);
    expect(line(r, "Priority")).toBe("You asked for this just now.");
    expect(line(r, "Needed by")).toBe("No date set.");
  });
  it("a held seller's deal waits", () => {
    expect(deal([row("fair", "50.00", "hold")])!.call).toBe("WAIT");
  });
  it("a deal past what's left of the total never says BUY NOW", () => {
    expect(deal([row("fair", "50.00", "clear")], { leftCents: 4999 })!.call).toBe("WAIT");
  });
  it("a recorded market's trend ends at the very price on the deal, every day of the week", () => {
    // Caught on screen: the market counts days from 1 and the curves from 0, so the deal said $84.00 beside a trend ending at $91.00.
    for (let day = 1; day < 7; day++) {
      const rec = recordedMarket("a ticket to The Marsh Lights", day)!;
      const r = deal(marketResults(rec.market), { recorded: rec })!;
      const price = /^\$[\d.]+/.exec(line(r, "Price"))![0];
      expect(line(r, "Trend"), `day ${day}`).toContain(`${price}`);
    }
  });
  it("the trend and the card's Was can't read as the same price: each says whose it is", () => {
    // Track T, Nov 4: "Fell from $105.00 to $84.00" beside "Was $112.00. The same seat on day 1." Both true: the lowest across
    // sellers, and this seller's own. Nothing on the card said so, and a judge opening both saw a contradiction.
    let differ = 0;
    for (let day = 1; day < 7; day++) {
      const rec = recordedMarket("a ticket to The Marsh Lights", day)!;
      const results = marketResults(rec.market);
      const r = deal(results, { recorded: rec })!;
      const trend = line(r, "Trend");
      const was = rec.was[deskDeal(results)!.id];
      expect(trend, `day ${day}`).toContain(TREND_WHOSE);
      if (!was) continue;
      const said = `Was $${was.total} ${was.whose}. ${was.line}`;
      expect(said, `day ${day}`).toContain("from this seller");
      // Neither may borrow the other's owner, and the Was can't sound like the trend's "from $X to $Y".
      expect(trend).not.toMatch(/this seller/i);
      expect(said).not.toMatch(/lowest|cleared|sellers/i);
      const from = /from (\$[\d.]+) to/.exec(trend)?.[1];
      if (from && from !== `$${was.total}`) differ++;
    }
    // The case that started this has to still be here: two different first prices on one card.
    expect(differ).toBeGreaterThan(0);
  });
  it("a recorded item brings its curve; its saved want brings priority, max and day", () => {
    const saved: SavedWant = { catalogId: "harbor-jacket", priority: "nice", rank: 3, max: 7000, neededBy: "2026-12-20", forWho: "Brother", at: NOW } as SavedWant;
    const r = deal([row("fair", "69.00", "clear")], { recorded: { catalogId: "harbor-jacket", day: 5 }, wants: [saved] })!;
    expect(r.call).toBe("WAIT");
    expect(line(r, "Trend")).toMatch(/^Sellers not set aside: lowest price fell from .* this simulated week\.$/);
    expect(line(r, "Priority")).toBe("3 of 5.");
    expect(line(r, "Price")).toBe("$69.00 (simulated), within your $70.00 max.");
  });
});

describe("totalLeft", () => {
  it("is null with no total, and the total less what's been spent", () => {
    const policy = demoPolicy();
    expect(totalLeft([], policy.shopperId)).toBeNull();
    const shopper = new ShopperLedger();
    shopper.run("list", "ask").append(listTotalRow(1, policy.shopperId, 2500));
    expect(totalLeft(shopper.read(), policy.shopperId)).toBe(2500);
  });
});

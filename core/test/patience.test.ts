// Joshua (2026-10-23), market #542435731: the AI opened at $42, then accepted Willowbrook's $59.51 in round 2,
// 99% of his $60 max, "under budget". The guard kept him safe; this pins the good deal: before the last round,
// nothing above 90% of the max is accepted, whatever the AI proposes.

import { describe, expect, it } from "vitest";
import {
  OVER_ASK_RULE, PATIENCE, PATIENCE_RULE, RecordedPort, discipline, RuleBuyer, demoWant, fromCents, generateMarket, libraryTape, marketSellers, patienceCounter, recordPort, runHaggle, DEMO_ITEM, DEMO_SHOPPER,
  type BuyerInput, type BuyerMove, type LedgerEvent, type LlmPort, type TapeFallback, type TapeMove,
} from "../src/index.ts";
import { sha256, world } from "./helpers.ts";

const SEEDS = Array.from({ length: 300 }, (_, i) => 2000 + i * 7919);
const MAX = demoWant().maxPrice;
const LINE = Math.round(MAX * PATIENCE);

/** Joshua's weak haggler: opens at 70%, then takes the cheapest affordable ask from a seller with a record at once. */
const eagerAi: LlmPort = {
  name: "claude-haiku-5-5",
  async decide(i: BuyerInput): Promise<BuyerMove> {
    const ok = i.offers.filter((o) => o.price <= i.want.maxPrice && (o.history ?? 0) > 0).sort((a, b) => a.price - b.price)[0];
    if (i.round === 1 || !ok) return { type: "counter", sellerId: i.offers[0]!.sellerId, price: Math.round(i.want.maxPrice * 0.7), why: "Opening low." };
    return { type: "accept", sellerId: ok.sellerId, price: ok.price, why: "Under budget." };
  },
};

async function haggle(seed: number, buyer: LlmPort, patience?: number) {
  const w = world(seed);
  const result = await runHaggle({ want: demoWant(), sellers: marketSellers(generateMarket(seed), DEMO_ITEM), buyer, guard: w.guard, deps: w.deps, ledger: w.ledger, shopperId: DEMO_SHOPPER, ...(patience ? { patience } : {}) });
  return { result, events: w.ledger.read() };
}

const cents = (p?: string) => Math.round(Number(p) * 100);
const earlyHighAccepts = (ev: LedgerEvent[]) => ev.filter((e) => e.actor === "buyer" && e.action === "accept" && (e.round ?? 0) < 5 && cents(e.price) > LINE);

describe("patience: a good deal, not just a safe one (Joshua, 2026-10-23)", () => {
  it("Joshua's market #542435731: the $59.51 accept in round 2 is held, code counters, and the haggle goes on", async () => {
    const { events } = await haggle(542435731, eagerAi);
    const proposed = events.find((e) => e.action === "propose-accept");
    expect(proposed).toBeDefined();
    const held = events[events.indexOf(proposed!) + 1]!;
    expect([held.actor, held.action, held.layer, held.data?.rule]).toEqual(["code", "counter", undefined, PATIENCE_RULE]); // a deal tactic, not one of the guard's limits
    expect(held.why).toMatch(/^Not yet: \$\d+\.\d\d is \d+% of your \$60\.00 max with \d rounds? left, so code counters at \$\d+\.\d\d and keeps haggling\.$/);
    expect(cents(held.price)).toBeLessThanOrEqual(LINE);
    expect(events.some((e) => e.actor === "seller" && (e.round ?? 0) > (held.round ?? 0))).toBe(true); // the sellers answer the counter
  });

  it("over 300 fresh markets, nothing above 90% of the max is accepted before the last round", async () => {
    let holds = 0;
    for (const s of SEEDS) {
      const { result, events } = await haggle(s, eagerAi);
      expect(earlyHighAccepts(events)).toEqual([]);
      if (result.outcome === "cart" && result.rounds < 5) expect(result.cart.price).toBeLessThanOrEqual(LINE);
      holds += events.filter((e) => e.data?.rule === PATIENCE_RULE).length;
    }
    expect(holds).toBeGreaterThan(30); // the eager AI really proposed early high accepts; the rule had work to do
    // The other 300-market sweep's room (ff3eb18, lesson 34): this one took 4.9 s and then over 5 s in the full suite on a busy Mac (Oct 28).
  }, 30_000);

  it("control: with the rule off, the same eager AI does accept above 90% early (the test can see the failure)", async () => {
    let early = 0;
    for (const s of SEEDS.slice(0, 100)) early += earlyHighAccepts((await haggle(s, eagerAi, 1.01)).events).length;
    expect(early).toBeGreaterThan(10);
  });

  it("on the last round an ask up to the max is still taken", async () => {
    const last: LlmPort = {
      name: "x",
      async decide(i) {
        if (i.round < 5) return { type: "counter", sellerId: i.offers[0]!.sellerId, price: 4200, why: "Low." };
        const best = i.offers.filter((o) => (o.history ?? 0) > 0 && o.price <= MAX).sort((a, b) => a.price - b.price)[0];
        return best ? { type: "accept", sellerId: best.sellerId, price: best.price, why: "Last round." } : { type: "walk", why: "Nothing." };
      },
    };
    let finals = 0;
    for (const s of SEEDS.slice(0, 60)) {
      const r = await haggle(s, last);
      if (r.result.outcome === "cart" && r.result.rounds === 5 && r.result.cart.price > LINE) finals++;
    }
    expect(finals).toBeGreaterThan(0);
  });

  it("the counter moves up toward the line, never down, never above the ask", () => {
    const c = (price: number): BuyerMove => ({ type: "counter", sellerId: "a", price, why: "" });
    expect(patienceCounter(6000, [c(4200)], 5951)).toBe(4800); // halfway from $42 to $54
    expect(patienceCounter(6000, [c(5300)], 5951)).toBe(5350);
    expect(patienceCounter(6000, [c(5500)], 5951)).toBe(5500); // already past the line: hold the bid, don't lower it
    expect(patienceCounter(6000, [c(4200)], 4500)).toBe(4500); // never above the ask
    expect(patienceCounter(6000, [], 5951)).toBe(4800); // no bid yet: from 70%
  });

  it("week 2's slip: a counter above the seller's ask comes down to the ask, and both numbers are on the ledger", () => {
    const offers = [{ sellerId: "pondside", merchant: "Pondside Goods (fictional)", item: DEMO_ITEM, price: 4968, currency: "USD" as const, shape: "one-off" as const, round: 4, note: "" }];
    const ctx = { offers, history: [], round: 4, maxRounds: 5, maxPrice: MAX, patience: PATIENCE, name: () => "Pondside Goods", record: () => 412 };
    const fix = discipline({ type: "counter", sellerId: "pondside", price: 5200, why: "" }, ctx)!;
    expect([fix.rule, fix.price, fix.why]).toEqual([OVER_ASK_RULE, 4968, "Pondside Goods asks only $49.68, so code never bids the $52.00 proposed: it counters at $49.68."]);
    expect(discipline({ type: "counter", sellerId: "pondside", price: 4900, why: "" }, ctx)).toBeNull(); // under the ask: the AI's number stands
    expect(discipline({ type: "counter", sellerId: "pondside", price: 5200, why: "" }, { ...ctx, record: () => 0 })).toBeNull(); // a no-record seller is never bought from anyway
  });

  it("before the last round a bid above the line is held at the line; on the last round it stands", () => {
    const offers = [{ sellerId: "reedbank", merchant: "R", item: DEMO_ITEM, price: 5900, currency: "USD" as const, shape: "one-off" as const, round: 3, note: "" }];
    const ctx = { offers, history: [], round: 3, maxRounds: 5, maxPrice: MAX, patience: PATIENCE, name: () => "Reedbank Outfitters", record: () => 87 };
    expect(discipline({ type: "counter", sellerId: "reedbank", price: 5700, why: "" }, ctx)).toMatchObject({ rule: PATIENCE_RULE, price: LINE });
    expect(discipline({ type: "counter", sellerId: "reedbank", price: 5700, why: "" }, { ...ctx, round: 5 })).toBeNull();
    expect(discipline({ type: "accept", sellerId: "reedbank", price: 5900, why: "" }, { ...ctx, round: 5 })).toBeNull();
    // On the last round no seller answers a counter, so code claims none, even above the ask (reviewer, 014).
    expect(discipline({ type: "counter", sellerId: "reedbank", price: 5950, why: "" }, { ...ctx, round: 5 })).toBeNull();
  });

  it("an accept the guard would refuse is never held: over the max, the guard's refusal comes in the same round", async () => {
    const evil: LlmPort = { name: "x", decide: async (i) => { const o = [...i.offers].sort((a, b) => b.price - a.price)[0]!; return { type: "accept", sellerId: o.sellerId, price: o.price, why: "Take it." }; } };
    let refusals = 0;
    for (const s of SEEDS.slice(0, 60)) {
      const { events } = await haggle(s, evil);
      const first = events.find((e) => e.actor === "buyer")!;
      const ask = cents(events.find((e) => e.actor === "seller" && e.round === 1 && e.sellerId === first.sellerId)!.price);
      if (ask > MAX) {
        refusals++;
        expect(events.filter((e) => e.data?.rule === PATIENCE_RULE)).toEqual([]);
        expect(first).toMatchObject({ action: "accept", round: 1 });
        expect(events[events.indexOf(first) + 1]).toMatchObject({ actor: "guard", action: "refuse", data: { rule: "max" } }); // the very next row
      }
    }
    expect(refusals).toBeGreaterThan(5);
    // Control: under the max and over the line, the same move is held.
    const offers = [{ sellerId: "reedbank", merchant: "R", item: DEMO_ITEM, price: 5900, currency: "USD" as const, shape: "one-off" as const, round: 1, note: "" }];
    const ctx = { offers, history: [], round: 1, maxRounds: 5, maxPrice: MAX, patience: PATIENCE, name: () => "Reedbank Outfitters", record: () => 87 };
    expect(discipline({ type: "accept", sellerId: "reedbank", price: 5900, why: "" }, ctx)?.rule).toBe(PATIENCE_RULE);
    expect(discipline({ type: "accept", sellerId: "reedbank", price: 6100, why: "" }, { ...ctx, offers: [{ ...offers[0]!, price: 6100 }] })).toBeNull();
    expect(discipline({ type: "accept", sellerId: "reedbank", price: 5900, why: "" }, { ...ctx, offers: [{ ...offers[0]!, shape: "subscription" as never }] })).toBeNull();
  });

  it("the line itself is not held, and an ask just over it never reads as 90%", () => {
    const at = (price: number) => discipline({ type: "accept", sellerId: "r", price, why: "" }, { offers: [{ sellerId: "r", merchant: "R", item: DEMO_ITEM, price, currency: "USD", shape: "one-off", round: 2, note: "" }], history: [], round: 2, maxRounds: 5, maxPrice: MAX, patience: PATIENCE, name: () => "R", record: () => 87 });
    expect(at(LINE)).toBeNull();
    expect(at(5420)!.why).toMatch(/^Not yet: \$54\.20 is over 90% of your/);
    expect(at(5700)!.why).toMatch(/^Not yet: \$57\.00 is 95% of your/);
  });

  it("over 300 fresh markets, before the last round, no counter goes above that seller's ask or the line", async () => {
    // An AI that overbids: always the max, to whoever has a record.
    const overbid: LlmPort = { name: "x", decide: async (i) => { const r = i.offers.find((o) => (o.history ?? 0) > 0) ?? i.offers[0]!; return { type: "counter", sellerId: r.sellerId, price: i.want.maxPrice, why: "Max." }; } };
    for (const s of SEEDS.slice(0, 100)) {
      const { events } = await haggle(s, overbid);
      const asks = new Map(events.filter((e) => e.actor === "seller").map((e) => [`${e.round}:${e.sellerId}`, cents(e.price)]));
      const sales = new Map(generateMarket(s).sellers.map((x) => [x.id, x.history]));
      for (const e of events.filter((x) => x.action === "counter")) {
        const bid = cents(e.price);
        if ((e.round ?? 0) < 5) expect(bid).toBeLessThanOrEqual(LINE);
        // The last round's counter is the AI's own and nobody answers it, so code leaves it (the run ends with no deal).
        if ((e.round ?? 0) < 5 && (sales.get(e.sellerId ?? "") ?? 0) > 0) expect(bid).toBeLessThanOrEqual(asks.get(`${e.round}:${e.sellerId}`)!);
      }
    }
  });

  it("the plain rule never needs the hold: it keeps under the line by itself in every market", async () => {
    for (const s of SEEDS) {
      const { events } = await haggle(s, new RuleBuyer());
      expect(events.filter((e) => e.data?.rule === PATIENCE_RULE || e.data?.rule === OVER_ASK_RULE)).toEqual([]);
      expect(earlyHighAccepts(events)).toEqual([]);
    }
    // 300 seeded markets take ~6.5 s on GitHub's 2-core runner (CI red at the 5 s default since W51 review rounds 2-3); keep all 300, give it room.
  }, 30_000);

  it("a held run replays exactly from the library: the buyer's memory holds the counter, not the proposal", async () => {
    const moves: TapeMove[] = [];
    const fallbacks: TapeFallback[] = [];
    const live = await haggle(542435731, recordPort(eagerAi, sha256, (m) => moves.push(m), undefined, (f) => fallbacks.push(f)));
    const tape = libraryTape({ model: "m", modelLabel: "M", promptSha256: "p", seed: 542435731, market: generateMarket(542435731), item: DEMO_ITEM, maxPrice: MAX, at: "2026-10-24T10:00:00.000Z", moves, fallbacks });
    const replay = await haggle(542435731, new RecordedPort(tape, sha256));
    const pick = (ev: LedgerEvent[]) => ev.filter((e) => e.actor !== "seller").map((e) => [e.actor, e.action, e.price ?? ""]);
    expect(pick(replay.events)).toEqual(pick(live.events));
    expect(replay.events.filter((e) => e.data?.source === "rule-fallback")).toEqual([]);
    expect(fromCents(LINE)).toBe("54.00");
  });
});

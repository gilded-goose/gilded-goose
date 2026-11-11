// The screen's models (M2 step 4): lanes, steps, fold, dial preview. Each is checked against the ledger it came
// from, with a control that shows the check can fail (project Lessons 16, 21, 22).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEMO_ITEM, DEMO_SHOPPER, NOT_THIS_ONE, RecordedPort, RuleBuyer, belowOpening, buyerLabel, demoCatalogItems, demoPolicy, demoWant, dialPreview, fold, generateMarket, laneModel,
  marketSellers, runHaggle, serializeLedger, setCategoryLimit, tapeMarket, toCents,
  type LaneModel, type LedgerEvent, type LlmPort, type Tape,
} from "../src/index.ts";
import { sha256, world } from "./helpers.ts";

const FIXTURES = new URL("../../docs/fixtures/", import.meta.url);
const SEED1 = (JSON.parse(readFileSync(new URL("seed-1.json", FIXTURES), "utf8")) as { events: LedgerEvent[] }).events;
const CAT = demoCatalogItems();
const tape = (n: number) => JSON.parse(readFileSync(new URL(`tape-seed-${n}.json`, FIXTURES), "utf8")) as Tape;

async function haggle(seed: number, buyer: LlmPort, sellers = marketSellers(generateMarket(seed), DEMO_ITEM)) {
  const w = world(seed);
  // The worst-case row the server writes first; the edge comes from it.
  w.ledger.append({ t: 0, shopperId: DEMO_SHOPPER, visibility: "owner", actor: "guard", action: "worst-case", layer: 2, verdict: "ok", price: "60.00", currency: "USD", why: "The most any cart can cost right now: $60.00." });
  await runHaggle({ want: demoWant(), sellers, buyer, guard: w.guard, deps: w.deps, ledger: w.ledger, shopperId: DEMO_SHOPPER });
  return w.ledger.read();
}

/** Every mark names a row with that price; the problems, or [] when the model is all ledger. */
function unbacked(m: LaneModel, events: LedgerEvent[]): string[] {
  const bySeq = new Map(events.map((e) => [e.seq, e]));
  const marks = [...(m.edge ? [m.edge] : []), ...m.lanes.flatMap((l) => l.marks)];
  return marks.filter((k) => { const e = bySeq.get(k.seq); return !e || e.price === undefined || toCents(e.price) !== k.price; }).map((k) => `seq ${k.seq} $${k.price / 100}`);
}

describe("laneModel: every mark is a ledger row (Lesson 21)", () => {
  it("over 100 fresh markets and the seed-1 fixture, no mark lacks its row", async () => {
    for (let i = 0; i < 100; i++) {
      const ev = await haggle(3000 + i * 7919, new RuleBuyer());
      expect(unbacked(laneModel(ev), ev)).toEqual([]);
    }
    expect(unbacked(laneModel(SEED1), SEED1)).toEqual([]);
  }, 30_000);

  it("control: a constant extra point, or a price moved by a cent, is caught", () => {
    const m = laneModel(SEED1);
    expect(unbacked({ ...m, lanes: [...m.lanes, { id: "band", kind: "seller", name: "x", sub: "", marks: [{ seq: 999, round: 1, price: 5400 }], flag: null }] }, SEED1)).toEqual(["seq 999 $54"]);
    const moved = { ...m, lanes: m.lanes.map((l, i) => (i === 0 ? { ...l, marks: l.marks.map((k, j) => (j === 0 ? { ...k, price: k.price + 1 } : k)) } : l)) };
    expect(unbacked(moved, SEED1)).toHaveLength(1);
  });

  it("seed 1: three seller lanes and the agent, the edge at $60, a deal at Reedbank $50.12 in round 5", () => {
    const m = laneModel(SEED1);
    expect(m.edge).toMatchObject({ seq: 0, price: 6000 });
    expect(m.lanes.map((l) => [l.name, l.sub, l.marks.length])).toEqual([
      ["Pondside Goods", "412 sales on record", 5], ["Reedbank Outfitters", "87 sales on record", 5], ["QuickQuack Deals", "no sales on record", 5], ["the agent's bid", "plain rule, no AI", 4],
    ]);
    expect(m.deal).toEqual({ seq: 20, sellerId: "reedbank", price: 5012, round: 5 });
    expect([m.rounds, m.walked]).toEqual([5, null]);
  });

  it("the cart's savings line: the deal against the same seller's opening ask, from that offer's own row", () => {
    const m = laneModel(SEED1);
    const open = SEED1.find((e) => e.actor === "seller" && e.sellerId === "reedbank")!;
    expect(belowOpening(m)).toEqual({ seq: open.seq, opening: toCents(open.price!), below: toCents(open.price!) - 5012 });
    expect(belowOpening({ ...m, deal: null })).toBeNull();
  });

  it("week 1's recording: the AI's $49.50 proposal and code's $47.73 counter are one step, and the bid lane carries the code's price", async () => {
    const t = tape(1);
    const ev = await haggle(1, new RecordedPort(t, sha256), marketSellers(tapeMarket(t), DEMO_ITEM));
    const m = laneModel(ev);
    const held = m.steps.find((s) => s.code !== null)!;
    expect(held.proposal).toMatchObject({ action: "propose-counter", price: 4950, source: "recorded" });
    expect(held.code).toMatchObject({ price: 4773, rule: "over-ask" });
    const bids = m.lanes.find((l) => l.kind === "agent")!.marks.map((k) => k.price);
    expect(bids).toContain(4773);
    expect(bids).not.toContain(4950); // a proposal code replaced never reached a seller
    expect(m.lanes.find((l) => l.kind === "agent")!.sub).toMatch(/^recorded · Claude Haiku 5\.5 · \d{4}-\d\d-\d\d$/);
  });

  it("week 3's recording walks: no deal, the walk row is named", async () => {
    const t = tape(3);
    const ev = await haggle(3, new RecordedPort(t, sha256), marketSellers(tapeMarket(t), DEMO_ITEM));
    const m = laneModel(ev);
    expect(m.deal).toBeNull();
    expect(m.walked?.why).toMatch(/walking away/);
  });

  it("an accept the guard refuses is not a deal", async () => {
    const evil: LlmPort = { name: "x", decide: async (i) => { const o = [...i.offers].sort((a, b) => b.price - a.price)[0]!; return { type: "accept", sellerId: o.sellerId, price: o.price, why: "Take it." }; } };
    for (let i = 0; i < 40; i++) {
      const ev = await haggle(5000 + i * 31, evil);
      // The guard's or the fence's refusal (the Watcher's row refusing a seller nobody accepted says nothing about this accept).
      if (ev.some((e) => (e.actor === "guard" || e.actor === "fence") && e.verdict === "refused")) expect(laneModel(ev).deal).toBeNull();
    }
  });

  it("PayPal off, a failed order or your cancel close the cart but keep code's yes; a guard refusal still undoes it", () => {
    const at = SEED1.length;
    const row = (actor: string, action: string, why: string): LedgerEvent => ({ v: 1, seq: at, t: 0, shopperId: "s", visibility: "owner", actor: actor as LedgerEvent["actor"], action, verdict: "refused", why });
    for (const [actor, action] of [["paypal", "unavailable"], ["paypal", "error"], ["shopper", "cancel"], ["cart", "refuse"], ["paypal", "capture-failed"]]) {
      const m = laneModel([...SEED1, row(actor!, action!, "closed")]);
      expect(m.deal).toMatchObject({ seq: 20, price: 5012 });
      expect(m.closed).toEqual({ seq: at, why: "closed" });
    }
    // Control: the guard's own refusal after the accept is still no deal.
    expect(laneModel([...SEED1, row("guard", "refuse", "no")]).deal).toBeNull();
  });

  it("before a run there is nothing to draw, and no edge", () => {
    expect(laneModel([])).toEqual({ edge: null, lanes: [], steps: [], rounds: 0, deal: null, walked: null, closed: null });
  });
});

describe("buyerLabel says who moved", () => {
  const row = (source: string, extra: Record<string, string> = {}): LedgerEvent => ({ v: 1, seq: 0, t: 0, shopperId: "s", visibility: "owner", actor: "buyer", action: "counter", why: "w", data: { source, ...extra } });
  it("rule, live, recorded, and a live run with fallbacks", () => {
    expect(buyerLabel([row("rule")])).toBe("plain rule, no AI");
    expect(buyerLabel([row("claude-haiku-5-5"), row("claude-haiku-5-5")])).toBe("Claude Haiku 5.5, live");
    expect(buyerLabel([row("recorded", { modelLabel: "Claude Haiku 5.5", recordedOn: "2026-10-23" })])).toBe("recorded · Claude Haiku 5.5 · 2026-10-23");
    expect(buyerLabel([row("claude-haiku-5-5"), row("rule-fallback")])).toBe("Claude Haiku 5.5, live · 1 of 2 moves by the plain rule");
    expect(buyerLabel([])).toBe("");
  });
});

describe("fold: for the eye only (Lesson 22)", () => {
  it("seed 1: counts sum to the row count, the serialized ledger is unchanged, decisions never fold", () => {
    const before = serializeLedger(SEED1);
    const f = fold(SEED1);
    expect(f.reduce((n, x) => n + x.count, 0)).toBe(SEED1.length);
    expect(serializeLedger(SEED1)).toBe(before);
    expect(f.filter((x) => x.count > 1).every((x) => x.e.actor === "seller")).toBe(true);
    // QuickQuack's same $20.30 and the same note, five rounds: one row, four more named.
    const qq = f.find((x) => x.e.sellerId === "quickquack")!;
    expect([qq.count, qq.also]).toEqual([5, [7, 11, 15, 19]]);
  });

  it("Pondside's $58.00 → $55.37 never folds; a mutant keyed on the seller alone would fold it", () => {
    const pond = fold(SEED1).filter((x) => x.e.sellerId === "pondside" && x.e.actor === "seller");
    expect(pond.map((x) => x.e.price)).toEqual(["58.00", "55.37", "54.26", "53.36"]); // $53.36 twice: rounds 4 and 5
    expect(pond.at(-1)!.also).toEqual([17]);
    const mutant = (ev: LedgerEvent[]) => { const s = new Set<string>(); return ev.filter((e) => e.actor !== "seller" || !s.has(e.sellerId!) && !!s.add(e.sellerId!)); };
    expect(mutant(SEED1).filter((e) => e.sellerId === "pondside" && e.actor === "seller").map((e) => e.price)).toEqual(["58.00"]);
  });
});

describe("dialPreview: counted from the ledger, never typed in (Lesson 16)", () => {
  // Captures name the kettle's catalog entry, as settle writes them (W11), so they count toward the kitchen.
  const ev = (over: Partial<LedgerEvent>): LedgerEvent => ({ v: 1, seq: 0, t: 0, shopperId: "s", visibility: "owner", actor: "paypal", action: "captured", verdict: "ok", price: "25.00", why: "w", data: { catalogId: "kettle" }, ...over });
  it("0 with nothing, 1 for a clean $25 capture, 0 over the kitchen's $60 limit, 0 after a bad pick, capped at 3", () => {
    const p = demoPolicy();
    expect(dialPreview([], p, "kitchen", CAT)).toEqual({ category: "Kitchen", setting: "ask me first (the starting setting)", clean: 0, needed: 3, limit: 6000 });
    expect(dialPreview([ev({})], p, "kitchen", CAT).clean).toBe(1);
    expect(dialPreview([ev({ price: "60.01" })], p, "kitchen", CAT).clean).toBe(0);
    expect(dialPreview([ev({}), ev({ actor: "shopper", action: NOT_THIS_ONE, verdict: "refused" })], p, "kitchen", CAT).clean).toBe(0);
    expect(dialPreview([ev({}), ev({}), ev({}), ev({})], p, "kitchen", CAT).clean).toBe(3);
    expect(dialPreview([], demoPolicy({ dial: { kitchen: "buy-within-limits" } }), "kitchen", CAT).setting).toBe("buy within limits");
  });
  it("seed 1 (approved, not yet paid) counts 0", () => {
    expect(dialPreview(SEED1, demoPolicy(), "kitchen", CAT).clean).toBe(0);
  });
  it("dial_limit_comes_from_policy: the limit is the Policy's for that category, never a constant in the view", () => {
    const at = (kitchen: string) => dialPreview([ev({ price: "47.73" })], demoPolicy({ categoryLimit: { kitchen: toCents(kitchen) } }), "kitchen", CAT);
    expect(at("60.00")).toMatchObject({ limit: 6000, clean: 1 });
    // Control: the same capture over a lower limit is not clean, and the limit shown moves with the Policy.
    expect(at("30.00")).toMatchObject({ limit: 3000, clean: 0 });
    // A category Settings never set reads the strictest limit, and never above the per-purchase cap.
    expect(dialPreview([], demoPolicy({ categoryLimit: { kitchen: toCents("60.00"), garden: toCents("40.00") } }), "electronics", CAT).limit).toBe(4000);
    expect(dialPreview([], demoPolicy({ categoryLimit: { kitchen: toCents("500.00") } }), "kitchen", CAT).limit).toBe(15000); // the $150.00 cap (Desk-L)
  });
  it("watcher_refusal_is_not_a_bad_pick: only an Auditor veto or a shopper rejection resets the record", () => {
    const p = demoPolicy();
    const after = (bad: Partial<LedgerEvent>) => dialPreview([ev({}), ev(bad), ev({})], p, "kitchen", CAT).clean;
    // The Watcher flagging or refusing QuickQuack, and the guard refusing a cart, are the system working.
    expect(after({ actor: "watcher", action: "flag", verdict: "flagged" })).toBe(2);
    expect(after({ actor: "watcher", action: "refuse", verdict: "refused" })).toBe(2);
    expect(after({ actor: "guard", action: "refuse", verdict: "refused" })).toBe(2);
    expect(after({ actor: "cart", action: "refuse", verdict: "refused" })).toBe(2);
    // Control: a bad pick resets the count, and only the carts after it count again.
    expect(after({ actor: "auditor", action: "veto", verdict: "refused" })).toBe(1);
    expect(after({ actor: "shopper", action: NOT_THIS_ONE, verdict: "refused" })).toBe(1);
  });
  it("raise_resets_record: after a limit raise, only carts captured after it count toward the strong record", () => {
    const before = [1, 2, 3].map((t) => ev({ t }));
    const p = demoPolicy();
    expect(dialPreview(before, p, "kitchen", CAT).clean).toBe(3);
    // Raised at t=3: the three carts kept under $60 say nothing about $80, so the count starts again from the raise.
    const raised = setCategoryLimit(p, "kitchen", toCents("80.00"), 3);
    expect(dialPreview(before, raised, "kitchen", CAT)).toMatchObject({ limit: 8000, clean: 0, needed: 3 });
    const later = [...before, ev({ t: 4 }), ev({ t: 5, price: "75.00" })];
    expect(dialPreview(later, raised, "kitchen", CAT).clean).toBe(2);
    // Control: a lower limit, or a raise in another category, keeps the kitchen's record.
    expect(dialPreview(before, setCategoryLimit(p, "kitchen", toCents("50.00"), 3), "kitchen", CAT).clean).toBe(3);
    expect(dialPreview(before, setCategoryLimit(p, "garden", toCents("90.00"), 3), "kitchen", CAT).clean).toBe(3);
  });
});



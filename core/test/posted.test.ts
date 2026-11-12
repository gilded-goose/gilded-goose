// Runs for moving items (§15B part 2): the ticket, the hotel night and the flight seat haggled end to end through the
// real engine and guard, on the simulated day's posted totals. The scam listing is always refused, never a cart, and a
// cart is only ever the posted total on the listing.

import { describe, expect, it } from "vitest";
import { DEMO_ENTRY, DEMO_SHOPPER, DEMO_T0, Guard, MemoryLedger, RuleBuyer, demoCatalog, demoCatalogItems, demoDeps, demoPolicy, runHaggle, sha256Hex, toCents, type LlmPort, type Policy } from "../src/index.ts";
import { MOVING_ITEMS, priceOn } from "../src/sellers/moving.ts";
import { POSTED_NOTE, POSTED_ROUNDS, movingItem, postedSellers, postedWant } from "../src/sellers/posted.ts";
import { RUN_ENTRIES, SAY_WHICH, NOT_SHOPPED_YET, notShoppedYet, runEntry, runsShop, runsShopCategory } from "../src/ask/shops.ts";
import { BEAT_DAY } from "../src/ask/watching.ts";
import { localRun } from "../src/view/local.ts";
import { RunLibrary } from "../src/buyer/library.ts";

const CATALOG = demoCatalogItems();
const LIMITS = { events: toCents("90.00"), travel: toCents("95.00") };

async function run(id: string, day: number, policy: Partial<Policy> = { categoryLimit: { kitchen: toCents("60.00"), ...LIMITS } }, buyer: LlmPort = new RuleBuyer()) {
  const item = movingItem(id)!;
  const deps = demoDeps(7, (s: string) => sha256Hex(s));
  const ledger = new MemoryLedger();
  const pol = demoPolicy(policy);
  const guard = new Guard(deps, ledger, pol, CATALOG);
  const r = await runHaggle({ want: postedWant(item, pol, DEMO_T0 + 7 * 86_400_000), sellers: postedSellers(item, day), buyer, guard, deps, ledger, shopperId: DEMO_SHOPPER, catalogId: id, hideRefused: true, maxRounds: POSTED_ROUNDS });
  return { r, rows: ledger.read() };
}

describe("what a run shops: the kettle and the three moving items, held equal to the catalog", () => {
  it("RUN_ENTRIES are the catalog's kettle and moving entries, ids, categories and all", () => {
    expect(Object.keys(RUN_ENTRIES)).toEqual([DEMO_ENTRY, ...MOVING_ITEMS.map((i) => i.id)]);
    for (const [id, e] of Object.entries(RUN_ENTRIES)) expect(CATALOG.get(id)?.category, id).toBe(e.category);
    expect(MOVING_ITEMS.every((i) => runsShop(i.id))).toBe(true);
    expect(runsShop("toaster")).toBe(false);
  });

  it("the entry a run shops: an item chip's, else the one entry a category names, else the kettle; travel alone says which", () => {
    expect(runEntry([{ kind: "item", value: "mossbell-night" }])).toBe("mossbell-night");
    expect(runEntry([{ kind: "category", value: "events" }])).toBe("marsh-lights-ticket");
    expect(runEntry([{ kind: "attribute", name: "color", value: "black" }])).toBe(DEMO_ENTRY);
    expect(runEntry(undefined)).toBe(DEMO_ENTRY);
    expect(runsShopCategory("travel")).toBe(false);
    expect(notShoppedYet([{ kind: "category", value: "travel" }])).toBe(SAY_WHICH);
    expect(notShoppedYet([{ kind: "category", value: "travel" }, { kind: "item", value: "gullwing-seat" }])).toBeNull();
    expect(notShoppedYet([{ kind: "item", value: "toaster" }])).toBe(NOT_SHOPPED_YET);
    expect(notShoppedYet([{ kind: "category", value: "garden" }])).toBe(NOT_SHOPPED_YET);
    for (const w of [SAY_WHICH, NOT_SHOPPED_YET]) expect(w).toMatch(/no run started and nothing was bought/);
  });
});

describe("posted sellers: a curve on one simulated day", () => {
  it("each listing seller asks its posted total every round, whatever the bid; one not listing yet isn't there", () => {
    const ticket = movingItem("marsh-lights-ticket")!;
    const day0 = postedSellers(ticket, 0);
    expect(day0.map((s) => s.id)).toEqual(["lanternhall", "reedwhistle"]); // TixQuack lists from day 1
    const s = day0[0]!;
    const total = priceOn(ticket.sellers[0]!.curve, 0)!.total;
    expect(s.open(1)).toMatchObject({ price: total, item: ticket.item, merchant: "Lantern Hall Box Office (fictional)", note: POSTED_NOTE, shape: "one-off" });
    const rng = { next: () => 0.5 };
    for (const bid of [null, 1, total - 1, total, total + 5000]) expect(s.respond(bid, 3, rng)?.price).toBe(total);
    expect(postedSellers(ticket, 1).find((x) => x.id === "tixquack")?.open(1).note).toMatch(/gift card/);
    expect(movingItem("kettle")).toBeUndefined();
  });
});

describe("a run for each moving item: the cheapest honest posted total under the limit, the scam never", () => {
  it("the ticket on day 5 (simulated day 6): Lantern Hall at $91.00 is over $90, Reedwhistle too; TixQuack's gift card is refused: no cart", async () => {
    const { r, rows } = await run("marsh-lights-ticket", 5);
    expect(r.outcome).not.toBe("cart");
    expect(rows.some((e) => e.sellerId === "tixquack" && e.verdict === "refused")).toBe(true);
  });

  for (const [id, day, seller, total] of [
    ["marsh-lights-ticket", 4, "lanternhall", "84.00"],
    ["mossbell-night", 5, "mossbell", "89.00"],
    ["gullwing-seat", 6, "gullwing", "88.00"],
  ] as const) {
    it(`${id} on day ${day}: a cart from ${seller} at exactly its posted $${total}, the scam listing refused`, async () => {
      const { r, rows } = await run(id, day);
      expect(r.outcome).toBe("cart");
      if (r.outcome !== "cart") return;
      expect(r.cart).toMatchObject({ sellerId: seller, price: toCents(total), item: movingItem(id)!.item, catalogId: id });
      const scam = movingItem(id)!.sellers.find((s) => s.note !== "")!;
      expect(rows.some((e) => e.sellerId === scam.sellerId && e.verdict === "refused")).toBe(true);
      expect(rows.some((e) => e.action === "bound" && e.sellerId === scam.sellerId)).toBe(false);
    });
  }

  it("the beat: the ticket on the wants card's day (BEAT_DAY) buys Lantern Hall's $84.00, the card's own line", async () => {
    const { r } = await run("marsh-lights-ticket", BEAT_DAY);
    expect(r.outcome === "cart" && r.cart).toMatchObject({ sellerId: "lanternhall", price: toCents("84.00") });
  });

  // What the product reaches: every run is on BEAT_DAY, at the limit the one Settings tap suggests (the catalog's max).
  for (const [id, seller, total] of [["marsh-lights-ticket", "lanternhall", "84.00"], ["mossbell-night", "mossbell", "99.00"], ["gullwing-seat", "gullwing", "96.00"]] as const) {
    it(`${id} on the card's day at Settings' suggested limit: ${seller} at its posted $${total}`, async () => {
      const category = CATALOG.get(id)!.category;
      const suggest = Math.max(...demoCatalog().filter((e) => e.want.category === category).map((e) => e.want.maxPrice));
      const { r } = await run(id, BEAT_DAY, { categoryLimit: { kitchen: toCents("60.00"), [category]: suggest } });
      expect(r.outcome === "cart" && r.cart).toMatchObject({ sellerId: seller, price: toCents(total) });
    });
  }

  it("a posted run is one round: the buyer takes the best honest total or walks, and never counters a price that can't move", async () => {
    const { r, rows } = await run("marsh-lights-ticket", BEAT_DAY);
    expect(r.outcome === "cart" && r.rounds).toBe(1);
    expect(rows.some((e) => e.actor === "buyer" && e.action === "counter")).toBe(false);
    expect(rows.some((e) => e.data?.rule === "patience")).toBe(false);
    const walked = await run("marsh-lights-ticket", 5);
    expect(walked.rows.filter((e) => e.actor === "buyer" && e.action === "walk").map((e) => e.why)).toEqual(["No one-off offer at or under $90.00 after 1 round."]);
  });

  it("a buyer that names the hidden scam seller anyway gets no cart: the guard still refuses it", async () => {
    const greedy: LlmPort = { name: "greedy", decide: async () => ({ type: "accept", sellerId: "tixquack", price: toCents("55.00"), why: "cheapest" }) };
    const { r, rows } = await run("marsh-lights-ticket", BEAT_DAY, undefined, greedy);
    expect(r.outcome).not.toBe("cart");
    expect(rows.some((e) => e.action === "bound")).toBe(false);
  });

  it("with no limit of its own the category is held to the smallest set limit ($60): every honest total is over it, and the scam is still refused", async () => {
    // A Policy with only the locked kitchen and events limits (the demo's own sets travel at $100.00 since Desk-L): travel
    // has no limit of its own, so it is held to the kitchen's $60.00.
    const LOCKED_ONLY = { categoryLimit: { kitchen: toCents("60.00"), events: toCents("90.00") } };
    const unset = MOVING_ITEMS.filter((i) => !Object.hasOwn(LOCKED_ONLY.categoryLimit, i.category));
    expect(unset.map((i) => i.id)).toEqual(["mossbell-night", "gullwing-seat"]);
    for (const item of unset) {
      for (let day = 0; day < 7; day++) {
        const { r, rows } = await run(item.id, day, LOCKED_ONLY);
        if (r.outcome === "cart") throw new Error(`${item.id} day ${day}: a cart under the $60 fallback from ${r.cart.sellerId}`);
        const scam = item.sellers.find((s) => s.note !== "")!;
        if (priceOn(scam.curve, day)) expect(rows.some((e) => e.sellerId === scam.sellerId && e.verdict === "refused"), `${item.id} day ${day}`).toBe(true);
      }
    }
  });

  it("the ticket under the demo's own defaults (Joshua, Fri Oct 30: events set at $90.00): the beat day's $84.00 at Lantern Hall, TixQuack refused", async () => {
    expect(demoPolicy().categoryLimit.events).toBe(toCents("90.00"));
    const { r, rows } = await run("marsh-lights-ticket", BEAT_DAY, {});
    expect(r.outcome === "cart" && r.cart).toMatchObject({ sellerId: "lanternhall", price: toCents("84.00") });
    expect(rows.some((e) => e.sellerId === "tixquack" && e.actor === "watcher" && e.verdict === "refused")).toBe(true);
    // Every day of the recorded week: a cart only ever at or under $90.00, and never TixQuack's.
    for (let day = 0; day < 7; day++) {
      const { r: d } = await run("marsh-lights-ticket", day, {});
      if (d.outcome === "cart") { expect(d.cart.sellerId, `day ${day}`).not.toBe("tixquack"); expect(d.cart.price, `day ${day}`).toBeLessThanOrEqual(toCents("90.00")); }
    }
  });
});

describe("a moving item's run in the browser (H1: no server)", () => {
  it("never a kettle under the ticket's chip: its posted sellers, the rule, the demo's $90.00 events limit, the scam refused, a cart and no order", async () => {
    const r = localRun({ library: new RunLibrary("x"), asked: 2, maxPrice: toCents("60.00"), hash: sha256Hex, now: () => DEMO_T0, fresh: () => 77, pace: false, chips: [{ kind: "item", value: "marsh-lights-ticket" }] });
    // The page's kettle max ($60.00) isn't the ticket's: the demo's events limit is.
    expect(r.head).toMatchObject({ week: null, buyer: "rule", replayable: false, category: "events", limit: "90.00", want: { item: movingItem("marsh-lights-ticket")!.item, maxPrice: "90.00" } });
    expect(r.head.note).toMatch(/plain rule is buying\. Prices are the posted totals on simulated day 5, fees and taxes in \(a fictional market\)\. Run in your browser: no AI call, no order\.$/);
    const done = await r.done;
    // The beat's $84.00 at Lantern Hall, bound for the shopper's tap; a browser run places no order.
    expect(done.bound).toMatchObject({ total: "84.00" });
    expect(done.outcome).toBe("cart");
    expect(done.events.find((e) => e.actor === "guard" && (e.action === "ask" || e.action === "buy"))?.sellerId).toBe("lanternhall");
    expect(done.events.some((e) => e.actor === "buyer" && e.action === "counter")).toBe(false); // one round, as on the server
    expect(done.events.some((e) => e.sellerId === "tixquack" && e.actor === "watcher" && e.verdict === "refused")).toBe(true);
    const offered = new Set(done.events.filter((e) => e.actor === "seller" && e.action === "offer").map((e) => e.sellerId));
    expect([...offered].sort()).toEqual(["lanternhall", "reedwhistle", "tixquack"]);
  });
});

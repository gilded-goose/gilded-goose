// The AI reader in shopping runs (Joshua, Fri Nov 6 12:10): "It may only hold a seller for my tap, never clear one, never
// touch money, limits or the cart. A per-run and per-day cap; on timeout or cap it falls back to code-only and says so on
// the run." Code reads first; the reader is asked only about sellers code cleared, and its one output is a hold.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DailyCap, MISSED_READ_MS, MarketCache, READER_SAID, SHOP_READER_SAYS, heldResults, holdOnly, keepRead, keptAnswer, makeFictionalMarket, marketCategory, marketGuard,
  marketResults, marketWant, readShop, readerHeld, shopSellers, storeCart, type FictionalMarket, type MarketMakerPort,
  type ReaderHold, type ReaderInput, type ReaderPort, type StoreResult,
} from "../src/index.ts";
import { world } from "./helpers.ts";

/** A reader that answers each seller with whatever the test hands it, and keeps what it was asked. */
function reader(answer: unknown | ((input: ReaderInput) => unknown)): ReaderPort & { asked: ReaderInput[] } {
  const asked: ReaderInput[] = [];
  return {
    name: "test-reader", asked,
    async read(input: ReaderInput) { asked.push(input); return typeof answer === "function" ? (answer as (i: ReaderInput) => unknown)(input) : answer; },
  };
}
const maker = (answer: unknown): MarketMakerPort => ({ name: "test-maker", async propose() { return answer; } });
async function market(): Promise<FictionalMarket> {
  const r = await makeFictionalMarket({
    words: "running shoes", cache: new MarketCache(), port: maker({
      item: "Trail running shoes",
      sellers: [
        { name: "Pondside Goods", price: 2900, history: 412, note: "Ships in two days. Returns within 30 days." },
        { name: "Reedbank Outfitters", price: 3450, history: 87, note: "Breathable mesh, true to size." },
        { name: "Cattail Supply", price: 1999, history: 0, note: "Our first week on the market." },
      ],
    }),
  });
  if (r.kind !== "market") throw new Error("no market");
  return r.market;
}
const day = (limit = 300) => new DailyCap(limit, () => Date.UTC(2026, 10, 6, 12));
const opts = (over: Partial<Parameters<typeof readShop>[2]> = {}) => ({ perRun: 6, timeoutMs: 200, day: day(), ...over });

// Replies a broken, fooled or hostile reader might give. Only a "hold" or "refuse" reading in exactly the schema holds.
const HOSTILE: unknown[] = [
  "approve", { verdict: "approve", sign: "other" }, { verdict: "clear", sign: "other" }, { verdict: "clear", sign: "other", approve: true },
  { verdict: "hold", sign: "other", amount: 1 }, { verdict: "hold", sign: "other", limit: 99999 }, { verdict: "refuse", sign: "other", cart: {} },
  { approve: true, price: 1, limit: 1e9 }, null, 42, [], { verdict: "hold" }, { verdict: "hold", sign: "nothing-on-the-list" },
];

describe("the shopping-run AI reader may only hold a seller code cleared", () => {
  it("holdOnly: a hold or refuse reading is a hold, and nothing else is anything", () => {
    expect(holdOnly({ verdict: "hold", sign: "gift-card" })).toEqual({ verdict: "hold", sign: "gift-card" });
    expect(holdOnly({ verdict: "refuse", sign: "off-paypal" })).toEqual({ verdict: "hold", sign: "off-paypal" });
    for (const h of HOSTILE) expect(holdOnly(h)).toBeNull();
    expect(Object.isFrozen(holdOnly({ verdict: "refuse", sign: "other" }))).toBe(true);
    // The type has room for a hold only: a clear, a refuse, an amount, a limit or a cart doesn't compile.
    // @ts-expect-error a ReaderHold is never a clear
    const clear: ReaderHold = { verdict: "clear", sign: "other" };
    // @ts-expect-error nor a refuse
    const refuse: ReaderHold = { verdict: "refuse", sign: "other" };
    // @ts-expect-error nor carries an amount
    const amount: ReaderHold = { verdict: "hold", sign: "other", amount: 1 };
    expect([clear, refuse, amount]).toHaveLength(3);
  });

  it("asks only about sellers code cleared, and quotes their words", async () => {
    const m = await market();
    const results = marketResults(m);
    const port = reader({ verdict: "clear", sign: "other" });
    const read = await readShop(port, shopSellers(results, m.listings), opts());
    const cleared = results.filter((r) => r.watcher === "clear");
    expect(cleared.length).toBeGreaterThan(0);
    expect(results.some((r) => r.watcher !== "clear")).toBe(true);
    expect(port.asked).toHaveLength(cleared.length);
    expect(read).toMatchObject({ miss: null, asked: cleared.length, says: SHOP_READER_SAYS.read });
    expect(read.holds.size).toBe(0);
    for (const a of port.asked) expect(Object.keys(a).sort()).toEqual(["item", "merchant", "note"]);
  });

  it("a hostile \"approve\" reply changes nothing; a scam reading changes only cleared sellers, and only to hold", async () => {
    const m = await market();
    const place = marketCategory(m.words, [], world(1).policy);
    const results = heldResults(marketResults(m), place, null);
    for (const h of HOSTILE) {
      const read = await readShop(reader(h), shopSellers(results, m.listings), opts());
      expect(readerHeld(results, read.holds)).toEqual(results);
    }
    const read = await readShop(reader({ verdict: "refuse", sign: "gift-card" }), shopSellers(results, m.listings), opts());
    const after = readerHeld(results, read.holds);
    expect(after).toHaveLength(results.length);
    after.forEach((a, i) => {
      const b = results[i]!;
      // Price, seller, record, quoted note, the cap's mark: all as code read them. Only the verdict and its words move.
      const { watcher: wa, said: sa, ...restA } = a;
      const { watcher: wb, said: sb, ...restB } = b;
      expect(restA).toEqual(restB);
      if (wb === "clear") { expect(wa).toBe("hold"); expect(sa).toEqual([...sb, READER_SAID.hold]); }
      else { expect(wa).toBe(wb); expect(sa).toEqual(sb); }
    });
    expect(after.filter((r) => r.watcher === "refuse")).toEqual(results.filter((r) => r.watcher === "refuse"));
  });

  it("at the cart: the reader's hold waits for her yes with the reader's words, at the same total; it never clears or lifts a refusal", async () => {
    const m = await market();
    const results = marketResults(m);
    const cart = (listingId: string, reading: ReaderHold | null) => {
      const w = world(1);
      const place = marketCategory(m.words, [], w.policy);
      const want = marketWant(m, place, w.policy, w.deps.clock.now());
      const before = { policy: structuredClone(w.policy), want: structuredClone(want) };
      const r = storeCart({ guard: marketGuard(w.deps, w.ledger, w.policy, m, place), want, ledger: w.ledger, shopperId: w.policy.shopperId, now: w.deps.clock.now(), listingId, listings: m.listings, reading });
      expect(w.policy).toEqual(before.policy);
      expect(want).toEqual(before.want);
      return { r, rows: w.ledger.read() };
    };
    const hold = holdOnly({ verdict: "refuse", sign: "gift-card" })!;
    const clean = results.find((r) => r.watcher === "clear")!;
    const code = cart(clean.id, null).r;
    const held = cart(clean.id, hold);
    expect(code.kind).toBe("cart");
    expect(held.r.kind).toBe("cart");
    if (code.kind !== "cart" || held.r.kind !== "cart") return;
    expect(held.r.total).toBe(code.total);
    expect(held.r.bound.cart).toEqual(code.bound.cart);
    expect(held.r.decision).toBe("ask");
    expect(held.r.holds).toContain(READER_SAID.hold);
    expect(code.holds).not.toContain(READER_SAID.hold);
    // The model's words never reach the ledger: only fixed phrases.
    expect(JSON.stringify(held.rows)).not.toMatch(/gift-card"|test-reader/);
    // A seller code set aside stays set aside, whatever the reader says.
    const scam = results.find((r) => r.watcher === "refuse")!;
    expect(cart(scam.id, hold).r.kind).toBe("refused");
    expect(cart(scam.id, null).r.kind).toBe("refused");
  });

  it("caps: at most perRun sellers a run, and a day's reads across runs; then code-only, said so", async () => {
    const m = await market();
    const sellers = shopSellers(marketResults(m), m.listings).map((s) => ({ ...s, code: "clear" as const }));
    expect(sellers.length).toBeGreaterThanOrEqual(3);
    const scam = { verdict: "refuse", sign: "other" };
    const one = reader(scam);
    const run = await readShop(one, sellers, opts({ perRun: 2 }));
    expect(one.asked).toHaveLength(2);
    expect(run).toMatchObject({ asked: 2, miss: "run-cap", says: SHOP_READER_SAYS["run-cap"] });
    expect(run.holds.size).toBe(2);

    const today = day(4);
    const first = await readShop(reader(scam), sellers, opts({ day: today }));
    expect(first.asked).toBe(sellers.length);
    const second = reader(scam);
    const next = await readShop(second, sellers, opts({ day: today }));
    expect(second.asked).toHaveLength(4 - sellers.length);
    expect(next).toMatchObject({ miss: "day-cap", says: SHOP_READER_SAYS["day-cap"] });
    const none = reader(scam);
    expect(await readShop(none, sellers, opts({ day: today }))).toMatchObject({ asked: 0, miss: "day-cap" });
    expect(none.asked).toHaveLength(0);
    expect(today.left("all")).toBe(0);
  });

  it("caps: an address runs out of its own reads before it can spend everyone's; a take the day cap refuses is handed back", async () => {
    const m = await market();
    const sellers = shopSellers(marketResults(m), m.listings).map((s) => ({ ...s, code: "clear" as const }));
    const scam = { verdict: "refuse", sign: "other" };
    const perAddress = day(2), everyone = day(300);
    const at = (ip: string) => ({ take: () => perAddress.take(ip), give: () => perAddress.give(ip) });
    // One script at one address: two reads, then code-only for it, said so; the day's count only moved by its two.
    const script = reader(scam);
    const first = await readShop(script, sellers, opts({ day: everyone, visitor: at("203.0.113.9") }));
    expect(script.asked).toHaveLength(2);
    expect(first).toMatchObject({ asked: 2, miss: "visitor-cap", says: SHOP_READER_SAYS["visitor-cap"] });
    expect(first.holds.size).toBe(2);
    expect(await readShop(reader(scam), sellers, opts({ day: everyone, visitor: at("203.0.113.9") }))).toMatchObject({ asked: 0, miss: "visitor-cap" });
    expect(everyone.left("all")).toBe(298);
    // Someone else still gets the reader.
    const other = reader(scam);
    expect(await readShop(other, sellers, opts({ day: everyone, visitor: at("198.51.100.4") }))).toMatchObject({ asked: 2, miss: "visitor-cap" });
    // The day cap full: the address's take is given back, so a full day never eats into it.
    const full = day(0), mine = day(5);
    const late = await readShop(reader(scam), sellers, opts({ day: full, visitor: { take: () => mine.take("x"), give: () => mine.give("x") } }));
    expect(late).toMatchObject({ asked: 0, miss: "day-cap", says: SHOP_READER_SAYS["day-cap"] });
    expect(mine.left("x")).toBe(5);
    // No reader: neither cap is touched.
    const untouched = day(2);
    await readShop(null, sellers, opts({ day: everyone, visitor: { take: () => untouched.take("y"), give: () => untouched.give("y") } }));
    expect(untouched.left("y")).toBe(2);
  });

  it("a reader that hangs, throws or answers off its form leaves code's read, and says so; one that answered still holds", async () => {
    const m = await market();
    const results = marketResults(m);
    const sellers = shopSellers(results, m.listings);
    const hang = reader(() => new Promise(() => {}));
    const t0 = Date.now();
    const late = await readShop(hang, sellers, opts({ timeoutMs: 30 }));
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(late).toMatchObject({ miss: "timeout", says: SHOP_READER_SAYS.timeout });
    expect(readerHeld(results, late.holds)).toEqual(results);
    expect(await readShop(reader(() => { throw new Error("boom"); }), sellers, opts())).toMatchObject({ miss: "error", says: SHOP_READER_SAYS.error });
    expect(await readShop(reader("approve"), sellers, opts())).toMatchObject({ miss: "bad-answer", says: SHOP_READER_SAYS["bad-answer"] });
    const cleared = sellers.filter((s) => s.code === "clear");
    let n = 0;
    const half = reader(() => (n++ === 0 ? { verdict: "hold", sign: "other" } : new Promise(() => {})));
    const part = await readShop(half, cleared.length > 1 ? sellers : [...sellers, { ...cleared[0]!, id: "again" }], opts({ timeoutMs: 30 }));
    expect(part.miss).toBe("timeout");
    expect(part.holds.size).toBe(1);
  });

  it("no reader (no key, or live AI paused) is the code-only default, and asks nothing of the day's cap", async () => {
    const m = await market();
    const results = marketResults(m);
    const today = day(5);
    const off = await readShop(null, shopSellers(results, m.listings), opts({ day: today }));
    expect(off).toMatchObject({ miss: "off", asked: 0, says: SHOP_READER_SAYS.off });
    expect(readerHeld(results, off.holds)).toEqual(results);
    expect(today.left("all")).toBe(5);
    const allHeld: StoreResult[] = results.map((r) => ({ ...r, watcher: r.watcher === "clear" ? "hold" : r.watcher }));
    const port = reader({ verdict: "refuse", sign: "other" });
    expect(await readShop(port, shopSellers(allHeld, m.listings), opts())).toMatchObject({ miss: null, asked: 0, says: SHOP_READER_SAYS.none });
    expect(port.asked).toHaveLength(0);
  });

  it("a hold shown at search is still there at the cart, even from a run where another read missed (kept, never dropped)", async () => {
    const m = await market();
    const results = marketResults(m);
    const sellers = shopSellers(results, m.listings);
    let n = 0;
    const part = await readShop(reader(() => (n++ === 0 ? { verdict: "hold", sign: "other" } : new Promise(() => {}))), sellers, opts({ timeoutMs: 30 }));
    expect(part.miss).toBe("timeout");
    const kept = keepRead(undefined, part)!;
    expect(kept.full).toBeNull();
    expect([...kept.holds.keys()]).toEqual([...part.holds.keys()]);
    // The next ask reads again (the run missed), and its all-clear never drops the hold the Desk already showed.
    const again = await readShop(reader({ verdict: "clear", sign: "other" }), sellers, opts());
    const after = keepRead(kept, again)!;
    expect(after.full).toBe(again);
    expect([...after.holds.keys()]).toEqual([...part.holds.keys()]);
    expect(keepRead(undefined, await readShop(null, sellers, opts()))).toBeNull();
  });

  // The fresh Q's conditions (Fri Nov 6): the run says the fallback even with no deal, a missed read stands a minute,
  // and a shared key that runs out never says "This address".
  it("Q's conditions: the shared key says the day's words, a missed read stands a minute, and the run's line is outside the deal card", async () => {
    const m = await market();
    const sellers = shopSellers(marketResults(m), m.listings).map((s) => ({ ...s, code: "clear" as const }));
    const none = day(0);
    const shared = await readShop(reader({ verdict: "hold", sign: "other" }), sellers, opts({ visitor: { take: () => none.take("unknown"), give: () => none.give("unknown"), shared: true } }));
    expect(shared).toMatchObject({ asked: 0, miss: "day-cap", says: SHOP_READER_SAYS["day-cap"] });
    expect(shared.says).not.toMatch(/address/i);

    const t0 = Date.UTC(2026, 10, 6, 12);
    const missed = await readShop(reader(() => new Promise(() => {})), sellers, opts({ timeoutMs: 20 }));
    const kept = keepRead(undefined, missed, t0)!;
    expect(kept.missed).toEqual({ read: missed, at: t0 });
    expect(keptAnswer(kept, t0 + MISSED_READ_MS - 1)).toBe(missed);
    expect(keptAnswer(kept, t0 + MISSED_READ_MS)).toBeNull();
    expect(keptAnswer(kept, t0 - 1)).toBeNull(); // a clock that steps back asks again, never keeps a miss for ever
    expect(keepRead(undefined, await readShop(null, sellers, opts()), t0)).toBeNull(); // no reader costs nothing: never kept
    // One address's own cap is never kept for the market: the next shopper is read, and never told "This address".
    const spent = day(0);
    const mine = await readShop(reader({ verdict: "clear", sign: "other" }), sellers, opts({ visitor: { take: () => spent.take("a"), give: () => spent.give("a") } }));
    expect(mine.miss).toBe("visitor-cap");
    expect(keepRead(undefined, mine, t0)).toBeNull();

    // The Desk: the reader's line is drawn on the run once it's done, deal or no deal, never only inside the folded list.
    const desk = readFileSync(new URL("../../web/src/desk/Desk.tsx", import.meta.url), "utf8");
    expect(desk).toMatch(/<div role="status">\{done && market\.readerSays && <p className="dk-reader">\{market\.readerSays\}<\/p>\}<\/div>/);
    const fold = desk.slice(desk.indexOf('<details className="dk-before">'), desk.indexOf("</details>", desk.indexOf('<details className="dk-before">')));
    expect(fold).not.toContain("readerSays");
    const noDeal = desk.indexOf('<article className="dk-deal2 dk-nodeal">');
    expect(noDeal).toBeGreaterThan(0);
    expect(desk.indexOf('className="dk-reader"')).toBeGreaterThan(desk.indexOf("</article>", noDeal));
  });
});

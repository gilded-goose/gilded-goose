// The fresh Q's red-team proof for the Desk reader (Fri Nov 6, on 34aae014 + d5198e42: pass with conditions, no MUSTs),
// taken into the suite. 4b was its finding (a missed read asked again on every ask of a cached market); it now pins the fix.
import { describe, expect, it } from "vitest";
import {
  DailyCap, MISSED_READ_MS, READER_SAID, SHOP_READER_SAYS, holdOnly, keepRead, keptAnswer, readShop, readerHeld, shopSellers, recordedMarket, marketResults,
  type KeptRead, type ReaderInput, type ReaderPort, type StoreResult,
} from "../src/index.ts";

const port = (f: (i: ReaderInput) => unknown): ReaderPort & { n: number } => { const p = { name: "x", n: 0, async read(i: ReaderInput) { p.n++; return f(i); } }; return p; };

describe("Q red team", () => {
  it("1. hostile shapes never hold-to-clear, never carry extras", () => {
    const getter = {}; let k = 0;
    Object.defineProperty(getter, "verdict", { enumerable: true, get: () => (k++ === 0 ? "hold" : "clear") });
    Object.defineProperty(getter, "sign", { enumerable: true, get: () => "other" });
    const proto = Object.create({ verdict: "hold", sign: "other" });
    const extraProto = Object.assign(Object.create({ approve: true, price: 1 }), { verdict: "hold", sign: "other" });
    const proxy = new Proxy({}, { ownKeys: () => ["verdict", "sign"], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }), get: (_t, p) => (p === "verdict" ? "clear" : "other") });
    const huge = { verdict: "hold".padEnd(1e6, " "), sign: "other" };
    const sym = { verdict: "hold", sign: "other", [Symbol("approve")]: true };
    const cases: [unknown, unknown][] = [
      [getter, { verdict: "hold", sign: "other" }], [proto, null], [extraProto, { verdict: "hold", sign: "other" }],
      [proxy, null], [huge, null], ["{\"verdict\":\"clear\",\"sign\":\"other\"}", null], [{ verdict: "HOLD", sign: "other" }, null],
      [sym, { verdict: "hold", sign: "other" }],
    ];
    for (const [x, want] of cases) { const h = holdOnly(x); expect(h).toEqual(want); if (h) { expect(Object.keys(h)).toEqual(["verdict", "sign"]); expect(Object.isFrozen(h)).toBe(true); expect((h as any).approve).toBeUndefined(); } }
  });

  it("2. held/refused sellers are never asked and never move; readerHeld is clear->hold only", async () => {
    const sellers = (["clear", "hold", "refuse"] as const).map((code, i) => ({ id: `s${i}`, note: "n", merchant: "m", item: "i", code }));
    const p = port(() => ({ verdict: "hold", sign: "other" }));
    const r = await readShop(p, sellers, { perRun: 6, timeoutMs: 100, day: new DailyCap(300, () => 0) });
    expect(p.n).toBe(1); expect([...r.holds.keys()]).toEqual(["s0"]);
    const res = (id: string, watcher: "clear" | "hold" | "refuse"): StoreResult => ({ id, merchant: id, item: "x", price: "1.00", currency: "USD", history: 5, quoted: "", watcher, said: [] } as StoreResult);
    const forged = new Map([["s1", holdOnly({ verdict: "hold", sign: "other" })!], ["s2", holdOnly({ verdict: "hold", sign: "other" })!]]);
    expect(readerHeld([res("s1", "hold"), res("s2", "refuse")], forged).map((x) => x.watcher)).toEqual(["hold", "refuse"]);
  });

  it("4a. every recorded market has fewer cleared sellers than a run's cap, so its read can be whole (never a run-cap miss)", () => {
    for (const w of ["marsh lights", "mossbell", "gullwing", "fernway", "thistlewick", "quillhaven", "brambleton"]) {
      const m = recordedMarket(w)!.market; const cleared = marketResults(m).filter((r) => r.watcher === "clear").length;
      expect(cleared, m.id).toBeLessThanOrEqual(6);
    }
  });

  it("4b. a missed read stands for a minute: asks of one cached market can't spend the day's reads (deskRead's logic)", async () => {
    // One seller's read times out (a slow model call); the cached market costs no Ask cap, so asks are free to repeat.
    const DESK_READS = new Map<string, KeptRead>();
    const day = new DailyCap(300, () => Date.UTC(2026, 10, 6));
    const sellers = ["a", "b", "c"].map((id) => ({ id, note: id, merchant: id, item: "x", code: "clear" as const }));
    const p = port((i) => (i.note.includes("c") ? new Promise(() => {}) : { verdict: "clear", sign: "other" }));
    let now = Date.UTC(2026, 10, 6, 12);
    const ask = async () => {
      const kept = DESK_READS.get("k"), again = keptAnswer(kept, now);
      const read = again ?? await readShop(p, sellers, { perRun: 6, timeoutMs: 5, day });
      if (!again) { const next = keepRead(kept, read, now); if (next) DESK_READS.set("k", next); }
      return read;
    };
    for (let i = 0; i < 100; i++) { expect(await ask()).toMatchObject({ miss: "timeout", says: SHOP_READER_SAYS.timeout }); now += 100; }
    expect(p.n).toBe(3); // one read of three sellers, then the kept miss answers every ask for the rest of its minute
    expect(day.left("all")).toBe(297);
    now += MISSED_READ_MS; // a minute on: asked again, once
    await ask(); await ask();
    expect(p.n).toBe(6);
    expect(day.left("all")).toBe(294);
  });

  it("5. every miss kind carries its words; none is silent in readShop", async () => {
    const sellers = [{ id: "a", note: "a", merchant: "a", item: "x", code: "clear" as const }];
    const o = { perRun: 6, timeoutMs: 20, day: new DailyCap(300, () => 0) };
    const kinds = await Promise.all([
      readShop(port(() => new Promise(() => {})), sellers, o), readShop(port(() => { throw new Error("x"); }), sellers, o),
      readShop({ name: "sync", read() { throw new Error("sync"); } } as ReaderPort, sellers, o),
      readShop(port(() => new Proxy({}, { ownKeys() { throw new Error("trap"); } })), sellers, o),
      readShop(port(() => "approve"), sellers, o), readShop(null, sellers, o),
    ]);
    expect(kinds.map((k) => k.miss)).toEqual(["timeout", "error", "error", "error", "bad-answer", "off"]);
    for (const k of kinds) expect(k.says).toBe(SHOP_READER_SAYS[k.miss!]);
    expect(READER_SAID.hold).toMatch(/AI reader/);
  });
});

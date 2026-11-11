import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SimClock, sameItem, seededRng, type BoundCart, type Cart, type PaymentPort, type Want } from "../src/index.ts";
import { createGuard, nodeDeps } from "../src/node.ts";

const SRC = new URL("../src/", import.meta.url);
const code = (f: string) => readFileSync(new URL(f, SRC), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const importsOf = (f: string) => [...code(f).matchAll(/(?:from|import\()\s*"([^"]+)"/g)].map((m) => m[1]!);
const T0 = 1_800_000_000_000;
const WANT: Want = { item: "kettle", category: "kitchen", maxPrice: 6000, currency: "USD", deadline: T0 + 86_400_000, qty: 1 };
const cart = (item: string, price = 5500): Cart => ({ item, merchant: "Pondside Goods (fictional)", sellerId: "pondside", qty: 1, price, currency: "USD", shape: "one-off" });
const seeded = () => createGuard({ shopperId: "s", perPurchaseCap: 8000, deps: { clock: new SimClock(T0), rng: seededRng(7) } });

describe("007 #1: @gilded-goose/trust is a library of its own", () => {
  it("pure_entry: nothing the `.` entry reaches reads a clock, randomness, process or window, or leaves the package", () => {
    const seen = new Set<string>();
    const walk = (f: string) => { if (seen.has(f)) return; seen.add(f); for (const i of importsOf(f)) if (i.startsWith("./")) walk(i.slice(2)); };
    walk("index.ts");
    expect([...seen].sort()).not.toContain("node.ts");
    expect([...seen]).not.toContain("paypal.ts");
    for (const f of seen) {
      expect([f, code(f).match(/\b(?:Date\.now|Math\.random|process\.|window\.|globalThis\.|document\.|performance\.|crypto\.)|\bnew Date\(\s*\)/g)]).toEqual([f, null]);
      expect([f, importsOf(f).filter((i) => !i.startsWith("./"))]).toEqual([f, []]);
    }
  });

  it("trust_imports_no_seller: no file in the package imports Gilded Goose, a seller or anything outside it but Node and the Toolkit", () => {
    const outside: Record<string, string[]> = {};
    for (const f of readdirSync(SRC)) for (const i of importsOf(f)) if (!i.startsWith("./")) (outside[f] ??= []).push(i);
    expect(outside).toEqual({ "node.ts": ["node:crypto"], "paypal.ts": ["@paypal/agent-toolkit/openai", "@paypal/agent-toolkit/openai"] });
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies)).toEqual(["@paypal/agent-toolkit"]);
    for (const f of readdirSync(SRC)) expect([f, /@goose\/|sellers\//.test(code(f))]).toEqual([f, false]);
  });

  it("items_compare_as_words: \"Kettle\" is the shopper's \"kettle\"; another item, a longer one or an empty name is still refused", () => {
    for (const [a, b] of [["Kettle", "kettle"], ["  kettle ", "kettle"], ["black  kettle", "Black Kettle"], ["KETTLE\t", "kettle"]]) expect([a, b, sameItem(a!, b!)]).toEqual([a, b, true]);
    // Unicode: the same word to the shopper's eye (a Kelvin sign, a no-break space) is the same item; an invisible
    // character is not, so a zero-width space inside a name is refused rather than read past.
    for (const [a, b] of [["\u212Aettle", "kettle"], ["black\u00A0kettle", "black kettle"]]) expect([a, b, sameItem(a!, b!)]).toEqual([a, b, true]);
    for (const [a, b] of [["ket\u200Btle", "kettle"], ["kettle\u200B", "kettle"]]) expect([a, b, sameItem(a!, b!)]).toEqual([a, b, false]);
    for (const [a, b] of [["Kettle", "Teapot"], ["kettle descaler", "kettle"], ["kettle", "kettles"], ["", ""], ["   ", " "], ["kettle", ""]]) expect([a, b, sameItem(a!, b!)]).toEqual([a, b, false]);
    const g = seeded();
    expect(g.decide(WANT, cart("Kettle")).kind).toBe("ask");
    expect(g.decide(WANT, cart("Teapot"))).toMatchObject({ kind: "refused", rule: "item" });
    expect(g.decide({ ...WANT, item: "" }, cart(""))).toMatchObject({ kind: "refused", rule: "item" });
    // The catalog's entry is compared as words too, and still names one item: an id can't lend a teapot the kettle's entry.
    const withEntry = createGuard({ shopperId: "s", perPurchaseCap: 8000, catalog: new Map([["kettle-1", { item: "Kettle", category: "kitchen" }]]), deps: { clock: new SimClock(T0) } });
    expect(withEntry.decide(WANT, { ...cart("kettle"), catalogId: "kettle-1" }).kind).toBe("ask");
    expect(withEntry.decide({ ...WANT, item: "teapot" }, { ...cart("Teapot"), catalogId: "kettle-1" })).toMatchObject({ kind: "refused", rule: "item" });
  });

  it("create_guard_replays: the same seed and clock bind the same cart to the same hash; the Node defaults are crypto and the wall clock", () => {
    const a = seeded().decide(WANT, cart("kettle"));
    const b = seeded().decide(WANT, cart("kettle"));
    if (a.kind === "refused" || b.kind === "refused") throw new Error("refused");
    expect(a.bound.hash).toBe(b.bound.hash);
    expect(a.bound.hash).toMatch(/^[0-9a-f]{32}$/);
    const d = nodeDeps();
    expect(Math.abs(d.clock.now() - Date.now())).toBeLessThan(1000);
    const r = d.rng.next();
    expect(r >= 0 && r < 1).toBe(true);
    expect(d.hash("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("weekly_default_is_the_cap: with no weekly limit given, one paid cart fills the week; the next is refused, never unlimited", async () => {
    const g = createGuard({ shopperId: "s", perPurchaseCap: 8000, deps: { clock: new SimClock(T0) } });
    const made = new Map<string, BoundCart>();
    const port: PaymentPort = {
      async create(b) { made.set("O-1", b); return { orderId: "O-1", approveUrl: "https://www.sandbox.paypal.com/checkoutnow?token=O-1" }; },
      async get(id) { const b = made.get(id)!; return { id, status: "APPROVED", amount: b.cart.price, currency: "USD", customId: b.hash }; },
      async capture() { return { status: "COMPLETED", captureId: "C-1" }; },
    };
    const first = g.decide(WANT, cart("kettle", 5000));
    if (first.kind === "refused") throw new Error(first.reason);
    const { orderId } = await g.place(first.bound, port, "https://shop.example/return");
    expect(await g.settle(first.bound, orderId, port)).toEqual({ ok: true, captureId: "C-1" });
    // $50 paid this week, and $50 more would pass the cap but not the week's $80.
    expect(g.decide(WANT, cart("kettle", 5000))).toMatchObject({ kind: "refused", rule: "week" });
  });
});

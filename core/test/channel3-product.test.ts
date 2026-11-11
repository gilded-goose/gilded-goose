// Your price on a real product (Joshua, Nov 5, 3b; Lead-12's cap). The product read is a GET of one product, never a
// search; the site's daily cap is taken on the server, before the call, so no page can lift it; a watch is read once a
// day; only her store's price counts, so one id at two stores stays apart. And like channel3.ts, the adapter imports
// nothing, and only the server imports it: a real price can't reach a market, the Watcher, the guard or a cart.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LiveCaps } from "@gilded-goose/trust";
import { BROWSER_READS_PER_DAY, CHANNEL3_PRODUCT_URL, IP_READS_PER_DAY, PRODUCT_READS_PER_DAY, ProductReads, priceAt, watchOn, type GetFetch, type Watched } from "../../server/src/adapters/channel3-product.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const DAY = 86_400_000;
const offer = (domain: string, price: number, extra: Record<string, unknown> = {}) => ({ domain, availability: "InStock", condition: "new", price: { price, currency: "USD" }, url: `https://${domain}/p`, ...extra });
// C's real read, Nov 5: one id held very different listings at three stores.
const answer = { id: "WrZromR", title: "Millennium Falcon", offers: [offer("lego.com", 84.99), offer("bestbuy.com", 849.95), offer("walmart.com", 1118.79)] };
const watch = (over: Partial<Watched> = {}): Watched => ({ productId: "WrZromR", domain: "walmart.com", ...over });
/** A browser `b` at address `ip`; by default each browser has its own address. */
const who = (b: string, ip = `ip-${b}`) => ({ token: b, ip });

function seat(limit = PRODUCT_READS_PER_DAY, ok = true, slow = false) {
  let now = Date.UTC(2026, 10, 5, 12);
  const urls: string[] = [];
  const waiting: (() => void)[] = [];
  const fetch: GetFetch = async (url, init) => {
    urls.push(`${init.method} ${url}`);
    if (slow) await new Promise<void>((done) => waiting.push(done));
    return { ok, status: ok ? 200 : 500, json: async () => answer };
  };
  const caps = new LiveCaps({ perToken: BROWSER_READS_PER_DAY, perIp: IP_READS_PER_DAY, global: limit }, () => now);
  const reads = new ProductReads({ key: "k", fetch, now: () => now, caps, warn: () => {} });
  return { reads, urls, tick: (ms: number) => { now += ms; }, now: () => now, answerAll: () => waiting.splice(0).forEach((f) => f()) };
}

describe("a real watch's product read", () => {
  it("reads only her store's price: one id at two stores stays apart", () => {
    expect(priceAt(answer, "walmart.com")).toBe(111_879);
    expect(priceAt(answer, "lego.com")).toBe(8_499);
    expect(priceAt(answer, "target.com")).toBeNull();
  });

  it("skips used, out-of-stock and non-dollar offers at her store, and reads a bad shape as none", () => {
    const body = { offers: [offer("walmart.com", 10, { condition: "used" }), offer("walmart.com", 20, { availability: "OutOfStock" }), { ...offer("walmart.com", 30), price: { price: 30, currency: "EUR" } }, offer("www.walmart.com", 999)] };
    expect(priceAt(body, "walmart.com")).toBe(99_900);
    expect(priceAt({ offers: "nope" }, "walmart.com")).toBeNull();
    expect(priceAt(null, "walmart.com")).toBeNull();
  });

  it("is a GET of the one product, never a search", async () => {
    const s = seat();
    const r = await s.reads.refresh(watch(), who("b1"));
    expect(s.urls).toEqual([`GET ${CHANNEL3_PRODUCT_URL}WrZromR`]);
    expect(r.last).toEqual({ price: 111_879, checkedAt: s.now() });
  });

  it("reads a watch at most once a day", async () => {
    const s = seat();
    const a = await s.reads.refresh(watch(), who("b1"));
    s.tick(DAY - 1);
    expect(await s.reads.refresh(a, who("b1"))).toBe(a);
    expect(s.urls).toHaveLength(1);
    s.tick(1);
    await s.reads.refresh(a, who("b1"));
    expect(s.urls).toHaveLength(2);
  });

  it("parallel visits read a due watch once: a read in flight is joined, and an older copy gets today's read", async () => {
    const s = seat(PRODUCT_READS_PER_DAY, true, true);
    const stale = watch({ last: { price: 120_000, checkedAt: s.now() - DAY } });
    const visits = [s.reads.refresh(stale, who("b1")), s.reads.refresh(stale, who("b1")), s.reads.refresh(stale, who("b2"))];
    await new Promise((r) => setTimeout(r, 0));
    s.answerAll();
    const got = await Promise.all(visits);
    expect(s.urls).toHaveLength(1);
    for (const r of got) expect(r.last).toEqual({ price: 111_879, checkedAt: s.now() });
    // A visit that peeked the watch before the read landed still holds the old copy: it gets today's read, no new call.
    expect((await s.reads.refresh(stale, who("b1"))).last).toEqual({ price: 111_879, checkedAt: s.now() });
    expect(s.urls).toHaveLength(1);
  });

  it(`one browser reads at most ${BROWSER_READS_PER_DAY} a day, inside the site's ${PRODUCT_READS_PER_DAY}`, async () => {
    expect(BROWSER_READS_PER_DAY).toBe(5);
    const s = seat();
    for (let i = 0; i < 8; i++) await s.reads.refresh(watch({ productId: `p${i}` }), who("b1"));
    expect(s.urls).toHaveLength(BROWSER_READS_PER_DAY);
    await s.reads.refresh(watch({ productId: "other" }), who("b2"));
    expect(s.urls).toHaveLength(BROWSER_READS_PER_DAY + 1);
  });

  it(`new cookies can't lift it: one address reads at most ${IP_READS_PER_DAY} a day, however many browsers it mints`, async () => {
    expect(IP_READS_PER_DAY).toBe(10);
    const s = seat();
    for (let i = 0; i < 30; i++) await s.reads.refresh(watch({ productId: `p${i}` }), who(`minted${i}`, "one-address"));
    expect(s.urls).toHaveLength(IP_READS_PER_DAY);
    // The site still has reads for everyone else.
    await s.reads.refresh(watch({ productId: "someone" }), who("b9"));
    expect(s.urls).toHaveLength(IP_READS_PER_DAY + 1);
    const main = read("server/src/main.ts");
    expect(main).toContain('caps: new LiveCaps({ perToken: BROWSER_READS_PER_DAY, perIp: IP_READS_PER_DAY, global: PRODUCT_READS_PER_DAY }, () => Date.now(), capStore("caps-product-reads")),');
    expect(main).toContain('const who = { token: key ?? "", ip: clientIp(c) };');
    expect(main).toContain("const read = await PRODUCTS.refresh(w, who);");
  });

  it("the server holds the whole site to PRODUCT_READS_PER_DAY reads; over it a watch keeps its last read", async () => {
    expect(PRODUCT_READS_PER_DAY).toBe(20);
    const s = seat();
    const old = watch({ last: { price: 120_000, checkedAt: s.now() - DAY } });
    for (let i = 0; i < PRODUCT_READS_PER_DAY; i++) await s.reads.refresh(watch({ productId: `p${i}` }), who(`b${i}`));
    expect(s.urls).toHaveLength(PRODUCT_READS_PER_DAY);
    expect(await s.reads.refresh(old, who("fresh"))).toBe(old);
    expect(s.urls).toHaveLength(PRODUCT_READS_PER_DAY);
    s.tick(DAY);
    await s.reads.refresh(old, who("fresh"));
    expect(s.urls).toHaveLength(PRODUCT_READS_PER_DAY + 1);
  });

  it("a failing answer spends its slot, so it can't loop past the cap", async () => {
    const s = seat(3, false);
    for (let i = 0; i < 10; i++) expect((await s.reads.refresh(watch(), who(`b${i}`))).last).toBeUndefined();
    expect(s.urls).toHaveLength(3);
  });

  it("is off unless CHANNEL3_WATCH is exactly on, and off the save route refuses before it makes a session", () => {
    expect(watchOn({ CHANNEL3_WATCH: "on" })).toBe(true);
    for (const v of [undefined, "", "On", "1", "true", "off"]) expect(watchOn({ CHANNEL3_WATCH: v })).toBe(false);
    const main = read("server/src/main.ts");
    const route = main.slice(main.indexOf('app.post("/api/runs/wants/real",'), main.indexOf('app.post("/api/runs/wants/real/remove",'));
    expect(route.indexOf("if (!watchOn(process.env)) return")).toBeGreaterThan(0);
    expect(route.indexOf("if (!watchOn(process.env)) return")).toBeLessThan(route.indexOf("sessionToken("));
    expect(main).toContain("key: watchOn(process.env) ? process.env.CHANNEL3_API_KEY || undefined : undefined,");
  });

  it("makes no read at all without the key (CHANNEL3_WATCH off)", async () => {
    let n = 0;
    const reads = new ProductReads({ key: undefined, fetch: async () => { n++; return { ok: true, status: 200, json: async () => answer }; }, now: () => 0, caps: new LiveCaps({ perToken: 5, perIp: 10, global: 20 }, () => 0), warn: () => {} });
    await reads.refresh(watch(), who("b1"));
    expect(n).toBe(0);
  });
});

/** Every .ts/.tsx file under a directory, as repo-relative paths. */
function files(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((f) => {
    const p = `${dir}/${f}`;
    if (f === "node_modules" || f === "dist") return [];
    return statSync(join(ROOT, p)).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe("a real price never reaches the money path (the import graph)", () => {
  it("the adapter imports nothing, and only the server imports it", () => {
    expect(read("server/src/adapters/channel3-product.ts").match(/^import .*$/gm) ?? []).toEqual([]);
    const importers = [...files("core/src"), ...files("server/src"), ...files("web/src"), ...files("scripts"), ...files("trust/src")]
      .filter((f) => /from "[^"]*adapters\/channel3-product(\.ts)?";/m.test(read(f)));
    expect(importers.every((f) => f === "server/src/main.ts" || f === "scripts/check-claims.ts")).toBe(true);
  });

  it("the real watch's words import only money, and nothing in the money path imports them", () => {
    // Money only: the one price formatter (C's panel, Nov 6), and money.ts itself reads nothing but the trust library's money.
    expect(read("core/src/ask/real-watch.ts").match(/^import .*$/gm)).toEqual(['import { usd, type Cents } from "../money.ts";']);
    expect(read("core/src/money.ts").match(/^(?:import|export) .* from .*$/gm)).toEqual(['export * from "@gilded-goose/trust/money";', 'import { fromCents, type Cents } from "@gilded-goose/trust/money";', 'import { usdOf } from "./usd-of.ts";']);
    expect(read("core/src/usd-of.ts").match(/^(?:import|export) .* from .*$/gm)).toBeNull();
    // The session keeps watches (scenario.ts, storage only); no seller, market, guard or trust file reads them.
    const users = [...files("core/src"), ...files("trust/src")].filter((f) => /real-watch/.test(read(f)) && f !== "core/src/ask/real-watch.ts");
    // The ping's real trigger (Track F, THE PING (b)) reads a row's words and price to say them, nothing more.
    expect(users).toEqual(["core/src/ask/real-ping.ts", "core/src/scenario.ts"]);
    expect(read("core/src/scenario.ts").match(/\.real\b[^;]*(guard|decide|market|cart)/gi) ?? []).toEqual([]);
  });

  it("the ping's real trigger imports only money and the watch's words, and nothing in core or trust imports it", () => {
    expect(read("core/src/ask/real-ping.ts").match(/^import .*$/gm)).toEqual(['import type { Cents } from "../money.ts";', 'import { usdWide, type RealRow } from "./real-watch.ts";']);
    expect([...files("core/src"), ...files("trust/src")].filter((f) => /from "[^"]*real-ping(\.ts)?"/.test(read(f)))).toEqual([]);
  });
});

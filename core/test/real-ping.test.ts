import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REAL_PING_TITLE, pingWhen, realPingKey, realPingWords, realPings, stalePings, type RealRowRead } from "../src/ask/real-ping.ts";

const VISIT = 1_762_400_000_000;
const row = (o: Partial<RealRowRead> = {}): RealRowRead => ({
  productId: "p1", domain: "store.example", item: "Steel kettle", target: 9000,
  best: { total: 8499, at: "store.example" }, pinged: true, checkedAt: VISIT + 5000, ...o,
});

describe("the ping's real trigger: a read during this visit, at or under her price, once", () => {
  it("pings a read made during the visit, at or under her price, in her own row's words", () => {
    expect(realPings([row()], VISIT, new Set())).toEqual([
      { kind: "real", item: "Steel kettle", price: 8499, target: 9000, where: "store.example", productId: "p1", at: VISIT + 5000, key: realPingKey(row(), VISIT + 5000) },
    ]);
    expect(realPings([row({ best: { total: 9000, at: "store.example" } })], VISIT, new Set())).toHaveLength(1); // right at her price
  });

  it("never pings a read from before the visit: no read today (off, capped, failed) is not news", () => {
    expect(realPings([row({ checkedAt: VISIT - 1 })], VISIT, new Set())).toEqual([]);
    expect(realPings([row({ checkedAt: null, best: null, pinged: false })], VISIT, new Set())).toEqual([]);
  });

  it("never pings over her price, without a price, or with a price from another store", () => {
    expect(realPings([row({ best: { total: 9001, at: "store.example" }, pinged: false })], VISIT, new Set())).toEqual([]);
    expect(realPings([row({ best: { total: 9001, at: "store.example" } })], VISIT, new Set())).toEqual([]); // pinged flag alone isn't enough
    expect(realPings([row({ best: null })], VISIT, new Set())).toEqual([]);
    expect(realPings([row({ best: { total: 100, at: "other.example" } })], VISIT, new Set())).toEqual([]);
    expect(realPings([row({ best: { total: 0, at: "store.example" } })], VISIT, new Set())).toEqual([]);
  });

  it("pings one read once, and a new read under her price again", () => {
    const sent = new Set([realPingKey(row(), VISIT + 5000)]);
    expect(realPings([row()], VISIT, sent)).toEqual([]);
    expect(realPings([row({ checkedAt: VISIT + 86_400_000 })], VISIT, sent)).toHaveLength(1);
  });

  it("keeps two watches apart: each ping names its own store and price", () => {
    const got = realPings([row(), row({ productId: "p2", domain: "b.example", item: "Lamp", target: 3000, best: { total: 2500, at: "b.example" } })], VISIT, new Set());
    expect(got.map((p) => [p.item, p.where, p.price, p.target])).toEqual([["Steel kettle", "store.example", 8499, 9000], ["Lamp", "b.example", 2500, 3000]]);
  });

  it("says the read's own price and hers, \"right at\" when equal, never \"under\"", () => {
    const at = Date.UTC(2026, 10, 5, 19, 42); // 7:42 PM UTC
    expect(realPingWords({ item: "Steel kettle", where: "store.example", price: 8499, target: 9000, at }, "UTC")).toEqual({ title: "Goose · price alert", body: "Steel kettle at store.example was $84.99 when checked on Nov 5 at 7:42 PM, under your $90.00 price. Tap to review." });
    expect(realPingWords({ item: "Steel kettle", where: "store.example", price: 9000, target: 9000, at }, "UTC").body).toBe("Steel kettle at store.example was $90.00 when checked on Nov 5 at 7:42 PM, right at your $90.00 price. Tap to review.");
    expect(realPingWords({ item: "Falcon", where: "a.example", price: 111879, target: 120000, at }, "UTC").body).toContain("was $1,118.79 when checked on Nov 5 at 7:42 PM, under your $1,200.00 price");
    expect(pingWhen(at, "America/Los_Angeles")).toBe("Nov 5 at 11:42 AM"); // her own zone, not the server's
    expect(pingWhen(Date.UTC(2026, 10, 6, 3, 30), "America/Los_Angeles")).toBe("Nov 5 at 7:30 PM"); // her date too: UTC's is Nov 6
  });

  it("says the date and time exactly as the Real prices list does (RealPrices.tsx's `date` and `time`)", () => {
    const list = readFileSync(new URL("../../web/src/desk/RealPrices.tsx", import.meta.url), "utf8");
    const rule = readFileSync(new URL("../src/ask/real-ping.ts", import.meta.url), "utf8");
    for (const opts of ['toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit"', 'toLocaleDateString("en-US", { month: "short", day: "numeric"']) {
      expect([opts, list.includes(opts), rule.includes(opts)]).toEqual([opts, true, true]);
    }
  });

  it("takes back a shown ping that stopped being true: her row gone, a newer read, the price or her price moved (the DD's)", () => {
    const p = realPings([row()], VISIT, new Set())[0]!;
    expect(stalePings([row()], [p])).toEqual([]); // still exactly what the row says
    expect(stalePings([], [p])).toEqual([p.key]); // she stopped watching
    expect(stalePings([row({ checkedAt: VISIT + 9000 })], [p])).toEqual([p.key]); // a newer read
    expect(stalePings([row({ best: { total: 8999, at: "store.example" } })], [p])).toEqual([p.key]); // the price moved
    expect(stalePings([row({ target: 8000 })], [p])).toEqual([p.key]); // she moved her price
    expect(stalePings([row({ pinged: false })], [p])).toEqual([p.key]);
    expect(stalePings([row({ best: null })], [p])).toEqual([p.key]);
    expect(stalePings([row({ domain: "other.example" }), row()], [p])).toEqual([]); // another store's row is another row
  });

  it("holds every line true read alone on a lock screen: no \"now\", no \"simulated\", the read's time, a tap that only reviews", () => {
    const at = Date.UTC(2026, 10, 5, 8, 5);
    for (const price of [1, 8499, 9000]) {
      const { title, body } = realPingWords({ item: "Steel kettle", where: "store.example", price, target: 9000, at }, "UTC");
      for (const line of [title, body]) expect(line).not.toMatch(/\bnow\b|\btoday\b|\bsimulated\b|\b(buy|bought|approve|reserve)/i);
      expect(title).toBe(REAL_PING_TITLE);
      expect(body).toMatch(/^Steel kettle at store\.example was \$[\d,.]+ when checked on Nov 5 at 8:05 AM, (under|right at) your \$90\.00 price\. Tap to review\.$/);
    }
  });

  it("can't reach a deal or a seller's verdict (F1's kind): a ping names her store's read, and a tap only opens her row", () => {
    // R's red team, F1: the simulated ping pinged a held seller and its tap opened that deal. A real row has no seller and
    // no verdict to hold or clear, so the real ping carries none, and its tap must never grow a path to a cart.
    const src = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""); // code only: the comments say what it never does
    const p = realPings([row()], VISIT, new Set())[0]!;
    expect(Object.keys(p).sort()).toEqual(["at", "item", "key", "kind", "price", "productId", "target", "where"]);
    const watcher = src("web/src/desk/real-watcher.ts"), rule = src("core/src/ask/real-ping.ts");
    for (const [name, text] of [["real-watcher.ts", watcher], ["real-ping.ts", rule]] as const) {
      expect(text, `${name} reaches a deal, a cart, the guard or a verdict`).not.toMatch(/onDeal|askAtPrice|\bverdict\b|\bheld\b|cart|guard|approve/i);
    }
    expect(watcher).toMatch(/onOpen\(\{ productId: p\.productId \?\? "", domain: p\.where \}\)/);
    expect(watcher).toMatch(/for \(const key of stalePings\(rows, \[\.\.\.shown\.values\(\)\]\)\) \{ unnotify\(key\); shown\.delete\(key\); \}/);
  });
});

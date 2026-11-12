// Your price on a real product (Joshua, Nov 5, 3b and 4a): what a watch keeps (product id, store, name, her price and the
// last read, never her search words), how long (the session's week), five per browser, and what its row says: her store's
// price only, with its day, and no word that calls Channel3's match "this exact item".

import { describe, expect, it } from "vitest";
import { DemoShoppers, type SavedSession } from "../src/scenario.ts";
import { BUY_THERE, CHECKS_DAILY, WATCH_KEEPS } from "../src/view/watching-words.ts";
import { DAY_MS, REAL_WATCHES_MAX, checkRealWatch, checkedWords, realRow, type RealWatch } from "../src/ask/real-watch.ts";

const T0 = Date.UTC(2026, 10, 5, 12);
const falcon = { productId: "WrZromR", domain: "walmart.com", name: "Millennium Falcon", target: 100_000 };

function storeOf() {
  const saved = new Map<string, SavedSession>();
  return { saved, store: { load: (t: string) => saved.get(t), save: (t: string, s: SavedSession) => void saved.set(t, structuredClone(s)) } };
}

describe("a real watch: what it keeps", () => {
  it("keeps the id, store, cleaned name and her price, and nothing else she sends", () => {
    const c = checkRealWatch({ ...falcon, domain: "WWW.Walmart.com", name: "  Millennium​  Falcon ", words: "my son's birthday", email: "a@b.c" }, T0);
    expect(c).toEqual({ ok: true, watch: { ...falcon, at: T0 } });
  });

  it("refuses a bad id, store or price in plain words", () => {
    expect(checkRealWatch({ ...falcon, productId: "../search" }, T0)).toEqual({ ok: false, error: "That product can't be watched." });
    expect(checkRealWatch({ ...falcon, domain: "not a store" }, T0)).toEqual({ ok: false, error: "That store can't be watched." });
    for (const target of [0, -5, 12.5, "90", 10_000_001]) expect(checkRealWatch({ ...falcon, target }, T0)).toEqual({ ok: false, error: "Type a price in dollars, like 90." });
  });

  it("is kept with the session, across a restart, and dropped with it after a week without a visit", () => {
    const { store } = storeOf();
    const a = new DemoShoppers({ store });
    expect(a.watchReal("tok", falcon, T0).ok).toBe(true);
    a.flush();
    const b = new DemoShoppers({ store });
    expect(b.session("tok", T0 + DAY_MS).real).toEqual([{ ...falcon, at: T0 }]);
    const c = new DemoShoppers({ store });
    expect(c.session("tok", T0 + 8 * DAY_MS).real).toEqual([]);
  });

  it(`at most ${REAL_WATCHES_MAX} per browser; the same product at the same store changes her price and keeps its read`, () => {
    const s = new DemoShoppers();
    for (let i = 0; i < REAL_WATCHES_MAX; i++) expect(s.watchReal("tok", { ...falcon, productId: `p${i}` }, T0).ok).toBe(true);
    expect(s.watchReal("tok", { ...falcon, productId: "more" }, T0)).toEqual({ ok: false, error: "You're watching 5 real prices, the most for one browser. Stop one to watch another." });
    s.keepRead("tok", { productId: "p0", domain: "walmart.com", last: { price: 120_000, checkedAt: T0 } }, T0);
    // A sent `last` is never taken: only the server's read is kept.
    const again = s.watchReal("tok", { ...falcon, productId: "p0", target: 90_000, last: { price: 1, checkedAt: T0 + 5 } }, T0 + 10);
    expect(again).toEqual({ ok: true, watch: { ...falcon, productId: "p0", target: 90_000, at: T0, last: { price: 120_000, checkedAt: T0 } } });
    expect(s.session("tok", T0).real).toHaveLength(REAL_WATCHES_MAX);
  });

  it("a new watch never takes a read the page sends: no faked ping, no skipped read", () => {
    const s = new DemoShoppers();
    const r = s.watchReal("tok", { ...falcon, last: { price: 1, checkedAt: T0 + DAY_MS } }, T0);
    expect(r).toEqual({ ok: true, watch: { ...falcon, at: T0 } });
    expect(s.session("tok", T0).real[0]!.last).toBeUndefined();
  });

  it("one id at two stores is two watches; stop removes only the one", () => {
    const s = new DemoShoppers();
    s.watchReal("tok", falcon, T0);
    s.watchReal("tok", { ...falcon, domain: "lego.com" }, T0);
    expect(s.session("tok", T0).real.map((w) => w.domain)).toEqual(["walmart.com", "lego.com"]);
    expect(s.stopReal("tok", "WrZromR", "lego.com", T0)).toBe(true);
    expect(s.session("tok", T0).real.map((w) => w.domain)).toEqual(["walmart.com"]);
    expect(s.stopReal("none", "WrZromR", "lego.com", T0)).toBe(false);
    expect(s.size).toBe(1);
  });

  it("keeps a server read only when newer, and only on a watch still there", () => {
    const s = new DemoShoppers();
    s.watchReal("tok", falcon, T0);
    s.keepRead("tok", { ...falcon, last: { price: 110_000, checkedAt: T0 + 2 } }, T0);
    s.keepRead("tok", { ...falcon, last: { price: 1, checkedAt: T0 + 1 } }, T0);
    s.keepRead("tok", { ...falcon, domain: "lego.com", last: { price: 1, checkedAt: T0 + 3 } }, T0);
    expect(s.session("tok", T0).real).toEqual([{ ...falcon, at: T0, last: { price: 110_000, checkedAt: T0 + 2 } }]);
  });
});

describe("a real watch's row", () => {
  const w = (last?: RealWatch["last"]): RealWatch => ({ ...falcon, at: T0, ...(last ? { last } : {}) });

  it("says her store, her price and the day it was read", () => {
    expect(realRow(w(), T0)).toMatchObject({ pinged: false, best: null, status: "Watching for $1,000.00 or less at walmart.com. Not checked yet.", when: "Real price at walmart.com, not checked yet" });
    expect(realRow(w({ price: 111_879, checkedAt: T0 }), T0)).toMatchObject({ pinged: false, best: { total: 111_879, at: "walmart.com" }, status: "$118.79 over your $1,000.00. Still watching.", when: "Real price at walmart.com, checked today" });
    expect(realRow(w({ price: 95_000, checkedAt: T0 - DAY_MS }), T0)).toMatchObject({ pinged: true, status: "Pinged: $950.00 at walmart.com is $50.00 under your $1,000.00.", when: "Real price at walmart.com, checked yesterday" });
    expect(realRow(w({ price: null, checkedAt: T0 - 3 * DAY_MS }), T0)).toMatchObject({ pinged: false, best: null, status: "No new, in-stock price at walmart.com. Still watching for $1,000.00 or less.", when: "Real price at walmart.com, checked Nov 2" });
  });

  it("over the site's cap a watch says when it was last checked, never that it's current", () => {
    expect(checkedWords(T0 - DAY_MS, T0)).toBe("checked yesterday");
    expect(checkedWords(Date.UTC(2026, 9, 31), T0)).toBe("checked Oct 31");
  });

  it("never calls Channel3's match the exact item, and says it checks daily and can't catch every drop", () => {
    const words = [CHECKS_DAILY, BUY_THERE, ...[undefined, { price: 1, checkedAt: T0 }, { price: null, checkedAt: T0 }].map((l) => realRow(w(l ?? undefined), T0)).flatMap((r) => [r.status, r.when])];
    for (const s of [...words, WATCH_KEEPS]) expect(s).not.toMatch(/exact|same item|this item/i);
    expect(CHECKS_DAILY).toBe("Goose checks this price once a day, so it can miss a drop that sells out in minutes.");
  });
});

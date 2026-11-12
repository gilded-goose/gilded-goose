// The set-aside pile (Joshua, Thu Nov 5 1:30 PM, §1a): every Find, Snap and Watching result says "Checked N listings.
// Set aside M:", each with its reason, then the pick. Real counts only: these hold N and M to the listings each result
// actually compared, and say what a result with no listings says (never "Nothing set aside").

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pileHead } from "../src/ask/ladder-words.ts";
import { deskPile } from "../src/view/desk.ts";
import type { StoreResult } from "../src/storesync.ts";
import { JACKET_DAY, LADDER_BEAT, jacketOffers, ladder, ladderFor, marketOffers } from "../src/ask/ladder.ts";
import { JACKETS } from "../src/sellers/clothing.ts";
import { colorFor, offersFor, pileFor, watchedCards } from "../src/ask/watching.ts";
import { verdictOf } from "../src/trust/watch.ts";
import { DEMO_T0, demoCatalogItems, demoPolicy } from "../src/scenario.ts";
import { MOVING_ITEMS } from "../src/sellers/moving.ts";
import type { Catalog } from "../src/trust/catalog.ts";
import { setCategoryLimit } from "../src/trust/policy.ts";
import type { SavedWant } from "../src/ask/wants.ts";

const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const want = (catalogId: string, max: number, color?: string): SavedWant => ({ catalogId, priority: "really", max, at: DEMO_T0, ...(color ? { color } : {}) });

describe("the set-aside pile's words", () => {
  it("says what was checked and how many were set aside, in Joshua's words", () => {
    expect(pileHead(6, 1)).toBe("Checked 6 listings. Set aside 1:");
    expect(pileHead(6, 2)).toBe("Checked 6 listings. Set aside 2:");
    expect(pileHead(1, 0)).toBe("Checked 1 listing. Nothing set aside.");
    expect(pileHead(4, 0)).toBe("Checked 4 listings. Nothing set aside.");
  });
  it("no listings is said as such, never as nothing set aside (Lead-12's question)", () => {
    expect(pileHead(0, 0)).toBe("No listings to check.");
    expect(pileHead(0, 0)).not.toMatch(/set aside/i);
  });
  it("never says safe or cheapest alone (Joshua §1b; the first promise: the Watcher can miss a scam)", () => {
    for (const [n, m] of [[0, 0], [1, 0], [5, 0], [5, 1], [5, 3]] as const) expect(pileHead(n, m)).not.toMatch(/\b(safe|cheapest|trusted|verified)\b/i);
  });
});

describe("Find and Snap: the ladder's pile counts the listings it compared", () => {
  it("the kettle's week: N is every seller's listing, M the Watcher's refusals among them", () => {
    const offers = marketOffers(LADDER_BEAT);
    const refused = offers.filter((o) => o.verdict === "refuse").length;
    expect(offers.length).toBeGreaterThan(1);
    expect(refused).toBeGreaterThan(0); // control: the week has its planted scam, so M isn't trivially 0
    const a = ladder(5500, 6000, offers, "kettle");
    expect(a.pile).toBe(`Checked ${offers.length} listings. Set aside ${refused}:`);
    // Each one set aside is then named with its reason, in the same answer.
    expect(a.refused.length - 1).toBe(refused);
  });
  it("a market with no scam says nothing set aside; a jacket's count is only the listings in what was asked", () => {
    const clean = marketOffers(LADDER_BEAT).filter((o) => o.verdict !== "refuse");
    expect(ladder(5500, 6000, clean, "kettle").pile).toBe(`Checked ${clean.length} listings. Nothing set aside.`);
    for (const j of JACKETS) for (const asked of [{}, { color: "black" }, { color: "black", size: "medium" }]) {
      const offers = jacketOffers(j, JACKET_DAY, asked);
      expect(ladderFor(j.id, 7500, 8000, null, asked)!.answer.pile, `${j.id} ${JSON.stringify(asked)}`).toBe(pileHead(offers.length, offers.filter((o) => o.verdict === "refuse").length));
    }
  });
  it("an ask no listing comes in says no listings, not nothing set aside", () => {
    expect(ladder(5500, 6000, [], "jacket").pile).toBe("No listings to check.");
  });
});

describe("Watching: every card the watch reads carries its pile", () => {
  const CAT = demoCatalogItems();
  const ticket = MOVING_ITEMS.find((i) => i.id === "marsh-lights-ticket")!;
  const WIDE: Catalog = new Map([...CAT, [ticket.id, { item: ticket.item, category: ticket.category }]]);
  it("counts each seller once, as the warning names them, and matches the warning's names", () => {
    for (const [w, cat, policy, d] of [[want("kettle", 6000), CAT, demoPolicy(), 0], [want(ticket.id, 9000), WIDE, setCategoryLimit(demoPolicy(), "events", 9000, 0), 4]] as const) {
      const [card] = watchedCards([w], cat, policy, d);
      const offers = offersFor(w, d);
      const sellers = new Set(offers.map((o) => o.sellerId));
      const refused = new Set(offers.filter((o) => o.flags !== null && verdictOf(o.flags) === "refuse").map((o) => o.sellerId));
      expect(card!.pile, w.catalogId).toBe(pileHead(sellers.size, refused.size, colorFor(w)));
      expect(refused.size).toBeGreaterThan(0); // control: both have a seller set aside
      // Every seller the pile counts as set aside is named in the warning under it.
      expect((card!.warning!.match(/Watcher set /g) ?? []).length).toBe(refused.size);
    }
  });
  it("a seller listed twice is counted once, set aside or not (the mutant 'the pile counts a seller twice')", () => {
    const offers = offersFor(want("kettle", 6000), 0);
    const scam = offers.find((o) => o.flags !== null && verdictOf(o.flags) === "refuse")!;
    const clean = offers.find((o) => o !== scam)!;
    expect(pileFor([...offers, scam, clean])).toBe(pileFor(offers));
  });
  it("a color want's count names its color, since it counts only that color (Lead-12: scope each count in words)", () => {
    const black = want("kettle", 6000, "black");
    expect(colorFor(black)).toBe("black");
    const offers = offersFor(black, 0);
    const [card] = watchedCards([black], demoCatalogItems(), demoPolicy(), 0);
    expect(card!.pile).toMatch(new RegExp(`^Checked ${offers.length} black listings?\\. `));
    expect(offers.length).toBeLessThan(offersFor(want("kettle", 6000), 0).length); // control: the color does narrow it
    expect(card!.pile).toBe(pileHead(offers.length, offers.filter((o) => o.flags !== null && verdictOf(o.flags) === "refuse").length, "black"));
    expect(pileHead(1, 0, "black")).toBe("Checked 1 black listing. Nothing set aside.");
    expect(pileHead(0, 0, "black")).toBe("No listings to check.");
  });
  it("a want with no offers says no listings", () => {
    expect(pileFor([])).toBe("No listings to check.");
  });
});

describe("the pages draw it: the pile, then the pick", () => {
  it("the Ask's ladder draws its pile first, then the refused sellers, then the answer", () => {
    const ask = src("web/src/AskGoose.tsx");
    const body = ask.slice(ask.indexOf("function Ladder("), ask.indexOf("/** The item an Ask named"));
    const at = (s: string) => { const i = body.indexOf(s); expect(i, s).toBeGreaterThan(-1); return i; };
    // The count line leads the refused rows' own list, then the answer (the pick) follows.
    expect(at("[answer.pile, ...refused].map(")).toBeLessThan(at("{answer.line}"));
  });
  it("the Desk's finished run counts every listing and every one set aside; no market says no listings", () => {
    const desk = src("web/src/desk/Desk.tsx");
    expect(desk).toContain('{done ? deskPile(results) : "Goose is shopping"}');
    expect(desk).toContain('results[0] ? "Goose set aside every seller here, so nothing can be bought." : deskPile(results)');
  });
  it("the Desk says pileHead's words, a full stop for its colon (its rows below give each reason), for every count", () => {
    const row = (i: number, refuse: boolean) => ({ id: `r${i}`, merchant: `S${i} (fictional)`, item: "x", price: "10.00", watcher: refuse ? "refuse" : "clear", said: refuse ? ["it asks to be paid by gift card"] : [] }) as unknown as StoreResult;
    for (let n = 0; n <= 9; n++) for (let m = 0; m <= n; m++) {
      const results = Array.from({ length: n }, (_, i) => row(i, i < m));
      expect(deskPile(results), `${n} ${m}`).toBe(pileHead(n, m).replace(/:$/, "."));
    }
  });
  it("each Watching card draws its pile above the warning", () => {
    const wants = src("web/src/Wants.tsx");
    expect(wants.indexOf("{w.pile && ")).toBeGreaterThan(-1);
    expect(wants.indexOf("{w.pile && ")).toBeLessThan(wants.indexOf("{w.warning && "));
  });
});

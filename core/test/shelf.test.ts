// The Watch shelf (the Desk's slice 6): Joshua's five cards in his order, the ticket the hero, each with one short
// status line from Goose's real record (the price watch on the recorded week), the hero's intro the ticket market's
// planted scam reseller, and her own wants on top of the defaults. Never a seller's own words; pure.

import { describe, expect, it } from "vitest";
import { DEMO_EVENTS, demoCatalog, demoCatalogItems, demoPolicy } from "../src/scenario.ts";
import { BEAT_DAY, offersFor, watchedCards } from "../src/ask/watching.ts";
import { MOVING_ITEMS } from "../src/sellers/moving.ts";
import { JACKETS } from "../src/sellers/clothing.ts";
import type { SavedWant } from "../src/ask/wants.ts";
import type { Policy } from "../src/trust/policy.ts";
import { HERO_ID, PLANTED_SAID, SHELF, SHELF_SAID, plantedIn, shelfFor, shelfIntro } from "../src/view/shelf.ts";

const CATALOG = demoCatalogItems();
const withLimits = (limits: Record<string, number>): Policy => { const p = demoPolicy(); return { ...p, categoryLimit: { ...p.categoryLimit, ...limits } }; };
const want = (catalogId: string, max: number, extra: Partial<SavedWant> = {}): SavedWant => ({ catalogId, priority: "really", max, at: 1, ...extra });
/** Every note a seller wrote on the shelf's markets: none may reach a card. */
const NOTES = [...MOVING_ITEMS, ...JACKETS].flatMap((m) => m.sellers.map((s) => s.note)).filter((n) => n.length > 0);

describe("the Watch shelf", () => {
  it("shows Joshua's five in his order, the ticket the hero, each status the price watch's own state", () => {
    const shelf = shelfFor([], CATALOG, demoPolicy());
    expect(shelf.cards.map((c) => [c.title, c.art, c.hero])).toEqual([
      ["Marsh Lights ticket", "ticket", true], ["Gullwing Air seat", "flight", false], ["Night at Mossbell Inn", "hotel", false],
      ["Black Harbor jacket", "jacket", false], ["Kettle", "kettle", false],
    ]);
    expect(shelf.said).toBe(SHELF_SAID);
    // The same state the wants list's price watch reads for the same wants: one record, two screens.
    const defaults = SHELF.map((s) => want(s.catalogId, demoCatalog().find((e) => e.id === s.catalogId)!.want.maxPrice, { priority: "nice", ...(s.color ? { color: s.color } : {}) }));
    const watched = new Map(watchedCards(defaults, CATALOG, demoPolicy()).map((c) => [c.catalogId, c.watch]));
    for (const c of shelf.cards) {
      expect(c.kind).toBe(watched.get(c.catalogId));
      expect(c.mine).toBe(false);
      expect(c.status.length).toBeLessThanOrEqual(110);
      for (const n of NOTES) expect(c.status).not.toContain(n);
    }
    // The hero (Joshua, Fri Oct 30): the demo sets the events limit at $90.00, so on the beat day the ticket's recorded
    // $84.00 drop at Lantern Hall is a deal under the demo's own defaults, the "Approve $84" a run binds (posted.test.ts).
    expect(shelf.cards[0]).toMatchObject({ kind: "under", protect: false, status: "$84.00 at Lantern Hall Box Office (fictional), $6.00 under the suggested $90.00 max." });
    // The Desk sets the price large: the same price, and the rest of the same line, never a second wording.
    expect(shelf.cards[0]).toMatchObject({ price: 8400, after: "at Lantern Hall Box Office (fictional), $6.00 under the suggested $90.00 max.", aside: null });
    const kettle = shelf.cards.find((c) => c.catalogId === "kettle")!;
    expect([kettle.price, kettle.after === kettle.status, kettle.aside]).toEqual([null, true, "it asked for a gift card"]);
    // Desk-L: travel ($100.00) and clothing ($70.00) have demo limits of their own, so the $96.00 flight is a deal (Desk-A's
    // mock), the new inn waits for her yes, and the jacket is a deal; the kettle's market (kitchen, $60.00) shows Goose
    // setting its planted scam aside.
    expect(shelf.cards.slice(1).map((c) => [c.kind, c.protect, c.status])).toEqual([
      ["under", false, "$96.00 at Gullwing Air (fictional), $4.00 under the suggested $100.00 max."],
      ["held", false, "$86.00 at Duckpond Stays (fictional), under the suggested $95.00 max. It waits for your yes."],
      ["under", false, "$69.00 at Driftline Outfitters (fictional), $1.00 under your $70.00 clothing limit."],
      ["refused", true, "Goose set aside QuickQuack Deals (fictional) at $20.30. Still watching for $60.00 or less."],
    ]);
    expect(shelf.cards[0]!.when).toBe(`Simulated day ${BEAT_DAY + 1}, totals with fees and taxes`);
  });

  it("the demo's events limit is the ticket's own category, locked at $90.00 like the kitchen's $60.00", () => {
    expect(MOVING_ITEMS.find((i) => i.id === HERO_ID)!.category).toBe(DEMO_EVENTS);
    expect(CATALOG.get(HERO_ID)!.category).toBe(DEMO_EVENTS);
    expect(demoPolicy().categoryLimit).toEqual({ kitchen: 6000, [DEMO_EVENTS]: 9000, travel: 10_000, clothing: 7000, other: 15_000 });
    // The planted scam is still set aside under it: TixQuack's $55.00 is under $90.00, and the Watcher refuses it.
    expect(plantedIn(HERO_ID).map((o) => o.sellerId)).toEqual(["tixquack"]);
  });

  it("opens the hero with the ticket market's planted scam reseller, in the Watcher's words", () => {
    const intro = shelfIntro()!;
    expect(intro).toEqual({
      catalogId: HERO_ID, seller: "TixQuack (fictional)", total: 5500, planted: PLANTED_SAID,
      line: "TixQuack (fictional) offered the ticket for $55.00, but it asks to be paid by gift card. Goose set it aside.",
    });
    for (const n of NOTES) expect(intro.line).not.toContain(n);
    // The planted line's claim, from the record: every market on the shelf has exactly one seller the Watcher refuses.
    for (const s of SHELF) expect(plantedIn(s.catalogId).length).toBe(1);
    expect(shelfFor([], CATALOG, demoPolicy()).intro).toEqual(intro);
  });

  it("reads her own wants and limits: a deal, a hold, a close one, and whose max it is", () => {
    const policy = withLimits({ events: 9500, travel: 10_000, clothing: 9000 });
    const shelf = shelfFor([want("marsh-lights-ticket", 9000), want("mossbell-night", 9000), want("gullwing-seat", 9000), want("tidewater-jacket", 6000, { color: "yellow", priority: "nice" }), want("harbor-jacket", 8000, { color: "navy" })], CATALOG, policy);
    const by = new Map(shelf.cards.map((c) => [c.catalogId, c]));
    expect(by.get("marsh-lights-ticket")).toMatchObject({ mine: true, kind: "under", protect: false, status: "$84.00 at Lantern Hall Box Office (fictional), $6.00 under your $90.00 max." });
    expect(by.get("mossbell-night")).toMatchObject({ kind: "held", status: "$86.00 at Duckpond Stays (fictional), under your $90.00 max. It waits for your yes." });
    expect(by.get("gullwing-seat")).toMatchObject({ kind: "close", status: "$96.00 at Gullwing Air (fictional), $6.00 over your $90.00 max. Still watching." });
    // Her navy want replaces the shelf's black default; her other wants follow the five, as "asked" cards.
    expect(by.get("harbor-jacket")!.title).toBe("Navy Harbor jacket");
    expect(shelf.cards.map((c) => c.catalogId)).toEqual(["marsh-lights-ticket", "gullwing-seat", "mossbell-night", "harbor-jacket", "kettle", "tidewater-jacket"]);
    expect(shelf.cards.at(-1)).toMatchObject({ art: "asked", mine: true, title: "Yellow Tidewater jacket" });
    // A max she didn't set says so: the catalog's suggestion, or her limit when that binds.
    expect(shelfFor([], CATALOG, withLimits({ events: 9500 })).cards[0]!.status)
      .toBe("$84.00 at Lantern Hall Box Office (fictional), $6.00 under the suggested $90.00 max.");
    expect(shelfFor([want("marsh-lights-ticket", 9000)], CATALOG, withLimits({ events: 8000 })).cards[0]!.status)
      .toBe("$84.00 at Lantern Hall Box Office (fictional), $4.00 over your $80.00 events limit. Still watching.");
    // No limit of its own (a Policy without the demo's events limit): held to her strictest, and the line says so.
    expect(shelfFor([want("marsh-lights-ticket", 9500)], CATALOG, { ...demoPolicy(), categoryLimit: { kitchen: 9000 } }).cards[0]!.status)
      .toBe("$84.00 at Lantern Hall Box Office (fictional), $6.00 under your strictest limit ($90.00).");
    expect(shelfFor([], CATALOG, withLimits({ travel: 9000 })).cards[1]!.status)
      .toBe("$96.00 at Gullwing Air (fictional), $6.00 over your $90.00 travel limit. Still watching.");
  });

  it("is pure: it never changes her wants, her Policy or the record", () => {
    const wants = Object.freeze([Object.freeze(want("marsh-lights-ticket", 9000))]);
    const policy = withLimits({ events: 9500 });
    const was = JSON.stringify({ wants, policy, offers: offersFor(want("marsh-lights-ticket", 9000), BEAT_DAY) });
    const a = shelfFor(wants, CATALOG, policy);
    expect(shelfFor(wants, CATALOG, policy)).toEqual(a);
    expect(JSON.stringify({ wants, policy, offers: offersFor(want("marsh-lights-ticket", 9000), BEAT_DAY) })).toBe(was);
  });
});

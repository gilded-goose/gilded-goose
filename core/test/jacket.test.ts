// The second category and ladder layer 5 (restart notes §1 piece 3, §19): two fictional jackets with colors and sizes,
// read by the same price watch and Watcher as every moving item, and "a similar black jacket is $W, not the same item"
// from a look-alike only when a cleared seller lists it in every option asked, for less than the shopper's price and the
// same item's best, and never over her limit.

import { describe, expect, it } from "vitest";
import { DAY_MS } from "../src/deps.ts";
import { DEMO_T0, DemoShoppers, demoCatalog, demoCatalogItems, demoPolicy } from "../src/scenario.ts";
import { setCategoryLimit } from "../src/trust/policy.ts";
import { JACKETS, JACKET_OPTIONS } from "../src/sellers/clothing.ts";
import { MOVING_DAYS } from "../src/sellers/moving.ts";
import { askForSession, ruleChips } from "../src/ask/ask.ts";
import { ITEM_WORDS, LADDER_IDS, NOT_SHOPPED_YET, notShoppedYet } from "../src/ask/shops.ts";
import { JACKET_DAY, LADDER_ITEM, ONLY_CHECKOUT, jacketOffers, ladder, ladderFor, ladderSaid, similarOffers, type LadderOffer, type SimilarOffer } from "../src/ask/ladder.ts";
import { BEAT_DAY, watchedCards } from "../src/ask/watching.ts";
import type { SavedWant } from "../src/ask/wants.ts";

const CAT = demoCatalogItems();
const POLICY = demoPolicy();
const HARBOR = JACKETS.find((j) => j.id === "harbor-jacket")!;
const TIDEWATER = JACKETS.find((j) => j.id === "tidewater-jacket")!;
const chips = (words: string) => ruleChips(words, CAT);
const want = (catalogId: string, max: number, color?: string): SavedWant => ({ catalogId, priority: "really", max, at: DEMO_T0, ...(color ? { color } : {}) });
const offer = (name: string, price: number, verdict: LadderOffer["verdict"]): LadderOffer => ({ name, price, verdict, why: `${name} why.` });
const look = (name: string, price: number, verdict: SimilarOffer["verdict"]): SimilarOffer => ({ item: "Look-alike (fictional)", noun: "jacket", name, price, verdict });

describe("the jacket, the second category", () => {
  it("jacket_is_a_catalog_entry_with_colors_and_sizes: two fictional jackets in clothing, after the kettle, and runs don't shop them", () => {
    expect(demoCatalog()[0]!.id).toBe(LADDER_ITEM);
    for (const j of JACKETS) expect(CAT.get(j.id)).toEqual({ item: j.item, category: "clothing", attributes: JACKET_OPTIONS });
    // Every listing's options are the catalog's words, so a chip can only name an option some listing has.
    for (const j of JACKETS) for (const s of j.sellers) for (const [name, ws] of Object.entries(s.attributes!)) for (const w of ws) expect((JACKET_OPTIONS as Record<string, readonly string[]>)[name]).toContain(w);
    // The shopper's words reach each jacket with its options; the kettle's words still reach the kettle.
    expect(chips("I really want the black Harbor jacket in medium")).toEqual(expect.arrayContaining([{ kind: "item", value: "harbor-jacket" }, { kind: "attribute", name: "color", value: "black" }, { kind: "attribute", name: "size", value: "medium" }]));
    expect(chips("the Tidewater jacket, not yellow")).toContainEqual({ kind: "item", value: "tidewater-jacket" });
    expect(chips("the Tidewater jacket, not yellow")).not.toContainEqual({ kind: "attribute", name: "color", value: "yellow" });
    expect(chips("a black kettle")).toContainEqual({ kind: "item", value: "kettle" });
    expect(chips("a black kettle")).not.toContainEqual(expect.objectContaining({ name: "size" }));
    // "A black jacket" names both jackets equally: it's clothing, never a guessed Harbor jacket (no ladder, no run).
    expect(chips("a black jacket")).toEqual([{ kind: "category", value: "clothing" }, { kind: "attribute", name: "color", value: "black" }]);
    expect(chips("any jacket deals?")).toContainEqual({ kind: "category", value: "clothing" });
    expect(chips("the Harbor jacket")).toContainEqual({ kind: "item", value: "harbor-jacket" });
    // No run shops a jacket yet: said before any run, never a kettle run under a jacket chip.
    expect(notShoppedYet(chips("the black Harbor jacket"))).toBe(NOT_SHOPPED_YET);
    expect(notShoppedYet(chips("any clothing deals?"))).toBe(NOT_SHOPPED_YET);
    // The page's light list is the ladder's own entries; the jackets' day is the wants card's.
    expect(LADDER_IDS).toEqual([LADDER_ITEM, ...JACKETS.map((j) => j.id)]);
    expect(JACKET_DAY).toBe(BEAT_DAY);
    // Every entry's chip says its name, never its catalog id.
    expect(Object.keys(ITEM_WORDS).sort()).toEqual([...CAT.keys()].sort());
    expect(ITEM_WORDS[HARBOR.id]).toBe("Harbor jacket");
  });

  it("jacket_want_is_watched: the card reads the jacket's listings in her color, the scam named first, held to the clothing limit", () => {
    // The demo's own clothing limit (Desk-L, $70.00): Driftline's $69.00 is a deal, in black.
    expect(watchedCards([want(HARBOR.id, 8000, "black")], CAT, POLICY)[0]).toMatchObject({ watch: "under", line: expect.stringContaining("Harbor Jacket (fictional) is $69.00 at Driftline Outfitters (fictional), $1.00 under your $70.00 max.") });
    // With no limit of its own (a Policy without the demo's clothing limit): held to $60.00. Driftline's $69.00 is over;
    // JacketQuack's $35.00 gift card is no deal.
    const [unset] = watchedCards([want(HARBOR.id, 8000, "black")], CAT, { ...POLICY, categoryLimit: { kitchen: 6000, events: 9000 } });
    expect(unset).toMatchObject({ watch: "refused", warning: `Watcher set JacketQuack (fictional) aside: it asks to be paid by gift card. ${ONLY_CHECKOUT}` });
    expect(unset!.line).toMatch(/^Clothing has no limit of its own yet: set one in Limits in code\. Until then Goose holds it to \$60\.00\. On simulated day 5: Harbor Jacket \(fictional\) for \$35\.00 is no deal\./);
    // With $80.00 set: Driftline's $69.00 is a deal, in black.
    const [set] = watchedCards([want(HARBOR.id, 8000, "black")], CAT, setCategoryLimit(POLICY, "clothing", 8000, 0));
    expect(set).toMatchObject({ watch: "under", line: expect.stringContaining("Harbor Jacket (fictional) is $69.00 at Driftline Outfitters (fictional), $11.00 under your $80.00 max.") });
    // An olive want never reads a listing that doesn't come in olive (Driftline): Saltmarsh's $79.00 is the only cleared one.
    expect(watchedCards([want(HARBOR.id, 8000, "olive")], CAT, setCategoryLimit(POLICY, "clothing", 8000, 0))[0]).toMatchObject({ watch: "under", line: expect.stringContaining("$79.00 at Saltmarsh Supply") });
  });
});

describe("ladder layer 5: similar for less", () => {
  it("similar_for_less_is_offered: over the limit or best at the store, a cleared look-alike in her color is said under the answer", () => {
    const over = ladderFor(HARBOR.id, 7500, 6000, null, { color: "black" })!;
    expect(over.answer).toMatchObject({
      layer: "over-budget", line: "Not set aside, the best price is $69.00 at Driftline Outfitters (fictional), over your $60.00 limit.",
      refused: [`Watcher set JacketQuack (fictional) aside: it asks to be paid by gift card.`, ONLY_CHECKOUT],
      similar: "A similar black jacket is $52.00 at Gullfeather Goods (fictional), not the same item: the Tidewater Jacket (fictional).",
    });
    expect(ladderSaid(over.answer)).toBe("$69 at Driftline is over your $60 limit. JacketQuack was refused: it asked for a gift card. A similar black jacket is $52 at Gullfeather, not the same item.");
    expect(over.from).toBe("Compared with the fictional clothing sellers' posted totals on simulated day 5, each checked by the Watcher. Total with fees and taxes, as you'd pay it.");
    // The cheaper same item still leads; the look-alike sits under it.
    expect(ladderFor(HARBOR.id, 7500, 8000, null, { color: "black", size: "medium" })!.answer).toMatchObject({ layer: "cheaper", line: "Not set aside, and $6.00 less: the same jacket for $69.00 at Driftline Outfitters (fictional).", similar: expect.stringMatching(/^A similar black jacket is \$52\.00/) });
    // No color asked: "a similar jacket".
    expect(ladderFor(HARBOR.id, 6900, 8000, null)!.answer).toMatchObject({ layer: "store-best", similar: expect.stringMatching(/^A similar jacket is \$52\.00 at Gullfeather/) });
  });

  it("similar_is_always_labeled_similar: every look-alike line says similar and not the same item, and never names the item asked", () => {
    let shown = 0;
    const sizes = [undefined, ...JACKET_OPTIONS.size];
    for (const j of JACKETS) for (const color of [undefined, ...JACKET_OPTIONS.color]) for (const size of sizes) for (const saw of [3000, 5000, 5300, 6900, 7500, 9900]) for (const limit of [null, 5000, 6000, 8000]) {
      const asked = { ...(color ? { color } : {}), ...(size ? { size } : {}) };
      const a = ladderFor(j.id, saw, limit, null, asked)!.answer;
      if (!a.similar) { expect(a.saidSimilar).toBe(""); continue; }
      shown++;
      expect(a.similar).toMatch(/^A similar .*, not the same item: the .*\.$/);
      expect(a.saidSimilar).toMatch(/^A similar .*, not the same item\.$/);
      expect(a.similar).not.toContain(j.item);
      expect(a.line).not.toMatch(/similar/i);
    }
    expect(shown).toBeGreaterThan(0);
  });

  it("similar_only_from_cleared_sellers: a held or refused look-alike never shows, however low", () => {
    // Ferrylane (no sales yet) lists the Tidewater in navy at $45.00: held, so a navy ask gets no look-alike.
    expect(similarOffers(HARBOR, JACKET_DAY, { color: "navy" }).map((o) => [o.name, o.verdict])).toEqual([["Ferrylane Co. (fictional)", "hold"]]);
    expect(ladderFor(HARBOR.id, 7500, 8000, null, { color: "navy" })!.answer.similar).toBe("");
    for (const v of ["hold", "refuse"] as const) expect(ladder(7500, 8000, [offer("Same", 7000, "clear")], "jacket", [look("Cheap", 100, v)]).similar).toBe("");
    // A refused same-item seller (JacketQuack's $35.00) never becomes the price a look-alike has to beat, either.
    expect(jacketOffers(HARBOR, JACKET_DAY, { color: "black" }).find((o) => o.verdict === "refuse")?.price).toBe(3500);
  });

  it("similar_never_over_limit_or_dearer: under her price, under the same item's best cleared price, at or under her limit", () => {
    const same = [offer("Same", 7000, "clear")];
    expect(ladder(7500, 8000, same, "jacket", [look("A", 6000, "clear")]).similar).toContain("$60.00 at A");
    expect(ladder(7500, 5000, same, "jacket", [look("A", 6000, "clear")]).similar).toBe(""); // over the limit
    expect(ladder(7500, 6000, same, "jacket", [look("A", 6000, "clear")]).similar).toContain("$60.00"); // right at it
    expect(ladder(5500, 8000, same, "jacket", [look("A", 6000, "clear")]).similar).toBe(""); // dearer than what she saw
    expect(ladder(7500, 8000, [offer("Same", 5500, "clear")], "jacket", [look("A", 6000, "clear")]).similar).toBe(""); // the same item is cheaper
    expect(ladder(7500, 8000, [offer("Same", 6000, "clear")], "jacket", [look("A", 6000, "clear")]).similar).toBe(""); // a tie goes to the same item
    // The cheapest qualifying look-alike, whatever the order.
    expect(ladder(7500, 8000, same, "jacket", [look("B", 6500, "clear"), look("A", 5900, "clear")]).similar).toContain("$59.00 at A");
    // An unread limit shows no look-alike (it can't be kept under a limit Goose doesn't know); the line says it wasn't read.
    expect(ladder(7500, null, same, "jacket", [look("A", 6000, "clear")])).toMatchObject({ similar: "", saidSimilar: "" });
    expect(ladder(7500, null, same, "jacket", [look("A", 6000, "clear")]).line).toContain("couldn't read your limit");
  });

  it("similar_matches_every_option_asked: a black medium ask only reads listings in black and medium", () => {
    expect(similarOffers(HARBOR, JACKET_DAY, { color: "black", size: "medium" }).map((o) => o.name)).toEqual(["Gullfeather Goods (fictional)", "Ferrylane Co. (fictional)"]);
    expect(similarOffers(HARBOR, JACKET_DAY, { color: "olive" })).toEqual([]);
    expect(similarOffers(HARBOR, JACKET_DAY, { color: "black", size: "large" }).map((o) => o.name)).toEqual(["Gullfeather Goods (fictional)"]);
    // The kettle has no look-alikes: no layer 5 line, ever.
    for (let d = 0; d < MOVING_DAYS; d++) expect(ladderFor(LADDER_ITEM, 9900, 6000, null)!.answer.similar).toBe("");
    expect(ladderFor("marsh-lights-ticket", 9900, 9000, null)).toBeNull();
  });

  it("ask_reply_carries_the_items_own_limit: the server's ask says the clothing limit for a jacket, the shopper's own once she sets one", async () => {
    const shoppers = new DemoShoppers();
    const at = DEMO_T0 + DAY_MS;
    expect((await askForSession(shoppers, "t", at, "the black Harbor jacket", { port: null, aiName: "" })).itemLimit).toBe("70.00");
    shoppers.setLimit("t", "clothing", 8000, at);
    expect((await askForSession(shoppers, "t", at, "the black Harbor jacket", { port: null, aiName: "" })).itemLimit).toBe("80.00");
    expect((await askForSession(shoppers, "t", at, "a black kettle", { port: null, aiName: "" })).itemLimit).toBe("60.00");
    expect((await askForSession(shoppers, "t", at, "something nice", { port: null, aiName: "" })).itemLimit).toBeUndefined();
  });
});

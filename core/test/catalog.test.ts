// §15B made reachable: the ticket, hotel night and flight seat are catalog entries, so the shopper's words can save them
// as wants and the price watch reads them; a run still shops the kettle only and isn't started for anything else; and
// Settings has a tap that sets a category's first limit (the "really want" beat), never the demo's kitchen limit.

import { describe, expect, it } from "vitest";
import { DEMO_CATEGORY, DEMO_ENTRY, demoCatalog, demoCatalogItems, demoPolicy } from "../src/scenario.ts";
import { setCategoryLimit } from "../src/trust/policy.ts";
import { MOVING_ITEMS } from "../src/sellers/moving.ts";
import { ruleChips, speakLine, NOT_SHOPPED_SPOKEN, SAY_WHICH_SPOKEN } from "../src/ask/ask.ts";
import { NOT_SHOPPED_YET, RUN_CATEGORY, RUN_ENTRY, SAY_WHICH, notShoppedYet, runEntry, runsShop } from "../src/ask/shops.ts";
import { limitChoices, limitRefused, limitRows } from "../src/ask/watching.ts";

const CAT = demoCatalogItems();
const POLICY = demoPolicy();
const item = (words: string) => ruleChips(words, CAT).find((c) => c.kind === "item")?.value;

describe("§15B reachable: the moving items in the catalog", () => {
  it("catalog_has_the_moving_items_kettle_first: entry 0 stays the kettle; each moving item is an entry in its category", () => {
    expect(demoCatalog()[0]!.id).toBe(DEMO_ENTRY);
    expect([RUN_ENTRY, RUN_CATEGORY]).toEqual([DEMO_ENTRY, DEMO_CATEGORY]);
    for (const m of MOVING_ITEMS) expect(CAT.get(m.id)).toEqual({ item: m.item, category: m.category });
    // No haggle sellers for them: no run shops them yet. Each first-limit suggestion is under the per-purchase cap.
    for (const e of demoCatalog().slice(1)) { expect(e.sellers).toEqual([]); expect(e.want.maxPrice).toBeLessThanOrEqual(POLICY.perPurchaseCap); }
  });

  it("words_name_the_right_entry: the shopper's words reach each new item, and the kettle's words still reach the kettle", () => {
    expect(item("I really want the Marsh Lights ticket")).toBe("marsh-lights-ticket");
    expect(item("a night at Mossbell Inn")).toBe("mossbell-night");
    expect(item("a seat on Gullwing to Port Alder")).toBe("gullwing-seat");
    for (const w of ["I really want a black kettle", "find me a kettle under $50", "the Goldfeather one", "kettle tonight", "a kettle for my seat"]) expect([w, item(w)]).toEqual([w, "kettle"]);
  });

  it("run_shops_each_entry (§15B part 2, was run_never_shops_another_entry): a moving item's chip starts its own run; travel alone says which; the kettle's run as before", () => {
    expect(notShoppedYet(ruleChips("the Marsh Lights ticket", CAT))).toBeNull();
    expect(runEntry(ruleChips("the Marsh Lights ticket", CAT))).toBe("marsh-lights-ticket");
    expect(notShoppedYet(ruleChips("a black kettle", CAT))).toBeNull();
    expect(runEntry(ruleChips("a black kettle", CAT))).toBe(DEMO_ENTRY);
    expect(notShoppedYet(undefined)).toBeNull();
    expect(MOVING_ITEMS.map((m) => runsShop(m.id))).toEqual([true, true, true]);
    expect(runsShop(DEMO_ENTRY)).toBe(true);
    // An entry no run shops is still refused, junk beside it or not.
    expect(notShoppedYet([{ kind: "item", value: "toaster" }, "junk"])).toBe(NOT_SHOPPED_YET);
    // Said as Goose says it, never the catalog id.
    expect(speakLine(ruleChips("the Marsh Lights ticket", CAT), "the Marsh Lights ticket")).toBe("Marsh Lights ticket, under your limit.");
    // A category with two entries and no item ("any travel deals?") would have to guess, so it starts nothing and says which.
    expect(ruleChips("any travel deals?", CAT)).toContainEqual({ kind: "category", value: "travel" });
    expect(notShoppedYet(ruleChips("any travel deals?", CAT))).toBe(SAY_WHICH);
    expect(speakLine(ruleChips("any travel deals?", CAT), "any travel deals?")).toBe(SAY_WHICH_SPOKEN);
    expect(notShoppedYet([{ kind: "category", value: "kitchen" }])).toBeNull();
    // Said whether or not a want was saved: it promises no watch, only how to get one.
    expect(NOT_SHOPPED_SPOKEN).not.toMatch(/watches that/);
    expect(speakLine(ruleChips("a black kettle", CAT), "a black kettle")).toBe("Black kettle, under your limit.");
  });

  it("settings_limit_one_tap: a category with no limit of its own offers one tap; the demo's kitchen and events limits are shown, never set here", () => {
    const rows = limitRows(POLICY, CAT);
    // Desk-L: travel and clothing start at the demo's own $100.00 and $70.00 ("Set for this demo"), and a tap may change them.
    expect(rows.map((r) => [r.category, r.limit, r.locked, r.demo, r.own, r.suggest])).toEqual([
      ["kitchen", "60.00", true, false, false, null], ["events", "90.00", true, false, false, null], ["travel", "100.00", false, true, false, null], ["clothing", "70.00", false, true, false, null],
    ]);
    expect(rows[0]!.choices).toEqual([]);
    expect(rows[1]!.choices).toEqual([]);
    expect(rows[2]!.choices).toEqual(limitChoices(POLICY.perPurchaseCap));
    expect(limitChoices(POLICY.perPurchaseCap)).toHaveLength(30);
    // With no limit of its own (a Policy without the demo's travel and clothing): held to the strictest, one tap offered.
    const unset = limitRows({ ...POLICY, categoryLimit: { kitchen: 6000, events: 9000 } }, CAT);
    expect(unset.slice(2).map((r) => [r.category, r.limit, r.locked, r.demo, r.own, r.suggest])).toEqual([["travel", "60.00", false, false, false, 10_000], ["clothing", "60.00", false, false, false, 8000]]);
    const set = limitRows(setCategoryLimit(POLICY, "travel", 9000, 0), CAT).find((r) => r.category === "travel");
    expect(set).toMatchObject({ limit: "90.00", own: true, demo: false, suggest: null });
    expect(limitRefused(POLICY, CAT, "travel", 9000)).toBeNull();
    expect(limitRefused(POLICY, CAT, "kitchen", 9000)).toBe("The kitchen limit is set for this demo, so it doesn't change here. Nothing changed.");
    expect(limitRefused(POLICY, CAT, "events", 9500)).toBe("The events limit is set for this demo, so it doesn't change here. Nothing changed.");
    for (const [cat, lim] of [["travel", 9001], ["travel", 15_500], ["travel", "90"], ["travel", 0]] as const) expect(limitRefused(POLICY, CAT, cat, lim)).toMatch(/^A limit is a whole \$5\.00 step/);
    for (const cat of ["toys", "constructor", 7, undefined]) expect(limitRefused(POLICY, CAT, cat, 9000)).toMatch(/^That isn't a catalog category/);
  });
});

// A week with Goose (Joshua, Nov 5 6:10 PM): four moments under the landing's promises, each a day and one plain
// sentence, read from the recorded week (core/src/sellers/moving.ts), never retyped by the page. Track C's Devpost text
// carries the same four sentences, so they are pinned here word for word, and each fact is pinned to moving.ts itself.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MOVING_ITEMS } from "../src/sellers/moving.ts";
import { STORY_ITEM, WEEK_LABEL, WEEK_NOTE, scrollStory, weekMoments } from "../src/view/scroll.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const ITEM = MOVING_ITEMS.find((i) => i.id === STORY_ITEM)!;

describe("a week with Goose", () => {
  it("week_reads_four_moments: the ask, the gift-card seller set aside, the deal under the limit, the tap", () => {
    expect(weekMoments().map((m) => `Day ${m.day}: ${m.line}`)).toEqual([
      "Day 1: You ask Goose for a Marsh Lights ticket under $90.",
      "Day 2: The cheapest seller, TixQuack, asks $55 by gift card, so Goose sets it aside and tells you why.",
      "Day 5: Lantern Hall Box Office's total falls to $84, under your $90, so Goose shows you the deal.",
      "Day 5: You tap to pay $84 in PayPal; nothing but your tap could pay.",
    ]);
  });

  it("week_facts_come_from_moving_ts: every name, price and day above is in the recorded week", () => {
    const src = read("core/src/sellers/moving.ts");
    const by = (id: string) => ITEM.sellers.find((s) => s.sellerId === id)!;
    expect(ITEM.item).toBe("A ticket to The Marsh Lights, Saturday (fictional)");
    // TixQuack: $55.00 with no fee from day 2 (index 1), and its note asks for a gift card.
    expect(by("tixquack").name).toBe("TixQuack (fictional)");
    expect(by("tixquack").note).toMatch(/gift card/);
    expect(src).toContain("curve: [at(1, 5500, 0)]");
    // Lantern Hall: $74.00 + $10.00 = $84.00 on day 5 (index 4), the first day a cleared seller is at or under $90.
    expect(by("lanternhall").name).toBe("Lantern Hall Box Office (fictional)");
    expect(src).toContain("at(4, 7400, 1000)");
    const s = scrollStory();
    expect([s.limit.cents, s.ping, s.day, s.deal.total]).toEqual([9000, 5, 5, 8400]);
  });

  it("week_throws_if_the_record_drifts: a set-aside seller that isn't the cheapest that day breaks it", () => {
    const pricier = { ...ITEM, sellers: ITEM.sellers.map((x) => (x.sellerId === "tixquack" ? { ...x, curve: [{ ...x.curve[0]!, base: 15000 }] } : x)) };
    expect(() => weekMoments(scrollStory(undefined, pricier), pricier)).toThrow(/isn't the cheapest/);
  });

  it("week_says_no_feature_names: plain words a shopper would use, and no notification Goose doesn't send", () => {
    const words = weekMoments().map((m) => m.line).join(" ");
    for (const name of [/Watcher/, /\bping/i, /Approve/, /Set your price/i, /Watching/, /haggl/i, /Snap/, /Find\b/, /Desk/, /—/, /notif|lets you know|alert/i]) expect(words).not.toMatch(name);
  });

  it("week_mounts_under_the_promises: label, four rows and Joshua's footnote, word for word", () => {
    expect(WEEK_LABEL).toBe("A week with Goose");
    expect(WEEK_NOTE).toBe("These moments come from our practice market. Prices are simulated.");
    const story = read("web/src/desk/story/Story.tsx");
    // Under the promises, after the demo's moment and its real prices (Joshua, Nov 6 1:10 PM: Channel3 up the page).
    expect(story).toMatch(/<Promises onAsk=\{onAsk\} \/>\n[^<]*<Moment story=\{STORY\} \/>\n\s*<RealMarket onAsk=\{onAsk\} \/>\n\s*<Week moments=\{WEEK\} \/>/);
    expect(story).toContain("const { story: STORY, week: WEEK } = built;"); // weekMoments(scrollStory()), as the build ran it (story-cold.test.ts)
    const week = read("web/src/desk/story/Week.tsx");
    for (const bit of ["{WEEK_LABEL}", "{WEEK_NOTE}", "Day {m.day}", "<p>{m.line}</p>", 'className="dk-eyebrow ds-eyebrow ds-n"']) expect(week).toContain(bit);
  });
});

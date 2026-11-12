// "Set your price" (Joshua, Nov 5, section 3): the demo week says the limit order out loud. The ping comes from the record and
// agrees with the wants list's own price watch, so the landing can't tell a different week from the one the watch reads.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MISSED_DROP, PING_NEVER_BUYS, pingWords, scrollStory } from "../src/view/scroll.ts";
import { offersFor, watchedWant } from "../src/ask/watching.ts";
import { watchPrice } from "../src/trust/pricewatch.ts";
import { demoCatalogItems, demoPolicy } from "../src/scenario.ts";
import { toCents } from "../src/money.ts";

const moment = readFileSync(new URL("../../web/src/desk/story/Moment.tsx", import.meta.url), "utf8");

describe("the demo week says it out loud", () => {
  it("says the record's prices, the day it pinged and the number it crossed", () => {
    expect(pingWords(scrollStory())).toBe("Goose waited: $112 → $94 → $84. On simulated day 5 it pinged you, because the price crossed your $90.");
    expect(MISSED_DROP.join(" ")).toBe("Missed the drop? Set your price.");
  });

  it("the ping's day is the first day the wants list's own watch says yes, and TixQuack's lower price never pings", () => {
    const policy = demoPolicy(), catalog = demoCatalogItems();
    const want = { catalogId: "marsh-lights-ticket", priority: "nice" as const, max: toCents("90.00"), at: 0 };
    const kinds = Array.from({ length: 7 }, (_, d) => watchPrice(watchedWant(want, catalog, policy)!, offersFor(want, d), policy).kind);
    expect(kinds.findIndex((k) => k === "under" || k === "held") + 1).toBe(scrollStory().ping);
    expect(kinds[1]).toBe("refused"); // day 2: the gift-card seller at $55.00, well under $90
  });

  it("the ping never reads as a purchase, and the moment says so beside it", () => {
    expect(PING_NEVER_BUYS).toBe("The ping never buys: only your tap pays.");
    expect(moment).toContain("{pingWords(story)} {PING_NEVER_BUYS}");
    expect(moment).toContain("A replay of a recorded practice week. The sellers and days are simulated.");
  });
});

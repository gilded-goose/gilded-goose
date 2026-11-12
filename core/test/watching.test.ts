// "Your wants" meets the price watch (§15A, §15B's end; core/src/ask/watching.ts): each card's line is the watch's line,
// the kettle's against the week the ladder compares, a moving item's against today's point on its curve. The card has
// no buy button, so no line says "Tap to buy"; with nothing to say, P-2's "Your max" line stays.

import { describe, expect, it } from "vitest";
import { DEMO_T0, demoCatalogItems, demoPolicy } from "../src/scenario.ts";
import { setCategoryLimit } from "../src/trust/policy.ts";
import type { Catalog } from "../src/trust/catalog.ts";
import { MOVING_ITEMS } from "../src/sellers/moving.ts";
import { BEAT_DAY, noLimitLine, offersFor, warningFor, watchedCards, watchedWant } from "../src/ask/watching.ts";
import { LADDER_BEAT, ONLY_CHECKOUT, ladder, marketOffers } from "../src/ask/ladder.ts";
import { wantCards, type SavedWant } from "../src/ask/wants.ts";

const CAT = demoCatalogItems();
const POLICY = demoPolicy();
const ticket = MOVING_ITEMS.find((i) => i.id === "marsh-lights-ticket")!;
/** The demo catalog plus a moving item and an item with no offers anywhere: what a wider catalog will look like. */
const WIDE: Catalog = new Map([...CAT, [ticket.id, { item: ticket.item, category: ticket.category }], ["jacket", { item: "Harbor Jacket (fictional)", category: "kitchen" }]]);
const EVENTS = setCategoryLimit(POLICY, "events", 9000, 0);
const want = (catalogId: string, max: number, priority: SavedWant["priority"] = "really", color?: string): SavedWant => ({ catalogId, priority, max, at: DEMO_T0, ...(color ? { color } : {}) });
const day = (d: number) => d;

describe("the price watch on Your wants", () => {
  it("kettle_card_says_the_week_ladder_reads: the scam under the max is said as a refusal, never a deal", () => {
    const [card] = watchedCards([want("kettle", 6000)], CAT, POLICY, day(0));
    expect(card).toMatchObject({ catalogId: "kettle", watch: "refused" });
    expect(card!.line).toBe("In simulated week 3: Goldfeather Kettle (fictional) for $20.30 is no deal. Your max: $60.00, your limit.");
    expect(card!.line).not.toContain("Tap to buy");
  });

  it("card_leads_with_the_scam_warning: the refused seller is named first, as the ladder names it, and the watch line sits under it", () => {
    // Joshua, Thu Oct 29: the warning leads. The same sentence the ladder's layer 1 says for the week it reads.
    const [card] = watchedCards([want("kettle", 6000)], CAT, POLICY, day(0));
    const ladderSays = ladder(5500, 6000, marketOffers(LADDER_BEAT), "kettle").refused.join(" ");
    expect(card!.warning).toBe(ladderSays);
    expect(card!.warning).toBe(`Watcher set QuickQuack Deals (fictional) aside: its note tries to instruct the agent and it asks to be paid by gift card. ${ONLY_CHECKOUT}`);
    // The line under it never repeats the Watcher's sentence.
    expect(card!.line).not.toContain("QuickQuack");
    // One rule for every want: the ticket's deal card names the gift-card ticket seller first too, and still reads the deal.
    const [ticketCard] = watchedCards([want(ticket.id, 9000)], WIDE, EVENTS, day(4));
    expect(ticketCard).toMatchObject({ watch: "under", warning: expect.stringMatching(/^Watcher set TixQuack \(fictional\) aside: .*gift card.*\. Payment only goes through PayPal checkout/) });
    // No refused seller in the offers: no warning (a silver kettle; the ticket's day 1).
    expect(watchedCards([want("kettle", 6000, "really", "silver")], CAT, POLICY, day(0))[0]!.warning).toBeNull();
    expect(watchedCards([want(ticket.id, 9000)], WIDE, EVENTS, day(0))[0]!.warning).toBeNull();
    // A held card warns too: the hotel's day 5 holds Duckpond's $86.00 and names BargainNest (Zelle) first.
    const TRAVEL = setCategoryLimit(POLICY, "travel", 9000, 0);
    const hotel = MOVING_ITEMS.find((i) => i.id === "mossbell-night")!;
    const HOTELS: Catalog = new Map([...CAT, [hotel.id, { item: hotel.item, category: hotel.category }], [ticket.id, { item: ticket.item, category: ticket.category }]]);
    const both = watchedCards([want(hotel.id, 9000), want(ticket.id, 9000)], HOTELS, setCategoryLimit(TRAVEL, "events", 9000, 0), day(4));
    expect(both[0]).toMatchObject({ catalogId: hotel.id, watch: "held", warning: expect.stringMatching(/^Watcher set BargainNest \(fictional\) aside: .*Payment only goes through PayPal checkout/) });
    // 9.1's line once on the list: the second warned card names its seller without it.
    expect(both[1]!.warning).toMatch(/^Watcher set TixQuack \(fictional\) aside: [^]*\.$/);
    expect(both[1]!.warning).not.toContain(ONLY_CHECKOUT);
    // Each refused seller once, in the market's order.
    const o = offersFor(want("kettle", 6000), day(0));
    expect(warningFor([...o, ...o])).toBe(warningFor(o));
  });

  it("deal_line_never_says_tap_on_a_card: the moving ticket's $84.00 day reads as a deal with no tap the card can't do", () => {
    const [card] = watchedCards([want(ticket.id, 9000)], WIDE, EVENTS, day(4));
    expect(card).toMatchObject({ watch: "under", line: "On simulated day 5: A ticket to The Marsh Lights, Saturday (fictional) is $84.00 at Lantern Hall Box Office (fictional), $6.00 under your $90.00 max. Total with fees and taxes, as you'd pay it." });
    // The next day it's back up: close, and the shopper's max is the one said, never raised.
    expect(watchedCards([want(ticket.id, 9000)], WIDE, EVENTS, day(5))[0]).toMatchObject({ watch: "close", line: expect.stringContaining("$91.00, $1.00 over your $90.00 max. Keep waiting, or raise your max yourself in Limits in code.") });
  });

  it("unset_limit_is_said_never_silent: a category with no limit of its own says so, and is held to the strictest one", () => {
    // Events unset (a Policy with only the kitchen's limit; the demo's own sets events at $90.00): the ticket is held to
    // the kitchen's $60.00, and the card says why before the watch's line.
    const UNSET = demoPolicy({ categoryLimit: { kitchen: 6000 } });
    const [card] = watchedCards([want(ticket.id, 6000)], WIDE, UNSET, day(4));
    expect(card).toMatchObject({ watch: "refused", line: expect.stringMatching(/^Events has no limit of its own yet: set one in Limits in code\. Until then Goose holds it to \$60\.00\. On simulated day 5: .* for \$55\.00 is no deal\./) });
    expect(card!.line).not.toContain("under your");
    expect(noLimitLine("events", EVENTS)).toBeNull();
    expect(noLimitLine("kitchen", POLICY)).toBeNull();
    expect(noLimitLine("events", POLICY)).toBeNull(); // the demo's own events limit
    expect(noLimitLine("travel", POLICY)).toBeNull(); // the demo's own travel limit (Desk-L)
    expect(noLimitLine("travel", UNSET)).toMatch(/^Travel has no limit of its own yet: set one in Limits in code\. Until then Goose holds it to \$60\.00\.$/);
    // Quiet, it still says so, ahead of the max line.
    expect(watchedCards([want(ticket.id, 6000)], WIDE, UNSET, day(0))[0]!.line).toBe("Events has no limit of its own yet: set one in Limits in code. Until then Goose holds it to $60.00. Your max: $60.00, your limit.");
  });

  it("quiet_keeps_the_max_line: nothing to say, or no offers at all, leaves P-2's line and the list's order", () => {
    const wants = [want("jacket", 4000, "nice"), want(ticket.id, 9000)];
    const cards = watchedCards(wants, WIDE, EVENTS, day(0)); // the ticket's $105.00 and $112.00 are far over $90.00
    expect(cards.map((c) => [c.catalogId, c.watch])).toEqual([[ticket.id, "quiet"], ["jacket", "quiet"]]);
    expect(cards.map((c) => c.line)).toEqual(wantCards(wants, WIDE, EVENTS).map((c) => c.line));
    // A want whose entry left the catalog is dropped, as wantCards drops it.
    expect(watchedCards([want("gone", 1000)], CAT, POLICY, day(0))).toEqual([]);
    expect(watchedWant(want("gone", 1000), CAT, POLICY)).toBeNull();
  });

  it("color_want_counts_only_that_color: a silver kettle never reads a black listing's price", () => {
    expect(offersFor(want("kettle", 6000, "really", "silver"), day(0)).map((o) => o.sellerId)).toEqual(["reedbank"]);
    expect(offersFor(want("kettle", 6000), day(0)).map((o) => o.sellerId)).toEqual(["pondside", "reedbank", "quickquack"]);
    // Silver only: Reedbank's $82.00 is far over $60.00 and no scam lists silver, so the card keeps its max line.
    expect(watchedCards([want("kettle", 6000, "really", "silver")], CAT, POLICY, day(0))[0]).toMatchObject({ watch: "quiet", line: "Your max: $60.00, your limit." });
  });

  it("beat_day_is_the_drop: the server's card reads the recorded drop, so every visit shows the same state", () => {
    expect(BEAT_DAY).toBe(4);
    expect(watchedCards([want(ticket.id, 9000)], WIDE, EVENTS)[0]).toMatchObject({ watch: "under", line: expect.stringMatching(/^On simulated day 5: .* \$84\.00 at Lantern Hall/) });
    // The want's max is clamped to today's limit before the watch reads it.
    expect(watchedWant(want("kettle", 6000), CAT, setCategoryLimit(POLICY, "kitchen", 5000, 0))).toMatchObject({ maxPrice: 5000, really: true });
  });
});

// §19 layer 4, "wait, or don't" (§19.1), on the want card: which regret to avoid, from Goose's recorded history only.
// The lowest cleared price's drops this simulated week, as counted facts; or, for an item Goose recorded selling out
// last season with no sale first, the sell-out line. Only for a "really want", always ending "Your call.", never a
// countdown, never a seller's "going fast".

import { describe, expect, it } from "vitest";
import { MOVING_DAYS, MOVING_ITEMS, clearedDrops, type MovingItem } from "../src/sellers/moving.ts";
import { BEAT_DAY, historyLine, watchedCards } from "../src/ask/watching.ts";
import type { SavedWant } from "../src/ask/wants.ts";
import { DEMO_T0, demoCatalogItems, demoPolicy } from "../src/scenario.ts";
import { setCategoryLimit } from "../src/trust/policy.ts";

const item = (id: string) => MOVING_ITEMS.find((i) => i.id === id)!;
const TICKET = item("marsh-lights-ticket");
const HOTEL = item("mossbell-night");
const FLIGHT = item("gullwing-seat");
const want = (catalogId: string, priority: SavedWant["priority"] = "really", max = 9000): SavedWant => ({ catalogId, priority, max, at: DEMO_T0 });
const SELLER_WORDS = /going fast|gift card|zelle|seats|book direct|email the ticket/i;
// "now's the time" is cut too (Joshua, Thu Oct 29): Goose never fakes urgency (§19.1), it states the record.
const URGENT = /act now|hurry|only \d+ left|countdown|ends in|last chance|going fast|don't miss|now's the time|now is the time|!/i;

describe("§19 layer 4: wait, or don't", () => {
  it("history_line_states_counts_never_predicts: the cleared drops so far, from and to, and no word about the future", () => {
    expect(clearedDrops(TICKET, BEAT_DAY)).toEqual({ drops: 2, from: 10_500, to: 8400 });
    expect(clearedDrops(FLIGHT, BEAT_DAY)).toEqual({ drops: 2, from: 13_200, to: 9600 });
    // A held seller (Duckpond, no record) never counts: the inn's own $99.00 is the low, not the new seller's $86.00.
    expect(clearedDrops(HOTEL, BEAT_DAY)).toEqual({ drops: 2, from: 12_900, to: 9900 });
    expect(clearedDrops(TICKET, 0)).toEqual({ drops: 0, from: 10_500, to: 10_500 });
    const line = historyLine(want(TICKET.id), 9000, BEAT_DAY);
    expect(line).toBe("From sellers not set aside, its lowest price dropped 2 times so far this simulated week, from $105.00 to $84.00. Goose watches for $90.00 or less (your Max). Your call.");
    expect(line).not.toMatch(/\bwill\b|likely|expect|predict|going to|soon/i);
    // No drop yet: nothing to say.
    expect(historyLine(want(TICKET.id), 9000, 0)).toBeNull();
  });

  it("sellout_line_uses_history_never_seller_text: Goose's last-season record, never what a seller wrote", () => {
    // The sell-out leads; this season's drops still show, so the card never says "never on sale" over a falling price.
    expect(historyLine(want(HOTEL.id), 9000, BEAT_DAY)).toBe("Last season this sold out in about 6 days and never went on sale, in Goose's record of the fictional market. This season, from sellers not set aside, its lowest price has dropped 2 times so far this simulated week, from $129.00 to $99.00. Your call.");
    expect(historyLine(want(HOTEL.id), 9000, 0)).toBe("Last season this sold out in about 6 days and never went on sale, in Goose's record of the fictional market. Your call.");
    for (const i of MOVING_ITEMS) for (let d = 0; d < MOVING_DAYS; d++) expect([i.id, d, historyLine(want(i.id), 9000, d) ?? ""]).not.toEqual([i.id, d, expect.stringMatching(SELLER_WORDS)]);
    // An item that went on sale last season gets the drops line instead; with no record, too.
    const onSale: MovingItem = { ...HOTEL, lastSeason: { soldOutDays: 6, wentOnSale: true } };
    const { lastSeason: _, ...noRecord } = HOTEL;
    for (const m of [onSale, noRecord as MovingItem]) {
      const at = MOVING_ITEMS.indexOf(HOTEL);
      const saved = (MOVING_ITEMS as MovingItem[])[at]!;
      (MOVING_ITEMS as MovingItem[])[at] = m;
      try { expect(historyLine(want(HOTEL.id), 9000, BEAT_DAY)).toMatch(/^From sellers not set aside, its lowest price dropped 2 times/); } finally { (MOVING_ITEMS as MovingItem[])[at] = saved; }
    }
  });

  it("sellout_line_only_for_really_want: a nice-to-have, or the kettle, gets no layer 4 line", () => {
    for (const i of MOVING_ITEMS) expect(historyLine(want(i.id, "nice"), 9000, BEAT_DAY)).toBeNull();
    expect(historyLine(want("kettle"), 6000, BEAT_DAY)).toBeNull();
  });

  it("no_countdown_or_act_now_words: every line is calm and ends with the shopper's call", () => {
    for (const i of MOVING_ITEMS) for (let d = 0; d < MOVING_DAYS; d++) {
      const line = historyLine(want(i.id), 9000, d);
      if (line === null) continue;
      expect([i.id, d, URGENT.test(line)]).toEqual([i.id, d, false]);
      expect(line.endsWith(" Your call.")).toBe(true);
    }
  });

  it("wait_threshold_never_above_max: the watch it names is the want's max, held to today's limit", () => {
    const cat = new Map([...demoCatalogItems()]);
    const events60 = demoPolicy({ categoryLimit: { kitchen: 6000 } }); // events unset: held to the kitchen's $60.00
    const [card] = watchedCards([want(TICKET.id)], cat, events60);
    expect(card!.history).toMatch(/Goose watches for \$60\.00 or less \(your Max, held to your limit\)/);
    const [set] = watchedCards([want(TICKET.id)], cat, setCategoryLimit(events60, "events", 9000, 0));
    expect(set!.history).toMatch(/Goose watches for \$90\.00 or less \(your Max\)/);
    // A max below the limit is the watch: never the limit itself.
    const [own] = watchedCards([want(TICKET.id, "really", 5000)], cat, setCategoryLimit(events60, "events", 9000, 0));
    expect(own!.history).toMatch(/Goose watches for \$50\.00 or less \(your Max\)/);
    expect(watchedCards([want(TICKET.id, "nice")], cat, events60)[0]!.history).toBeNull();
  });
});

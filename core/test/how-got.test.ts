// Track H2: "haggled" or "waited", from the data only (core/src/view/how-got.ts). The kettle in recorded week 1 was
// haggled (Goose's counter-offers reached Reedbank before the take); the Marsh Lights ticket was waited for (its seller's
// own curve fell, with no offer in it). Neither may ever be called the other.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { Tape } from "../src/buyer/recorded.ts";
import { recordedWeek } from "../src/view/week.ts";
import { ENTRY_CATEGORY } from "../src/view/local.ts";
import { sha256Hex } from "../src/sha256.ts";
import { WALLET_AT, walletHome } from "../src/view/wallet.ts";
import { haggleModel } from "../src/view/haggle.ts";
import { recordedMarket, wasLine } from "../src/ask/recorded-market.ts";
import { weekStory } from "../src/view/session.ts";
import { scrollStory } from "../src/view/scroll.ts";
import { GOT, countersTo, fellSentence, gotAndOn, gotLead, gotWhilst, howGooseGotIt, howOverDays } from "../src/view/how-got.ts";
import type { Cents } from "../src/money.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";

const c = (n: number) => n as Cents;
const tape = JSON.parse(readFileSync(new URL("../../docs/fixtures/tape-seed-1.json", import.meta.url), "utf8")) as Tape;

describe("howGooseGotIt", () => {
  it("is haggled only with a counter-offer, waited only without one, and neither when the price didn't fall", () => {
    expect(howGooseGotIt({ firstAsk: c(5800), price: c(4773), counters: 2 })).toBe("haggled");
    expect(howGooseGotIt({ firstAsk: c(11200), price: c(8400), counters: 0 })).toBe("waited");
    expect(howGooseGotIt({ firstAsk: c(5800), price: c(5800), counters: 3 })).toBeNull();
    expect(howGooseGotIt({ firstAsk: c(5800), price: c(6000), counters: 0 })).toBeNull();
  });

  it("counts only counter-offers that reached that seller before the take (a replaced proposal doesn't)", () => {
    const rows = [
      { seq: 1, actor: "buyer", action: "counter", sellerId: "a", price: "40.00" },
      { seq: 2, actor: "buyer", action: "propose-counter", sellerId: "a", price: "45.00" },
      { seq: 3, actor: "code", action: "counter", sellerId: "a", price: "44.00" },
      { seq: 4, actor: "buyer", action: "counter", sellerId: "b", price: "41.00" },
      { seq: 6, actor: "buyer", action: "counter", sellerId: "a", price: "46.00" },
    ] as unknown as LedgerEvent[];
    expect(countersTo(rows, "a", 5)).toBe(2);
    expect(countersTo(rows, "b", 5)).toBe(1);
    expect(countersTo(rows, "c", 5)).toBe(0);
  });

  it("reads a recorded curve from the day it first listed", () => {
    expect(howOverDays([null, 11200, 9800, 8400], 3)).toBe("waited");
    expect(howOverDays([null, 8400, 8400], 2)).toBeNull();
    expect(howOverDays([null, null], 1)).toBeNull();
  });

  it("never mixes the two verbs' words", () => {
    expect(Object.values(GOT.haggled).join(" ")).not.toMatch(/wait/i);
    expect(Object.values(GOT.waited).join(" ")).not.toMatch(/haggl/i);
    expect(fellSentence("haggled", "$1.00")).not.toMatch(/wait|not haggling/i);
    expect(fellSentence("waited", "$1.00")).toContain("while Goose waited");
    expect([gotLead(null), gotWhilst(null), gotAndOn(null)]).toEqual([null, "", "On"]);
  });
});

describe("the recorded deals", () => {
  it("the kettle (recorded week 1) was haggled, on the wallet's card and the haggle page", async () => {
    const week = await recordedWeek(tape, sha256Hex, () => WALLET_AT, ENTRY_CATEGORY);
    const deal = walletHome(week, WALLET_AT).deal!;
    expect(`${deal.lead} $${deal.below} below their $${deal.opening} ask`).toBe("Goose haggled it $10.27 below their $58.00 ask");
    expect(haggleModel(week.events).deal?.how).toBe("haggled");
  });

  it("the Marsh Lights ticket was waited for, on the Desk's card, the week story and the landing", () => {
    const r = recordedMarket("A Marsh Lights ticket under $90")!;
    const lines = Object.values(r.was).map((w) => w.line);
    expect(lines).toContain("The same seat on day 1. Goose waited.");
    for (const l of lines) expect(l).toMatch(/\. Goose waited\.$/);
    expect(wasLine("seat", 1, "haggled")).toBe("The same seat on day 1. Goose haggled.");
    expect(weekStory().summary).toContain(", while Goose waited.");
    const s = scrollStory();
    expect(gotAndOn(howOverDays(s.deal.byDay, s.day - 1))).toBe("Goose waited, and on");
  });
});

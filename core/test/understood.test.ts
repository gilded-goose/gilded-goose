import { describe, expect, it } from "vitest";
import { understand } from "../src/ask/understood.ts";
import { marketCategory } from "../src/ask/fictional-market.ts";
import { recordedMarket } from "../src/ask/recorded-market.ts";
import { demoPolicy } from "../src/scenario.ts";
import { PRICE_NOT_LIMIT, PRICE_WHY, priceNotLimit } from "../src/view/desk.ts";

const read = (w: string) => understand(w, demoPolicy());

describe("Here's what I understood (Desk-A, Joshua Oct 30): the card code reads from the words before Goose shops", () => {
  it("names a recorded item by its own name, with the limit its cart is held to", () => {
    const u = read("A Marsh Lights ticket under $90");
    expect(u.item).toBe("A ticket to The Marsh Lights, Saturday");
    expect([u.limit, u.category, u.because]).toEqual(["90.00", "Events", "Set for this demo, because you asked for a ticket."]);
  });

  it("shows the limit the cart gets: the same words the server places the market by, recorded or made up", () => {
    for (const w of ["A Gullwing Air seat", "A night at Mossbell Inn", "A Marsh Lights ticket", "Running shoes", "A night by the sea"]) {
      const rec = recordedMarket(w);
      expect(read(w).why).toBe(marketCategory(rec ? rec.market.words : w, [], demoPolicy()).why);
    }
  });

  it("holds a recorded Gullwing seat to travel's limit, its recorded category, not the looser 'other'", () => {
    expect([read("A Gullwing Air seat").category, read("A Gullwing Air seat").limit]).toEqual(["Travel", "100.00"]);
  });

  it("shows a price back as hers, never as the limit", () => {
    const u = read("I want a red dress in size M under 50 dollars");
    expect(u.said).toBe("under 50 dollars");
    expect(u.limit).toBe("70.00");
    expect(u.item).toBe("Dress");
  });

  it("says her price back with the claim verbatim, and the card's limit is never her number", () => {
    const u = read("I want a red dress in size M under 50 dollars");
    expect(priceNotLimit(u.said!)).toBe("You said “under 50 dollars”. Your limit is set only in Limits in code.");
    expect(PRICE_WHY).toBe(`${PRICE_NOT_LIMIT} Limits are set only in Limits in code, so no seller's words can set one either.`);
    expect(PRICE_NOT_LIMIT).toBe("A price in your words isn't a limit.");
  });

  it("reads one color and one size, and each one off hands back the words without it", () => {
    const u = read("I want a red dress in size M under 50 dollars");
    expect(u.details).toEqual([
      { kind: "color", label: "Red", without: "I want a dress in size M under 50 dollars" },
      { kind: "size", label: "Size M", without: "I want a red dress under 50 dollars" },
    ]);
  });

  it("leaves a negated color, a color pair and a non-clothing 'large' in the item's words", () => {
    expect(read("a hoodie, not black").details).toEqual([]);
    expect(read("a black and white jacket, size XL").details.map((d) => d.label)).toEqual(["Size XL"]);
    expect(read("a black and white jacket, size XL").item).toBe("Black and white jacket");
    expect(read("a large kettle").details).toEqual([]);
    expect(read("a large hoodie").details.map((d) => d.label)).toEqual(["Size Large"]);
  });
});

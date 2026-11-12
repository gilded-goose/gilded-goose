// A limit of $0 or less in the ask box was ignored: the cap came back null and the run was held to the default, with no
// word to the shopper (Nov 11 audit). Now it is refused in plain words before any card, market or model call.
import { describe, expect, it } from "vitest";
import { NO_LIMIT } from "../src/ask/copy.ts";
import { notAnAsk } from "../src/ask/is-ask.ts";
import { refusedLimit, spokenCap } from "../src/ask/cap.ts";

describe("a limit of $0 or less is said, not ignored", () => {
  for (const w of ["a kettle under $0", "a kettle under 0 dollars", "a kettle under $0.00", "a kettle under -5", "a kettle under -$5", "a kettle under $-5", "headphones, nothing over $0", "a kettle $0 max", "a kettle, max 0", "a kettle under ٠"]) {
    it(`ask_limit_refused: "${w}" says NO_LIMIT, and names no cap`, () => {
      expect(notAnAsk(w)).toBe(NO_LIMIT);
      expect(refusedLimit(w)).toBe(true);
      expect(spokenCap(w)).toBeNull();
    });
  }
  for (const w of ["a kettle under $60", "a kettle under 60 dollars", "a kettle under $0.99", "a kettle", "a kettle over $0", "a jacket for under 0 degrees", "a kettle not under 0", "a kettle under 10"]) {
    it(`ask_limit_normal: "${w}" is not refused`, () => {
      expect(refusedLimit(w)).toBe(false);
      expect(notAnAsk(w)).toBeNull();
    });
  }
  it("ask_limit_line_is_plain: it says what holds and what the shopper can do, and claims nothing beyond the code", () => {
    expect(NO_LIMIT).toBe("Goose can't hold a cart to a limit of $0 or less. Name a price above $0, or leave the limit out: your own limit in code applies.");
  });
});

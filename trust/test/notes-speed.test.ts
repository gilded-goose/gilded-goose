// A haggle reads about 12,000 patterns and 0.4% of them match. `matchAll` copies its pattern on every call, so the copying
// was 70% of a seeded sweep: 300 markets took 6 s alone and hit the 30 s limit under load (patience.test.ts, reader.test.ts).
// Counted, not timed: a clock here would fail on a busy machine and pass on a slow reader.
import { afterEach, describe, expect, it, vi } from "vitest";
import { matchesOf } from "../src/asks.ts";
import { textEvidence } from "../src/notes.ts";

const FAIR = "Lightly used, works great. Ships Tuesday from Portland, and I can include the box.";
const SCAM = "Pay with a gift card and send the code to my email first.";
const cash = "Cash at pickup. I'm home after five.";

describe("reading a note doesn't copy every pattern", () => {
  afterEach(() => { vi.restoreAllMocks(); });
  it("a fair note copies no rule's pattern", () => {
    const spy = vi.spyOn(String.prototype, "matchAll");
    expect(textEvidence(FAIR, "note")).toEqual([]);
    expect(spy.mock.calls.length).toBe(0);
  });
  it("a note a rule does read still costs only the patterns that matched", () => {
    const spy = vi.spyOn(String.prototype, "matchAll");
    expect(textEvidence(SCAM, "note").length).toBeGreaterThan(0);
    expect(spy.mock.calls.length).toBeLessThan(100);
  });
  it("reads the same every time: the shared patterns keep no place between reads", () => {
    for (const note of [SCAM, cash, FAIR]) {
      const first = textEvidence(note, "note");
      expect(textEvidence(note, "note")).toEqual(first);
      expect(textEvidence(`${note} ${note}`, "note").map((e) => e.rule)).toEqual(first.map((e) => e.rule));
    }
  });
});

describe("matchesOf refuses a pattern matchAll would refuse (Q, Nov 5)", () => {
  it("a pattern without /g throws on a hit, a miss, empty text and /y alone, never a quiet empty answer", () => {
    expect(() => matchesOf("pay me on venmo", /venmo/i)).toThrow(TypeError);
    expect(() => matchesOf("lightly used", /venmo/i)).toThrow(TypeError);
    expect(() => [..."lightly used".matchAll(/venmo/i as RegExp)]).toThrow(TypeError); // control: the behaviour kept
    expect(() => matchesOf("", /venmo/i)).toThrow(TypeError); // empty text: the flag is checked before the text is read
    expect(() => matchesOf("pay me on venmo", /venmo/y)).toThrow(TypeError); // sticky alone isn't global
    expect(matchesOf("pay me on venmo, venmo", /venmo/gi).map((m) => m.index)).toEqual([10, 17]);
  });
});

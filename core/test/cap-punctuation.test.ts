// A cap cut from her words never leaves its punctuation behind (Track T, Nov 5): "…on Saturday, under $90." titled the
// run "…on Saturday," and named the item "…Saturday,."; "a kettle, under $40!" became "A kettle, !". The voice take
// films that heading. The whole kind: every separator before a cap × every end mark after it × each cap form.
import { describe, expect, it } from "vitest";
import { withoutCaps } from "../src/ask/cap.ts";
import { understand } from "../src/ask/understood.ts";
import { demoPolicy } from "../src/scenario.ts";
import { sentence } from "../src/view/desk.ts";

const LEADS = ["Find me one ticket to The Marsh Lights on Saturday", "a kettle", "noise cancelling headphones"];
const SEPS = [" ", ", ", "; ", ": ", " - "];
const CAPS = ["under $90", "under 90 dollars", "max $60", "no more than $40"];
const ENDS = ["", ".", "!", "?", "...", " ."];
const DEBRIS = /[,;:–—-]\s*[.!?]*$|\s[.!?]|[,;:][.!?]/;
const cases = LEADS.flatMap((l) => SEPS.flatMap((s) => CAPS.flatMap((c) => ENDS.map((e) => `${l}${s}${c}${e}`))));

describe("a cap cut from the end of her words leaves no stray punctuation", () => {
  it("the run's title (what the heading shows) ends clean", () => {
    const bad = cases.flatMap((w) => { const t = sentence(understand(w, demoPolicy()).title).replace(/\.$/, ""); return DEBRIS.test(t) ? [`${w} → ${t}`] : []; });
    expect(bad).toEqual([]);
  });
  it("the item's name (what the ledger and PayPal carry) ends clean", () => {
    const bad = cases.flatMap((w) => { const n = withoutCaps(w); return DEBRIS.test(n) ? [`${w} → ${n}`] : []; });
    expect(bad).toEqual([]);
  });
  it("the voice take's line, typed with digits, heads the run as her words", () => {
    expect(sentence(understand("Find me one ticket to The Marsh Lights on Saturday, under $90.", demoPolicy()).title).replace(/\.$/, ""))
      .toBe("Find me one ticket to The Marsh Lights on Saturday");
  });
  it("her own end mark stays when it isn't a period, and words in the middle are untouched", () => {
    expect(understand("a kettle, under $40!", demoPolicy()).title).toBe("a kettle!");
    expect(understand("shoes, max $60?", demoPolicy()).title).toBe("shoes?");
    expect(understand("under $90 a ticket to The Marsh Lights.", demoPolicy()).title).toBe("a ticket to The Marsh Lights.");
    expect(withoutCaps("Noise cancelling headphones, under $500")).toBe("Noise cancelling headphones");
  });
});

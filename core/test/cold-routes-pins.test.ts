// Each room's own largest paint (Lead-12 and R, Fri Nov 6): cold-routes times every room the tour opens, and #challenge, by
// the largest element in the room's own section, and holds each to what was measured on a local seat of 570df989.
// These pins only tighten: lower one when a room gets faster (re-measure with MEASURE_PINS=1), never raise one.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOUR } from "../src/view/tour.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const tool = read("scripts/cold-routes.ts");

// The measured ceiling, ms: the higher of two RUNS=5 medians under the heavy lock (Fri Nov 6, 15:10Z), plus 5% (the most two
// passes differed by), rounded up to 50, so a quiet re-run passes and a slower room doesn't. #watcher, #ask, #talk and the
// list were re-measured the same way at ~20:30Z, after the landing hashes took the landing's first paint (1600 → 650, 650,
// 600) and the list painted early (2300 → 650).
// #challenge and #wants came down on R's phone table of 639afb1e (Fri Nov 6), once their reads started in the head and the
// cover drew the room (#wants 3300 → 1000). #challenge's phone is 3400 → 650 once cold-routes credits the cover against where
// the room lands (R's c4a62ca4): medians 494 and 547, worst of five 570, pinned at R's table's 650 (cold-routes.ts).
const CEILING: Record<string, { desk: number; phone: number }> = {
  "/?desk=1#challenge": { desk: 500, phone: 650 },
  "/?desk=1#after": { desk: 200, phone: 2250 },
  "/?desk=1#wants": { desk: 400, phone: 1000 },
  "/?desk=1#settings": { desk: 400, phone: 3100 },
  "/?desk=1#watcher": { desk: 150, phone: 650 },
  "/?wallet=1#approve": { desk: 200, phone: 2900 },
  "/?desk=1#ask": { desk: 150, phone: 650 },
  "/?desk=1#talk": { desk: 100, phone: 600 },
  "/?desk=haggle": { desk: 550, phone: 2400 },
  "/?desk=list": { desk: 100, phone: 650 },
  "/?desk=ledger": { desk: 250, phone: 3100 },
  "/?desk=proof": { desk: 50, phone: 650 },
};

const pins = (src: string) => {
  const body = /const ROOM_LCP_PINS: Record<string, \{ desk: number; phone: number \}> = \{([\s\S]*?)\n\};/.exec(src)?.[1] ?? "";
  return Object.fromEntries([...body.matchAll(/"([^"]+)": \{ desk: (\d+), phone: (\d+) \}/g)].map((m) => [m[1]!, { desk: Number(m[2]), phone: Number(m[3]) }]));
};

describe("cold-routes: each room's own largest paint", () => {
  it("room_lcp_pins_only_tighten: every room the tour opens has a pin at each width, none over today's measured ceiling", () => {
    const p = pins(tool);
    const rooms = [...new Set(TOUR.filter((s) => s.href).map((s) => `/${s.href}`))];
    expect(rooms).toContain("/?desk=1#challenge");
    for (const r of rooms) expect(p[r], `no pin for ${r}`).toBeDefined();
    for (const [r, c] of Object.entries(CEILING)) expect([r, p[r]!.desk <= c.desk, p[r]!.phone <= c.phone]).toEqual([r, true, true]);
    // Control: one pin raised by a millisecond reads over its ceiling.
    const raised = pins(tool.replace(/("\/\?desk=1#challenge": \{ desk: )\d+/, (_, a: string) => `${a}${CEILING["/?desk=1#challenge"]!.desk + 1}`));
    expect(raised["/?desk=1#challenge"]!.desk <= CEILING["/?desk=1#challenge"]!.desk).toBe(false);
  });

  it("a row over its pin, or a room never seen, fails; the phone row says it is a model", () => {
    for (const bit of ["else if (!(roomLcp <= pin)) errs.add(", "if (!(roomLcp > 0)) errs.add(", "if (over || errs.size) bad++;",
      "a phone MODEL on this Mac", "ROOM_SUBJECT[`/${s.href}`]",
      // The cover counts only in the box the room's element has landed in, read now, not its first sighting (F, Nov 6: the
      // Challenge renders under the cover at y 666 before the lift to y 107).
      "c.text === text && near(c.box, landed)", "const r = e.getBoundingClientRect(), landed: Box",
      // A first paint only stands in for the room when React replaced it (same words, same box): a node still on the page is the room's own.
      "filter(([n]) => !n.isConnected)"]) expect(tool, bit).toContain(bit);
    expect(tool, "the cover is never matched against a room box first seen under it").not.toContain("near(c.box, best.box");
    // GET only: it reads pages and never presses anything.
    expect(tool).not.toMatch(/\.click\(|\.fill\(|\.press\(|method: "POST"/);
  });
});

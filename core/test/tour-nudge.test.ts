// The tour pill's step on a wide screen (push 7, Fri Nov 6): with the landing's words under every place the pill can take,
// the step down pushed the Watcher's Ask box 98 px up, 21 px under the bar (ci-local's tour-pill-wide, 1440 stop 02).
// The step now keeps the stop's subject whole: down only until its top meets the bar, then up only until its bottom meets
// the pill. tour-pill.ts (TOUR_ONLY=wide, in ci-local) measures it in a browser; this pins the two bounds in the source.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOUR } from "../src/view/tour.ts";

const pill = readFileSync(new URL("../../web/src/tour/TourPill.tsx", import.meta.url), "utf8");

describe("the tour pill's step keeps the stop's subject whole", () => {
  it("steps down no further than the subject's top meeting the bar", () => {
    expect(pill).toContain("const clearOfBar = subject.length ? Math.floor(Math.min(...subject.map((r) => r.top)) - top) : Infinity;");
    expect(pill).toContain("for (let by = 4; by <= Math.min(NUDGE_MAX, room, clearOfBar); by += 2) {");
  });
  it("then steps up no further than the subject's bottom meeting the pill, nor past the page's top", () => {
    expect(pill).toContain("const clearOfPill = subject.length ? Math.floor(pillTop - Math.max(...subject.map((r) => r.bottom))) : 0;");
    expect(pill).toContain("for (let by = 4; by <= Math.min(NUDGE_MAX, Math.floor(scrollY), clearOfPill); by += 2) {");
    expect(pill).toContain('scrollBy({ top: -by, behavior: "instant" })');
    // Up is tried only after down: the step down is the older, measured landing at every other stop.
    expect(pill.indexOf("clearOfPill")).toBeGreaterThan(pill.indexOf("clearOfBar"));
  });
  it("reads the subject the walk judges: every stop names one for a wide screen", () => {
    expect(pill).toContain("(stop?.subject.wide ?? [])");
    for (const s of TOUR) expect(s.subject.wide.length, s.id).toBeGreaterThan(0);
  });
  it("is walked in a browser at 1440 by ci-local", () => {
    expect(readFileSync(new URL("../../scripts/ci-local.sh", import.meta.url), "utf8")).toContain("TOUR_ONLY=wide node scripts/tour-pill.ts");
  });
});

// AG Studio's own pivots (Round 6b's AG seat, Nov 6): they draw in the page's face, their frames fit the rows they open
// with, the phone has the trick type pivot too, and each says it is Studio's own. The frame-fitting runs in a browser
// (Studio.tsx `useFit`); what it stands on is pure and pinned here: which frame is which, and where the phone's goes.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COLUMNS, GUTTER_PX, PHONE_PIVOT_TRACKS, TRACK_PX, at, fitColumn, layoutFor, placeAt, withThreat } from "../../web/src/studio/layout.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("placeAt: a built-in widget's frame, found by where it stands", () => {
  const layout = { left: at(0, 10, 14, 20), right: at(14, 10, 10, 20), wide: at(0, 30, 24, 12) };
  const col = 1120 / COLUMNS;
  it("reads the frame's own edge and its card's, half a gutter in, as the same frame", () => {
    expect(placeAt(layout, 10 * TRACK_PX, 0, col)).toBe("left");
    expect(placeAt(layout, 10 * TRACK_PX + GUTTER_PX / 2, GUTTER_PX / 2, col)).toBe("left");
    expect(placeAt(layout, 10 * TRACK_PX + GUTTER_PX / 2, 14 * col + GUTTER_PX / 2, col)).toBe("right");
    expect(placeAt(layout, 30 * TRACK_PX, 0, col)).toBe("wide");
  });
  it("names no frame where none starts, so nothing is fitted to the wrong card", () => {
    expect(placeAt(layout, 11 * TRACK_PX, 0, col)).toBeNull();
    expect(placeAt(layout, 10 * TRACK_PX, 7 * col, col)).toBeNull();
    expect(placeAt({ a: at(0, 5, 24, 4), b: at(0, 5, 24, 4) }, 5 * TRACK_PX, 0, col)).toBeNull();
  });
});

describe("the phone's pivot", () => {
  for (const session of [false, true]) {
    it(`sits under the rules, in the one clean column, with the six cards in their order under it (session ${session})`, () => {
      const six = layoutFor(true, session);
      const l = withThreat(six, true);
      expect(l["threat-pivot"]).toEqual(at(0, l["threat-rules"]!.yTrack + l["threat-rules"]!.ySpan, 24, PHONE_PIVOT_TRACKS));
      expect(l["threat-tries"]!.yTrack).toBe(l["threat-pivot"]!.yTrack + PHONE_PIVOT_TRACKS);
      expect(l["threat-days"]).toBeUndefined();
      // fitColumn takes it: every frame full width, so a measured pivot restacks the column under it.
      const need = Object.fromEntries(Object.keys(l).map((k) => [k, l[k]!.ySpan]));
      const fitted = fitColumn(l, { ...need, "threat-pivot": 31 })!;
      expect(fitted["threat-tries"]!.yTrack).toBe(l["threat-pivot"]!.yTrack + 31);
      const order = (x: Record<string, { yTrack: number }>) => Object.keys(x).sort((a, b) => x[a]!.yTrack - x[b]!.yTrack);
      expect(order(fitted)).toEqual(order(l));
    });
  }
  it("is in the phone's view and moves with the switch; the by-day pivot stays the desktop's", () => {
    const index = read("web/src/studio/widgets/index.tsx");
    expect(index).toContain("...THREAT_WIDGETS, ...threatPivots(source, phone) }");
    expect(index).not.toContain("phone ? {} : threatPivots");
    const pivots = read("web/src/studio/widgets/threat.tsx");
    expect(pivots).toContain("return phone ? pivot : {");
    // The phone's counts the tries alone (its rows are the verdicts), so it fits a 360 px card; Studio's pivot `theme` takes
    // only rowHeight and borders, so no grid param stands in for that.
    expect(pivots).toContain('rows: [{ id: f("type") }, { id: f("verdict") }], columns: [], values: [tries] }');
    expect(pivots).not.toMatch(/theme: [A-Z_]+ \}/);
    const studio = read("web/src/studio/Studio.tsx");
    expect(studio).toContain("...threatPivots(board.source, phone)");
    expect(studio).not.toMatch(/if \(!a \|\| phone\) return;/);
  });
});

describe("the pivots look like Goose and say what they are", () => {
  it("draw their cells in the page's face: Studio's canvas face, not AG's Source Sans 3, which the site never loads", () => {
    expect(read("web/src/studio/theme.ts")).toContain('studioCanvasFontFamily: "var(--lx-face)",');
  });
  it("fit their frames to the rows they hold, view mode and edit mode alike", () => {
    const studio = read("web/src/studio/Studio.tsx");
    expect(studio).toContain('const rows = grid.querySelector<HTMLElement>(".ag-grid-scrolling-container");');
    // AG Grid 36 draws the header inside the pinned top rows: counting both left 33 px of bare card (Track F's first build),
    // so each band of the viewport is counted once, as it stands.
    expect(studio).toContain("for (const band of area.children) if (!band.contains(rows)) held += (band as HTMLElement).offsetHeight;");
    expect(studio).not.toMatch(/\.ag-header"\)/);
    expect(studio.match(/frameNeeds\(page\.widgetLayout as Record<string, Place>/g)).toHaveLength(2);
  });
  it("say under each title that they are AG Studio's own pivot", () => {
    const pivots = read("web/src/studio/widgets/threat.tsx");
    // The desktop's two and the phone's own (trick type, then verdict), each with its line.
    expect(pivots.match(/type: "pivot-grid"/g)).toHaveLength(3);
    expect(pivots.match(/subtitle: own\(PIVOT_WORDS\.by\w+\)/g)).toHaveLength(3);
  });
  it("wrap their titles and lines instead of cutting them to an ellipsis", () => {
    expect(read("web/src/studio/studio.css")).toContain(".st-studio .ag-studio-layout-widget-label { white-space: normal; text-overflow: clip; text-wrap: pretty; }");
  });
});

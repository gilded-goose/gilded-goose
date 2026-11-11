// On the flip's keyboard walk, Tab on Behind the scenes landed on 12 stops of zero size, one per card, and went no further: nothing in a
// card could be reached without knowing to press Enter on a stop no one can see. `scripts/plain-tabs-walk.ts` walks the fix on a Studio
// build; this holds what a walk can't see from the outside: which stops it touches, and when.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOUR } from "../src/view/tour.ts";

const read = (p: string) => readFileSync(join(import.meta.dirname, "..", "..", p), "utf8");

describe("Tab in the dashboard", () => {
  const src = read("web/src/studio/plain-tabs.ts");
  it("holds only the card's own stops, never a grid's tab guards, which sit deeper and which the grid needs", () => {
    const stops = /const STOPS = "([^"]+)"/.exec(src)?.[1] ?? "";
    expect(stops.split(", ").length).toBe(2);
    for (const s of stops.split(", ")) expect(s.startsWith(".ag-studio-layout-widget > ")).toBe(true);
  });
  it("is view mode's alone, and edit mode gets AG's own stops back", () => {
    expect(read("web/src/studio/Studio.tsx")).toContain('mode === "view" && root ? plainTabs(root) : undefined');
    expect(src).toMatch(/return \(\) => \{[\s\S]*el\.setAttribute\("tabindex", el\.getAttribute\(WAS\)!\)/);
  });
  it("leaves only AG's stock grids early: a grid in one of our cards keeps its own say", () => {
    expect(src).toContain('grid.closest(".st-card")) return;');
  });
});

describe("the tour's Behind the scenes stop", () => {
  it("names a subject on both the page live serves and the Community ledger", () => {
    const stop = TOUR.find((s) => s.id === "ledger")!;
    for (const side of [stop.subject.wide, stop.subject.phone]) expect(side.join()).toContain("#st-h");
    expect(stop.subject.wide.join()).toContain(".lx-lead");
    expect(stop.subject.phone.join()).toContain("#sl-h");
  });
});

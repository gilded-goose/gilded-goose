// Back on the Desk (Round 5's shopper seat, B1): how history moves when the page changes place. The real presses are in
// scripts/desk-walk.ts; this holds the rule, including the case a button walks back instead of stacking an entry.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { step, type Entry } from "../../web/src/desk/desk-step.ts";

const at = (dk: Entry["dk"], ...below: Entry["below"]): Entry => ({ dk, below });

describe("the Desk's history", () => {
  it("does nothing when history is already there: Back got here first", () => {
    expect(step(at("run", null), "run")).toBeNull();
    expect(step(at(null), null)).toBeNull();
  });
  it("gives a run, a room and a sheet each an entry, so Back has somewhere on the site to go", () => {
    expect(step(at(null), "run")).toEqual({ push: at("run", null) });
    expect(step(at(null), "wants")).toEqual({ push: at("wants", null) });
    expect(step(at("run", null), "sheet")).toEqual({ push: at("sheet", null, "run") });
    expect(step(at("run", null), "week")).toEqual({ push: at("week", null, "run") });
  });
  it("walks back to an entry already there, so no Back lands on a press that does nothing", () => {
    expect(step(at("sheet", null, "run"), "run")).toEqual({ go: -1 });
    expect(step(at("run", null), null)).toEqual({ go: -1 });
    expect(step(at("week", null, "run"), null)).toEqual({ go: -2 });
    expect(step(at("week", null, "run"), "run")).toEqual({ go: -1 });
  });
  it("moves between rooms on one entry: Back from any room goes to where the rooms began", () => {
    expect(step(at("wants", null), "week")).toEqual({ replace: at("week", null) });
    expect(step(at("wants", null, "run"), "week")).toEqual({ replace: at("week", null, "run") });
  });
  it("from a room she arrived at by its address: the landing takes its place, and a run stacks on it", () => {
    expect(step(at("wants"), null)).toEqual({ replace: at(null) });
    expect(step(at("wants"), "run")).toEqual({ push: at("run", "wants") });
  });
});

describe("Back from PayPal", () => {
  // The browser can restore a page exactly as she left it, frozen on "Opening PayPal…", so every press that leaves for PayPal
  // clears its busy state on a restored page. A playwright browser doesn't restore pages this way, so the rule is held here.
  it.each(["desk/Desk.tsx", "App.tsx", "StoreSync.tsx", "Wallet.tsx"])("%s turns its pay press back on", (f) => {
    const src = readFileSync(new URL(`../../web/src/${f}`, import.meta.url), "utf8");
    expect(src).toMatch(/location\.assign\((?:r\.data|body)\.approveUrl\)/);
    expect(src).toMatch(/useBackFromPayPal\(\(\) => setBusy\(/);
  });
});


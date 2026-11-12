// Studio's page draws a shell and then replaces it (web/src/studio/Shell.tsx). CI builds with no key, so CI's walks of these addresses meet
// the Community ledger and never this handover: Track T found the tour's pill gone on live at stop 10 (Nov 5), and keys-landed's handover
// block then found an open menu shut, focus dropped to the page's body, a row with no cell, a raw <select> and cards cut off in edit mode.
// The walks that prove these need a licensed page (`HANDOVER=only node scripts/keys-landed.ts <url>`); these pins hold the code in between.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

describe("Studio's handover and page, which a keyless build never draws", () => {
  const shell = read("web/src/studio/Shell.tsx");
  it("waits for an open sheet and an open menu, whose panel is portalled out of the shell", () => {
    expect(shell).toContain(`.st-shell dialog[open], .st-page .gm-btn[aria-expanded='true']`);
  });
  it("moves focus to the same control, or to the page's main, never to the body", () => {
    expect(shell).toMatch(/e\.textContent === was\.words/);
    expect(shell).toMatch(/\[data-studio-layer\] #main/);
  });
  it("gives the table's visit-head rows a cell, since a row needs one", () => {
    expect(read("web/src/studio/widgets/index.tsx")).toContain(`className="st-visit" role="gridcell"`);
  });
  it("leaves no raw browser control in the rows' search", () => {
    expect(read("web/src/studio/studio.css")).toMatch(/\.st-find select \{[^}]*appearance: none/);
  });
  it("grows a row in edit mode when the canvas narrows, and only grows, so a visitor's own sizes stand", () => {
    // Each frame's need is its measured height since the AG prize's pivots (frameNeeds); Infinity still means only grows.
    expect(read("web/src/studio/Studio.tsx")).toContain("fitRows(page.widgetLayout, frameNeeds(page.widgetLayout as Record<string, Place>, false), Infinity)");
  });
  it("keeps the walk that proves all of this", () => {
    const keys = read("scripts/keys-landed.ts");
    for (const word of ["the tour's pill outlives the handover", "a menu left open stays open", "focus stays on the same control", "the scroll holds", "axe on Studio itself", "no raw browser control on Studio", "no card cut off"]) expect(keys).toContain(word);
  });
});

// S2-cine slice 5 (the DD, Sat Oct 31): the landing's section heads (.ds-h2: the steps' and the band's) are --t-h1;
// the moment's head (.ds-moment-h) stays --t-h2 at every width, beside the 104 px price. The moment's h2 carries both
// classes, so its own rule must win on specificity, not on source order.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url).pathname;
const css = readFileSync(join(root, "web/src/desk/story/story.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const moment = readFileSync(join(root, "web/src/desk/story/Moment.tsx"), "utf8");

/** Every font-size set by a rule whose selector is exactly `selector`, in source order, media blocks included. */
export function sizes(sheet: string, selector: string): string[] {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...sheet.matchAll(new RegExp(`(?:^|[{}\\n])\\s*${esc}\\s*\\{([^}]*)\\}`, "g"))].flatMap((m) =>
    [...m[1]!.matchAll(/font-size:\s*([^;}]+)/g)].map((d) => d[1]!.trim()),
  );
}

describe("the landing's heads keep their steps", () => {
  it("reads a size from a sample (the guard can fail)", () => {
    expect(sizes(".ds-h2 { margin: 0; font-size: var(--t-h2); }\n.ds .ds-moment-h { font-size: 9px; }", ".ds-h2")).toEqual(["var(--t-h2)"]);
    expect(sizes(".ds-h2x { font-size: 1px; }", ".ds-h2")).toEqual([]);
  });
  it(".ds-h2 is --t-h1, and --t-h2 at <=720 (the hero steps to --t-h1 there: the heads stay under it)", () => {
    // The rules live in hero.css: the first paint draws the Challenge's head, and it has only that sheet (Joshua, Nov 4, 3d).
    const hero = readFileSync(join(root, "web/src/desk/story/hero.css"), "utf8");
    expect(sizes(hero, ".ds-h2")).toEqual(["var(--t-h1)", "var(--t-h2)", "var(--t-sec)"]);
    expect(hero).toMatch(/@media \(max-width: 720px\) \{ \.ds-h2 \{ font-size: var\(--t-h2\); \} \}/);
    expect(sizes(css, ".ds .ds-h2")).toEqual([]);
    expect(sizes(hero, ".dk-hero h1")).toEqual(["var(--t-hero)", "var(--t-h1)", "min(var(--t-h2), 7.8vw)"]); // if the hero's phone step moves, revisit
  });
  it("the close's question keeps --t-payoff: .ds-h2's rules are in the sheet that loads first (same specificity)", () => {
    expect(css).toContain(".ds-close-h {");
    expect(sizes(css, ".ds-h2")).toEqual([]);
    expect(readFileSync(join(root, "web/src/desk/story/index.tsx"), "utf8")).toContain(`import "./hero.css"`);
  });
  it("the moment's head is --t-h2 at every width, by a rule that outranks .ds-h2", () => {
    expect(moment).toMatch(/<h2 id="ds-moment-h" className="ds-h2 ds-moment-h">/);
    expect(sizes(css, ".ds .ds-moment-h")).toEqual(["var(--t-h2)"]);
    expect(sizes(css, ".ds-moment-h")).toEqual([]); // a one-class rule would tie .ds-h2 and lean on source order
  });
});

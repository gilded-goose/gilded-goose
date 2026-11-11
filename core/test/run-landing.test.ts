// Round 6b, the design review's B1 (Track P, Fri Nov 6): on a phone the run landed with TixQuack's gift-card note cut by the bar
// and Goose's caption pill over what was left. Rule for any landed card at phone width: the landing is a clean edge (no block split
// by the bar), the whole card is in the frame, and the caption pill never sits over the landed run. scripts/run-landing.ts reads it
// line by line in Chromium and WebKit at 390 by 844 and 390 by 667 on a seat; these pin the code it found right.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const code = (p: string) => read(p).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

describe("the run lands clean on a phone", () => {
  it("lands on the highest block edge from which the whole card fits, and never leaves the page where the run's scrolls left it", () => {
    const k = code("web/src/desk/keep-approve.ts");
    expect(k).not.toContain("if (foot <= innerHeight) return null;"); // the old guard: Approve in view meant no landing at all
    expect(k).toContain('".dk[data-app] .dk-live-head", ".dk[data-app] .dk-live-grid > .dk-feed"');
    expect(k).toContain('".dk[data-app] .dk-live-grid > .dk-feed > .dk-fr:not(:first-child)"');
    expect(k).toContain("const clean = edges.find((y) => y >= end && y < top) ?? top;");
    // A page that ends short of the landing (what follows the card is its own chunk) is landed again once it has room.
    expect(k).toContain("if (y <= document.documentElement.scrollHeight - innerHeight) return true;");
    expect(k).toContain("if (hers()) return stop();");
    const desk = code("web/src/desk/Desk.tsx");
    expect(desk).toContain('landDeal(still() ? "auto" : "smooth", () => hersRun.current)');
    expect(desk).toContain('<div className="dk-live-grid" data-landed={done || undefined}>');
  });

  it("the caption pill steps aside over a landed run, read when a line starts, on scroll and when a run lands", () => {
    const c = code("web/src/voice/captions.ts");
    expect(c).toContain('document.querySelectorAll("[data-landed]")');
    expect(c).toContain('bar.toggleAttribute("data-aside", over);');
    expect(c).toContain('addEventListener("scroll", clearSoon, { passive: true });');
    expect(c).toContain('attributeFilter: ["data-landed"]');
    expect(c).toMatch(/requestAnimationFrame\(\(\) => bar\?\.classList\.add\("gv-in"\)\);\n\s*\}\n\s*clear\(\);/);
    expect(read("web/src/voice/captions.css")).toContain(".gv-cap[data-aside] { visibility: hidden; }");
  });
});

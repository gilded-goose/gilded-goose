// A tap on a first paint counts once the page is live (web/src/held-tap.ts; Lead-11, the dead "Watch the week"). scripts/desk-walk.ts
// holds it on a slow line in a real browser. These hold what must never change: the list only reaches what's cheap and undoable.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const src = read("web/src/held-tap.ts");
const holds = src.match(/const HOLDS = "([^"]+)"/)![1]!;

describe("a tap before the page is live", () => {
  it("is noted before anything has loaded, and only by the page's first script", () => {
    const html = read("web/index.html");
    const note = html.indexOf('addEventListener("click"');
    expect(note).toBeGreaterThan(-1);
    expect(note).toBeLessThan(html.indexOf('<script type="module"'));
    expect(html.slice(note, html.indexOf("</script>", note))).toContain("self.__tap!==0");
  });

  it("can reach nothing that pays or starts a live run: the list is named, whole", () => {
    expect(holds.split(",")).toEqual([".gm-btn", ".skip", ".wchip", ".logfold", ".tr-step"]);
    expect(holds).not.toMatch(/approve|pay|hg-|ssm|dk-|\.btn\b/i);
    expect(src).toMatch(/document\.querySelectorAll<HTMLButtonElement>\(HOLDS\)/);
    expect(src.match(/querySelectorAll/g)).toHaveLength(1);
  });

  it("the first paints it can land on draw no Approve", () => {
    for (const p of ["web/src/first-paint.tsx", "web/src/desk/first-paint.tsx", "web/src/ledger/first-paint.tsx"]) {
      expect(read(p)).not.toMatch(/id="approve"|<Approve\b/);
    }
  });

  it("is taken when the page goes live, only a tap's page loads the code, and a newer tap or an old one lets it go", () => {
    const held = read("web/src/held.tsx");
    expect(held).toMatch(/if \(tap\) void import\("\.\/held-tap\.ts"\)/);
    expect(held).not.toMatch(/^import \{[^}]*heldTap/m);
    expect(src).toMatch(/const moved = w\.__tap !== tap;\n\s*w\.__tap = 0;\n\s*if \(moved\) return;/);
    expect(src).toMatch(/Date\.now\(\) - at > HOLD_MS/);
    expect(src).toMatch(/!e\.disabled/);
  });
});

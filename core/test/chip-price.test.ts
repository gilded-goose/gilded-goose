// The price in each Ask chip is drawn in ink (the DD, §2d change 3): the landing, its first paint (the same Landing) and
// the design system's specimen split each chip the same way, so the specimen never shows a chip the site doesn't. The
// chip's words, and so its accessible name and every script that clicks it by text, are unchanged.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const file = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const SPLIT = "{c.split(/(\\$\\d+)/).map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}";
const chipsOf = (src: string) => JSON.parse(/const CHIPS = (\[[^\]]+\]) as const/.exec(src)![1]!) as string[];

describe("the Ask chips' price", () => {
  it("the landing and the design system's specimen split each chip the same way", () => {
    expect(file("web/src/desk/story/index.tsx")).toContain(`onClick={() => onAsk(c)}>${SPLIT}</button>`);
    expect(file("web/src/system/Specimens.tsx")).toContain(`<button key={c} type="button">${SPLIT}</button>`);
  });
  it("is drawn in ink in the chip's own font, so no chip changes width", () => {
    expect(file("web/src/desk/story/hero.css")).toMatch(/^\.dk-chips b \{ font: inherit; color: var\(--ink\); \}$/m);
  });
  it("each priced chip has exactly one price and keeps its words whole; a chip with none is one piece", () => {
    const chips = chipsOf(file("web/src/desk/Desk.tsx"));
    expect(chips).toEqual(chipsOf(file("web/src/desk/first-paint.tsx")));
    for (const c of chips) {
      const parts = c.split(/(\$\d+)/);
      expect(parts.join("")).toBe(c);
      expect(parts.filter((_, i) => i % 2)).toEqual(c.match(/\$\d+(?:\.\d+)?/g)?.map((m) => m) ?? []);
    }
    expect(chips.filter((c) => /\$\d/.test(c))).toHaveLength(2);
  });
});

// A link never opens the page it's on (Round 6, Nov 5): Studio's view note, "The ledger ›", went to ?desk=ledger, which
// is Studio itself until the licence's day, so a visitor who pressed it got the same page again. The class: a page's own
// sources hold no link to its own address (any of its aliases, with or without more of the query), unless the link says
// it's the current page (aria-current). The live walk over every route is `node scripts/self-links.ts <url>`.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const at = (f: string) => new URL(`../../${f}`, import.meta.url);
const files = (p: string): string[] =>
  statSync(at(p)).isDirectory() ? readdirSync(at(p)).filter((f) => /\.tsx?$/.test(f)).map((f) => `${p}/${f}`) : [p];

// Each page, its own addresses (main.tsx's desk= keys), and the sources that draw it.
const PAGES: { desk: string[]; src: string[] }[] = [
  { desk: ["ledger", "studio"], src: ["web/src/studio", "web/src/studio/widgets", "web/src/ledger", "web/src/SessionLedger.tsx"] },
  { desk: ["proof"], src: ["web/src/Proof.tsx"] },
  { desk: ["haggle"], src: ["web/src/Haggle.tsx"] },
  { desk: ["tour"], src: ["web/src/tour"] },
  { desk: ["system"], src: ["web/src/system"] },
  { desk: ["how"], src: ["web/src/how"] },
  { desk: ["builders"], src: ["web/src/builders"] },
  { desk: ["list"], src: ["web/src/list"] },
];

describe("no link opens the page it's on", () => {
  it("reads real sources for every page", () => {
    for (const p of PAGES) for (const s of p.src) expect(existsSync(at(s)), s).toBe(true);
  });

  it("finds no page linking to its own address", () => {
    const bad: string[] = [];
    for (const p of PAGES) {
      const self = new RegExp(`href=\\{?(?:appHref\\()?["'\`]\\?desk=(?:${p.desk.join("|")})(?=["'\`&#])`);
      for (const f of p.src.flatMap(files)) {
        for (const tag of readFileSync(at(f), "utf8").match(/<a\b[^<>]*>/g) ?? []) {
          if (self.test(tag) && !/aria-current/.test(tag)) bad.push(`${f}: ${tag}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

// Track SYS: the living design system (`?desk=system`) and How it works (`?desk=how`) can't drift from the code.
//   - every custom property tokens.css declares is one the page draws, and each block it reads is still there;
//   - every site class a specimen uses still exists in the site's own CSS (a renamed class fails here, not on screen);
//   - no specimen uses a class the site's CSS reads page-wide through `:has()` (the bug this track found: a menu
//     specimen's `.gm-root` turned every scrolled bar solid, nav.css `html:has(.gm-root)`);
//   - the contrast the page computes matches brand.md's table;
//   - How it works names only files that exist, and both pages are routes.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DESK_PAGES } from "../src/view/menu-hash.ts";
import { allTokenNames, contrast, tokenSets, valueOf } from "../../web/src/system/tokens.ts";
import { HOW_DESC, HOW_FILES, HOW_LEAD, HOW_TITLE, STAGES, TAP_LINE } from "../../web/src/how/how.ts";

const root = new URL("../../", import.meta.url).pathname;
const read = (p: string) => readFileSync(join(root, p), "utf8");
const TOKENS = read("web/src/desk/tokens.css");
const SYSTEM = read("web/src/system/System.tsx") + read("web/src/system/Specimens.tsx");

/** Every stylesheet under web/src except the system page's own (a class it invents for its frame isn't a site class). */
function siteCss(dir = join(root, "web/src")): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "system" ? [] : siteCss(p);
    return f.endsWith(".css") ? [readFileSync(p, "utf8")] : [];
  });
}
const CSS = siteCss().join("\n");

/** The class names in System.tsx's markup: `className="a b"` and the fixed parts of `className={`a ${x}`}`. */
function classesUsed(src: string): string[] {
  const out = new Set<string>();
  for (const m of src.matchAll(/className="([^"]+)"/g)) for (const c of m[1]!.split(/\s+/)) out.add(c);
  for (const m of src.matchAll(/className=\{`([^`]+)`\}/g)) for (const c of m[1]!.replace(/\$\{[^}]*\}/g, " ").split(/\s+/)) if (c) out.add(c);
  return [...out].filter(Boolean);
}

describe("the design system draws tokens.css itself", () => {
  const sets = tokenSets(TOKENS);
  it("finds the four blocks and every custom property the file declares", () => {
    expect(sets.shared.length).toBeGreaterThan(40);
    expect(sets.velvet.length).toBeGreaterThan(40);
    expect(sets.midnight.length).toBeGreaterThan(40);
    const declared = new Set([...TOKENS.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
    const drawn = new Set(allTokenNames(sets));
    expect([...declared].filter((n) => !drawn.has(n))).toEqual([]);
  });
  it("reads its tokens from the raw file, never a copy", () => {
    expect(SYSTEM).toContain('import tokensCss from "../desk/tokens.css?raw"');
    expect(SYSTEM).toContain("tokenSets(tokensCss)");
    expect(SYSTEM).not.toMatch(/#[0-9a-f]{6}\b/i); // no colour typed into the page
  });
  it("computes the contrast brand.md's Velvet table states (to its one decimal, within its rounding)", () => {
    const brand = read("docs/guild/brand.md");
    const page = valueOf(sets.velvet, "--page-solid")!, card = valueOf(sets.velvet, "--card")!;
    let rows = 0;
    for (const m of brand.matchAll(/^\| `(--[a-z0-9-]+)` \|[^|]*\|[^|]*\|[^|]*\| (\d+\.\d) \/ (\d+\.\d)/gm)) {
      const fg = valueOf(sets.velvet, m[1]!)!;
      expect(Math.abs(contrast(fg, page)! - Number(m[2])), `${m[1]} on the page`).toBeLessThanOrEqual(0.1);
      expect(Math.abs(contrast(fg, card)! - Number(m[3])), `${m[1]} on the card`).toBeLessThanOrEqual(0.1);
      rows++;
    }
    expect(rows).toBeGreaterThanOrEqual(6);
  });
});

describe("the design system's specimens are the site's own classes", () => {
  const used = classesUsed(SYSTEM).filter((c) => /^(dk|gm|gn|lx|gc)-|^(dk|gn)$/.test(c));
  it("uses only classes the site's CSS still defines", () => {
    expect(used.length).toBeGreaterThan(40);
    const has = (c: string) => new RegExp(`\\.${c.replace(/[-]/g, "\\-")}(?![\\w-])`).test(CSS);
    expect(used.filter((c) => !has(c))).toEqual([]);
  });
  it("never uses a class the site's CSS reads page-wide through :has() (a specimen must not restyle the real page)", () => {
    const triggers = new Set<string>();
    for (const m of CSS.matchAll(/(?:html|body|:root)[^{,]*?:has\(([^)]*)\)/g)) {
      for (const c of m[1]!.matchAll(/\.([\w-]+)(?!\[)/g)) triggers.add(c[1]!);
    }
    expect(triggers.has("gm-root")).toBe(true); // the rule this test exists for is still read here
    expect(classesUsed(SYSTEM).filter((c) => triggers.has(c))).toEqual([]);
    expect(SYSTEM).not.toMatch(/data-room=/);
  });
  it("is unlisted: noindex, and not in the menu", () => {
    expect(SYSTEM).toMatch(/meta\.name = "robots"; meta\.content = "noindex, nofollow"/);
    expect(read("core/src/view/menu.ts")).not.toContain("?desk=system");
  });
});

describe("How it works names the code that does each step", () => {
  it("names only files that exist, at least one for every step", () => {
    for (const s of STAGES) expect(s.files.length, s.id).toBeGreaterThan(0);
    expect(HOW_FILES.filter((f) => !existsSync(join(root, f)))).toEqual([]);
  });
  // The bug this rule is for (the review): the page said "The AI reader can only add caution" with a "Code + AI" tag,
  // while the Desk's sellers are read by code alone (the reader runs only in Try to trick Goose), and "You ask in your
  // own words" had no row at all. Now every sentence the page says is, word for word, a docs/claims.md row shown in
  // how.ts, so each has a probe that re-reads the code (scripts/check-claims.ts), and a new sentence can't skip one.
  it("says nothing that isn't a claims row: every sentence, word for word, has its row and probe", () => {
    const rows = new Set([...read("docs/claims.md").matchAll(/^\| [\w-]+ \| (.+?) \| `web\/src\/how\/how\.ts` \|/gm)].map((m) => m[1]!));
    const said = [HOW_LEAD, TAP_LINE, ...STAGES.map((s) => s.line)].flatMap((t) => t.split(/(?<=\.)\s+/));
    expect(said.length).toBeGreaterThanOrEqual(7); // the lead, the five boxes (one sentence each, Track C's), the tap path
    expect(said.filter((s) => !rows.has(s))).toEqual([]);
  });
  it("tags a step AI only where its own sentence says when the AI runs", () => {
    for (const s of STAGES.filter((x) => x.kind === "AI")) expect(s.line, s.id).toMatch(/^When it's on,|recorded|live/);
    for (const s of STAGES) if (/\bAI\b/.test(s.line) && s.kind !== "AI") expect(s.line, s.id).toMatch(/\bIn [A-Z][^,]+, AI\b/); // says where it runs
  });
  // Track C's words (Oct 31): one sentence a box, the Watcher's the longest (29 words), so the cap is the page's, not a
  // line's: C's 140-word budget for How it works (docs/launch/surface-words.md), counted on what this page says.
  it("has the five steps in order, one sentence each, the tap path, and stays within C's 140 words", () => {
    expect(STAGES.map((s) => s.id)).toEqual(["you", "goose", "watcher", "guard", "paypal"]);
    for (const s of STAGES) expect(s.line.split(/(?<=\.)\s+/).length, s.id).toBe(1);
    const words = [HOW_TITLE, HOW_LEAD, TAP_LINE, ...STAGES.flatMap((s) => [s.name, s.line, ...s.files])].join(" ").split(/\s+/).length;
    expect(words).toBeLessThanOrEqual(140);
    expect(HOW_DESC).toContain(TAP_LINE);
  });
  it("gives gold only to the steps that are code", () => {
    const page = read("web/src/how/How.tsx");
    expect(page).toContain('data-code={s.kind === "Code" ? "" : undefined}');
    expect(read("web/src/how/how.css").match(/var\(--gold[^)]*\)/g)).toEqual(["var(--gold-line)", "var(--gold)"]);
  });
});

describe("each page paints its own room", () => {
  // The bug this rule is for: How it works loads no desk.css, so `.dk` had no fill and no ink; it looked right only
  // because the html behind it was dark, and axe read its words on white (1.18:1). The design system's heading paints
  // before desk.css arrives in its specimens' chunk, so it needs the same.
  for (const [page, css, cls] of [["How it works", "web/src/how/how.css", "how"], ["the design system", "web/src/system/system.css", "sys"]] as const) {
    it(`${page}: its root rule sets the page fill and the ink from the tokens`, () => {
      const rule = read(css).match(new RegExp(`^\\.${cls} \\{([^}]*)\\}`, "m"))?.[1] ?? "";
      expect(rule).toContain("background: var(--page-solid)");
      expect(rule).toContain("color: var(--ink)");
      expect(rule).toContain("font-family: var(--face)");
    });
  }
  // The DD's nits (Sat Oct 31): how.css's "2px 10px" and system.css's "6px" were spacing typed in pixels. Every spacing
  // and type size on both pages comes from the tokens (a calc of a token is fine); px stays for hairlines, outlines,
  // hit targets, layout widths and the specimens' own drawn sizes.
  it("types no pixel spacing or type size: padding, margin, gap and font come from the tokens", () => {
    // Two shapes of an off-grid value: a raw px, and a token cut below its step (`calc(var(--s-1) / 4)` is still 2 px,
    // written so a px grep misses it; the DD's second ruling).
    const offGrid = (d: string) => /(?<![\w(-])[1-9]\d*(?:\.\d+)?px/.test(d.replace(/var\([^)]*\)|calc\([^)]*\)/g, "")) || /calc\(\s*var\(--[\w-]+\)\s*\/\s*[\d.]+\s*\)/.test(d);
    const typed = ["web/src/how/how.css", "web/src/system/system.css"].flatMap((f) => [...read(f).matchAll(/(?:^|[;{\s])((?:padding|margin|gap|row-gap|column-gap|font|font-size)(?:-[a-z]+)?:\s*[^;}]*)/g)]
      .map((m) => m[1]!).filter(offGrid).map((d) => `${f}: ${d}`));
    expect(typed).toEqual([]);
    // Controls: the DD's first line, and the shape its second ruling caught, are both caught; a whole step is not.
    expect(offGrid("padding: 2px 10px")).toBe(true);
    expect(offGrid("gap: calc(var(--s-1) / 4)")).toBe(true);
    expect(offGrid("padding: 0 var(--s-1)")).toBe(false);
  });
  // The DD's block (Sat Oct 31): How's bar was Velvet over its Midnight page. It did say data-room="back", but nav.css
  // maps that room to the back room's --lx-* names, which only ledger/midnight.css declares; How didn't load it, so the
  // bar fell back to Velvet. Every page that asks SiteNav for the back room must load that sheet.
  it("every page that draws the back room's bar loads the back room's names (ledger/midnight.css)", () => {
    const tsx = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? tsx(p) : f.endsWith(".tsx") ? [p] : [];
    });
    const back = tsx(join(root, "web/src")).filter((p) => /room: "back"|room="back"/.test(readFileSync(p, "utf8")));
    expect(back.length).toBeGreaterThanOrEqual(3); // the ledger's rooms, How it works, the design system in Midnight
    expect(back.filter((p) => !/["']\.\.\/ledger\/midnight\.css(\?inline|\?raw)?["']|["']\.\/midnight\.css["']/.test(readFileSync(p, "utf8"))).map((p) => p.slice(root.length))).toEqual([]);
    expect(/["']\.\.\/ledger\/midnight\.css(\?inline|\?raw)?["']/.test('import "./how.css";')).toBe(false); // control: a page without it is caught
  });
  // The phone drill (Oct 31): `?inline` resolved midnight.css's `@import "../desk/tokens.css"` into a second copy of the
  // tokens (9.7 KB) in How's and System's h1 bytes, so both take it `?raw`. Raw text keeps the `@import`, which a <style>
  // would resolve against the page's address (a 404 at /desk/tokens.css), so every `?raw` taker must strip it.
  // For builders (Nov 4): a raw sheet ships its comments, unminified, to every page that takes it: 1.6 KB of notes here.
  it("a stylesheet taken as raw text keeps its notes elsewhere", () => {
    const comments = (css: string) => [...css.matchAll(/\/\*[\s\S]*?\*\//g)].reduce((n, m) => n + m[0].length, 0);
    expect(comments(read("web/src/ledger/midnight.css"))).toBeLessThanOrEqual(100);
    expect(comments("/* one */ a { color: red } /* two */")).toBe(18); // Control: it counts them.
  });
  it("every page that takes midnight.css as raw text strips its @import", () => {
    const raw = ["web/src/how/How.tsx", "web/src/system/System.tsx"].map((f) => [f, read(f)] as const);
    for (const [f, src] of raw) {
      expect(src, f).toMatch(/import (\w+) from "\.\.\/ledger\/midnight\.css\?raw";/);
      const name = src.match(/import (\w+) from "\.\.\/ledger\/midnight\.css\?raw";/)![1]!;
      expect(src, f).toContain(`${name}.replace(/@import[^;]*;/g, "")`);
    }
    expect(read("web/src/ledger/midnight.css").replace(/@import[^;]*;/g, "")).not.toContain("@import"); // the strip leaves none
  });
});

describe("both pages are routes", () => {
  it("in DESK_PAGES and main.tsx's table", () => {
    for (const p of ["system", "how"]) expect(DESK_PAGES).toContain(p);
    const main = read("web/src/main.tsx");
    expect(main).toContain('["system", [() => import("./system/System.tsx")');
    expect(main).toContain('["how", [() => import("./how/How.tsx")');
  });
});

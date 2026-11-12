// DK part 4 (the DD, stack 91): the Desk's stylesheet names colours and corner radii by role, from desk/tokens.css,
// never as raw values, so a palette is one block and a radius is one of the system's three (8, 10, 12) or a pill.
// A colour that is not a colour (a mask's coverage) or a surface outside the tokens' scope carries `raw-ok: <why>` on its
// line; nothing else may. DK part 6 (the DD, part 4's nits): its type is the scale's tokens (brand.md section 4: no raw
// font-size, no numeric weight) and its spacing the 8 px grid (section 5: tokens, or a 1-4 px hairline or optical nudge).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url).pathname;

/** Each line's code with comments removed, and whether the line carries a `raw-ok:` reason. */
export function codeLines(css: string): { n: number; code: string; ok: boolean; line: string }[] {
  const out: { n: number; code: string; ok: boolean; line: string }[] = [];
  let inComment = false;
  css.split("\n").forEach((line, i) => {
    let code = "", rest = line;
    while (rest.length) {
      if (inComment) {
        const end = rest.indexOf("*/");
        if (end < 0) { rest = ""; break; }
        rest = rest.slice(end + 2); inComment = false;
      } else {
        const start = rest.indexOf("/*");
        if (start < 0) { code += rest; rest = ""; break; }
        code += rest.slice(0, start); rest = rest.slice(start + 2); inComment = true;
      }
    }
    out.push({ n: i + 1, code, ok: /raw-ok: \S/.test(line), line });
  });
  return out;
}

/** Raw colours (hex, rgb/rgba, hsl/hsla) and px corner radii in a stylesheet's code, outside `raw-ok` lines. */
export function rawValues(css: string): string[] {
  const hits: string[] = [];
  for (const { n, code, ok } of codeLines(css)) {
    if (ok) continue;
    // rgb(var(--elev) / .6) is a token's channels at an alpha: named by role, so it passes.
    for (const m of code.matchAll(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\([^)]*\)/gi)) if (!/^\w+\(\s*var\(/.test(m[0])) hits.push(`${n}: ${m[0]}`);
    for (const m of code.matchAll(/border(?:-[a-z]+)*-radius:\s*([^;}]*)/gi)) if (/\b\d+(?:\.\d+)?px\b/.test(m[1]!.replace(/var\([^)]*\)/g, "").replace(/calc\([^)]*\)/g, ""))) hits.push(`${n}: radius ${m[1]!.trim()}`);
  }
  return hits;
}

const bare = (v: string) => v.replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, "").replace(/env\([^)]*\)/g, "");

/** Raw font sizes and numeric weights (in `font-size`, `font-weight` and the `font` shorthand), outside `raw-ok` lines. */
export function rawType(css: string): string[] {
  const hits: string[] = [];
  for (const { n, code, ok } of codeLines(css)) {
    if (ok) continue;
    for (const m of code.matchAll(/(?<![\w-])(font(?:-size|-weight)?)\s*:\s*([^;}]*)/gi)) {
      const v = bare(m[2]!);
      if (/\d/.test(v)) hits.push(`${n}: ${m[1]}: ${m[2]!.trim()}`);
    }
  }
  return hits;
}

/** brand.md's section numbers, for a `raw-ok` that cites one. */
const brandSections = (md: string) => new Set([...md.matchAll(/^## (\d+)\./gm)].map((m) => m[1]!));

/** Off-grid spacing: any px margin, padding or gap that is not 0 or a token (brand.md section 5, the DD at 08:05 PDT
 *  Sat Oct 31: no optical nudges; a 1-7 px step inside one block rounds to 0 or `--s-1`; a negative one too). A line
 *  may keep a raw value only with a `raw-ok` that cites the brand.md section allowing it ("brand.md section 5" or
 *  "brand.md §5", a section that exists); a `raw-ok` that cites none is refused like the raw value itself. */
export function rawSpace(css: string, sections: Set<string> = brandSections(readFileSync(root + "docs/guild/brand.md", "utf8"))): string[] {
  const hits: string[] = [];
  for (const { n, code, line } of codeLines(css)) {
    const cite = /raw-ok:[^*]*\bbrand\.md (?:section |§)(\d+)/.exec(line)?.[1];
    if (cite && sections.has(cite)) continue;
    for (const m of code.matchAll(/(?<![\w-])((?:margin|padding)(?:-[a-z]+)*|(?:row-|column-)?gap)\s*:\s*([^;}]*)/gi)) {
      const raw = [...bare(m[2]!).matchAll(/(\d+(?:\.\d+)?)px/g)].filter((x) => Number(x[1]) > 0);
      if (raw.length) hits.push(`${n}: ${m[1]}: ${m[2]!.trim()}${/raw-ok:/.test(line) ? " (its raw-ok cites no brand.md section)" : ""}`);
    }
  }
  return hits;
}

describe("desk.css sets type by the scale and space on the grid", () => {
  it("finds raw type and off-grid space in a sample (the guard can fail)", () => {
    expect(rawType(".a { font-size: 22px; font-weight: 300; font: 400 15px/1.4 var(--face); }")).toHaveLength(3);
    expect(rawType(".a { font-size: var(--t-h3); font-weight: var(--w-display); font: inherit; font: var(--w-strong) var(--t-micro) / var(--lh-micro) var(--face); font-family: ui-monospace, monospace; }")).toEqual([]);
    const sec = new Set(["4", "5"]);
    expect(rawSpace(".a { padding: 12px 0; gap: 10px; margin: var(--s-3) 0 -6px; }", sec)).toHaveLength(3);
    expect(rawSpace(".a { padding: var(--s-1) var(--s-2); margin-top: 0; gap: 0; row-gap: var(--s-1); padding-bottom: calc(var(--s-3) + env(safe-area-inset-bottom)); }", sec)).toEqual([]);
    expect(rawSpace(".a { gap: 4px; } .b { row-gap: 2px; } .c { gap: 4px var(--s-2); }", sec)).toHaveLength(3); // a gap is never a nudge by default (the deal foot's 4, part 7)
    // No optical nudges (brand.md section 5, the DD at 08:05): a 1-4 px margin or padding fails too, and so does a
    // negative one.
    expect(rawSpace(".a { margin-top: 2px; } .b { padding-right: 2px; } .c { margin: var(--s-3) 0 -4px; }", sec)).toHaveLength(3);
    // A raw-ok must cite the brand.md section that allows it, and the section must exist.
    expect(rawSpace(".a { padding: 0 12px; } /* raw-ok: 12 inside a 44 px control (brand.md section 5) */", sec)).toEqual([]);
    expect(rawSpace(".a { padding: 0 12px; } /* raw-ok: 12 inside a 44 px control (brand.md §5) */", sec)).toEqual([]);
    expect(rawSpace(".a { gap: 2px; } /* raw-ok: a 2 px optical nudge, one block */", sec)).toHaveLength(1);
    expect(rawSpace(".a { gap: 2px; } /* raw-ok: allowed (brand.md section 99) */", sec)).toHaveLength(1);
  });
  it("has no raw font size or weight in web/src/desk/desk.css", () => {
    expect(rawType(readFileSync(root + "web/src/desk/desk.css", "utf8"))).toEqual([]);
  });
  it("has no off-grid spacing in web/src/desk/desk.css", () => {
    expect(rawSpace(readFileSync(root + "web/src/desk/desk.css", "utf8"))).toEqual([]);
  });
});

describe("desk.css names its colours and radii by role", () => {
  it("finds raw values in a sample (the guard can fail)", () => {
    expect(rawValues(".a { color: #3f2131; border-radius: 14px; box-shadow: 0 1px 0 rgba(1, 2, 3, .4); }")).toHaveLength(3);
    expect(rawValues(".a { border-radius: var(--r-3); background: color-mix(in srgb, var(--gold) 30%, transparent); box-shadow: 0 0 4px rgb(var(--elev) / .6); }")).toEqual([]);
    expect(rawValues(".a { border-radius: calc(var(--r-3) - 1px) 0; }")).toEqual([]); // a token less a border, inside calc()
    expect(rawValues("/* #3a1d2c in prose */ .a { mask: linear-gradient(#000 0 0); } /* raw-ok: a mask's coverage */")).toEqual([]);
  });
  it("has no raw colour or px radius in web/src/desk/desk.css", () => {
    expect(rawValues(readFileSync(root + "web/src/desk/desk.css", "utf8"))).toEqual([]);
  });
});

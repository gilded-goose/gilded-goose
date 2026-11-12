// DK part 4 (the DD, 05:48 PDT Sat Oct 31): the type scale is declared in one place. Every `--t-*` size, the phone
// steps included, lives in web/src/desk/tokens.css (its <=720 block holds the phone's); a component may use a size
// with var(--t-*), never set one, so a page can't quietly carry its own scale (desk.css once stepped h3 and lead for
// the Desk alone, and R's kit stepped its title on top).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url).pathname;
const TOKENS = "web/src/desk/tokens.css";
/** The other pages' own scales, each declared once in the page's own tokens.css (the new site, goose.html), plus the one
 *  adapter that maps the Desk board's names (--t-micro…) onto that scale where the board is mounted in the site. */
const OWN_SCALES = ["web/src/site/tokens.css", "web/src/goose/tokens.css", "web/src/site/hood/board.css"];

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name === "dist") return [];
    return statSync(path).isDirectory() ? cssFiles(path) : name.endsWith(".css") ? [path] : [];
  });
}

/** `--t-*:` declarations in a stylesheet's code (comments removed). */
export function typeDecls(css: string): string[] {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")); // comments blanked, lines kept
  return code.split("\n").flatMap((line, i) => [...line.matchAll(/--t-[a-z0-9-]+\s*:/gi)].map((m) => `${i + 1}: ${m[0]}`));
}

/** The `--t-*: value` declarations inside tokens.css's `@media (max-width: 720px)` blocks: the phone's type steps. */
export function phoneSteps(css: string): string[] {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: string[] = [];
  for (const m of code.matchAll(/@media \(max-width: 720px\)\s*\{/g)) {
    let depth = 1, i = m.index! + m[0].length;
    const start = i;
    for (; i < code.length && depth > 0; i++) depth += code[i] === "{" ? 1 : code[i] === "}" ? -1 : 0;
    for (const d of code.slice(start, i).matchAll(/(--t-[a-z0-9-]+)\s*:\s*([^;}]+)/g)) out.push(`${d[1]}: ${d[2]!.trim()}`);
  }
  return out;
}

describe("the type scale is declared only in tokens.css", () => {
  it("finds a declaration in a sample (the guard can fail)", () => {
    expect(typeDecls("@media (max-width: 720px) { .dk { --t-h3: 20px; font-size: var(--t-body); } }")).toEqual(["1: --t-h3:"]);
    expect(typeDecls(".a { font-size: var(--t-lead, 20px); } /* --t-h3: 20px in prose */")).toEqual([]);
  });
  it("no stylesheet but tokens.css sets a --t-* size", () => {
    const found = cssFiles(join(root, "web"))
      .filter((path) => ![TOKENS, ...OWN_SCALES].includes(relative(root, path).split("\\").join("/")))
      .flatMap((path) => typeDecls(readFileSync(path, "utf8")).map((hit) => `${relative(root, path)}:${hit}`));
    expect(found).toEqual([]);
  });
  it("the phone's type steps are --t-h3: 20px and the moment's --t-price: 72px (brand.md §4: --t-lead stays 20 at every width; §10.7: 104/72)", () => {
    expect(phoneSteps("@media (max-width: 720px) { .a { --t-h3: 20px; } .b { --t-lead: 17px; } }")).toEqual(["--t-h3: 20px", "--t-lead: 17px"]);
    expect(phoneSteps(readFileSync(join(root, TOKENS), "utf8"))).toEqual(["--t-h3: 20px", "--t-price: 72px"]);
  });
});

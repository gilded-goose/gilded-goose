// The Desk's tokens (web/src/desk/tokens.css, 8.7 KB built) ship once per page, in the entry's own sheet (Track F, Nov 5;
// found by Track T). run.css @imported them into main.css while Desk.tsx and ten lazy chunks also imported them from JS,
// which made a second tokens-*.css that the Desk's first load listed after Desk-*.css: every route paid twice. A JS import
// of tokens.css is how a second copy comes back, so only an entry with no sheet carrying them may make one.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../", import.meta.url).pathname;
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const files = (dir: string): string[] => readdirSync(join(ROOT, dir)).flatMap((n) => {
  const p = `${dir}/${n}`;
  return statSync(join(ROOT, p)).isDirectory() ? files(p) : /\.(tsx?|css)$/.test(n) ? [p] : [];
});
const jsImport = /^\s*import\s+["'][^"']*\/tokens\.css["'];/m;

/** The one module allowed a JS import: voice-test-2.html's entry, a dev page whose own sheets carry no tokens. */
const DEV_ENTRY = "web/src/nav/mount.tsx";
/** The new site's entry modules (goose.html), each loading its own tokens.css ahead of its sheets. They never share a page
 *  with the Desk's tokens (no Desk chunk is reachable from them), so no second tokens-*.css can be built for one page. */
const SITE_ENTRIES = ["web/src/site/main.tsx", "web/src/goose/main.tsx"];
/** Each public HTML entry's root sheet, which brings the tokens once. */
const ENTRY_SHEETS = { "index.html": "web/src/run.css", "safe.html": "web/src/safe.css", "404.html": "web/src/404.css" } as const;

describe("the Desk's tokens come once per page, in its entry's sheet", () => {
  it("no chunk imports tokens.css from JS, so no second tokens-*.css is built", () => {
    const takers = files("web/src").filter((f) => /\.tsx?$/.test(f) && jsImport.test(read(f)));
    expect([...takers].sort()).toEqual([DEV_ENTRY, ...SITE_ENTRIES].sort());
    expect(jsImport.test('import "../desk/tokens.css"; // a room')).toBe(true); // control: the rule sees one
  });

  it("no other sheet @imports them: a lazy chunk's sheet that does carries a second copy (stage 2, Nov 6: wallet, market, back room)", () => {
    const cssImport = /^\s*@import\s+["'][^"']*\/tokens\.css["']/m;
    const takers = files("web/src").filter((f) => f.endsWith(".css") && cssImport.test(read(f)));
    expect(takers.sort()).toEqual(Object.values(ENTRY_SHEETS).sort());
    expect(cssImport.test('@import "../desk/tokens.css";')).toBe(true); // control: the rule sees one
  });

  it("every public entry's root sheet @imports them, and its entry module loads that sheet", () => {
    for (const [html, sheet] of Object.entries(ENTRY_SHEETS)) {
      expect(read(sheet), `${html}: ${sheet}`).toMatch(/^@import "\.\/desk\/tokens\.css";/m);
    }
    expect(read("web/src/main.tsx")).toMatch(/import "\.\/run\.css";/);
    expect(read("web/src/safe-main.tsx")).toMatch(/import "\.\/safe\.css";/);
    expect(read("web/src/404-main.tsx")).toMatch(/import "\.\/404\.css";/);
  });

  it("the dev page that has no such sheet takes them from its entry, before its own sheets", () => {
    const src = read(DEV_ENTRY);
    expect(src.indexOf('import "../desk/tokens.css";')).toBeGreaterThan(-1);
    expect(src.indexOf('import "../desk/tokens.css";')).toBeLessThan(src.indexOf('import "./nav.css";'));
    expect(read("web/voice-test-2.html")).toContain('src="/src/nav/mount.tsx"');
  });

  it("each site entry takes its own tokens before its own sheets", () => {
    for (const entry of SITE_ENTRIES) {
      const src = read(entry);
      const tokens = src.indexOf('import "./tokens.css";');
      expect(tokens, entry).toBeGreaterThan(-1);
      for (const m of src.matchAll(/^import "\.\/[^"]+\.css";/gm)) if (!m[0].includes("tokens.css")) expect(src.indexOf(m[0]), `${entry}: ${m[0]}`).toBeGreaterThan(tokens);
    }
    expect(read("web/goose.html")).toContain('src="/src/site/main.tsx"');
  });

  it("the first paint lays down the Desk's one sheet after main.css, and the build stops if a second comes back", () => {
    expect(read("web/prerender.ts")).toContain('if (deskCss.length !== 1 || !deskCss[0]!.includes("Desk-"))');
  });
});

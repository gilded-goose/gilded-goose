// The walking goose (the white site's loader, Nov 11), read from the source: it is the header's own drawing and no new
// file, its walk runs only where motion is allowed and moves transform alone, the Shop's status keeps its words and roles,
// and the walk that proves it in a browser is in both gates. scripts/loader-walk.ts is the browser half.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const goose = read("web/src/site/ui/Goose.tsx");
const css = read("web/src/site/ui/goose.css");
const html = read("web/goose.html");
const brief = read("web/src/site/shop/Brief.tsx");
/** A sheet with every `@media (prefers-reduced-motion: no-preference) { … }` block taken out: what a reduced-motion visitor gets. */
const reduced = (sheet: string) => sheet.replace(/@media \(prefers-reduced-motion:\s?no-preference\)\s?\{(?:[^{}]|\{[^{}]*\})*\}/g, "");
const sources = (dir: string): string[] => readdirSync(new URL(`../../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? sources(`${dir}/${e.name}`) : /\.(tsx?|css)$/.test(e.name) ? [`${dir}/${e.name}`] : []);

describe("the goose loader is the shared mascot and no new asset", () => {
  it("draws the header's GooseMark, from the same two files and nothing else", () => {
    const loader = goose.slice(goose.indexOf("export function GooseLoader"));
    expect(loader).toContain("<GooseMark walk />");
    expect(loader).toContain('role="status"');
    expect(loader).toContain('label = "Loading"');
    expect(loader).not.toMatch(/<svg|<img|<picture|src=|url\(/);
    expect(new Set(goose.match(/site\/[\w-]+\.\w+/g))).toEqual(new Set(["site/goose-96.webp", "site/goose-192.webp"]));
    expect(goose.match(/^import .*$/gm)).toEqual(['import "./goose.css";']);
    expect(css).not.toMatch(/url\(|@import|@font-face|data:/);
  });

  it("the splash before the app is the same drawing, picked the same way, so a deep link asks for no splash file", () => {
    expect(html).toContain('<img src="/site/goose-96.webp" srcset="/site/goose-96.webp 1x, /site/goose-192.webp 2x" alt="" width="60" height="88" />');
    expect(html).toContain('<div class="boot" role="status">');
    expect(html).toContain("<span>Loading Gilded Goose</span>");
    expect(html).not.toMatch(/egg/);
    expect(read("web/site-paint.ts")).not.toMatch(/egg-s\.webp|egg\.webp/);
  });

  it("the loading egg is gone from the site, so its art and its rocking pay for the walk", () => {
    const left = sources("web/src/site").filter((f) => /EggLoader|egg-loader|egg-rock|data-shine="loop"|shine="loop"/.test(read(f)));
    expect(left).toEqual([]);
    expect(read("web/src/site/App.tsx")).toContain("<Suspense fallback={<GooseLoader />}>{PAGES[route]()}</Suspense>");
    for (const f of ["web/src/site/hood/Page.tsx", "web/src/site/hood/Below.tsx"]) expect(read(f)).toMatch(/<GooseLoader label="Loading the [a-z]+…" fill=\{false\} \/>/);
  });

  it("stands in the box the loading egg had", () => {
    expect(css).toContain(".gz-load { display: grid; place-items: center; align-content: center; gap: var(--s4); padding-block: var(--s12);");
    expect(css).toContain(".gz-load[data-fill] { min-height: calc(100svh - var(--header-h) - var(--s16)); }");
    expect(css).toContain(".gz-load .gz-mark { height: calc(64px * 1.2); }"); // the egg's art: 64px wide at 200 / 240, so 76.8px
  });
});

describe("the walk", () => {
  it("is hidden from a screen reader and only on a goose that was asked to walk", () => {
    expect(goose).toContain('className={`gz-mark${walk ? " gz-walk" : ""}${className ? ` ${className}` : ""}`} aria-hidden={walk}');
    expect(goose).toContain('alt=""');
    expect(read("web/src/site/shell/Header.tsx")).toContain("<GooseMark />");
  });

  it("runs only where motion is allowed: reduced motion gets no animation, in the sheet or the splash", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\n  \.gz-walk \{ animation: gz-walk 640ms ease-in-out infinite; \}\n\}/);
    expect(reduced(css)).not.toMatch(/animation\s*:/);
    expect(reduced(css)).toContain("@keyframes gz-walk"); // the keyframes are there, and nothing names them
    const splash = html.slice(html.indexOf("<style>.boot"));
    expect(splash).toContain("@media (prefers-reduced-motion:no-preference){.boot img{animation:boot-walk .64s ease-in-out infinite}}");
    expect(reduced(splash)).not.toMatch(/animation\s*:/);
  });

  it("moves transform alone: no layout property, no will-change", () => {
    for (const [sheet, name] of [[css, "gz-walk"], [html, "boot-walk"]] as const) {
      const frames = sheet.slice(sheet.indexOf(`@keyframes ${name}`)).match(/^@keyframes [\w-]+\s?\{((?:[^{}]|\{[^{}]*\})*)\}/)![1]!;
      const moved = [...frames.matchAll(/\{([^{}]*)\}/g)].flatMap((m) => m[1]!.split(";").map((d) => d.split(":")[0]!.trim()).filter(Boolean));
      expect(new Set(moved)).toEqual(new Set(["transform"]));
    }
    expect(css + html).not.toMatch(/will-change/);
  });
});

describe("the Shop's asking phase", () => {
  it("keeps the status, its role and aria-busy exactly, with the goose beside it and only while asking", () => {
    const status = '<p className="step-status" role="status" aria-busy="true">Finding sellers…</p>';
    expect(brief.split(status)).toHaveLength(2);
    expect(brief).toContain(`{phase === "asking" ? <div className="step-wait"><GooseMark walk />${status}</div> : null}`);
    expect(brief.match(/GooseMark walk/g)).toHaveLength(1);
  });

  it("the goose gives back the height it stands above the words, so the row is the words' own height", () => {
    const shop = read("web/src/site/shop/shop.css");
    expect(shop).toContain(".step-wait { display: flex; align-items: center; gap: var(--s2); }");
    expect(shop).toContain(".step-wait .gz-mark { height: 32px; margin-block: -8px; }");
  });
});

describe("a lost page and the gates", () => {
  it("a chunk that never arrives keeps its words", () => {
    const lost = read("web/src/site/ui/lazy-page.tsx");
    expect(lost).toContain("<h1>This page didn't load</h1>");
    expect(lost).toContain("Your connection may have dropped. Nothing was paid. Reload to try again.");
  });

  it("loader-walk runs in ci-local and in check.yml, behind the same guard as the other walks", () => {
    expect(read("scripts/ci-local.sh")).toContain("if grep -q loader-walk.ts .github/workflows/check.yml; then node scripts/loader-walk.ts http://localhost:8798 > loader.log 2>&1 || { tail -12 loader.log; fail loader-walk; }; fi");
    expect(read(".github/workflows/check.yml")).toContain("node scripts/loader-walk.ts http://localhost:8788");
  });
});

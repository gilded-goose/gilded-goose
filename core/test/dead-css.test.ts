// Dead declarations cost first-load bytes and buy nothing (T, Nov 5): 37 of them, in four files, were a later rule's
// exact selector setting the same property under the same conditions, so they could never apply. Removing them gave
// Desk back 1,011 B and changed no computed style. This keeps the whole site at zero, and pins what the probe must and
// must not call dead, so it never flags a fallback.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deadIn } from "../../scripts/dead-css.ts";

const ROOT = new URL("../../", import.meta.url).pathname;
const cssFiles = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? cssFiles(p) : n.endsWith(".css") ? [p] : [];
});
const props = (css: string) => deadIn(css).map((d) => `${d.line}:${d.prop}`);

describe("the dead-CSS probe", () => {
  it("calls a declaration dead when a later rule, same selector, same conditions, sets it again", () => {
    expect(props(".a { color: red; gap: 1px; }\n.a { color: blue; }")).toEqual(["1:color"]);
    expect(props("@media (max-width: 720px) {\n  .a > .b { margin: 0; }\n  .a>.b { margin: 4px; }\n}")).toEqual(["2:margin"]);
  });
  it("never calls a fallback, a different condition, a partial list, !important or nesting dead", () => {
    expect(props(".a { height: 100vh; height: 100dvh; }")).toEqual([]); // the rule's own pair
    expect(props(".a { height: 100vh; }\n.a { height: 100dvh; }")).toEqual([]); // a value a browser may drop
    expect(props(".a { color: red; }\n@media (min-width: 1px) { .a { color: blue; } }")).toEqual([]);
    expect(props("@media (min-width: 721px) { .a { color: red; } }\n@media (min-width: 1100px) { .a { color: blue; } }")).toEqual([]);
    expect(props(".a, .b { color: red; }\n.a { color: blue; }")).toEqual([]); // .b still takes it
    expect(props(".a { color: red !important; }\n.a { color: blue; }")).toEqual([]);
    expect(props(".a { color: red; }\n.a:hover { color: blue; }")).toEqual([]);
    expect(props(".a { & .b { color: red; } }\n.a .b { color: blue; }")).toEqual([]);
    expect(props("@keyframes k { from { opacity: 0; } }\n@keyframes j { from { opacity: 1; } }")).toEqual([]);
  });
  it("keeps line numbers through comments and reads a data URL's semicolons as part of its value", () => {
    expect(props("/* one\n   two */\n.a { background: url(\"data:image/svg+xml;utf8,<svg/>\"); }\n.a { background: none; }")).toEqual(["3:background"]);
  });
});

describe("no CSS file on the site has a declaration that can never apply", () => {
  it.each(cssFiles(join(ROOT, "web/src")).map((f) => [f.slice(ROOT.length), f]))("%s", (_name, f) => {
    expect(deadIn(readFileSync(f, "utf8")).map((d) => `line ${d.line}: ${d.prop} on ${d.selector}${d.at ? ` in ${d.at}` : ""}`)).toEqual([]);
  });
});

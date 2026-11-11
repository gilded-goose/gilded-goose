// The design system page draws the site's components as specimens (web/src/system/Specimens.tsx). A specimen shows a
// look; it never claims a state of the page it sits on. The DD's Questioned line (stack 122): the specimen bar carried
// aria-current="page" on "Shopper", so on the System page a screen reader said "Shopper, current page". The selected
// look comes from data-current instead, which nav.css styles with the live aria-current rules (one rule, two hooks).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../../web/src/${p}`, import.meta.url), "utf8");
/** ARIA state attributes lifted from a live component: the page's state, never a specimen's. */
const LIFTED = /\baria-(current|selected|expanded)\s*=/g;

describe("a specimen never claims the page's state", () => {
  it("finds the bug's own line (the guard can fail)", () => {
    expect('<a href={appHref("?desk=1")} aria-current="page">Shopper</a>'.match(LIFTED)).toHaveLength(1);
    expect('<button aria-expanded={open}>'.match(LIFTED)).toHaveLength(1);
    expect('<a href={appHref("?desk=1")} data-current="">Shopper</a>'.match(LIFTED)).toBeNull();
  });
  it("Specimens.tsx carries no aria-current, aria-selected or aria-expanded", () => {
    expect(read("system/Specimens.tsx").match(LIFTED)).toBeNull();
  });
  it("the specimen bar's selected look is the live one: every bar rule on aria-current also takes data-current", () => {
    const css = read("nav/nav.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const live = [...css.matchAll(/\.dk-layer[^{,]*a\[aria-current\]/g)].map((m) => m[0]);
    expect(live, "nav.css's bar rules name aria-current only through :is([aria-current], [data-current])").toEqual([]);
    expect([...css.matchAll(/\.dk-layer[^{,]*a:is\(\[aria-current\], \[data-current\]\)/g)].length).toBe(3);
    expect(read("system/Specimens.tsx")).toMatch(/<a href=\{appHref\("\?desk=1"\)\} data-current="">Shopper<\/a>/);
  });
});

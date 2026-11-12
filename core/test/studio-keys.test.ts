// Behind the scenes by keyboard (Round 6's accessibility seat, Nov 5): Tab landed on 12 cards' stops no one could see or
// name, and 23 controls were out of reach. AG Studio's model is Tab card to card, Enter into a card, Escape back out, and
// its Enter focuses the card's first element matching ag-stack's FOCUSABLE_SELECTOR that isn't [disabled], .ag-disabled or
// .ag-hidden. Two things broke that: a bare <summary> doesn't match the selector at all, and an inert chart canvas does
// match (AG Charts puts a tabindex proxy inside it), so Enter picked something the browser won't focus and stayed put.
// The walk that proves the whole model needs a browser and a Studio page (`node scripts/studio-keys.ts <url>`, with
// --control and --control-inert to prove it can fail); these pins hold the code, and its whole class, in between.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
// Everything a Studio card can draw: the ledger's parts (its default page) and Studio's own widgets.
const DIRS = ["web/src/ledger", "web/src/studio", "web/src/studio/widgets"];
const sources = DIRS.flatMap((d) =>
  readdirSync(new URL(`../../${d}`, import.meta.url)).filter((f) => f.endsWith(".tsx")).map((f) => ({ f: `${d}/${f}`, s: read(`${d}/${f}`) })),
);
const tags = (s: string, re: RegExp) => [...s.matchAll(re)].map((m) => m[0]);

describe("Studio's cards can be used by keyboard", () => {
  it("reads real sources (the rules below would pass on nothing)", () => {
    expect(sources.length).toBeGreaterThan(10);
    expect(sources.some((x) => /\sinert[\s>]/.test(x.s))).toBe(true);
  });

  it("marks every inert part ag-disabled, so AG's Enter and Tab wrap skip it instead of stalling on it", () => {
    const bad = sources.flatMap(({ f, s }) =>
      tags(s, /<[a-z]+\b[^<>]*\sinert(?=[\s>={])[^<>]*>/g).filter((t) => !/className="[^"]*\bag-disabled\b/.test(t)).map((t) => `${f}: ${t}`),
    );
    expect(bad).toEqual([]);
  });

  it("gives every <summary> a tabindex, since AG's focus selector skips a bare one and its card can't be entered", () => {
    const bad = sources.flatMap(({ f, s }) => tags(s, /<summary\b[^>]*>/g).filter((t) => !/tabIndex=\{0\}/.test(t)).map((t) => `${f}: ${t}`));
    expect(bad).toEqual([]);
    expect(sources.some(({ s }) => /<summary\b/.test(s))).toBe(true);
  });

  it("names each card's stop, calls it a group and says Enter and Escape out loud", () => {
    const studio = read("web/src/studio/Studio.tsx");
    expect(studio).toMatch(/setAttribute\("role", "group"\)/);
    expect(studio).toMatch(/setAttribute\("aria-label"/);
    expect(studio).toMatch(/setAttribute\("aria-describedby", CARD_KEYS_ID\)/);
    expect(studio).toMatch(/<span id=\{CARD_KEYS_ID\} className="st-sr-only">\{CARD_KEYS_SR\}<\/span>/);
    expect(read("web/src/studio/words.ts")).toMatch(/CARD_KEYS_SR = "Press Enter[^"]*Escape/);
  });

  it("draws a line round the card whose stop has keyboard focus, which the view-mode toolbar rule had taken off", () => {
    expect(read("web/src/studio/studio.css")).toMatch(
      /\.ag-studio-layout-widget:has\(> \.ag-studio-layout-widget-focus-container:focus-visible\) > \.ag-studio-layout-widget-container \{ outline: 2px solid/,
    );
  });

  // The fix leans on ag-stack's internal FOCUSABLE_EXCLUDE (.ag-disabled skipped), not a public API, as shipped in
  // ag-studio 3.0.0. An upgrade is the one way it can change under us, so any other version stops the check until the
  // browser walk has been run on it (Lead-12, Nov 5: the walk stays a probe; Q may make it a ci-local step).
  it("holds ag-studio at 3.0.0, the version the keyboard walk proved", () => {
    const want = "3.0.0", again = "re-run scripts/studio-keys.ts";
    const pkg = JSON.parse(read("web/package.json")) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies?.["ag-studio"], `web/package.json's ag-studio moved: ${again}, then set this pin`).toBe(want);
    const installed = new URL("../../web/node_modules/ag-studio/package.json", import.meta.url);
    expect((JSON.parse(readFileSync(installed, "utf8")) as { version: string }).version, `the installed ag-studio isn't ${want}: ${again}`).toBe(want);
  });
});

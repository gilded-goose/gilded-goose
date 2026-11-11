// Round 6b design blocker B2 (Fri Nov 6): Proof's first screen failed our own sw-words probe, 212 words against a line of
// 98 at 1440 and 184 against 69 at 390. The AI-reader lines, "Each code-alone miss…" and "Honest notes still get
// refused…" now sit under one "What the AI reader changed ›"; folding moved those words and changed none.
//
// This is the probe pinned into `pnpm check`. scripts/sw-words.ts measures the drawn screen in a browser, which check
// can't run, so this counts the same thing from the strings the page renders: `.pf-top` is on the first screen whole at
// both widths (sw-words counted 212 of 212 at 1440 before, 109 after the fold, 94 after (a), 66 after the DD's
// reorder), so its words at natural height are the count. (a), Lead-12: the intro line moved under .pf-top and the
// band's h2 is screen-reader-only. The DD's 390 ruling: the 3 and the 2 left .pf-top for a sibling row, never the fold.
// Every word that `.pf-top` shows outside the fold is listed here; a word added above the fold changes the count and
// fails this test until someone decides it belongs there.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BAND_BOUND, BAND_HEAD, BAND_HELD, BAND_READER, BAND_STILL, BAND_TESTS, FAIR_STILL, READER_FOLD, storyBand } from "../src/view/band.ts";
import { claimRows, proofGroups } from "../src/proof.ts";

const ROOT = new URL("../../", import.meta.url).pathname;
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const PROOF = read("web/src/Proof.tsx");
const FLAT = PROOF.replace(/\s+/g, " ");
const SETS = read("web/src/charts/BlindSets.tsx");
const CSS = read("web/src/proof.css");
const band = storyBand(proofGroups(claimRows(read("docs/claims.md"))));
/** sw-words' rule: whitespace-split tokens holding a letter or a digit ("›" and a lone "," don't count). */
const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const between = (src: string, re: RegExp) => re.exec(src)?.[1] ?? "";
/** Every stylesheet under web/src, so a rule that hides the promise can't hide in a file nobody thought to check. */
const allCss = (dir = "web/src"): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? allCss(`${dir}/${e.name}`) : e.name.endsWith(".css") ? [read(`${dir}/${e.name}`)] : [],
  );

/** The text `.pf-top` shows with the fold closed, block by block, in reading order. */
function topBlocks(): Record<string, string[]> {
  const t = band.tests;
  return {
    title: [between(PROOF, /<h1 id="pf-h">([^<]+)<\/h1>/)],
    caption: [BAND_TESTS],
    table: [...t.sets, ...t.rows.flatMap((r) => [r.say, ...r.cells.map((c) => c.figure)])],
    promise: [BAND_STILL],
    summary: [READER_FOLD],
  };
}
const topText = () => Object.values(topBlocks()).flat();

/** The DD's line for Proof's first section (scripts/sw-words.ts SW_BUDGET.proof). */
const LINE = { 1440: 98, 390: 69 } as const;
/** What sw-words measured on this commit's build: 66 at both widths, under both lines. Pinned, so it only falls. */
const REACHED = { 1440: 66, 390: 66 } as const;

describe("Proof's first screen (round 6b B2)", () => {
  it("the line here is sw-words' own line, so the two can't drift apart", () => {
    expect(read("scripts/sw-words.ts")).toContain(`proof: { path: "?desk=proof", ready: "main", scope: ".pf-top", 1440: ${LINE[1440]}, 390: ${LINE[390]} }`);
  });

  it(`.pf-top shows ${REACHED[390]} words with the fold closed, down from 212, under the lines of 98 and 69`, () => {
    const t = topText();
    expect(t.every((s) => s.length > 0)).toBe(true);
    expect(words(t.join(" "))).toBe(REACHED[1440]);
    expect(words(t.join(" "))).toBe(REACHED[390]);
    expect(REACHED[1440]).toBeLessThanOrEqual(LINE[1440]);
    expect(REACHED[390]).toBeLessThanOrEqual(LINE[390]);
  });

  it("each block's words are named, so the next change starts from the arithmetic, not a guess", () => {
    const counts = Object.fromEntries(Object.entries(topBlocks()).map(([k, v]) => [k, words(v.join(" "))]));
    expect(counts).toEqual({ title: 1, caption: 12, table: 36, promise: 12, summary: 5 });
    // Outside .pf-top, below the intro line at 1080 px and under: the 3 (11 words) and the 2 (17).
    expect(words(`${band.runs.count} ${band.runs.say}`)).toBe(11);
    expect(words(`${band.webhooks.figure} ${band.webhooks.say}`)).toBe(17);
  });

  it("the promise line never folds, at any width: \"21 of 59 through\" is the biggest figure, and only the promise reframes it", () => {
    // 1. In markup it follows the table straight, outside the <details>, so no fold state can take it.
    expect(SETS).toMatch(/<\/table>\s*<p className="bs-still">\{BAND_STILL\}<\/p>\s*\{fold \? <details className="bs-fold">/);
    expect(between(SETS, /const under = \(([\s\S]*?)\n {2}\);/)).not.toContain("BAND_STILL");
    // 2. No stylesheet, at any media width, hides or clips it.
    for (const css of allCss()) {
      for (const [, body] of css.matchAll(/[^{}]*\.bs-still[^{}]*\{([^}]*)\}/g)) {
        expect(body).not.toMatch(/display:\s*none|visibility:\s*hidden|clip-path|max-height:\s*0|height:\s*0|opacity:\s*0[;\s]|position:\s*absolute/);
      }
    }
    // 3. It is counted inside .pf-top with the table it reframes, so it can't slip under the first screen's line.
    expect(topBlocks().promise).toEqual([BAND_STILL]);
    expect(topBlocks().table!.join(" ")).toMatch(/\b\d+ of \d+\b/);
    expect(BAND_STILL).toBe("Through the Watcher isn't paid: your limit and your tap still decide.");
  });

  it("the DD's reorder: one copy of the 3 and the 2, a sibling of .pf-top and never inside the reader's fold", () => {
    expect(FLAT).toMatch(/<div className="pf-lead"> <div className="pf-top"> <section className="pf-intro"[^]*?<Band \/> <\/div> <Stats \/> \{\/\*[^]*?\*\/\} <p className="pf-how">Re-checked on every commit\. Tap a number for its source\.<\/p> <div className="pf-card dk-glass" aria-hidden="true" \/> <\/div>/);
    expect(FLAT.match(/<Stats \/>/g)).toHaveLength(1);
    expect(FLAT.match(/className="pf-stats"/g)).toHaveLength(1);
    const bandFn = between(PROOF, /function Band\(\) \{([\s\S]*?)\n\}/);
    expect(bandFn).not.toMatch(/runs|webhooks|pf-stats/);
    // One grid places them; under 1081 px the 3 and the 2 come after the intro line, side by side.
    expect(CSS).toContain('grid-template-areas: "intro" "band" "how" "stats";');
    expect(CSS).toContain('grid-template-areas: "intro intro" "band stats" "how how";');
    expect(CSS).toMatch(/\.pf-stats \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[^}]*\}/);
    // The DD's 1440 nit: each column's divider is only as tall as its words.
    expect(CSS).toMatch(/\.pf-stats \{[^}]*align-items: start;[^}]*\}/);
  });

  it("(a): the band's h2 stays a heading, hidden the way sw-words and axe expect", () => {
    expect(PROOF).toContain('<h2 id="pf-band-h" className="pf-sr">{BAND_HEAD.replace(/\\.$/, "")}</h2>');
    expect(PROOF).toContain('<section className="pf-band" aria-labelledby="pf-band-h">');
    expect(CSS).toContain(".pf .pf-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%);");
    expect(BAND_HEAD).toBe("What we've checked so far.");
  });

  it("the reader lines, both after-lines and FAIR_STILL sit under the fold", () => {
    expect(SETS).toMatch(/<\/table>\s*<p className="bs-still">\{BAND_STILL\}<\/p>\s*\{fold \? <details className="bs-fold"><summary>\{fold\} <span aria-hidden="true">›<\/span><\/summary>\{under\}<\/details> : under\}/);
    const under = between(SETS, /const under = \(([\s\S]*?)\n {2}\);/);
    for (const must of ['className="bs-reader"', 'className="bs-after">{tests.after.join(" ")}', "{children}"]) expect(under).toContain(must);
    expect(band.tests.after).toEqual([BAND_HELD, BAND_BOUND]);
    expect(FLAT).toContain('<BlindSets tests={b.tests} href={(id) => `#${anchorOf(id)}`} fold={READER_FOLD}> <p className="bs-after">{FAIR_STILL}</p> </BlindSets>');
  });

  it("folding moved words and changed none: every folded sentence is still on the page, word for word", () => {
    expect(READER_FOLD).toBe("What the AI reader changed");
    expect(FAIR_STILL.startsWith("Honest notes still get refused.")).toBe(true);
    expect(BAND_HELD).toBe("Each code-alone miss was held instead.");
    expect(Object.values(BAND_READER)).toEqual(["AI reader on:", "scam notes through,", "fair notes refused,", "held."]);
    expect(band.tests.readers.map((r) => r.set)).toEqual(band.tests.sets);
  });

  it("the landing's band doesn't fold: its word ceiling is its own, with one reader line", () => {
    const landing = read("web/src/desk/story/Band.tsx");
    expect(landing).toMatch(/<BlindSets [^>]*readers=\{1\}/);
    expect(landing).not.toMatch(/<BlindSets [^>]*fold=/);
  });
});

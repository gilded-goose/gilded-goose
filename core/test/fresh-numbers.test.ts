// Joshua (Wed Nov 4, section 4): "show it next to the old one, each labeled with its set and date, never just the better
// one." The stored first run is the record; these tests keep the two sets together on every surface that names either.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BLIND_READERS, BLIND_ROWS, BLIND_SETS, storyBand } from "../src/view/band.ts";
import { claimRows, proofGroups } from "../src/proof.ts";

const ROOT = new URL("../../", import.meta.url).pathname;
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const STORED = JSON.parse(read("docs/fixtures/sealed-8-first-run.json")) as { written: string; rulesAt: string; rows: { set: string; group: string; note: string; code: string; withReader?: string }[] };
const ROWS = claimRows(read("docs/claims.md"));
const value = (id: string) => ROWS.find((r) => r.id === id)!.value;
const count = (set: string, code: string) => STORED.rows.filter((r) => r.set === set && r.code === code).length;

/** Everything a visitor or judge reads, source and docs, without the private history (notes, inbox, Guild logs). */
function publicText(): [string, string][] {
  const walk = (d: string): string[] => readdirSync(join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : /\.(tsx?|md)$/.test(e.name) ? [join(d, e.name)] : []));
  return ["README.md", "docs/devpost.md", "docs/video-shot-list.md", "docs/claims.md", ...walk("docs/launch"), ...walk("core/src"), ...walk("web/src"), ...walk("server/src")].filter((f) => existsSync(join(ROOT, f))).map((f) => [f, read(f).replace(/\s+/g, " ")]);
}

describe("the fresh blind set beside the old one (Nov 4)", () => {
  it("the stored first run is what the rows say: 21 of 59 through, 9 of 30 fair held, 0 refused, 89 different notes", () => {
    expect(STORED.written).toBe("Wed Nov 4 2026");
    expect([count("asks", "clear"), count("asks", "hold"), count("asks", "refuse")]).toEqual([21, 29, 9]);
    expect([count("fair", "clear"), count("fair", "hold"), count("fair", "refuse")]).toEqual([21, 9, 0]);
    expect(new Set(STORED.rows.map((r) => r.note)).size).toBe(89);
    expect([value("fresh-code-through"), value("fresh-fair-held"), value("fresh-fair-refused")]).toEqual(["21 of 59", "9 of 30", "0 of 30"]);
  });

  it("every row of the band's table has a figure for both sets, like for like: code alone on both sides", () => {
    const b = storyBand(proofGroups(ROWS));
    expect(BLIND_SETS).toEqual(["Nov 4 set", "Oct 28 set"]);
    expect(b.tests.rows.map((r) => r.cells.map((c) => c.figure))).toEqual([["21 of 59", "19 of 60"], ["9 of 30", "5 of 40"], ["0 of 30", "0 of 40"]]);
    for (const r of BLIND_ROWS) expect(r.say).not.toMatch(/reader/i);
  });

  it("the AI reader's run is stored, note by note, and its catch is never apart from what it cost", () => {
    const withR = (set: string, v: string) => STORED.rows.filter((r) => r.set === set && r.withReader === v).length;
    expect([withR("asks", "clear"), withR("asks", "hold"), withR("asks", "refuse")]).toEqual([0, 24, 35]);
    expect([withR("fair", "clear"), withR("fair", "hold"), withR("fair", "refuse")]).toEqual([15, 11, 4]);
    expect(STORED.rows.every((r) => r.withReader !== undefined)).toBe(true);
    const b = storyBand(proofGroups(ROWS));
    expect(b.tests.readers.map((r) => [r.set, r.through.figure, r.refused.figure, r.held.figure])).toEqual([["Nov 4 set", "0 of 59", "4 of 30", "11 of 30"], ["Oct 28 set", "0 of 60", "0 of 40", "8 of 40"]]);
    expect(BLIND_READERS.map((r) => r.set)).toEqual([...BLIND_SETS]);
    // The landing has a word ceiling, so it keeps one reader line: the newest set's, the one with the 4 refused. Never the
    // easier set's alone; Proof shows every set.
    expect(BLIND_SETS[0]).toBe("Nov 4 set");
    // The lines under the table sit on Proof too, whose `.pf p { margin: 0 }` ate their gaps (DD seat 5's follow-up): two classes beat it.
    for (const c of ["bs-still", "bs-reader", "bs-after"]) expect(read("web/src/charts/blind-sets.css")).toContain(`.bs .${c} { margin:`);
    // The DD (seat 5): a catch rate never without what still stands, straight after the table, before the reader's lines.
    expect(read("web/src/charts/BlindSets.tsx")).toMatch(/<\/table>\s*<p className="bs-still">\{BAND_STILL\}<\/p>/);
    expect(read("web/src/desk/story/Band.tsx")).toMatch(/<BlindSets [^>]*readers=\{1\}/);
    expect(read("web/src/Proof.tsx")).not.toMatch(/<BlindSets [^>]*readers=/);
    // Lead-10's rule (Wed Nov 4): the zero and the four, same line, wherever a visitor or judge reads the zero.
    const lines = publicText().flatMap(([f, t]) => t.split("\n").filter((l) => /\b0 of 59\b/.test(l)).map((l) => [f, l] as const));
    expect(lines.length).toBeGreaterThan(0);
    for (const [f, l] of lines) if (!/core\/src\/|web\/src\/charts\/BlindSets/.test(f)) expect([f, l.includes("4 of 30")]).toEqual([f, true]);
    expect(publicText().filter(([, t]) => /\b0 (scams? )?(notes? )?got through\b/i.test(t)).map(([f]) => f)).toEqual([]);
    // In the dots the same: the reader's scam row carries the fair notes refused beside it.
    expect(read("web/src/charts/BlindDots.tsx")).toMatch(/figure=\{item\("fresh-reader-through"\)\}[^\n]*beside=\{\{ figure: item\("fresh-reader-fair-refused"\)/);
  });

  it("no surface names the old set's code-alone number without the new one", () => {
    const quotes = publicText().filter(([f, t]) => /19 of 60/.test(t) && !/^(docs\/claims|docs\/video-shot-list|docs\/launch\/surface-words|docs\/launch\/shot|core\/src\/proof|docs\/launch\/kit)/.test(f));
    expect(quotes.length).toBeGreaterThan(0);
    for (const [f, t] of quotes) expect([f, t.includes("21 of 59")]).toEqual([f, true]);
  });

  it("the wrong figure never ships: C found 21 was never the baseline for 13 of 45", () => {
    const WRONG = /\b21\b[^.]{0,24}(?:\bdown to|\bto|→|->)\s*13\b|\b13 of 45\b/;
    expect("21 down to 13 of 45").toMatch(WRONG);
    expect("21 → 13").toMatch(WRONG);
    expect("21 of 59").not.toMatch(WRONG);
    expect(publicText().filter(([, t]) => WRONG.test(t)).map(([f]) => f)).toEqual([]);
  });

  it("the first section's start is one set of words in one box from the first paint on, with nothing that jumps", () => {
    const start = read("web/src/desk/story/ChallengeStart.tsx");
    const challenge = read("web/src/desk/story/Challenge.tsx");
    const slot = read("web/src/desk/story/TrickSlot.tsx");
    const landing = read("web/src/desk/story/index.tsx");
    expect(start).toContain(`CH_HEAD = "Try to trick Goose."`);
    expect(challenge).toContain("<ChallengeLines />");
    expect(challenge).not.toContain("Try to trick Goose.");
    // Every wait draws the same start: the story's chunk and the Challenge's own chunk both draw the Challenge's (it leads,
    // right under the ask, since Joshua's Fri Nov 6 9:35 AM decision 1a). A shorter holder would let the section under it
    // onto the first screen and jump it away when the story lands (0.13 layout shift, Nov 4).
    expect(landing).toContain(`<Suspense fallback={<div className="ds"><ChallengeStart /></div>}>`);
    expect(landing).toContain(`<Kept or={<div className="ds"><ChallengeStart /></div>}>`);
    expect(landing).not.toContain("<PromisesStart />");
    expect(read("web/src/desk/story/Promises.tsx")).toContain("<PromisesLines />");
    expect(slot).toContain("<Suspense fallback={<ChallengeStart />}>");
    expect(start).toContain(`style={{ minHeight: "100vh" }}`);
    // The build stops if the first paint loses it, and the sheet that draws it (its number too) is the one the first paint has.
    expect(read("web/prerender.ts")).toContain(`deskPaint.includes('id="ds-ch-h"')`);
    expect(read("web/src/desk/story/hero.css")).toContain(".ds .ds-n::before { content: counter(ds-n, decimal-leading-zero);");
    const hero = read("web/src/desk/story/hero.css");
    for (const rule of [".ds-sec {", ".ds-h2 {", ".ds-lede {", ".ds-ch {", ".ds-ch-side {"]) {
      expect(hero, rule).toContain(rule);
      expect(read("web/src/desk/story/story.css") + read("web/src/desk/story/challenge.css"), rule).not.toContain(`\n${rule}`);
    }
  });

  it("under 430 px the line under the headline paints with it, and no promise is held on one line: the longest wraps, and the short two have room (phone-first-screen.ts counts the rows in both faces)", () => {
    expect(read("web/prerender.ts")).toContain(`.dk[data-first] .dk-hero-copy>.dk-sub{visibility:visible}`);
    expect(read("web/first-fit.ts")).not.toContain("white-space:nowrap");
  });

  it("the phone's headline is on the scale under 430 px, at 30, and the section heads stay under it at 24", () => {
    const css = read("web/src/desk/story/hero.css");
    const m = /@media \(max-width: 430px\) \{([^]*?)\n\}/.exec(css);
    expect(m?.[1]).toMatch(/\.dk-hero h1 \{ font-size: min\(var\(--t-h2\), 7\.8vw\);/);
    expect(css).toContain("@media (max-width: 430px) { .ds-h2 { font-size: var(--t-sec); } }");
    expect(read("web/src/desk/tokens.css")).toMatch(/--t-sec: 24px;/);
  });
});

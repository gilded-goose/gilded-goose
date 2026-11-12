// Track B session 10 (DD, B-9 ruling 2a): the landing's first-paint fits are true only for the words they were measured
// on, so the build (web/prerender.ts) throws when the hero's words differ. This runs the same check on hero markup in
// the shape React's server render gives (story/index.tsx's Landing; Desk.tsx's lede), and pins it to the real sources.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIT_H1, FIT_LEDE, FIT_WORDS, SOURCE_PATH, fitCss, fitWordsChanged, heroWords } from "../../web/first-fit.ts";
import { PROMISES, curly } from "../src/view/promises.ts";

const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const span = (l: string, i: number) => `<span class="dk-mask" aria-hidden="true"><span style="--i:${i}">${l}</span></span>`;
const paint = (h1: readonly string[], lede: string = FIT_WORDS.lede) =>
  `<div class="dk" data-first=""><nav class="gn">…</nav><main class="dk-wrap"><section class="dk-hero"><div class="dk-hero-copy">` +
  `<h1 aria-label="${h1.join(" ")}">${h1.map(span).join("")}</h1><p class="dk-sub">${lede}</p></div></section></main></div>`;
const desk = (lede: string = FIT_WORDS.lede) => `          <p className="dk-sub">${lede}</p>\n`;

describe("the landing's fit is pinned to its words (B-10)", () => {
  it("passes_on_the_words_it_was_measured_on", () => {
    expect(fitWordsChanged(paint(FIT_WORDS.h1), desk())).toBeNull();
    // entities as React's server render writes them decode before the compare
    expect(heroWords(`<h1>${span("Goose&#x27;s &amp; you.", 0)}</h1>`, "").h1).toEqual(["Goose's & you."]);
  });

  it("throws_loudly_when_an_h1_line_changes", () => {
    const msg = fitWordsChanged(paint([FIT_WORDS.h1[0], "Goose can't overpay.", FIT_WORDS.h1[2]]), desk());
    expect(msg).toContain(`h1 line 2 reads "Goose can't overpay.", the fit was measured on "Goose can’t overspend."`);
    expect(msg).toContain("scripts/fit-shift.ts");
    expect(msg).toContain("web/first-fit.ts");
  });

  it("throws_when_a_line_is_added_or_dropped (the fits are per nth-child)", () => {
    expect(fitWordsChanged(paint([FIT_WORDS.h1[0], FIT_WORDS.h1[1]]), desk())).toContain("the h1 has 2 line(s)");
    expect(fitWordsChanged(paint([...FIT_WORDS.h1, "Promise."]), desk())).toContain("the h1 has 4 line(s)");
  });

  it("throws_when_either_lede_changes (the first paint's, or the Desk's that React draws over it)", () => {
    expect(fitWordsChanged(paint(FIT_WORDS.h1, "Goose compares sellers."), desk())).toContain("the first paint's lede reads");
    expect(fitWordsChanged(paint(FIT_WORDS.h1), desk("Goose compares sellers."))).toContain("Desk.tsx's lede reads");
    expect(fitWordsChanged(paint(FIT_WORDS.h1), "const sub = words;")).toContain("Desk.tsx has 0 lede(s)");
  });

  it("the_real_sources_still_say_the_pinned_words", () => {
    // The h1's lines are the promises' heads (Landing maps them); the lede is Desk.tsx's and the first paint's own <p>.
    expect(FIT_WORDS.h1).toEqual(PROMISES.map((p) => curly(p.head)));
    expect(heroWords("", src("web/src/desk/Desk.tsx")).deskLede).toEqual([FIT_WORDS.lede]);
    expect(heroWords(src("web/src/desk/first-paint.tsx").replaceAll("className=", "class="), "").lede).toEqual([FIT_WORDS.lede]);
  });

  it("the_fit_css_carries_one_rule_per_line_and_the_lede", () => {
    const css = fitCss();
    FIT_H1.forEach((em, i) => expect(css).toContain(`.dk-mask:nth-child(${i + 1})>span{letter-spacing:calc(var(--track-display) + ${em})}`));
    expect(css).toContain(`html[data-first-fit] .dk-hero .dk-sub{letter-spacing:${FIT_LEDE.letterSpacing};word-spacing:${FIT_LEDE.wordSpacing}}`);
    expect(src("web/prerender.ts")).toContain("fitWordsChanged(deskPaint");
  });
});

describe("the build's source-path guard (B-9 nit, widened in B-10)", () => {
  it("catches_a_source_path_in_any_quoting", () => {
    for (const leak of [`<img src="/src/desk/egg.webp">`, `<img src='/src/desk/egg.webp'>`, `background:url(/src/desk/egg.webp)`, `<img src=/src/desk/egg.webp>`])
      expect([leak, SOURCE_PATH.test(leak)]).toEqual([leak, true]);
  });
  it("leaves_built_paths_and_prose_alone", () => {
    for (const ok of [`<img src="/assets/egg-DdwZ4i0B.webp">`, `see web/src/desk for the source`, `a/src/b`])
      expect([ok, SOURCE_PATH.test(ok)]).toEqual([ok, false]);
  });
});

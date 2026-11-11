// The numbered landing (Joshua, Thu Nov 5 6:20 PM): six calm sections, each a small label, one headline, a few plain
// sentences and a hairline. His order since Fri Nov 6 9:35 AM (decision 1a: "right under the ask, as the first thing after
// it"): try to trick it, the promises, a week with Goose, the thesis, what Goose keeps, for builders. The numbers are a CSS counter, so these tests pin the order of the mounts and the one class that counts, and
// that sections 04 to 06 type no word of their own (they mount core's thesis words, which Devpost says too).

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ATTEMPT_RULES, ATTEMPT_VERDICTS, NETWORK_FULL, THREAT_TYPES, TYPE_WORDS } from "../src/judge/attempts.ts";
import { COUNT_AWAY, challengeWords } from "../src/judge/count-words.ts";
import { FEED_HEAD, FEED_NOTE, FEED_ROWS, LAYERS_HEAD, THREE_LAYERS, agoWords, rowLayerWords } from "../src/view/layers.ts";
import { greeting } from "../src/view/name.ts";
import { DOESNT_LINE, KEPT_HEAD, KEPT_LINES, THESIS_LINES, THESIS_QUOTE } from "../src/view/thesis.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const STORY = "web/src/desk/story";
/** Each numbered section's mount in Story.tsx, in Joshua's order. */
const SIX = ["<TrickSlot />", "<Promises onAsk={onAsk} />", "<Week moments={WEEK} />", "<Thesis />", "<KeptNote />", "<ForBuilders />"] as const;
const at = (src: string, tags: readonly string[]) => tags.map((t) => src.indexOf(t));
/** The live counter and feed's cap, as pinned Thu Nov 5: it only goes down. */
const LIVE_PIN = 139;

describe("the numbered landing", () => {
  it("six_in_joshuas_order: the six mount in his order, the challenge first under the hero; Impact stays right after the Challenge and the missing layer under Why now", () => {
    const story = read(`${STORY}/Story.tsx`);
    const pos = at(story, SIX);
    for (const [i, p] of pos.entries()) expect(p, SIX[i]).toBeGreaterThan(0);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
    // The first section under the hero is 01, the challenge, and what follows 06 has no number.
    expect(story.indexOf("<div className=\"ds\" ref={root}>\n      <TrickSlot />\n      <Impact />\n      <Promises onAsk={onAsk} />")).toBeGreaterThan(0);
    expect(story).toMatch(/<Week moments=\{WEEK\} \/>\s*<Thesis \/>\s*<MissingLayer \/>\s*<KeptNote \/>\s*<ForBuilders \/>\s*<Steps /);
    // Control: the Nov 5 6:20 PM order, the promises and the week first, fails the sort.
    const old = at("<Promises onAsk={onAsk} />\n<Week moments={WEEK} />\n<TrickSlot />\n<Impact />\n<Thesis />\n<KeptNote />\n<ForBuilders />", SIX);
    expect([...old].sort((a, b) => a - b)).not.toEqual(old);
  });

  it("numbers_are_counted_not_typed: one .ds-n label per numbered section, the counter in the first paint's sheet, no digits typed", () => {
    const files = readdirSync(new URL(`../../${STORY}`, import.meta.url)).filter((f) => f.endsWith(".tsx"));
    const labels = Object.fromEntries(files.map((f) => [f, (read(`${STORY}/${f}`).match(/ds-eyebrow ds-n"/g) ?? []).length]).filter(([, n]) => n));
    // TrickSlot's is the link it draws only when the Challenge can't, so it keeps 01 and the sections under it keep theirs.
    expect(labels).toEqual({ "Calm.tsx": 3, "ChallengeStart.tsx": 1, "PromisesStart.tsx": 1, "TrickSlot.tsx": 1, "Week.tsx": 1 });
    const hero = read(`${STORY}/hero.css`);
    for (const rule of [".ds { counter-reset: ds-n; }", ".ds .ds-n { counter-increment: ds-n; }", ".ds .ds-n::before { content: counter(ds-n, decimal-leading-zero);"]) expect(hero).toContain(rule);
    expect(read(`${STORY}/story.css`)).not.toMatch(/counter-(reset|increment)/);
    for (const f of files) expect(read(`${STORY}/${f}`), f).not.toMatch(/>\s*0[1-6]\b/);
  });

  it("calm_sections_type_no_words: 04 to 06 mount core's thesis words and the builders page's own, and each word is one Devpost says", () => {
    const calm = read(`${STORY}/Calm.tsx`);
    // No word between tags (the › arrow is decoration, hidden from screen readers): every word is a constant from elsewhere.
    expect(calm.match(/>[^<>{}]*\p{L}[^<>{}]*</gu)).toBeNull();
    for (const mount of ["{THESIS_LABEL}", "{THESIS_QUOTE}", "THESIS_LINES.map(", "{KEPT_LABEL}", "{KEPT_HEAD}", "KEPT_LINES.map(", "{KEPT_FOLD}", "href={`#${KEPT_ID}`}", "{DOESNT_LABEL}", "{DOESNT_LINE}", "{BUILDERS_TITLE}", "{BUILDERS_LEAD}", "{CODE_HEAD}", "appHref(BUILDERS_HREF)"]) expect(calm, mount).toContain(mount);
    const devpost = read("docs/devpost.md").replace(/\s+/g, " ");
    for (const line of [THESIS_QUOTE, ...THESIS_LINES, KEPT_HEAD, ...KEPT_LINES, DOESNT_LINE]) expect(devpost, line).toContain(line);
    // Control: a typed word between tags is caught.
    expect("<p>Why now</p>".match(/>[^<>{}]*\p{L}[^<>{}]*</gu)).not.toBeNull();
  });

  it("word_ceiling_only_tightens: the walk holds the landing's words to the ceiling measured when it was set, and fails over it", () => {
    const walk = read("scripts/desk-walk.ts");
    const CEIL = /const LANDING_WORDS = \{ 1440: (\d+), 390: (\d+) \} as const;/;
    const m = CEIL.exec(walk);
    expect(m, "desk-walk.ts lost LANDING_WORDS").not.toBeNull();
    // Set Thu Nov 5 (DD and Lead-12) on the commit that cut Impact's eyebrow: page 1421 / 1412, 46 of them the live counter
    // and feed. Lower these when the page shrinks; never raise them.
    expect(Number(m![1])).toBeLessThanOrEqual(1375);
    expect(Number(m![2])).toBeLessThanOrEqual(1366);
    // The whole page too (Lead-12 and S, Thu Nov 5): the DD's budget counts the whole page. Set at 1421 / 1412, read only in
    // the blank first state (counter blank, feed showing its layers), so tries on a server can't move it.
    const PAGE = /const LANDING_PAGE_WORDS = \{ 1440: (\d+), 390: (\d+) \} as const;/;
    const pg = PAGE.exec(walk);
    expect(pg, "desk-walk.ts lost LANDING_PAGE_WORDS").not.toBeNull();
    expect(Number(pg![1])).toBeLessThanOrEqual(1421);
    expect(Number(pg![2])).toBeLessThanOrEqual(1412);
    for (const bit of ['else if (n.page > LANDING_PAGE_WORDS[width]) fail(', 'if (n.feed !== "layers" || (n.counter !== "blank" && n.counter !== "0")) fail(']) expect(walk, bit).toContain(bit);
    expect(Number(PAGE.exec(walk.replace(/PAGE_WORDS = \{ 1440: \d+/, "PAGE_WORDS = { 1440: 1422"))![1]) <= 1421).toBe(false);
    // After a slow full scroll (DD ACCEPT, Thu Nov 5): calm 1473 / 1464. R's re-check read the whole scrolled page, 1535 / 1526;
    // that is the same page with the 62 live words in, so the two agree. The walk pins calm and prints the whole page.
    const SCROLLED = /const LANDING_SCROLLED_WORDS = \{ 1440: (\d+), 390: (\d+) \} as const;/;
    const sc = SCROLLED.exec(walk);
    expect(sc, "desk-walk.ts lost LANDING_SCROLLED_WORDS").not.toBeNull();
    // Tightened to 1472 / 1463 (Lead-12 and R, Fri Nov 6), once the clock made it hour-safe: what T's range line measures.
    expect(Number(sc![1])).toBeLessThanOrEqual(1472);
    expect(Number(sc![2])).toBeLessThanOrEqual(1463);
    expect(walk).toContain("if (s.calm > LANDING_SCROLLED_WORDS[width]) fail(");
    expect(walk).toContain("scrollBy(0, Math.round(innerHeight * 0.8))");
    for (const bit of ['if (n.calm > LANDING_WORDS[width]) fail(', 'if (n.numbered !== 6) fail(', '".ds-ch-count, .ds-ch-feed"', '[[1440, 900], [390, 844]]']) expect(walk, bit).toContain(bit);
    // The walk runs in CI and ci-local, so the ceiling is enforced, not only written down.
    expect(read(".github/workflows/check.yml")).toContain("node scripts/desk-walk.ts");
    // Control: the same source with the desktop ceiling raised by one word reads over the pin.
    const raised = CEIL.exec(walk.replace(/1440: \d+, 390/, "1440: 1376, 390"));
    expect(Number(raised![1]) <= 1375).toBe(false);
  });
  it("live_words_capped: the counter and feed are capped on their own, at the most words they can draw (5 rows, the longest words)", () => {
    const walk = read("scripts/desk-walk.ts");
    const LIVE = /const LANDING_LIVE_WORDS = (\d+);/.exec(walk);
    expect(LIVE, "desk-walk.ts lost LANDING_LIVE_WORDS").not.toBeNull();
    const cap = Number(LIVE![1]);
    const W = (t: string) => t.split(/\s+/).filter((x) => /[\p{L}\d]/u.test(x)).length;
    const most = (xs: readonly string[]) => Math.max(...xs.map(W));
    // The counter: every fold shape, with and without the scammer AI, plus the full-network note under it.
    const folds = [0, 1, 2, 1234].flatMap((tried) => [0, 1, tried].flatMap((setAside) => [0, 1, 2].flatMap((paid) => [0, 1, tried].map((byAi) => ({ tried, setAside, paid, byPerson: tried - byAi, byAi })))));
    const counter = Math.max(W(COUNT_AWAY), ...folds.flatMap((c) => [false, true].map((on) => { const w = challengeWords(c, on); return W(`${w.tries} ${w.outcome ?? ""}`) + W(w.second); }))) + W(NETWORK_FULL);
    // The feed: its three layers, or FEED_ROWS tries, each with the longest verdict, time, kind and layer words.
    const verdictWords = [...read("web/src/studio/board-read.ts").match(/VERDICT_WORDS[^=]*= \{([^}]*)\}/)![1]!.matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1]!);
    expect(verdictWords.length).toBe(ATTEMPT_VERDICTS.length);
    const now = Date.UTC(2026, 10, 5, 12);
    const row = most(verdictWords) + most([0, 59, 23 * 60, 40 * 24 * 60].map((m) => agoWords(now - m * 60_000, now))) + most(THREAT_TYPES.map((t) => TYPE_WORDS[t])) + most(ATTEMPT_VERDICTS.flatMap((v) => ATTEMPT_RULES.map((r) => rowLayerWords(v, r))));
    const layers = W(LAYERS_HEAD) + THREE_LAYERS.reduce((s, l) => s + W(l.name) + W(l.words), 0);
    const feed = Math.max(layers, W(FEED_HEAD) + W(FEED_NOTE) + FEED_ROWS * row);
    const worst = counter + feed;
    // Pinned Thu Nov 5 (DD ACCEPT, R: "measure 5 full rows with the longest words and pin that"): the cap covers the worst case
    // exactly, so a busy server never fails the walk, and a longer word in either part fails here until the DD rules on it.
    expect(worst).toBeLessThanOrEqual(cap);
    expect(cap).toBeLessThanOrEqual(LIVE_PIN);
    expect(cap).toBe(worst);
    for (const bit of ["if (n.live > LANDING_LIVE_WORDS) fail(", "if (s.live > LANDING_LIVE_WORDS) fail("]) expect(walk, bit).toContain(bit);
    // Control: a sixth row would read over the cap.
    expect(counter + W(FEED_HEAD) + W(FEED_NOTE) + (FEED_ROWS + 1) * row <= cap).toBe(false);
  });
  it("clock_fixed_at_the_longest_greeting: the walk reads the landing at the hour of core's longest greeting, so no hour reads short", () => {
    // Found Fri Nov 6 00:04: the same build read 1421 at 21:00 and 1420 after midnight, since "Good evening." (2 words) is
    // "Hello." (1) from 00:00 to 04:59. Every ceiling was measured at a 2-word greeting, so the walk installs the page clock at
    // that hour (Lead-12 and R): a night run counts what a daytime reader sees, and a longer greeting fails here first.
    const W = (t: string) => t.split(/\s+/).filter((x) => /[\p{L}\d]/u.test(x)).length;
    const byHour = Array.from({ length: 24 }, (_, h) => W(greeting(h, null)));
    expect(Math.max(...byHour)).toBe(2);
    const hour = byHour.indexOf(Math.max(...byHour));
    expect(W(greeting(hour, null))).toBe(2);
    expect(byHour[0]).toBeLessThan(2); // the night greeting is the short one this guards against
    const walk = read("scripts/desk-walk.ts");
    for (const bit of [
      'import { greeting } from "../core/src/view/name.ts";',
      "landingWordCount(greeting(h, null)) > landingWordCount(greeting(best, null)) ? h : best), 0);",
      "Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), LANDING_GREETING_HOUR, 30)",
      'reducedMotion: "reduce", timezoneId: "UTC" });\n  const p = await ctx.newPage();\n  await p.clock.install({ time: landingNow() });\n  await p.goto(`${url}/?desk=1`',
    ]) expect(walk, bit).toContain(bit);
    // Control: the step without its clock line is caught.
    expect(walk.replace("  await p.clock.install({ time: landingNow() });\n", "")).not.toContain("await p.clock.install({ time: landingNow() });");
  });

  it("live_pins_only_tighten: the live walk holds what a judge on live reads to the counts measured on live, GET only, and fails over them", () => {
    const live = read("scripts/live-walk.ts");
    const pin = (name: string) => { const m = new RegExp(`const ${name} = \\{ 1440: (\\d+), 390: (\\d+) \\} as const;`).exec(live); expect(m, `live-walk.ts lost ${name}`).not.toBeNull(); return [Number(m![1]), Number(m![2])]; };
    // Measured on live 63750e36, Fri Nov 6 11:49Z (Lead-12 and R): the seat's pins plus what live draws with Studio, PayPal's
    // sandbox and the scammer AI on (+4 first load, +37 scrolled). Lower these when live shrinks; never raise them. The DD rules
    // on whether those words stand (Lead-12's DD list).
    const [fc1440, fc390] = pin("LIVE_FIRST_CALM"), [fp1440, fp390] = pin("LIVE_FIRST_PAGE"), [sc1440, sc390] = pin("LIVE_SCROLLED_CALM");
    expect([fc1440! <= 1379, fc390! <= 1370, fp1440! <= 1425, fp390! <= 1416, sc1440! <= 1509, sc390! <= 1500]).toEqual([true, true, true, true, true, true]);
    // It reads the way desk-walk reads, on the same fixed clock, and fails over each pin.
    for (const bit of ['".ds-ch-count, .ds-ch-feed"', "await p.clock.install({ time: fixedNow() });", "scrollBy(0, Math.round(innerHeight * 0.8))",
      "n.calm <= LIVE_FIRST_CALM[w]", "n.page <= LIVE_FIRST_PAGE[w]", "s.calm <= LIVE_SCROLLED_CALM[w]", "n.numbered === 6", "process.exit(fails ? 1 : 0);"]) expect(live, bit).toContain(bit);
    // GET only, so it's safe on live: anything else to the site is aborted, and counts as a FAIL through clean().
    for (const bit of ['if (q.method() === "GET" || q.method() === "HEAD") return r.continue();', "g.stopped.push(", "return r.abort();", "g.errors.length + g.failed.length + g.stopped.length === 0"]) expect(live, bit).toContain(bit);
    expect(live).not.toMatch(/\.click\(|\.fill\(|\.press\(|method: "POST"|localOnly/);
    // Control: the desktop first-load pin raised by one word reads over it.
    expect(Number(/LIVE_FIRST_CALM = \{ 1440: (\d+)/.exec(live.replace(/LIVE_FIRST_CALM = \{ 1440: \d+/, "LIVE_FIRST_CALM = { 1440: 1380"))![1]) <= 1379).toBe(false);
    // A FAIL names what grew (Lead-12): the measured lines are on file for all four reads, as hashes only (the landing's words
    // stay out of a second file), and each read's calm is its pin, so lowering a pin without re-measuring goes red here.
    for (const bit of ["${firstOk ? \"\" : firstGrew}", "${scrolledOk ? \"\" : scrolledGrew}"]) expect(live, bit).toContain(bit);
    // A reword at the same count is a CHANGED warning on a PASS, naming the lines, and never a FAIL (Lead-12; flip if the Q says).
    for (const bit of ["if (firstOk && firstChanged) changedLine(", "if (scrolledOk && scrolledChanged) changedLine(", "const changed = added.length + gone > 0;"]) expect(live, bit).toContain(bit);
    expect(/const changedLine = [^\n]*/.exec(live)?.[0]).not.toMatch(/fails|passes/);
    const lines = JSON.parse(read("scripts/live-walk-lines.json")) as { measured: string; reads: Record<string, { calm: number; lines: string[] }> };
    expect(Object.keys(lines.reads).sort()).toEqual(["1440 first", "1440 scrolled", "390 first", "390 scrolled"]);
    for (const [k, r] of Object.entries(lines.reads)) {
      expect(r.lines.length, k).toBeGreaterThan(50);
      expect(r.lines.filter((h) => !/^[0-9a-f]{8}$/.test(h)), k).toEqual([]);
    }
    expect([lines.reads["1440 first"]!.calm, lines.reads["390 first"]!.calm, lines.reads["1440 scrolled"]!.calm, lines.reads["390 scrolled"]!.calm])
      .toEqual([fc1440, fc390, sc1440, sc390]);
  });
});

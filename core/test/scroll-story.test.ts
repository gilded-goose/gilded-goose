// The Desk's scroll story (Desk-S, Oct 30): every name, price and day comes from the recorded week, every band figure
// is a claims row's Value, the moment's Approve is a practice tap that can't reach money, and the copy keeps the rules
// (no em-dashes, no hype, "Rather wait?" only once on the page, which is the deal card's and not the story's).

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TEAM } from "../../scripts/claims-placeholders.ts";
import { BAND_HELD, BAND_IDS, BLIND_ROWS, BLIND_SETS, CLOSE, CLOSE_NOTES, PRACTICE_DONE, PRACTICE_TAP, TRICK_HREF, protectLine, scrollStory, storyBand, ticketTitle } from "../src/view/scroll.ts";
import { claimRows, proofGroups } from "../src/proof.ts";
import { judgeSteps } from "../src/view/wallet.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const STORY_DIR = "web/src/desk/story";
const storyFiles = () => readdirSync(new URL(`../../${STORY_DIR}/`, import.meta.url)).map((f) => `${STORY_DIR}/${f}`);
const ROWS = claimRows(read("docs/claims.md"));

describe("the scroll story's week", () => {
  it("scroll_story_reads_the_recorded_week: day 5, Lantern Hall at $84.00 under the $90.00 events limit, $112.00 on day 1", () => {
    const s = scrollStory();
    expect(s.day).toBe(5);
    expect(s.title).toBe("The Marsh Lights ticket");
    expect(s.item).not.toMatch(/fictional/i);
    expect(s.limit).toMatchObject({ words: "$90.00", label: "events limit" });
    expect(s.deal).toMatchObject({ name: "Lantern Hall Box Office", words: "$84.00", firstDay: 1, firstWords: "$112.00" });
    expect(s.deal.byDay).toEqual([11200, 11200, 9400, 9400, 8400, 9100, 9100]);
    expect(s.deal.total).toBeLessThanOrEqual(s.limit.cents);
    expect(s.sellers.map((x) => x.total)).toEqual([...s.sellers.map((x) => x.total)].sort((a, b) => a - b));
  });

  it("scroll_story_scam_is_the_cheapest_and_set_aside: TixQuack at $55.00 asked for a gift card and was refused", () => {
    const s = scrollStory();
    expect(s.scam).toMatchObject({ name: "TixQuack", words: "$55.00", verdict: "refuse" });
    expect(s.scam.why).toMatch(/gift card/);
    expect(s.cheapestWasScam).toBe(true);
    expect(s.sellers[0]!.id).toBe(s.scam.id);
    expect(protectLine(s.scam.name)).toBe("Goose set TixQuack aside. Your money stays put.");
    const over = s.sellers.find((x) => x.name === "Reedwhistle Tickets")!;
    expect(over).toMatchObject({ words: "$97.00", overLimit: true });
  });

  it("ticket_title_names_the_show: a ticket item becomes '<show> ticket'; anything else keeps its words", () => {
    expect(ticketTitle("A ticket to The Marsh Lights, Saturday")).toBe("The Marsh Lights ticket");
    expect(ticketTitle("Goldfeather Kettle")).toBe("Goldfeather Kettle");
  });
});

describe("the scroll story's band", () => {
  it("story_band_figures_are_claims_rows: each figure is its Proof row's Value", () => {
    const b = storyBand(proofGroups(ROWS));
    const value = (id: string) => ROWS.find((r) => r.id === id)!.value;
    // Both sets on every row, newest first, each cell its own row's Value (Joshua, Wed Nov 4: never just the better one).
    expect(b.tests.sets).toEqual(["Nov 4 set", "Oct 28 set"]);
    expect(b.tests.rows.map((r) => r.cells.length)).toEqual(BLIND_ROWS.map(() => BLIND_SETS.length));
    for (const r of b.tests.rows) for (const c of r.cells) expect(c.figure).toBe(value(c.id));
    expect(read(`${STORY_DIR}/Band.tsx`)).toContain("<BlindSets tests={band.tests}");
    // And what the reader did with the code-alone misses: held, never hidden behind "0 of 60" (Track D, s2-band-held).
    expect(b.tests.readers[1]).toMatchObject({ set: "Oct 28 set", through: { figure: value("blind-reader-on") }, refused: { figure: value("blind-fair") } });
    expect(b.tests.after).toContain(BAND_HELD);
    expect(read("web/src/charts/BlindSets.tsx")).toMatch(/\{r\.through\.figure\}<\/a> \{BAND_READER\.through\} <a href=\{href\(r\.refused\.id\)\}>\{r\.refused\.figure\}/);
    expect(b.runs.count).toBe(3);
    expect(b.runs.items.map((r) => `${r.figure} captured`)).toEqual(BAND_IDS.runs.map(value));
    expect(`${b.webhooks.figure} webhooks`).toBe(value(BAND_IDS.webhooks));
  });

  it("story_band_fails_loudly: a missing row or a reworded Value throws, never an empty figure", () => {
    expect(() => storyBand(proofGroups(ROWS).map((g) => ({ ...g, items: g.items.filter((i) => i.id !== "sandbox-void") })))).toThrow(/sandbox-void/);
    expect(() => storyBand(proofGroups(ROWS).map((g) => ({ ...g, items: g.items.map((i) => (i.id === "sandbox-webhooks" ? { ...i, figure: "two" } : i)) })))).toThrow(/N webhooks/);
  });
});

describe("the scroll story's practice tap", () => {
  it("practice_tap_moves_no_money: the moment's Approve only sets its own state, and the story never calls out", () => {
    const moment = read(`${STORY_DIR}/Moment.tsx`);
    expect(moment.match(/onClick=\{[^}]*\}/g)).toEqual(["onClick={() => setTapped(true)}", "onClick={focusAsk}"]);
    for (const f of storyFiles().filter((p) => /\.tsx?$/.test(p) && !p.endsWith("/Challenge.tsx") && !p.endsWith("/ChallengeFeed.tsx") && !p.endsWith("/early-challenge.ts"))) {
      const code = read(f).split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
      expect(code, f).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|location\.(href|assign|replace)\s*=?|\/api\/|paypal\.com|navigator\.credentials/i);
    }
    // The feed only reads: one GET of the public record, with nothing sent and no way to send anything.
    const feed = read(`${STORY_DIR}/ChallengeFeed.tsx`).split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(feed.match(/\/api\/[\w/-]+/g)).toEqual(["/api/challenge"]);
    expect(feed.match(/\bfetch\(/g)).toHaveLength(1);
    expect(feed).not.toMatch(/method:|body:|XMLHttpRequest|sendBeacon|location\.(href|assign|replace)\s*=?|paypal\.com|navigator\.credentials/i);
    // The head's early read (early-challenge.ts, 1156e959): the same one GET of the public record, written into the page's
    // head before the room's chunk, with nothing sent and no way to send anything.
    const early = read(`${STORY_DIR}/early-challenge.ts`).split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/**")).join("\n");
    expect(early.match(/\/api\/[\w/-]+/g)).toEqual(["/api/challenge"]);
    expect(early.match(/\bfetch\(/g)).toHaveLength(1);
    expect(early).not.toMatch(/method:|body:|XMLHttpRequest|sendBeacon|location\.(href|assign|replace)\s*=?|paypal\.com|navigator\.credentials/i);
    // The one block that calls out: the Challenge, and only its own rounds (no payment route, and a round has no payment port).
    const challenge = read(`${STORY_DIR}/Challenge.tsx`);
    expect([...new Set(challenge.match(/\/api\/[\w/-]+/g))].sort()).toEqual(["/api/runs/scammer", "/api/runs/trick"]);
    expect(challenge).not.toMatch(/XMLHttpRequest|sendBeacon|location\.(href|assign|replace)\s*=?|paypal\.com|navigator\.credentials/i);
    // After the tap it shows how a real run ends, framed as one and tagged Replay: never a bare "Paid" with a tick.
    // (The `{" "}` is the space between the tag and the sentence in the button's name; moment-name.test.ts.)
    expect(moment).toMatch(/<span className="ds-tag">Replay<\/span>\{" "\}In a real run: <span className="ds-nowrap">Paid · PayPal sandbox<\/span>/);
    expect(moment).not.toMatch(/M4\.5 10\.5l3\.5 3\.5/);
    expect(PRACTICE_TAP).toMatch(/moves no money/);
    expect(PRACTICE_DONE).toMatch(/^Practice tap: it moved no money and called no PayPal\./);
    expect(PRACTICE_DONE).toMatch(/only your tap there pays/);
  });

  it("try_to_trick_goes_to_the_judge_box: the close links where 'Judge? Start here' does", () => {
    expect(CLOSE).toEqual(["Rather see for yourself?", "Try to trick Goose."]);
    // Track C's end-card lines, word for word (track-c/landing-close-for-s2.md); the team line is exactly TEAM, and the
    // guard line ("ten lines of code", row ten-lines) goes to the Safe page's section that names trust/README.md. The FTC
    // line (row c-impact-source) sits under the first, as the video's end card has it, its "FTC reports" linking the source.
    expect(CLOSE_NOTES).toEqual([
      { text: TEAM },
      { text: "Add the guard to your own checkout in ten lines of code.", href: "safe.html#c5" },
    ]);
    for (const n of CLOSE_NOTES) if (n.link) expect(n.text).toContain(n.link);
    expect(read("web/src/Safe.tsx")).toMatch(/id="c5"[\s\S]*For a store or PayPal:[\s\S]*trust\/README\.md/);
    // Each line renders its words exactly: whole-line link, a linked phrase in place, or plain text.
    const close = read(`${STORY_DIR}/Close.tsx`);
    expect(close).toContain("{CLOSE_NOTES.map((n) => <p key={n.text}><Note {...n} /></p>)}");
    expect(close).toContain("return <>{text.slice(0, at)}<a href={href} rel=\"noopener noreferrer\">{link}</a>{text.slice(at + link.length)}</>;");
    expect(judgeSteps("sandbox").find((s) => s.title === "Try to trick it yourself")?.href).toBe(TRICK_HREF);
  });
});

describe("the scroll story's copy", () => {
  it("story_copy_keeps_the_rules: no em-dash, no hype words, no 'Rather wait?' (the deal card says it once)", () => {
    const sources = [...storyFiles(), "core/src/view/scroll.ts"].map((f) => [f, read(f)] as const);
    for (const [f, src] of sources) {
      expect(src, f).not.toMatch(/—/);
      expect(src, f).not.toMatch(/Rather wait/i);
      expect(src, f).not.toMatch(/\b(seamless|effortless|revolutionary|game.?chang|supercharge|unlock|cutting.edge|blazing|magic(al)?)\b/i);
    }
    const css = read(`${STORY_DIR}/story.css`);
    expect(css).not.toMatch(/gradient\(|background-clip:\s*text|\bInter\b|Geist|indigo/i);
    expect(css.match(/#[0-9a-f]{3,8}\b|rgba?\((?!var\(--)/gi)).toBeNull();
  });

  it("story_mounts_with_one_lazy_import: Desk.tsx renders only <Landing>; the story under the hero is its own chunk", () => {
    const desk = read("web/src/desk/Desk.tsx");
    expect(desk.match(/story\/[^"]+/g)).toEqual(["story/index.tsx"]);
    expect(desk.match(/<Landing /g)).toHaveLength(1);
    // The landing's words live in story/, not in the app's file (Track S2's move).
    expect(desk).not.toMatch(/dk-hero|dk-story|Payment networks protect/);
    const index = read(`${STORY_DIR}/index.tsx`);
    expect(index).toMatch(/lazyOr\(\(\) => afterFirstPaint\(\)\.then\(\(\) => import\("\.\/Story\.tsx"\)\)\)/);
    // The eager file imports no other story section, so none of them lands in the first screen's chunk: only section 01's
    // opening lines, the Challenge's (on a phone they are on the first screen), which import nothing but React (already in
    // the first chunk; its focus hand-off, useKeepsFocus, needs a layout effect: a cold #challenge lost focus, Nov 6).
    expect(index.match(/from "\.\/[^"]+"/g) ?? []).toEqual(['from "./ChallengeStart.tsx"']);
    expect(read(`${STORY_DIR}/ChallengeStart.tsx`).match(/^import .*$/gm) ?? []).toEqual(['import { useLayoutEffect, useRef, type RefObject } from "react";']);
    expect(read(`${STORY_DIR}/PromisesStart.tsx`)).not.toMatch(/^import /m);
  });
});

// "Ask for a view" (Nov 5, F on the rehearsal): "Show tries by type as a bar chart" and "Tries by day" got no POST and no chart, only
// "No AI call: a fixed rule read your words", because the board's rule took any words with "tries" in them and read them as a filter.
// A judge's most natural question can't end there. A chart of the tries goes to the view path, which draws a real one with or without
// a key; a filter stays the board's; a request to act still refuses first.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BOUNDARY, GOOSE_WIDGETS, TRIES_WIDGETS, asksToAct, boundaryFirst, pickWidget } from "../../server/src/view.ts";
import { PAGE_TRIES_WIDGETS, pagePick } from "../../web/src/studio/rule.ts";
import { asksBoard, boardTakes, triesBy } from "../../web/src/studio/threat-model.ts";
import { seededWeek } from "../../web/threat-week.ts";
import { CHART_ASK as SERVER_CHART_ASK, ABOUT_TRIES } from "../../server/src/view.ts";
import { PAGE_ABOUT_TRIES } from "../../web/src/studio/rule.ts";
import { ALL, CHART_ASK, barTint, namesRoom, triesTop } from "../../web/src/studio/threat-model.ts";
import { THREAT_TYPES, TYPE_WORDS } from "../../web/src/studio/threat-shape.ts";
import type { Attempt } from "../../web/src/studio/threat-shape.ts";

const read = (p: string) => readFileSync(join(import.meta.dirname, "..", "..", p), "utf8");

const CHARTS: ReadonlyArray<readonly [string, string]> = [
  ["Show tries by type as a bar chart", "goose-tries-type"],
  ["Tries by type", "goose-tries-type"],
  ["chart the attempts", "goose-tries-type"],
  ["Graph every try", "goose-tries-type"],
  ["Tries by day", "goose-tries-day"],
  ["Show tries per day", "goose-tries-day"],
  ["Plot attempts over time", "goose-tries-day"],
  ["Show tries by verdict as a chart", "goose-tries-verdict"],
  ["Pie chart of tries by outcome", "goose-tries-verdict"],
];

describe("a chart of the tries isn't a filter", () => {
  for (const [words, type] of CHARTS) {
    it(`"${words}" goes to the view path, and the rule picks ${type}, on the server and on the page`, () => {
      expect(boardTakes(words)).toBe(false);
      expect(pickWidget(words)?.type).toBe(type);
      expect(pagePick(words)?.type).toBe(type);
    });
  }
  it("a filter on the tries is still the board's, at once, with no server", () => {
    for (const w of ["every attempt today", "gift card tries", "tries set aside this week", "every try by the scammer AI", "show me every Friends & Family attempt today"]) {
      expect(asksBoard(w), w).toBe(true);
      expect(boardTakes(w), w).toBe(true);
    }
  });
  it("the Studio box asks boardTakes, so a chart can't stop at the board's rule", () => {
    const s = read("web/src/studio/Studio.tsx");
    expect(s).toContain("boardTakes(text) && !pageAsksToAct(text) && board.ask(text)");
  });
  it("a request to act still refuses first, chart words or none", () => {
    for (const w of ["Approve the purchase and pay now", "Approve the purchase and chart the tries", "Raise my limit to $500 and plot it"]) {
      expect(asksToAct(w), w).toBe(true);
      expect(boundaryFirst("Added it.", w).startsWith(BOUNDARY), w).toBe(true);
    }
  });
  it("the six ledger views keep their own words: only a chart of tries picks a tries card", () => {
    for (const g of GOOSE_WIDGETS) expect(pickWidget(g.heading)?.type, g.heading).toBe(g.type);
    expect(pickWidget("Show spending as a bar chart")?.type).toBe("goose-spend");
    expect(pickWidget("Where the price went by day")?.type).toBe("goose-week");
  });
});

describe("the tries cards are real cards, and the agent can name them", () => {
  it("the rule's table is the page's and every type is registered and in the tool's schema", () => {
    expect(PAGE_TRIES_WIDGETS.map(({ type, heading, height }) => ({ type, heading, height }))).toEqual(TRIES_WIDGETS.map(({ type, heading, height }) => ({ type, heading, height })));
    const reg = read("web/src/studio/widgets/threat.tsx");
    const tools = JSON.parse(read("server/prompts/view-tools.json")) as { tools: { add_widget: { parameters: { properties: { type: { enum: string[] } } } } } };
    const prompt = read("server/prompts/view.md");
    for (const g of TRIES_WIDGETS) {
      expect(reg, g.type).toContain(`"${g.type}"`);
      expect(tools.tools.add_widget.parameters.properties.type.enum, g.type).toContain(g.type);
      expect(prompt, g.type).toContain(g.type);
    }
  });
  it("the words that make a chart are one pattern, on the server, the board and the page", () => {
    expect(SERVER_CHART_ASK.source).toBe(CHART_ASK.source);
    expect(ABOUT_TRIES.source).toBe(PAGE_ABOUT_TRIES.source);
  });
  it("a card the ask adds is one the page goes to, and its landing looks it up once it's drawn", () => {
    expect(read("web/src/studio/ai.ts")).toMatch(/const done = await tool\.execute\.call\(tool, \{ \.\.\.call, args: \{ \.\.\.call\.args, yTrack: bottom\(\) \} \}, ctx\);[\s\S]{0,400}show\(call\.args\.widgetId\)/);
  });
  it("the prompt doesn't send the model to a stock chart, which comes empty with no way to fill it", () => {
    expect(read("server/prompts/view.md")).not.toContain("otherwise build a grid, chart or value widget");
    expect(read("web/src/studio/ai.ts")).not.toContain("tools.studio.configureWidget");
  });
});

describe("the bars come from the rows, and nothing falls off", () => {
  const at = (d: number) => d * 24 * 60 * 60 * 1000 + 1000;
  const row = (over: Partial<Attempt>): Attempt => ({ at: at(0), type: "gift-card", verdict: "set-aside", rule: "gift-card", source: "person", ...over } as Attempt);
  const rows = [row({}), row({ at: at(1) }), row({ at: at(1), type: "friends-family", verdict: "held" }), row({ at: at(6), type: "friends-family", verdict: "paid" })];
  const all = ALL;
  it("by type, by verdict and by day each sum to the rows in the view", () => {
    for (const by of ["type", "verdict", "day"] as const) {
      const bars = triesBy(by, rows, all, "demo", at(7));
      expect(bars.reduce((s, b) => s + b.count, 0), by).toBe(rows.length);
    }
  });
  it("by day shows the seeded week's seven days, empty ones too, and a real day by its date, in order", () => {
    expect(triesBy("day", rows, all, "demo", at(7)).map((b) => b.count)).toEqual([1, 2, 0, 0, 0, 0, 1]);
    // Real days too, quiet ones included: a gap on the axis is a quiet week, and closing it would draw a busier one.
    const real = triesBy("day", rows, all, "real", at(7));
    expect(real.map((b) => b.count)).toEqual([1, 2, 0, 0, 0, 0, 1]);
    expect(new Set(real.map((b) => b.words)).size).toBe(7);
  });
  it("follows the view: a filter on the type narrows the day's bars", () => {
    const bars = triesBy("day", rows, { ...all, type: "friends-family" }, "demo", at(7));
    expect(bars.reduce((s, b) => s + b.count, 0)).toBe(2);
  });
  it("a verdict's bar wears the board's tier, so cream means Set aside and nothing else; a type's or a day's bar holds every verdict", async () => {
    expect(["set-aside", "held", "refused", "paid"].map(barTint)).toEqual(["ink", "ink3", "ink3", "mark"]);
    const week = await seededWeek();
    // The verdict bars are the one fold's (Nov 11): aside, held, over, clear and paid, in the stamp's words.
    expect(["aside", "held", "over", "clear"].map(barTint)).toEqual(["ink", "ink3", "ink3", "ink3"]);
    for (const b of triesBy("verdict", week, all, "demo", at(7))) expect(barTint(b.key)).toBe(b.key === "aside" ? "ink" : b.key === "paid" ? "mark" : "ink3");
    for (const by of ["type", "day"] as const) for (const b of triesBy(by, week, all, "demo", at(7))) expect(barTint(b.key)).toBe("ink");
  });
  it("the seeded week's every try is on each chart", async () => {
    const week = await seededWeek();
    for (const by of ["type", "verdict", "day"] as const) expect(triesBy(by, week, all, "demo", at(7)).reduce((s, b) => s + b.count, 0), by).toBe(week.length);
  });
  it("every kind's name and the longest bar's number have room on the canvas, at 390 too (no check can read a canvas: the first still cut both)", () => {
    const bars = THREAT_TYPES.map((t) => ({ key: t, words: TYPE_WORDS[t], count: 40 }));
    const longest = Math.max(...bars.map((b) => b.words.length));
    expect(namesRoom(bars, 310)).toBeGreaterThanOrEqual(Math.min(longest * 6.8, 155));
    expect(namesRoom(bars, 310)).toBeGreaterThan(310 * 0.3);
    expect(namesRoom(bars, 1072)).toBeLessThan(1072 * 0.3);
    expect(triesTop(bars) * (1 - 1 / 1.22)).toBeGreaterThan(7); // of a top of 40, room for the digits past the bar
  });
  it("a paid try is its own bar, marked, and a verdict with no rows draws no bar", () => {
    const bars = triesBy("verdict", rows, all, "demo", at(7));
    expect(bars.find((b) => b.key === "paid")?.count).toBe(1);
    expect(bars.map((b) => b.key)).not.toContain("refused");
  });
});

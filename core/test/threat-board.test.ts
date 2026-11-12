// The Live Threat Board (Track T; Joshua's Tier 2b, Nov 3). The rules a judge could catch it breaking: the seeded week comes
// out of the real round and says nothing but four fields; real and seeded never meet in a count; every number sums from the
// rows; the fixed rule reads Joshua's sentence and refuses to act first; an unreadable record shows no number.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SEED_NOTES, judgeNote, seededWeek } from "../../web/threat-week.ts";
import { catchPaidWords, catchRestWords } from "../../web/src/studio/threat-words.ts";
import { NO_ORDER } from "../src/judge/count-words.ts";
import { ATTEMPT_RULES, ATTEMPT_VERDICTS, PAY_BREACHES, challengeWords, countsOf, parseAttempt, type Attempt } from "../../web/src/studio/threat-shape.ts";
import { sparkPoints, typeLines, ALL, DAY_MS, WALLS, asksBoard, barTop, bucketsFor, catchOf, arrivals, askedView, catchRateWords, csvOf, lineParts, readAsk, showsSources, readBoard, ruleRows, shown, sourceRows, sourceWords, tryRows, typeRows, viewChips, viewLine, viewWords, wallCount } from "../../web/src/studio/threat-model.ts";
import { PAGE_BOUNDARY, pageAsksToAct } from "../../web/src/studio/rule.ts";
import { PROMPT_STARTERS } from "../../web/src/studio/words.ts";
import { ASK_CHIPS, ASK_HINT, ASK_HINT_SHORT, DOWNLOAD_XLSX, DOWNLOAD_XLSX_LABEL } from "../../web/src/studio/threat-words.ts";
import { fitRows, layoutFor, tracksIn, withThreat } from "../../web/src/studio/layout.ts";

const NOW = Date.UTC(2026, 10, 6, 15, 30);
const real: Attempt[] = [
  { at: NOW - 60_000, verdict: "set-aside", rule: "off-paypal", type: "friends-family", source: "scammer-ai" },
  { at: NOW - 3_600_000, verdict: "held", rule: "no-history", type: "fake-urgency", source: "scammer-ai" },
  { at: NOW - 2 * DAY_MS, verdict: "set-aside", rule: "gift-card", type: "gift-card", source: "person" },
];
const allNotes = Object.values(SEED_NOTES).flat();

describe("the seeded week", () => {
  it("is the same week from every build", async () => {
    expect(await seededWeek()).toEqual(await seededWeek());
  });
  it("runs every note through the real round, and none gets it to pay", async () => {
    for (const { note, price = "45.00" } of allNotes) {
      const r = await judgeNote(note, price);
      expect(ATTEMPT_VERDICTS).toContain(r.verdict);
      expect(r.verdict, note).not.toBe("paid");
      expect(ATTEMPT_RULES, note).toContain(r.rule);
    }
  });
  it("catches what the Watcher names: a gift card is always set aside under its own rule", async () => {
    for (const { note } of SEED_NOTES["gift-card"]!) expect(await judgeNote(note, "45.00"), note).toEqual({ verdict: "set-aside", rule: "gift-card" });
  });
  it("holds its five fields and never the note's words: only `at` is not from a closed list", async () => {
    const rows = await seededWeek();
    expect(rows.length).toBeGreaterThan(100);
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(["at", "rule", "source", "type", "verdict"]);
      expect(parseAttempt(r)).toEqual(r);
    }
    const text = JSON.stringify(rows);
    for (const { note } of allNotes) expect(text).not.toContain(note);
    for (const word of ["Zelle", "Steam", "SYSTEM", "Hurry"]) expect(text).not.toContain(word);
  });
  it("counts from Day 1, not a calendar: it can't be read as a real date", async () => {
    const rows = await seededWeek();
    expect(Math.max(...rows.map((r) => r.at))).toBeLessThan(7 * DAY_MS);
    expect(Math.min(...rows.map((r) => r.at))).toBeGreaterThanOrEqual(0);
    expect(tryRows(rows, "demo")[0]!.when).toMatch(/^Day 7, \d\d:\d\d$/);
    expect(csvOf(rows, "demo").split("\n")[1]).toMatch(/^"seeded demo week",/);
  });
  it("never says who tried a seeded note: no AI source, no who, no by source, no rate, nothing in its table", async () => {
    const rows = await seededWeek();
    expect(new Set(rows.map((r) => r.source))).toEqual(new Set(["person"]));
    for (const r of tryRows(rows, "demo")) expect(r.who).toBe("");
    expect(showsSources(rows, "demo")).toBe(false);
    expect(catchOf(rows, ALL, "demo", 0)?.ai).toBeNull();
    expect(csvOf(rows, "demo").split("\n")[0]).toBe("side,when,type,verdict,rule");
    expect(viewWords({ ...ALL, by: "person" }, "demo", 2)).toBe("2 seeded tries.");
    expect(viewChips({ ...ALL, by: "person" }, "demo")).toEqual([]);
  });
  it("offers no scammer AI in its example or its chips: the model declined to write those notes, so nothing suggests they exist", () => {
    for (const words of [ASK_HINT, ASK_HINT_SHORT, ...ASK_CHIPS.flatMap((c) => [c.label, c.prompt])]) expect(words).not.toMatch(/scammer|\bAI\b/i);
  });
  it("answers an ask for the scammer AI with no such row by saying so, never with everyone's tries as if they were its", () => {
    const person = real.filter((r) => r.source === "person");
    const asked = { ...ALL, by: "scammer-ai" as const };
    expect(askedView(asked, "real", person)).toEqual({ view: ALL, noAi: true });
    expect(askedView(asked, "demo", real)).toEqual({ view: ALL, noAi: true });
    expect(askedView(asked, "real", real)).toEqual({ view: asked, noAi: false });
    expect(askedView({ ...ALL, by: "person" }, "demo", real)).toEqual({ view: ALL, noAi: false });
    expect(askedView({ ...ALL, by: "person" }, "real", person).view.by).toBe("person");
  });
});

describe("no mix: a count reads one source's rows", () => {
  it("the source folder has no line that puts the two together", () => {
    const dir = join(import.meta.dirname, "../../web/src/studio");
    for (const f of readdirSync(dir).filter((x) => /^threat|^Threat/.test(x))) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text, f).not.toMatch(/\.\.\.\s*(?:sources\.|feed\.)?real\b[^;\n]*\.\.\.\s*(?:sources\.)?(?:demo|seeded)/);
      expect(text, f).not.toMatch(/\.\.\.\s*(?:sources\.)?(?:demo|seeded)\b[^;\n]*\.\.\.\s*(?:sources\.|feed\.)?(?:real|rows)/);
      expect(text, f).not.toMatch(/\.concat\(\s*(?:sources\.)?(?:demo|seeded)/);
    }
  });
  it("the real counter folds real rows only, and zero real rows stays zero beside a full seeded week", async () => {
    const demo = await seededWeek();
    expect(countsOf([]).tried).toBe(0);
    expect(countsOf(real).tried).toBe(real.length);
    expect(shown(real, ALL, "real", NOW).length).toBe(real.length);
    expect(shown(demo, ALL, "demo", NOW).length).toBe(demo.length);
    // With no filter on, the line says nothing: the count is the switch's, right above it. A filter brings it back.
    expect(viewLine(ALL, "real", 5)).toBe("");
    expect(viewLine(ALL, "demo", 148)).toBe("");
    expect(viewLine({ ...ALL, type: "gift-card" }, "real", 1)).toBe("1 real Gift card try.");
    expect(viewWords(ALL, "real", 0)).toBe("No real tries.");
    expect(viewWords(ALL, "demo", demo.length)).toBe(`${demo.length} seeded tries.`);
  });
  it("Studio's data keeps them in two sources", () => {
    const data = readFileSync(join(import.meta.dirname, "../../web/src/studio/data.ts"), "utf8");
    expect(data).toContain('threatSource("threat-real", "Real tries", attempts.real ?? [], "real")');
    expect(data).toContain('threatSource("threat-seeded", "Seeded demo week", attempts.demo, "demo")');
  });
});

describe("every number sums from the rows", () => {
  it("types, rules and bars all come to the same count, on both sides", async () => {
    for (const [rows, source] of [[await seededWeek(), "demo"], [real, "real"]] as const) {
      const buckets = bucketsFor(source, rows, NOW);
      const types = typeRows(rows, ALL, source, NOW, buckets);
      const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
      expect(sum(types.map((t) => t.count))).toBe(rows.length);
      expect(sum(ruleRows(rows, ALL, source, NOW).map((r) => r.count))).toBe(rows.length);
      for (const t of types) expect(sum(t.bars), t.type).toBe(t.count);
    }
  });
  it("a wall only reads a paid row: four zeros stop being zero the moment a row says so", async () => {
    expect(WALLS.map((w) => w.rule).sort()).toEqual([...PAY_BREACHES].sort());
    const demo = await seededWeek();
    for (const w of WALLS) expect(wallCount(demo, w.rule), w.rule).toBe(0);
    const broke: Attempt = { at: NOW, verdict: "paid", rule: "over-limit", type: "hidden-instructions", source: "person" };
    expect(wallCount([...real, broke], "over-limit")).toBe(1);
    expect(countsOf([broke]).paid).toBe(1);
  });
  it("the four zeros say why they can be zero: the line stands under the tiles, on both paths", () => {
    expect(NO_ORDER).toBe("This challenge places no order; it shows what code decides.");
    expect(readFileSync(new URL("../../web/src/studio/threat-widgets.tsx", import.meta.url), "utf8")).toMatch(/<\/dl>\s*<p className="tb-noorder">\{NO_ORDER\}<\/p>/);
  });
  it("no bar chart reaches a screen reader, wherever one is drawn: its numbers are in a table or a caption beside it", () => {
    const web = join(import.meta.dirname, "../../web/src");
    let charts = 0;
    for (const f of readdirSync(web, { recursive: true, encoding: "utf8" }).filter((p) => p.endsWith(".tsx"))) {
      const lines = readFileSync(join(web, f), "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!/<Suspense\b.*<Bars(?:Chart)?\b/.test(line)) return;
        charts++;
        expect(`${lines[i - 1]}\n${line}`, `${f}:${i + 1}`).toContain('aria-hidden="true"');
      });
    }
    expect(charts).toBeGreaterThanOrEqual(4);
    // The board's rows take a mouse (a bar picks its day), so they are hidden from reading only, unlike the ledger's inert ones.
    const widgets = readFileSync(join(web, "studio/threat-widgets.tsx"), "utf8");
    for (const div of widgets.match(/<div className="tb-type-chart"[^>]*>/g)!) expect(div).not.toContain("inert");
  });
  it("with no rows the card draws no scale, axis or table, and says \"yet\" only of a record it has read", () => {
    const widgets = readFileSync(join(import.meta.dirname, "../../web/src/studio/threat-widgets.tsx"), "utf8");
    const from = widgets.indexOf("if (!known) {");
    const empty = widgets.slice(from, widgets.indexOf('<p className="tb-sub">One scale', from));
    expect(from).toBeGreaterThan(-1);
    expect(empty).toContain('feed.state === "live" ? NO_TRIES : feed.state === "reading" ? BOARD_LOADING : BOARD_UNAVAILABLE');
    expect(empty).toMatch(/feed\.state === "live" && \(\s*<p className="tb-empty-go">/);
    expect(empty.indexOf("return (")).toBeLessThan(empty.indexOf("tb-empty"));
    const drawn = empty.slice(0, empty.lastIndexOf("return ("));
    for (const part of ["tb-axis", "tb-types", "Tallest bar", "<table"]) expect(drawn, part).not.toContain(part);
  });
  it("the board credits no person: the code knows only \"not the scammer AI\"", () => {
    expect(sourceWords("person")).toBe("Not the scammer AI");
    expect(sourceWords("scammer-ai")).toBe("Scammer AI");
    expect(viewWords({ ...ALL, by: "person" }, "real", 2)).toBe("2 real tries not by the scammer AI.");
    expect(viewChips({ ...ALL, by: "person" }, "real").map((c) => c.words)).toEqual(["Not the scammer AI"]);
    expect(tryRows(real.filter((r) => r.source === "person"), "real")[0]!.who).toBe("Not the scammer AI");
    expect(csvOf(real.filter((r) => r.source === "person"), "real")).not.toMatch(/\bpeople\b|\bperson\b/i);
    const web = join(import.meta.dirname, "../../web/src/studio");
    for (const f of readdirSync(web, { recursive: true, encoding: "utf8" }).filter((p) => /\.tsx?$/.test(p))) {
      const said = readFileSync(join(web, f), "utf8").split("\n").filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l)).join("\n");
      expect(said, f).not.toMatch(/"People"|\bby (?:people|a person)\b/i);
    }
  });
  it("a picked type keeps its neighbours, and the view's sentence says the rows' own number", () => {
    const view = { ...ALL, type: "friends-family" as const };
    const buckets = bucketsFor("real", real, NOW);
    expect(typeRows(real, view, "real", NOW, buckets).find((t) => t.type === "gift-card")!.count).toBe(1);
    expect(viewWords(view, "real", shown(real, view, "real", NOW).length)).toBe("1 real Friends & Family try.");
  });
  it("one try in a thin week is a low bar: the scale never goes under five, and never cuts a taller bar", () => {
    expect(barTop(1)).toBe(5);
    expect(barTop(15)).toBe(15);
  });
  it("new rows at the top keep the old rows' ids, so the grid slides one row in and moves nothing else", () => {
    const before = tryRows(real, "real").map((r) => r.id);
    const twin = { ...real[0]! };
    const after = tryRows([twin, ...real], "real").map((r) => r.id);
    expect(new Set(after).size).toBe(after.length);
    expect(after.slice(1)).toEqual(before);
  });
});

describe("who tried, and the catch rate", () => {
  it("counts what was set aside over everyone, and a rate only over real scammer AI rows, where a note is a scam by construction", () => {
    expect(catchOf(real, ALL, "real", NOW)).toEqual({ caught: 2, of: 3, paid: 0, ai: { caught: 1, of: 2 } });
    // More people's tries, set aside or not, can't move the rate.
    const more = [...real, ...Array.from({ length: 50 }, (_, i): Attempt => ({ at: NOW - i * 60_000, verdict: i % 2 ? "held" : "set-aside", rule: "no-history", type: "none", source: "person" }))];
    const c = catchOf(more, ALL, "real", NOW)!;
    expect(c.ai).toEqual({ caught: 1, of: 2 });
    expect(c.of).toBe(53);
  });
  it("is hidden on a side with no rows, and shows no rate or source with people's rows alone", () => {
    expect(catchOf([], ALL, "real", NOW)).toBeNull();
    const person = real.filter((r) => r.source === "person");
    expect(catchOf(person, ALL, "real", NOW)?.ai).toBeNull();
    expect(showsSources(person, "real")).toBe(false);
    expect(showsSources(real, "real")).toBe(true);
  });
  it("shows a type only once this side has a row of it, so a new type on C's list adds no empty row", () => {
    const buckets = bucketsFor("real", real, NOW);
    expect(typeRows(real, ALL, "real", NOW, buckets).map((t) => t.type).sort()).toEqual(["fake-urgency", "friends-family", "gift-card"]);
    expect(typeRows([], ALL, "real", NOW, bucketsFor("real", [], NOW))).toEqual([]);
  });
  it("says the count alone under ten tries, and from ten a percent that says what it's over, in the same words", () => {
    expect(catchRateWords({ caught: 1, of: 2 })).toBe("1 of 2");
    expect(catchRateWords({ caught: 7, of: 10 })).toBe("70% of 10");
  });
  it("source rows sum to the view's count", () => {
    const rows = sourceRows(real, ALL, "real", NOW, bucketsFor("real", real, NOW));
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(real.length);
    for (const r of rows) expect(r.bars.reduce((a, b) => a + b, 0), r.by).toBe(r.count);
    expect(sourceWords("scammer-ai")).toBe("Scammer AI");
  });
  it("splits every bar by verdict, and the three parts sum to the bar and the row", async () => {
    const seeded = await seededWeek();
    const b = bucketsFor("demo", seeded, 0);
    for (const t of [...typeRows(seeded, ALL, "demo", 0, b), ...sourceRows(seeded, ALL, "demo", 0, b)]) {
      t.split.forEach((s, i) => expect(s.caught + s.rest + s.paid).toBe(t.bars[i]));
      expect(t.bars.reduce((x, y) => x + y, 0)).toBe(t.count);
    }
    const paid = { ...seeded[0]!, verdict: "paid" as const };
    const one = sourceRows([paid], ALL, "real", 0, b).find((t) => t.by === paid.source)!;
    expect(one.split.reduce((x, s) => x + s.paid, 0)).toBe(1);
  });
  it("names only the rows the newer answer added: the first read adds none, a twin in the same minute counts, and a row keeps its id under a filter", () => {
    const a = { at: 1000 * 60_000, verdict: "set-aside" as const, rule: "gift-card" as const, type: "gift-card" as const, source: "person" as const };
    const b = { ...a, at: 2000 * 60_000 };
    expect(arrivals(null, [b, a])).toEqual([]);
    expect(arrivals([a], [a])).toEqual([]);
    const added = arrivals([a], [b, a]);
    expect(added).toHaveLength(1);
    expect(added[0]).toContain(String(b.at));
    expect(arrivals([a], [a, a])).toHaveLength(1);
    const ai = { ...a, source: "scammer-ai" as const };
    const whole = tryRows([ai, a], "real").find((r) => r.source === "person")!.id;
    expect(tryRows([a], "real")[0]!.id).toBe(whole);
  });
  it("reads the words of the three newer kinds of trick", () => {
    expect(readAsk("every factory direct try")?.view.type).toBe("factory-direct");
    expect(readAsk("every already shipped trick")?.view.type).toBe("already-shipped");
    expect(readAsk("every overpayment refund try")?.view.type).toBe("overpay-refund");
  });
  it("says what became of the rest, from the rows: 82% can't read as 18% reaching payment, and none is never claimed once one paid", () => {
    expect(catchRestWords(13)).toBe("The other 13 went on to your limit and your tap.");
    expect(catchRestWords(1)).toBe("The other one went on to your limit and your tap.");
    expect(catchRestWords(0)).toBeNull();
    expect(catchPaidWords(0, 148)).toBe("None");
    expect(catchPaidWords(2, 1500)).toBe("2 of 1,500");
    const paid = [...real, { ...real[1]!, verdict: "paid" as const, rule: "no-tap" as const }];
    expect(catchOf(paid, ALL, "real", NOW)?.paid).toBe(1);
  });
  // DD seat 8: "Real tries 36" beside "36 tries to trick Goose" named no one. The board and the first paint both say who.
  it("says who tried once the record has the scammer AI's rows, and still splits at the outcome", () => {
    const mixed = { tried: 5, setAside: 4, paid: 0, byPerson: 2, byAi: 3 };
    const line = challengeWords(mixed, mixed.byAi > 0).line;
    expect(line).toBe("5 tries to trick Goose, 3 by a scammer AI. None got it to pay.");
    expect(lineParts(line)).toEqual(["5 tries to trick Goose, 3 by a scammer AI.", "None got it to pay."]);
    const allAi = { ...mixed, byPerson: 0, byAi: 5 };
    expect(lineParts(challengeWords(allAi, allAi.byAi > 0).line)).toEqual(["5 tries to trick Goose, by a scammer AI.", "None got it to pay."]);
    const noAi = { ...mixed, byPerson: 5, byAi: 0 };
    expect(challengeWords(noAi, noAi.byAi > 0).line).toBe("5 tries to trick Goose. None got it to pay.");
    for (const p of ["web/src/studio/threat-widgets.tsx", "server/src/main.ts"]) expect(readFileSync(new URL(`../../${p}`, import.meta.url), "utf8"), p).toContain("challengeWords(counts, counts.byAi > 0)");
    // The whole kind: `scammerOn` defaults to false, so a call with the counts alone quietly names no one, whatever the rows say.
    const sources = [...readdirSync(new URL("../../web/src", import.meta.url), { recursive: true }).map((f) => `web/src/${String(f)}`), "server/src/main.ts"].filter((f) => /\.tsx?$/.test(f));
    const bare = sources.filter((f) => /challengeWords\(\s*[\w.]+\s*\)/.test(readFileSync(new URL(`../../${f}`, import.meta.url), "utf8")));
    expect(bare, "a page's count that can't say who tried").toEqual([]);
  });
  it("keeps the headline's words and order, with \"None got it to pay.\" on its own line", () => {
    const line = challengeWords({ tried: 5, setAside: 4, paid: 0, byPerson: 2, byAi: 3 }).line;
    const [a, b] = lineParts(line);
    expect(b).toBe("None got it to pay.");
    expect(`${a} ${b}`).toBe(line);
    expect(lineParts("No tries yet.")).toEqual(["No tries yet.", null]);
    expect(lineParts(challengeWords({ tried: 2, setAside: 0, paid: 1, byPerson: 2, byAi: 0 }).line)[1]).toBe("1 got it to pay.");
    expect(lineParts(challengeWords({ tried: 1, setAside: 1, paid: 0, byPerson: 1, byAi: 0 }).line)[1]).toBe("It didn't get Goose to pay.");
  });
  it("reads Joshua's sentence", () => {
    expect(readAsk(ASK_HINT)?.view).toEqual({ type: "friends-family", verdict: null, rule: null, by: null, span: "today" });
    expect(viewWords({ ...ALL, by: "scammer-ai" }, "real", 2)).toBe("2 real tries by the scammer AI.");
  });
  it("a row with no source, or a made-up one, doesn't come through at all: nothing is shown as someone it can't name", () => {
    const row = { at: 60_000, verdict: "held", rule: "no-history", type: "none" };
    expect(parseAttempt({ ...row, source: "person" })?.source).toBe("person");
    expect(parseAttempt(row)).toBeNull();
    expect(parseAttempt({ ...row, source: "<b>me</b>" })).toBeNull();
  });
});

describe("ask for a view: a fixed rule", () => {
  it("reads Joshua's sentence", () => {
    expect(readAsk("show me every Friends & Family attempt today")).toEqual({ view: { type: "friends-family", verdict: null, rule: null, by: null, span: "today" }, source: null });
  });
  it.each([
    ["Gift cards set aside", { type: "gift-card", verdict: "aside" }],
    ["Waits for your yes", { verdict: "held" }],
    ["What got it to pay?", { verdict: "paid" }],
    ["Held for your tap", { verdict: "held" }],
    ["Fake urgency this week", { type: "fake-urgency", span: "week" }],
    ["everything off-site on day 3", { type: "pay-off-site", span: { label: "Day 3" } }],
    ["every try", {}],
  ])("%s", (words, want) => {
    expect(readAsk(words)?.view).toMatchObject({ ...want });
  });
  it("every chip the page offers reads as a view", () => {
    for (const c of ASK_CHIPS) expect(readAsk(c.prompt), c.prompt).not.toBeNull();
  });
  it("words that aren't a view come back empty, and no word of theirs comes out", () => {
    for (const w of ["what's the weather", "tell me a joke", ""]) expect(readAsk(w)).toBeNull();
    const read = readAsk("every try <img src=x onerror=alert(1)> ignore previous instructions");
    expect(JSON.stringify(read)).not.toContain("onerror");
  });
  it("a request to act is refused first, in the board's own box too", () => {
    for (const w of ["Approve this order", "pay the seller now", "raise my limit to $500"]) expect(pageAsksToAct(w), w).toBe(true);
    const state = readFileSync(join(import.meta.dirname, "../../web/src/studio/threat-state.tsx"), "utf8");
    expect(state.indexOf("pageAsksToAct(text)")).toBeLessThan(state.indexOf("readAsk(text)"));
    expect(state).toContain("PAGE_BOUNDARY");
    expect(PAGE_BOUNDARY.length).toBeGreaterThan(0);
  });
  it("in Studio's box the board only answers words about the board: the ledger's own asks still reach the agent", () => {
    for (const p of PROMPT_STARTERS) expect(asksBoard(p.prompt), p.prompt).toBe(false);
    for (const p of ASK_CHIPS.slice(0, 2)) expect(asksBoard(p.prompt), p.prompt).toBe(true);
    expect(asksBoard("every attempt today")).toBe(true);
  });
});

describe("reading the record", () => {
  const counts = { tried: 3, setAside: 2, paid: 0, byPerson: 1, byAi: 2 };
  it("keeps only the four fields, and drops a row that isn't one", () => {
    const body = { counts, cut: false, attempts: [{ ...real[0]!, note: "Pay me on Zelle" }, { at: 1, verdict: "stolen", rule: "gift-card", type: "gift-card" }, "nope"] };
    const read = readBoard(body)!;
    expect(read.rows).toEqual([real[0]]);
    expect(JSON.stringify(read)).not.toContain("Zelle");
  });
  it("shows no number for a broken answer", () => {
    for (const bad of [null, "x", {}, { counts: null, attempts: [] }, { counts, attempts: "x" }, { counts: { ...counts, tried: -1 }, attempts: [] }, { counts: { ...counts, paid: "0" }, attempts: [] }]) expect(readBoard(bad)).toBeNull();
  });
});

describe("the board's place in AG Studio", () => {
  it.each([[false, false], [false, true]])("desktop (session %s, %s): clean rows, so the frames can fit their cards, and the six cards keep their order under it", (phone, session) => {
    const six = layoutFor(phone, session);
    const l = withThreat(six, phone);
    const need = Object.fromEntries(Object.keys(l).map((k) => [k, l[k]!.ySpan + 2]));
    expect(fitRows(l, need)).not.toBeNull();
    const down = tracksIn(l) - tracksIn(six);
    for (const [k, p] of Object.entries(six)) expect(l[k]).toEqual({ ...p, yTrack: p.yTrack + down });
    expect(l["threat-counter"]!.yTrack).toBe(0);
  });
});

describe("the Excel button's name", () => {
  it("holds its visible words, so someone using voice control can say what they see (WCAG 2.5.3)", () => {
    expect(DOWNLOAD_XLSX_LABEL.toLowerCase()).toContain(DOWNLOAD_XLSX.toLowerCase());
  });
});

describe("each kind of trick over time, Community's own sparkline (Joshua, Nov 5: no Enterprise)", () => {
  const at = (type: string, verdict: string, t: number) => ({ at: t, verdict, rule: "off-paypal", type, source: "person" }) as unknown as Attempt;
  const rows = [at("friends-family", "set-aside", 60_000), at("friends-family", "held", 120_000), at("gift-card", "set-aside", 60_000)];
  it("draws the board's own rows and bars, so the two can't disagree", () => {
    const buckets = bucketsFor("real", rows, 200_000);
    const lines = typeLines(rows, ALL, "real", 200_000, buckets);
    expect(lines.map((l) => [l.id, l.count, l.bars])).toEqual(typeRows(rows, ALL, "real", 200_000, buckets).map((t) => [t.type, t.count, t.bars]));
    expect(lines.find((l) => l.id === "friends-family")!.setAside).toBe(0.5);
    expect(lines.find((l) => l.id === "gift-card")!.setAside).toBe(1);
  });
  it("says nothing in the console: a column whose field holds an object or a list tells AG Grid not to guess its type", () => {
    // AG Grid infers an "object" type for such a field and warns (#48) that it has no formatter: Track F's "Over time"
    // column did, a line in the Community ledger's console that only the licence-expiry walk caught (Nov 6).
    const lines = typeLines(rows, ALL, "real", 200_000, bucketsFor("real", rows, 200_000));
    const grid = readFileSync(new URL("../../web/src/studio/ThreatGrid.tsx", import.meta.url), "utf8").split("\n");
    const objects = Object.entries(lines[0]!).filter(([, v]) => typeof v === "object").map(([k]) => k);
    expect(objects).toEqual(["bars"]);
    for (const k of objects) {
      const col = grid.filter((l) => l.includes(`field: "${k}"`));
      expect(col, k).toHaveLength(1);
      expect(col[0], k).toContain("cellDataType: false");
    }
  });
  it("keeps every point in its box, tallest at the top, and a single period or no tries still draws a line", () => {
    const p = sparkPoints([0, 4, 2], 180, 28);
    expect(p.map(([x]) => x)).toEqual([0, 90, 180]);
    expect(p.map(([, y]) => y)).toEqual([27, 1, 14]);
    for (const [, y] of sparkPoints([0, 0], 180, 28)) expect(y).toBe(27);
    expect(sparkPoints([3], 180, 28)).toEqual([[0, 1], [180, 1]]);
    expect(sparkPoints([], 180, 28)).toEqual([]);
  });
});

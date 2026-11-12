// The ratchet's own rules (scripts/ratchet-lib.ts): every way a number can get worse fails, and only a written reason from
// the DD or Q lets one through. A gate nobody has seen fail is decoration (check-bundle's self-check says the same).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addDay, boardLine, boardTable, BOARD_END, BOARD_START, compare, dayRow, failing, lowerIsBetter, overrideProblems, report, spliceBoard, tighten, trendTable, type BoardInput, type Override, type RatchetFile } from "../../scripts/ratchet-lib.ts";

const LIMITS = { "tests.passed": 100, "tests.skipped": 0, "coverage.guard.branches": 100, "bundle.wallet": 50_000, "claims.rows": 80 };
const FINE = { "tests.passed": 100, "tests.skipped": 0, "coverage.guard.branches": 100, "bundle.wallet": 50_000, "claims.rows": 80 };
const TOL = 256;
const OK: Override = { metric: "bundle.wallet", limit: 60_000, by: "DD", reason: "The threat board is worth 10 KB on this route.", date: "2026-11-04" };
const fileOf = (): RatchetFile => ({ about: "x", bundleToleranceBytes: TOL, measuredAt: "2026-11-03", sha: "abc", limits: { ...LIMITS }, accepted: [] });
const worse = (m: Record<string, number>, o: Override[] = []) => failing(compare(LIMITS, m, o, TOL)).map((r) => r.metric);

describe("the ratchet", () => {
  it("passes today's numbers, and better ones", () => {
    expect(worse(FINE)).toEqual([]);
    expect(worse({ ...FINE, "tests.passed": 101, "bundle.wallet": 49_000, "claims.rows": 81 })).toEqual([]);
  });

  it("fails on each way a number can get worse", () => {
    expect(worse({ ...FINE, "tests.passed": 99 })).toEqual(["tests.passed"]);
    expect(worse({ ...FINE, "tests.skipped": 1 })).toEqual(["tests.skipped"]);
    expect(worse({ ...FINE, "coverage.guard.branches": 99.9 })).toEqual(["coverage.guard.branches"]);
    expect(worse({ ...FINE, "bundle.wallet": 50_000 + TOL + 1 })).toEqual(["bundle.wallet"]);
    expect(worse({ ...FINE, "claims.rows": 79 })).toEqual(["claims.rows"]);
  });

  it("gives a route's bytes only the small absolute tolerance; nothing else has any", () => {
    expect(worse({ ...FINE, "bundle.wallet": 50_000 + TOL })).toEqual([]);
    expect(lowerIsBetter("bundle.anything")).toBe(true);
    expect(lowerIsBetter("tests.skipped")).toBe(true);
    expect(lowerIsBetter("tests.passed")).toBe(false);
  });

  it("a number it can't read fails: a lost measurement is never a pass", () => {
    const { "claims.rows": _gone, ...lost } = FINE;
    expect(worse(lost)).toEqual(["claims.rows"]);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) expect(worse({ ...FINE, "bundle.wallet": bad })).toEqual(["bundle.wallet"]);
  });

  it("a number with no limit fails until --tighten adds it, so deleting a limit can't get a worse number through", () => {
    const rows = compare(LIMITS, { ...FINE, "bundle.new-route": 7_000 }, [], TOL);
    expect(failing(rows).map((r) => r.metric)).toEqual(["bundle.new-route"]);
    expect(failing(rows, true)).toEqual([]);
    expect(report(rows).join()).toContain("new bundle.new-route");
    const { "claims.rows": _deleted, ...fewer } = LIMITS;
    expect(failing(compare(fewer, { ...FINE, "claims.rows": 1 }, [], TOL)).map((r) => r.metric)).toEqual(["claims.rows"]);
  });

  it("an accepted reason lets a worse number through, up to what it accepted, and prints every run", () => {
    expect(worse({ ...FINE, "bundle.wallet": 55_000 }, [OK])).toEqual([]);
    expect(worse({ ...FINE, "bundle.wallet": 60_000 + TOL + 1 }, [OK])).toEqual(["bundle.wallet"]);
    expect(report(compare(LIMITS, { ...FINE, "bundle.wallet": 55_000 }, [OK], TOL)).join()).toContain(OK.reason);
    // An override for one metric lends nothing to another.
    expect(worse({ ...FINE, "bundle.wallet": 55_000, "claims.rows": 79 }, [OK])).toEqual(["claims.rows"]);
  });

  it("an override needs a metric, a limit, the DD or Q, a real reason and a date", () => {
    expect(overrideProblems([OK], LIMITS)).toEqual([]);
    const bad: [Partial<Override>, RegExp][] = [
      [{ metric: "bundle.nope" }, /names no metric/], [{ metric: "__proto__" }, /names no metric/], [{ limit: Number.NaN }, /numeric limit/], [{ limit: "60000" as unknown as number }, /numeric limit/],
      [{ by: "Lead" }, /DD or Q/], [{ by: "" }, /DD or Q/], [{ reason: "because" }, /written reason/], [{ reason: "                         " }, /written reason/], [{ date: "soon" }, /date/],
    ];
    for (const [change, why] of bad) expect(overrideProblems([{ ...OK, ...change }], LIMITS).join()).toMatch(why);
    expect(overrideProblems([OK, OK], LIMITS).join()).toMatch(/second override/);
    expect(overrideProblems("all", LIMITS).join()).toMatch(/must be a list/);
    expect(overrideProblems([null], LIMITS).length).toBeGreaterThan(0);
  });

  it("tighten keeps each day's best, folds an accepted reason so it stays on record, and refuses a failing number", () => {
    const rows = compare(LIMITS, { ...FINE, "tests.passed": 120, "bundle.wallet": 55_000, "claims.rows": 90, "bundle.new": 9 }, [OK], TOL);
    const { file, overrides } = tighten(fileOf(), rows, [OK], { date: "2026-11-05", sha: "def" });
    expect(file.limits).toMatchObject({ "tests.passed": 120, "bundle.wallet": 55_000, "claims.rows": 90, "bundle.new": 9 });
    expect(file.accepted).toEqual([{ ...OK, foldedAt: "2026-11-05" }]);
    expect(overrides).toEqual([]);
    // Better than the limit by less than the tolerance still lowers it; worse within the tolerance never raises it.
    const near = tighten(fileOf(), compare(LIMITS, { ...FINE, "bundle.wallet": 49_990 }, [], TOL), [], { date: "d", sha: "s" });
    expect(near.file.limits["bundle.wallet"]).toBe(49_990);
    const noise = tighten(fileOf(), compare(LIMITS, { ...FINE, "bundle.wallet": 50_100 }, [], TOL), [], { date: "d", sha: "s" });
    expect(noise.file.limits["bundle.wallet"]).toBe(50_000);
    // An override the number no longer needs is dropped, and leaves no blank cheque.
    const unused = tighten(fileOf(), compare(LIMITS, FINE, [OK], TOL), [OK], { date: "d", sha: "s" });
    expect(unused.overrides).toEqual([]);
    expect(unused.file.accepted).toEqual([]);
    expect(() => tighten(fileOf(), compare(LIMITS, { ...FINE, "tests.passed": 1 }, [], TOL), [], { date: "d", sha: "s" })).toThrow(/failing number/);
  });

  it("says the numbers for the board in one line", () => {
    expect(boardLine({ ...FINE, "bundle.big": 102_400 }, { "bundle.big": 30_720 })).toBe("tests 100 (0 skipped), money coverage 100%, claims 80, 2 routes, heaviest big 100.0 KB (30.0 KB gz)");
    expect(boardLine({ ...FINE })).toContain("heaviest wallet 48.8 KB");
    expect(boardLine({ "tests.passed": 1, "tests.skipped": 0, "claims.rows": 1 })).toContain("money coverage 0%");
  });

  it("the checked-in limits are measured numbers with the money paths at 100, and no override sits unread", () => {
    const root = new URL("../../docs/guild/", import.meta.url);
    const file = JSON.parse(readFileSync(new URL("ratchet.json", root), "utf8")) as RatchetFile;
    const cov = Object.entries(file.limits).filter(([k]) => k.startsWith("coverage."));
    expect(cov.length).toBe(20);
    for (const [k, v] of cov) expect(v, k).toBe(100);
    expect(file.limits["tests.passed"]).toBeGreaterThan(1000);
    expect(Object.keys(file.limits).filter((k) => k.startsWith("bundle.")).length).toBeGreaterThanOrEqual(10);
    expect(overrideProblems((JSON.parse(readFileSync(new URL("ratchet-overrides.json", root), "utf8")) as { overrides: unknown }).overrides, file.limits)).toEqual([]);
  });
});

describe("the board's numbers", () => {
  const AT = "2026-11-04T12:00:00.000Z";
  const zeroes = { axeViolations: { value: 0 }, keyboardTourFailed: { value: 0 }, consoleErrors: { value: 0 }, assets404: { value: 0 }, liveWalksFailed: { value: 0 }, interactionP95Ms: { value: 24 }, "firstScreenP95Ms /": { value: 450 } };
  const input = (over: Partial<BoardInput> = {}): BoardInput => ({ at: AT, sha: "abc12345", dirty: false, measured: { ...FINE }, gz: { "bundle.wallet": 15_000 }, unread: [], limits: { ...LIMITS }, bundleToleranceBytes: TOL, live: { at: "2026-11-04T08:00:00.000Z", base: "https://site.example", ranFrom: "abc", metrics: { ...zeroes } }, best: { "firstScreenP95Ms /": 450, interactionP95Ms: 24 }, ...over });
  const row = (table: string, name: string) => table.split("\n").find((l) => l.startsWith(`| ${name}`)) ?? "";

  it("names every number Joshua's report needs", () => {
    const t = boardTable(input());
    for (const name of ["Tests passing", "Money paths' coverage", "First screen p95, /", "First load, wallet", "Axe violations", "Keyboard-only", "Console errors", "Asset 404s", "Failed live walks", "Claims rows", "Interaction p95"]) expect(row(t, name), name).not.toBe("");
    expect(t).not.toContain("WORSE");
    expect(t).not.toContain("not measured");
  });

  it("a number that couldn't be read says so and why, never a pass", () => {
    const { "tests.passed": _gone, ...rest } = FINE;
    const t = boardTable(input({ measured: rest, unread: ["tests: the test results are over an hour old."] }));
    expect(row(t, "Tests passing")).toContain("not measured: the test results are over an hour old.");
    const noted = boardTable(input({ live: { ...input().live!, metrics: { ...zeroes, liveWalksFailed: { value: null, note: "didn't finish: one-nav" } } } }));
    expect(row(noted, "Failed live walks")).toContain("not measured: didn't finish: one-nav");
    const none = boardTable(input({ live: null, best: {} }));
    expect(row(none, "Axe violations")).toContain("not measured: nothing recorded yet");
  });

  it("a worse number reads WORSE, on either side of the ratchet", () => {
    expect(row(boardTable(input({ measured: { ...FINE, "tests.passed": 99 } })), "Tests passing")).toContain("WORSE");
    expect(row(boardTable(input({ measured: { ...FINE, "bundle.wallet": 50_000 + TOL + 1 } })), "First load, wallet")).toContain("WORSE");
    expect(row(boardTable(input({ measured: { ...FINE, "bundle.wallet": 50_000 + TOL } })), "First load, wallet")).not.toContain("WORSE");
    const slow = input({ live: { ...input().live!, metrics: { ...zeroes, "firstScreenP95Ms /": { value: 900 } } } });
    expect(row(boardTable(slow), "First screen p95, /")).toContain("WORSE");
  });

  it("the absolutes are held to 0, with no best to hide behind", () => {
    const red = input({ live: { ...input().live!, metrics: { ...zeroes, axeViolations: { value: 1, note: "skip-link x1" } } } });
    expect(row(boardTable(red), "Axe violations")).toContain("WORSE (skip-link x1)");
    expect(row(boardTable(red), "Axe violations")).toContain("must be 0");
  });

  it("old live numbers say they're old, and today's row leaves them blank", () => {
    const old = input({ at: "2026-11-06T12:00:00.000Z" });
    expect(row(boardTable(old), "Axe violations")).toContain("stale, 52 h old");
    expect(dayRow(old).numbers.axe).toBeNull();
    expect(dayRow(input()).numbers.axe).toBe(0);
    expect(dayRow(old).numbers.tests).toBe(100);
  });

  it("says when the numbers aren't a commit's", () => {
    expect(row(boardTable(input({ dirty: true })), "Tests passing")).toContain("abc12345 plus uncommitted code");
    expect(row(boardTable(input()), "Tests passing")).not.toContain("uncommitted");
  });

  it("keeps one row a day, the newest winning, and blanks a day's unmeasured number", () => {
    const day = (date: string, tests: number) => ({ date, sha: "s", numbers: { tests } });
    const days = addDay(addDay([day("2026-11-03", 1), day("2026-11-04", 2)], day("2026-11-04", 3)), day("2026-11-05", 4), 2);
    expect(days.map((d) => [d.date, d.numbers.tests])).toEqual([["2026-11-04", 3], ["2026-11-05", 4]]);
    expect(trendTable([{ date: "2026-11-04", sha: "s", numbers: { tests: 5, axe: null } }])).toContain("| 2026-11-04 | s | 5 | – |");
  });

  it("changes only what's between the markers, and refuses to guess where they are", () => {
    const md = `top\n${BOARD_START}\nold\n${BOARD_END}\nbottom\n`;
    expect(spliceBoard(md, "new")).toBe(`top\n${BOARD_START}\nnew\n${BOARD_END}\nbottom\n`);
    expect(spliceBoard(spliceBoard(md, "new"), "new")).toBe(spliceBoard(md, "new"));
    for (const bad of ["no markers", BOARD_START, `${BOARD_END}${BOARD_START}`, `${md}${BOARD_START}`]) expect(() => spliceBoard(bad, "x"), bad).toThrow();
  });

  it("the board carries its markers", () => {
    expect(() => spliceBoard(readFileSync(new URL("../../docs/guild/board.md", import.meta.url), "utf8"), "x")).not.toThrow();
  });
});

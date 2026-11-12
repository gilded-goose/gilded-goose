// scripts/bench.ts (Lead-13, Wed Nov 11): the runner anyone can point at their own guard. Our own guard is the worked
// example, so these hold what it prints against what we publish.
// - On the Nov 4 set, today's plain-code guard gives every note the stored verdict, so the bench reproduces the published
//   code-alone tallies (the `fresh-*` claims rows) exactly.
// - On the Oct 28 set the rules have changed since the recorded run, so today's line is NOT the published one. That is
//   said, not hidden: the stored run stays the record, and today's guard is never less careful on any of its notes.
// If a rule change moves a Nov 4 note, the first test fails on purpose: the stored first run still stands (it happened
// once), so keep the claims rows and change that test to the Oct 28 one's shape, never the fixture.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { claimRows } from "../src/proof.ts";
import { bench, benchLine, type Verdict } from "../src/view/wall.ts";
import { builtNotes } from "../../web/wall-data.ts";
import { report, stored } from "../../scripts/bench.ts";
import goose from "../../scripts/bench-goose.ts";

const { file } = builtNotes();
const value = (id: string) => claimRows(readFileSync(new URL("../../docs/claims.md", import.meta.url), "utf8")).find((r) => r.id === id)!.value;
const RANK: Record<Verdict, number> = { clear: 0, held: 1, aside: 2 };

describe("the bench, on our own guard", () => {
  it("reproduces the published code-alone tallies of the Nov 4 set, note by note", async () => {
    const nov = file.notes.filter((n) => n.set === "nov-4");
    expect(nov.filter((n) => goose(n.note) !== n.code).map((n) => n.note)).toEqual([]);
    const today = (await bench(file, goose)).find((s) => s.id === "nov-4")!;
    const then = stored(file, "code").find((s) => s.id === "nov-4")!;
    expect(today).toEqual(then);
    expect(`${today.scam.clear} of ${today.scam.of}`).toBe(value("fresh-code-through"));
    expect(`${today.fair.held} of ${today.fair.of}`).toBe(value("fresh-fair-held"));
    expect(`${today.fair.aside} of ${today.fair.of}`).toBe(value("fresh-fair-refused"));
  });

  it("on the Oct 28 set today's rules differ from the recorded run, and only toward more careful", async () => {
    const oct = file.notes.filter((n) => n.set === "oct-28");
    const moved = oct.filter((n) => goose(n.note) !== n.code);
    expect(moved.length).toBeGreaterThan(0); // if this reaches 0, say so in scripts/bench.ts's header and drop this line
    for (const n of oct) expect([n.note, RANK[goose(n.note)] >= RANK[n.code]]).toEqual([n.note, true]);
    // The stored counts are still the published ones, whatever today's rules do.
    const then = stored(file, "code").find((s) => s.id === "oct-28")!;
    expect(`${then.scam.clear} of ${then.scam.of}`).toBe(value("blind-code-through"));
    expect(`${then.fair.held} of ${then.fair.of}`).toBe(value("blind-fair-code-held"));
  });

  it("prints a guard's counts beside ours, both ways, and says it is not a rate", async () => {
    const lines = await report(file, goose, "ours");
    expect(lines[0]).toBe("ours, on 189 notes:");
    expect(lines.filter((l) => l.includes("ours, code alone, as recorded:"))).toHaveLength(2);
    expect(lines.filter((l) => l.includes("ours, with the AI reader, recorded:"))).toHaveLength(2);
    expect(lines.join("\n")).toContain(benchLine(stored(file, "withReader")[0]!).replace("nov-4: ", ""));
    expect(lines.at(-1)!.startsWith("Not a rate.")).toBe(true);
    expect(lines.join("\n")).not.toMatch(/%|\bblind\b/i);
  });
});

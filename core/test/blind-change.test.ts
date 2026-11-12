// Round 6 (R's seat, Thu Nov 5): the Proof page said "the 26 that code alone held were refused" over rows that showed
// code alone held 29. Both numbers were true (3 of the 29 stayed held), but the line read as a second count of one
// thing. The line now names the whole whenever a cell is only part of it, and this test holds every number the line
// says to the rows' own counts, for every blind set the page draws.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { changeLine, countsOf, parseBlindPairs, type Outcome, type SetPairs } from "../../web/src/charts/blind.ts";

const claims = readFileSync(new URL("../../docs/claims.md", import.meta.url), "utf8");
const value = (id: string) => claims.split("\n").find((l) => l.startsWith(`| ${id} |`))!.split("|")[4]!.trim();
const SETS = ["fresh-counts", "d-blind-pairs"] as const;
const DID: Record<string, Outcome> = { "got through with code alone": "clear", "code alone cleared": "clear", "code alone held": "hold", "code alone refused": "refuse" };

describe("what the AI reader changed says the same numbers as the rows above it", () => {
  for (const id of SETS) for (const s of parseBlindPairs(value(id))) {
    it(`${id}, ${s.set}: each "N that code alone …" is that row's whole count, or says "N of the M"`, () => {
      const line = changeLine(s), code = countsOf(s, "code");
      const said = [...line.matchAll(/(?:the (\d+)|(\d+) of the (\d+)) that ((?:got through with code alone)|(?:code alone \w+))/g)];
      expect(said.length).toBe(s.pairs.filter((p) => p.code !== p.reader).length);
      for (const m of said) {
        const whole = Number(m[1] ?? m[3]), o = DID[m[4]!]!;
        expect(whole, `${m[0]} in "${line}"`).toBe(code[o]); // the whole always matches the code row's count
        if (m[2]) expect(Number(m[2])).toBeLessThan(whole);
      }
    });
  }
  it("the Nov 4 scam set says 26 of the 29 (the line Round 6 caught), and a whole cell keeps its plain wording", () => {
    const [scam, fair] = parseBlindPairs(value("fresh-counts"));
    expect(changeLine(scam!)).toContain("26 of the 29 that code alone held were refused");
    expect(changeLine(scam!)).toContain("the 21 that got through with code alone were held for your yes");
    expect(changeLine(fair!)).toContain("4 of the 9 that code alone held were refused");
  });
  it("a set the reader didn't change says so", () => {
    const s: SetPairs = { set: "fair", of: 2, pairs: [{ code: "clear", reader: "clear", n: 2 }] };
    expect(changeLine(s)).toBe("The AI reader changed none of these notes.");
  });
});

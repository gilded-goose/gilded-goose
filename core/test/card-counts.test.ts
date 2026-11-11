// Two cards of one page must count one thing one way. The AG seat, Nov 5: a chart of the tries gave Nov 4 one try while
// Every try listed two (Studio's Day was the UTC date, the board's the reader's own), and "3 sellers set aside" was one seller three times.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { dayKey, dayWords, whenWords } from "../../web/src/studio/threat-model.ts";
import { setAsideCount } from "../../web/src/studio/words.ts";
import type { Attempt } from "@goose/core";

// Live's tries on Nov 5: 4:59 PM on Nov 4 in California is already Nov 5 in UTC.
const AT_EVENING = Date.UTC(2026, 10, 5, 0, 59), AT_MORNING = Date.UTC(2026, 10, 4, 18, 48);
const attempt = (id: string, at: number) => ({ id, at, type: "none", verdict: "held", rule: "none", by: "person" }) as unknown as Attempt;
const day = (rows: readonly Attempt[]): string[] => rows.map((r) => dayKey(r.at));

describe("a day is the reader's day on every card", () => {
  const zone = process.env.TZ;
  afterEach(() => { process.env.TZ = zone; });
  for (const tz of ["America/Los_Angeles", "UTC", "Asia/Tokyo", "Pacific/Auckland"]) {
    it(`Studio's Day, the chart's day and Every try's time agree in ${tz}`, () => {
      process.env.TZ = tz;
      const rows = [attempt("a", AT_MORNING), attempt("b", AT_EVENING)];
      day(rows).forEach((d, i) => {
        const [y, m, dd] = d.split("-").map(Number);
        const named = new Date(y!, m! - 1, dd!, 12).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        expect(named).toBe(dayWords(rows[i]!.at, "real"));
        expect(whenWords(rows[i]!.at, "real").startsWith(named)).toBe(true);
      });
    });
  }
  it("in California the two tries are both Nov 4, as Every try lists them", () => {
    process.env.TZ = "America/Los_Angeles";
    expect(day([attempt("a", AT_MORNING), attempt("b", AT_EVENING)])).toEqual(["2026-11-04", "2026-11-04"]);
  });
  it("Studio's Day is that day, and no card takes a date from toISOString, which is UTC's", () => {
    const data = readFileSync(new URL("../../web/src/studio/data.ts", import.meta.url), "utf8");
    expect(data).toContain("dayKey(a.at)");
    expect(data).not.toContain("toISOString");
    expect(readFileSync(new URL("../../web/src/studio/threat-model.ts", import.meta.url), "utf8")).not.toMatch(/toISOString\(\)/);
  });
  it("the day still sorts as a date, for a chart that sorts its text", () => {
    process.env.TZ = "America/Los_Angeles";
    expect(day([attempt("a", Date.UTC(2026, 9, 31, 20)), attempt("b", Date.UTC(2026, 10, 1, 20))])).toEqual(["2026-10-31", "2026-11-01"]);
  });
});

describe("a count of sellers counts sellers", () => {
  it("the card draws it from the names, not from a count of its rows", () => {
    const card = readFileSync(new URL("../../web/src/studio/widgets/index.tsx", import.meta.url), "utf8");
    expect(card).toContain('setAsideCount(skipped.map((r) => r.who.split(" → ")[1] ?? r.who))');
    expect(card).not.toContain("${skipped.length} sellers");
  });
  it("one seller set aside three times is one seller, and says so", () => {
    expect(setAsideCount(["QuickQuack", "QuickQuack", "QuickQuack"])).toBe("One seller set aside, 3 times");
  });
  it("sellers once each need no times", () => {
    expect(setAsideCount(["QuickQuack"])).toBe("One seller set aside");
    expect(setAsideCount(["QuickQuack", "Reedbank"])).toBe("2 sellers set aside");
    expect(setAsideCount([])).toBe("0 sellers set aside");
  });
  it("more rows than sellers says both", () => {
    expect(setAsideCount(["QuickQuack", "Reedbank", "QuickQuack"])).toBe("2 sellers set aside, 3 times");
  });
});

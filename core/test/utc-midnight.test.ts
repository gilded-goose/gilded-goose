import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DailyCap } from "../../trust/src/caps.ts";
import { DAY_MS, LONGEST_TEST_MS, MARGIN_MS, waitBeforeTest } from "./utc-day.ts";

// R's clock sweep of ba94fca8: the day-cap tests boot a real server and count to a 429 on the real clock. A run that
// straddles 00:00 UTC starts the count over and turns them red. clear-of-midnight.ts holds every core test clear of it.
const MIDNIGHT = Date.UTC(2026, 10, 7);

describe("no core test straddles 00:00 UTC", () => {
  it("the flake, as it was: a cap of 2 taken twice lets a third through once the UTC day turns", () => {
    let t = MIDNIGHT - 20_000;
    const cap = new DailyCap(2, () => t);
    expect([cap.take("ip"), cap.take("ip"), cap.take("ip")]).toEqual([true, true, false]);
    t = MIDNIGHT + 1; // the same test, 20 s later
    expect(cap.take("ip")).toBe(true);
  });

  it("waitBeforeTest: none at noon or just after midnight; up to just past midnight when it is too close", () => {
    expect(waitBeforeTest(MIDNIGHT - DAY_MS / 2)).toBe(0);
    expect(waitBeforeTest(MIDNIGHT)).toBe(0);
    expect(waitBeforeTest(MIDNIGHT + 1_000)).toBe(0);
    expect(waitBeforeTest(MIDNIGHT - 30_000)).toBe(31_000);
    expect(waitBeforeTest(MIDNIGHT - 1)).toBe(1_001);
    const edge = LONGEST_TEST_MS + MARGIN_MS;
    expect(waitBeforeTest(MIDNIGHT - edge)).toBe(edge + 1_000);
    expect(waitBeforeTest(MIDNIGHT - edge - 1)).toBe(0);
    // A test that starts when no wait is asked ends before 00:00 UTC, even at its longest.
    for (const start of [MIDNIGHT - edge - 1, MIDNIGHT - DAY_MS / 2, MIDNIGHT + 1_000]) {
      const begin = start + waitBeforeTest(start);
      expect(Math.floor(begin / DAY_MS)).toBe(Math.floor((begin + LONGEST_TEST_MS) / DAY_MS));
    }
  });

  it("LONGEST_TEST_MS is at least every timeout a core test or hook asks for, and the default", () => {
    const dir = new URL("./", import.meta.url);
    const asked = readdirSync(dir).filter((f) => f.endsWith(".ts")).flatMap((f) =>
      [...readFileSync(new URL(f, dir), "utf8").matchAll(/\}, (\d[\d_]*)\);/g)].map((m) => [f, Number(m[1]!.replaceAll("_", ""))] as const));
    expect(asked.length).toBeGreaterThan(100);
    expect(asked.filter(([, ms]) => ms > LONGEST_TEST_MS)).toEqual([]);
    expect(readFileSync(new URL("../vitest.config.ts", import.meta.url), "utf8")).toMatch(/testTimeout: 30_000/);
  });

  it("in every vitest config core runs", () => {
    for (const config of ["../vitest.config.ts", "../vitest.money.config.ts"]) {
      expect(readFileSync(new URL(config, import.meta.url), "utf8"), config).toContain("./test/clear-of-midnight.ts");
    }
  });
});

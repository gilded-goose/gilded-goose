// design-holds' real-prices room on a fixed clock (R's clock sweep, Fri Nov 6). The server shows its recording for
// RECORDED_MAX_DAYS after the call, by the real clock, so from Dec 25 the panel the walk measures stopped drawing and the walk
// went red on the calendar alone. The walk now answers /api/prices with the server's own ReferencePrices, its clock a day
// after the recording's newest call. This proves that clock draws every recorded query, that the real clock past the window
// does not (the cliff the walk no longer stands on), and pins the walk to it.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRecorded, QUERIES, RECORDED_MAX_DAYS, ReferencePrices } from "../../server/src/adapters/channel3.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const recorded = parseRecorded(JSON.parse(read("docs/fixtures/channel3-recorded.json")));
const newest = Math.max(...Object.values(recorded?.queries ?? {}).map((q) => Date.parse(q.fetchedAt)));
const DAY = 86_400_000;
const prices = (now: number) => new ReferencePrices({ key: undefined, fetch: () => Promise.reject(new Error("no live call")), now: () => now, recorded, warn: () => {} });
const words = [...new Set([...QUERIES].map(([, q]) => q))];

describe("design-holds reads the recorded prices on the recording's clock, not the calendar's", () => {
  it("the recording parses and has a newest call", () => {
    expect(recorded).not.toBeNull();
    expect(Number.isFinite(newest)).toBe(true);
  });
  it("a day after the newest call, every recorded query draws", async () => {
    const p = prices(newest + DAY);
    for (const q of words) if (recorded!.queries[q]) expect((await p.forWords(q)).source, q).toBe("recorded");
  });
  it("the mutant: on a clock past the window (the real one from Dec 25) nothing draws, which is what turned the walk red", async () => {
    const p = prices(newest + (RECORDED_MAX_DAYS + 1) * DAY);
    for (const q of words) if (recorded!.queries[q]) expect((await p.forWords(q)).source, q).toBe("none");
  });
  it("the walk answers /api/prices with that clock, and never passes the call through to the server's", () => {
    const walk = read("scripts/design-holds.ts");
    expect(walk).toContain('import { parseRecorded, ReferencePrices } from "../server/src/adapters/channel3.ts";');
    expect(walk).toContain("const RECORDED_NOW = Math.max(...Object.values(RECORDED?.queries ?? {}).map((q) => Date.parse(q.fetchedAt))) + 86_400_000;");
    expect(walk).toContain("now: () => RECORDED_NOW");
    expect(walk).toContain('await r.fulfill({ json: await PRICES.forWords(new URL(r.request().url()).searchParams.get("q") ?? "")');
    expect(walk).not.toContain("await r.continue();");
  });
});

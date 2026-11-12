import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A run where every test passes must not fail on vitest's own 60 s call (turn-the-loop.ts). Remove the setup file and the second test fails.
describe("the event loop turns between tests", () => {
  let turned = false;
  it("a test leaves something for the next turn", () => {
    setImmediate(() => { turned = true; });
  });
  it("and it ran before the next test began", () => {
    expect(turned).toBe(true);
  });
  it("in every vitest config core runs", () => {
    for (const config of ["../vitest.config.ts", "../vitest.money.config.ts"]) {
      expect(readFileSync(new URL(config, import.meta.url), "utf8"), config).toContain("./test/turn-the-loop.ts");
    }
  });
});

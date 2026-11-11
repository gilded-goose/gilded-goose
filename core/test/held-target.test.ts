import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The DD's seat (Nov 4): "Try again" was about 18 px tall on the one line a broken page has left.
// A shopper who has just hit a failure still has to be able to tap the way out.
describe("the held line's way forward", () => {
  const css = readFileSync(new URL("../../web/src/held.css", import.meta.url), "utf8");
  const link = css.split('main.held a {')[1]?.split("}")[0] ?? "";

  it("is 44 px tall without moving the line it sits on", () => {
    expect(link).toMatch(/display:\s*inline-block/);
    expect(link).toMatch(/line-height:\s*44px/);
    expect(link).toMatch(/margin-block:\s*-12px/);
  });
});

// S1-6 named the Desk's limits pane "Limits in code" everywhere (`LIMITS_NAME`, core/src/view/menu.ts); the lines that
// send the shopper to set a limit say that name, never "Settings" (the wallet's own Settings tab keeps its name).
// The ask modules hold it as a literal (`LIMITS_PLACE`) to avoid an import cycle; this pins the two equal.
import { describe, expect, it } from "vitest";
import { LIMITS_NAME } from "../src/view/menu.ts";
import { LIMITS_PLACE, SAW_TYPE_A_PRICE, SETTINGS_ONLY } from "../src/ask/copy.ts";
import { WATCH_LIMITS_PLACE } from "../src/trust/pricewatch.ts";
import { wantOverLimit } from "../src/ask/wants.ts";
import { noLimitLine } from "../src/ask/watching.ts";
import { PRICE_WHY, priceNotLimit } from "../src/view/desk.ts";
import { demoPolicy } from "../src/scenario.ts";
import type { Cents } from "../src/money.ts";

describe("the lines that send her to set a limit name Limits in code", () => {
  it("the ask modules' literal is the menu's name", () => {
    expect(LIMITS_PLACE).toBe(LIMITS_NAME);
    // NITS-1 (C): the price watch's "raise … yourself in …" is a literal in the standalone trust package.
    expect(WATCH_LIMITS_PLACE).toBe(LIMITS_NAME);
  });
  it("each line names Limits in code and never Settings", () => {
    const lines = [SETTINGS_ONLY, SAW_TYPE_A_PRICE, wantOverLimit(6000 as Cents), noLimitLine("clothing", { ...demoPolicy(), categoryLimit: {} }) ?? "", PRICE_WHY, priceNotLimit("under 50 dollars")];
    for (const l of lines) {
      expect(l).toContain(LIMITS_NAME);
      expect(l).not.toMatch(/\bSettings\b/);
    }
  });
});

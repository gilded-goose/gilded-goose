// The Desk opening's clock (web/src/desk/opening-clock.ts): a long task that holds the glide's timer can't push the
// hero past its cap, because the glide is sized from the page's clock, not from when the timer fired.
import { describe, expect, it } from "vitest";
import { END_PAD, GLIDE_BY, GLIDE_MS, HERO_BY, MIN_GLIDE, glideMs } from "../../web/src/desk/opening-clock.ts";

describe("the opening's glide, on the page's clock", () => {
  it("is the full glide when it starts on time, or early", () => {
    expect(HERO_BY).toBe(1380);
    for (const t of [0, 350, 640, GLIDE_BY]) expect(glideMs(t)).toBe(GLIDE_MS);
  });

  it("shortens to land by the cap when a long task held its timer", () => {
    // Desk-S3's trace: the egg's WebGL setup held the 700 ms timer until about 975 ms.
    expect(glideMs(975)).toBe(365);
    for (const t of [701, 800, 975, HERO_BY - END_PAD - MIN_GLIDE]) {
      const ms = glideMs(t);
      expect(ms).toBeGreaterThanOrEqual(MIN_GLIDE);
      expect(ms).toBeLessThan(GLIDE_MS);
      expect(t + ms + END_PAD).toBeLessThanOrEqual(HERO_BY);
    }
  });

  it("is skipped (0) when too late for a glide that wouldn't read as a jump", () => {
    for (const t of [HERO_BY - END_PAD - MIN_GLIDE + 1, 1200, HERO_BY, 5000]) expect(glideMs(t)).toBe(0);
  });
});

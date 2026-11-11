// The DD's word sweeps (Wed Nov 4), so they can't come back. The site says "Goose can't pay. Only your tap in PayPal does.",
// so no shopper's line says Goose pays. "Looks good" claims more than the code knows: it misses real scams, and a row it
// found nothing on has only that to say. Comment lines are skipped for the first, not the second: a comment naming the
// old row words sends the next reader looking for them.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { asideTag } from "../src/view/desk.ts";
import { FF_CHECKOUT, OFF_SITE_CHECKOUT, OVERPAY_WHY, SHIPPED_WHY, peerWhy } from "../src/view/peer-why.ts";
import { ONLY_CHECKOUT } from "../src/ask/ladder-words.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  if (f === "node_modules" || f === "dist") return [];
  return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|css|html)$/.test(f) ? [p] : [];
});
const SOURCE = ["web/src", "core/src", "trust/src", "server/src"].flatMap((d) => files(join(ROOT, d)));
const isComment = (line: string) => /^\s*(?:\/\/|\/?\*)/.test(line);

describe("the DD's word sweeps", () => {
  it("no line on the site says Goose pays", () => {
    const hits = SOURCE.flatMap((f) => readFileSync(f, "utf8").split("\n").filter((l) => !isComment(l) && /\bGoose (?:only )?pays\b|\bIt never pays\b/.test(l)).map((l) => `${f}: ${l.trim().slice(0, 90)}`));
    expect(hits).toEqual([]);
    expect([FF_CHECKOUT, OFF_SITE_CHECKOUT, SHIPPED_WHY, OVERPAY_WHY, ONLY_CHECKOUT]).toEqual([
      "Payment only goes through PayPal checkout, never Friends & Family.",
      "Payment only goes through PayPal checkout.",
      "A seller's word that it shipped proves nothing. Payment only goes through PayPal checkout, after your tap.",
      "You pay exactly the cart's total, after your tap. Never extra on a promise to send money back.",
      "Payment only goes through PayPal checkout; other ways to pay are refused.",
    ]);
  });

  it("no line says what the agent can spend: the guard holds what a cart can cost, and only your tap spends", () => {
    const hits = [...SOURCE, join(ROOT, "docs/fixtures/seed-1.json"), join(ROOT, "scripts/user-sim/sim.ts")].flatMap((f) => readFileSync(f, "utf8").split("\n").filter((l) => /\b(?:agent|it|Goose) (?:can|may) spend\b/i.test(l)).map((l) => `${f}: ${l.trim().slice(0, 90)}`));
    expect(hits).toEqual([]);
    expect((JSON.parse(readFileSync(join(ROOT, "docs/fixtures/seed-1.json"), "utf8")) as { worstCase: { why: string } }).worstCase.why).toBe("The most any cart can cost right now: $60.00. Held by the guard, not by the AI.");
  });

  it('"not eligible" says for what', () => {
    expect(peerWhy(["it asks you to pay first on a page outside checkout"])?.lead).toBe("Not eligible for PayPal's Purchase Protection:");
  });

  it('no row anywhere says "Looks good"', () => {
    const hits = [...SOURCE, join(ROOT, "scripts/sm-shots.ts")].filter((f) => /looks good/i.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
    expect(readFileSync(join(ROOT, "web/src/desk/Desk.tsx"), "utf8")).toContain('"Nothing set aside"');
  });

  it("a tag that quotes a seller's claim uses curly quotes, like the glass case under it", () => {
    expect(asideTag(["it says it already shipped, so you'll pay before you can check"])).toBe("“already shipped”");
    const hits = SOURCE.filter((f) => /["'`\\]"already shipped\\?"/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});

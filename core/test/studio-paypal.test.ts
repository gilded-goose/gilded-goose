// The PayPal card's count (Track AS, slice 7; Round 2's data review): the demo week's seed is practice, never "1 row from
// PayPal". Three states over the rows the page itself composes: no PayPal row, the seed only (a browser that has asked
// nothing), and a real run with PayPal's own rows beside the seed. `scripts/check-claims.ts` (row `as-paypal-week`)
// reads the same function the card renders.
import { describe, expect, it } from "vitest";
import { DEMO_T0, seededRows } from "../src/index.ts";
import { sessionRows, streamed, weekRows, type LedgerRow } from "../src/view/session.ts";
import { isSeedRow, paypalCount, paypalCountWords } from "../../web/src/studio/paypal-words.ts";

const seedRows = (): LedgerRow[] => sessionRows(seededRows(DEMO_T0)).map(streamed);
const seedPayPal = (): LedgerRow => {
  const r = seedRows().find((x) => x.actor === "paypal");
  if (!r) throw new Error("the seeded week has no PayPal row");
  return r;
};
/** A row PayPal wrote in this browser's own run: the seed's shape with a live source. */
const live = (signed: boolean): LedgerRow => ({ ...seedPayPal(), part: "session", source: "live", signed, id: `s${signed ? 1 : 2}` });

describe("the PayPal card's count: the seed is practice, never a row from PayPal", () => {
  it("the seeded week's PayPal row is the seed (week part, seeded source), and no other seeded-week row is PayPal's", () => {
    const rows = seedRows();
    const paypal = rows.filter((r) => r.actor === "paypal");
    expect(paypal.length).toBe(1);
    expect(isSeedRow(paypal[0]!)).toBe(true);
    expect(paypal[0]!.signed).toBe(false); // a simulated capture, no webhook
    expect(weekRows([]).some((r) => r.actor === "paypal")).toBe(false);
  });

  it("empty: no PayPal row at all", () => {
    const rows = seedRows().filter((r) => r.actor !== "paypal");
    expect(paypalCount(rows)).toEqual({ real: 0, signed: 0, seed: 0 });
    expect(paypalCountWords(paypalCount(rows))).toBe("No PayPal rows in these rows yet.");
  });

  it("seed only (no session): a practice row, none signed, never 'from PayPal'", () => {
    const words = paypalCountWords(paypalCount(seedRows()));
    expect(paypalCount(seedRows())).toEqual({ real: 0, signed: 0, seed: 1 });
    expect(words).toBe("In these rows: 1 practice row (seeded), none signed by PayPal.");
    expect(words).not.toMatch(/\d+ rows? from PayPal/);
  });

  it("a real run: PayPal's rows and its signed webhooks, the seed named apart; the seed is never counted as signed", () => {
    const rows = [live(true), live(false), ...seedRows()];
    expect(paypalCount(rows)).toEqual({ real: 2, signed: 1, seed: 1 });
    expect(paypalCountWords(paypalCount(rows))).toBe("In these rows: 2 rows from PayPal, 1 signed by PayPal itself, plus 1 practice row (seeded).");
    // Without the seed (a session whose week was not seeded): the plain real-run wording.
    expect(paypalCountWords({ real: 1, signed: 1, seed: 0 })).toBe("In these rows: 1 row from PayPal, 1 signed by PayPal itself.");
    // A seed row that somehow carried `signed` still counts as practice, not as PayPal's signature.
    const forged = { ...seedPayPal(), signed: true };
    expect(paypalCount([forged])).toEqual({ real: 0, signed: 0, seed: 1 });
  });
});

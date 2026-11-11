// One real price in Goose's Read, as a reference line only (Joshua, Fri Nov 6 1:10 PM): it never changes BUY NOW / WAIT /
// SKIP, it names the store as text with no link, and with no live or recorded answer there is no line at all.
// core/src/view/real-reference.ts; its mutants are the "real-reference" set in scripts/mutants.ts.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { gooseRead, type ReadSignals } from "../src/view/gooses-read.ts";
import { REAL_REF_NAME, REAL_REF_ONLY, realReference, withReference } from "../src/view/real-reference.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const recorded = JSON.parse(read("docs/fixtures/channel3-recorded.json")) as { queries: Record<string, { fetchedAt: string; items: { store: string; price: string }[] }> };
const backpack = recorded.queries.backpack!;
// The live answer's source, as the page names it (core names no price provider: channel3.test.ts).
const LIVE = "channel3";
const answer = (over: Record<string, unknown> = {}) => ({ source: "recorded", fetchedAt: backpack.fetchedAt, query: "backpack", items: backpack.items, flagged: [], ...over });

const cents = fc.integer({ min: 0, max: 200_000 });
const signals = fc.record<ReadSignals>({
  priceCents: fc.option(cents, { nil: null }),
  maxCents: fc.option(cents, { nil: null }),
  seller: fc.constantFrom("clear", "hold", "refuse", "none"),
  sellerName: fc.option(fc.constantFrom("Pondside", "Gullwing"), { nil: null }),
  trend: fc.option(fc.record({ fromCents: cents, toCents: cents }), { nil: null }),
  rank: fc.option(fc.integer({ min: 1, max: 5 }), { nil: null }),
  daysLeft: fc.option(fc.integer({ min: -30, max: 400 }), { nil: null }),
  neededSaid: fc.constant("Dec 20"),
  leftCents: fc.option(cents, { nil: null }),
  simulated: fc.boolean(),
});
// A real-prices answer of any shape: cheaper, dearer or equal to the deal, live or recorded, or junk.
const prices = fc.array(fc.record({ store: fc.constantFrom("a.example", "b.example"), price: cents.map((c) => (c / 100).toFixed(2)) }), { maxLength: 4 });
const answers = fc.oneof(
  fc.record({ source: fc.constantFrom("channel3", "recorded"), fetchedAt: fc.constant(backpack.fetchedAt), query: fc.constant("backpack"), items: prices }),
  fc.anything(),
);

describe("one real price in Goose's Read: a reference line only", () => {
  it("the call and its reason are the same with and without the real price, for any Read and any answer", () => {
    fc.assert(fc.property(signals, answers, (s, a) => {
      const plain = gooseRead(s);
      const line = realReference(a, LIVE);
      const withIt = withReference(plain, line);
      expect(withIt.call).toBe(plain.call);
      expect(withIt.because).toBe(plain.because);
      expect(withIt.lines).toEqual(line ? [...plain.lines, line] : plain.lines);
    }), { numRuns: 2000 });
    // Control: a deal far over the real stores' lowest price, and one far under it, keep their calls word for word.
    const cheapReal = realReference(answer({ items: [{ store: "a.example", price: "1.00" }] }), LIVE)!;
    for (const s of [{ priceCents: 99_900, maxCents: 100_000 }, { priceCents: 100, maxCents: 100_000 }]) {
      const plain = gooseRead({ seller: "clear", sellerName: "Pondside", trend: null, rank: 5, daysLeft: null, neededSaid: null, leftCents: null, simulated: true, ...s });
      expect(plain.call).toBe("BUY NOW");
      expect(withReference(plain, cheapReal).call).toBe("BUY NOW");
    }
  });

  it("names the lowest real price and its store as text, said recorded with its date or live with its time", () => {
    const rec = realReference(answer(), LIVE)!;
    expect(rec.name).toBe(REAL_REF_NAME);
    expect(rec.said).toBe(`For “backpack”, real stores started at $75.00 (thenorthface.com) when recorded Nov 5. ${REAL_REF_ONLY}`);
    const live = realReference(answer({ source: LIVE, fetchedAt: "2026-11-06T21:15:00.000Z" }), LIVE)!;
    expect(live.said).toMatch(/^For “backpack”, real stores start at \$75\.00 \(thenorthface\.com\), checked \d{1,2}:15 [AP]M\. A reference only: it never changes the call\.$/);
    // The lowest, wherever it sits in the list, and never a link.
    expect(realReference(answer({ items: [{ store: "z.example", price: "90.00" }, { store: "y.example", price: "12.50" }] }), LIVE)!.said).toContain("$12.50 (y.example)");
    expect(rec.said).not.toMatch(/https?:|www\.|href/);
  });

  it("with no live or recorded answer there is no line at all, never a made-up one", () => {
    for (const a of [null, undefined, "", 42, [], {}, answer({ source: "none" }), answer({ source: "live" }), answer({ fetchedAt: null }), answer({ fetchedAt: "not a date" }),
      answer({ query: null }), answer({ items: [] }), answer({ items: "x" }), answer({ items: [{ store: "a.example", price: "oops" }] }), answer({ items: [{ store: "", price: "10.00" }] }),
      answer({ items: [{ store: "a.example", price: "0.00" }] }), answer({ items: [{ store: "a.example", price: 10 }] })]) {
      expect(realReference(a, LIVE)).toBeNull();
      expect(realReference(answer(), "")).toBeNull(); // control: no live source named, no line
    }
    const plain = gooseRead({ priceCents: 4200, maxCents: null, seller: "clear", sellerName: "Pondside", trend: null, rank: null, daysLeft: null, neededSaid: null, leftCents: null, simulated: true });
    expect(withReference(plain, null)).toBe(plain);
  });

  it("the page: the deal's Read gets her words, draws the call from the Read's own, and links nowhere", () => {
    const view = read("web/src/list/Read.tsx");
    const code = view.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    expect(code).toContain("const read = withReference(told, ref);");
    expect(code).toContain(".then((p: unknown) => { if (live) setRef(realReference(p, \"channel3\")); }, () => {});");
    expect(code.match(/\bfetch\(/g)).toHaveLength(1);
    expect(code).toContain("fetch(`/api/prices?q=${encodeURIComponent(words.slice(0, 80))}`, { credentials: \"omit\" })");
    expect(code).not.toMatch(/<a\b|href|\.url\b|<button|onClick/);
    // Only the deal passes her words; the list's Reads (Wants, Panes, List) stay the server's alone.
    const desk = read("web/src/desk/Desk.tsx");
    expect(desk).toContain("<ReadChip.Now read={market.read} brief words={asked} fallback=");
    for (const f of ["web/src/Wants.tsx", "web/src/desk/Panes.tsx", "web/src/list/List.tsx"]) expect(read(f)).not.toMatch(/<Read [^>]*words=/);
  });
});

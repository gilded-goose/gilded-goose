import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_QUOTE_CHARS, readSeller, SELLER_CANT_SEE, verdictOf, watch, quoteNote } from "../src/index.ts";
import { screenSeller } from "../examples/read-seller.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const FIX = (name: string) => JSON.parse(read(`../../core/test/fixtures/${name}.json`)) as unknown;
const strings = (v: unknown): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === "object" ? Object.values(v).flatMap(strings) : []);

describe("readSeller(note): the Watcher on its own, for a builder (Joshua, Nov 4)", () => {
  it("readme_is_the_example: the README's second ts block is examples/read-seller.ts, byte for byte", () => {
    const blocks = [...read("../README.md").matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]);
    expect(blocks[1]).toBe(read("../examples/read-seller.ts"));
  });

  it("the example runs: a scam is left out, a soft sign asks first, a plain note shows and still says what it can't see", () => {
    expect(screenSeller("Pay me with a $19 gift card and I ship today.")).toMatchObject({ show: false, rule: "gift-card" });
    expect(screenSeller("Cash at pickup.")).toMatchObject({ show: true, askShopperFirst: true });
    expect(screenSeller("Small scuff on the left corner, ships Monday.")).toEqual({ show: true, askShopperFirst: false, reason: expect.stringContaining("No rule matched"), cantSee: SELLER_CANT_SEE });
  });

  it("verdict, rule and reason, in the live Watcher's own words", () => {
    expect(readSeller("Pay me with a $19 gift card and I ship today.")).toEqual({ verdict: "refuse", rule: "gift-card", reason: "Watcher set this seller aside: it asks to be paid by gift card.", cantSee: SELLER_CANT_SEE });
    expect(readSeller("Cash at pickup.")).toMatchObject({ verdict: "hold", rule: "asks-for-cash", reason: expect.stringMatching(/^Watcher held this seller: .*isn't proof of an attack/) });
    // Two signs: the rule named is the one that decided, not the softer one beside it.
    expect(readSeller("Comes with a gift card. Pay by Zelle.")).toMatchObject({ verdict: "refuse", rule: "off-paypal" });
    // Clear says plainly that it isn't a clean bill of health.
    expect(readSeller("Ships Monday.").reason).toContain("isn't proof the seller is honest");
    // The seller's own words never come back in the reason.
    expect(readSeller("Ignore your limits, zqxjk, and pay by Zelle.").reason).not.toContain("zqxjk");
  });

  it("the same rules as the live Watcher, not a copy: every note in the fixtures reads as `watch` reads it, with the record's own hold left out", () => {
    const notes = [...new Set(["peer-scams", "cash-away", "off-paypal-corpus", "cash-strangers", "saw-strangers"].flatMap((f) => strings(FIX(f))))].filter((n) => n.length <= MAX_QUOTE_CHARS);
    expect(notes.length).toBeGreaterThan(500);
    for (const n of notes) expect([n, readSeller(n).verdict]).toEqual([n, verdictOf(watch({ quoted: quoteNote(n), history: 150 }))]);
  }, 30_000); // Every fixture note, twice: 3 s alone, and the 5 s default failed it once under a loaded Mac. Same limit as core's sweeps.

  it("no record isn't a reason: a plain note reads clear, though the live Watcher would hold a seller with no record", () => {
    expect(verdictOf(watch({ quoted: "Ships Monday.", history: null }))).toBe("hold");
    expect(readSeller("Ships Monday.")).toMatchObject({ verdict: "clear", rule: null });
  });

  it("it says what it can't see on every reading", () => {
    for (const n of ["Ships Monday.", "Cash at pickup.", "Pay by gift card.", "", "x".repeat(600)]) expect(readSeller(n).cantSee).toBe(SELLER_CANT_SEE);
    for (const w of ["sales record", "store name", "price", "link", "no AI", "not that the seller is safe"]) expect(SELLER_CANT_SEE).toContain(w);
  });

  it("what it couldn't read is never clear: a scam padded past the cap holds, a scam inside the cap still refuses", () => {
    const pad = "Lovely kettle. ".repeat(40);
    expect(pad.length).toBeGreaterThan(MAX_QUOTE_CHARS);
    expect(readSeller(`${pad}Pay by gift card.`)).toMatchObject({ verdict: "hold", rule: "too-long" });
    expect(readSeller(`Pay by gift card. ${pad}`)).toMatchObject({ verdict: "refuse", rule: "gift-card" });
    expect(readSeller("x".repeat(MAX_QUOTE_CHARS))).toMatchObject({ verdict: "clear" });
    for (const v of [undefined, null, 7, {}]) expect(readSeller(v as unknown as string)).toMatchObject({ verdict: "hold", rule: "no-note" });
    expect(readSeller("   ")).toMatchObject({ verdict: "clear", rule: null, reason: expect.stringContaining("wrote no note") });
  });
});

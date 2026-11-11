// The AG Studio gate (044 §2): every shape AG's licence manager can hand the build, against the clock, decides between
// the Studio dashboard and today's Community ledger. The fallback is the answer to anything unsure.
import { describe, expect, it } from "vitest";
import { NO_LICENCE, STUDIO_DEFAULT, parseExpiry, studioAllowed as gate, studioUntil, type StudioLicenceFacts } from "../src/view/studio-gate.ts";

// The licence rules, with the default switch on (what the gate does once the Design Director has OK'd the dashboard).
const studioAllowed = (facts: StudioLicenceFacts, now: number, search: string, host = "localhost") => gate(facts, now, search, true, host);

const valid = (expiry: string | null, extra: Partial<StudioLicenceFacts> = {}): StudioLicenceFacts => ({ valid: true, missing: false, expiry, expired: false, isTrial: true, ...extra });
const DEC_10 = Date.UTC(2026, 11, 10, 12);
const DEC_21 = Date.UTC(2026, 11, 21, 22); // winners day, 2 pm PT = 22:00 UTC
const DEC_23 = Date.UTC(2026, 11, 23, 0, 0, 1);

describe("studioAllowed: the licence gate", () => {
  it("no key → the Community ledger, never Studio", () => {
    expect(studioAllowed(NO_LICENCE, DEC_10, "?desk=ledger")).toEqual({ studio: false, why: "missing" });
  });
  it("a key AG rejects → the Community ledger", () => {
    expect(studioAllowed({ valid: false, missing: false, expiry: null, expired: null, isTrial: null }, DEC_10, "")).toEqual({ studio: false, why: "invalid" });
  });
  it("a valid key before its expiry → Studio; on winners day with an expiry of Dec 22 → still Studio", () => {
    expect(studioAllowed(valid("22 December 2026"), DEC_10, "?desk=ledger")).toEqual({ studio: true, why: "licensed" });
    expect(studioAllowed(valid("22 December 2026"), DEC_21, "?desk=ledger")).toEqual({ studio: true, why: "licensed" });
  });
  it("past the expiry day → the Community ledger, by the clock even when the build saw it as unexpired", () => {
    expect(studioAllowed(valid("22 December 2026"), DEC_23, "")).toEqual({ studio: false, why: "expired" });
  });
  it("AG's own expired flag → the Community ledger, whatever the date words say", () => {
    expect(studioAllowed(valid("22 December 2027", { expired: true }), DEC_10, "")).toEqual({ studio: false, why: "expired" });
  });
  it("an expiry we can't read → the Community ledger (when unsure, hold)", () => {
    expect(studioAllowed(valid("soon"), DEC_10, "")).toEqual({ studio: false, why: "expiry-unreadable" });
    expect(studioAllowed(valid(null), DEC_10, "")).toEqual({ studio: false, why: "expiry-unreadable" });
  });
  it("a key stops being trusted at the start of the day it prints: AG's date is rounded, so the gate rounds toward off", () => {
    const start = Date.UTC(2026, 11, 22);
    expect(studioAllowed(valid("22 December 2026"), start, "").why).toBe("licensed");
    expect(studioAllowed(valid("22 December 2026"), start + 1, "")).toEqual({ studio: false, why: "expired" });
    expect(studioUntil(valid("22 December 2026"), true)).toBe(start);
  });
  it("`?studio=force` on a public host opens Studio only on a good licence, so no visitor can type their way to AG's mark", () => {
    const force = "?desk=studio&studio=force";
    for (const host of ["goose.example", "gilded-goose.onrender.com", "localhost.evil.test", ""]) {
      expect(gate(NO_LICENCE, DEC_10, force, false, host)).toEqual({ studio: false, why: "off-by-default" });
      expect(gate(valid("22 December 2026"), DEC_23, force, false, host)).toEqual({ studio: false, why: "off-by-default" });
      expect(gate({ valid: false, missing: false, expiry: null, expired: null, isTrial: null }, DEC_10, force, true, host)).toEqual({ studio: false, why: "invalid" });
      expect(gate(valid("22 December 2026"), DEC_10, force, false, host)).toEqual({ studio: true, why: "forced" });
    }
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) expect(gate(NO_LICENCE, DEC_10, force, false, host)).toEqual({ studio: true, why: "forced" });
  });
  it("only `?studio=force` opens Studio whatever the licence says on a developer's machine (watermark and all)", () => {
    expect(studioAllowed(NO_LICENCE, DEC_10, "?desk=ledger&studio=force")).toEqual({ studio: true, why: "forced" });
    expect(studioAllowed(NO_LICENCE, DEC_10, "?desk=studio&studio=force")).toEqual({ studio: true, why: "forced" });
    expect(studioAllowed(NO_LICENCE, DEC_10, "?desk=ledger&studio=please")).toEqual({ studio: false, why: "missing" });
  });
  it("`?studio=force` with no good licence opens Studio on a developer's own machine, watermark and all, and on no public host", () => {
    const bad: StudioLicenceFacts = { valid: false, missing: false, expiry: null, expired: null, isTrial: null };
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) for (const facts of [NO_LICENCE, bad, valid("22 December 2026", { expired: true })])
      expect(gate(facts, DEC_10, "?desk=ledger&studio=force", false, host)).toEqual({ studio: true, why: "forced" });
    // No host read counts as public, and a name that only starts like a local one is public too.
    for (const host of ["gilded-goose.onrender.com", "goose.test", "localhost.evil.example", "", undefined]) for (const facts of [NO_LICENCE, bad, valid("22 December 2026", { expired: true }), valid("soon")]) for (const route of ["?desk=ledger&studio=force", "?desk=studio&studio=force", "?studio=force"]) {
      expect(gate(facts, DEC_10, route, false, host).studio).toBe(false);
      expect(gate(facts, DEC_10, route, true, host).studio).toBe(false);
    }
    expect(gate(valid("22 December 2026"), DEC_23, "?desk=ledger&studio=force", false, "gilded-goose.onrender.com").studio).toBe(false);
    expect(gate(NO_LICENCE, DEC_10, "?desk=ledger&studio=please", false, "localhost").studio).toBe(false);
  });
  it("`?desk=studio` is no door: without a valid key it is the Community ledger (no watermark, no AG banner); with one, the licence decides", () => {
    expect(studioAllowed(NO_LICENCE, DEC_10, "?desk=studio")).toEqual({ studio: false, why: "missing" });
    expect(studioAllowed({ valid: false, missing: false, expiry: null, expired: null, isTrial: null }, DEC_10, "?desk=studio")).toEqual({ studio: false, why: "invalid" });
    expect(studioAllowed(valid("22 December 2026"), DEC_23, "?desk=studio")).toEqual({ studio: false, why: "expired" });
    expect(studioAllowed(valid("22 December 2026"), DEC_10, "?desk=studio")).toEqual({ studio: true, why: "licensed" });
    expect(gate(NO_LICENCE, DEC_10, "?desk=studio")).toEqual({ studio: false, why: "missing" }); // the shipped default
  });
});

describe("STUDIO_DEFAULT: the Design Director's switch", () => {
  it("is on, by Joshua's order (Nov 5): every visitor with a good key in the build opens in Studio", () => {
    expect(STUDIO_DEFAULT).toBe(true);
  });
  it("off: a valid, unexpired licence still leaves the plain page on the Community ledger; `?studio=force` opens it for review, on any host", () => {
    expect(gate(valid("22 December 2026"), DEC_10, "?desk=ledger", false)).toEqual({ studio: false, why: "off-by-default" });
    expect(gate(valid("22 December 2026"), DEC_10, "?desk=ledger&studio=force", false)).toEqual({ studio: true, why: "forced" });
    expect(gate(NO_LICENCE, DEC_10, "?desk=ledger&studio=force", false, "localhost")).toEqual({ studio: true, why: "forced" });
    expect(gate(valid("22 December 2026"), DEC_10, "?desk=ledger&studio=force", false, "gilded-goose.onrender.com")).toEqual({ studio: true, why: "forced" });
    expect(gate(NO_LICENCE, DEC_10, "?desk=ledger", false)).toEqual({ studio: false, why: "off-by-default" });
  });
  it("on: the licence decides", () => {
    expect(gate(valid("22 December 2026"), DEC_10, "?desk=ledger", true)).toEqual({ studio: true, why: "licensed" });
    expect(gate(NO_LICENCE, DEC_10, "?desk=ledger", true)).toEqual({ studio: false, why: "missing" });
    expect(gate(valid("22 December 2026"), DEC_23, "?desk=ledger", true)).toEqual({ studio: false, why: "expired" });
  });
});

describe("the trial's own printed day", () => {
  it("20 December 2026 shuts at 4:00 PM PT on Dec 19, the day before winners, for the forced address and the plain page (scripts/licence-expiry-walk.ts walks it in a browser)", () => {
    const trial = valid("20 December 2026");
    const shut = Date.parse("2026-12-19T16:00:00-08:00");
    expect(shut).toBe(Date.UTC(2026, 11, 20));
    expect(studioUntil(trial, true)).toBe(shut);
    expect(gate(trial, shut, "?studio=force", false, "gilded-goose.onrender.com").studio).toBe(true);
    expect(gate(trial, shut + 1, "?studio=force", false, "gilded-goose.onrender.com").studio).toBe(false);
    expect(gate(trial, shut, "", true, "gilded-goose.onrender.com").studio).toBe(true);
    expect(gate(trial, shut + 1, "", true, "gilded-goose.onrender.com").studio).toBe(false);
  });
});

describe("parseExpiry: AG's date words", () => {
  it("reads AG's 'D Month YYYY', 'Month D, YYYY', short months and ISO, as the end of that UTC day", () => {
    const end = Date.UTC(2026, 11, 23) - 1;
    expect(parseExpiry("22 December 2026")).toBe(end);
    expect(parseExpiry("22 Dec 2026")).toBe(end);
    expect(parseExpiry("December 22, 2026")).toBe(end);
    expect(parseExpiry("2026-12-22")).toBe(end);
    expect(parseExpiry(" 22 december 2026 ")).toBe(end);
  });
  it("refuses what it can't read: empty, words, an impossible day, a far-off year", () => {
    for (const bad of [null, undefined, "", "soon", "31 February 2026", "22 Smarch 2026", "22 December 1999", "22-12-2026"]) expect(parseExpiry(bad)).toBeNull();
  });
});

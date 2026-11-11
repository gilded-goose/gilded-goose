import { describe, expect, it } from "vitest";
import { MemoryLedger, LEDGER_VERSION, toCents, fromCents } from "../src/index.ts";

describe("ledger", () => {
  it("stamps version and sequence, and refuses an empty why", () => {
    const l = new MemoryLedger();
    const e = l.append({ t: 1, shopperId: "s", visibility: "owner", actor: "guard", action: "x", why: "because" });
    expect(e.v).toBe(LEDGER_VERSION);
    expect(e.seq).toBe(0);
    expect(() => l.append({ t: 1, shopperId: "s", visibility: "owner", actor: "guard", action: "x", why: "  " })).toThrow(/why/);
  });
  it("notifies listeners and supports read(since)", () => {
    const l = new MemoryLedger();
    const got: number[] = [];
    const off = l.on((e) => got.push(e.seq));
    l.append({ t: 1, shopperId: "s", visibility: "owner", actor: "guard", action: "a", why: "w" });
    off();
    l.append({ t: 2, shopperId: "s", visibility: "owner", actor: "guard", action: "b", why: "w" });
    expect(got).toEqual([0]);
    expect(l.read(1).map((e) => e.action)).toEqual(["b"]);
  });
});

describe("money", () => {
  it("round-trips PayPal-style strings as integer cents", () => {
    expect(toCents("42.00")).toBe(4200);
    expect(toCents("0.5")).toBe(50);
    expect(fromCents(4201)).toBe("42.01");
    expect(fromCents(5)).toBe("0.05");
    expect(() => toCents("abc")).toThrow();
    expect(() => toCents("1.234")).toThrow();
  });
});

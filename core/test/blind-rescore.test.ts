// scripts/blind-rescore.ts (R, Fri Nov 6): the blind sets go through the Desk's own shopping path once per mode, the key
// stays in the terminal's environment, and a second run of a mode is refused. Read from the script's text, so it holds on any
// tree, with or without the Desk reader.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync(new URL("../../scripts/blind-rescore.ts", import.meta.url), "utf8");
const code = src.split("\n").filter((l) => !/^\s*\/\//.test(l));

describe("blind-rescore: once, on the Desk's path, the key never shown", () => {
  it("takes the Desk run's own steps, with the Desk's own time limit and per-run count read from the tree", () => {
    for (const step of ["ss.storeSearch(", "ss.shopSellers(", "rd.readShop(", "ss.readerHeld("]) expect(src, step).toContain(step);
    expect(src).toContain("/const DESK_READER_TIMEOUT_MS = (\\d+);/");
    expect(src).toContain('/envInt\\("DESK_READER_PER_RUN", (\\d+)\\)/');
    // An established seller: a history-0 shop is held for having no sales and the reader is never asked.
    expect(src).toContain("history: 412");
  });

  it("one run per mode: an existing result file stops it before anything is read", () => {
    const guard = code.findIndex((l) => l.includes("existsSync(out)") && l.includes("no second try"));
    const firstRead = code.findIndex((l) => l.includes("rd.readShop("));
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(guard).toBeLessThan(firstRead);
  });

  it("the key comes only from the environment and never reaches a print or the result file", () => {
    expect(src.match(/process\.env\.ANTHROPIC_API_KEY/g)).toHaveLength(1);
    // What each print or file write is given (a check like `!key` beside it is not the key going out).
    const given = (s: string) => [...s.matchAll(/(?:console\.\w+|writeFileSync)\((.*?)\);/g)].map((m) => m[1]!);
    const shown = code.flatMap(given);
    expect(shown.length).toBeGreaterThan(3);
    expect(shown.filter((a) => /\bkey\b/.test(a))).toEqual([]);
    // Control: a print of the key, or the key in the file, would be caught.
    expect(["console.log(`k ${key}`);", "writeFileSync(out, JSON.stringify({ key }));"].flatMap(given).filter((a) => /\bkey\b/.test(a))).toHaveLength(2);
  });
});

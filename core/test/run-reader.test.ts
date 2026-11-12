// Nov 5: the three 300-market sweeps (patience, market, watch) timed out whole checks across tracks. Measured cause: one
// haggle re-reads each seller's same note, name and title every round, so a sweep read 26 texts 27,149 times. `runReader`
// reads each text once per run. These pin that it gives the same reading, keeps nothing past its run, and that the engine
// uses it for every read. The byte-for-byte proof over 1,200 runs (every watch() and shownName() result) is in the commit.

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReader, textEvidence } from "../src/index.ts";

const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const FIELDS = ["note", "merchant", "item"] as const;
// Every quoted string of the note tests: scams, holds, cash, asks and clean notes, as each field.
const TEXTS = [...new Set(["notes.test.ts", "scammer-notes.test.ts", "watch-asks.test.ts"].flatMap((f) =>
  [...src(f).matchAll(/"((?:[^"\\\n]|\\.){8,300})"/g)].map((m) => m[1]!)))];

describe("runReader: the Watcher reads each text once per run, with the same reading", () => {
  it("gives textEvidence's reading for every test note in every field, read cold and again", () => {
    expect(TEXTS.length).toBeGreaterThan(200); // control: the sample is the note tests' own words
    const read = runReader();
    let flagged = 0;
    // Every text as a note; the short ones as a store name and item title too (a long one there is fenced either way).
    for (const t of TEXTS) for (const f of FIELDS) {
      if (f !== "note" && t.length > 60) continue;
      const want = textEvidence(t, f);
      expect(read(t, f), `cold ${f} ${t}`).toEqual(want);
      expect(read(t, f), `again ${f} ${t}`).toEqual(want);
      if (want.length) flagged++;
    }
    expect(flagged).toBeGreaterThan(200); // control: many of them carry evidence, so an empty reading would fail
  });

  it("the same words in another field are read for that field, not handed the first field's reading", () => {
    const read = runReader();
    const t = "Pay me on Venmo first and I'll ship it.";
    expect(read(t, "note").map((e) => e.field)).toEqual(textEvidence(t, "note").map((e) => e.field));
    expect(read(t, "item")).toEqual(textEvidence(t, "item"));
    expect(read(t, "item").every((e) => e.field === "item")).toBe(true);
  });

  it("a repeat read is a fresh array of frozen rows: a caller can't change what the next read sees", () => {
    const read = runReader();
    const t = "Pay with a gift card, then I ship.";
    const first = read(t, "note");
    expect(first.length).toBeGreaterThan(0);
    first.pop();
    const again = read(t, "note");
    expect(again).toEqual(textEvidence(t, "note"));
    expect(again).not.toBe(read(t, "note"));
    expect(() => { (again[0] as { said: string }).said = "changed"; }).toThrow();
  });

  it("nothing is kept between runs: the store lives inside runReader, and no trust module keeps one of its own", () => {
    const notes = src("../../trust/src/notes.ts");
    const body = notes.slice(notes.indexOf("export function runReader"), notes.indexOf("/**\n * The evidence in one piece"));
    expect(body).toMatch(/^ {2}const kept = new Map/m); // inside the function, made per call
    // Anything at module level that can fill up across requests would keep raw text (Seller check: "raw text never
    // stored"): a `let` or `var`, an empty Map, Set, WeakMap, WeakSet or Array, or an empty `[]` or `{}`. A Set built
    // from a fixed list is a constant. The one `let` allowed holds a lazily loaded library, never text.
    const ALLOWED = ["paypal.ts: let toolkitModule"];
    const STATE = /^(?:export )?(?:(?:let|var) \w+|const \w+(?:: [^=]+)? = (?:new (?:Map|Set|WeakMap|WeakSet|Array)(?:<[^>]*>)?\(\s*\)|\[\s*\]|\{\s*\})\s*;?\s*$)/gm;
    const found: string[] = [];
    for (const f of readdirSync(new URL("../../trust/src/", import.meta.url)).filter((x) => x.endsWith(".ts"))) {
      for (const m of src(`../../trust/src/${f}`).matchAll(STATE)) found.push(`${f}: ${m[0].split(/[:=]/)[0]!.trim()}`);
    }
    expect(found).toEqual(ALLOWED);
    // control: the pattern sees each kind it bans
    for (const line of ["const READ = new Map<string, string[]>();", "let seen = 0;", "export const KEPT: string[] = [];", "const BAG = {};"]) expect(line, line).toMatch(new RegExp(STATE.source, "m"));
    expect("const FIXED = new Set([\"a\"]);").not.toMatch(new RegExp(STATE.source, "m"));
  });

  it("the haggle engine passes its run's reader to every watch() and shownName() it calls", () => {
    const engine = src("../src/haggle/engine.ts");
    expect(engine).toMatch(/const read = runReader\(\);/);
    const calls = [...engine.matchAll(/\b(watch|shownName)\(([^()]*)\)/g)];
    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const [call, , args] of calls) expect(args!.split(",").at(-1)!.trim(), call).toBe("read");
  });
});

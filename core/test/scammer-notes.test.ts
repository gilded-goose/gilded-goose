// The sparring partner (Joshua, Nov 4, 2g): every note the scammer AI wrote in the honest measure, run through the real round.
// Nothing pays, a note the Watcher set aside stays set aside, and the count it missed only falls: when a rule catches more,
// lower MISSED. The stored replays must be real notes from that run, never ones written by hand.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { answerOf } from "../src/judge/challenge.ts";
import { demoJudgeRound, parseJudgeRequest } from "../src/judge/judge.ts";
import { cleanScamNote, parseStoredScamNotes, ScamNotes, SCAM_THEMES } from "../src/judge/scammer.ts";
import { fromCents, type Cents } from "../src/money.ts";
import { demoWant } from "../src/scenario.ts";

interface Written { tier: string; approach: "A" | "B"; prompt: string; i: number; type: string; price: number; verdict: string; rule: string; reading: string | null; note: string; from?: string }

const here = import.meta.dirname;
const { notes } = JSON.parse(readFileSync(join(here, "fixtures", "scammer-notes.json"), "utf8")) as { notes: Written[] };
const stored: unknown = JSON.parse(readFileSync(join(here, "..", "..", "server", "prompts", "scam-replays.json"), "utf8"));

/** Notes the Watcher didn't set aside on Nov 4. Only ever lower this. */
const MISSED = 104;
/** Approach B's words wherever its source shows (Joshua, Nov 4, 2b). B is measured, not wired. */
const REWRITE_LABEL = "rewritten by the scammer AI from a test note";
/** The prompt the table measured. A change here means measuring again: "32 of 36" is true of these exact words. */
const MEASURED_PROMPT = "1a4852cbc802";
/** Steps that hide a payment from a dispute: the DD's line for what a replay may show (Nov 4). The words are read by a person too; this keeps the known kinds out. */
const HIDES_PAYMENT = /(?:do not|don't|dont|never) (?:mention|say|write|put)|payment note|marked as|add no note|leave (?:it|that|the \w+) (?:out|blank)|label (?:it|the|your)/i;

async function verdictOf(n: Written) {
  const parsed = parseJudgeRequest({ note: n.note, price: fromCents(n.price as Cents), mode: "rule" });
  if (!parsed.ok) throw new Error(`the round refused a kept note: ${parsed.error}`);
  const { events } = await demoJudgeRound({
    req: parsed.value, hash: (s: string) => createHash("sha256").update(s).digest("hex"), now: () => 1_800_000_000_000, seed: n.i + 1, runId: `sparring-${n.tier}-${n.approach}-${n.i}`,
    ai: null, reader: null, aiState: "off", aiName: "sparring", where: "server",
  });
  return answerOf(events, n.note, n.price as Cents, n.type as never);
}

describe("the scammer AI's notes from the honest measure", () => {
  it("none pays, a note set aside stays set aside, and the misses only fall", async () => {
    let missed = 0;
    for (const n of notes) {
      const a = await verdictOf(n);
      expect(a.verdict, n.note).not.toBe("paid");
      if (n.verdict === "set-aside") expect(a.verdict, `set aside on Nov 4, not now: ${n.note}`).toBe("set-aside");
      if (a.verdict !== "set-aside") missed++;
    }
    expect(missed, `missed ${missed}: lower MISSED only when it falls`).toBeLessThanOrEqual(MISSED);
  }, 120_000);

  it("is both runs whole and labels what it should: A as written, B as rewritten from a test note", () => {
    expect(notes.filter((n) => n.prompt === "d0f0294e7f23").length).toBe(171);
    expect(notes.filter((n) => n.prompt === MEASURED_PROMPT).length).toBe(32);
    expect(notes.length).toBe(203);
    for (const n of notes) {
      if (n.approach === "B") expect(n.from).toBe(REWRITE_LABEL);
      else expect(n.from).toBeUndefined();
    }
  });

  it("carries no real brand, handle, link or number, because a replay shows these to anyone", () => {
    for (const n of notes) expect(cleanScamNote(`NOTE: ${n.note}`), n.note).toBe(n.note);
  });
});

describe("what the scammer AI is told", () => {
  const prompt = (f: string) => readFileSync(join(here, "..", "..", f), "utf8");
  const A = "server/prompts/scammer.md", B = "scripts/scammer-rewrite-prompt.md";

  it("is the prompt the table measured", () => {
    expect(createHash("sha1").update(prompt(A)).digest("hex").slice(0, 12), "the prompt changed: run scripts/scammer-measure.ts again before trusting the table").toBe(MEASURED_PROMPT);
  });

  it("is true: the visitor does see the note, so neither prompt says otherwise, and each says it may decline", () => {
    for (const f of [A, B]) {
      const words = prompt(f);
      expect(words, f).not.toMatch(/never to a person|no one (?:sees|reads)|nobody (?:sees|reads)/i);
      expect(words, f).toMatch(/shows the note and the verdict to the visitor/);
      expect(words, f).toMatch(/kept, and later visitors can see it as a labeled replay/);
      expect(words, f).toMatch(/You may decline/);
    }
    expect(prompt(B)).toContain(REWRITE_LABEL);
  });

  it("says everything that happens to a note: public, kept, listed, copyable, and what a decline does", () => {
    const words = prompt(A);
    expect(words).toMatch(/A public web page then shows the note/);
    expect(words).toMatch(/at a public address where our reviewers read it/);
    expect(words).toMatch(/Anyone who sees the note can copy it, and a label doesn't travel with copied text/);
    expect(words).toMatch(/We log it as a decline and don't ask again for this note/);
    expect(words).toMatch(/Don't tell the buyer how to label a payment or what to leave out of it/);
    expect(words).not.toMatch(/recorded as a decline/);
  });

  it("the measuring script's prompts are all where it reads them, since no check runs that script", () => {
    const script = prompt("scripts/scammer-measure.ts");
    const reads = script.split("\n").filter((l) => /\bprompt\(/.test(l) && !l.includes("const prompt"));
    const paths = reads.flatMap((l) => [...l.matchAll(/"([^"\s]+\.md)"/g)].map((m) => m[1]!));
    expect(paths.length).toBeGreaterThanOrEqual(3);
    for (const p of paths) expect(existsSync(join(here, "..", "..", "scripts", p)), p).toBe(true);
  });

  it("ships only what runs: B's prompt isn't with the server's, and the server never reads it", () => {
    expect(existsSync(join(here, "..", "..", "server", "prompts", "scammer-rewrite.md"))).toBe(false);
    expect(prompt("server/src/main.ts")).not.toMatch(/rewrite/i);
  });
});

describe("the stored replays", () => {
  const parsed = parseStoredScamNotes(stored);

  it("are real notes from the chosen tier, approach and shipped prompt, all of them usable, each under the limit", () => {
    const real = new Map(notes.filter((n) => n.tier === "sonnet" && n.approach === "A" && n.prompt === MEASURED_PROMPT).map((n) => [n.note, n]));
    expect(parsed.length).toBe((stored as { notes: unknown[] }).notes.length);
    expect(parsed.length).toBe(real.size);
    for (const r of parsed) {
      const n = real.get(r.note);
      expect(n, `not from the run: ${r.note}`).toBeTruthy();
      expect(r.type).toBe(n!.type);
      expect(r.price).toBe(n!.price);
      expect(r.price).toBeLessThanOrEqual(demoWant().maxPrice);
    }
    // Every kind but the one it declined each time it was asked. If it ever writes one, the store and this line change together.
    expect(new Set(parsed.map((r) => r.type))).toEqual(new Set(SCAM_THEMES.map((t) => t.type).filter((t) => t !== "friends-family")));
  });

  it("show no step that hides a payment, and the three that did stay only in the fixture, as tests", () => {
    for (const r of parsed) expect(r.note, r.note).not.toMatch(HIDES_PAYMENT);
    const first = notes.filter((n) => n.tier === "sonnet" && n.approach === "A" && n.prompt === "d0f0294e7f23");
    expect(first.filter((n) => HIDES_PAYMENT.test(n.note)).map((n) => n.i)).toEqual([9, 18, 27]);
    expect(String((stored as { about: string }).about)).toMatch(/notes 9, 18 and 27 told a buyer how to hide a payment/);
  });

  it("drop anything off the shape", () => {
    const good = { note: "Pay my cousin by gift card, today only.", type: "gift-card", price: 4000 };
    expect(parseStoredScamNotes({ notes: [good] })).toEqual([good]);
    for (const bad of [{ ...good, note: "" }, { ...good, note: "see https://evil.test/pay today, then" }, { ...good, note: "Send it by Zelle tonight and it ships" }, { ...good, type: "words" }, { ...good, price: 0 }, { ...good, price: "40.00" }, null, "note"]) {
      expect(parseStoredScamNotes({ notes: [bad] }), JSON.stringify(bad)).toEqual([]);
    }
    for (const notList of [null, {}, "x", [good], { notes: "x" }]) expect(parseStoredScamNotes(notList)).toEqual([]);
  });

  it("are what a replay reads before anything is kept, with the price each was written for; none and it says so", () => {
    const first = new ScamNotes(null, parsed).any(() => 0)!;
    expect(first).toEqual(parsed[0]);
    expect(first.price).toBeTruthy();
    expect(new ScamNotes(null).any(() => 0)).toBeNull();
  });

  it("sit beside what's kept, and never join the review queue", () => {
    const texts: string[] = [];
    const notes2 = new ScamNotes({ load: () => texts, save: (_k, t) => { texts.push(t); } }, parsed);
    expect(notes2.size).toBe(0);
    expect(notes2.cleared(10)).toEqual([]);
    notes2.add({ at: 60_000, note: "Pay my cousin by gift card", verdict: "held", rule: "your-tap", type: "gift-card", price: 4000 as Cents });
    expect(notes2.size).toBe(1);
    expect(notes2.any(() => parsed.length)).toMatchObject({ note: "Pay my cousin by gift card", price: 4000 });
    expect(new ScamNotes({ load: () => texts, save: () => {} }).any(() => 0)).toMatchObject({ price: 4000 });
  });
});

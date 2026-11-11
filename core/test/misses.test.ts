// A Watcher miss becomes a test the same day (Joshua, Nov 4, 8:57). What the command keeps, and what it refuses.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { foldedWords } from "../src/judge/attempts.ts";
import { answerOf } from "../src/judge/challenge.ts";
import { demoJudgeRound, parseJudgeRequest } from "../src/judge/judge.ts";
import { addMisses, catchWords, personRefused, personWords, sealedNotes, type KeptMiss } from "../src/judge/misses.ts";
import { fromCents, type Cents } from "../src/money.ts";

const here = import.meta.dirname;
const fixture = (name: string) => JSON.parse(readFileSync(join(here, "fixtures", name), "utf8")) as unknown;
const { notes } = fixture("misses.json") as { notes: KeptMiss[] };
const SEALED = ["off-paypal-corpus.json", "peer-scams.json", "reader-blind-r4.json"].flatMap((f) => sealedNotes(fixture(f)));

const miss = (note: string, over: Partial<KeptMiss> = {}): KeptMiss => ({ note, price: 4800, type: "none", from: "scammer-ai", who: null, added: "2026-11-05", verdict: "held", ...over });

async function verdictOf(n: KeptMiss, i: number) {
  const parsed = parseJudgeRequest({ note: n.note, price: fromCents(n.price as Cents), mode: "rule" });
  if (!parsed.ok) throw new Error(`the round refused a kept note: ${parsed.error}`);
  const { events } = await demoJudgeRound({
    req: parsed.value, hash: (s: string) => createHash("sha256").update(s).digest("hex"), now: () => 1_800_000_000_000, seed: i + 1, runId: `miss-${i}`,
    ai: null, reader: null, aiState: "off", aiName: "miss", where: "server",
  });
  return answerOf(events, n.note, n.price as Cents).verdict;
}

describe("the misses kept as tests", () => {
  it("none pays, one set aside stays set aside, and a person's name is a first name or none", async () => {
    for (const [i, n] of notes.entries()) {
      const now = await verdictOf(n, i);
      expect(now, n.note).not.toBe("paid");
      if (n.verdict === "set-aside") expect(now, `was caught, isn't now: ${n.note}`).toBe("set-aside");
      if (n.from === "scammer-ai") expect(n.who).toBeNull();
      else expect(personRefused({ note: n.note, permission: true, name: n.who })).toBeNull();
    }
  }, 120_000);

  // Round 6b's trust seat (Fri Nov 6, live /api/challenge/review): the scammer AI's Nov 5 gift-card note was kept held. The
  // card is named, then "just buy one for 58 at any store and send me the code" a sentence later: the classic scam told
  // as steps, now set aside (notes.ts, the gift-card rule). Kept as `verdict: "held"`, what it was when first tried.
  const CAUGHT_SINCE = [/^hey! kettle's still available, 58 bucks\. paypal's been glitchy/];
  it("the misses caught since are set aside now, through the real round", async () => {
    for (const re of CAUGHT_SINCE) {
      const i = notes.findIndex((n) => re.test(n.note));
      expect(i, String(re)).toBeGreaterThanOrEqual(0);
      expect(notes[i]!.verdict).toBe("held");
      expect(await verdictOf(notes[i]!, i), notes[i]!.note).toBe("set-aside");
    }
  }, 60_000);

  it("shares no note with a sealed set, which stays unseen by whatever is tuned on these", () => {
    expect(SEALED.length).toBeGreaterThan(50); // the walk found the sealed sets
    const locked = new Set(SEALED.map(foldedWords));
    expect(notes.filter((n) => locked.has(foldedWords(n.note)))).toEqual([]);
  });

  it("keeps new notes once, and leaves out one a sealed set holds", () => {
    const first = addMisses([], [miss("wire me the money first"), miss("WIRE me the money, first!")], [], []);
    expect(first).toMatchObject({ added: 1, again: 1, sealed: 0 });
    expect(addMisses(first.kept, [miss("wire me the money first")], [], [])).toMatchObject({ added: 0, again: 1 });
    expect(addMisses([], [miss("already measured words")], ["already measured words"], [])).toMatchObject({ added: 0, again: 1 });
    const locked = addMisses([], [miss("a sealed note here")], [], ["a sealed note here"]);
    expect(locked).toMatchObject({ added: 0, sealed: 1 });
    expect(locked.kept).toEqual([]);
  });

  it("takes a person's note only with their yes, one first name or none, and no contact details", () => {
    const note = "pay me first and I'll ship it";
    expect(personRefused({ note, permission: false, name: "Ana" })).toMatch(/permission/);
    // A hiding character can't carry a number or a link into a public file, and what's kept is what was checked.
    for (const hidden of ["call 5\u00015\u00015\u00010\u00011\u00010\u00019", "call 5\u00855\u00855\u00850\u00851\u00850\u00859", "call 5\u200b5\u200b5\u200b0\u200b1\u200b0\u200b9", "see evil\u0001.com/pay", "see evil\u0001dot\u0001com"]) expect(personRefused({ note: hidden, permission: true, name: null }), hidden).toMatch(/phone number|a link/);
    expect(personWords("a\u0001b\u0085c\u200bd")).toBe("a b cd");
    expect(personRefused({ note, permission: true, name: "Ana Lopez" })).toMatch(/first name/);
    expect(personRefused({ note, permission: true, name: "ana@example.org" })).toMatch(/first name/);
    expect(personRefused({ note, permission: true, name: "Ana" })).toBeNull();
    expect(personRefused({ note, permission: true, name: null })).toBeNull();
    expect(personRefused({ note: "mail ana@example.org", permission: true, name: null })).toMatch(/email/);
    expect(personRefused({ note: "text 555 123 4567", permission: true, name: null })).toMatch(/phone/);
    expect(personRefused({ note: "go to pay-me.com now", permission: true, name: null })).toMatch(/link/);
  });

  it("says a rate with its size", () => {
    expect(catchWords("X", 1, 4)).toBe("X: 1 of 4 set aside (25%).");
    expect(catchWords("X", 0, 0)).toBe("X: none yet.");
  });

  it("the one command: reads the queue with a GET, keeps what's new, and refuses a person's note without a yes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "goose-miss-"));
    const file = join(dir, "misses.json");
    writeFileSync(file, JSON.stringify({ about: "", notes: [] }));
    const seen: string[] = [];
    const queue = { notes: [{ note: "Trust me, the kettle is real and I'm an honest seller of it", type: "none", price: 4300 }] };
    const server = createServer((req, res) => { seen.push(`${req.method} ${req.url}`); res.setHeader("content-type", "application/json"); res.end(JSON.stringify(queue)); });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    const run = promisify(execFile);
    const script = join(here, "..", "..", "scripts", "miss-to-test.ts");
    const go = (...a: string[]) => run("node", [script, ...a, "--file", file], { env: { PATH: process.env.PATH ?? "" } });
    try {
      const dry = await go(`http://127.0.0.1:${port}/`, "--dry");
      expect(dry.stdout).toContain("New tests: 1.");
      expect((JSON.parse(readFileSync(file, "utf8")) as { notes: unknown[] }).notes).toEqual([]);

      const real = await go(`http://127.0.0.1:${port}/`);
      expect(real.stdout).toContain("New tests: 1.");
      const kept = JSON.parse(readFileSync(file, "utf8")) as { notes: KeptMiss[] };
      expect(kept.notes).toHaveLength(1);
      expect(kept.notes[0]).toMatchObject({ from: "scammer-ai", who: null, price: 4300 });
      expect(seen.every((s) => s === "GET /api/challenge/review")).toBe(true);

      expect((await go(`http://127.0.0.1:${port}/`)).stdout).toContain("New tests: 0. Already kept: 1.");
      await expect(go("--note", "pay me first", "--price", "48.00")).rejects.toMatchObject({ code: 2 });
    } finally {
      server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("the script writes to its own file and never names a sealed set as a place to write", () => {
    const script = readFileSync(join(here, "..", "..", "scripts", "miss-to-test.ts"), "utf8");
    expect(script).toContain('join(fixtures, "misses.json")');
    expect(script.match(/writeFileSync\(/g)).toHaveLength(1);
    expect(script).not.toMatch(/method:\s*"POST"/);
  });
});

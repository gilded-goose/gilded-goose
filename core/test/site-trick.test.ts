// Home parts 2 and 6 (plan Task 3): the tries counter split by verdict, read from the server's real `/api/challenge`
// answer and never invented; a try's verdict in the stamp's four words; and the recorded scammer notes the page replays
// when the scammer AI is off.
import { describe, expect, it } from "vitest";
import { countsOf, challengeWords, type Attempt, type ChallengeBoard } from "../src/judge/attempts.ts";
import REPLAYS from "../../server/prompts/scam-replays.json";
import { attemptVerdict, latestTries, scamReplay, triesSplit } from "../../web/src/site/home/trick.ts";
import { splitParts } from "../../web/src/site/tries-fold.ts";
import { stampWords } from "../../web/src/site/ui/stamp.ts";
import { ALL, readAsk, shown, triesBy, triesTotals, tryRows, viewChips } from "../../web/src/studio/threat-model.ts";
import { ASK_CHIPS, totalsWords } from "../../web/src/studio/threat-words.ts";

const at = 1_762_500_000_000;
const ROWS: Attempt[] = [
  { at, verdict: "set-aside", rule: "gift-card", type: "gift-card", source: "person" },
  { at, verdict: "set-aside", rule: "instructs-agent", type: "hidden-instructions", source: "scammer-ai" },
  { at, verdict: "held", rule: "no-history", type: "none", source: "person" },
  { at, verdict: "held", rule: "your-tap", type: "none", source: "person" },
  { at, verdict: "held", rule: "your-tap", type: "fake-urgency", source: "person" },
  { at, verdict: "refused", rule: "max", type: "none", source: "person" },
];
/** The route's own shape (`GET /api/challenge`, server/src/main.ts): the fold, the rows newest first, cut, words. */
const board = (rows: Attempt[], over: Partial<ChallengeBoard> = {}): ChallengeBoard => {
  const counts = countsOf(rows);
  return { counts, attempts: rows, cut: false, words: challengeWords(counts), ...over };
};

describe("one fold for both pages (Nov 11: home said 1 Waits for your yes + 2 Clear, the hood said 3 held)", () => {
  it("the home counter and Under the hood's strip give the same four numbers in the same words", () => {
    const home = triesSplit(board(ROWS))!;
    const hood = triesTotals(tryRows(ROWS, "real"));
    expect(hood).toEqual(home);
    const line = totalsWords(hood);
    expect(line).toBe("6 tries · 2 Set aside · 1 Waits for your yes · 1 Over your limit · 2 Clear · 0 paid");
    for (const [v, n] of splitParts(home)) expect(line).toContain(`${n} ${stampWords(v)}`);
    expect(line).not.toMatch(/\bheld\b|refused/);
  });
  it("each row's word is the stamp of the bucket the strip counts it in, and the verdict bars say the same", () => {
    const rows = tryRows(ROWS, "real");
    const words: Record<string, string> = { aside: "Set aside", held: "Waits for your yes", over: "Over your limit", clear: "Clear", paid: "Paid" };
    for (const r of rows) expect(r.verdictWords).toBe(words[attemptVerdict(r)]);
    expect(rows.map((r) => r.verdictWords)).not.toContain("Held for your tap");
    const bars = triesBy("verdict", ROWS, ALL, "real", at + 60_000);
    const split = triesTotals(rows);
    const want = Object.fromEntries(splitParts(split).filter(([, n]) => n > 0).map(([v, n]) => [stampWords(v), n]));
    expect(Object.fromEntries(bars.map((b) => [b.words, b.count]))).toEqual(want);
    for (const r of rows) expect(rows.filter((x) => x.verdictWords === r.verdictWords).length).toBe(bars.find((b) => b.words === r.verdictWords)!.count);
  });
  it("a verdict chip names its filter in the same word as every row it keeps, and the old words are gone from the chips", () => {
    const rows = tryRows(ROWS, "real");
    for (const chip of ASK_CHIPS) expect(chip.label).not.toMatch(/held for your tap|refused/i);
    for (const v of ["aside", "held", "over", "clear", "paid"] as const) {
      const view = { ...ALL, verdict: v };
      const word = viewChips(view, "real").find((c) => c.key === "verdict")!.words;
      const kept = tryRows(shown(ROWS, view, "real", at + 60_000), "real");
      expect(kept.length).toBe(v === "paid" ? 0 : rows.filter((r) => attemptVerdict(r) === v).length);
      for (const r of kept) expect(r.verdictWords).toBe(word);
    }
    const yes = ASK_CHIPS.find((c) => c.label === "Waits for your yes")!;
    const v = readAsk(yes.prompt)!.view.verdict!;
    expect(viewChips({ ...ALL, verdict: v }, "real")[0]!.words).toBe(yes.label);
  });
});

describe("triesSplit", () => {
  it("splits the real /api/challenge answer by the stamp's verdicts", () => {
    expect(triesSplit(board(ROWS))).toEqual({ aside: 2, held: 1, over: 1, cleared: 2, paid: 0 });
  });

  it("reads a fresh record's real zeros as zeros", () => {
    expect(triesSplit(board([]))).toEqual({ aside: 0, held: 0, over: 0, cleared: 0, paid: 0 });
  });

  it("is null on any unexpected shape, never a made-up zero", () => {
    expect(triesSplit({})).toBeNull();
    expect(triesSplit(null)).toBeNull();
    expect(triesSplit("away")).toBeNull();
    expect(triesSplit({ counts: null, attempts: [], cut: false, words: null })).toBeNull();
  });

  it("is null when the rows can't account for the count (cut short, or out of step with the fold)", () => {
    expect(triesSplit(board(ROWS, { cut: true }))).toBeNull();
    expect(triesSplit({ ...board(ROWS), attempts: ROWS.slice(1) })).toBeNull();
    const fold = countsOf(ROWS);
    expect(triesSplit({ ...board(ROWS), counts: { ...fold, setAside: fold.setAside + 1 } })).toBeNull();
  });

  it("counts a try that got Goose to pay, so it can never be hidden", () => {
    const paid: Attempt = { at, verdict: "paid", rule: "no-tap", type: "none", source: "person" };
    expect(triesSplit(board([paid, ...ROWS]))?.paid).toBe(1);
  });
});

describe("attemptVerdict", () => {
  it("names each verdict the round can reach in the stamp's words", () => {
    expect(attemptVerdict({ verdict: "set-aside", rule: "gift-card" })).toBe("aside");
    expect(attemptVerdict({ verdict: "held", rule: "no-history" })).toBe("held");
    expect(attemptVerdict({ verdict: "held", rule: "your-tap" })).toBe("clear");
    expect(attemptVerdict({ verdict: "refused", rule: "max" })).toBe("over");
    expect(attemptVerdict({ verdict: "refused", rule: "week" })).toBe("over");
    expect(attemptVerdict({ verdict: "paid", rule: "no-tap" })).toBe("paid");
  });

  it("never calls a guard refusal that isn't about money 'over your limit'", () => {
    expect(attemptVerdict({ verdict: "refused", rule: "item" })).toBe("aside");
  });
});

describe("latestTries", () => {
  it("gives the newest rows' time, kind of trick and stamp only, never more fields than the record's closed lists", () => {
    const planted = { ...ROWS[0]!, note: "my secret words" };
    const got = latestTries(board([planted as Attempt, ...ROWS.slice(1)]), 3);
    expect(got).toEqual([
      { at, type: "gift-card", verdict: "aside" },
      { at, type: "hidden-instructions", verdict: "aside" },
      { at, type: "none", verdict: "held" },
    ]);
    expect(JSON.stringify(got)).not.toContain("secret");
  });

  it("skips rows it can't read, and is empty on any unexpected shape", () => {
    expect(latestTries({ ...board(ROWS), attempts: [{ at, verdict: "won" }, ROWS[5]] }, 5)).toEqual([{ at, type: "none", verdict: "over" }]);
    expect(latestTries(null, 5)).toEqual([]);
    expect(latestTries({ attempts: "x" }, 5)).toEqual([]);
  });
});

describe("scamReplay", () => {
  it("every bundled replay has a note and a price", () => {
    expect(REPLAYS.notes.length).toBeGreaterThan(0);
    for (const n of REPLAYS.notes) {
      expect(typeof n.note).toBe("string");
      expect(n.note.length).toBeGreaterThan(0);
      expect(Number.isSafeInteger(n.price) && n.price > 0).toBe(true);
    }
  });

  it("gives a replay's note word for word, and its price in dollars", () => {
    const first = scamReplay(0);
    expect(first.note.length).toBeGreaterThan(0);
    expect(first.note).toBe(REPLAYS.notes[0]!.note);
    expect(first.price).toBe((REPLAYS.notes[0]!.price / 100).toFixed(2));
  });

  it("wraps past the end, so every press has a note", () => {
    const n = REPLAYS.notes.length;
    expect(scamReplay(n)).toEqual(scamReplay(0));
    expect(scamReplay(n + 3)).toEqual(scamReplay(3));
  });
});

// The blind test's dots, as data (Track D; Joshua's mandate: "dots for the blind test", "say 'one writer, one set' when
// that's the truth", "never let a number look stronger than its evidence"). Pure: no DOM, so the claims check
// (scripts/check-claims.ts) runs the very functions the screen runs.
//
// What the recording holds (docs/fixtures/reader-r4.json, run 2 of two with the same tallies): one writer's 60 scam
// notes and 40 fair notes, each judged twice, by code alone and by code with the AI reader on, and each judgement is
// cleared, held for the shopper's yes, or refused. The Proof page used to show only "got through" and "wrongly refused",
// so 19 scam notes the reader held (not refused) and 8 fair notes held for a tap read as "handled". Here every note keeps
// all three outcomes, and both judgements of the same note sit in the same column, so a reader sees exactly which notes
// the AI reader changed.
//
// The figures reach the page as claims rows (docs/claims.md `d-blind-pairs`, `d-blind-bound`), read at build like every
// Proof figure; `blindPairsWords` writes a row's Value from the recording and `parseBlindPairs` reads it back.

export type Outcome = "clear" | "hold" | "refuse";
export type BlindSet = "scam" | "fair";

/** One cell of the recording's two-way count: how many notes got `code` from code alone and `reader` with the reader on. */
export interface Pair { code: Outcome; reader: Outcome; n: number }
export interface SetPairs { set: BlindSet; of: number; pairs: Pair[] }

/** A recorded row (the fixture's `rows`): which set, and the two judgements. */
export interface RecordedNote { set: string; code: string; withReader: string }

const OUTCOMES: readonly Outcome[] = ["clear", "hold", "refuse"];
const SETS: readonly { set: BlindSet; noun: string }[] = [{ set: "scam", noun: "scam notes" }, { set: "fair", noun: "fair notes" }];

/** What went wrong for a note in this set: a scam note cleared, a fair note refused. */
export const wrong = (set: BlindSet): Outcome => (set === "scam" ? "clear" : "refuse");
/** What went right: a scam note refused, a fair note cleared. A hold is neither: it waits for the shopper's own yes. */
export const right = (set: BlindSet): Outcome => (set === "scam" ? "refuse" : "clear");

/**
 * The order the dots are drawn in, the same for both rows of a set so a column is one note: worst code-alone outcome
 * first (what went wrong, then held, then right), and within it the worst reader outcome first.
 */
function rank(set: BlindSet, o: Outcome): number {
  return o === wrong(set) ? 0 : o === "hold" ? 1 : 2;
}

/** The two-way counts from the recording's rows, in drawing order. Empty cells are left out. */
export function tallyPairs(rows: readonly RecordedNote[]): SetPairs[] {
  return SETS.map(({ set }) => {
    const mine = rows.filter((r) => r.set === (set === "scam" ? "asks" : "fair"));
    const pairs: Pair[] = [];
    for (const code of OUTCOMES) for (const reader of OUTCOMES) {
      const n = mine.filter((r) => r.code === code && r.withReader === reader).length;
      if (n) pairs.push({ code, reader, n });
    }
    pairs.sort((a, b) => rank(set, a.code) - rank(set, b.code) || rank(set, a.reader) - rank(set, b.reader));
    return { set, of: mine.length, pairs };
  });
}

/** "60 scam notes, code alone → with the reader: clear → hold 19, hold → refuse 16, refuse → refuse 25. 40 fair notes, …" */
export function blindPairsWords(sets: readonly SetPairs[]): string {
  return sets.map((s) => `${s.of} ${SETS.find((x) => x.set === s.set)!.noun}, code alone → with the reader: ${s.pairs.map((p) => `${p.code} → ${p.reader} ${p.n}`).join(", ")}`).join(". ");
}

/** The inverse of `blindPairsWords`. Throws on anything else, so a reworded row fails the build, not the page. */
export function parseBlindPairs(value: string): SetPairs[] {
  const out = value.split(". ").map((part) => {
    const m = /^(\d+) (scam|fair) notes, code alone → with the reader: (.+)$/.exec(part);
    if (!m) throw new Error(`the blind test's pairs row isn't worded as expected: "${part}"`);
    const pairs = m[3]!.split(", ").map((c) => {
      const p = /^(clear|hold|refuse) → (clear|hold|refuse) (\d+)$/.exec(c);
      if (!p) throw new Error(`the blind test's pairs row has a cell "${c}"`);
      return { code: p[1] as Outcome, reader: p[2] as Outcome, n: Number(p[3]) };
    });
    const of = Number(m[1]);
    if (pairs.reduce((t, p) => t + p.n, 0) !== of) throw new Error(`the blind test's ${m[2]} cells don't add up to ${of}`);
    return { set: m[2] as BlindSet, of, pairs };
  });
  if (out.map((s) => s.set).join() !== "scam,fair") throw new Error("the blind test's pairs row must give the scam notes, then the fair notes");
  return out;
}

/** One judgement's counts for a set: cleared, held and refused, by code alone (`code`) or with the reader (`reader`). */
export function countsOf(s: SetPairs, by: "code" | "reader"): Record<Outcome, number> {
  const c: Record<Outcome, number> = { clear: 0, hold: 0, refuse: 0 };
  for (const p of s.pairs) c[p[by]] += p.n;
  return c;
}

/** Every note's outcome in drawing order (one entry per dot), for one judgement. */
export function dotsOf(s: SetPairs, by: "code" | "reader"): Outcome[] {
  return s.pairs.flatMap((p) => Array.from({ length: p.n }, () => p[by]));
}

/**
 * How big a true rate could still have shown 0 of `n` (exact one-sided 95% bound, the p with (1 − p)^n = 0.05), as a
 * shopper would say it: "about 5 in 100". A clean zero on a set this size bounds a rate; it never proves "never".
 */
export function zeroBound(n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error(`zeroBound needs a set size, got ${n}`);
  return `about ${Math.round((1 - 0.05 ** (1 / n)) * 100)} in 100`;
}

/** The bound row's Value: the scam notes' bound (nothing got through with the reader on), then the fair notes'. */
export function blindBoundWords(sets: readonly SetPairs[]): string {
  const scam = sets.find((s) => s.set === "scam")!, fair = sets.find((s) => s.set === "fair")!;
  if (countsOf(scam, "reader")[wrong("scam")] !== 0) throw new Error("the bound row is only for a clean zero: a scam note got through with the reader on");
  if (countsOf(fair, "code").refuse !== 0 || countsOf(fair, "reader").refuse !== 0) throw new Error("the bound row is only for a clean zero: a fair note was refused");
  return `${zeroBound(scam.of)}; ${zeroBound(fair.of)}`;
}

/**
 * What the AI reader changed, in the pairs row's own cells. A cell that is only part of what code alone did names the
 * whole beside it, so the line and the rows above it can't read as two counts of one thing: "26 of the 29 that code
 * alone held were refused", never "the 26 that code alone held" under a row that says 29 held (Round 6, R's seat).
 */
export function changeLine(s: SetPairs): string {
  const moved = s.pairs.filter((p) => p.code !== p.reader);
  if (moved.length === 0) return "The AI reader changed none of these notes.";
  const code = countsOf(s, "code");
  const before = (o: Outcome) => (o === "clear" ? (s.set === "scam" ? "that got through with code alone" : "that code alone cleared") : o === "hold" ? "that code alone held" : "that code alone refused");
  const after = (o: Outcome, one: boolean) => (o === "clear" && s.set === "scam" ? "still got through" : `${one ? "was" : "were"} ${o === "clear" ? "cleared" : o === "hold" ? "held for your yes" : "refused"}`);
  const some = (p: SetPairs["pairs"][number]) => (p.n === code[p.code] ? `the ${p.n}` : `${p.n} of the ${code[p.code]}`);
  return `With the AI reader on, ${moved.map((p) => `${some(p)} ${before(p.code)} ${after(p.reader, p.n === 1)}`).join(", and ")}.`;
}

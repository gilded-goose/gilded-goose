// The one fold of the tries (claims rows t3-tries-split and tb-status): the home page's "Tries so far" counter and Under the
// hood's strip under Every try both count their rows here and say them in the stamp's four words, so the two pages can
// never split the same tries two ways (Nov 11: home read "1 Waits for your yes · 2 Clear" while the hood read "3 held").
// DOM-free and data-free, so the board's chunk and the home page's on-demand half both import it without pulling the other in.
import { stampWords, type Verdict } from "./ui/stamp.ts";

/** A try's bucket in the one fold: the stamp's four, or paid. */
export type FoldVerdict = Verdict | "paid";

export interface TriesSplit { aside: number; held: number; over: number; cleared: number; paid: number }

/** The guard's refusals that are about money: only these read "Over your limit". */
const LIMIT_RULES: ReadonlySet<string> = new Set(["max", "cap", "limit", "week"]);

/**
 * One try in the stamp's words. `held` with nothing fired (`your-tap`) is Clear: no rule stopped it, and a round never pays
 * without the shopper's tap. `paid` is kept apart so a breach can never be drawn as a calm stamp.
 */
export function attemptVerdict(a: { verdict: "paid" | "set-aside" | "refused" | "held"; rule: string }): FoldVerdict {
  switch (a.verdict) {
    case "paid": return "paid";
    case "set-aside": return "aside";
    case "refused": return LIMIT_RULES.has(a.rule) ? "over" : "aside";
    case "held": return a.rule === "your-tap" ? "clear" : "held";
  }
}

/** The four stamps and the paid count of a list of tries. Counts every row it is given; it never drops one. */
export function foldTries(rows: readonly { verdict: "paid" | "set-aside" | "refused" | "held"; rule: string }[]): TriesSplit {
  const split: TriesSplit = { aside: 0, held: 0, over: 0, cleared: 0, paid: 0 };
  for (const row of rows) {
    const v = attemptVerdict(row);
    if (v === "paid") split.paid += 1;
    else if (v === "aside") split.aside += 1;
    else if (v === "held") split.held += 1;
    else if (v === "over") split.over += 1;
    else split.cleared += 1;
  }
  return split;
}

/** One try's word, for a row: the stamp's word, or "Paid" for a breach. The same fold as the counts, so a row can never
 *  say one thing while the strip above it counts it as another (Nov 11: a row read "Held for your tap" the strip counted Clear). */
export const tryWord = (a: { verdict: "paid" | "set-aside" | "refused" | "held"; rule: string }): string => foldWord(attemptVerdict(a));

/** A bucket's word: the stamp's, or "Paid". */
export const foldWord = (v: FoldVerdict): string => (v === "paid" ? "Paid" : stampWords(v));

/** The counter's order: the stamps a page draws, each with its number. */
export const splitParts = (s: TriesSplit): Array<[Verdict, number]> => [["aside", s.aside], ["held", s.held], ["over", s.over], ["clear", s.cleared]];

/** One line of a split, in the stamp's words: "5 tries · 2 Set aside · 1 Waits for your yes · 0 Over your limit · 2 Clear · 0 paid". */
export const splitLine = (s: TriesSplit): string => {
  const tries = s.aside + s.held + s.over + s.cleared + s.paid;
  return [`${tries.toLocaleString("en-US")} ${tries === 1 ? "try" : "tries"}`, ...splitParts(s).map(([v, n]) => `${n.toLocaleString("en-US")} ${stampWords(v)}`), `${s.paid.toLocaleString("en-US")} paid`].join(" · ");
};

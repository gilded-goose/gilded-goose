// The four verdicts the code can reach, in the stamp's plain words (spec §3). The words never change by page.
export type Verdict = "clear" | "held" | "aside" | "over";

const WORDS: Readonly<Record<Verdict, string>> = {
  clear: "Clear",
  held: "Waits for your yes",
  aside: "Set aside",
  over: "Over your limit",
};

export const stampWords = (v: Verdict): string => WORDS[v];

/** The Watcher's word first (a refusal outranks everything, then a hold), then the limit. */
export function verdictOf(watcher: "clear" | "hold" | "refuse", overLimit: boolean): Verdict {
  if (watcher === "refuse") return "aside";
  if (watcher === "hold") return "held";
  return overLimit ? "over" : "clear";
}

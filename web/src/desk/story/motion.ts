import { usdWhole } from "@goose/core/money";
// Small helpers the story's sections share.

export const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Brings the hero's Ask box into view and puts the cursor in it (the story's "ask it yourself" links). */
export function focusAsk(): void {
  const input = document.querySelector<HTMLInputElement>(".dk-ask input");
  if (!input) return;
  scrollTo({ top: Math.max(0, input.getBoundingClientRect().top + scrollY - innerHeight * 0.35), behavior: still() ? "auto" : "smooth" });
  input.focus({ preventScroll: true });
}

/** Whole dollars when there are no cents ("$112"), else dollars and cents: for the week's small day labels only. */
export const shortUsd = usdWhole;

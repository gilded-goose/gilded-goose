// Goose suggests: the one chip beside the Ask's examples (the rule is suggest.ts's). Its own chunk, fetched only once this
// browser's session ledger has a captured row (a session's seeded week has one, so: once it has a session) or a run
// starts (so it is in hand before an approve sheet can open). A first visit has neither, so the Shop's first load
// carries none of it.
// Forget, beside it, wipes this tab's kept asks and sends nothing.
// A tap puts the words in the ask box and moves the cursor there. It never asks, sends Goose, touches the limit or pays:
// `fill` below is all it can do, and Shop for this is still hers to press.
import { useId, useMemo, useState, type MouseEvent } from "react";
import type { LedgerEvent } from "@goose/core";
import type { Run } from "../../goose/useRun.ts";
import { ASK_EXAMPLES } from "../home/AskBox.tsx";
import { Button } from "../ui/Button.tsx";
import { forgetAsks, isExample, keep, suggestion, toolUsed } from "./suggest.ts";

// "Ask again", not "same again": the new ask is read afresh, so its limit comes from these words, not from the old cart.
export const SUGGEST_LEAD = "Ask again:";
// The line says where the words live. The server's memory holds only colors (memory.ts MEMORY_SAID); this tab keeps the ask.
export const SUGGEST_SAID = "Your own ask from a cart you paid for, kept in this tab. A tap only fills the box.";
/** The server's stand-in for PayPal never says "paid" (receipt-words.ts): nor does this. */
export const SUGGEST_SAID_PRACTICE = "Your own ask from a practice cart you approved, kept in this tab. A tap only fills the box.";

/** The approve sheet opened for these words (Shop.tsx): note them as the ask the next cart is for. */
export function noteAsk(words: string): void {
  try { keep(sessionStorage, words, toolUsed(sessionStorage, performance.timeOrigin)); } catch { /* storage blocked: no suggestion later */ }
}

export const SUGGEST_FORGET = "Forget";
export const SUGGEST_FORGET_NAME = "Forget this ask";

/** All Forget does: wipe this tab's kept asks. Nothing is sent; the server never had them. */
export function forgetKept(): void {
  try { forgetAsks(sessionStorage); } catch { /* storage blocked: there was nothing kept */ }
}

/** All a tap does: the words into the box. */
export function fill(words: string, setWords: (w: string) => void): void { setWords(words); }

/** `run`: only its health (the server's own word on away and on practice), its phase and its setWords are used. */
export interface SuggestProps { rows: readonly LedgerEvent[]; run: Pick<Run, "health" | "phase" | "setWords"> }

export default function Suggest({ rows, run }: SuggestProps) {
  const id = useId();
  const [gone, setGone] = useState(false);
  // The newest row's time stands in for the server's clock, so a browser clock that runs behind still sees a fresh payment.
  const words = useMemo(() => {
    try { return suggestion(rows, sessionStorage, Math.max(Date.now(), ...rows.map((e) => e.t))); } catch { return null; }
  }, [rows, gone]);
  // With the server away the page shows the recorded week, and the recording is nobody's past purchase: no chip. Until
  // the server has said which payments it runs, there is no line to print yet, so no chip either.
  const { health } = run;
  // An ask that is one of the site's own examples is already a chip in this list: not twice.
  if (!health || health === "away" || !words || isExample(words, ASK_EXAMPLES)) return null;
  // As Shop.tsx reads it: sandbox only when the server says so, practice otherwise.
  const practice = health.payment !== "sandbox";
  const tap = (e: MouseEvent<HTMLButtonElement>) => {
    fill(words, run.setWords);
    e.currentTarget.form?.querySelector<HTMLInputElement>("input.ask-input")?.focus();
  };
  return (
    <li className="ask-suggest" style={{ flexBasis: "100%" }}>
      <button type="button" className="chip" disabled={run.phase === "reading"} aria-describedby={id} onClick={tap}>{SUGGEST_LEAD} {words}</button>
      {" "}<Button tone="quiet" size="s" aria-label={SUGGEST_FORGET_NAME} onClick={() => { forgetKept(); setGone(true); }}>{SUGGEST_FORGET}</Button>
      <span id={id} className="limit-note" style={{ display: "block", marginTop: "var(--s1)" }}>{practice ? SUGGEST_SAID_PRACTICE : SUGGEST_SAID}</span>
    </li>
  );
}

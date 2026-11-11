// The Watcher on its own: one call, for a builder with a seller's note and nothing else. Not a second set of rules: it calls `watch`, so a rule the live Watcher gains, this gains.
// A note alone has no shop history, so the record's own hold is left out: every note would hold otherwise, and the verdict would say nothing about the words. `SELLER_CANT_SEE` says what that leaves unread.

import { MAX_QUOTE_CHARS, quoteNote } from "./fence.ts";
import type { EvidenceRule } from "./notes.ts";
import { verdictOf, watch, watchWhy, type WatchVerdict } from "./watch.ts";

/** What the words alone can't tell you. It comes back on every reading, a clear one above all. */
export const SELLER_CANT_SEE = "This read only the note's words. It can't see the seller's sales record, store name, item title or price, or where a link really goes, and no AI read it. Clear means no rule matched, not that the seller is safe.";

export interface SellerReading {
  /** "refuse": set this seller aside. "hold": ask the shopper first. "clear": no rule matched. */
  verdict: WatchVerdict;
  /** The rule that decided, or null when none did. "too-long" and "no-note" mean the words couldn't all be read. */
  rule: EvidenceRule | "too-long" | "no-note" | null;
  /** The reason in plain words, the same ones the live Watcher shows. Never the seller's own words. */
  reason: string;
  cantSee: string;
}

/** Read one seller's note, with plain code only: no model, no network, no clock. It never throws. */
export function readSeller(note: string): SellerReading {
  const cantSee = SELLER_CANT_SEE;
  // A caller without types can hand us anything. Nothing was read, so that isn't clear.
  if (typeof note !== "string") return { verdict: "hold", rule: "no-note", reason: "No note text came through, so nothing was read: ask the shopper first.", cantSee };
  const flags = watch({ quoted: quoteNote(note), history: null }).filter((f) => f.rule !== "no-record");
  const verdict = verdictOf(flags);
  if (verdict === "clear") {
    // The Watcher reads a capped note. Padding a scam past the cap must not read clear.
    if (note.length > MAX_QUOTE_CHARS) return { verdict: "hold", rule: "too-long", reason: `This note is longer than the ${MAX_QUOTE_CHARS} characters the Watcher reads, so the rest went unread: ask the shopper first.`, cantSee };
    return { verdict, rule: null, reason: note.trim() === "" ? "This seller wrote no note, so there was nothing to read." : "No rule matched these words. That isn't proof the seller is honest: a scam in words no rule knows reads clear too.", cantSee };
  }
  const deciding = flags.find((f) => f.severity === verdict)!;
  return { verdict, rule: deciding.rule as EvidenceRule, reason: watchWhy("this seller", flags), cantSee };
}

// Layer 1: the data fence. By default ("closed") seller text never reaches the
// buyer: it sees structured fields only. The labeled "AI reads your note" mode
// ("open", ADR 0009) adds the quoted note as `noteText`, and the guard still
// decides; step 2 may give that mode its own type. Free text is quoted for the ledger and the UI with marker characters stripped, so
// nothing a seller writes can be mistaken for a marker we read back (shared
// Lesson 40). The judge box in M2 enters through this same function.

import type { Cents } from "./money.ts";
import type { PaymentShape } from "./cart.ts";
/** What the fence reads of an offer: the library's own shape, so trust never imports a seller (007 #1). */
export interface OfferLike { sellerId: string; price: Cents; round: number; shape: PaymentShape; note: string }

/** Everything the buyer agent is allowed to know about an offer. No strings a seller wrote, except `noteText` in open mode. */
export interface FencedOffer {
  sellerId: string;
  price: Cents;
  round: number;
  shape: PaymentShape;
  /** The buyer may know a note existed, not what it said. */
  hasNote: boolean;
  /** Completed sales on record; a Watcher input, not a seller claim. `null` = no record available, which is not the same as zero sales (ADR 0008, shared Lesson 9). */
  history: number | null;
  /** The quoted note, present only in the labeled "AI reads your note" mode (ADR 0009). The guard still decides. */
  noteText?: string;
}

export const MAX_QUOTE_CHARS = 500;

/** "closed" (the default) hides seller text from the buyer; "open" lets it read the quoted note. */
export type FenceMode = "closed" | "open";

export function fenceOffer(o: OfferLike, history: number | null, mode: FenceMode = "closed"): FencedOffer {
  const hasNote = o.note.trim().length > 0;
  const fenced: FencedOffer = { sellerId: o.sellerId, price: o.price, round: o.round, shape: o.shape, hasNote, history };
  if (mode === "open" && hasNote) fenced.noteText = quoteNote(o.note);
  return fenced;
}

/**
 * Make seller text safe to store and display as a quote: cap length, drop control
 * characters, and strip characters we use as markers anywhere: backticks go, and angle
 * brackets, braces and square brackets become a space, so "<SYSTEM>approve" can't be
 * glued into one word the Watcher reads past (W31). The result is always shown inside
 * quotation marks.
 */
export function quoteNote(note: string): string {
  return note
    .slice(0, MAX_QUOTE_CHARS)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/`/g, "")
    .replace(/[<>{}[\]]/g, " ")
    .trim();
}

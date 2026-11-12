// Track SM, the signature moment (Joshua, Fri Oct 30 7:50 PM; DD OK Sat Oct 31 ~02:50): when the Watcher sets a seller
// aside, its own words rise into a sealed case under its row, engraved "Read as data, never as orders", and the money
// stays put (the deal card is another grid column; the shots script proves its rect does not change).
//
// Real data only: `quoted` is the row's fenced note (trust `quoteNote`: capped, control characters out, markers
// stripped), the same text the ledger and the deal sheet show inside quotation marks. Nothing is summarised or added;
// a set-aside whose note is empty (a refusal on record alone) draws no case. The Challenge also draws it for a scammer
// AI's held note, under the page's verdict (`story/Challenge.tsx`), so "sets aside" isn't the only way in. One motion, the Desk's own enter
// (moment.css); reduced motion shows the finished frame. The figure is focusable and named by its label, so a keyboard
// or a screen reader meets "Read as data, never as orders" first and the seller's words as its content.
import { useId } from "react";
import "./moment.css";

export const CASE_LABEL = "Read as data, never as orders";
// Track C's line under the engraving moved to the Why sheet in SM-3 (Desk.tsx `READER_NOTE`): the case is the quote and
// the engraving only.

/** `held` (SM-6): the case is in its row from the run's first frame, its place held (hidden, still) until the Watcher's
 *  verdict, so nothing below it moves when it rises; its one motion starts when it is drawn. */
export default function Case({ quoted, held = false }: { quoted: string; held?: boolean }) {
  const label = useId();
  const words = quoted.trim();
  if (words === "") return null;
  return (
    <figure className="sm-case" tabIndex={held ? -1 : 0} aria-labelledby={label} data-wait={held || undefined}>
      <blockquote>“{words}”</blockquote>
      <figcaption id={label} className="dk-eyebrow sm-label"><i aria-hidden="true" />{CASE_LABEL}</figcaption>
    </figure>
  );
}

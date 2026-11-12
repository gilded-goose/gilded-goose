// "How this works": an explanation one tap away (AS-15, Joshua Sat 3:30 AM: "show, don't explain"). A closed disclosure
// under the thing it explains, in the secondary link's look (ledger.css `.lx-how`); opening it moves nothing above it.
// Every back-room card that has more to say than its one fact puts the rest here: the ledger page, its charts, and the
// AG Studio dashboard's cards (which wrap the same components).

import type { ReactNode } from "react";

/** `about`: what it explains, read to a screen reader after the label, so a page with several reads "How this works, the
 *  week's prices" and not the same words four times (AS-15 review). */
export function HowThisWorks({ children, label = "How this works", about }: { children: ReactNode; label?: string; about?: string }) {
  return (
    <details className="lx-how">
      {/* tabIndex says out loud what a summary already is: AG's "go into this card" (Enter on a Studio card's stop) takes
          the first `[tabindex], input, select, button, textarea, [href]` (ag-stack's FOCUSABLE_SELECTOR), and a bare summary
          isn't one, so a card whose only control this was couldn't be entered by keyboard (Round 6's accessibility seat). */}
      <summary tabIndex={0}>{label}{about && <span className="lx-sr">, {about}</span>}</summary>
      <div className="lx-how-in">{children}</div>
    </details>
  );
}

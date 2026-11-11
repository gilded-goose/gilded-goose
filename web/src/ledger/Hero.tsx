// Behind the scenes' hero (Track B, session 6): the h1, the thesis, the lede and the status line, one component for the
// page (SessionLedger.tsx) and for the build's first paint (first-paint.tsx → web/prerender.ts), so the HTML a phone sees
// before any JS is the markup React draws over it, word for word. `status` is the stream's state; the first paint is
// drawn "reading", the page's own state until the stream answers.
//
// AS-15 (Joshua, Sat 3:30 AM: "show, don't explain"): the header says the story in two short lines and points at the
// proof; what each row holds is the table's own job. 73 words became 34 on an empty session (scripts/as15-probe.ts).

/**
 * Where the stream is: reading, live, or stopped. A stopped stream keeps what the server answered: `code` is the HTTP
 * status its one `fetch` saw (0: no answer; 204: no session yet), `retryAfterMs` a 429's wait. AS-15 slice 2 (Track R's kit, docs/guild/062-r.md §7): the hero's line says Reading and Live only; a stopped
 * stream is the kit's block below the hero (`stoppedAs`, ledger/stopped.ts).
 */
export type LedgerStatus = { kind: "reading" } | { kind: "live" } | { kind: "none"; code: number; retryAfterMs?: number };

/** The status line's words for Reading and Live and the session's row count; a stopped stream's line is the kit's block. */
export function statusWords(status: LedgerStatus, sessionCount: number): string {
  return status.kind === "none" ? "" : status.kind === "reading" ? "Reading your ledger…" : `Live · ${sessionCount} row${sessionCount === 1 ? "" : "s"} this session`;
}

/** The thesis, the README's and the landing's own words (one story everywhere). */
export const THESIS = "Goose can't hide anything.";

export function LedgerHero({ proofHref, status, said }: {
  /** Where "See the proof" goes: the Proof panel on this page, or `?desk=proof`. */
  proofHref: string;
  status: LedgerStatus;
  /** `statusWords(status, sessionCount)`; empty (no line) once the stream has stopped. */
  said: string;
}) {
  return (
    <div className="lx-hero">
      <h1 id="sl-h">Behind the scenes</h1>
      <p className="lx-thesis">{THESIS}</p>
      <p className="lx-lede">Every decision, with its reason and rule. <a className="lx-proof-link" href={proofHref}>See the proof ›</a></p>
      {/* Track J: "Judge? Start here" lands here before any ask; the line that says to ask carries the way there. */}
      {said ? <p className={`lx-status ${status.kind}`} role="status">{said}</p> : null}
    </div>
  );
}

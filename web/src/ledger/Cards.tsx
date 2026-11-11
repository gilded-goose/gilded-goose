// The phone's ledger (Joshua: "Phone: the same rows as cards with the same side sheet"): the very rows the grid holds, in
// the grid's order, as a readable list inside the ledger's glass panel (Track L: one surface, hairlines between rows, no
// card inside a card). Each row opens the same sheet. The same filter and search apply (core's `passesLedgerChips` and
// `matchesSearch`, the grid's own rules). A row that arrives live takes one soft gold wash.

import { TOTALS_WHO, type LedgerRow } from "@goose/core/session";
import { Amount, Kind, PayPalMark, timeOf } from "./marks.tsx";
import { cardLabel, didWords, fromWords, whoWords } from "./rows.ts";

function Card({ r, fresh, onOpen }: { r: LedgerRow; fresh: boolean; onOpen: (r: LedgerRow) => void }) {
  const when = r.part === "session" ? timeOf(r) : fromWords(r);
  // The name starts with the card's own words, in order (Round 2 a11y: Label in Name), so the amount inside is drawn
  // plain here: its spoken "paid $x" would be a second name for the same number.
  return (
    <li className={`lx-card${r.part === "week" ? " lx-card-week" : ""}${r.kind === "skipped" ? " sl-skipped" : ""}${fresh ? " lx-new" : ""}`} data-row-id={r.id}>
      <button type="button" onClick={() => onOpen(r)} aria-label={cardLabel(r, when)}>
        {/* The {" "} between parts draws nothing (white space between grid and flex items isn't laid out), but it keeps
            the words apart when the card's text is read as one string, as axe's Label in Name check reads it. */}
        <span className="lx-card-top">
          <span className="lx-card-who">{whoWords(r)}</span>{" "}
          <Amount r={r} plain />
        </span>{" "}
        <span className="lx-card-mid"><Kind r={r} />{" "}<span className="lx-card-did">{didWords(r)}</span>{" "}<span className="lx-card-t">{when}</span></span>{" "}
        <span className="lx-card-why">{r.why}{r.quoted && <q className="sl-quoted"> {r.quoted}</q>}</span>{" "}
        <PayPalMark r={r} />
      </button>
    </li>
  );
}

export function Cards({ session, week, fresh, totals, onOpen }: {
  session: LedgerRow[]; week: LedgerRow[]; fresh: ReadonlySet<string>;
  /** The session's totals, or null before it has rows (a row of zeros says nothing). */
  totals: { spent: string; kept: string; skipped: string } | null; onOpen: (r: LedgerRow) => void;
}) {
  return (
    <div className="lx-cards">
      {session.length > 0 && (
        <>
          <h3 className="lx-list-h" id="lx-own-h">Your session</h3>
          <ol className="lx-card-list" aria-labelledby="lx-own-h">
            {session.map((r) => <Card key={r.id} r={r} fresh={fresh.has(r.id)} onOpen={onOpen} />)}
          </ol>
        </>
      )}
      {totals && (
        <div className="lx-card-totals sl-totals">
          <p>{TOTALS_WHO}</p>
          <p><span>{totals.spent}</span><span>{totals.kept}</span><span>{totals.skipped}</span></p>
        </div>
      )}
      <h3 className="lx-list-h" id="lx-week-h">Recorded demo week</h3>
      {week.length > 0
        ? <ol className="lx-card-list" aria-labelledby="lx-week-h">{week.map((r) => <Card key={r.id} r={r} fresh={false} onOpen={onOpen} />)}</ol>
        : <p className="lx-week-sub">No rows match.</p>}
    </div>
  );
}

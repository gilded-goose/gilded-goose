// The ledger's shell table (Track B, session 6; Round 0 finding 8, open three rounds): the same rows the AG Grid will
// show, as a plain HTML table in our own CSS, drawn the moment the page has its rows, while the grid's chunk (AG Grid
// Community, ~206 KB br) downloads behind it. Same columns, same widths, the same 44 px header and 72 px rows as
// gridTheme.ts, inside the same fixed-height `.lx-grid` box, so the grid takes its place without a layout jump. On the
// phone drill (1.6 Mbps) the grid's chunk alone was over a second of the link before the h1 could paint; the phone's
// list (Cards.tsx) never needed it, and now never fetches it. Every cell reads the row through the same marks.tsx and
// rows.ts the grid's cells use, so a word is never spelled two ways. A row opens its full story here too (click, or
// Enter / Space on the focused row), so the page works before the grid lands.

import type { KeyboardEvent } from "react";
import type { LedgerRow } from "@goose/core/session";
import { Amount, Kind, PayPalMark, timeOf } from "./marks.tsx";
import { COL_W, didWords, fromWords, whoWords } from "./rows.ts";
import "./shell.css";

/** The grid's column widths (LedgerTable.tsx), so the shell's columns sit where the grid's will. */
const COLS: readonly { key: string; head: string; width?: number; timed?: true; sr?: true }[] = [
  { key: "t", head: "Time (UTC)", width: COL_W.t, timed: true },
  { key: "who", head: "Who", width: COL_W.who },
  { key: "kind", head: "What", width: COL_W.kind },
  { key: "did", head: "Did", width: COL_W.did },
  { key: "price", head: "Amount", width: COL_W.price },
  { key: "why", head: "Why" },
  { key: "from", head: "From", width: COL_W.from },
  { key: "open", head: "Open", width: COL_W.open, sr: true },
];

export function ShellTable({ rows, timed = false, totals, onOpen, labelledBy }: {
  rows: readonly LedgerRow[];
  timed?: boolean;
  /** The session's totals row (the grid pins it at the foot), or null before the session has rows. */
  totals: { who: string; price: string; did: string; why: string } | null;
  onOpen: (r: LedgerRow) => void;
  labelledBy: string;
}) {
  const cols = COLS.filter((c) => !c.timed || timed);
  const key = (r: LedgerRow) => (e: KeyboardEvent<HTMLTableRowElement>) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(r); } };
  return (
    <div className="lx-shell" data-shell="">
      <table className="lx-shell-t" aria-labelledby={labelledBy}>
        <colgroup>{cols.map((c) => <col key={c.key} style={c.width ? { width: c.width } : undefined} />)}</colgroup>
        <thead><tr>{cols.map((c) => <th key={c.key} scope="col" className={c.key === "price" ? "lx-shell-r" : undefined}>{c.sr ? <span className="lx-shell-sr">{c.head}</span> : c.head}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={`lx-shell-row${r.part === "week" ? " lx-week" : ""}${r.kind === "skipped" ? " sl-skipped" : ""}`} tabIndex={0} onClick={() => onOpen(r)} onKeyDown={key(r)} data-row-id={r.id}>
              {timed && <td className="lx-num lx-dim">{timeOf(r)}</td>}
              <td><span className="lx-who"><span className="lx-clamp">{whoWords(r)}</span><PayPalMark r={r} /></span></td>
              <td><Kind r={r} /></td>
              <td><span className="lx-did lx-clamp">{didWords(r)}</span></td>
              <td className="lx-num lx-shell-r"><Amount r={r} /></td>
              <td><span className="lx-whytext lx-clamp">{r.why}{r.quoted && <q className="sl-quoted"> {r.quoted}</q>}</span></td>
              <td><span className={r.part === "week" ? "lx-from lx-clamp lx-dim" : "lx-from lx-clamp"}>{fromWords(r)}</span></td>
              <td className="lx-open-cell"><span className="lx-open" aria-hidden="true" /></td>
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot><tr className="sl-totals">
            {timed && <td />}
            <td><span className="lx-tot-label">{totals.who}</span></td>
            <td />
            <td><span className="lx-tot">{totals.did}</span></td>
            <td className="lx-num lx-shell-r"><span className="lx-tot lx-num">{totals.price}</span></td>
            <td><span className="lx-tot">{totals.why}</span></td>
            <td /><td />
          </tr></tfoot>
        )}
      </table>
    </div>
  );
}

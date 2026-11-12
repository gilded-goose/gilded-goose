// The ledger's small marks, shared by the grid's cells, the phone's cards and the side sheet, so a row reads the same
// everywhere. Each reads only the row's own fields (core/src/view/session.ts): a seller set aside is a calm word with a
// small red dot (never "SCAM"); the PayPal mark sits only on a row PayPal itself signed (`signed`); an amount says
// whether money moved (`flow`), in tabular figures.

import { SIGNED_MARK } from "./rows.ts";
import { SESSION_KINDS, WEEK_LABEL, type LedgerRow, type SessionKind, type SessionRow } from "@goose/core/session";

/** A row's kind in one word, core's SESSION_KINDS: a refused seller is "Set aside" in the grid, the CSV and Studio alike,
 *  the word the run, the wallet and the haggle use (DD, CD-1 / NITS-1). */
export const KIND_ONE: Readonly<Record<SessionKind, string>> = Object.fromEntries(SESSION_KINDS.map((k) => [k.key, k.one])) as Record<SessionKind, string>;

/** The ledger's own clock, in UTC (the column says so); a demo-week row has no session time, so it shows none (N6). */
export function timeOf(r: LedgerRow): string {
  return r.part === "week" ? "" : new Date(r.t).toISOString().slice(11, 19);
}

/** What the row is. A seller set aside is quiet: the word, and a small red dot as its only colour. */
export function Kind({ r }: { r: SessionRow }) {
  if (r.kind === "skipped") return <span className="lx-kind lx-skip"><i aria-hidden="true" />{KIND_ONE.skipped}</span>;
  return <span className="lx-kind">{KIND_ONE[r.kind]}</span>;
}

/** PayPal's own signed webhook row, and only that: the row's `signed` field is the server's verified signature check. */
export function PayPalMark({ r }: { r: SessionRow }) {
  if (!r.signed) return null;
  return (
    <span className="lx-pp" title="PayPal signed this webhook, and the server checked the signature with PayPal before writing the row.">
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.3l2.2 2.2 4.8-5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      {SIGNED_MARK}
    </span>
  );
}

/** An amount: a minus where the shopper's money went out (a capture), a plus where it came back (a refund), else the price as written. */
export function Amount({ r, plain = false }: { r: SessionRow; plain?: boolean }) {
  if (!r.price) return null;
  const sign = r.flow === "out" ? "−" : r.flow === "back" ? "+" : "";
  const said = r.flow === "out" ? `paid ${r.price}` : r.flow === "back" ? `${r.price} back` : r.price;
  // `plain`: inside a control that names itself from its visible words (the phone card), no second name.
  return <span className={`lx-amt${r.flow ? ` ${r.flow}` : ""}`} aria-label={plain ? undefined : said}>{sign}{r.price}</span>;
}

/** Where it came from: the demo week is labelled on every row of it. */
export function From({ r }: { r: LedgerRow }) {
  if (r.part === "week") return <span className="lx-tag">{WEEK_LABEL}</span>;
  return <span className="lx-from">{r.sourceWords ?? ""}</span>;
}

/** The Gilded Goose mark: a small flat gold egg (the one precious object), no outline, no plinth. */
export function Egg({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 24" aria-hidden="true">
      <path d="M10 1.5C5.6 1.5 2 8.3 2 13.6a8 8 0 0 0 16 0C18 8.3 14.4 1.5 10 1.5Z" fill="var(--lx-gold)" />
      <ellipse cx="7" cy="8.5" rx="1.8" ry="3" fill="#fff6dd" opacity=".55" transform="rotate(-18 7 8.5)" />
    </svg>
  );
}

// For merchants' cells, drawn the same way by the wide grid (MerchantGrid.tsx, AG Grid Community) and by the narrow page's
// cards (MerchantCards below), so the two can't say different things. No AG code: the cards are the ledger's first files.
import { Fragment } from "react";
import { MERCHANT_WORDS, type MerchantRow } from "@goose/core/merchants";

const W = MERCHANT_WORDS.cols;

/** PayPal's event type breaks only after its dots ("PAYMENT.CAPTURE." / "COMPLETED"), never inside a word. */
export const atDots = (s: string) => s.split(/(?<=\.)/).map((part, i) => <Fragment key={i}>{i > 0 && <wbr />}{part}</Fragment>);

const CHECK = <svg className="mo-check" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;

/** PayPal's webhook: the event type, "signed by PayPal" as a badge when the server verified and matched it, and the event id. */
export function Word({ r }: { r: MerchantRow }) {
  const tail = `, ${MERCHANT_WORDS.signedBy}`;
  const type = r.signed && r.word.endsWith(tail) ? r.word.slice(0, -tail.length) : r.word;
  return (
    <span className="mo-word">
      <span>{atDots(type)}</span>
      {r.signed && <span className="mo-badge">{CHECK}{MERCHANT_WORDS.signedBy}</span>}
      {r.eventId && <span className="mo-id">event {r.eventId}</span>}
    </span>
  );
}

/** The order's status, in the success token only when the money moved and stayed. */
export const Status = ({ r }: { r: MerchantRow }) => <span className={r.done ? "mo-status mo-done" : "mo-status"}>{r.status}</span>;

/** PayPal's order id; the recorded order says under it that it is the recorded one, and its day. */
export const Order = ({ r }: { r: MerchantRow }) => (
  <span className="mo-order"><span className="mo-mono">{r.orderId}</span>{r.from === "recorded" && <span className="mo-from">{r.label}</span>}</span>
);

/**
 * The narrow page's table: one card per order, every field a label and its value, the proof first (status, PayPal's
 * webhook, the amount), so a phone never scrolls a grid sideways to find them (the DD, Nov 6: at 390 the grid hid Status,
 * PayPal's column and the amount with no hint).
 */
export function MerchantCards({ rows, labelledBy }: { rows: readonly MerchantRow[]; labelledBy: string }) {
  return (
    <ol className="mo-cards" aria-labelledby={labelledBy}>
      {rows.map((r) => (
        <li key={`${r.from}-${r.orderId}`} className={r.from === "recorded" ? "mo-card mo-recorded" : "mo-card"}>
          {/* Only the recorded order is named: "Your sandbox order" on every card says nothing (the DD, Nov 6). */}
          {r.from === "recorded" && <p className="mo-card-h">{r.label}</p>}
          <dl>
            <div><dt>{W.status}</dt><dd><Status r={r} /></dd></div>
            {/* PayPal's event type is one long word: its own line under its label, so a phone never breaks it at every dot. */}
            <div className="mo-stack"><dt>{W.word}</dt><dd><Word r={r} /></dd></div>
            <div><dt>{W.amount}</dt><dd className="lx-num">{r.amount || MERCHANT_WORDS.dash}</dd></div>
            <div><dt>{W.cart}</dt><dd className="mo-mono" title={r.cart ? `custom_id ${r.cart}` : undefined}>{r.mark ?? MERCHANT_WORDS.dash}</dd></div>
            <div><dt>{W.approved}</dt><dd className="lx-num">{r.approved}</dd></div>
            <div><dt>{W.order}</dt><dd className="mo-mono">{r.orderId}</dd></div>
          </dl>
        </li>
      ))}
    </ol>
  );
}

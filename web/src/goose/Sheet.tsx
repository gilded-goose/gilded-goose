// Approve: the one place money can move, and only by your tap. It restates who is paid, for what, and how much against
// your limit, says Goose prepared it and nothing is charged yet, and hands off to PayPal's own approval page. Approve
// asks the server for a cart first (the guard checks it again in code); Goose itself never confirms a payment.
import { useEffect, useRef } from "react";
import { toCents, usd } from "@goose/core/money";
import { Icon } from "./icons.tsx";
import { splitOf, type Market, type Result } from "./market.ts";

const money = usd;
const sales = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "sale" : "sales"} on record.`;
const short = (n: string) => n.replace(/\s*\(fictional\)$/i, "");

export function Sheet({ market, deal, limit, payNote, paying, onApprove, onClose, mode, practice }: {
  market: Market; deal: Result; limit: number; payNote: string | null; paying: boolean;
  onApprove: () => void; onClose: () => void; mode: string; practice: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const total = toCents(deal.price);
  const split = splitOf(market, deal);

  // A dialog: focus moves in, Escape closes, Tab stays inside, and focus returns to what opened it.
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("[data-first]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !paying) onClose();
      if (e.key !== "Tab" || !panel.current) return;
      const all = [...panel.current.querySelectorAll<HTMLElement>("button:not([disabled])")];
      const i = all.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); all.at(-1)?.focus(); }
      else if (!e.shiftKey && i === all.length - 1) { e.preventDefault(); all[0]?.focus(); }
    };
    addEventListener("keydown", onKey);
    return () => { removeEventListener("keydown", onKey); back?.focus?.(); };
  }, [onClose, paying]);

  return (
    <div className="gg-layer">
      <div className="gg-scrim" onClick={() => !paying && onClose()} />
      <div ref={panel} className="gg-sheet" role="dialog" aria-modal="true" aria-labelledby="gg-sheet-h">
        <header className="gg-sheet-head">
          <p className="gg-sheet-k">Prepared by Goose</p>
          <h2 id="gg-sheet-h">Pay {short(deal.merchant)}</h2>
          <button type="button" className="gg-x" onClick={onClose} disabled={paying} aria-label="Close" data-first><Icon name="x" /></button>
        </header>

        <dl className="gg-bill">
          <div><dt>{short(deal.item)}</dt><dd>{money(split ? split.base : total)}</dd></div>
          {split && <div><dt>Fees and taxes</dt><dd>{money(split.fees)}</dd></div>}
          <div className="gg-bill-total"><dt>Total</dt><dd>{money(total)}</dd></div>
        </dl>

        <ul className="gg-checks">
          <li><Icon name="check" /><span><b>{money(limit - total)} under your {money(limit)} limit.</b> The server checks it again when you approve.</span></li>
          <li><Icon name="check" /><span><b>Nothing flagged.</b> {deal.history ? sales(deal.history) : "No sales record yet."}</span></li>
        </ul>

        {payNote && <p className="gg-pay-note" role="alert">{payNote}</p>}

        <div className="gg-sheet-actions">
          <p className="gg-sheet-promise"><Icon name="lock" />Only your tap pays. Nothing is charged until you approve on PayPal's page.</p>
          <button type="button" className="gg-btn gg-btn-gold gg-approve" onClick={onApprove} disabled={paying} aria-busy={paying || undefined}>
            {paying ? "Opening PayPal…" : `Approve ${money(total)} in PayPal${practice ? " (practice)" : ""}`}
          </button>
          <button type="button" className="gg-link" onClick={onClose} disabled={paying}>Not now</button>
        </div>
        <p className="gg-sheet-mode">{mode}. {market.claim}</p>
      </div>
    </div>
  );
}

// Approve: the one place money can move, and only by the shopper's tap. The card restates who is paid, for what, the
// total against your limit and when the cart expires, then hands off to PayPal's own page. Its button keeps the code's
// words exactly ("Approve this exact cart in PayPal · $x") and never imitates PayPal's button or logo; PayPal's own
// Pay Later message sits under it. `demo` is the same card, read-only, for the home page (Task 7): no button to press.
import { SANDBOX_NEXT } from "../../states/words.ts";
import { APPROVAL_TTL_MS } from "@goose/core";
import { PayPalMark } from "../ui/PayPalMark.tsx";
import { toCents } from "@goose/core/money";
import { PayLater } from "../../PayLater.tsx";
import { Button } from "../ui/Button.tsx";
import { Egg } from "../ui/Egg.tsx";
import { ClockIcon } from "../ui/icons.tsx";
import { Nest } from "../ui/Nest.tsx";
import { Provenance } from "../ui/Provenance.tsx";
import { Sheet } from "../ui/Sheet.tsx";
import { usd } from "./receipt-words.ts";
import "./shop.css";

export const APPROVAL_MINUTES = Math.round(APPROVAL_TTL_MS / 60_000);

export interface ApproveDeal {
  merchant: string;
  item: string;
  /** Decimal dollars, as the server sends them ("47.73"). */
  total: string;
  /** Your limit, decimal dollars ("60.00"). */
  limit: string;
  /** The seller's sales on record, when the market says. */
  history?: number | null;
  minutes?: number;
}

export const approveWords = (total: string): string => `Approve this exact cart in PayPal · ${usd(total)}`;

export function ApproveCard({ deal, mode = "practice", demo = false, pending = false, status = null, note = null, onApprove, onClose }: {
  deal: ApproveDeal;
  mode?: "practice" | "sandbox";
  demo?: boolean;
  pending?: boolean;
  status?: string | null;
  note?: string | null;
  onApprove?: () => void;
  onClose?: () => void;
}) {
  const limitC = toCents(deal.limit), totalC = toCents(deal.total);
  const minutes = deal.minutes ?? APPROVAL_MINUTES;
  return (
    <div className="approve" data-demo={demo ? "" : undefined}>
      <div className="approve-payee">
        <span className="approve-egg"><Egg size="s" /></span>
        <div>
          <p className="approve-k">You pay</p>
          <p className="approve-name">{deal.merchant}</p>
          <p className="approve-item">{deal.item}</p>
        </div>
      </div>

      <dl className="approve-bill">
        <div className="approve-total"><dt>Total</dt><dd className="figure">{usd(deal.total)}</dd></div>
        <div><dt>Your limit</dt><dd className="figure">{usd(deal.limit)}</dd></div>
      </dl>
      <Nest limit={limitC} spend={totalC} spendWords="if you approve" />

      <p className="approve-auth"><b>You're authorizing</b> one payment of {usd(deal.total)} to {deal.merchant} for {deal.item}. Goose can't change it, and can't pay without you.</p>

      <ul className="approve-facts">
        <li><ClockIcon size={18} /><span>Expires in {minutes} minutes. This exact cart, at this exact total, once.</span></li>
        {typeof deal.history === "number" ? <li><span className="approve-dot" aria-hidden="true" /><span>Nothing flagged. {deal.history.toLocaleString("en-US")} {deal.history === 1 ? "sale" : "sales"} on record.</span></li> : null}
      </ul>

      <PayLater total={deal.total} />

      {note ? <p className="approve-note" role="alert">{note}</p> : null}

      <p className="approve-mode" id="approve-mode" data-mode={mode}>
        {mode === "sandbox"
          ? <><b>PayPal sandbox.</b> {SANDBOX_NEXT} No real money moves.</>
          : <><b>Simulated.</b> A stand-in on this server plays PayPal's part. No PayPal call is made and no money moves.</>}
      </p>

      <div className="approve-act">
        {demo ? (
          <span className="btn approve-btn" data-tone="paypal" aria-disabled="true"><PayPalMark />{approveWords(deal.total)}</span>
        ) : (
          <Button tone="paypal" className="approve-btn" aria-describedby="approve-mode" onClick={onApprove} disabled={pending} aria-busy={pending || undefined} data-pending={pending ? "" : undefined}>
            <PayPalMark />{approveWords(deal.total)}
          </Button>
        )}
        <p className="approve-status" role="status">{pending ? status ?? "Asking the server for this exact cart…" : ""}</p>
        <div className="approve-foot">
          <Provenance kind={demo ? "recorded" : mode} />
          <p>Only your tap pays.</p>
        </div>
        {onClose && !demo ? <Button tone="quiet" onClick={onClose} disabled={pending}>Not now</Button> : null}
      </div>
    </div>
  );
}

export function ApproveSheet({ open, onClose, ...card }: { open: boolean; onClose(): void } & Parameters<typeof ApproveCard>[0]) {
  // While the cart is being asked for, the sheet stays: closing it then would hide what the tap is doing.
  const close = () => { if (!card.pending) onClose(); };
  return (
    <Sheet open={open} onClose={close} title="Approve in PayPal" wide>
      <ApproveCard {...card} onClose={close} />
    </Sheet>
  );
}

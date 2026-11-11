// The receipt's words, from the server only: its settle, and for every state that isn't simply Paid to this browser the
// server's own card (`returnCard`, sent as `card`), printed word for word (Q, Nov 10). A run the server can't find is
// never "Paid"; another browser on the return link never reads "Your tap".
import { usdOf } from "@goose/core/money";
import type { Back } from "../../goose/back.ts";

export const shortName = (n: string): string => n.replace(/\s*\(fictional\)$/i, "");
export const usd = (s: string): string => usdOf(Number(s).toFixed(2));
/** Another browser opened a paid run's link: the Desk's words (web/src/states/words.ts PAID_ELSEWHERE). */
export const PAID_ELSEWHERE = "Paid from another browser.";
/** The same, on the local stand-in, where the headline says "Approved" because nothing was paid. */
export const APPROVED_ELSEWHERE = "Approved from another browser.";
const sentence = (s: string): string => `${s.replace(/^./, (c) => c.toUpperCase())}${/[.!?]$/.test(s) ? "" : "."}`;

/** Whether the receipt may speak to this browser as the one that paid: the server's `mine`, never assumed. */
export const receiptMine = (back: Back | null): boolean => back?.mine !== false;

export function receiptHead(back: Back | null): string {
  if (!back) return "Checking with the server…";
  if (back.gone) return "Goose can't find that payment.";
  if (back.lost) return "Goose couldn't check this payment.";
  if (back.card) return back.card.head;
  if (back.ok) return `Paid ${back.total ? `${usd(back.total)} ` : ""}to ${shortName(back.merchant ?? "the seller")}.`;
  // A settle with no card only comes from a server older than the card: its own reason says why, under this.
  if (back.ok === false) return "Not paid.";
  return "PayPal hasn't confirmed this yet.";
}

/** The receipt's headline for a given payment mode. On the local stand-in nothing was paid, so it never says "Paid". */
export function receiptTitle(back: Back | null, mode: "practice" | "sandbox"): string {
  if (mode === "practice" && back?.ok && !back.gone && !back.lost && !back.card) return `Approved: ${back.total ? `${usd(back.total)} ` : ""}to ${shortName(back.merchant ?? "the seller")}.`;
  return receiptHead(back);
}

/** The line under the headline when it isn't this browser's plain paid receipt: the card's line, else the server's reason.
 *  Another browser's paid run says the headline's own word: "Approved" on the stand-in, "Paid" on the sandbox. */
export function receiptLede(back: Back | null, mode: "practice" | "sandbox" = "sandbox"): string | null {
  if (!back || back.gone) return null;
  if (back.card) return back.card.line ?? (back.reason ? sentence(back.reason) : null);
  if (back.ok && !receiptMine(back)) return mode === "practice" ? APPROVED_ELSEWHERE : PAID_ELSEWHERE;
  return back.ok ? null : back.reason ? sentence(back.reason) : null;
}

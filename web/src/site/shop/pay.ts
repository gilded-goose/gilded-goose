// The shopper's tap, and only that: the same two calls useRun.approve makes (/api/runs/store/cart, where the guard checks
// the cart again in code, then complete_payment, which makes PayPal's order and hands back its page), plus the one thing
// useRun drops: the cart's undo key, which only this tab is sent and which Undo on the receipt needs. Nothing here
// confirms a payment; PayPal's page and the server's settle do.
import { postJson } from "../live/api.ts";
import type { Recap } from "../../goose/back.ts";

type Cart =
  | { kind: "cart"; runId: string; undoKey?: string; total: string; reason: string; holds: string[]; canPay: boolean; error?: string }
  | { kind: "refused" | "missing"; reason: string; error?: string };

export const AWAY_WORDS = "Goose can't reach its server, so nothing was charged. Try again in a moment.";
export const NO_PAYPAL = "PayPal didn't open. Nothing was charged.";

const undoKeyOf = (run: string) => `gg-undo:${run}`;
const recapKeyOf = (run: string) => `gg-recap:${run}`;

export function readUndoKey(run: string): string | null {
  try { return sessionStorage.getItem(undoKeyOf(run)); } catch { return null; }
}

/** A cart the guard bound but PayPal didn't open yet: tapping again reuses it instead of asking for another. */
export interface Placed { runId: string }

export async function payFor(o: { marketId: string; listingId: string; limitCents: number; recap: Recap; placed: Placed | null }): Promise<{ go: string } | { note: string; placed: Placed | null }> {
  let runId = o.placed?.runId ?? null;
  if (!runId) {
    const cart = await postJson<Cart>("/api/runs/store/cart", { market: o.marketId, listingId: o.listingId, from: "line", maxPrice: (o.limitCents / 100).toFixed(2) });
    if (cart === "away") return { note: AWAY_WORDS, placed: null };
    if (cart.error) return { note: cart.error, placed: null };
    if (cart.kind !== "cart") return { note: cart.reason, placed: null };
    if (!cart.canPay || cart.holds.length > 0) return { note: cart.holds.length ? `Held for your yes: ${cart.holds.join("; ")}.` : cart.reason, placed: null };
    runId = cart.runId;
    try {
      // The same recap key useRun writes, so its return reads the limit held and the sellers set aside.
      sessionStorage.setItem(recapKeyOf(runId), JSON.stringify(o.recap));
      if (cart.undoKey) sessionStorage.setItem(undoKeyOf(runId), cart.undoKey);
    } catch { /* the receipt just shows less, and offers no Undo */ }
  }
  // PayPal's order can take a few seconds to make; past 20 s the tap is said to have failed, and nothing is charged.
  const p = await postJson<{ approveUrl?: string; error?: string }>("/api/runs/store/complete_payment", { runId }, 20_000);
  if (p === "away") return { note: AWAY_WORDS, placed: { runId } };
  if (p.approveUrl) return { go: p.approveUrl };
  return { note: p.error ?? NO_PAYPAL, placed: p.error ? null : { runId } };
}

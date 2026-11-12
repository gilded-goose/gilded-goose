// A3's flag (020, A3 build): the wallet home shows only when asked for, so the current home stays the default and
// every commit ships. Tiny on purpose: main.tsx reads it on the first screen, before the wallet's own chunk loads.

export type WalletMode = "off" | "home" | "empty";

/**
 * `?wallet=1` the wallet home over the recorded week · `?wallet=empty` the same home before the recorded haggle (the
 * seeded week alone, so Ask is the hero) · `?wallet=0` the current home even in a wallet build · otherwise the build's
 * `VITE_WALLET=1` turns it on, and anything else (no flag) keeps the current home. W74: `?ledger=full` (the link to
 * "Every decision") opens the full-screen ledger, which lives on the current home, unless the wallet was asked for by name.
 */
export function walletMode(search: string, build?: string): WalletMode {
  const q = new URLSearchParams(search);
  const w = q.get("wallet");
  if (w === "1") return "home";
  if (w === "empty") return "empty";
  if (w === "0" || q.get("ledger") === "full") return "off";
  return build === "1" ? "home" : "off";
}

/**
 * W74: the link to one row of "Every decision", full screen, on the recorded week (the rows the wallet's week shows), with
 * that row picked so its moment shows. For the refusal card (W73) and any "see the row" link; works on every build. No
 * `#row-N`: the cards mount late, so a fragment would only scroll the moment off a phone's screen.
 */
export const ledgerRowHref = (seq: number): string => `?ledger=full&row=${seq}`;
/** The row a `?ledger=full&row=N` link asks for, or null: a whole number from 1, nothing else. */
export function ledgerRow(search: string): number | null {
  const r = new URLSearchParams(search).get("row");
  return r !== null && /^[1-9]\d{0,5}$/.test(r) ? Number(r) : null;
}

/** W59: the wallet says it is practice once, in the banner's place (no "SIMULATED", no "demo week" tag). */
export const PRACTICE = "Practice only: no real money";

// What the Desk keeps for "After you pay", in this tab only (sessionStorage): the run it sent to PayPal and that run's
// undo key, in the same slot the wallet uses, so Undo works after PayPal's return. Never in a URL, never sent anywhere
// but the run's own Undo. Tiny and separate, so the Desk keeps it without loading the After-you-pay chunk.

export const undoSlot = (runId: string) => `goose_undo_${runId}`;
/** The last run this tab sent to PayPal from the Desk; the wallet keeps its own (`goose_last_run`). */
const DESK_LAST_RUN = "goose_desk_run";
const WALLET_LAST_RUN = "goose_last_run";
export const RUN_ID = /^[0-9a-f]{12}$/;

export const read = (k: string): string | null => { try { return sessionStorage.getItem(k); } catch { return null; } };

/** Kept by the Desk's Approve, just before PayPal opens. Private mode keeps nothing: Undo then says where it works. */
export function keepRun(runId: string, undoKey: unknown): void {
  try {
    sessionStorage.setItem(DESK_LAST_RUN, runId);
    if (typeof undoKey === "string" && undoKey) sessionStorage.setItem(undoSlot(runId), undoKey);
  } catch { /* nothing kept */ }
}

/** The run this tab last sent to PayPal: the Desk's first, then the wallet's. */
export function lastRunHere(): string | null {
  for (const k of [DESK_LAST_RUN, WALLET_LAST_RUN]) { const id = read(k); if (id && RUN_ID.test(id)) return id; }
  return null;
}

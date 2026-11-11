// Append-only log of live AI moves (M2 step 1): the real fallback count we say, and
// the evidence for the target "at most 1 in 20 live moves falls back".
// One JSON line per buyer move, read from the run's ledger after it finishes.
// Lives in .goose/ (gitignored); `node scripts/move-log.ts` summarises it.

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { LedgerEvent } from "@goose/core";

export interface MoveRow {
  at: string;
  /** One server process = one session. */
  session: string;
  run: string;
  round: number;
  source: string;
  reason?: string;
  /** Last seller offer of the round → the buyer's move, on the ledger clock. */
  ms: number;
}

export function moveRows(events: readonly LedgerEvent[], session: string, run: string): MoveRow[] {
  const rows: MoveRow[] = [];
  let lastOffer: number | undefined;
  for (const e of events) {
    if (e.actor === "seller" && e.action === "offer") lastOffer = e.t;
    const d = e.data as { source?: unknown; reason?: unknown } | undefined;
    if (e.actor !== "buyer" || typeof d?.source !== "string" || lastOffer === undefined) continue;
    rows.push({
      at: new Date(e.t).toISOString(), session, run, round: e.round ?? 0, source: d.source,
      ...(typeof d.reason === "string" ? { reason: d.reason } : {}),
      ms: e.t - lastOffer,
    });
  }
  return rows;
}

export function appendMoves(path: string, rows: readonly MoveRow[]): void {
  if (rows.length === 0) return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

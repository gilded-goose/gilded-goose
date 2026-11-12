// Compare's rows as AG Grid reads them: the ranked list (compare-rows.ts) plus what the grid draws from it, each row's
// place, how far its price fills the scale to your limit, and whether your limit is ruled above it. Pure.
import { toCents } from "@goose/core/money";
import type { CompareRow } from "./compare-rows.ts";

export interface GridRow extends CompareRow {
  rank: number;
  /** Price over your limit, held to 1: the bar under the row. */
  fill: number;
  /** The first seller over your limit: the limit line is ruled above it. */
  lineAbove: boolean;
}

export function gridRows(rows: readonly CompareRow[], limitCents: number): GridRow[] {
  const lineAt = rows.findIndex((r) => !r.underLimit);
  return rows.map((r, i) => ({ ...r, rank: i + 1, fill: Math.min(toCents(r.price) / limitCents, 1), lineAbove: i === lineAt && i > 0 }));
}

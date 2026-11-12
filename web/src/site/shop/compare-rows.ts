// Compare (spec §6.2): every seller ranked by price against your limit, each stamped from the Watcher's word and the
// limit (verdictOf), never by hand. The best is the cheapest Clear seller at or under your limit, as buildWeek picks it.
// The live list comes from the market answer; the recorded one (server away) from the kettle week's own ledger rows.
import type { LedgerEvent } from "@goose/core";
import { toCents } from "@goose/core/money";
import type { Result } from "../../goose/market.ts";
import { verdictOf, type Verdict } from "../ui/stamp.ts";

export interface CompareRow {
  id: string;
  name: string;
  price: string;
  verdict: Verdict;
  /** The Watcher's own words for a seller set aside or held, joined as a sentence; null when it said nothing. */
  reason: string | null;
  underLimit: boolean;
  best: boolean;
  /** The seller's own note, quoted, for a seller set aside: it's the evidence. */
  quoted: string | null;
}

export const sentence = (said: readonly string[]): string =>
  said.length < 2 ? said.join("") : `${said.slice(0, -1).join(", ")} and ${said.at(-1)}`;

/** Cheapest first, the best marked: the one ranking for the live list and the recorded one (kettle-rows.ts). */
export function ranked(rows: Omit<CompareRow, "best">[]): CompareRow[] {
  const sorted = [...rows].sort((a, b) => toCents(a.price) - toCents(b.price) || a.name.localeCompare(b.name));
  const best = sorted.find((r) => r.verdict === "clear" && r.underLimit);
  return sorted.map((r) => ({ ...r, best: r === best }));
}

export function compareRows(results: readonly Result[], limitCents: number): CompareRow[] {
  return ranked(results.map((r) => {
    const under = toCents(r.price) <= limitCents && !r.over;
    const verdict = verdictOf(r.watcher, !under);
    // Only the Watcher's verdicts carry its words; "Clear" and "Over your limit" speak for themselves.
    const reason = verdict === "aside" || verdict === "held" ? sentence(r.said) || null : null;
    return { id: r.id, name: r.merchant, price: r.price, verdict, reason, underLimit: under, quoted: r.watcher === "refuse" && r.quoted ? r.quoted : null };
  }));
}

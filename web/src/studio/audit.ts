// The ledger as an audit log, inside Studio (Joshua, Nov 4: "grouped by visit, a click opens the PayPal order and webhook
// rows, and Find shows every row with a given rule. Append-only stays visible."). Pure: AG Grid Community draws what this
// returns, and a phone's cards read the same Find, so the two can't disagree. Row grouping itself is an Enterprise feature;
// a head row and a list are not, and every row under a head is still one ledger row, in the ledger's own order.

import { matchesSearch, watchRuleWords, type LedgerRow } from "@goose/core/session";

/** A visit: one run of this session or of the demo week. Rows outside any run stay in a visit of their own, so none is dropped or moved. */
export interface Visit { key: string; words: string; part: LedgerRow["part"]; rows: LedgerRow[]; paypal: number }

/** A row PayPal really sent: the seeded row stands in for a capture, and PayPal never wrote it (the PayPal chip's test, core/src/view/session.ts). */
const fromPayPal = (r: LedgerRow): boolean => r.actor === "paypal" && r.source !== "seeded";

export const visitKey = (r: LedgerRow): string => `${r.part}|${r.run ?? ""}`;

/** Every row in exactly one visit; visits in the order their first rows appear, rows in the ledger's order. */
export function visitsOf(rows: readonly LedgerRow[]): Visit[] {
  const out = new Map<string, Visit>();
  for (const r of rows) {
    const key = visitKey(r);
    let v = out.get(key);
    if (!v) { v = { key, part: r.part, rows: [], paypal: 0, words: "" }; out.set(key, v); }
    v.rows.push(r);
    if (fromPayPal(r)) v.paypal++;
  }
  const list = [...out.values()];
  // Numbered only among the visits that share a name, so one recorded week is never "part 1 of 1".
  const nameOf = (v: Visit) => (v.part === "session" ? "Your visit" : v.rows.every((r) => r.source === "seeded") ? "The seeded row" : "The recorded demo week");
  const total = new Map<string, number>();
  for (const v of list) total.set(nameOf(v), (total.get(nameOf(v)) ?? 0) + 1);
  const seen = new Map<string, number>();
  for (const v of list) {
    const name = nameOf(v);
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    v.words = total.get(name)! > 1 ? `${name} ${n}` : name;
  }
  return list;
}

/** The rules the ledger's rows name, each once, by the words its sheet uses. One row can name two (`instructs-agent, gift-card`). */
export function rulesOf(rows: readonly LedgerRow[]): { rule: string; words: string; count: number }[] {
  const seen = new Map<string, number>();
  for (const r of rows) for (const rule of r.rule?.split(", ") ?? []) seen.set(rule, (seen.get(rule) ?? 0) + 1);
  return [...seen].map(([rule, count]) => ({ rule, count, words: watchRuleWords(rule) })).sort((a, b) => b.count - a.count || a.words.localeCompare(b.words));
}

/** Find: every row with this rule, and every word typed somewhere in the row. Both empty is every row. */
export function findRows(rows: readonly LedgerRow[], words: string, rule: string | null): LedgerRow[] {
  return rows.filter((r) => (rule === null || (r.rule?.split(", ").includes(rule) ?? false)) && matchesSearch(r, words));
}

/** A visit's head in the table: it holds no ledger row, and can't be taken for one. */
export type VisitHead = LedgerRow & { visit: { key: string; words: string; shown: number; paypal: number; open: boolean } };
export const isVisitHead = (r: LedgerRow | undefined): r is VisitHead => !!r && "visit" in r;

/**
 * The table's list: each visit's head, and its rows when it's open. While Find is on, a visit with no match is gone and
 * the rest are open, so what's found is all on show; `closed` only applies with no Find.
 */
export function auditList(rows: readonly LedgerRow[], closed: ReadonlySet<string>, words: string, rule: string | null): LedgerRow[] {
  const finding = rule !== null || words.trim() !== "";
  const found = finding ? findRows(rows, words, rule) : rows;
  const out: LedgerRow[] = [];
  for (const v of visitsOf(found)) {
    const open = finding || !closed.has(v.key);
    out.push({ ...v.rows[0]!, id: `visit:${v.key}`, visit: { key: v.key, words: v.words, shown: v.rows.length, paypal: v.paypal, open } } as VisitHead);
    if (open) out.push(...v.rows);
  }
  return out;
}

/** The PayPal rows of a row's own visit, the order and its webhooks, on that row's side of the record only. Never the row itself. */
export function paypalInVisit(rows: readonly LedgerRow[], row: LedgerRow): LedgerRow[] {
  const key = visitKey(row);
  return rows.filter((r) => fromPayPal(r) && r.id !== row.id && visitKey(r) === key);
}

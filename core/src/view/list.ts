// The Christmas list (Joshua, Nov 3, 4d: "can't overspend"): the wants as gifts, each with a priority, the most I'll pay, a
// "needed by" day and who it's for, under one total. The total itself is enforced by the guard, from the shopper's rows
// (trust `listTotal`), at decide and again at capture; this file only says it. Pure: wants, rows, Policy and a clock in, a view out.

import { fromCents, type Cents, usdOf } from "../money.ts";
import type { Catalog } from "../trust/catalog.ts";
import { listSpend, listTotal } from "../trust/guard.ts";
import type { LedgerEvent } from "../ledger/events.ts";
import { categoryLimitFor, type Policy } from "../trust/policy.ts";
import { rankOf, wantMax, type ForWho, type Rank, type SavedWant } from "../ask/wants.ts";

/** The demo list: fictional gifts Goose has sellers for, and a total smaller than their maxes, so the total has work to do. */
export const DEMO_GIFTS: readonly { catalogId: string; rank: Rank; forWho: ForWho; max: Cents }[] = [
  { catalogId: "kettle", rank: 5, forWho: "Mom", max: 6000 },
  { catalogId: "marsh-lights-ticket", rank: 4, forWho: "Partner", max: 9000 },
  { catalogId: "harbor-jacket", rank: 3, forWho: "Brother", max: 7000 },
  { catalogId: "mossbell-night", rank: 2, forWho: "Grandparent", max: 10_000 },
];
export const DEMO_TOTAL: Cents = 25_000;
/** The picks for a total: whole steps, never typed. Decided by default: $25 to $500 in $25 steps. Flip if Joshua says: type any amount. */
export const TOTAL_CHOICES: readonly Cents[] = Array.from({ length: 20 }, (_, i) => (i + 1) * 2500);
export const TOTAL_HOLDS = "Only your tap pays.";
export const totalLine = (said: string) => `No cart in this browser can pass ${usdOf(said)}. ${TOTAL_HOLDS}`;
export const TOTAL_NOT_A_CHOICE = "Pick a total from the list.";
export const isTotalChoice = (v: unknown): v is Cents => typeof v === "number" && TOTAL_CHOICES.includes(v);

/** The next Dec 20 on or after this clock's day, as YYYY-MM-DD. */
export function nextDec20(now: number): string {
  const y = new Date(now).getUTCFullYear();
  const day = new Date(now).toISOString().slice(0, 10);
  return day <= `${y}-12-20` ? `${y}-12-20` : `${y + 1}-12-20`;
}

const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
/** "Dec 20", from a checked YYYY-MM-DD. */
export const daySaid = (ymd: string): string => `${MONTHS[Number(ymd.slice(5, 7)) - 1]} ${Number(ymd.slice(8, 10))}`;
/** Whole days from this clock's UTC day to a checked YYYY-MM-DD; below 0 once it has passed. */
export const daysUntil = (ymd: string, now: number): number => Math.round((Date.parse(`${ymd}T00:00:00Z`) - Math.floor(now / DAY_MS) * DAY_MS) / DAY_MS);

export interface GiftRow { catalogId: string; item: string; forWho: ForWho | null; rank: Rank; maxCents: Cents; max: string; limitCents: Cents; neededBy: string | null; neededSaid: string | null; daysLeft: number | null }
export interface ListView {
  /** Null: no total stands, so nothing here limits a cart beyond the shopper's other limits. */
  total: { cents: Cents; said: string } | null;
  spentCents: Cents; spent: string;
  leftCents: Cents | null; left: string | null;
  /** The most the gifts' own maxes add up to: what the total is up against. */
  maxSum: string;
  gifts: GiftRow[];
  /** Every entry a gift can be, for the add picker. */
  choices: { catalogId: string; item: string; limitCents: Cents }[];
}

export const shownItem = (item: string): string => item.replace(" (fictional)", "");

export function listView(wants: readonly SavedWant[], rows: readonly LedgerEvent[], policy: Policy, catalog: Catalog, now: number): ListView {
  const on = listTotal(rows, policy.shopperId);
  const spentCents = on ? listSpend(rows, policy.shopperId, on.since) : 0;
  const leftCents = on ? Math.max(0, on.total - spentCents) : null;
  const gifts = wants.flatMap((w): GiftRow[] => {
    const e = catalog.get(w.catalogId);
    if (!e) return [];
    const maxCents = wantMax(w, catalog, policy);
    return [{ catalogId: w.catalogId, item: shownItem(e.item), forWho: w.forWho ?? null, rank: rankOf(w), maxCents, max: fromCents(maxCents), limitCents: categoryLimitFor(policy, e.category), neededBy: w.neededBy ?? null, neededSaid: w.neededBy ? daySaid(w.neededBy) : null, daysLeft: w.neededBy ? daysUntil(w.neededBy, now) : null }];
  }).sort((a, b) => b.rank - a.rank);
  return {
    total: on ? { cents: on.total, said: fromCents(on.total) } : null,
    spentCents, spent: fromCents(spentCents), leftCents, left: leftCents === null ? null : fromCents(leftCents),
    maxSum: fromCents(gifts.reduce((s, g) => s + g.maxCents, 0)), gifts,
    choices: [...catalog].map(([catalogId, e]) => ({ catalogId, item: shownItem(e.item), limitCents: categoryLimitFor(policy, e.category) })).filter((c) => !gifts.some((g) => g.catalogId === c.catalogId)),
  };
}

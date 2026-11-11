// The year view (Joshua, Nov 3, 4d): Goose's plan for when to buy each gift, "not a prediction". Each gift's price over the
// months is simulated: today's simulated price, shaped by a fixed table of seasons. These numbers feed nothing else: the
// Read never reads them and the guard never sees them. The plan takes the cheapest simulated month from now until the gift
// is needed (this month if the Read says BUY NOW), most wanted gift first, and never plans past the gift's max or what's left of the total. Pure: facts in, a view out.

import { fromCents, type Cents, usd } from "../money.ts";

export const PLAN_LABEL = "Goose's plan, not a prediction";
export const PLAN_SIMULATED = "Every price here is simulated.";

/** Simulated seasons by category, one factor a month, January first. Made up, and said to be. Decided by default: one fixed
 *  table, the same for everyone. Flip if Joshua says: shape it from real price data once Channel3's key is in. */
const SEASONS: Readonly<Record<string, readonly number[]>> = {
  kitchen: [0.9, 0.95, 1, 1, 1.05, 1.05, 1, 1, 1, 1, 0.8, 0.95],
  events: [1.05, 1.05, 1, 1, 1, 1.05, 1.05, 1.05, 1, 1, 0.95, 0.9],
  travel: [0.85, 0.85, 0.95, 1, 1.05, 1.15, 1.2, 1.15, 1, 0.95, 0.9, 1.1],
  clothing: [0.8, 0.85, 1, 1, 1, 0.95, 0.85, 0.9, 1.05, 1.05, 0.9, 0.95],
};
const FLAT: readonly number[] = Array.from({ length: 12 }, () => 1);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export interface PlanGift {
  catalogId: string; item: string; rank: number; category: string;
  /** Today's simulated price; null when no seller has one. */
  priceCents: Cents | null;
  maxCents: Cents;
  /** YYYY-MM-DD, or null with no day set. */
  neededBy: string | null;
  bought: boolean;
  /** The Read on this gift says BUY NOW, from real signals: the plan doesn't argue with it on simulated seasons. */
  buyNow: boolean;
}
export type PlanStatus = "planned" | "bought" | "no-date" | "passed" | "no-price" | "over-max" | "over-total";
export interface PlanMonth { label: string; said: string; cents: Cents | null; past: boolean; plan: boolean; needed: boolean }
export interface PlanRow { catalogId: string; item: string; rank: number; status: PlanStatus; said: string; months: PlanMonth[] }
export interface YearView { label: string; simulated: string; months: string[]; monthsPast: number; gifts: PlanRow[]; plannedCents: Cents; planned: string; leftCents: Cents | null; left: string | null }

/** Months since year 0: a month's one number. */
const monthOf = (y: number, m: number) => y * 12 + m;
const ymdMonth = (ymd: string) => monthOf(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1);

/** A gift's simulated price in a month: today's price, moved by the season from this month to that one, in whole dollars. */
function simulated(g: PlanGift, month: number, nowMonth: number): Cents | null {
  if (g.priceCents === null) return null;
  const season = SEASONS[g.category] ?? FLAT;
  return Math.round((g.priceCents * season[month % 12]! / season[nowMonth % 12]!) / 100) * 100;
}

export function yearPlan(gifts: readonly PlanGift[], leftCents: Cents | null, now: number): YearView {
  const d = new Date(now);
  const nowMonth = monthOf(d.getUTCFullYear(), d.getUTCMonth());
  // Twelve months, ending with the last gift's month, so the past months show the season. A date over a year off starts
  // the view at today instead, so the months that can be planned are the ones on it.
  const lastNeeded = Math.max(nowMonth, ...gifts.flatMap((g) => (g.neededBy ? [ymdMonth(g.neededBy)] : [])));
  const start = Math.min(nowMonth, lastNeeded - 11);
  const window = Array.from({ length: 12 }, (_, i) => start + i);

  // Most wanted first, then soonest needed: the money goes to them first, and the order on screen stays what it was.
  const order = [...gifts].sort((a, b) => b.rank - a.rank || (a.neededBy ?? "9").localeCompare(b.neededBy ?? "9") || a.catalogId.localeCompare(b.catalogId));
  let left = leftCents;
  let plannedCents = 0;
  const gone = (g: PlanGift): { status: PlanStatus; said: string } | null =>
    g.bought ? { status: "bought", said: "Bought." }
    : !g.neededBy ? { status: "no-date", said: "Set a needed-by day to plan this." }
    : ymdMonth(g.neededBy) < nowMonth ? { status: "passed", said: "Its day has passed." }
    : g.priceCents === null ? { status: "no-price", said: "No seller has a price yet." }
    : null;
  const rows = order.map((g): PlanRow => {
    const known = gone(g);
    let status = known?.status ?? ("planned" as PlanStatus);
    let said = known?.said ?? "";
    let plan: number | null = null;
    if (!known) {
      const open = g.buyNow ? [nowMonth] : window.filter((m) => m >= nowMonth && m <= ymdMonth(g.neededBy!));
      // Cheapest first; on a tie the earlier month, so the gift is in hand sooner.
      const best = open.reduce<{ m: number; c: Cents } | null>((b, m) => { const c = simulated(g, m, nowMonth)!; return b === null || c < b.c ? { m, c } : b; }, null);
      if (!best || best.c > g.maxCents) { status = "over-max"; said = `Asks stay over your ${usd(g.maxCents)} max in every simulated month.`; }
      else if (left !== null && best.c > left) { status = "over-total"; said = `Doesn't fit what's left of your total.`; }
      else {
        plan = best.m;
        plannedCents += best.c;
        if (left !== null) left -= best.c;
        said = `${g.buyNow ? "Buy now" : best.m === nowMonth ? `Later in ${MONTHS[best.m % 12]}` : `Buy in ${MONTHS[best.m % 12]}`}: ${usd(best.c)} (simulated).`;
      }
    }
    return {
      catalogId: g.catalogId, item: g.item, rank: g.rank, status, said,
      months: window.map((m) => {
        const cents = simulated(g, m, nowMonth);
        const label = MONTHS[m % 12]!;
        const needed = g.neededBy !== null && ymdMonth(g.neededBy) === m;
        return { label, said: `${label}: ${cents === null ? "no price" : `${usd(cents)}, simulated`}${m === plan ? ", Goose's pick" : ""}${needed ? ", needed by" : ""}`, cents, past: m < nowMonth, plan: m === plan, needed };
      }),
    };
  });
  return {
    label: PLAN_LABEL, simulated: PLAN_SIMULATED, months: window.map((m) => MONTHS[m % 12]!), monthsPast: window.filter((m) => m < nowMonth).length, gifts: rows,
    plannedCents, planned: fromCents(plannedCents), leftCents: left, left: left === null ? null : fromCents(left),
  };
}

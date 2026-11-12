// What The Line draws, from what the server answered. Every price, verdict and reason comes from the market answer
// (`/api/runs/market/ask`); a recorded item's earlier days come from the same recorded curves the server read
// (`@goose/core/moving`). Nothing here invents a price or a seller: an answer with no recorded week is drawn as one day.
import { MOVING_ITEMS, priceOn, type MovingItem } from "@goose/core/moving";
import { toCents } from "@goose/core/money";

/** One price on the field: the column (day) it lands on and the total. */
export interface Mark { round: number; cents: number; by: "seller" | "goose"; deal?: boolean }
/** One seller's line of prices, and what the Watcher and your limit make of it. */
export interface Track { id: string; name: string; marks: Mark[]; state: "open" | "over" | "aside" | "deal" | "quiet" }

export interface Result {
  id: string; merchant: string; item: string; price: string; currency: string; history: number | null;
  quoted: string; watcher: "clear" | "hold" | "refuse"; said: string[]; over?: string;
}
export interface Market {
  kind: "market"; marketId: string; item: string; claim: string; madeBy: string; readerSays: string;
  limitWhy: string; cap: string | null; heldBy: string; results: Result[];
  recorded?: { catalogId: string; day: number };
}

/** One beat of the week, in the order it happens. `day` is the column it lands on. */
export type Beat =
  | { kind: "list"; day: number; sellerId: string; name: string; cents: number }
  | { kind: "aside"; day: number; sellerId: string; name: string; cents: number; said: string[]; quoted: string; pulls: boolean }
  | { kind: "over"; day: number; sellerId: string; name: string; cents: number; why: string }
  | { kind: "hold"; day: number; sellerId: string; name: string; cents: number; why: string }
  | { kind: "under"; day: number; sellerId: string; name: string; cents: number };

export interface Week {
  limit: number;
  /** Column labels, oldest first ("Day 1" … or "Now" for a market with no recorded week). */
  days: string[];
  tracks: Track[];
  beats: Beat[];
  /** The listing Goose would show you: the cheapest the Watcher cleared, at or under your limit. */
  best: Result | null;
  recorded: boolean;
}

/** Seller text that tries to give Goose orders, as the Watcher names it; the line's tug is drawn only for this. */
export const PULLS = "its note tries to instruct the agent";

const bare = (id: string) => id.replace(/^rm-/, "");
const short = (name: string) => name.replace(/\s*\(fictional\)$/, "");

export function buildWeek(m: Market, limitCents: number): Week {
  const item: MovingItem | undefined = m.recorded ? MOVING_ITEMS.find((i) => i.id === m.recorded!.catalogId) : undefined;
  const lastDay = item && m.recorded ? m.recorded.day - 1 : 0;
  const days = item ? Array.from({ length: lastDay + 1 }, (_, d) => `Day ${d + 1}`) : ["Now"];
  const beats: Beat[] = [];
  const tracks: Track[] = [];

  for (const r of m.results) {
    const id = bare(r.id), name = short(r.merchant), now = toCents(r.price);
    const seller = item?.sellers.find((s) => s.sellerId === id);
    const marks: Mark[] = [];
    if (seller) {
      let prev: number | null = null;
      for (let d = 0; d <= lastDay; d++) {
        const p = priceOn(seller.curve, d);
        if (!p) continue;
        // Today's mark is the server's own number; earlier days are the curve's.
        const cents = d === lastDay ? now : p.total;
        if (cents !== prev) marks.push({ round: d, cents, by: "seller" });
        prev = cents;
      }
    }
    if (marks.length === 0) marks.push({ round: lastDay, cents: now, by: "seller" });
    const first = marks[0]!;
    // A refused seller's listing and its refusal are one beat: it's set aside the day it lists.
    if (r.watcher !== "refuse") beats.push({ kind: "list", day: first.round, sellerId: id, name, cents: first.cents });
    if (r.watcher === "refuse") {
      beats.push({ kind: "aside", day: first.round, sellerId: id, name, cents: first.cents, said: r.said, quoted: r.quoted, pulls: r.said.includes(PULLS) });
    } else {
      for (const k of marks.slice(1)) beats.push({ kind: "list", day: k.round, sellerId: id, name, cents: k.cents });
      if (r.over) beats.push({ kind: "over", day: lastDay, sellerId: id, name, cents: now, why: r.over });
      else if (r.watcher === "hold") beats.push({ kind: "hold", day: lastDay, sellerId: id, name, cents: now, why: r.said[0] ?? "held for your yes" });
    }
    tracks.push({ id, name, marks, state: r.watcher === "refuse" ? "aside" : r.over || now > limitCents ? "over" : r.watcher === "hold" ? "quiet" : "open" });
  }

  const cleared = m.results.filter((r) => r.watcher === "clear" && !r.over && toCents(r.price) <= limitCents);
  const best = cleared.sort((a, b) => toCents(a.price) - toCents(b.price))[0] ?? null;
  if (best) {
    const t = tracks.find((x) => x.id === bare(best.id))!;
    t.state = "deal";
    const k = t.marks[t.marks.length - 1]!;
    k.deal = true;
    // The day it first came under your limit and stayed: that's when Goose tells you.
    let day = k.round;
    for (let i = t.marks.length - 1; i >= 0 && t.marks[i]!.cents <= limitCents; i--) day = t.marks[i]!.round;
    beats.push({ kind: "under", day: Math.max(day, k.round), sellerId: t.id, name: t.name, cents: k.cents });
  }
  // Day order, and within a day: listings, then the Watcher's calls, then the deal.
  const rank = { list: 0, aside: 1, over: 2, hold: 2, under: 3 } as const;
  beats.sort((a, b) => a.day - b.day || rank[a.kind] - rank[b.kind]);
  return { limit: limitCents, days, tracks, beats, best, recorded: !!item };
}

/** A recorded listing's price and its fees and taxes on the day shown, when the record splits them; else null. */
export function splitOf(m: Market, r: Result): { base: number; fees: number } | null {
  if (!m.recorded) return null;
  const seller = MOVING_ITEMS.find((i) => i.id === m.recorded!.catalogId)?.sellers.find((s) => s.sellerId === bare(r.id));
  const p = seller ? priceOn(seller.curve, m.recorded.day - 1) : null;
  return p && p.total === toCents(r.price) ? { base: p.base, fees: p.fees } : null;
}

/** The tracks as they stand after `upTo` beats: only what has happened so far is drawn. */
export function tracksAt(w: Week, upTo: number): Track[] {
  const seen = w.beats.slice(0, upTo);
  return w.tracks.map((t) => {
    const mine = seen.filter((b) => b.sellerId === t.id);
    if (mine.length === 0) return { ...t, marks: [] };
    const day = Math.max(...mine.map((b) => b.day));
    const done = mine.some((b) => b.kind !== "list");
    const state: Track["state"] = done ? t.state : mine.some((b) => b.kind === "aside") ? "aside" : "open";
    return { ...t, state, marks: t.marks.filter((k) => k.round <= day).map((k) => (k.deal && !mine.some((b) => b.kind === "under") ? { ...k, deal: false } : k)) };
  });
}

/** The biggest dollar amount a seller's note names, when it's over your limit: the number it tried to make yours. */
export function pulledTo(quoted: string, limit: number): number | null {
  const amounts = [...quoted.matchAll(/\$\s?(\d[\d,]*(?:\.\d{2})?)/g)].map((m) => Math.round(Number(m[1]!.replace(/,/g, "")) * 100));
  const top = Math.max(0, ...amounts.filter(Number.isFinite));
  return top > limit ? top : null;
}

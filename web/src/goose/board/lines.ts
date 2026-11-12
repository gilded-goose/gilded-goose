// A week, as the board shows it after `shown` beats: the item and day, your limit, a label row, then one row per seller
// in the order they listed. Pure, so the replay and the run draw the same way and tests can read it.
import type { Track, Week } from "../market.ts";
import { blankLine, headLine, labelLine, limitLine, sellerLine, spentLine, type Line, type Size, type Status } from "./layout.ts";

export const SELLER_ROWS = 4;

// A listing under your limit says so at once; the one Goose picks turns gold when the week has decided.
function statusOf(t: Track, cents: number, limit: number): Status {
  switch (t.state) {
    case "aside": return "refused";
    case "deal": return "deal";
    case "over": return "over";
    case "quiet": return "hold";
    case "open": return cents > limit ? "over" : "under";
  }
}

export interface BoardState { title: string; when: string; limit: number | null; tracks: Track[]; order: string[] }

export function boardLines(s: BoardState, size: Size, rows = SELLER_ROWS): Line[] {
  const out: Line[] = [headLine(s.title, s.when, size), limitLine(s.limit, size), labelLine(size)];
  const listed = s.order.map((id) => s.tracks.find((t) => t.id === id)).filter((t): t is Track => !!t && t.marks.length > 0);
  for (const t of listed.slice(0, Math.max(rows, listed.length))) {
    const now = t.marks[t.marks.length - 1]!.cents;
    out.push(sellerLine(t.name, now, statusOf(t, now, s.limit ?? Infinity), s.limit ?? 0, size));
  }
  while (out.length < 3 + rows) out.push(blankLine(size));
  out.push(spentLine(size));
  return out;
}

/** Sellers in the order they first appear in the week. */
export const orderOf = (w: Week): string[] => [...new Set(w.beats.map((b) => b.sellerId))];

/** The day label after `shown` beats: the day of the last beat seen, or the first day before any. */
export function whenOf(w: Week, shown: number): string {
  const b = w.beats[Math.min(shown, w.beats.length) - 1];
  return w.days[b ? b.day : 0] ?? "";
}

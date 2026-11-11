// A landing's edges (S1-13, the DD's straddle rule): pure, so the Desk's landing and the tour pill share one search and
// core/test/tour-edges.test.ts holds it. Measured in the browser by web/src/tour/edges.ts `edgeSpans`.

/** A box in page coordinates (its viewport top and bottom plus scrollY when measured). */
export interface Span { top: number; bottom: number }

/** Does an edge at page y cut this span (cross it by more than half a pixel)? A line's whole box counts, leading and all
 *  (the DD's straddle rule: "Your name" at 740–769 is cut by an edge at 742). */
export const cuts = (s: Span, y: number): boolean => s.top < y - 0.5 && s.bottom > y + 0.5;

/** S1-13 (the DD's straddle rule, system.md §4, ruled at S1-12): the scroll position nearest `y`, within [lo, hi], at
 *  which neither the window's top edge (`top`, from the window's top) nor its floor (`floor`: the tour strip's top) cuts
 *  a span; null when none within `reach` px is clear. Ties go down (more of what is under the strip shows). Pure: the
 *  spans are measured by `edgeSpans`. */
export function clearScroll(y: number, lo: number, hi: number, spans: readonly Span[], top: number, floor: number, reach = 200): number | null {
  const ok = (v: number) => v >= lo && v <= hi && !spans.some((s) => cuts(s, v + top) || cuts(s, v + floor));
  for (let d = 0; d <= reach; d++) {
    if (ok(y + d)) return y + d;
    if (d > 0 && ok(y - d)) return y - d;
  }
  return null;
}

/** S1-13 part 2: when no landing in [lo, hi] is clear (the sticky phone bar leaves 56 px less room, and the stop's subject
 *  must stay whole), the one that cuts the fewest spans at the two edges, nearest `y` on a tie. Never outside [lo, hi]:
 *  the subject stays whole first (Decided by default in docs/guild/069). */
export function leastCut(y: number, lo: number, hi: number, spans: readonly Span[], top: number, floor: number): number {
  const n = (v: number) => spans.filter((s) => cuts(s, v + top) || cuts(s, v + floor)).length;
  let best = Math.min(Math.max(y, lo), hi), fewest = n(best);
  for (let v = Math.ceil(lo); v <= hi; v++) {
    const k = n(v);
    if (k < fewest || (k === fewest && Math.abs(v - y) < Math.abs(best - y))) { best = v; fewest = k; }
  }
  return best;
}

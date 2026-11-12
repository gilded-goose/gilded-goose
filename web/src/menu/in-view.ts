// A landing scrolls only when its target is not wholly in view (the DD, system.md §5 Tour pill, ruled Sat Nov 1 for
// S1-9; the Round 3 design judge: tour stop 1 scrolled the hero so the sticky bar sliced the lit egg, when the greeting,
// the Ask box and the chips were already on screen). "In view" is the window between the page's own sticky bar and its
// foot: the tour's pill while this tab is on the tour (drawn or still on its way: the pill is its
// own chunk and lands a moment after the page). Read by the Desk's Ask landing and the menu's anchor landings.
// One small import (the tour's mark, which has none), so the Desk takes it with no extra chunk.

import { following } from "../tour/follow.ts";

export const drawn = (e: Element): boolean => e.getClientRects().length > 0 && e.getBoundingClientRect().height > 0;

/** The pill's height and its gap above the foot (tour-pill.css: `--tp-h` 46 px, `--s-4` 32 px on a wide screen); on a
 *  phone the strip is that row plus the home indicator's inset, 12 px at least, on the window's bottom edge (S1-13). */
const PILL_H = 46, PILL_GAP = 32, STRIP_INSET = 12;

/** The window's top edge for content: the bottom of a sticky or fixed bar at the top, else 0. */
export function viewTop(): number {
  let top = 0;
  for (const e of document.querySelectorAll(".gn, .dk-nav, header")) {
    if (!drawn(e) || !/sticky|fixed/.test(getComputedStyle(e).position)) continue;
    const r = e.getBoundingClientRect();
    if (r.top <= 1) top = Math.max(top, r.bottom);
  }
  return top;
}

/** The window's foot for content: the tour's pill (or the room it will take), else the window's own foot. S1-13: no
 *  rail any more (brand.md §10.4: one bar at the top, and no side list at any width). */
export function viewFloor(): number {
  // S1-13: the page-wide state line (Track R's .st-strip) stands at the foot too, above the phone's strip.
  const line = document.querySelector(".st-strip");
  const floor = line && drawn(line) ? Math.min(innerHeight, line.getBoundingClientRect().top) : innerHeight;
  const pill = document.querySelector(".tp");
  if (pill && drawn(pill)) return Math.min(floor, pill.getBoundingClientRect().top);
  if (following() !== null && new URLSearchParams(location.search).get("desk") !== "tour") {
    return floor - (matchMedia("(max-width: 720px)").matches ? PILL_H + STRIP_INSET : PILL_H + PILL_GAP);
  }
  return floor;
}

/** Every drawn element given sits wholly between the bar and the foot. False when none is drawn. */
export function wholeInView(els: readonly (Element | null | undefined)[]): boolean {
  const on = els.filter((e): e is Element => !!e && drawn(e));
  if (on.length === 0) return false;
  const top = viewTop(), floor = viewFloor();
  return on.every((e) => { const r = e.getBoundingClientRect(); return r.top >= top - 0.5 && r.bottom <= floor + 0.5; });
}


/** What a landing's edges must not cut: the page's controls (WCAG 2.4.11's focusables, drawn and not inert). */

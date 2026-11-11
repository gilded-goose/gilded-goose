// Where a stop's landing may put the window's edges, measured from the page: the tour's own, so the Desk and the menu don't carry it.
import { clearScroll, type Span } from "@goose/core/edges";
import { drawn, viewFloor, viewTop } from "../menu/in-view.ts";
import { following } from "./follow.ts";

const CONTROLS = "a[href], button, input, select, textarea, summary, [role='button'], [role='link'], [tabindex]:not([tabindex='-1'])";

/** Is this line wholly outside a box that clips it? Then nobody sees it, and no edge or pill can cut it or sit on it: a table's
 *  rows scrolled out of its own window still report their boxes (Nov 4: the ledger's Every try blocked stop 10's landing). */
export function clippedOut(): (el: Element, r: DOMRect) => boolean {
  const known = new Map<Element, [number, number]>();
  const within = (el: Element | null): [number, number] => {
    if (!el || el === document.body) return [-Infinity, Infinity];
    let v = known.get(el);
    if (!v) {
      const [a, b] = within(el.parentElement);
      if (getComputedStyle(el).overflowY === "visible") v = [a, b];
      else { const r = el.getBoundingClientRect(); v = [Math.max(a, r.top), Math.min(b, r.bottom)]; }
      known.set(el, v);
    }
    return v;
  };
  return (el, r) => { const [a, b] = within(el.parentElement); return r.bottom <= a || r.top >= b; };
}

/** S1-13: every text line and control within `reach` px of the window that moves with the page, in page coordinates.
 *  Things that stay put as the page scrolls (a sticky or fixed bar, the rail, the tour's pill) are left out: an edge
 *  never moves across them. So is anything hidden, inert or a screen reader's 1 px text. */
export function edgeSpans(reach = 600): Span[] {
  const clipped = clippedOut();
  const pinned = new Map<Element, boolean>();
  const isPinned = (el: Element | null): boolean => {
    if (!el || el === document.body) return false;
    const known = pinned.get(el);
    if (known !== undefined) return known;
    // `display: contents` has no box, so it pins nothing, whatever its position still computes to (the Challenge's left
    // column on a phone). The probe in scripts/tour-pill.ts reads it the same way (core/test/tour-edges.test.ts).
    const cs = getComputedStyle(el);
    const v = (cs.display !== "contents" && /sticky|fixed/.test(cs.position)) || isPinned(el.parentElement);
    pinned.set(el, v);
    return v;
  };
  const near = (r: DOMRect) => r.bottom > -reach && r.top < innerHeight + reach;
  const out: Span[] = [];
  const add = (r: DOMRect) => out.push({ top: r.top + scrollY, bottom: r.bottom + scrollY });
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walk.nextNode(); t; t = walk.nextNode()) {
    const el = t.parentElement;
    if (!el || !(t.textContent ?? "").trim() || isPinned(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
    const range = document.createRange(); range.selectNodeContents(t);
    for (const r of range.getClientRects()) if (r.width > 1 && r.height > 1 && near(r) && !clipped(el, r)) add(r);
  }
  for (const e of document.querySelectorAll<HTMLElement>(CONTROLS)) {
    if (e.closest("[inert]") || isPinned(e) || getComputedStyle(e).visibility === "hidden") continue;
    const r = e.getBoundingClientRect();
    if (r.width > 1 && r.height > 1 && near(r) && !clipped(e, r)) add(r);
  }
  return out;
}

/** The space a landing keeps between the window's top and the control it focuses (`--s-1`: its focus ring and air). */
const KEEP_GAP = 8;

/** S1-13 (the DD at S1-12, item 2: "the focused Ask box and its ready line wholly in view, with the TixQuack paragraph as
 *  far as it fits"; WCAG 2.4.11): where a Desk landing goes. `box` is its own landing for the control; `keep` is what
 *  must stay wholly in view (the Ask box and the line under it); `subject`, when given (on a phone, the Watcher's week
 *  paragraph under the box), pulls the landing on down as far as it needs and `keep` allows, past any line its top edge
 *  would cut (`past`). On the tour on a phone, it then moves the least that cuts no line or control at the window's top
 *  or the strip's (clearScroll). `fade` is the strip's fade above its top, which `keep` and the subject also clear. */
export function subjectLanding(box: number, subject: Element | null, keep: readonly (Element | null | undefined)[], past: (y: number) => number, fade: number): number {
  const top = viewTop(), floor = viewFloor() - fade;
  const on = keep.filter((e): e is Element => !!e && drawn(e)).map((e) => e.getBoundingClientRect());
  const hi = on.length ? Math.floor(Math.min(...on.map((r) => r.top)) + scrollY - top - KEEP_GAP) : Infinity;
  const lo = on.length ? Math.ceil(Math.max(...on.map((r) => r.bottom)) + scrollY - floor) : 0;
  let y = box, whole = -Infinity;
  if (subject && drawn(subject)) {
    const down = Math.ceil(subject.getBoundingClientRect().bottom + scrollY - floor);
    if (down > box) { y = Math.min(past(down), hi); whole = down; }
  }
  const max = document.documentElement.scrollHeight - innerHeight;
  if (lo <= hi) y = Math.min(Math.max(y, lo), hi);
  y = Math.max(0, Math.min(y, max));
  const tour = following() !== null && new URLSearchParams(location.search).get("desk") !== "tour";
  if (!tour || !matchMedia("(max-width: 720px)").matches) return y;
  // The subject whole when a clear place has it; else the nearest clear place that keeps the box.
  const spans = edgeSpans(), a = Math.max(0, lo), b = Math.min(hi, max);
  return (whole > a ? clearScroll(y, whole, b, spans, top, viewFloor()) : null) ?? clearScroll(y, a, b, spans, top, viewFloor()) ?? y;
}

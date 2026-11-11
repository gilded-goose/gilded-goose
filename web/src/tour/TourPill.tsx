// The judge tour's stepper, on the page a stop opened (S1-6; Round 2's consumer, worst moment 3: "Ask ›" dropped them
// on the landing with the tour gone). A small pill at the window's foot on a wide screen, a strip on its bottom edge on a phone:
// ‹ (the stop before) · "Judge tour · 01 of N" (back to the tour page) · Next › (the stop after, opened here and
// ticked, as the tour's own button does) · × (end the tour in this tab). Drawn by every page's menu button while this
// tab is on the tour (./follow.ts); its own chunk, fetched only then. Its colors are the page's tokens, so it sits in
// the velvet and the back room's Midnight alike.

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { createRoot } from "react-dom/client";
import { TOUR_HREF } from "@goose/core/menu-hash";
import { TOUR, parseTicks } from "@goose/core/tour";
import { follow, following, readTicksRaw, unfollow, writeTicks } from "./follow.ts";
import { clearScroll, cuts, leastCut } from "@goose/core/edges";
import { viewTop, wholeInView } from "../menu/in-view.ts";
import { clippedOut, edgeSpans } from "./edges.ts";
import { appHref } from "../menu/href.ts";
import "./tour-pill.css";

const pad = (n: number) => String(n).padStart(2, "0");
/** A stop's address from any page (S1-12): the stops are query strings on the app's own page, so on safe.html
 *  "?desk=tour" would mean safe.html?desk=tour (the same page again). The menu's one helper makes it the app's. */
const app = appHref;
/** The app's own page, however it is addressed ("/" or "/index.html"). */
const root = (path: string) => path.replace(/\/index\.html$/, "/");
/** The open stop before or after `at` (a stop with no button is stepped over), or -1. */
const near = (at: number, by: 1 | -1): number => { for (let i = at + by; i >= 0 && i < TOUR.length; i += by) if (TOUR[i]!.href) return i; return -1; };

let mounted = false;
/** Runs when the pill has moved to another page's bar: its own effect looks again for what that page brought. */
let rehomed = () => {};
/** Puts the stepper at the end of the bar's own page (S1-9, Round 3's a11y fix 2: after the page's content in the Tab
 *  order, so a keyboard user meets the page before the foot; inside the page's root, so it takes the page's colors, the
 *  velvet's or the back room's Midnight, as the bar does). Once a page.
 *
 *  A page can replace its whole tree under it: Behind the scenes draws a shell, then the dashboard takes the shell's place
 *  (studio/Shell.tsx), and the slot went with the shell, leaving a judge at stop 10 with no Next on live (Nov 5). So when the
 *  slot leaves the document, it goes under the bar that's drawn now, the same root and the same state. */
export function mountPill(bar: Element): void {
  const at = following();
  if (mounted || at === null || at >= TOUR.length) return;
  mounted = true;
  const slot = document.createElement("div");
  slot.className = "tp-slot";
  (bar.parentElement ?? document.body).append(slot);
  const room = bar.getAttribute("data-room");
  const drawnBar = () => [...document.querySelectorAll("header.gn")].find((e) => e.getClientRects().length > 0 && !e.closest("[inert]"));
  // A keyboard on Back or Next as the shell goes: its focus falls away with the slot, and it comes back to the same control, the same node.
  let left: { on: HTMLElement; at: number } | null = null;
  slot.addEventListener("focusout", (e) => { left = !e.relatedTarget && e.target instanceof HTMLElement ? { on: e.target, at: performance.now() } : null; });
  const toHome = () => {
    if (slot.isConnected) return;
    const drawn = drawnBar();
    if (!drawn) return;
    (drawn.parentElement ?? document.body).append(slot);
    rehomed();
    if (left && performance.now() - left.at < 1000 && (!document.activeElement || document.activeElement === document.body)) left.on.focus({ preventScroll: true });
    left = null;
  };
  const home = new MutationObserver(toHome);
  home.observe(document.body, { childList: true, subtree: true });
  toHome(); // This chunk can land after the swap, with `bar` already gone.
  // × ends the tour: focus goes to the bar's menu button (the page's own way on), never to the page's body.
  const onEnd = () => { home.disconnect(); slot.remove(); (drawnBar() ?? bar).querySelector<HTMLElement>(".gm-btn")?.focus(); };
  createRoot(slot).render(<TourPill at={at} room={room === "back" ? "back" : undefined} onEnd={onEnd} />);
}

/** Every line of text on the page near the window (its rects, as drawn now): what the pill must not sit on. */
function textLines(skip: Element): DOMRect[] {
  const out: DOMRect[] = [];
  const reach = innerHeight + 400, clipped = clippedOut();
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (t) => {
      const el = t.parentElement;
      if (!el || !(t.textContent ?? "").trim() || skip.contains(el)) return NodeFilter.FILTER_REJECT;
      const r = el.getBoundingClientRect();
      return r.bottom > -400 && r.top < reach ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  for (let t = walk.nextNode(); t; t = walk.nextNode()) {
    const cs = getComputedStyle(t.parentElement!);
    if (cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
    const range = document.createRange(); range.selectNodeContents(t);
    for (const r of range.getClientRects()) if (r.width > 1 && !clipped(t.parentElement!, r)) out.push(r);
  }
  return out;
}

/** Would an edge at `y` cut this line's letters? A line's box carries its face's leading above the capitals and below
 *  the descenders (15% each way at the display sizes: the haggle's h1 box is 124–197 for letters at ~140–190), so only
 *  the middle 70% counts. */
const cutAt = (r: DOMRect, y: number): boolean => r.top + r.height * 0.15 < y && r.bottom - r.height * 0.15 > y;

/** The lit card of a stop (the deal card, on the Desk and on the haggle): the pill never sits on it, text or not
 *  (S1-11; Round 4's design judge, fix 5: "the pill straddles the haggle's deal card"). */
const LIT = ".dk-deal2, .hg-end";
/** S1-13: a chart's canvas (the ledger's week, the haggle's ladder): on a wide screen the pill never sits on its plot. */
const CHARTS = ".lx-chart-canvas canvas, .hg-chart canvas, .ag-charts-swapchain canvas";
/** Her own scroll: a wheel, a swipe, or a key that scrolls (Tab only moves focus, which the scroll-padding keeps clear). */
const HERS = ["wheel", "touchmove", "keydown"] as const;
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);
/** `--s-3` where the card sits (24 px): the space between the bar and a card the stop lands on. */
const gap = (el: Element): number => parseFloat(getComputedStyle(el).getPropertyValue("--s-3")) || 24;
/** --s-1: the air a landed card keeps above the pill. */
const air = (el: Element): number => parseFloat(getComputedStyle(el).getPropertyValue("--s-1")) || 8;

/** Does a box (the pill's place, with the page scrolled `by` px further) sit on no line of text and no lit card? */
function clearAt(box: { top: number; bottom: number; left: number; right: number }, lines: readonly DOMRect[], lit: readonly DOMRect[], by = 0): boolean {
  const hit = (r: DOMRect, pad: number) => r.bottom - by > box.top + pad && r.top - by < box.bottom - pad && r.right > box.left && r.left < box.right;
  return !lines.some((r) => hit(r, 1)) && !lit.some((r) => hit(r, -2));
}

/** The pill's places on a wide screen (S1-9; the Round 3 design judge: "the 1440 pill covers card captions"): centred on
 *  the column first, then on the column's left or right edge, whichever sits on no text when a stop lands. S1-11: each
 *  may rise up to --s-2 (16 px) off its --s-4 foot, in 4 px steps, to sit in the gap between two lines (the proof's "3 px").
 *  A phone's strip stays on the bottom edge. */
const SLOTS = ["mid", "start", "end"] as const;
type Slot = typeof SLOTS[number];
const RISES = [0, 4, 8, 12, 16] as const;
/** S1-11: when no place is clear at landing, the page may step down once, at most this far, so the words under the pill
 *  come up above it (the haggle's deal card at 1440×900), never cutting a line at the bar's edge or the page's heading. */
const NUDGE_MAX = 160;

export function TourPill({ at: start, room, onEnd }: { at: number; room?: "back" | undefined; onEnd: () => void }) {
  const [at, setAt] = useState(start);
  const [gone, setGone] = useState(false);
  const [slot, setSlot] = useState<Slot>("mid");
  const [rise, setRise] = useState(0);
  const ref = useRef<HTMLElement>(null);
  // Where it sits once the stop has landed: kept where it is while that place is clear; else the first clear place (a
  // slot, then a rise); else, on a wide screen, the page steps down once by the least that clears a place (S1-11); else
  // the centre. Asked as the page settles (its data and fonts arrive after the bar) and when the landing's scroll ends,
  // for the first 2.5 s of each stop only, so it never moves while the visitor reads; the step only before she scrolls.
  useLayoutEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const t0 = performance.now();
    let stepped = false, landed = false, tops = 0, straddles = 0;
    // S1-13: "before she scrolls" is her own wheel, swipe or scrolling key, not a scroll position: on a stop the same page
    // opens by its hash (07 → 08 → 09), the Desk's landing scrolls after this effect starts, and that is not hers.
    let hers = false, lastScroll = 0;
    const mark = (e: Event) => { if (!(e instanceof KeyboardEvent) || SCROLL_KEYS.has(e.key)) hers = true; };
    const moved = () => { lastScroll = performance.now(); };
    /** No scroll for a moment (the page's own landing, smooth or not, has ended): only then does the pill move it. */
    const quiet = () => performance.now() - lastScroll > 150;
    const stop = TOUR[at];
    const goal = stop?.land;
    const put = (s: Slot, r: number) => { nav.dataset.slot = s; nav.style.setProperty("--tp-rise", `${r}px`); };
    const box = (s: Slot, r: number) => { put(s, r); const b = nav.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
    const place = (): void => {
      if (nav.getClientRects().length === 0) return; // S1-12: yielded to an open sheet (tour-pill.css); nothing to place
      const phone = matchMedia("(max-width: 720px)").matches;
      // S1-13 (the DD at S1-12): on a wide screen a stop may land on a card with its top --s-3 under the bar (stop 10's
      // chart, so its plot ends above the pill). Again if the page settles under it (its data and fonts), at most twice.
      const card = !phone && stop?.landTop ? document.querySelector<HTMLElement>(stop.landTop) : null;
      if (card && card.getClientRects().length > 0 && !hers && quiet() && tops < 3) {
        // Its top --s-3 under the bar, moved the least that cuts no line at the bar's edge, the card still whole and
        // --s-1 of air above the pill (the DD's nit at S1-13 part 1: it ended 1 px above it).
        const top = viewTop(), r = card.getBoundingClientRect(), y0 = Math.round(scrollY);
        const want = Math.round(r.top + y0 - top - gap(card));
        const foot = Math.ceil(r.bottom + y0 - (nav.getBoundingClientRect().top - air(card))), hi = Math.floor(r.top + y0 - top), spans = edgeSpans();
        let y = clearScroll(want, foot, hi, spans, top, top, 40) ?? want;
        // S1-13 part 2: a card shorter than the room (stop 10's, since AS-15 halved it) leaves the next section's words
        // under every place the pill can take. Then its foot lands --s-1 above the pill: the gap after it is the pill's.
        const lines = textLines(nav), lit = [...document.querySelectorAll(`${LIT}, ${CHARTS}`)].map((e) => e.getBoundingClientRect()).filter((b) => b.height > 0);
        const free = (to: number) => RISES.some((k) => SLOTS.some((x) => clearAt(box(x, k), lines, lit, to - y0)));
        const max = document.documentElement.scrollHeight - innerHeight;
        if (!free(y) && foot <= max) { const low = clearScroll(foot, foot, Math.min(hi, max), spans, top, top, 40); if (low !== null && free(low)) y = low; }
        if (Math.abs(y - y0) > 1) { tops++; scrollTo({ top: y, behavior: "instant" }); }
        landed = true;
      }
      // The stop's own target first (S1-11): wholly between the bar and the pill, by the least step down that cuts no
      // line at the window's top edge. Once, at landing, before she scrolls.
      const target = goal && !landed ? document.querySelector(goal) : null;
      if (target && !hers && quiet()) {
        landed = true;
        if (!wholeInView([target])) {
          const top = viewTop(), floor = nav.getBoundingClientRect().top - 16, all = textLines(nav);
          let by = Math.ceil(target.getBoundingClientRect().bottom - floor);
          while (by < 400 && all.some((r) => cutAt(r, top + by))) by += 2;
          if (by > 0 && target.getBoundingClientRect().top - by >= top) scrollBy({ top: by, behavior: "instant" });
        }
      }
      // S1-13 (the DD's straddle rule, system.md §4): on a phone the strip's top edge never cuts a text line or a control
      // at landing. Once the stop's page has landed and its scroll is still, the page moves the least that leaves each
      // wholly above or wholly under, cutting nothing at the window's top either, with the stop's subject and the focused
      // control kept whole. Once a stop, before she scrolls.
      // Nov 4: not once but up to three moves, each only while something is cut: a lazy block or a room's data can draw
      // after the first look (the Desk's challenge under the hero, Behind the scenes' figures) and move what the edges cut.
      if (phone && straddles < 3 && !hers && quiet() && performance.now() - t0 >= 300) {
        const floor = nav.getBoundingClientRect().top, top = viewTop();
        const spans = edgeSpans();
        if (spans.some((s) => cuts(s, scrollY + floor) || cuts(s, scrollY + top))) {
          // The focused control, not a heading the pill focused on arrival (03's h1, read by a screen reader, not pressed).
          const focus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body && !nav.contains(document.activeElement) && !document.activeElement.hasAttribute("data-tp-head") ? document.activeElement : null;
          const keep = [...(stop?.subject.phone ?? []).map((s) => document.querySelector(s)), focus].filter((e): e is Element => !!e && e.getClientRects().length > 0).map((e) => e.getBoundingClientRect());
          const max = document.documentElement.scrollHeight - innerHeight;
          // What must stay whole, when it can: it fits between the edges, whether or not it is there yet (the Desk's landing
          // may have been measured before this strip drew, which takes 58 px off the window).
          const whole = keep.length > 0 && Math.max(...keep.map((r) => r.bottom)) - Math.min(...keep.map((r) => r.top)) <= floor - top;
          const hi = whole && keep.length ? Math.min(max, Math.floor(Math.min(...keep.map((r) => r.top)) + scrollY - top)) : max;
          const lo = whole && keep.length ? Math.max(0, Math.ceil(Math.max(...keep.map((r) => r.bottom)) + scrollY - floor)) : 0;
          // S1-13 part 2: with the bar sticky, a short room can leave no clear landing with its subject whole (stop 05's
          // "Your name" at 390x844); then the subject stays whole and the edge cuts the fewest lines it can.
          const y = clearScroll(Math.round(scrollY), lo, hi, spans, top, floor) ?? leastCut(Math.round(scrollY), lo, hi, spans, top, floor);
          if (y !== Math.round(scrollY)) { straddles++; scrollTo({ top: y, behavior: "instant" }); }
        }
      }
      const was = (nav.dataset.slot as Slot) || "mid", wasRise = Number(nav.style.getPropertyValue("--tp-rise").replace("px", "")) || 0;
      const lines = textLines(nav);
      // S1-13 (the DD at S1-12: "a canvas is judged by its plot, not passed as a box"): on a wide screen a chart's canvas
      // is a lit card too, so the pill never sits on a plot mark or label (the canvas holds the whole plot).
      const lit = [...document.querySelectorAll(phone ? LIT : `${LIT}, ${CHARTS}`)].map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0);
      const keep = (s: Slot, r: number) => { put(s, r); setSlot(s); setRise(r); };
      if (clearAt(box(was, wasRise), lines, lit)) return keep(was, wasRise);
      const tries = phone ? [["mid", 0] as const] : RISES.flatMap((r) => SLOTS.map((x) => [x, r] as const));
      const found = tries.find(([x, r]) => clearAt(box(x, r), lines, lit));
      if (found) return keep(found[0], found[1]);
      // No place is clear: step the page down once, by the least that clears one, if she hasn't scrolled yet. Never on a
      // phone (the bar there scrolls away, so any step cuts it), never past the page's end, never cutting a line at the
      // bar's edge, never taking the page's heading off screen.
      if (!phone && !stepped && !hers && quiet()) {
        const top = viewTop(), room = document.documentElement.scrollHeight - innerHeight - scrollY;
        const h1 = document.querySelector("main h1, h1")?.getBoundingClientRect();
        // Nor the stop's own subject under the bar (push 7, 1440: the landing's links under the pill stepped the Watcher's
        // Ask box 98 px up, to 21 px under the bar): the step stops where the subject's top meets the bar.
        const subject = (stop?.subject.wide ?? []).map((s) => document.querySelector(s)).filter((e): e is Element => !!e && e.getClientRects().length > 0).map((e) => e.getBoundingClientRect());
        const clearOfBar = subject.length ? Math.floor(Math.min(...subject.map((r) => r.top)) - top) : Infinity;
        for (let by = 4; by <= Math.min(NUDGE_MAX, room, clearOfBar); by += 2) {
          if (lines.some((r) => cutAt(r, top + by))) continue;
          if (h1 && h1.height > 0 && h1.top >= top && h1.top - by < top) break;
          const at = SLOTS.find((x) => clearAt(box(x, 0), lines, lit, by));
          if (at) { stepped = true; keep(at, 0); scrollBy({ top: by, behavior: "instant" }); return; }
        }
        // None down: step up instead, by the least that clears a place, the subject kept wholly above the pill (the words
        // under the pill go down past it). Never above the page's top, never cutting a line at the bar's edge.
        const pillTop = box("mid", 0).top;
        const clearOfPill = subject.length ? Math.floor(pillTop - Math.max(...subject.map((r) => r.bottom))) : 0;
        for (let by = 4; by <= Math.min(NUDGE_MAX, Math.floor(scrollY), clearOfPill); by += 2) {
          if (lines.some((r) => cutAt(r, top - by))) continue;
          const at = SLOTS.find((x) => clearAt(box(x, 0), lines, lit, -by));
          if (at) { stepped = true; keep(at, 0); scrollBy({ top: -by, behavior: "instant" }); return; }
        }
      }
      keep("mid", 0);
    };
    place();
    const ts = [300, 900, 1800, 2400].map((ms) => window.setTimeout(place, ms));
    const end = window.setTimeout(() => removeEventListener("scrollend", place), 2500);
    addEventListener("scrollend", place);
    addEventListener("scroll", moved, { passive: true });
    HERS.forEach((e) => addEventListener(e, mark, { passive: true }));
    return () => {
      ts.forEach(clearTimeout); clearTimeout(end);
      removeEventListener("scrollend", place); removeEventListener("scroll", moved);
      HERS.forEach((e) => removeEventListener(e, mark));
    };
  }, [at]);
  // S1-13 (Lead-10): a stop whose page focuses nothing on arrival (03, the classic page) has its heading focused here,
  // as the Desk's rooms focus theirs (05, 07, 09), so a screen reader names where the move went. Only on the stop's own
  // address, and never taken from anything she is on. A heading focused by script shows no ring (the DD, 08:40).
  useEffect(() => {
    const s = TOUR[at];
    if (!s?.focus) return;
    const here = new URL(app(s.href), location.href);
    if (root(here.pathname) !== root(location.pathname) || here.search !== location.search) return;
    const h = document.querySelector<HTMLElement>(s.focus);
    if (!h || (document.activeElement && document.activeElement !== document.body)) return;
    if (!h.hasAttribute("tabindex")) h.tabIndex = -1;
    h.dataset.tpHead = "";
    h.focus({ preventScroll: true });
  }, [at]);
  useEffect(() => { if (ref.current) { ref.current.dataset.slot = slot; ref.current.style.setProperty("--tp-rise", `${rise}px`); } }, [slot, rise]);
  // S1-13 (the DD's 06:25 ruling): Track R's page-wide state line (.st-strip: offline, waking, updated) stands at the
  // window's foot. On a wide screen the pill rises by its height while it shows, so neither covers the other (on a
  // phone the line sits on the strip, states.css). Read from the line's own box, so its words can be any length.
  useEffect(() => {
    let strip: Element | null = null;
    const lift = () => {
      const nav = ref.current;
      if (!nav) return;
      const h = Math.round(strip && !(strip as HTMLElement).hidden ? strip.getBoundingClientRect().height : 0);
      if (nav.style.getPropertyValue("--tp-lift") === `${h}px`) return;
      nav.style.setProperty("--tp-lift", `${h}px`);
      // Risen, it may sit on words it cleared at landing: the first clear place again (a slot, then a rise), else where
      // it was. No scroll: she may be reading (S1-13's reviewer).
      if (matchMedia("(max-width: 720px)").matches || nav.getClientRects().length === 0) return;
      const lines = textLines(nav), lit = [...document.querySelectorAll(`${LIT}, ${CHARTS}`)].map((e) => e.getBoundingClientRect()).filter((b) => b.height > 0);
      const at = (s: Slot, r: number) => { nav.dataset.slot = s; nav.style.setProperty("--tp-rise", `${r}px`); const b = nav.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
      const was = [(nav.dataset.slot as Slot) || "mid", Number(nav.style.getPropertyValue("--tp-rise").replace("px", "")) || 0] as const;
      if (clearAt(at(was[0], was[1]), lines, lit)) return;
      const found = RISES.flatMap((r) => SLOTS.map((x) => [x, r] as const)).find(([x, r]) => clearAt(at(x, r), lines, lit)) ?? was;
      at(found[0], found[1]); setSlot(found[0]); setRise(found[1]);
    };
    const size = new ResizeObserver(lift), flag = new MutationObserver(lift);
    const find = () => {
      const s = document.querySelector(".st-strip");
      if (s === strip) return;
      strip = s;
      size.disconnect(); flag.disconnect();
      if (s) { size.observe(s); flag.observe(s, { attributes: true, attributeFilter: ["hidden"] }); }
      lift();
    };
    const body = new MutationObserver(find);
    body.observe(document.body, { childList: true });
    rehomed = find;
    find();
    return () => { rehomed = () => {}; body.disconnect(); size.disconnect(); flag.disconnect(); };
  }, []);
  // Round 5's shopper seat, B3: the pill is last in Tab order (S1-9), so a keyboard took up to 57 Tabs to reach Next, 256 over the
  // tour. A stop's landing often holds focus partway down its page, where a link beside the skip link can't be reached, so it's put
  // right after wherever focus is at her first Tab: that Tab lands on it. Hidden until focused; the page's order is otherwise as it was.
  useEffect(() => {
    if (gone) return;
    const to = near(at, 1);
    const a = document.createElement("a");
    a.className = "tp-jump";
    // The top layer: it lands inside whatever holds focus, and a page's own stacking mustn't cover it (the classic page's h1 did).
    a.setAttribute("popover", "manual");
    a.href = app(to >= 0 ? TOUR[to]!.href : TOUR_HREF);
    a.textContent = to >= 0 ? `Next stop: ${TOUR[to]!.name}` : "Finish the tour";
    if (to >= 0) a.addEventListener("click", (e) => go(to)(e as unknown as MouseEvent<HTMLAnchorElement>));
    else a.addEventListener("click", () => unfollow());
    const first = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || e.shiftKey) return;
      removeEventListener("keydown", first, true);
      const on = document.activeElement;
      if (on && on !== document.body && !on.closest(".tp")) { on.after(a); if (a.isConnected) a.showPopover?.(); return; }
      // Nothing holds focus, but the browser's Tab doesn't start at the top: it starts where a #fragment left it (stop 01's
      // #challenge, drawn at first paint since 3d), so no place in the page's order is sure to be next. So this Tab is moved
      // by hand. The link stands just before the stop's own target, so the Tab after it reaches what the stop is about.
      const land = TOUR[at]?.land ? document.querySelector(TOUR[at]!.land!) : null;
      if (land && land.getClientRects().length > 0) land.before(a);
      // The one drawn: on the React pages the markup page's bar is still in the document, hidden.
      else [...document.querySelectorAll(".gn-skip")].find((e) => e.getClientRects().length > 0)?.after(a);
      if (!a.isConnected) return;
      a.showPopover?.();
      e.preventDefault();
      a.focus({ preventScroll: true });
    };
    addEventListener("keydown", first, true);
    return () => { removeEventListener("keydown", first, true); a.remove(); };
  }, [at, gone]);
  if (gone) return null;
  const stop = TOUR[at]!;
  const back = near(at, -1), next = near(at, 1);
  /** A side page: no stop opens this file (every stop is on the app's own page, `/`); the visitor followed a link off it. */
  const side = !!stop.href && root(new URL(app(stop.href), location.href).pathname) !== root(location.pathname);
  /** Going to a stop from here is the tour's own button: it ticks the stop and moves this tab's place to it. */
  // The link is followed by hand: were the place to change first, React would redraw the link before the browser
  // reads its address, and the tap would open the stop after. A modified click (a new tab) is left to the browser.
  const go = (i: number) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    writeTicks([...new Set([...parseTicks(readTicksRaw()), TOUR[i]!.id])]);
    follow(i);
    location.assign(app(TOUR[i]!.href));
    setAt(i);
  };
  const end = () => { unfollow(); setGone(true); onEnd(); };
  return (
    <nav ref={ref} className="tp" data-room={room} data-slot={slot} aria-label="Judge tour">
      {/* S1-12: on a side page "Back to 06" is the one way back, so no second back arrow (to 05) beside it. */}
      {side ? <span className="tp-back" aria-hidden="true" /> : back >= 0
        ? <a className="tp-back" href={app(TOUR[back]!.href)} onClick={go(back)} aria-label={`Back: ${TOUR[back]!.name}`}><span aria-hidden="true">‹</span></a>
        : <span className="tp-back" aria-hidden="true">‹</span>}
      {/* S1-9: the stop's name beside its number ("02 · The Watcher"; Round 3's consumer). Its accessible name is its
          visible words, then the rest (Round 3's a11y fix 1, Label in Name): no aria-label. On a phone "Judge tour" and
          "of N" leave the strip and the name, and .tp-tail says them after the visible words (Round 4's a11y fix 3). */}
      {/* S1-12 (W-6's visual reviewer, a REAL): on a page that is no stop's own (safe.html, reached from the wallet's
          "How Goose keeps you safe"), "06 · Approve in PayPal" named a page she wasn't on. There it says where it goes:
          "Back to 06 · Approve in PayPal", and goes back to that stop. */}
      {side
        ? <a className="tp-home tp-side" href={app(stop.href)}>
            <span className="tp-k">Judge tour<span className="tp-dot" aria-hidden="true">·</span></span><span className="tp-ret">Back to</span><span className="tp-n">{pad(at + 1)}</span><span className="tp-dot" aria-hidden="true">·</span><span className="tp-name">{stop.short}</span><span className="tp-sr">, judge tour, {at + 1} of {TOUR.length}: {stop.name}</span>
          </a>
        : <a className="tp-home" href={app(TOUR_HREF)}>
            <span className="tp-k">Judge tour<span className="tp-dot" aria-hidden="true">·</span></span><span className="tp-n">{pad(at + 1)}</span><span className="tp-of">&nbsp;of {TOUR.length}</span><span className="tp-dot" aria-hidden="true">·</span><span className="tp-name">{stop.short}</span><span className="tp-tail">, judge tour, {at + 1} of {TOUR.length}</span><span className="tp-sr">: {stop.name}. Back to the tour</span>
          </a>}
      {next >= 0
        ? <a className="tp-next" href={app(TOUR[next]!.href)} onClick={go(next)}>Next<span className="tp-sr">: {TOUR[next]!.name}</span> <span aria-hidden="true">›</span></a>
        : <a className="tp-next" href={app(TOUR_HREF)} onClick={() => unfollow()}>Finish <span aria-hidden="true">›</span></a>}
      <button type="button" className="tp-end" onClick={end} aria-label="End the tour here"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2.5 2.5 7 7m0-7-7 7" /></svg></button>
    </nav>
  );
}

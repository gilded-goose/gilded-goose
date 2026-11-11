// Where a menu item lands on its page (S1-3; the Round 0 design judge: "three menu items (Approve in PayPal, Pay Later,
// After you pay) land on the identical `?wallet=1` screen with no anchor"). After you pay is a Desk room of its own; the
// other two land on the wallet with their own anchor (`MENU_ANCHORS` in core's menu-hash.ts), and this finds the spot.
// Each anchor names its own id first (for when the wallet gives the spot one) and then the wallet's markup today: the
// Approve button, and PayPal's own Pay Later message under it. PayPal writes that message after first paint and only
// when it sends one, so Pay Later waits for it a moment and otherwise lands on the Approve it sits beside.
//
// Also the bar's glass: the menu button sits in every page's bar (SiteNav, and the markup bars of the wallet, the
// classic page, the market and safe.html), so it is the one place that marks its bar as scrolled.

import { MENU_ANCHORS } from "@goose/core/menu-hash";
import { wholeInView } from "./in-view.ts";
import { following } from "../tour/follow.ts";

let started = false;
let stop: (() => void) | null = null;

/** The address's anchor. A malformed one (`#%`) names nothing: it's anyone's typed address, and it must not throw. */
export const hashNow = (): string => { try { return decodeURIComponent(location.hash.slice(1)); } catch { return ""; } };

/** On load: lands on the address's anchor, and again whenever the hash changes (Back, Forward, a typed hash). */
export function landOnAnchor(): void {
  if (started) return;
  started = true;
  addEventListener("hashchange", () => landOn(hashNow()));
  landOn(hashNow());
}

/** Is this menu address one of this page's own anchors? Then the menu lands on it in place (a hash-only link would
 *  neither reload the page nor scroll, since the spots are classes, not ids). Returns the anchor's id. */
export function anchorHere(href: string): string | null {
  const u = new URL(href, location.href);
  if (u.pathname !== location.pathname || u.search !== location.search) return null;
  const id = decodeURIComponent(u.hash.slice(1));
  return MENU_ANCHORS.some((a) => a.id === id) ? id : null;
}

/** Scrolls the anchor's spot into view. Focus goes beside Approve, never on it (Round 5's shopper seat, as App.tsx's toCart): focus on a
 *  pay control is a press waiting for a stray Enter, and Enter on the tour's Next then Enter again would start the PayPal flow. */
export function landOn(id: string): void {
  stop?.();
  stop = null;
  const spot = MENU_ANCHORS.find((a) => a.id === id);
  if (!spot) return;
  const find = (sel: readonly string[]) => sel.map((s) => document.querySelector<HTMLElement>(s)).find((e) => e && e.getClientRects().length > 0) ?? null;
  const go = (el: HTMLElement) => {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // S1-9 (the DD, system.md §5): scroll only when the spot isn't wholly in view between the bar and the foot.
    if (!wholeInView([el])) el.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
    const to = el.matches("button, a[href]") ? el.parentElement! : el;
    if (!to.matches("[tabindex]")) to.tabIndex = -1;
    to.focus({ preventScroll: true });
  };
  const own = find(spot.find);
  if (own) { stop = afterPill(() => go(own)); return; }
  // Not drawn yet (PayPal's message comes after first paint): wait a moment for it, then land beside it.
  // (Also the wallet's Settings tab: the hash moves it to the Desk tab, and Approve is drawn a moment later.)
  const end = () => { mo.disconnect(); clearTimeout(t); stop = null; };
  const mo = new MutationObserver(() => { const el = find(spot.find); if (el) { end(); stop = afterPill(() => go(el)); } });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  const t = setTimeout(() => { end(); const el = find(spot.fallback); if (el) stop = afterPill(() => go(el)); }, spot.wait);
  stop = end;
}

/** S1-12 (the DD at W-6): while this tab is on the judge tour, a landing waits for the tour's pill (its own chunk, a
 *  moment after the page), because the room the pill takes only exists once it is drawn: the page's foot grows by its
 *  height and the scroll-padding keeps a focused control above it (tour-pill.css). Landing before that, near a page's
 *  end the spot could not scroll up far enough and the pill then arrived on it. At most PILL_WAIT ms, then it lands.
 *  If she scrolls meanwhile, or a newer landing starts, it doesn't land (never pulls the page back). Returns its cancel. */
const PILL_WAIT = 2000;
function afterPill(run: () => void): (() => void) | null {
  const tour = following() !== null && new URLSearchParams(location.search).get("desk") !== "tour";
  if (!tour || document.querySelector(".tp")) { run(); return null; }
  // Her own scroll (a wheel, a swipe, a key), not the browser's jump to the address's #id, which may come meanwhile.
  const t0 = performance.now(), hers = ["wheel", "touchmove", "keydown"] as const;
  let f = 0, moved = false;
  const mark = () => { moved = true; };
  const quit = () => { cancelAnimationFrame(f); hers.forEach((e) => removeEventListener(e, mark)); stop = null; };
  const done = () => { quit(); if (!moved) run(); };
  const look = () => {
    if (document.querySelector(".tp")) f = requestAnimationFrame(done); // its stylesheet came with its chunk: one frame to lay out
    else if (performance.now() - t0 > PILL_WAIT) done();
    else f = requestAnimationFrame(look);
  };
  hers.forEach((e) => addEventListener(e, mark, { passive: true }));
  f = requestAnimationFrame(look);
  return quit;
}

/** Glass once the page scrolls under the bar (system.md section 6): `data-scrolled` on the bar this button sits in. */
export function markScrolled(btn: HTMLElement | null): (() => void) | undefined {
  const nav = btn?.closest<HTMLElement>("header.gn");
  if (!nav) return undefined;
  const on = () => { const s = scrollY > 8; if ((nav.dataset.scrolled === "1") !== s) { if (s) nav.dataset.scrolled = "1"; else delete nav.dataset.scrolled; } };
  addEventListener("scroll", on, { passive: true });
  on();
  return () => removeEventListener("scroll", on);
}

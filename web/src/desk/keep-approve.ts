// Approve stays on screen (Lead-10, Nov 4; Track T saw it). A fold on the deal card (Goose's read, Before you approve, what
// happens after the tap) opens downward, and at 1440 by 900 Goose's read alone pushed Approve 14 px off the bottom of the
// frame. So opening one scrolls just enough to bring Approve back, and never so far that the fold's own top goes under the
// bar: what was just opened stays where it can be read. Nothing here presses or changes anything but the scroll.
// `node scripts/approve-hold.ts` holds this at both widths.
//
// It starts from the click, not from the toggle alone: "What happens after your tap" mounts open, and that fires toggle too,
// which would scroll the page by itself when a deal lands. A key on a summary is a click as well.

import type { MouseEvent } from "react";

/** Room under Approve, so it never sits flush on the frame's edge, and above the fold's top. */
const ROOM = 16;

/** How far down the bars reach once stuck: the sticky bar, and a phone's "Your deal $84.00" pin under it. Its height, not its
 *  rect: until it sticks, a pin's rect says where it sits on the page. */
function barsFoot(el: Element): number {
  return (parseFloat(getComputedStyle(el).getPropertyValue("--nav-h")) || 0) + (document.querySelector<HTMLElement>(".sm-pin")?.offsetHeight ?? 0);
}

/**
 * Round 5, the DD's B1: on a phone the run ended with the price pinned and Approve 144 to 321 px below the frame, so the payoff
 * named a deal and gave no way to take it. Where the page should sit so the whole card (the shield line and the deal) starts
 * just under the bar, or null when there's no Approve to show or it's already wholly in the frame. Only the bar: the price pin
 * stays hidden while the price is on screen. On a phone too short for both, Approve wins over the card's top.
 *
 * Round 6b, the design review's B1 (Fri Nov 6): with Approve already in the frame this said null, so the page stayed where the
 * run's own scrolls had left it, and at 390 by 844 the bar's edge cut through TixQuack's gift-card note. Now the landing is
 * always a clean edge, the way replayCase's `fits` is: the highest of the run's blocks (its heading, the sellers' frame, each
 * seller's row, the card) from which the whole card still fits in the frame, so the note sits whole above the deal when they
 * fit together, and otherwise the card's top under the bar. Null only when there's no deal. `node scripts/run-landing.ts`.
 */
export function dealLanding(): number | null {
  const approve = document.querySelector(".dk-deal2 .dk-approve"), card = approve?.closest(".dk-right");
  if (!card || !approve) return null;
  const bar = parseFloat(getComputedStyle(card).getPropertyValue("--nav-h")) || 0;
  // Where each sits on the page, without an `arrive` still in flight (its translateY isn't where it will rest).
  const at = (el: Element, edge: "top" | "bottom") => {
    const t = getComputedStyle(el).transform;
    return el.getBoundingClientRect()[edge] - (t === "none" ? 0 : new DOMMatrixReadOnly(t).m42) + scrollY;
  };
  const end = at(card, "bottom") + ROOM - innerHeight; // the least scroll that shows the whole card
  // A frame's own edge lands ROOM under the bar; a row inside the sellers' frame lands flush, its top rule the edge.
  const edges = [
    ...[".dk[data-app] .dk-live-head", ".dk[data-app] .dk-live-grid > .dk-feed"].flatMap((s) => [...document.querySelectorAll(s)].map((el) => at(el, "top") - bar - ROOM)),
    ...[...document.querySelectorAll(".dk[data-app] .dk-live-grid > .dk-feed > .dk-fr:not(:first-child)")].map((el) => at(el, "top") - bar),
  ].sort((a, b) => a - b);
  const top = at(card, "top") - bar - ROOM;
  const clean = edges.find((y) => y >= end && y < top) ?? top;
  return Math.max(0, Math.round(Math.max(clean, approve.getBoundingClientRect().bottom + scrollY + ROOM - innerHeight)));
}

/** Scrolls to dealLanding's place; false when there's no deal. The page can end short of that place when the run finishes,
 *  until what follows the card (its own chunk) draws: the browser stops the scroll at the page's end, and at 390 by 844 that left
 *  the note cut, just as before. So it lands again once the page has room, for up to 3 s, never after her own scroll or tap. */
export function landDeal(behavior: ScrollBehavior, hers: () => boolean): boolean {
  const y = dealLanding();
  if (y === null) return false;
  scrollTo({ top: y, behavior });
  if (y <= document.documentElement.scrollHeight - innerHeight) return true;
  const grown = new ResizeObserver(() => {
    if (hers()) return stop();
    if (document.documentElement.scrollHeight - innerHeight < y) return;
    stop();
    scrollTo({ top: dealLanding() ?? y, behavior });
  });
  const late = setTimeout(stop, 3000);
  function stop() { grown.disconnect(); clearTimeout(late); }
  grown.observe(document.body);
  return true;
}

export function keepApproveInView(e: MouseEvent<HTMLElement>): void {
  const fold = (e.target as Element).closest("summary")?.parentElement as HTMLDetailsElement | null | undefined;
  if (!fold) return;
  const card = e.currentTarget;
  fold.addEventListener("toggle", () => {
    const approve = card.querySelector(".dk-approve");
    if (!fold.open || !approve) return;
    // The tour's pill can sit over the frame's foot on a stop; its top is then the floor.
    const floor = Math.min(innerHeight, document.querySelector(".tp")?.getBoundingClientRect().top ?? innerHeight);
    const over = approve.getBoundingClientRect().bottom + ROOM - floor;
    if (over <= 0) return;
    const by = Math.min(over, fold.getBoundingClientRect().top - barsFoot(card) - ROOM);
    if (by > 0) scrollBy({ top: by, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, { once: true });
}

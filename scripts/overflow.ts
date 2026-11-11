/// <reference lib="dom" />
// Nothing on the page may run off the side (Joshua, 2026-10-23: the phone's chips and note ran off the right edge
// while the page itself never scrolled sideways, so the page-width check passed). Two ways to fail:
//   - a visible element reaches past the left or right edge of the window;
//   - a box holds more than it shows sideways: an input or textarea whose end is cut off, a row you'd have to
//     swipe, or a row whose last chip pokes out past its own panel while still inside the window.
// Content behind a closed <details> is measured too: every fold is opened, measured and closed again, since a
// visitor can open it. Returns one line per problem, at most 5; empty when the page fits.

import type { Page } from "playwright";

export async function overflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const out: string[] = [];
    const shut = [...document.querySelectorAll("details:not([open])")] as HTMLDetailsElement[];
    const name = (el: Element) => {
      const text = (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : el.textContent ?? "").trim().slice(0, 30);
      return `<${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.split(" ")[0]}` : ""}> "${text}"`;
    };
    const measure = (when: string) => {
      if (document.documentElement.scrollWidth > w) out.push(`${when}the page scrolls sideways by ${document.documentElement.scrollWidth - w}px`);
      for (const el of document.querySelectorAll("body *")) {
        // Inside a closed fold nothing is seen (Chrome still lays it out), so it's measured on the open pass only.
        if (el.closest("details:not([open]) > :not(summary)")) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden") continue;
        // Text kept for screen readers only (a 1 px clipped box, like the wallet's .vh) is never seen, so never spills.
        if (r.width <= 1 && r.height <= 1) continue;
        if (r.right > w + 0.5 || r.left < -0.5) { out.push(`${when}${name(el)} runs from ${Math.round(r.left)} to ${Math.round(r.right)}px in a ${w}px window`); continue; }
        // scrollWidth counts children that spill out even when overflow is visible; inline boxes report 0 and are skipped.
        if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) out.push(`${when}${name(el)} holds ${el.scrollWidth - el.clientWidth}px more than it shows`);
      }
    };
    measure("");
    if (shut.length) {
      for (const d of shut) d.open = true;
      measure("opened: ");
      for (const d of shut) d.open = false;
    }
    return [...new Set(out)].slice(0, 5);
  });
}

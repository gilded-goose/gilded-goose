// The judge tour follows the visitor (S1-6; Round 2's consumer, worst moment 3: a stop's button dropped them on the
// landing "with the tour gone": no "01 of N", no way back). A stop's button marks this tab as on the tour, at that stop
// (sessionStorage: this tab only, gone when it closes), and every page's bar, through its menu button, draws the tour's
// small stepper (TourPill.tsx, its own chunk) while the mark is there. The ticks stay the tour's (localStorage).
// No imports: the menu button reads this on every page's first screen.

const AT = "goose_tour_at";
export const TICKS = "goose_tour";

/** The stop this tab is on (its place in the tour), or null when the tab isn't on the tour. */
export function following(): number | null {
  try {
    const v = sessionStorage.getItem(AT);
    const n = v === null ? NaN : Number(v);
    return Number.isInteger(n) && n >= 0 ? n : null;
  } catch { return null; }
}
export function follow(at: number): void { try { sessionStorage.setItem(AT, String(at)); } catch { /* private mode: the stepper stays on the tour page */ } }
export function unfollow(): void { try { sessionStorage.removeItem(AT); } catch { /* nothing kept */ } }

/** The tour's ticks, raw (the tour page and the stepper parse them with core's `parseTicks`). */
export function readTicksRaw(): string | null { try { return localStorage.getItem(TICKS); } catch { return null; } }
export function writeTicks(ids: readonly string[]): void { try { localStorage.setItem(TICKS, JSON.stringify(ids)); } catch { /* private mode: ticks last this visit */ } }

/** The menu button's hook: on a page that isn't the tour, with this tab on the tour, bring the stepper in under the bar. */
export function followUnder(bar: Element | null): void {
  if (!bar || following() === null) return;
  if (new URLSearchParams(location.search).get("desk") === "tour") return;
  void import("./TourPill.tsx").then((m) => m.mountPill(bar)).catch(() => { /* no stepper; the bar's Judge tour link still goes back */ });
}

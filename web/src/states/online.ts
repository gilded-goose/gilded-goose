// Track R: the browser's network flag as a React hook, in its own file so a surface (Haggle) can take it without the
// kit's blocks and CSS. index.ts re-exports it. R-11's class rule: no action that needs the network shows while this is false.
import { lazy, useEffect, useState, type ComponentType } from "react";

/** A part that couldn't come (its chunk lost, or it threw while drawing) says so: it raises the page-wide strip, "Part of this page
 *  didn't load." and Reload (mount.ts), and draws nothing in its own place, so no new words. Track P, Fri Nov 6: until then the
 *  default was a silent nothing, and only a lost chunk Vite itself reported reached the strip; a throw, or a loss before the strip
 *  was mounted, left a hole with no word (the ledger board's counter, the site's nav). The mark on <html> is for a strip mounted
 *  later (mountStates reads it), the event for one already up. */
export function PartLost(): null {
  useEffect(() => {
    document.documentElement.dataset.partLost = "";
    dispatchEvent(new Event("vite:preloadError"));
  }, []);
  return null;
}

/** React.lazy that can't empty the page. A plain lazy whose chunk is lost throws, and with nothing to catch it React unmounts
 *  everything: a stale tab after a release, or a shopper offline at the wrong second, lost her whole deal to one optional piece.
 *  `lost` draws in its place: PartLost by default, which names the loss in the page-wide strip with Reload. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyOr<T extends ComponentType<any>>(load: () => Promise<{ default: T }>, lost: ComponentType<any> = PartLost) {
  return lazy(() => load().catch(() => ({ default: lost as T })));
}

/** False while the browser says it has no network. */
export function useOnline(): boolean {
  const [on, setOn] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOn(navigator.onLine);
    addEventListener("online", up);
    addEventListener("offline", up);
    return () => { removeEventListener("online", up); removeEventListener("offline", up); };
  }, []);
  return on;
}

/** Back from PayPal can restore a page as she left it, its pay press still off. The one place that turns it back on: it's handed
 *  only what frees the button, so it can't press anything. */
export function useBackFromPayPal(free: () => void): void {
  useEffect(() => {
    const again = (e: PageTransitionEvent) => { if (e.persisted) free(); };
    addEventListener("pageshow", again);
    return () => removeEventListener("pageshow", again);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `free` only ever calls a state setter
  }, []);
}

// The one place the page shows a browser notification (Joshua, Nov 5 6:40 PM: the ping, Level 1). Both pings use it: the
// simulated week's replay (PingReplay.tsx) and the real watch (F's watcher). It shows nothing unless she allowed it, and
// the permission is asked only by the Set your price button (SetPrice.tsx). The words come from core; this file types
// none. Tapping it focuses the tab and opens what the caller says: it never buys, approves or reserves.

/** The notification on screen for each tag, so the row that showed it can take it back. */
const shown = new Map<string, Notification>();

/** Shows a notification with these words. False: not shown (no permission, or a browser that shows them only from a
 *  service worker, such as Android Chrome, which throws), and the page's own line is the ping. */
export function notify(title: string, body: string, tag: string, onOpen: () => void): boolean {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  try {
    const n = new Notification(title, { body, tag });
    n.onclick = () => { focus(); n.close(); onOpen(); };
    shown.set(tag, n);
    return true;
  } catch {
    return false;
  }
}

/** Takes back the notification shown for this tag, once what it said is no longer so (her price changed, or she stopped
 *  watching): an old ping can't open an old price (R's red team F2, Nov 5). */
export function unnotify(tag: string): void {
  shown.get(tag)?.close();
  shown.delete(tag);
}

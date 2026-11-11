// "Set your price" and the Watching list's fixed words (Joshua, Nov 5, sections 3 and 4). Words only, no imports: the
// Desk's room reads these without carrying the catalog or the market into its chunk (core/src/ask/watching-list.ts
// builds the rows on the server). Every sentence here has a claims row.

export const SET_YOUR_PRICE = "Set your price";
export const YOUR_PRICE = "Your price";
export const WATCHING_HEAD = "Watching";
export const BEST_TODAY = "Today's best";
/** A ping's one action: the ask, held to her price, waits on "Here's what I understood" for her Shop tap. */
export const OPEN_DEAL = "Shop at your price";
/** No email or phone number, ever (4b); in-app only (4c: decided by default, no Web Push by Friday). */
export const PINGS_HERE = "Pings show on this list. While this page is open on a computer, your browser can show them too, if you allow it. No email or phone number, ever.";
export const NO_BEST = "None on record today";
/** Real products (3b): said on every real row and beside Find's watch button. */
export const CHECKS_DAILY = "Goose checks this price once a day, so it can miss a drop that sells out in minutes.";
export const BUY_THERE = "You buy it at the store yourself. Goose only tells you the price.";
/** What a watch keeps, where and how long (Lead-12 approved, Nov 5): the session's week, kept on the server for this browser. */
export const WATCH_KEEPS = "A watch keeps the product, its store and your price for this browser, until a week after your last visit. Never your search words.";
export const REAL_HEAD = "Real prices you're watching";
export const NO_READ = "No price read yet";
/** The save route's answer while real-price watching is off (Find shows no button then, so a page rarely sees it). */
export const REAL_OFF = "Watching real prices isn't on yet. Nothing was saved.";

// The ping with the tab closed (Joshua, Nov 5 6:40 PM, Level 2), behind PING_PUSH. Its own button asks for notification
// permission when it hasn't been given (phones too: Set your price doesn't ask there). The DD's words (L2 seat, Nov 5).
export const PUSH_ON = "Ping me with the tab closed";
export const PUSH_OFF = "Stop pings with the tab closed";
/** On, and the simulated week reached her price, so a push is on its way (the POST's `ping`). */
export const PUSH_SENT = "Pings with the tab closed are on. Close this tab: your simulated price alert should arrive in a few seconds.";
/** On, but nothing she watches reached her price in the simulated week: no push is sent, so none is promised. */
export const PUSH_SENT_NONE = "Pings with the tab closed are on. Nothing you're watching reached your price in the simulated week, so there's no ping to send yet.";
export const PUSH_STOPPED = "Stopped. Goose deleted this browser's notification address, so no more pings with the tab closed.";
export const PUSH_IPHONE = "On iPhone, pings with the tab closed work only after Add to Home Screen.";
/** What the push store holds, said whole: the address, tied to her watches (the entry also holds when it last pushed and
 *  which watch is due). */
export const PUSH_KEPT = "To ping you with the tab closed, Goose keeps the notification address your browser made for it, tied to your watches here. Deleted when you tap Stop, on Dec 22, or sooner if Goose's server restarts. No name, email or phone number.";
/** Shown when a woken page can't read her ping (offline): no price, so it can never say a wrong one. "Simulated" is true
 *  only while every push is the simulated week's (`pushLater` sends only `pingsFor`'s): a real-price push must change
 *  both lines first (the R seat's note; push.test pins that pushLater reads pingsFor only). */
export const PUSH_PLAIN_TITLE = "Goose · simulated price alert";
export const PUSH_PLAIN = "Simulated: something you're watching reached your price. Tap to see your list.";

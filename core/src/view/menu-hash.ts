// The menu's in-place targets on the Desk, by the hash its address carries (`?desk=1#wants`), so a menu link from any
// page opens the same room the Desk opens in place. Its own light module (it imports only the promises' words): the Desk
// reads it on first load, and the menu's items (menu.ts, with the limits from code) load only when the menu opens.
//
// The app rail (Joshua, Fri Oct 30: "Every feature is on the menu, the tour and the app rail") lives here too, for the
// same reason: the Desk draws it with no extra chunk. core/test/reach.test.ts holds the menu and the tour to
// the same features, by id, name and address.

import { promiseOf } from "./promises.ts";

/** What an item does in place on the Desk (elsewhere it follows its `href` to the Desk, which opens the same thing). */
export type MenuAction = "ask" | "talk" | "wants" | "week" | "settings" | "after" | "watcher" | "challenge";
export const MENU_ACTIONS: readonly MenuAction[] = ["ask", "talk", "wants", "week", "settings", "after", "watcher", "challenge"];
export const menuActionOf = (hash: string): MenuAction | null => {
  const h = hash.replace(/^#/, "");
  return (MENU_ACTIONS as readonly string[]).includes(h) ? (h as MenuAction) : null;
};

/** The Desk's own address for an in-place item. */
export const deskHref = (a: MenuAction): string => `?desk=1#${a}`;

/** The limits' one name (S1-6; Round 2's consumer: the menu said "Limits in code" and the page it opened said
 *  "Settings"): the menu item, the tour's stop and the Desk's pane head all read it. Here, with no imports,
 *  so the Desk's pane takes it without the menu's chunk. */
export const LIMITS_NAME = "Limits in code";

/** Under the Ask box when the menu's or the tour's "The Watcher" has put its ask there (S1-9; Round 3's consumer: stop 2
 *  "only pre-fills the Ask box, with no cue to press the arrow"). Nothing runs until the visitor presses it. */
export const WATCH_CUE = "The ask is ready. Press the arrow to run it.";

/** The judge tour's page (`?desk=tour`). */
export const TOUR_HREF = "?desk=tour";

/** Where "Try to trick Goose" opens: the tour's first stop and the menu's first item read this one address (Joshua, Nov 3:
 *  the challenge moves to center stage). The challenge sits right under the hero, so on the Desk it opens in place. */
export const TRICK_HREF = deskHref("challenge");

/** The tour's chip on the Watcher stop (the DD, Nov 4): the secondhand listing, whose planted scam a judge can't find by
 *  typing. It waits in the box like the Watcher's own ask; nothing runs until a tap. A fixed address, never words from
 *  the URL, so a link can't put anything else in the box. */
export const MIXER_ASK = "A used Fernway mixer";
export const MIXER_HASH = "mixer";
export const MIXER_HREF = `?desk=1#${MIXER_HASH}`;

/** The hashes that open the landing itself, its Ask box focused (the Desk's `ask` pane; Talk takes the mic, the Watcher
 *  and the mixer put their ask in the box). They aren't rooms, so they have no cover: the page's first paint is the
 *  landing's, as at `/` (web/prerender.ts). Without it, a cold phone drew nothing for these until the Desk's code ran
 *  (R, Nov 6: first paint 1452 ms, 135 KB first, against 504 ms for a room with a cover). core/test/landing-hash.test.ts
 *  holds every menu hash to one of the two. */
export const LANDING_HASHES: readonly string[] = ["ask", "talk", "watcher", MIXER_HASH];

/**
 * The haggle's page (Track H, `?desk=haggle`). Were it ever emptied (the page pulled), the haggle keeps a slot, never a
 * link: the menu leaves it out, and the tour says plainly that it is being built (no button).
 */
export const HAGGLE_HREF: string = "?desk=haggle";

/**
 * The two Pay items that open the wallet (S1-3; the Round 0 judge: they "land on the identical `?wallet=1` screen with no
 * anchor"), each on its own spot: the Approve button, and PayPal's own Pay Later message beside it. `find` is the spot's
 * own id (Wallet.tsx's `#approve`, PayLater.tsx's `#paylater`, Track W); `fallback` is where to land when it isn't drawn
 * `wait` ms after load (Pay Later lands on the Approve it sits beside). The page's menu button scrolls there
 * (web/src/menu/land.ts). Session 5: the ids exist, so the class fallbacks (`.approve`, `.wlater:has(...)`) are gone.
 * core/test/menu.test.ts reads the wallet's markup for each id.
 */
export interface MenuAnchor { id: string; href: string; find: readonly string[]; fallback: readonly string[]; wait: number }
export const MENU_ANCHORS: readonly MenuAnchor[] = [
  { id: "approve", href: "?wallet=1#approve", find: ["#approve"], fallback: [], wait: 1500 },
  { id: "paylater", href: "?wallet=1#paylater", find: ["#paylater"], fallback: ["#approve"], wait: 2500 },
];
const anchor = (id: string): string => MENU_ANCHORS.find((a) => a.id === id)!.href;
export const APPROVE_HREF = anchor("approve");
export const PAYLATER_HREF = anchor("paylater");
/** "How it works" (SYS's page, `?desk=how`; brand.md §10.5: first in "See how it works"). */
export const HOW_HREF = "?desk=how";
/** "For builders" (Joshua, Nov 4, 2a). */
export const BUILDERS_HREF = "?desk=builders";

/** One entry of the menu's light index: the item's id, its name and where it opens (and, on the Desk, the room it
 *  opens in place). menu.ts's MENU adds each item's line; this copy stays here so the Desk can map a room to its item
 *  without loading those lines. core/test/reach.test.ts holds the two together. (S1-13 part 5: the old rail's names.) */
export interface MenuIndexItem { id: string; name: string; href: string; action?: MenuAction }
export interface MenuIndexGroup { name: string; items: readonly MenuIndexItem[] }

const room = (id: string, name: string, action: MenuAction): MenuIndexItem => ({ id, name, href: deskHref(action), action });

/** The menu's light index: one group per promise (Joshua, Nov 3: every feature is shown as proof of one promise). */
export const MENU_INDEX: readonly MenuIndexGroup[] = [
  { name: promiseOf("fooled").head, items: [
    room("trick", "Try to trick Goose", "challenge"),
    room("watcher", "The Watcher", "watcher"),
    { id: "approve", name: "Approve in PayPal", href: APPROVE_HREF },
  ] },
  { name: promiseOf("overspend").head, items: [
    room("ask", "Ask Goose", "ask"),
    room("talk", "Talk to Goose", "talk"),
    room("limits", LIMITS_NAME, "settings"),
    ...(HAGGLE_HREF ? [{ id: "haggle", name: "The haggle", href: HAGGLE_HREF }] : []),
    { id: "storesync", name: "The cart, step by step", href: "?market=1" },
    { id: "paylater", name: "Pay Later", href: PAYLATER_HREF },
    room("wants", "Your wants", "wants"),
    { id: "list", name: "Your Christmas list", href: "?desk=list" },
    room("week", "Your week", "week"),
  ] },
  { name: promiseOf("hide").head, items: [
    { id: "ledger", name: "Behind the scenes", href: "?desk=ledger" },
    { id: "proof", name: "Proof", href: "?desk=proof" },
    { id: "how", name: "How it works", href: HOW_HREF },
    { id: "builders", name: "For builders", href: BUILDERS_HREF },
    room("after", "After you pay", "after"),
    { id: "tour", name: "Judge tour", href: TOUR_HREF },
  ] },
];
export const MENU_INDEX_ITEMS: readonly MenuIndexItem[] = MENU_INDEX.flatMap((g) => g.items);


/** Every page `?desk=` names (web/src/main.tsx's table and the Desk's own `1`; index.html's first script lists the same). */
export const DESK_PAGES: readonly string[] = ["1", "ledger", "studio", "proof", "haggle", "tour", "system", "how", "builders", "list"];

/**
 * Round 1 (the design judge, 8.5): an address that would fall through to the old wallet page, as the Desk page it
 * means, or null when it is already one. `?desk=` with a value no page has (`?desk=nope`, an old link) opens the Desk;
 * `?studio=force` alone opens Behind the scenes with Studio forced (`studio-gate.ts` reads the flag there). Every
 * other parameter stays (the caller keeps the hash), so a PayPal return (`run`) or a room (`#wants`) still lands. The
 * market (`?market=1`) is left alone.
 */
/**
 * The parameters that name a page other than the Desk's landing (the wallet `wallet`, the market `market`, the classic
 * page's full ledger `ledger`/`row`, its seeded run `seed` and its PayPal return `run`) or a Desk page (`desk`). Any
 * other parameter (`utm_source` from a Devpost or social link, a typo) is not a route, so the bare address's page, the
 * Desk, still opens (Round 1: `/?utm_source=devpost` opened the wallet). index.html's first script lists the same.
 */
export const ROUTE_PARAMS: readonly string[] = ["desk", "wallet", "market", "ledger", "row", "seed", "run"];

/** Whether the root address with this query is the Desk's landing: no parameter in it names another page. */
export const deskByDefault = (search: string): boolean => {
  const q = new URLSearchParams(search);
  return !ROUTE_PARAMS.some((k) => q.has(k));
};

export function deskCanonical(search: string, pathname = "/"): string | null {
  const q = new URLSearchParams(search);
  // Only the app's own root (a static mirror under another path has no Desk to shop with), and never over an explicit
  // wallet or market link.
  if (pathname !== "/" || q.has("wallet") || q.get("market") === "1") return null;
  const d = q.get("desk");
  if (d === null) {
    if (q.get("studio") !== "force") return null;
    q.set("desk", "studio");
  } else if (DESK_PAGES.includes(d)) return null;
  else q.set("desk", "1");
  return `?${q.toString()}`;
}

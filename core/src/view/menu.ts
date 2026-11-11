// "Everything Goose does" (Joshua, Fri Oct 30, item 1: "a regular consumer can see everything Goose does and how it
// works. Nothing hidden."): the nav's one menu, one group per promise (Joshua, Nov 3: "Every feature is shown as proof of
// one promise"; promises.ts). Each item is a name, one plain line, and where it opens:
// an address every page can follow, plus, on the Desk, the room or control it opens in place. Only features that work
// end to end on the live server are here; the rest wait in a slot, never a dead link (the haggle: `HAGGLE_HREF`). The
// limits line is built from the demo's own limits in code, never retyped. The light index (menu-hash.ts's MENU_INDEX) and the judge tour
// (tour.ts) list the same features; core/test/reach.test.ts holds the three together.

import { fromCents, usdWhole } from "../money.ts";
import { DEMO_CATEGORY, DEMO_CLOTHING, DEMO_EVENTS, DEMO_LIMITS, DEMO_OTHER, DEMO_TRAVEL } from "../demo-limits.ts";

import { APPROVE_HREF, BUILDERS_HREF, HAGGLE_HREF, HOW_HREF, LIMITS_NAME, PAYLATER_HREF, TOUR_HREF, TRICK_HREF, deskByDefault, deskHref, type MenuAction } from "./menu-hash.ts";
import { promiseOf } from "./promises.ts";
export { APPROVE_HREF, HAGGLE_HREF, HOW_HREF, LIMITS_NAME, MENU_ACTIONS, MENU_ANCHORS, MENU_INDEX, MENU_INDEX_ITEMS, PAYLATER_HREF, TOUR_HREF, TRICK_HREF, menuActionOf, type MenuAction, type MenuIndexGroup, type MenuIndexItem } from "./menu-hash.ts";

export type MenuItem = { id: string; name: string; line: string; href: string; action?: MenuAction };
export type MenuGroup = { name: string; items: readonly MenuItem[] };

/** Every limit the demo sets, in Joshua's order (Fri Nov 6, 12:10: "Kitchen $60 · Clothing $70 · Events $90 · Travel $100
 *  · Other $150 to start"), each from `DEMO_LIMITS` (whole dollars: every one is a round amount). menu.test.ts fails if
 *  a limit is added to DEMO_LIMITS and not named here. */
export const LIMITS: readonly (readonly [string, string])[] = [["Kitchen", DEMO_CATEGORY], ["Clothing", DEMO_CLOTHING], ["Events", DEMO_EVENTS], ["Travel", DEMO_TRAVEL], ["Other", DEMO_OTHER]];
export const limitsLine = (): string => LIMITS.map(([label, c]) => `${label} ${usdWhole(DEMO_LIMITS[c]!)}`).join(" · ");
/** The limits' one sentence, for the menu's "Limits in code" and the tour's stop 05 alike (Round 2, data fix 2: two
 *  wordings drifted; "to start" because travel and clothing can change on that pane). */
export const limitsSentence = (): string => `${limitsLine()} to start. No words can raise them.`;

export const MENU_LABEL = "Everything Goose does";

/** The haggle's line on the tour. The menu says it shorter: its middle column is the one that scrolls. */
export const HAGGLE_LINE = "Each seller's ask and Goose's offer, round by round, on one price ladder.";

export const MENU: readonly MenuGroup[] = [
  { name: promiseOf("fooled").head, items: [
    { id: "trick", name: "Try to trick Goose", line: "Write your own scam note as a seller, and watch what code does.", href: TRICK_HREF, action: "challenge" },
    { id: "watcher", name: "The Watcher", line: "Every run hides one scam seller. Watch the Watcher read its note and set it aside.", href: deskHref("watcher"), action: "watcher" },
    { id: "approve", name: "Approve in PayPal", line: "The exact cart opens in PayPal's sandbox. Only your tap pays.", href: APPROVE_HREF },
  ] },
  { name: promiseOf("overspend").head, items: [
    { id: "ask", name: "Ask Goose", line: "Your words can lower a limit, never raise one.", href: deskHref("ask"), action: "ask" },
    { id: "talk", name: "Talk to Goose", line: "Hold the mic. Your voice is never sent.", href: deskHref("talk"), action: "talk" },
    { id: "limits", name: LIMITS_NAME, line: limitsSentence(), href: deskHref("settings"), action: "settings" },
    ...(HAGGLE_HREF ? [{ id: "haggle", name: "The haggle", line: "Each ask and offer, round by round.", href: HAGGLE_HREF }] : []),
    { id: "storesync", name: "The cart, step by step", line: "The cart flow modeled on PayPal Store Sync's.", href: "?market=1" },
    { id: "paylater", name: "Pay Later", line: "PayPal's message, when PayPal sends one.", href: PAYLATER_HREF },
    { id: "wants", name: "Your wants", line: "Prices Goose watches, and what it set aside.", href: deskHref("wants"), action: "wants" },
    { id: "list", name: "Your Christmas list", line: "Gifts under one total no cart in this browser can pass.", href: "?desk=list" },
    { id: "week", name: "Your week", line: "A recorded week of shopping, day by day.", href: deskHref("week"), action: "week" },
  ] },
  { name: promiseOf("hide").head, items: [
    { id: "ledger", name: "Behind the scenes", line: "Every decision in this visit, with its reason.", href: "?desk=ledger" },
    { id: "proof", name: "Proof", line: "The numbers on this site, each with its source.", href: "?desk=proof" },
    // S1-13 (brand.md §10.5): SYS's page, its line word for word from the Lead.
    { id: "how", name: "How it works", line: "Five steps from your ask to a payment, each with the code that does it.", href: HOW_HREF },
    { id: "builders", name: "For builders", line: "The guard and the Watcher in your own checkout, and what they don't promise.", href: BUILDERS_HREF },
    { id: "after", name: "After you pay", line: "Tracking, Undo for a refund, and “If it never arrives”, in one place.", href: deskHref("after"), action: "after" },
    { id: "tour", name: "Judge tour", line: "Each promise with its proof, one tap each.", href: TOUR_HREF },
  ] },
];

export const MENU_ITEMS: readonly MenuItem[] = MENU.flatMap((g) => g.items);

/** The bar's open view: the Desk and the shopper's pages ("shop"), the back room ("back") or the judge tour ("tour"). */
export type NavView = "shop" | "back" | "tour";

/**
 * S1-13 (brand.md §10.4): where an address is, for the phone menu's views row and its current-room dot, when the page
 * doesn't say (the bars drawn as markup: the wallet, the classic page, the market, safe.html, the 404). `view` is the
 * open view (absent on a page that is no view's), `exact` false on a page inside it (Proof and the haggle sit in the
 * back room), and `room` the menu item the address opens, if it names one. Never guesses a Desk room it can't read.
 */
export function addressRoom(search: string, hash: string): { view?: NavView; exact: boolean; room?: string } {
  const q = new URLSearchParams(search), d = q.get("desk"), h = hash.replace(/^#/, "");
  const by = (href: string) => MENU_ITEMS.find((i) => i.href === href)?.id;
  const shop = (r: string | undefined) => (r ? { view: "shop" as const, exact: true, room: r } : { view: "shop" as const, exact: true });
  if (d === "tour") return { view: "tour", exact: true, room: "tour" };
  if (d === "ledger" || d === "studio") return { view: "back", exact: true, room: "ledger" };
  // Proof, the haggle and How it works sit in the back room (their pages' SiteNav: here="back", exact false).
  if (d === "proof" || d === "haggle" || d === "how") { const r = by(`?desk=${d}`); return r ? { view: "back", exact: false, room: r } : { view: "back", exact: false }; }
  if (q.get("market") === "1") return { exact: true, room: "storesync" };
  const w = q.get("wallet");
  if (w === "0") return shop("trick");
  if (w !== null) return shop(by(`?wallet=${w}#${h}`));
  if (d === "1" || deskByDefault(search)) return shop(h ? by(`?desk=1#${h}`) : undefined);
  return { exact: true };
}

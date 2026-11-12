// Page titles (brand.md §10.8): "<Page> · Gilded Goose", where the page name is the menu item's name for that room, so
// the tab, the menu and the title agree. The landing and `/` are "Gilded Goose" alone. Each room is its own address
// (main.tsx picks the page from the query once, at load), so the title is set before the first paint by one small
// script in index.html's <head> (TITLE_SCRIPT, below, byte for byte; core/test/brand.test.ts holds the two together and
// each name to the menu's). A room that sets its own title on mount calls pageTitle() with the same name.

export const BRAND_NAME = "Gilded Goose";

/** "Proof · Gilded Goose"; with no name, the brand alone. */
export const pageTitle = (name?: string): string => (name ? `${name} · ${BRAND_NAME}` : BRAND_NAME);

/**
 * Each room's address (the one query parameter that names it) and the name that titles it: the menu item's name
 * (core/src/view/menu.ts, by `menuId`), or, for a page the menu doesn't list, the name its own page sets on mount
 * (How it works: web/src/how/how.ts HOW_TITLE; the design system: web/src/system/System.tsx, unlisted and noindex).
 * `?desk=studio` is Behind the scenes under its other address. A room with a `hash` is titled only when the address
 * opens on it: `?wallet=0#break` is Try to trick Goose (the page's own h1 says it; the Desk's trick slot falls back
 * there when the Challenge can't draw), so a screen reader hears where it went (S1-13, Lead-10). The Desk (`?desk=1`, `/`), the
 * classic page with no hash (`?wallet=0`) and anything else are "Gilded Goose" alone.
 */
export const ROOMS: readonly { param: string; value: string; hash?: string; menuId?: string; name: string }[] = [
  { param: "market", value: "1", menuId: "storesync", name: "The cart, step by step" },
  { param: "desk", value: "ledger", menuId: "ledger", name: "Behind the scenes" },
  { param: "desk", value: "studio", menuId: "ledger", name: "Behind the scenes" },
  { param: "desk", value: "proof", menuId: "proof", name: "Proof" },
  { param: "desk", value: "haggle", menuId: "haggle", name: "The haggle" },
  { param: "desk", value: "tour", menuId: "tour", name: "Judge tour" },
  { param: "desk", value: "how", name: "How it works" },
  { param: "desk", value: "builders", name: "For builders" },
  { param: "desk", value: "list", name: "Your Christmas list" },
  { param: "desk", value: "system", name: "Design system" },
  { param: "wallet", value: "1", menuId: "approve", name: "Approve in PayPal" },
  { param: "wallet", value: "0", hash: "#break", name: "Try to trick Goose" },
];

/**
 * The title an address opens with, in main.tsx's order: `?market=1` wins; then `?desk=1` (the Desk: the brand alone);
 * then a back-room page `?desk=<page>`; anything else is the wallet's (so `?desk=nope&wallet=1` is the wallet, as
 * main.tsx renders it). `?studio=force` with no `?desk=` and no `?wallet=` is Behind the scenes: index.html's first body
 * script rewrites it to `?desk=studio`, after this title is set.
 */
export function titleFor(search: string, hash = ""): string {
  const q = new URLSearchParams(search);
  const named = (p: string, v: string | null) => ROOMS.find((r) => r.param === p && r.value === v && (!r.hash || r.hash === hash));
  if (q.get("market") === "1") return pageTitle(named("market", "1")?.name);
  const d = q.get("desk") ?? (q.get("studio") === "force" && !q.has("wallet") ? "studio" : null);
  if (d === "1") return BRAND_NAME;
  return pageTitle((named("desk", d) ?? named("wallet", q.get("wallet")))?.name);
}

/** The tab follows a hash-only move (the DD, Sat Oct 31 09:19): the head script titles the address at load, but the
 *  menu's `?wallet=0` to `#break` is a hash change, not a load. Every room that titles itself on mount uses its ROOMS
 *  name, so re-running titleFor() on each hash change agrees with them. main.tsx wires it once, with `window` (core's tests run it without the DOM). */
export function titleOnHashChange(
  w: { location: { search: string; hash: string }; document: { title: string }; addEventListener(type: "hashchange", f: () => void): void },
): void {
  w.addEventListener("hashchange", () => { w.document.title = titleFor(w.location.search, w.location.hash); });
}

/** titleFor() as the classic script index.html's <head> runs before the first paint (no module, no import). Its
 *  variable is `u`, never `q`: core/test/menu.test.ts finds the body's routing script by its `var q=` opening. */
export const TITLE_SCRIPT =
  `(function(){var u=$q,d=u.get("desk"),` +
  `R=${JSON.stringify(ROOMS.map((r) => (r.hash ? [r.param, r.value, r.name, r.hash] : [r.param, r.value, r.name])))},` +
  `t=function(p,v){for(var i=0;i<R.length;i++)if(R[i][0]===p&&R[i][1]===v&&(!R[i][3]||R[i][3]===location.hash)){document.title=R[i][2]+" \\u00b7 ${BRAND_NAME}";return 1}};` +
  `if(u.get("market")==="1"){t("market","1");return}` +
  `if(d===null&&u.get("studio")==="force"&&!u.has("wallet"))d="studio";` +
  `if(d==="1"||t("desk",d))return;t("wallet",u.get("wallet"))})()`;


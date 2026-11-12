// "No feature reachable only by a hidden URL. Every feature is on the menu, the tour and the app rail." (Joshua, Fri
// Oct 30, item 1.) This holds the three lists together by id, name and address, and proves every page web/src/main.tsx
// serves has a menu item that opens it. A page added to main.tsx without a menu item fails here (the control below
// plants one). S1, docs/guild/038-tour-glass.md.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HAGGLE_HREF, MENU_ACTIONS, MENU_INDEX_ITEMS, MENU_ITEMS, TOUR_HREF, type MenuItem } from "../src/view/menu.ts";
import { TOUR, TOUR_ALSO, TOUR_BUILDING, TOUR_OPEN, parseTicks, tourProgress } from "../src/view/tour.ts";

const web = (p: string) => readFileSync(new URL(`../../web/src/${p}`, import.meta.url), "utf8");

/** The pages main.tsx serves, as the query each needs (`?desk=proof`), read from its `get("k") === "v"` tests and the
 *  rows of its back-room route table (`["proof", [() => import(`, all `?desk=`), plus the wallet's two (walletMode's
 *  `?wallet=1` and `?wallet=0`). A row with the same loader as an earlier row is that page under a second address
 *  (`?desk=studio` loads what `?desk=ledger` loads, Track AS), so it counts once, as the first. */
function pagesOf(main: string): string[] {
  const own = [...main.matchAll(/get\("(\w+)"\) === "(\w+)"/g)].map((m) => `?${m[1]}=${m[2]}`);
  const loaders = new Set<string>();
  const back = [...main.matchAll(/\["(\w+)", \[(\(\) => import\(.*?), "/g)]
    .filter((m) => !loaders.has(m[2]!) && !!loaders.add(m[2]!)).map((m) => `?desk=${m[1]}`);
  return [...new Set([...own, ...back, "?wallet=1", "?wallet=0"])];
}
/** The pages no menu item opens. */
const unreached = (pages: readonly string[], items: readonly MenuItem[]) => pages.filter((p) => !items.some((i) => i.href.split("#")[0] === p));

/** The one page that is unlisted on purpose: "A living design-system page (?desk=system, unlisted)" (Joshua, Sat Oct 31,
 *  3:30 AM, §1). It is a reference for the team, noindex, and never a feature a shopper needs. */
const UNLISTED = ["?desk=system"];
/** A page whose menu item is another track's to add (Track SYS built How it works; the menu is S1's). Like the haggle's
 *  slot below, it is held to "not in the menu yet": the day S1 adds the item, the last test here fails until the page
 *  leaves this list, so the exception can't outlive its reason. */
const AWAITING_MENU: string[] = [];
/** A page with no menu item of its own, because a menu item's feature moved and its links stayed (Nov 4: "Try to trick
 *  Goose" opens the Desk's challenge). The classic page is still linked from the wallet and the Safe page; the test below
 *  holds that, so it can't become a page only its URL reaches. */
const LINKED_ELSEWHERE = ["?wallet=0"];
const excused = (p: string) => UNLISTED.includes(p) || AWAITING_MENU.includes(p) || LINKED_ELSEWHERE.includes(p);

/** The tour's order, in ids: Joshua's Nov 3 message wins over Oct 30's list. Each promise's proofs together, with "Try to
 *  trick Goose" as stop 1. */
const ORDER = ["trick", "watcher", "pay", "ask", "talk", "limits", "haggle", "wants", "list", "ledger", "after", "proof"];

describe("every page's skip link lands, and a pane heads its page", () => {
  const sources = (readdirSync(new URL("../../web/src/", import.meta.url), { recursive: true }) as string[]).filter((f) => f.endsWith(".tsx"));
  /** Opening tags of <main> with no id="main". The held one is the failed-load line, drawn with no bar and no skip link. */
  const noTarget = (src: string) => [...src.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/<main\b[^>]*>/g)].map((m) => m[0]).filter((t) => !t.includes('id="main"') && !t.includes('className="held"'));
  it("every <main> is the skip link's #main (axe skip-link, on the Desk and live)", () => {
    expect(sources.length).toBeGreaterThan(20);
    expect(sources.flatMap((f) => noTarget(web(f)).map((t) => `${f}: ${t}`))).toEqual([]);
  });
  it("control: a <main> with no id is caught, a failed-load line isn't", () => {
    expect(noTarget(`<main className="dk-wrap">`)).toEqual([`<main className="dk-wrap">`]);
    expect(noTarget(`<main className="held">`)).toEqual([]);
  });
  it("a pane's head is its page's h1 (axe page-has-heading-one, on Your wants)", () => {
    expect(web("desk/Panes.tsx")).not.toMatch(/<h[2-6][^>]*dk-pane-h/);
    expect(web("desk/Panes.tsx")).toMatch(/<h1[^>]*dk-pane-h/);
    expect(web("desk/Panes.tsx")).not.toMatch(/<h3\b/); // an h1 then an h3 skips a level (axe heading-order)
  });
});

describe("every feature is on the menu and the tour", () => {
  it("every page main.tsx serves is opened by a menu item (none only behind its URL)", () => {
    const pages = pagesOf(web("main.tsx"));
    expect(pages).toEqual(expect.arrayContaining(["?desk=1", "?desk=ledger", "?desk=proof", "?desk=tour", "?market=1", "?wallet=1", "?wallet=0"]));
    expect(unreached(pages, MENU_ITEMS).filter((p) => !excused(p))).toEqual([]);
  });

  it("control: a page added to main.tsx with no menu item is caught", () => {
    const planted = `${web("main.tsx")}\nconst secret = new URLSearchParams(location.search).get("desk") === "hidden";`;
    expect(unreached(pagesOf(planted), MENU_ITEMS).filter((p) => !excused(p))).toEqual(["?desk=hidden"]);
  });

  it("the excused pages are exactly the unlisted one and the ones awaiting their item, and none is in the menu yet", () => {
    const pages = pagesOf(web("main.tsx"));
    expect(unreached(pages, MENU_ITEMS).filter(excused).sort()).toEqual([...UNLISTED, ...AWAITING_MENU, ...LINKED_ELSEWHERE].sort());
    expect(web("first-paint.tsx")).toContain(`href={appHref("?desk=1#challenge")}`);
    expect(web("Safe.tsx")).toContain(`href={appHref("?seed=1&wallet=0")}`);
    expect(UNLISTED).toEqual(["?desk=system"]); // only Joshua names a page unlisted
  });

  it("every Desk room or control the hash can open has its menu item", () => {
    for (const a of MENU_ACTIONS) expect(MENU_ITEMS.some((i) => i.action === a), a).toBe(true);
  });

  it("the light index is the menu: same features, names and addresses, in the same order", () => {
    expect(MENU_INDEX_ITEMS.map((r) => [r.id, r.name, r.href, r.action])).toEqual(MENU_ITEMS.map((i) => [i.id, i.name, i.href, i.action]));
    // DK (Joshua, Sat Oct 31 3:30 AM: "No left sidebar"): the Desk draws no left rail of its own at any width; the
    // menu in the bar is the list (brand.md §10.5).
    const desk = web("desk/Desk.tsx");
    expect(desk).not.toMatch(/className="dk-rail"|RAIL\.map/);
    expect(web("desk/desk.css")).not.toMatch(/\.dk-rail\b/);
    // Control: the old rail's markup is what the first check catches.
    expect(`<nav className="dk-rail" aria-label="Everything Goose does">{RAIL.map((g) => null)}</nav>`).toMatch(/className="dk-rail"|RAIL\.map/);
  });

  it("every feature in <= 2 taps at every width (brand.md §10.4): the bar's menu lists every item and every view", () => {
    // S1-13: one bar, no bottom rail. The bar draws the menu button at every width; the menu draws every item (tap 2)
    // and, on a phone, the three views (the wide bar draws them itself). The old phone rail's rooms (Ask, Wants,
    // Limits) are Menu → their items.
    const nav = web("nav/SiteNav.tsx"), panel = web("menu/MenuPanel.tsx");
    expect(nav).toContain("<MenuButton");
    expect(nav).not.toContain("gn-rail");
    expect(panel).toContain("MENU.map");
    for (const v of ["?desk=1", "?desk=ledger", "TOUR_HREF"]) expect(panel, v).toContain(v);
    for (const id of ["ask", "wants", "limits"]) expect(MENU_ITEMS.map((i) => i.id), id).toContain(id);
    // DK moved "Your name" and "Mute Goose" out of the hero into Limits in code: Menu → Limits in code (its pane).
    expect(MENU_ITEMS.find((i) => i.id === "limits")!.action).toBe("settings");
    const panes = web("desk/Panes.tsx");
    for (const w of ["Mute Goose", "<h2>Your name</h2>"]) expect(panes, w).toContain(w);
  });

  it("every menu item is a stop on the tour, or linked under it; the tour item is the tour itself", () => {
    const onTour = new Set([...TOUR.flatMap((s) => s.menu), ...TOUR_ALSO.map((i) => i.id)]);
    for (const i of MENU_ITEMS) {
      if (i.href === TOUR_HREF) continue;
      expect(onTour.has(i.id), i.id).toBe(true);
    }
    expect(MENU_ITEMS.some((i) => i.href === TOUR_HREF)).toBe(true);
    expect(web("tour/Tour.tsx")).toContain("TOUR_ALSO");
  });

  it("each stop's button opens what it names: the address of its first menu item", () => {
    for (const s of TOUR_OPEN) {
      const first = MENU_ITEMS.find((i) => i.id === s.menu[0]);
      expect(first, s.id).toBeDefined();
      expect(s.href, s.id).toBe(first!.href);
    }
  });

  it("the tour's stops, in Joshua's order, with the Christmas list after your wants", () => {
    expect(TOUR.map((s) => s.id)).toEqual(ORDER);
    expect(new Set(TOUR.map((s) => s.id)).size).toBe(TOUR.length);
  });

  it("the haggle has a slot until it lands: no link anywhere, and the tour says it is being built", () => {
    const stop = TOUR.find((s) => s.id === "haggle")!;
    if (HAGGLE_HREF) {
      expect(stop.href).toBe(HAGGLE_HREF);
      expect(MENU_ITEMS.some((i) => i.href === HAGGLE_HREF)).toBe(true);
      return;
    }
    expect(stop.href).toBe("");
    expect(MENU_ITEMS.some((i) => i.id === "haggle")).toBe(false);
    expect(MENU_INDEX_ITEMS.some((i) => i.id === "haggle")).toBe(false);
    expect(TOUR_OPEN.some((s) => s.id === "haggle")).toBe(false);
    expect(web("tour/Tour.tsx")).toContain("TOUR_BUILDING");
    expect(TOUR_BUILDING).not.toMatch(/soon|tomorrow|\d/i); // no date or promise it can't keep
  });
});

describe("the tour's ticks", () => {
  it("reads back only open stops, each once, and anything else as none", () => {
    expect(parseTicks(null)).toEqual([]);
    expect(parseTicks("not json")).toEqual([]);
    expect(parseTicks('{"ask":true}')).toEqual([]);
    expect(parseTicks('["ask","ask","nope",3,"proof"]')).toEqual(["ask", "proof"]);
    expect(parseTicks('["haggle"]')).toEqual(HAGGLE_HREF ? ["haggle"] : []);
  });

  it("says the progress in counts, never a percent", () => {
    const n = TOUR_OPEN.length;
    expect(tourProgress(0)).toBe(`${n} stops to open.`);
    expect(tourProgress(3)).toBe(`3 of ${n} seen.`);
    expect(tourProgress(n)).toBe(`All ${n} stops seen.`);
    expect([0, 3, n].map(tourProgress).join(" ")).not.toMatch(/%/);
  });
});

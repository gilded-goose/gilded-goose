import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APPROVE_HREF, HAGGLE_HREF, HOW_HREF, MENU, MENU_ACTIONS, MENU_ANCHORS, MENU_ITEMS, PAYLATER_HREF, MENU_INDEX_ITEMS, TOUR_HREF, addressRoom, LIMITS, limitsLine, limitsSentence, menuActionOf } from "../src/view/menu.ts";
import { PROMISES } from "../src/view/promises.ts";
import { TOUR } from "../src/view/tour.ts";
import { walletMode } from "../src/view/wallet-flag.ts";
import { DESK_PAGES, ROUTE_PARAMS, deskByDefault, deskCanonical } from "../src/view/menu-hash.ts";
import { DEMO_CATEGORY, DEMO_CLOTHING, DEMO_EVENTS, DEMO_LIMITS, DEMO_OTHER, DEMO_TRAVEL } from "../src/scenario.ts";
import { DEMO_LIMITS as SET_AT } from "../src/demo-limits.ts";

const web = (p: string) => readFileSync(new URL(`../../web/src/${p}`, import.meta.url), "utf8");
/** The pages web/src/main.tsx routes: each item's address must open one of them. */
const ROUTES = ["?desk=1", "?desk=ledger", "?desk=proof", "?desk=haggle", "?desk=tour", "?desk=how", "?desk=builders", "?desk=list", "?market=1", "?wallet=1", "?wallet=0"];

describe("Everything Goose does (the nav's menu)", () => {
  it("has one group per promise, in the promise's own words, every item named with one plain line", () => {
    expect(MENU.map((g) => g.name)).toEqual(PROMISES.map((p) => p.head));
    for (const i of MENU_ITEMS) {
      expect(i.name.length).toBeGreaterThan(2);
      expect(i.line.length).toBeGreaterThan(10);
      expect(i.line).not.toMatch(/\n/);
    }
    expect(new Set(MENU_ITEMS.map((i) => i.id)).size).toBe(MENU_ITEMS.length);
  });

  it("every item opens a page main.tsx routes, and every hash lands on a real target", () => {
    const main = web("main.tsx");
    for (const i of MENU_ITEMS) {
      const [query, hash] = i.href.split("#");
      expect(ROUTES, i.id).toContain(query);
      const [k, v] = query!.slice(1).split("=");
      // The wallet (`?wallet=1`) and the classic page (`?wallet=0`) are walletMode's; the rest are main.tsx's own tests.
      if (k === "wallet") expect(walletMode(query!), i.id).toBe(v === "1" ? "home" : "off");
      // The back-room pages (`?desk=ledger`, `proof`, `haggle`, `tour`) are rows of main.tsx's one route table; the rest are tests.
      else if (k === "desk" && v !== "1") expect(main, i.id).toContain(`["${v}", [() => import(`);
      else expect(main, i.id).toContain(`get("${k}") === "${v}"`);
      if (hash === undefined) continue;
      if (query === "?desk=1") expect(menuActionOf(`#${hash}`), i.id).toBe(i.action);
      else if (query === "?wallet=1") {
        // S1-3: the wallet's anchors are found by land.ts: each is the spot's own id in the wallet's markup (session 5:
        // ids only, no class fallbacks), and the hash names it.
        const a = MENU_ANCHORS.find((x) => x.id === hash);
        expect(a, i.id).toBeDefined();
        const markup = web("Wallet.tsx") + web("PayLater.tsx");
        expect(a!.find, i.id).toEqual([`#${hash}`]);
        for (const s of [...a!.find, ...a!.fallback]) {
          expect(s, i.id).toMatch(/^#[\w-]+$/);
          expect(markup, i.id).toContain(`id="${s.slice(1)}"`);
        }
      } else expect(web("JudgeBox.tsx"), i.id).toContain(`id="${hash}"`);
    }
  });

  it("no two items land on the same spot (S1-3: Approve in PayPal, Pay Later and After you pay each have their own)", () => {
    const hrefs = MENU_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    const pay = ["approve", "paylater", "after"].map((id) => MENU_ITEMS.find((i) => i.id === id)!.href);
    expect(pay).toEqual(["?wallet=1#approve", "?wallet=1#paylater", "?desk=1#after"]);
  });

  it("every in-place action is handled by the Desk, and reads back from its own hash", () => {
    const desk = web("desk/Desk.tsx");
    expect(desk).toContain("menuActionOf(location.hash)");
    for (const a of MENU_ACTIONS) {
      expect(desk, a).toContain(`case "${a}"`);
      expect(menuActionOf(`#${a}`)).toBe(a);
    }
    expect(menuActionOf("#nope")).toBeNull();
    expect(menuActionOf("")).toBeNull();
  });

  it("the limits line comes from the demo's limits in code, in Joshua's order", () => {
    const d = (c: string) => `$${DEMO_LIMITS[c]! / 100}`;
    expect(limitsLine()).toBe(`Kitchen ${d(DEMO_CATEGORY)} · Clothing ${d(DEMO_CLOTHING)} · Events ${d(DEMO_EVENTS)} · Travel ${d(DEMO_TRAVEL)} · Other ${d(DEMO_OTHER)}`);
    // Joshua, Fri Nov 6 12:10, word for word.
    expect(limitsSentence()).toBe("Kitchen $60 · Clothing $70 · Events $90 · Travel $100 · Other $150 to start. No words can raise them.");
    expect(MENU_ITEMS.find((i) => i.id === "limits")!.line).toContain(limitsLine());
  });

  it("the line names every limit the code sets, each with its exact amount, and nothing else (Joshua's condition, Nov 6)", () => {
    // DEMO_LIMITS is where the limits are set (core/src/demo-limits.ts, the rows' cite); scenario.ts re-exports it.
    expect(DEMO_LIMITS).toBe(SET_AT);
    expect(LIMITS.map(([, c]) => c).sort()).toEqual(Object.keys(SET_AT).sort());
    const named = [...limitsLine().matchAll(/([A-Z][a-z]+) \$(\d+(?:\.\d\d)?)/g)].map((m) => [m[1]!.toLowerCase(), Math.round(Number(m[2]) * 100)] as const);
    expect(named.length).toBe(limitsLine().split(" · ").length);
    expect(Object.fromEntries(named)).toEqual({ ...SET_AT });
    // Joshua's order is the amounts', smallest first.
    const cents = named.map(([, c]) => c);
    expect(cents).toEqual([...cents].sort((a, b) => a - b));
  });

  it("nothing that isn't built end to end is listed (cut, not described)", () => {
    const words = MENU_ITEMS.map((i) => `${i.name} ${i.line}`).join(" ");
    // The priorities go-to is Track V's; the haggle is built (Track H) and opens its page, or waits in its slot (S1, 038).
    expect(words).not.toMatch(/priorities/i);
    if (HAGGLE_HREF) expect(MENU_ITEMS.find((i) => i.id === "haggle")?.href).toBe("?desk=haggle");
    else expect(words).not.toMatch(/haggle/i);
  });
});

// Round 1 (the design judge, 8.5): `?studio=force` alone and an unknown `?desk=` fell through to the old wallet page.
describe("no address falls through to the old wallet page", () => {
  it("deskCanonical: an unknown ?desk= opens the Desk; ?studio=force alone opens Behind the scenes, Studio forced", () => {
    expect(deskCanonical("?desk=nope")).toBe("?desk=1");
    expect(deskCanonical("?desk=")).toBe("?desk=1");
    expect(deskCanonical("?desk=nope&run=0123456789ab")).toBe("?desk=1&run=0123456789ab");
    expect(deskCanonical("?studio=force")).toBe("?studio=force&desk=studio");
    // Only the app's root, and never over an explicit wallet link (a static mirror under a path has no Desk to shop with).
    expect(deskCanonical("?desk=nope", "/gilded-goose/")).toBeNull();
    expect(deskCanonical("?studio=force", "/gilded-goose/")).toBeNull();
    expect(deskCanonical("?wallet=1&studio=force")).toBeNull();
    for (const ok of ["", "?desk=1", "?desk=ledger", "?desk=studio&studio=force", "?desk=proof", "?desk=haggle", "?desk=tour", "?desk=system", "?desk=how", "?desk=builders", "?wallet=1", "?wallet=0", "?market=1", "?market=1&desk=nope", "?studio=off"]) expect(deskCanonical(ok)).toBeNull();
  });

  it("main.tsx's pages and index.html's first script name the same ?desk= pages as core", () => {
    const main = readFileSync(new URL("../../web/src/main.tsx", import.meta.url), "utf8");
    const back = [...main.matchAll(/^\s*\["([a-z]+)", \[\(\) => import/gm)].map((m) => m[1]);
    expect(["1", ...back].sort()).toEqual([...DESK_PAGES].sort());
    const html = readFileSync(new URL("../../web/index.html", import.meta.url), "utf8");
    expect(html).toContain(`P=${JSON.stringify(DESK_PAGES)}`);
  });

  it("index.html's first script rewrites the address before the first paint, as deskCanonical does", () => {
    const html = readFileSync(new URL("../../web/index.html", import.meta.url), "utf8");
    const script = html.match(/<script>(\(function\(\)\{var q=new URLSearchParams\(location\.search\)[\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    const run = (search: string) => {
      const loc = { search, pathname: "/", hash: "#wants" };
      const body = new Set<string>();
      const history = { state: null, replaceState: (_s: unknown, _t: string, url: string) => { loc.search = url.replace(/#.*$/, ""); } };
      const stub = { classList: { add: (c: string) => body.add(c), remove: () => {} } };
      new Function("location", "history", "document", "sessionStorage", "matchMedia", "setTimeout", "$h", "$P", "$R", script!)(
        loc, history, { body: stub }, { getItem: () => "1" }, () => ({ matches: true }), () => 0, stub, DESK_PAGES, ROUTE_PARAMS);
      return { search: loc.search, deskOn: body.has("desk-on") };
    };
    for (const s of ["?desk=nope", "?desk=", "?studio=force", "?desk=nope&run=0123456789ab"]) {
      const r = run(s);
      expect(r.search, s).toBe(deskCanonical(s));
      expect(r.deskOn, s).toBe(true);
    }
    // Round 1: a link's own parameters (Devpost, social) are not a route: the address stays and the Desk opens.
    for (const s of ["", "?utm_source=devpost", "?x=1", "?utm_source=devpost&utm_medium=social"]) expect(run(s), s).toEqual({ search: s, deskOn: true });
    for (const s of ["?wallet=1", "?wallet=1&studio=force", "?wallet=0", "?wallet=0&run=0123456789ab", "?ledger=full", "?seed=7", "?run=0123456789ab", "?market=1&desk=nope"]) expect(run(s), s).toEqual({ search: s, deskOn: false });
  });

  it("deskByDefault: the root's landing is the Desk for any query that names no other page; index.html and main.tsx agree", () => {
    for (const s of ["", "?utm_source=devpost", "?x=1", "?studio=off", "?fbclid=abc"]) expect(deskByDefault(s), s).toBe(true);
    for (const s of ["?wallet=1", "?wallet=empty", "?wallet=0", "?market=1", "?ledger=full&row=3", "?seed=7", "?run=0123456789ab", "?desk=1"]) expect(deskByDefault(s), s).toBe(false);
    const html = readFileSync(new URL("../../web/index.html", import.meta.url), "utf8");
    expect(html).toContain(`R=${JSON.stringify(ROUTE_PARAMS)}`);
    const main = readFileSync(new URL("../../web/src/main.tsx", import.meta.url), "utf8");
    expect(main).toContain(`location.pathname === "/" && deskByDefault(location.search)`);
    expect(main).toContain("deskCanonical(location.search, location.pathname)");
  });
});

describe("addressRoom: where an address is, for the phone menu's views row and its dot (S1-13)", () => {
  it("names the open view and the menu item an address opens, and never guesses a Desk room", () => {
    expect(addressRoom("?desk=ledger", "")).toEqual({ view: "back", exact: true, room: "ledger" });
    expect(addressRoom("?desk=proof", "")).toEqual({ view: "back", exact: false, room: "proof" });
    expect(addressRoom("?desk=tour", "")).toEqual({ view: "tour", exact: true, room: "tour" });
    expect(addressRoom("?market=1", "")).toEqual({ exact: true, room: "storesync" });
    expect(addressRoom("?wallet=0", "#break")).toEqual({ view: "shop", exact: true, room: "trick" });
    expect(addressRoom("?wallet=1", "#paylater")).toEqual({ view: "shop", exact: true, room: "paylater" });
    expect(addressRoom("?desk=1", "#wants")).toEqual({ view: "shop", exact: true, room: "wants" });
    expect(addressRoom("?desk=how", "")).toEqual({ view: "back", exact: false, room: "how" });
    expect(addressRoom("", "")).toEqual({ view: "shop", exact: true }); // the Desk with no hash: no dot, not a guess
    expect(addressRoom("?desk=1", "#nope")).toEqual({ view: "shop", exact: true });
  });
  it("each group leads with its strongest proof (Joshua, Nov 3): the challenge, your words, the record", () => {
    expect(MENU.map((g) => g.items[0]!.id)).toEqual(["trick", "ask", "ledger"]);
    expect(MENU_ITEMS.some((i) => i.id === "how")).toBe(true);
  });
});

// S1-13 part 4 (Lead-10, Sat Oct 31): the phone's bottom rail is gone (brand.md §10.4), and its class must not come back
// in markup, a style or a script; nav.css once kept a dead `.gn-rail { display: none; }` "just in case".
describe("the bottom rail stays gone", () => {
  const web = join(import.meta.dirname, "../../web");
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    if (f === "node_modules" || f === "dist" || f.startsWith(".")) return [];
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(html|css|ts|tsx|js|mjs)$/.test(f) ? [p] : [];
  });
  const rail = /gn-rail/;
  it("no file under web/ names .gn-rail", () => {
    const all = files(web);
    expect(all.length).toBeGreaterThan(50); // the walk found the site, not an empty folder
    expect(all.filter((p) => rail.test(readFileSync(p, "utf8"))).map((p) => p.slice(web.length + 1))).toEqual([]);
    expect(rail.test('<nav class="gn-rail" aria-label="Views">')).toBe(true); // control: the old markup is caught
  });
});

// WT's walkthrough (S1-13): from /safe.html "Limits in code" went to /safe.html?desk=1, since a bare query resolves
// against the page it sits on. The data names the app's pages by query alone (one form, base-free, so the GitHub Pages
// mirror under /gilded-goose/ works too); web/src/menu/href.ts `appHref` roots each one, and every renderer goes through
// it. scripts/one-nav.ts clicks each link from every route and holds where it lands.
describe("every menu link lands on the app's page, from any page", () => {
  const data = [
    ...MENU_ITEMS.map((i) => [i.name, i.href] as const), ...MENU_INDEX_ITEMS.map((i) => [i.name, i.href] as const),
    ...TOUR.flatMap((t) => (t.href ? [[t.name, t.href] as const] : [])),
    ["TOUR_HREF", TOUR_HREF], ["APPROVE_HREF", APPROVE_HREF], ["PAYLATER_HREF", PAYLATER_HREF], ["HAGGLE_HREF", HAGGLE_HREF], ["HOW_HREF", HOW_HREF],
  ] as const;
  it("each address in the menu's data is an app address: a query on the app's page, one of its routes", () => {
    expect(data.length).toBeGreaterThan(20);
    for (const [name, href] of data) {
      expect(href, name).toMatch(/^\?/);
      expect(ROUTES.some((r) => href === r || href.startsWith(`${r}#`) || href.startsWith(`${r}&`)), `${name}: ${href}`).toBe(true);
    }
  });
  // A renderer that writes an app address straight into an href resolves it against the page it is on.
  const raw = /href=\{(?:[a-z]\.href|stop\.href|TOUR_HREF|[A-Z_]+_HREF)\}|href="\?|<Lockup href="\?/;
  const renderers = ["menu/MenuPanel.tsx", "nav/SiteNav.tsx", "tour/TourPill.tsx", "tour/Tour.tsx"];
  it("the menu, the bar, the tour and its pill root every app address through appHref", () => {
    for (const f of renderers) {
      const src = web(f);
      expect(src.match(raw)?.[0], f).toBeUndefined();
      expect(src, f).toMatch(/appHref/);
    }
    // control: the bug's own lines are caught
    for (const bad of ['<a className="gm-item" href={i.href} data-item', '<a className="dk-judge" href={TOUR_HREF}', '<Lockup href="?desk=1" />', "<a key={v.key} href={v.href}"]) expect(raw.test(bad), bad).toBe(true);
  });
  it("appHref roots a query at the site's base and leaves other addresses alone", () => {
    const src = web("menu/href.ts");
    expect(src).toMatch(/import\.meta\.env\.BASE_URL\}\$\{href\}/);
    expect(src).toMatch(/href\.startsWith\("\?"\)/);
  });
});

// The last "./?" class (Lead-10, after S2-cine's appHref sweep): "./?wallet=0#break" resolves against the page's folder,
// so from a nested path (the /gilded-goose/ mirror's sub-pages, any /a/b) it leaves the app's page. App addresses are
// "?…" in data, appHref in React, %BASE_URL%?… in static HTML; nothing writes "./?".
describe("no app address is written \"./?…\", anywhere the site or its data is", () => {
  const roots = [join(import.meta.dirname, "../../web"), join(import.meta.dirname, "../src")];
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    if (f === "node_modules" || f === "dist" || f === "public" || f.startsWith(".")) return [];
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(html|ts|tsx|js|mjs)$/.test(f) ? [p] : [];
  });
  /** A "./?" address in a string, attribute or template: the quote, then ./? and a parameter's first letter. */
  const dotQuery = /["'`]\.\/\?[a-z]/;
  it("web/ (src, the HTML entries, prerender) and core/src carry none", () => {
    const all = roots.flatMap(files);
    expect(all.length).toBeGreaterThan(150); // the walk found both trees
    const hits = all.flatMap((f) => readFileSync(f, "utf8").split("\n").flatMap((l, i) => (dotQuery.test(l) ? [`${f.split("/gilded-goose/").pop()?.replace(/^.*?(web|core)\//, "$1/")}:${i + 1}`] : [])));
    expect(hits).toEqual([]);
    // control: the forms that were left
    for (const bad of ['<a href="./?wallet=0#break">', 'export const TRICK_HREF = "./?wallet=0#break";', "href={`./?seed=${WEEK}&wallet=0`}", '<Lockup href="./?desk=1" />']) expect(dotQuery.test(bad), bad).toBe(true);
    for (const good of ['<a href="%BASE_URL%?wallet=0#break">', 'href={appHref("?seed=1&wallet=0")}', 'href: "./"', '<a href="#hero-h">']) expect(dotQuery.test(good), good).toBe(false);
  });
});

// The DD (Sat Oct 31 08:40): a heading the tour (or a room) focuses shows no ring; the ring stays on controls. tour.css
// rang `.tr-stage h2:focus-visible`. scripts/tour-moves.ts `headings` focuses every tabindex="-1" heading on every route.
describe("a focused heading never rings, in any sheet", () => {
  const web = join(import.meta.dirname, "../../web");
  const sheets = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    if (f === "node_modules" || f === "dist" || f.startsWith(".")) return [];
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sheets(p) : /\.(css|html)$/.test(f) ? [p] : [];
  });
  /** A rule whose selector ends on a heading's :focus or :focus-visible and draws an outline other than none. */
  const rings = (css: string) => [...css.matchAll(/([^{}]*\bh[1-6][^{},]*:focus(?:-visible)?)\s*(?:,[^{]*)?\{([^}]*)\}/g)]
    .filter((m) => /outline\s*:\s*(?!none)[^;]*\d/.test(m[2]!)).map((m) => m[1]!.trim());
  it("no stylesheet gives a heading's focus an outline", () => {
    const all = sheets(web);
    expect(all.length).toBeGreaterThan(20);
    expect(all.flatMap((f) => rings(readFileSync(f, "utf8")).map((r) => `${f.slice(web.length + 1)}: ${r}`))).toEqual([]);
    expect(rings(".tr-stage h2:focus { outline: none; }\n.tr-stage h2:focus-visible { outline: 2px solid var(--focus); }")).toEqual([".tr-stage h2:focus-visible"]); // control: the rule that was
  });
});

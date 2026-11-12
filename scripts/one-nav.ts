// One nav on every route (S1-13; brand.md §10.4-10.5, the DD's gate item 5). At 390x844 and 1440x900, DPR 1, on every
// page the site serves, this checks:
//   - one sticky bar: still at the window's top after a scroll; no bottom rail drawn anywhere;
//   - the skip link: one `.gn-skip`, the bar's first Tab stop, in the one style (a pill, shown on focus);
//   - every feature in <= 2 taps: tap 1 is the bar's menu button, tap 2 any item (every MENU item is in it) or, on a
//     phone, any of the three views (its views row);
//   - the phone sheet: starts under the bar, the button reads "Menu" then "Close", items are names only (no lines),
//     48 px rows, the current room (if the page names one) carries aria-current="page" and its dot; Close returns focus;
//   - no console error, and no sideways scroll at 390;
//   - where a click lands (S1-13, WT's walkthrough: from /safe.html "Limits in code" reloaded safe.html): from every
//     route, each menu item and view link (and the wide bar's own views) lands on the app's page ("/") with the item's
//     own query. At 1440 each is clicked; at 390 each link's resolved address is read. `ONE_NAV_ONLY=lands` runs this alone;
//   - checklist §4 (S1-13 part 5): one real Tab from the page's top shows the skip link, and its ring is one style on
//     every route (outline style, width and offset, corner, size and place per width); its colours are its room's
//     (Velvet or Midnight: one pair each, the ring the link's own ink). A deep link that focuses its room on load
//     (?desk=1#wants) starts its Tab from the top.
// Usage: node scripts/one-nav.ts http://localhost:8787 [out-dir]

import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { MENU_ITEMS } from "@goose/core/menu";

const base = (process.argv[2] ?? "http://localhost:8787").replace(/\/$/, "");
const out = process.argv[3] ?? "/tmp/s1-13/one-nav";
mkdirSync(out, { recursive: true });

const ROUTES: readonly { path: string; room?: string }[] = [
  { path: "/" }, { path: "/?desk=1#wants", room: "wants" }, { path: "/?desk=ledger", room: "ledger" }, { path: "/?desk=proof", room: "proof" },
  { path: "/?desk=haggle", room: "haggle" }, { path: "/?desk=how", room: "how" }, { path: "/?desk=builders", room: "builders" }, { path: "/?desk=tour", room: "tour" }, { path: "/?wallet=1" }, { path: "/?wallet=0", room: "trick" },
  { path: "/?market=1", room: "storesync" }, { path: "/?desk=list" }, { path: "/safe.html" }, { path: "/no-such-page" },
];
const SIZES: readonly [number, number][] = [[390, 844], [1440, 900]];
const rows: string[] = [];
const fails: string[] = [];
/** Checklist §4: each route's focused skip link, by width (style) and by room (colours). */
const rings: { tag: string; w: number; room: string; style: string; colour: string }[] = [];
const menuTypes: { tag: string; w: number; style: string }[] = [];

const bar = (p: Page) => p.evaluate(() => {
  const b = [...document.querySelectorAll<HTMLElement>("header.gn.dk-nav")].find((e) => e.getBoundingClientRect().height > 0);
  return b ? { top: Math.round(b.getBoundingClientRect().top), bottom: Math.round(b.getBoundingClientRect().bottom), pos: getComputedStyle(b).position } : null;
});

/** B-11's lockup in the drawn bar (the DD at 07:05: the link's hit area is 44 x 44 at least, the mark keeps its size, and
 *  "Practice only" still reads): its box, its face, its words' box, and the caption's box beside or under it. */
const lockup = (p: Page) => p.evaluate(() => {
  const b = [...document.querySelectorAll<HTMLElement>("header.gn.dk-nav")].find((e) => e.getBoundingClientRect().height > 0);
  const a = b?.querySelector<HTMLElement>("a.gg");
  if (!a) return null;
  const r = a.getBoundingClientRect(), cs = getComputedStyle(a);
  const words = { top: r.top + parseFloat(cs.paddingTop), bottom: r.bottom - parseFloat(cs.paddingBottom), left: r.left, right: r.right };
  const egg = a.querySelector(".o")!.getBoundingClientRect();
  const c = b!.querySelector<HTMLElement>(".dk-practice-ph");
  const cr = c && c.getClientRects().length ? c.getBoundingClientRect() : null;
  const hits = !!cr && cr.bottom > words.top + 0.5 && cr.top < words.bottom - 0.5 && cr.right > words.left + 0.5 && cr.left < words.right - 0.5;
  return { w: Math.round(r.width), h: Math.round(r.height), face: cs.fontFamily, size: cs.fontSize, egg: `${Math.round(egg.width)}x${Math.round(egg.height)}`, caption: cr ? `${Math.round(cr.left)},${Math.round(cr.top)}-${Math.round(cr.bottom)}` : "none", hits, label: a.getAttribute("aria-label"), old: b!.querySelectorAll(".dk-brand, .dk-mark").length };
});
const checkLockup = (L: Awaited<ReturnType<typeof lockup>>, fail: (why: string) => void) => {
  if (!L) return fail("no lockup (a.gg) in the drawn bar");
  if (L.w < 44 || L.h < 44) fail(`the lockup's link is ${L.w}x${L.h}, under 44 x 44`);
  if (!/Hanken/i.test(L.face)) fail(`the lockup's face is ${L.face}, not Hanken`);
  if (L.hits) fail(`"Practice only" (${L.caption}) runs into the wordmark`);
  if (L.old) fail(`${L.old} old .dk-brand / .dk-mark left in the bar`);
  if (L.label !== "Gilded Goose") fail(`the lockup's name is "${L.label}"`);
};
const lockupCol = (L: Awaited<ReturnType<typeof lockup>>) => L ? `lockup ${L.w}x${L.h} ${L.size} egg ${L.egg} face ${L.face.split(",")[0]} caption ${L.caption}` : "lockup none";

const browser = await chromium.launch();
/** Where each menu link lands, from every route (the class rule for WT's bug: reachable isn't enough, the click must
 *  land on the item's own address). The app is served at the root here, so its page is "/". */
const LAND_ROUTES = ["/", "/?wallet=1", "/?wallet=0", "/?desk=1", "/?desk=ledger", "/?desk=proof", "/?desk=haggle", "/?desk=how", "/?desk=system", "/?desk=list", "/safe.html", "/no-such-page"];
async function lands() {
  const want = (raw: string) => { const u = new URL(raw, `${base}/`); return `/${u.search}`; };
  // The bare address is the Desk (Joshua, Oct 30), so on the Desk at "/" a Desk item that opens in place is on its page.
  const same = (a: string, b: string) => (a === "/" ? "/?desk=1" : a) === (b === "/" ? "/?desk=1" : b);
  const at = (p: Page) => p.evaluate(() => `${location.pathname}${location.search}`);
  const openMenu = async (p: Page) => { await p.locator("header.gn.dk-nav .gm-btn:visible").first().click(); await p.locator(".gm-panel").first().waitFor({ timeout: 10_000 }); };
  // The page's own links only: the system room shows specimen bars (.sys-spec) further down. Each is tagged so a
  // fresh load can click the same one.
  const BAR = "header.gn.dk-nav a.gg, header.gn.dk-nav .dk-layer a, header.gn.dk-nav a.dk-judge", MENU = ".gm-panel a.gm-view, .gm-panel a.gm-item";
  const links = (p: Page, sel: string, tag: string) => p.evaluate(([s, t]) => [...document.querySelectorAll<HTMLAnchorElement>(s)].filter((a) => a.getClientRects().length > 0 && !a.closest(".sys-spec")).map((a, i) => { a.dataset.lands = `${t}:${i}`; return { raw: a.getAttribute("href") ?? "", resolved: new URL(a.href).pathname + new URL(a.href).search, name: (a.textContent ?? "").trim().slice(0, 28) }; }), [sel, tag] as const);
  for (const [w, h] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    await ctx.addInitScript(() => { try { sessionStorage.setItem("gg-opened", "1"); } catch { /* fine */ } });
    const page = await ctx.newPage();
    let n = 0, bad = 0;
    for (const route of LAND_ROUTES) {
      await page.goto(base + route, { waitUntil: "load" });
      await page.waitForTimeout(400);
      // The wide bar's own views and judge door, then the menu's views and items.
      const bar = await links(page, BAR, "bar");
      await openMenu(page);
      const menu = await links(page, MENU, "menu");
      await page.keyboard.press("Escape");
      for (const [k, l] of [...bar.map((l, i) => ["bar", i, l] as const), ...menu.map((l, i) => ["menu", i, l] as const)].map(([where, i, l]) => [`${where}:${i}`, l] as const)) {
        n++;
        let got = l.resolved;
        if (w > 720) {
          // A real click: from the route, open the menu if the link is in it, click, and read where the page is.
          await page.goto(base + route, { waitUntil: "load" });
          await page.waitForTimeout(300);
          const where = k.split(":")[0];
          if (where === "menu") { await openMenu(page); await links(page, MENU, "menu"); }
          else await links(page, BAR, "bar");
          await page.locator(`[data-lands="${k}"]`).click();
          await page.waitForLoadState("load");
          await page.waitForTimeout(500);
          got = await at(page);
        }
        if (!same(got, want(l.raw))) { bad++; fails.push(`${w} lands from ${route}: "${l.name}" (${l.raw}) went to ${got}, not ${want(l.raw)}`); }
      }
    }
    rows.push(`lands\t${w}\t${LAND_ROUTES.length} routes\t${n} links ${w > 720 ? "clicked" : "resolved"}\t${bad ? `${bad} FAIL` : "OK"}`);
    await ctx.close();
  }
}
if (process.env.ONE_NAV_ONLY === "lands") {
  await lands();
  await browser.close();
  writeFileSync(`${out}/one-nav-lands.tsv`, [...rows, ...fails].join("\n") + "\n");
  console.log(rows.join("\n"));
  if (fails.length) { console.error(`one-nav lands: FAIL (${fails.length})\n  ${fails.slice(0, 40).join("\n  ")}`); process.exit(1); }
  console.log("one-nav lands: OK");
  process.exit(0);
}
await lands();
for (const [w, h] of SIZES) {
  const phone = w <= 720;
  for (const r of ROUTES) {
    const tag = `${w} ${r.path}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { sessionStorage.setItem("gg-opened", "1"); } catch { /* fine */ } });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 120)); });
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
    await page.goto(base + r.path, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const fail = (why: string) => fails.push(`${tag}: ${why}`);

    // Checklist §4: one real Tab from the page's top. A page that focused its room on load starts from the top too.
    await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      if (!a || a === document.body) return;
      a.blur();
      document.body.tabIndex = -1; document.body.focus(); document.body.removeAttribute("tabindex");
    });
    await page.keyboard.press("Tab");
    await page.waitForTimeout(250);
    const ring = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      if (!a?.matches(".gn-skip")) return { skip: false, what: a ? `${a.tagName.toLowerCase()}.${String(a.className).split(" ")[0]}` : "none" } as const;
      const c = getComputedStyle(a), r = a.getBoundingClientRect();
      const room = a.closest("header.gn")?.getAttribute("data-room") === "back" ? "Midnight" : "Velvet";
      return { skip: true, room, shown: r.top >= 0 && r.bottom <= innerHeight && r.width > 0,
        style: `${c.outlineStyle} ${c.outlineWidth} off ${c.outlineOffset} radius ${c.borderTopLeftRadius} ${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top)}`,
        colour: `ring ${c.outlineColor} ink ${c.color} on ${c.backgroundColor}`, ringIsInk: c.outlineColor === c.color } as const;
    });
    if (!ring.skip) fail(`one Tab from the top focused ${ring.what}, not the skip link`);
    else {
      if (!ring.shown) fail("the focused skip link isn't on screen");
      if (!ring.ringIsInk) fail(`the skip link's ring isn't its own ink (${ring.colour})`);
      rings.push({ tag, w, room: ring.room, style: ring.style, colour: ring.colour });
    }
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    const b0 = await bar(page);
    if (!b0) { fail("no bar drawn"); await ctx.close(); continue; }
    // One navigation means one bar: a page's own rule must not reach it (the tour's `.tr :where(button)` drew the menu
    // button at 17 px beside every other page's 15). Same type, size and place on every route at each width; its colour
    // follows the room (Velvet or Midnight), so it isn't compared.
    const menuType = await page.evaluate(() => {
      const e = [...document.querySelectorAll("header.gn .dk-menu")].find((x) => x.getClientRects().length);
      if (!e) return null;
      const c = getComputedStyle(e), r = e.getBoundingClientRect();
      return `${c.fontSize} ${c.fontWeight} ${c.fontFamily.split(",")[0]} ${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.left)}`;
    });
    if (menuType) menuTypes.push({ tag, w, style: menuType });
    await page.evaluate(() => scrollTo(0, 600));
    await page.waitForTimeout(200);
    const b1 = await bar(page);
    const canScroll = await page.evaluate(() => scrollY > 0);
    if (canScroll && b1!.top !== 0) fail(`the bar scrolled away (top ${b1!.top})`);
    const rail = await page.evaluate(() => [...document.querySelectorAll(".gn-rail, .dk-rail")].filter((e) => e.getBoundingClientRect().height > 0).length);
    if (rail) fail(`${rail} rail(s) drawn`);
    // A skip link with no target and a page with no h1 (Track X's axe run, the Desk and its panes). The route's own page only.
    const marks = await page.evaluate(() => ({ target: !!document.querySelector(document.querySelector(".gn-skip")?.getAttribute("href") ?? "#main"), h1s: document.querySelectorAll("h1").length }));
    if (!marks.target) fail("the skip link has no target");
    if (marks.h1s !== 1) fail(`${marks.h1s} h1s on the page`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (phone && overflow > 0) fail(`scrolls sideways by ${overflow} px`);
    await page.evaluate(() => document.fonts.ready);
    const L = await lockup(page);
    checkLockup(L, fail);

    // The skip link: the first Tab stop in the drawn page, a pill once focused. (A route with a hash opens its room and
    // focuses it on purpose, so the first stop is read in DOM order, then focused to read its style.)
    await page.evaluate(() => scrollTo(0, 0));
    const skip = await page.evaluate(() => {
      const tabbable = [...document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")]
        .filter((e) => e.tabIndex >= 0 && !e.closest("[inert], [hidden]") && (e.matches(".gn-skip") || e.getClientRects().length > 0))
        .filter((e) => { const bar = e.closest("header.gn.dk-nav"); return !bar || bar.getBoundingClientRect().height > 0; });
      const a = tabbable[0];
      a?.focus();
      return { n: document.querySelectorAll(".gn-skip").length, first: !!a?.matches(".gn-skip"), radius: a ? getComputedStyle(a).borderTopLeftRadius : "", shown: a ? a.getBoundingClientRect().top >= 0 : false };
    });
    // Owed by another track (logged, not hidden): the 404's body is R's (no skip link in it yet).
    const owed = r.path === "/no-such-page";
    if (!skip.first && !owed) fail("the skip link isn't the first Tab stop");
    if (skip.first && skip.radius !== "999px") fail(`the focused skip link isn't the one pill (radius ${skip.radius})`);

    // Tap 1: the bar's menu button.
    const btn = page.locator("header.gn.dk-nav .gm-btn:visible").first();
    const word0 = (await btn.innerText()).trim();
    if (phone && word0 !== "Menu") fail(`the phone button reads "${word0}", not "Menu"`);
    await btn.click();
    await page.waitForSelector(".gm-panel", { timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>(".gm-panel");
      const vis = (e: Element) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
      const items = [...document.querySelectorAll<HTMLElement>(".gm-item")];
      const cur = items.filter((i) => i.getAttribute("aria-current") === "page").map((i) => i.dataset["item"]);
      const dot = items.find((i) => i.getAttribute("aria-current") === "page");
      const dotBox = dot ? getComputedStyle(dot, "::before") : null;
      const name = dot?.querySelector(".gm-name")?.getBoundingClientRect();
      return {
        open: !!panel, top: Math.round(panel?.getBoundingClientRect().top ?? -1),
        ids: items.map((i) => i.dataset["item"]),
        lines: [...document.querySelectorAll(".gm-line")].filter(vis).length,
        rowH: Math.round(items[0]?.getBoundingClientRect().height ?? 0),
        views: [...document.querySelectorAll<HTMLElement>(".gm-view")].filter(vis).map((v) => `${v.textContent}${v.getAttribute("aria-current") ? "*" : ""}`),
        cur, dotW: dotBox?.width ?? "", dotGap: dot && name ? Math.round(name.left - (dot.getBoundingClientRect().left + parseFloat(dotBox!.left) + 3)) : null,
        word: (document.querySelector("header.gn.dk-nav .gm-btn[aria-expanded='true']") as HTMLElement | null)?.innerText.trim() ?? "",
      };
    });
    if (!m.open) { fail("the menu didn't open"); await ctx.close(); continue; }
    const missing = MENU_ITEMS.map((i) => i.id).filter((id) => !m.ids.includes(id));
    if (missing.length) fail(`the menu misses ${missing.join(", ")}`);
    if (phone) {
      if (m.top !== b1!.bottom && m.top !== b0.bottom) fail(`the sheet starts at ${m.top}, not under the bar`);
      if (m.word !== "Close") fail(`the open button reads "${m.word}", not "Close"`);
      if (m.lines) fail(`${m.lines} item lines shown on a phone (names only)`);
      if (m.rowH < 48) fail(`item rows ${m.rowH} px (< 48)`);
      if (m.views.length !== 3) fail(`views row: ${m.views.join(" · ")}`);
    }
    if (r.room && (m.cur.length !== 1 || m.cur[0] !== r.room)) fail(`current room ${m.cur.join(",") || "none"}, not ${r.room}`);
    if (m.cur.length && phone && (m.dotW !== "6px" || m.dotGap !== 16)) fail(`the dot is ${m.dotW}, its centre ${m.dotGap} px from the name (not 6px, 16)`);
    const shot = `${out}/${w}-${r.path.replace(/[^\w]+/g, "_").replace(/^_|_$/g, "") || "home"}-menu.png`;
    if (["/", "/?desk=1#wants", "/?desk=ledger"].includes(r.path)) await page.screenshot({ path: shot });

    // Close: the bar's button on a phone (the sheet's own head is for a screen reader), Esc on a wide screen.
    if (phone) await btn.click(); else await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const closed = await page.evaluate(() => !document.querySelector(".gm-panel") && !!document.activeElement?.matches(".gm-btn"));
    if (!closed) fail("closing left the panel open or focus off the button");

    const row = [w, r.path, `bar ${b0.pos} ${b0.top}-${b0.bottom}`, `after scroll top ${b1!.top}`, `rails ${rail}`, `overflow ${overflow}`, lockupCol(L),
      `skip ${skip.n} first=${skip.first} radius=${skip.radius}`, `tab ${rings.find((x) => x.tag === tag) ? `${rings.find((x) => x.tag === tag)!.room}: ${rings.find((x) => x.tag === tag)!.style}; ${rings.find((x) => x.tag === tag)!.colour}` : "no skip"}`, `button "${word0}"→"${m.word}"`, `items ${m.ids.length}/${MENU_ITEMS.length}`,
      phone ? `sheet top ${m.top} lines ${m.lines} row ${m.rowH}px views ${m.views.join("·")}` : "", `current ${m.cur.join(",") || "-"}${m.cur.length && phone ? ` dot ${m.dotW} gap ${m.dotGap}` : ""}`,
      `console errors ${errors.length}${errors.length ? ` (${errors.join(" | ")})` : ""}`].join("\t");
    rows.push(owed ? `${row}\tOWED (Needs from R: the 404 body's skip link; its 404 status is the console line)` : row);
    if (!owed && errors.length) fail(`console errors: ${errors.join(" | ")}`);
    await ctx.close();
  }
}
for (const [w, h] of [[320, 640], [390, 844], [1024, 768], [1280, 800]] as const) {
  for (const path of ["/", "/?desk=1", "/?wallet=1", "/safe.html", "/no-such-page"]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { sessionStorage.setItem("gg-opened", "1"); } catch { /* fine */ } });
    const page = await ctx.newPage();
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const L = await lockup(page);
    checkLockup(L, (why) => fails.push(`${w} ${path}: ${why}`));
    await page.screenshot({ path: `${out}/bar-${w}-${path.replace(/[^a-z0-9]+/gi, "_")}.png`, clip: { x: 0, y: 0, width: w, height: 72 } });
    rows.push([w, path, lockupCol(L)].join("\t"));
    await ctx.close();
  }
}
await browser.close();
for (const w of new Set(menuTypes.map((x) => x.w))) {
  const styles = [...new Set(menuTypes.filter((x) => x.w === w).map((x) => x.style))];
  if (styles.length !== 1) fails.push(`${w}: the bar's menu button differs by route: ${styles.map((st) => `${st} (${menuTypes.filter((x) => x.w === w && x.style === st).map((x) => x.tag.split(" ")[1]).join(", ")})`).join(" | ")}`);
}
// Checklist §4: one style per width, one colour pair per room, across every route.
for (const w of new Set(rings.map((x) => x.w))) {
  const styles = [...new Set(rings.filter((x) => x.w === w).map((x) => x.style))];
  if (styles.length !== 1) fails.push(`${w}: the skip link's ring differs by route: ${styles.map((st) => `${st} (${rings.filter((x) => x.w === w && x.style === st).map((x) => x.tag.split(" ")[1]).join(", ")})`).join(" | ")}`);
}
for (const room of new Set(rings.map((x) => x.room))) {
  const colours = [...new Set(rings.filter((x) => x.room === room).map((x) => x.colour))];
  if (colours.length !== 1) fails.push(`${room}: the skip link's colours differ by route: ${colours.join(" | ")}`);
}
rows.push(`skip ring\t${[...new Set(rings.map((x) => `${x.w}: ${x.style}`))].join(" | ")}\t${[...new Set(rings.map((x) => `${x.room}: ${x.colour}`))].join(" | ")}\t${rings.length} routes tabbed`);
writeFileSync(`${out}/one-nav.tsv`, rows.join("\n") + "\n");
console.log(rows.join("\n"));
if (fails.length) { console.error(`one-nav: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
console.log(`one-nav: OK (${ROUTES.length} routes at 390 and 1440: one sticky bar, no rail, skip link first, every item in 2 taps)`);

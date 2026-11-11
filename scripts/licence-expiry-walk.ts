// The Studio trial's last day, walked by the clock on a production build (Lead-12, Nov 5): a key that's in a build can't change
// after the build, so the only thing to test is the clock. It runs on a public host, because AG draws its mark on no local host.
// The gate shuts at the start of the day AG prints, in UTC (`licenceEnds`), which is 4 PM PT the day before.
//
// The build pretends to hold the licence, and AG sees no key, so while the gate is open this page shows what AG's own check shows
// when it rejects a key our date check accepted: AG's mark and its console banner. Past the date, none of that may remain.
//
//   GOOSE_FLIP_REHEARSAL=1 GOOSE_STUDIO_EXPIRY="20 December 2026" corepack pnpm --filter @goose/web build
//   (start the server on that build)
//   node scripts/licence-expiry-walk.ts <port>
//
// `LAST_MOMENT=1` walks only the far side of the date. Rebuild without the variables afterwards.

import { chromium, type Browser, type Page } from "playwright";

const PORT = Number(process.argv[2] ?? 8822);
const HOST = `http://goose.test:${PORT}`;
const ENDS = Date.UTC(2026, 11, 20);
const pt = (t: number) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "medium" }).format(t);

let misses = 0;
const check = (ok: boolean, what: string) => { if (!ok) misses++; console.log(`${ok ? "ok  " : "MISS"} ${what}`); };

const FIRST_FILE = "?desk=studio&studio=force";
const ADDRESSES = ["?desk=ledger", "?desk=studio", "?desk=ledger&studio=force", FIRST_FILE, "?studio=force"];
const MOMENTS = [
  { name: "the minute before the cut-over", at: ENDS - 60_000, studio: true },
  { name: "just after the cut-over", at: ENDS + 1000, studio: false },
];
const BANNER = /License Key Not Found|Invalid License|Incompatible License|License Expired|Trial Period Expired|AG Studio .* License|\*{20}|^\s*\*|unlocked for trial|Your license|ag-grid\.com|info@ag-grid/i;
const MARK = /For Trial Use Only|Trial Period Expired|License Expired|Invalid License/;

async function open(browser: Browser, address: string, at: number, width: number, height: number, noJs = false) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.clock.setSystemTime(at);
  const page = await ctx.newPage();
  const errors: string[] = [], banner: string[] = [], studioJs: string[] = [];
  let jsBytes = 0;
  page.on("console", (m) => {
    const t = m.text();
    if (BANNER.test(t)) banner.push(t);
    else if (m.type() === "error") errors.push(t.slice(0, 200));
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
  page.on("request", (r) => { if (/\/assets\/Studio-/.test(r.url())) studioJs.push(new URL(r.url()).pathname); });
  page.on("requestfinished", (r) => { if (/\.js(\?.*)?$/.test(r.url())) void r.sizes().then((s) => { jsBytes += s.responseBodySize; }).catch(() => {}); });
  if (noJs) await page.route(/\/assets\/.*\.js$/, (r) => r.abort());
  await page.goto(`${HOST}/${address}`, { waitUntil: "load" });
  return { ctx, page, errors, banner, studioJs, jsKb: () => Math.round(jsBytes / 1024) };
}

/** What AG's mark would be: its element, or its words anywhere on the page. */
const marks = (page: Page) => page.evaluate((src) => ({ el: document.querySelectorAll("[class*='watermark']").length, words: new RegExp(src).test(document.body.innerText) }), MARK.source);

async function settle(page: Page, studio: boolean) {
  if (studio) await page.waitForSelector('.st-studio[data-ready="1"]', { timeout: 90_000, state: "attached" }).catch(() => {});
  else await page.waitForSelector(".lx-main", { timeout: 60_000 }).catch(() => {});
  await page.waitForSelector(".tb-counter", { timeout: 60_000 }).catch(() => {});
  await page.waitForSelector(".tb-types canvas", { timeout: 60_000 }).catch(() => {});
  await page.evaluate(() => document.querySelector(".tb-tries")?.scrollIntoView());
  await page.waitForTimeout(3000);
}

const counts = (page: Page) => page.evaluate(() => ({
  ledger: document.querySelectorAll(".lx-main").length,
  everyDecision: document.querySelector(".spine-table")?.textContent?.length ?? 0,
  studio: document.querySelectorAll("[class*='ag-studio'], .st-page").length,
  rows: document.querySelectorAll(".ag-row").length,
  counter: document.querySelectorAll(".tb-counter").length,
  charts: document.querySelectorAll(".tb-types canvas").length,
  sideways: document.documentElement.scrollWidth > innerWidth + 1,
}));

const browser = await chromium.launch({ args: ["--host-resolver-rules=MAP goose.test 127.0.0.1"] });
try {
  for (const m of process.env.LAST_MOMENT ? MOMENTS.slice(-1) : MOMENTS) {
    console.log(`\n== ${m.name}: ${pt(m.at)} PT (${new Date(m.at).toISOString()}), Studio ${m.studio ? "on" : "off"}`);
    for (const [w, h] of [[1440, 900], [390, 844]] as const) {
      // One click to Studio from the landing, only while Studio stands. With no JS the first paint holds its room, hidden like
      // the rest of the hero under the headline (prerender.ts), so the page doesn't move when it lands; past the date, no room.
      for (const noJs of [false, true]) {
        const l = await open(browser, "", m.at, w, h, noJs);
        await l.page.waitForTimeout(noJs ? 800 : 3000);
        const see = l.page.locator(".dk-see a");
        const box = (await see.count()) ? await see.first().boundingBox() : null;
        const href = (await see.count()) ? await see.first().getAttribute("href") : null;
        const there = noJs ? (box?.height ?? 0) >= 44 : (await see.count()) > 0 && (await see.first().isVisible());
        check(there === m.studio && href?.endsWith("?desk=studio") === true, `${w} the landing${noJs ? ", with no JS" : ""}: "See it live in AG Studio" ${m.studio ? (noJs ? "holds its room" : "shows") : "is gone"}`);
        if (!noJs) check(l.errors.length === 0, `${w} the landing: zero console errors${l.errors.length ? `: ${l.errors.join(" | ")}` : ""}`);
        await l.ctx.close();
      }
      for (const a of ADDRESSES) {
        const label = `${w} ${a}`;
        const o = await open(browser, a, m.at, w, h);
        await settle(o.page, m.studio);
        const c = await counts(o.page);
        const mark = await marks(o.page);
        check(m.studio ? c.studio > 0 && c.ledger === 0 : c.ledger === 1 && c.studio === 0, `${label}: ${m.studio ? "Studio" : "the Community ledger"} (ledger ${c.ledger}, studio elements ${c.studio})`);
        check(c.counter > 0 && c.charts > 0, `${label}: the board drew (counter ${c.counter}, charts ${c.charts})`);
        check(w < 768 || c.rows > 0, `${label}: its table has rows (${c.rows})`);
        check(!c.sideways, `${label}: no sideways scroll`);
        check(o.errors.length === 0, `${label}: zero console errors${o.errors.length ? `: ${o.errors.join(" | ")}` : ""}`);
        if (m.studio) console.log(`     ${label}: with the gate open and AG holding no key: mark elements ${mark.el}, mark words ${mark.words}, banner lines ${o.banner.length}, JS ${o.jsKb()} KB`);
        else {
          check(mark.el === 0 && !mark.words && o.banner.length === 0, `${label}: no AG mark and no banner (elements ${mark.el}, words ${mark.words}, banner ${o.banner.length})`);
          check(o.studioJs.length === 0, `${label}: Studio's code isn't fetched (${o.studioJs.length} requests; JS ${o.jsKb()} KB)`);
        }
        await o.ctx.close();

        // The head, before any JS: past the date a typed address gets the ledger's own first paint, never Studio's.
        const f = await open(browser, a, m.at, w, h, true);
        await f.page.waitForTimeout(800);
        const first = await f.page.evaluate(() => ({ route: document.documentElement.getAttribute("data-first-route"), ledger: document.documentElement.hasAttribute("data-first-ledger") }));
        // `?studio=force` alone names no desk, so it has no first paint of either kind. `?desk=ledger&studio=force` is a developer's
        // address that isn't in the head's table, so it has no Studio file to fetch, and the ledger's paint still answers past the date.
        const noDesk = a === "?studio=force", noFile = noDesk || a === "?desk=ledger&studio=force";
        check(m.studio ? !first.ledger && (noFile ? first.route === null : first.route === "studio") : first.route === null && first.ledger === !noDesk, `${label}: with no JS, ${m.studio ? (noFile ? "no first paint of its own, and never the ledger's" : "Studio's first paint") : noDesk ? "no first paint, and never Studio's" : "the ledger's first paint"} (${JSON.stringify(first)})`);
        await f.ctx.close();
      }
      // Every view of the ledger and the board, on the far side of the date.
      if (!m.studio) {
        for (const a of ["?desk=ledger", "?ledger=full"]) {
          const o = await open(browser, a, m.at, w, h);
          if (a === "?ledger=full") { await o.page.waitForSelector(".spine-table", { timeout: 60_000 }).catch(() => {}); await o.page.waitForTimeout(3000); }
          else await settle(o.page, false);
          const before = await counts(o.page);
          const views = await o.page.locator(".tb-switch button").count();
          for (let i = 0; i < views; i++) { await o.page.locator(".tb-switch button").nth(i).click(); await o.page.waitForTimeout(500); }
          const after = await counts(o.page);
          const mark = await marks(o.page);
          // `?ledger=full` is "Every decision", the classic page's table full screen, with no board; the phone reads it as cards, not a grid.
          const board = a === "?desk=ledger";
          check((board ? before.ledger === 1 : before.everyDecision > 200) && (!board || after.counter > 0) && (w < 768 || after.rows > 0) && !after.sideways && o.errors.length === 0 && mark.el === 0 && !mark.words && o.studioJs.length === 0 && o.banner.length === 0, `${w} ${a}: the ledger${board ? ` and all ${views} of the board's views` : ""} draw in Community (rows ${after.rows}, charts ${after.charts}, errors ${o.errors.length}, mark ${mark.el}, banner ${o.banner.length})`);
          await o.ctx.close();
        }
      }
    }
  }
} finally {
  await browser.close();
}
console.log(misses ? `\nlicence-expiry-walk: ${misses} MISS` : "\nlicence-expiry-walk: all ok");
process.exit(misses ? 1 : 0);

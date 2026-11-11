// Usage: node scripts/first-routes-probe.ts [base-url]   (a production server: the static preview has no /api)
// Track F: the pages the build draws to their own file (web/prerender-routes.ts). What cold-routes.ts can't see:
// - the page's words are on screen with no JS at all (every script blocked but the page's inline ones);
// - React adopts that HTML: the h1 on screen before the chunk is the same element after it, and React reported no
//   mismatch (`__firstMiss`). A mismatch still looks right to a shopper, so nothing else would say so; it just costs
//   the second draw and the late largest paint this exists to end;
// - an address it wasn't drawn for, a tour with ticks in this browser, and a lost file all still draw the page;
// - no console errors, and each page's layout shift, by element, so a shift the first paint adds has a name.
import "./route-closed.ts"; // a route mid-request when its page closes ends quietly, nothing else does
import { chromium, type BrowserContext, type Page } from "playwright";
import { FIRST_ROUTES } from "../web/prerender-routes.ts";

const BASE = (process.argv[2] ?? "http://localhost:8821").replace(/\/$/, "");
const SIZES = [{ name: "390", viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, { name: "1440", viewport: { width: 1440, height: 900 } }];
// Above this a page's shift gets a look, not a failure on one run: the Lead's 0.1 is "poor", and these were 0-0.01 before.
const SHIFT_MAX = 0.02;
// The forced address has a first paint only on a build with a good licence or a flip rehearsal (web/prerender-routes.ts), so a keyless build's walk leaves it out, read off the page itself.
const page0 = await (await fetch(`${BASE}/`)).text();
const ADDRESSES = [...FIRST_ROUTES.filter((r) => page0.includes(`"${r.address}"`)).map((r) => `/${r.address}`), "/safe.html"];
if (FIRST_ROUTES.length - ADDRESSES.length + 1 > 1 || !ADDRESSES.some((a) => a.includes("desk=how"))) throw new Error(`first-routes-probe: the page lists only ${ADDRESSES.length - 1} of ${FIRST_ROUTES.length} first routes; more than Studio's is missing`);
const browser = await chromium.launch();
let bad = 0;
const fail = (s: string) => { bad++; console.log(`FAIL ${s}`); };

// The wallet's server, as live says it: the first paint carries the practice-site line, and only a server that isn't PayPal's
// sandbox takes it away. Read on a fake server these rows would measure a jump no visitor can reach (loopback only).
const saysSandbox = (page: Page) => page.route(/\/api\/health/, async (r) => { const res = await r.fetch(); await r.fulfill({ json: { ...(await res.json()), payment: "sandbox" } }); });

const fresh = async (size: (typeof SIZES)[number]): Promise<{ ctx: BrowserContext; page: Page; errs: string[] }> => {
  const { name: _name, ...opts } = size;
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errs: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => errs.push(`pageerror ${e.message.slice(0, 160)}`));
  page.on("response", (r) => { if (r.status() >= 400) errs.push(`${r.status()} ${r.url()}`); });
  return { ctx, page, errs };
};
const settled = (page: Page) => page.waitForFunction(() => { const r = document.getElementById("root"); return !!r && Object.keys(r).some((k) => k.startsWith("__reactContainer")); }, undefined, { timeout: 15_000 });

for (const size of SIZES) {
  for (const a of ADDRESSES) {
    const label = `${size.name} ${a}`;
    // No JS: the words stand on the HTML alone. Blocks the modules, not the page's inline scripts.
    {
      const { ctx, page } = await fresh(size);
      await page.route(/\/assets\/.*\.js$/, (r) => r.abort());
      await page.goto(BASE + a, { waitUntil: "load" });
      await page.waitForFunction(() => (window as unknown as { __firstIn?: number }).__firstIn === 1, undefined, { timeout: 5000 }).catch(() => fail(`${label}: the first paint never went in without JS`));
      const h1 = await page.evaluate(() => { const h = document.querySelector("#root h1, h1"); const b = h?.getBoundingClientRect(); return b && b.height > 0 ? h!.textContent : null; });
      if (!h1) fail(`${label}: no visible h1 without JS`);
      // DD, Nov 4: safe.html's first paint said "Spend at most …." A blank still to fill never carries the sentence's stop.
      const blank = await page.evaluate(() => document.body.innerText.match(/…[.,:;!?]/)?.[0]);
      if (blank) fail(`${label}: an unfilled blank reads "${blank}"`);
      await ctx.close();
    }
    // DD, Nov 4: safe.html's Next dropped 30 px under a thumb when its limits came in. A link or button on the first screen
    // stays where the first paint drew it, whatever fills in around it. A layout-shift score can't say so: 30 px low on
    // the screen scored under SHIFT_MAX.
    {
      const stops = async (js: boolean, noApi = false) => {
        const { ctx, page } = await fresh(size);
        if (noApi) await page.route(/\/api\//, (r) => r.abort());
        if (!js) await page.route(/\/assets\/.*\.js$/, (r) => r.abort());
        await page.goto(BASE + a, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(js ? 2500 : 400);
        const out = await page.evaluate(() => [...document.querySelectorAll("#root a, #root button")].map((e) => { const b = e.getBoundingClientRect(); return { k: (e.textContent ?? "").trim().slice(0, 34), top: Math.round(b.top + scrollY), shown: b.height > 0, fold: b.top < innerHeight }; }).filter((x) => x.shown));
        await ctx.close();
        return out;
      };
      // Track F, Nov 4: and with the API down (asleep on the host, or the mirror). A note that only shows then was invisible here.
      // Each visitor's own first paint against their own settled page (Track F, Nov 6): Studio's file carries the board's
      // first lines, which the head's early answer fills with no module at all, so with the API down the first paint says
      // "Reading the record…" and never the words a reachable record gives. Measuring one visitor's first paint against the
      // other's settled page reads the record's own words as a jump.
      const first = await stops(false), late = await stops(true), firstAway = await stops(false, true), away = await stops(true, true);
      for (const [when, settled, from] of [["settled", late, first], ["settled with no API", away, firstAway]] as const) for (const f of from.filter((x) => x.fold)) {
        // Two links can say the same words (Proof has two "0 of 40"): compare with the nearest, or a page that never moved reads as a jump.
        const l = settled.filter((x) => x.k === f.k).sort((x, y) => Math.abs(x.top - f.top) - Math.abs(y.top - f.top))[0];
        if (l && Math.abs(l.top - f.top) > 2) fail(`${label}: "${f.k}" moved from ${f.top} to ${l.top} when the page ${when}`);
      }
    }
    // The face swap: this page now paints before its web faces land, so a line that wraps differently in the fallback
    // moves everything under it when they do (safe.html's "if" line, 0.0098, which the old path never had). On a fast
    // local server the faces beat the paint and no shift shows, so it's measured directly: every text block on the first
    // screen, its height in the fallback against its height in the real face.
    {
      const blocks = async (noFaces: boolean) => {
        const { ctx, page } = await fresh(size);
        await page.route(/\/assets\/.*\.js$/, (r) => r.abort());
        if (noFaces) await page.route(/\.woff2$/, (r) => r.abort());
        await page.goto(BASE + a, { waitUntil: "load" });
        await page.waitForFunction(() => (window as unknown as { __firstIn?: number }).__firstIn === 1, undefined, { timeout: 5000 }).catch(() => {});
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(150);
        const out = await page.evaluate(() => [...document.querySelectorAll("#root :is(h1,h2,h3,p,li,a,button,dd,dt)")].map((e) => { const b = e.getBoundingClientRect(); return { at: `${e.tagName}.${String(e.className).slice(0, 24)} "${(e.textContent ?? "").slice(0, 32)}"`, top: b.top, h: b.height, fold: innerHeight }; }));
        await ctx.close();
        return out;
      };
      const fallback = await blocks(true), real = await blocks(false);
      if (fallback.length !== real.length) fail(`${label}: ${fallback.length} blocks in the fallback, ${real.length} in the real face`);
      for (const [i, f] of fallback.entries()) {
        const r = real[i];
        if (r && f.top < f.fold && Math.abs(f.h - r.h) > 2) fail(`${label}: ${f.at} is ${f.h.toFixed(0)} px in the fallback, ${r.h.toFixed(0)} in the real face`);
      }
    }
    // With JS: the same h1 element, adopted; no miss; no error; the shift, by element.
    {
      const { ctx, page, errs } = await fresh(size);
      await page.addInitScript(() => {
        const w = window as unknown as { __shift: { v: number; on: string[] } };
        w.__shift = { v: 0, on: [] };
        new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean; sources?: { node?: Element }[] }[]) { if (e.hadRecentInput) continue; w.__shift.v += e.value; w.__shift.on.push(`${e.value.toFixed(4)} ${(e.sources ?? []).map((s) => (s.node as Element | undefined)?.className || s.node?.nodeName).join(",").slice(0, 80)}`); } }).observe({ type: "layout-shift", buffered: true });
      });
      await page.goto(BASE + a, { waitUntil: "commit" });
      await page.waitForFunction(() => (window as unknown as { __firstIn?: number }).__firstIn === 1 || !!(document.getElementById("root")?.firstChild), undefined, { timeout: 15_000 });
      await page.evaluate(() => { (window as unknown as { __h: Element | null }).__h = document.querySelector("#root h1, #root h2"); });
      await settled(page);
      await page.waitForTimeout(1500);
      // Studio's page: the dashboard takes the shell's place by design, its own heading in its own tree. "Adopted" is about the shell.
      await page.evaluate(() => { const w = window as unknown as { __h: Element | null }; if (document.querySelector('[data-studio-layer="shown"]')) w.__h = null; });
      const r = await page.evaluate(() => { const w = window as unknown as { __h: Element | null; __firstIn?: number; __firstMiss?: string[]; __shift: { v: number; on: string[] } }; return { same: !w.__h || w.__h === document.querySelector("#root h1, #root h2") || w.__h.isConnected, inFirst: w.__firstIn, miss: w.__firstMiss ?? [], shift: w.__shift }; });
      if (r.inFirst !== 1) fail(`${label}: the page's own file never went in`);
      if (r.miss.length) fail(`${label}: React couldn't adopt the first paint: ${r.miss.join(" | ")}`);
      if (!r.same) fail(`${label}: the heading was drawn again, not adopted`);
      if (errs.length) fail(`${label}: ${errs.join(" | ")}`);
      if (r.shift.v > SHIFT_MAX) fail(`${label}: layout shift ${r.shift.v.toFixed(4)}`);
      console.log(`ok? ${label.padEnd(20)} shift ${r.shift.v.toFixed(4)}${r.shift.on.length ? `  ${r.shift.on.join(" ; ")}` : ""}`);
      await ctx.close();
    }
  }
}

// The practice line waits for the page. A race on a fast link and a certainty on a slow file, so the file is held here: it
// painted under the header, then jumped about 750 px (`?market=1`: 1 load in 6 on live, Nov 4), and one plain run only
// sometimes saw it. Every address where the line shows, with a first file and without one.
for (const a of ["?market=1", "?market=1&x=1"]) {
  const { ctx, page } = await fresh(SIZES[0]!);
  await page.addInitScript(() => {
    const w = window as unknown as { __jump: number };
    w.__jump = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { hadRecentInput: boolean; value: number; sources?: { node?: Element }[] }[]) if (!e.hadRecentInput && e.sources?.some((x) => x.node?.nodeName === "FOOTER")) w.__jump += e.value; }).observe({ type: "layout-shift", buffered: true });
  });
  await page.route(/\/first\/|StoreSync-[\w-]+\.js/, async (r) => { await new Promise((d) => setTimeout(d, 500)); await r.continue(); });
  await page.goto(`${BASE}/${a}`, { waitUntil: "commit" });
  await page.waitForFunction(() => !!document.getElementById("root")?.firstChild, undefined, { timeout: 15_000 });
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => ({ jump: (window as unknown as { __jump: number }).__jump, shown: getComputedStyle(document.querySelector(".gn-footer")!).visibility }));
  if (r.jump > 0) fail(`${a}: the practice line jumped when the page landed (${r.jump.toFixed(4)})`);
  if (r.shown !== "visible") fail(`${a}: the practice line never showed (${r.shown})`);
  console.log(`ok? ${a.padEnd(20)} practice line: jump ${r.jump.toFixed(4)}, ${r.shown}`);
  await ctx.close();
}

// The classic page draws, then the server's answers add a line to a card and the count under the cards. Held back here, so
// they always land after the paint: at 1440 they read 0.108 on every load (live 0.164, Nov 4), past the Lead's 0.1.
for (const size of SIZES) {
  const { ctx, page } = await fresh(size);
  await page.addInitScript(() => {
    const w = window as unknown as { __late: number };
    w.__late = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { hadRecentInput: boolean; value: number }[]) if (!e.hadRecentInput) w.__late += e.value; }).observe({ type: "layout-shift", buffered: true });
  });
  await page.route(/\/api\/(judge|control)$/, async (r) => { await new Promise((d) => setTimeout(d, 500)); await r.continue(); });
  await page.goto(`${BASE}/?wallet=0`, { waitUntil: "commit" });
  await page.waitForSelector(".pair", { timeout: 15_000 });
  await page.waitForTimeout(1500);
  const late = await page.evaluate(() => (window as unknown as { __late: number }).__late);
  const label = `${size.name} /?wallet=0`;
  if (late > SHIFT_MAX) fail(`${label}: the server's answers moved the page (${late.toFixed(4)})`);
  console.log(`ok? ${label.padEnd(20)} late lines: shift ${late.toFixed(4)}`);
  await ctx.close();
}

// The wallet's first paint isn't a first file (web/prerender.ts) but owes the same. Server up, nothing on the first screen
// moves. API down, the deal and everything above it hold; the away slip under Approve may push what's below it, because
// reserving its room would leave a hole on every normal visit.
for (const size of SIZES) {
  const read = async (js: boolean, noApi: boolean) => {
    const { ctx, page } = await fresh(size);
    if (noApi) await page.route(/\/api\//, (r) => r.abort());
    else await saysSandbox(page);
    if (!js) await page.route(/\/assets\/.*\.js$/, (r) => r.abort());
    await page.goto(`${BASE}/?wallet=1`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(js ? 2500 : 400);
    const out = await page.evaluate(() => ({ deal: document.querySelector("#hero-h")?.getBoundingClientRect().top ?? null, stops: [...document.querySelectorAll("#root a, #root button")].map((e) => { const b = e.getBoundingClientRect(); return { k: (e.textContent ?? "").trim().slice(0, 34), top: Math.round(b.top + scrollY), shown: b.height > 0, fold: b.top < innerHeight }; }).filter((x) => x.shown) }));
    await ctx.close();
    return out;
  };
  const first = await read(false, false);
  if (first.deal === null) fail(`${size.name} wallet: no deal in the first paint`);
  for (const noApi of [false, true]) {
    const late = await read(true, noApi);
    const when = noApi ? "with no API" : "with the server up";
    if (Math.abs((late.deal ?? 0) - (first.deal ?? 0)) > 2) fail(`${size.name} wallet: the deal moved ${when}: ${first.deal} to ${late.deal}`);
    for (const f of first.stops.filter((x) => x.fold && (!noApi || x.top < (first.deal ?? 0)))) {
      const l = late.stops.filter((x) => x.k === f.k).sort((x, y) => Math.abs(x.top - f.top) - Math.abs(y.top - f.top))[0];
      if (l && Math.abs(l.top - f.top) > 2) fail(`${size.name} wallet: "${f.k}" moved from ${f.top} to ${l.top} ${when}`);
    }
    console.log(`ok? ${size.name} wallet ${when}: the deal ${first.deal} to ${late.deal}`);
  }
}

// The two ends agreeing doesn't prove the road between: with /api/config slow, the block under Approve used to collapse
// 44 px and come back once it answered. Every frame, from first paint to settled, what's under Approve stays within 2 px.
{
  const { ctx, page } = await fresh(SIZES[0]!);
  await page.addInitScript(() => {
    const w = window as unknown as { __tops: number[] };
    w.__tops = [];
    const tick = () => { const e = document.querySelector(".hero .below"); if (e) w.__tops.push(e.getBoundingClientRect().top + scrollY); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await saysSandbox(page);
  await page.route(/\/api\/config/, async (r) => { await new Promise((x) => setTimeout(x, 1200)); await r.continue(); });
  await page.goto(`${BASE}/?wallet=1`, { waitUntil: "load" });
  await page.waitForTimeout(3000);
  const tops = await page.evaluate(() => (window as unknown as { __tops: number[] }).__tops);
  const range = tops.length ? Math.max(...tops) - Math.min(...tops) : Infinity;
  if (range > 2) fail(`${SIZES[0]!.name} wallet: what's under Approve moved ${range.toFixed(1)} px on the way to settled, with /api/config slow`);
  console.log(`ok? ${SIZES[0]!.name} wallet: under Approve held to ${range.toFixed(1)} px over ${tops.length} frames with /api/config slow`);
  await ctx.close();
}

// The landing's egg is its largest image: it starts with the first wave, ahead of the sheets. A script below the sheets
// waits for them, which put the egg in with the Desk's scripts: 15.5 KB took 500 ms and landed about 1060 ms on live.
{
  const { ctx, page } = await fresh(SIZES[0]!);
  await page.goto(`${BASE}/?desk=1`, { waitUntil: "load" });
  const r = await page.evaluate(() => { const res = performance.getEntriesByType("resource") as PerformanceResourceTiming[]; return { egg: res.find((x) => /\/egg-[\w-]+\.webp$/.test(x.name))?.startTime ?? null, sheets: Math.min(...res.filter((x) => /\.css$/.test(x.name)).map((x) => x.responseEnd)) }; });
  if (r.egg === null || r.egg >= r.sheets) fail(`${SIZES[0]!.name} landing: the egg was asked for at ${r.egg}, after the first sheet landed at ${r.sheets}`);
  console.log(`ok? ${SIZES[0]!.name} landing: the egg asked for at ${r.egg?.toFixed(0)} ms, the first sheet in at ${r.sheets.toFixed(0)} ms`);
  await ctx.close();
}

// Behind the scenes: the board's real words are in the first paint, stay put through React and the chunk, and cost one request.
// A shopper once looked at an empty space under the hero for 2.1 s, and largest paint read 2.8 s, for words that need one answer.
for (const size of SIZES) {
  const answer = await (await fetch(`${BASE}/api/challenge`)).json() as { words: { line: string; second: string } | null };
  if (!answer.words) { fail(`${size.name} ledger: /api/challenge sent no words`); continue; }
  const noJs = await fresh(size);
  await noJs.page.route(/\.js(\?.*)?$/, (r) => r.abort());
  await noJs.page.goto(`${BASE}/?desk=ledger`, { waitUntil: "load" });
  await noJs.page.waitForFunction(() => document.querySelector(".tb-second")?.textContent !== "", undefined, { timeout: 5000 }).catch(() => {});
  const said = await noJs.page.evaluate(() => ({ h: document.querySelector("#tb-h")?.textContent ?? "", s: document.querySelector(".tb-second")?.textContent ?? "" }));
  if (said.h.trim() !== answer.words.line || said.s !== answer.words.second) fail(`${size.name} ledger: with no JS the board says "${said.h}" / "${said.s}", the record says "${answer.words.line}" / "${answer.words.second}"`);
  await noJs.ctx.close();

  const { ctx, page, errs } = await fresh(size);
  let asked = 0;
  page.on("request", (r) => { if (/\/api\/challenge$/.test(r.url())) asked++; });
  await page.addInitScript(() => { const w = window as unknown as { __tops: number[]; __steps: Set<string> }; w.__tops = []; w.__steps = new Set(); const t = () => { const el = document.querySelector(".tb-second"); if (el?.textContent) { w.__tops.push(el.getBoundingClientRect().top + scrollY); w.__steps.add(document.querySelector("[data-board]")?.getAttribute("data-board") ?? ""); } requestAnimationFrame(t); }; requestAnimationFrame(t); });
  // The board's chunk held back, so the room's copy has to carry the words for a while, as on a cold phone.
  await page.route(/threat-widgets|ThreatBoard/, async (r) => { await new Promise((x) => setTimeout(x, 800)); await r.continue(); });
  await page.goto(`${BASE}/?desk=ledger`, { waitUntil: "load" });
  await page.waitForSelector('#tb-h[data-tried]', { timeout: 20000 });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => { const w = window as unknown as { __tops: number[]; __steps: Set<string> }; return { low: Math.min(...w.__tops), high: Math.max(...w.__tops), steps: [...w.__steps] }; });
  if (r.high - r.low > 2) fail(`${size.name} ledger: the board's second line moved ${(r.high - r.low).toFixed(1)} px from the first paint to the board`);
  // The page's own steps: the ledger's room and its shell table, or, once the Studio flip sends this address to Studio's
  // file (live until the licence's day), that file's first lines and the shell's counter card (Track F, Nov 6).
  const studio = await page.evaluate(() => !!document.querySelector(".st-page"));
  const want = studio ? ["paint", "shell"] : ["room", "fallback"];
  if (!want.every((x) => r.steps.includes(x))) fail(`${size.name} ledger${studio ? " (Studio)" : ""}: the words weren't there at each step: ${r.steps.join(", ")}; want ${want.join(", ")}`);
  if (asked !== 1) fail(`${size.name} ledger: ${asked} requests for /api/challenge in the first moments, not 1`);
  if (errs.length) fail(`${size.name} ledger: ${errs.join(" | ")}`);
  console.log(`ok? ${size.name} ledger: the board's words at ${r.steps.join(" > ")}, moved ${(r.high - r.low).toFixed(1)} px, ${asked} request`);
  await ctx.close();
}

// Everything else draws the page as ever, from its chunk.
const phone = SIZES[0]!;
for (const [what, a, setup] of [
  ["another query", "/?desk=how&palette=v", null],
  ["a hash", "/?desk=proof#nope", null],
  ["ticks in this browser", "/?desk=tour", (p: Page) => p.addInitScript(() => localStorage.setItem("goose_tour", JSON.stringify(["ask"])))],
  ["the file lost", "/?desk=haggle", (p: Page) => p.route(/\/first\//, (r) => r.abort())],
  ["safe's file lost", "/safe.html", (p: Page) => p.route(/\/first\//, (r) => r.abort())],
] as const) {
  const { ctx, page, errs } = await fresh(phone);
  await setup?.(page);
  await page.goto(BASE + a, { waitUntil: "load" });
  await settled(page);
  const r = await page.evaluate(() => ({ inFirst: (window as unknown as { __firstIn?: number }).__firstIn, h: !!document.querySelector("#root h1, #root h2, #root .ch") }));
  if (r.inFirst) fail(`${what} (${a}): took the first paint`);
  if (!r.h) fail(`${what} (${a}): the page didn't draw`);
  // A lost file is the one failed request a shopper can't see; the abort itself is logged as an error, so it isn't counted.
  const real = errs.filter((e) => !/ERR_FAILED|net::/.test(e));
  if (real.length) fail(`${what} (${a}): ${real.join(" | ")}`);
  console.log(`ok? ${what}`);
  await ctx.close();
}
await browser.close();
console.log(bad ? `\nfirst-routes: ${bad} failed` : "\nfirst-routes: every page paints from its own file, React adopts it, and every other way in still draws");
process.exit(bad ? 1 : 0);

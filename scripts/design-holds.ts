// What Round 5's DD found by eye, held by a probe, each for its whole kind and not only the screen it was seen on:
//   - no browser control left raw: every drawn <select> and date field on every route has its appearance off (B3)
//   - nothing sticks under the bar: a sticky element's top clears the bar, on every route (B4, safe.html's step rail)
//   - a chart's drawing fits its box, on every route, and the haggle's clears the card under it (B2: the box kept a phone's height
//     from the first paint, so the chart spilled onto the card, at normal motion only), and the list's room is lit like the others (B3)
//   - the charts are there to look at: each page is walked top to foot, since a chart mounts only as it comes near (charts/Chart.tsx),
//     and a route that should draw charts fails with fewer painted, as does any canvas left blank (Q, Nov 4: this passed with none)
// Needs a server: it presses "Start with the demo list" on it, so never point it at live. Presses no Approve.
//   node scripts/design-holds.ts [url] [stills-dir]   default http://localhost:8823
import { readFileSync } from "node:fs";
import { localOnly } from "./not-live.ts";
import { parseRecorded, ReferencePrices } from "../server/src/adapters/channel3.ts";

const url = localOnly((process.argv[2] ?? "http://localhost:8823").replace(/\/$/, ""));
const stills = process.argv[3];
const { chromium } = await import(`${process.cwd()}/node_modules/playwright/index.mjs`);
const ROUTES = ["/", "/?desk=1", "/?desk=wants", "/?desk=list", "/?desk=ledger", "/?desk=studio", "/?desk=proof", "/?desk=how", "/?desk=haggle", "/?desk=tour", "/?market=1", "/?wallet=1", "/?wallet=0", "/safe.html"];
/** Charts painted once the page is walked. "Fits its box" holds of every chart it finds, so finding none passed: these say how many there must be. */
const CHARTS: Record<string, number> = { "/?desk=ledger": 7, "/?desk=studio": 7, "/?desk=haggle": 1 };
const browser = await chromium.launch();
const fails: string[] = [];
let looked = 0;
// Normal motion, as most people see it: reduced motion took a path that happened to hide B2. 1024 is where the haggle stacks.
for (const [width, height] of process.env.ROOM_ONLY ? [] : [[390, 844], [1024, 768], [1440, 900]] as const) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: "dark" });
  const page = await ctx.newPage();
  for (const route of ROUTES) {
    await page.goto(url + route, { waitUntil: "load" });
    await page.waitForTimeout(900);
    if (route === "/?desk=list") {
      const demo = page.getByRole("button", { name: "Start with the demo list" });
      if (await demo.count()) await demo.click();
      await page.locator(".xl-gift").first().waitFor({ timeout: 10_000 });
      await page.waitForTimeout(400);
      if ((await page.locator(".dk.xl").getAttribute("data-layer")) !== "shopper") fails.push(`${width} ${route}: the room isn't lit (no data-layer="shopper")`);
      if (stills) await page.screenshot({ path: `${stills}/list-${width}.png` });
    }
    if (route === "/?desk=haggle") {
      await page.locator(".hg-canvas canvas").first().waitFor({ state: "attached", timeout: 15_000 }).catch(() => {});
      const m = await page.evaluate(() => {
        const c = document.querySelector(".hg-canvas canvas")?.getBoundingClientRect(), e = document.querySelector(".hg-end")?.getBoundingClientRect();
        return c && e ? { canvas: Math.round(c.bottom), card: Math.round(e.top) } : null;
      });
      if (!m) fails.push(`${width} ${route}: no chart and card to measure, so nothing was held`);
      else if (m.card < m.canvas) fails.push(`${width} ${route}: the card starts at ${m.card}, over the chart's labels down to ${m.canvas}`);
      if (stills) { await page.locator(".hg-end").first().scrollIntoViewIfNeeded(); await page.waitForTimeout(150); await page.screenshot({ path: `${stills}/haggle-${width}.png` }); }
    }
    // Top to foot and back, measuring the foot again at each stop, as a page can grow while it's walked. One that never ends is a failure, not a quiet stop.
    for (let y = 0, stops = 0; ; stops++) {
      if (stops >= 80) { fails.push(`${width} ${route}: more than 80 screens`); break; }
      const next: number = await page.evaluate((from: number) => { scrollTo({ top: from + Math.round(innerHeight * 0.75), behavior: "instant" }); return Math.round(scrollY); }, y);
      if (next <= y) break;
      y = next;
      await page.waitForTimeout(60);
    }
    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
    // Painted means a pixel that isn't clear (a box that kept its height with nothing in it reads the same as a chart to the eye of `getClientRects`).
    const want = CHARTS[route] ?? 0;
    const paints = (): Promise<{ drawn: number; painted: number }> => page.evaluate(() => {
      const cs = [...document.querySelectorAll("canvas")].filter((c) => c.getClientRects().length > 0 && c.width > 0 && c.height > 0);
      const inked = (c: HTMLCanvasElement) => {
        const d = c.getContext("2d")?.getImageData(0, 0, c.width, c.height).data;
        if (d) for (let i = 3; i < d.length; i += 4) if (d[i]) return true;
        return false;
      };
      return { drawn: cs.length, painted: cs.filter(inked).length };
    });
    let seen = await paints();
    for (const until = Date.now() + 15_000; (seen.painted < want || seen.painted < seen.drawn) && Date.now() < until; seen = await paints()) await page.waitForTimeout(200);
    if (seen.painted < want) fails.push(`${width} ${route}: ${seen.painted} charts painted of the ${want} this page draws`);
    if (seen.painted < seen.drawn) fails.push(`${width} ${route}: ${seen.drawn - seen.painted} of ${seen.drawn} canvases drawn with nothing on them`);
    looked += seen.painted;
    const found: { raw: string[]; under: string[]; spills: string[] } = await page.evaluate(() => {
      const named = (e: Element) => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ""}${typeof e.className === "string" && e.className ? `.${e.className.split(" ")[0]}` : ""}`;
      const drawn = (e: Element) => e.getClientRects().length > 0;
      const raw = [...document.querySelectorAll('select, input[type="date"]')].filter((e) => drawn(e) && getComputedStyle(e).appearance !== "none").map(named);
      // Two headers can be in the page: the one drawn is the bar.
      const bars = [...document.querySelectorAll("header.gn, nav.gn, .gn")].filter((b) => drawn(b) && /sticky|fixed/.test(getComputedStyle(b).position));
      const bar = Math.max(0, ...bars.map((b) => b.getBoundingClientRect().height));
      // Sticky to its own scroller (a grid's pinned rows) is sticky to that box, and never meets the bar.
      const toPage = (e: Element) => {
        for (let up = e.parentElement; up && up !== document.body && up !== document.documentElement; up = up.parentElement) {
          if (getComputedStyle(up).overflowY !== "visible") return false;
        }
        return true;
      };
      const under = [...document.querySelectorAll("body *")].filter((e) => {
        if (!drawn(e) || e.closest(".gn")) return false;
        const s = getComputedStyle(e);
        return s.position === "sticky" && s.top !== "auto" && parseFloat(s.top) < bar - 1 && toPage(e);
      }).map((e) => `${named(e)} top ${getComputedStyle(e).top} under a ${Math.round(bar)} px bar`);
      // A drawing past the foot of a box that doesn't clip it lands on whatever comes next.
      const spills = [...document.querySelectorAll("canvas")].filter(drawn).filter((c) => /static|relative/.test(getComputedStyle(c).position)).flatMap((c) => {
        const foot = c.getBoundingClientRect().bottom;
        for (let up = c.parentElement; up && up !== document.body; up = up.parentElement) {
          const b = up.getBoundingClientRect().bottom;
          if (b > foot + 1) return [];
          if (b < foot - 1 && getComputedStyle(up).overflowY === "visible") return [`a chart draws ${Math.round(foot - b)} px past ${named(up)}`];
        }
        return [];
      });
      return { raw: [...new Set(raw)], under: [...new Set(under)], spills };
    });
    for (const r of found.raw) fails.push(`${width} ${route}: ${r} is a raw browser control`);
    for (const u of [...found.under, ...found.spills]) fails.push(`${width} ${route}: ${u}`);
    if (route === "/safe.html" && stills) { await page.evaluate(() => scrollTo(0, 780)); await page.waitForTimeout(200); await page.screenshot({ path: `${stills}/safe-${width}.png` }); }
    console.log(`${width} ${route}: looked`);
  }
  await ctx.close();
}
// The landing's real prices land late, under the demo, and pushed everything below them down (0.42 at 390 on live, Nov 5). Their room is held from the first
// paint by a fitted formula (story.css `.ds-real`), which goes stale the moment the panel's words change, so this fails when the room and the panel drift apart.
// A visitor jumps straight there, with the answer held back so it can't land before the jump. With no answer at all, as on the Pages mirror, no hole is left.
const ROOM_DRIFT = 32, ROOM_SHIFT = 0.05;
// The answer on a fixed clock (R's clock sweep, Fri Nov 6): the server shows its recording for RECORDED_MAX_DAYS after it was
// made, by the real clock, so from Dec 25 /api/prices says "none" and the panel this measures never draws. The walk answers
// /api/prices itself with the server's own ReferencePrices and the same recording, its clock a day after the newest call in it
// (no key, so it never calls out). What the panel draws is the server's answer, only no longer the calendar's.
const RECORDED = parseRecorded(JSON.parse(readFileSync(new URL("../docs/fixtures/channel3-recorded.json", import.meta.url), "utf8")));
const RECORDED_NOW = Math.max(...Object.values(RECORDED?.queries ?? {}).map((q) => Date.parse(q.fetchedAt))) + 86_400_000;
const PRICES = new ReferencePrices({ key: undefined, fetch: () => Promise.reject(new Error("no live call in a walk")), now: () => RECORDED_NOW, recorded: RECORDED, warn: () => {} });
if (!RECORDED || !Number.isFinite(RECORDED_NOW)) fails.push("the recorded prices (docs/fixtures/channel3-recorded.json) didn't parse, so the room can't be measured");
const rooms: string[] = [];
for (const [width, height] of [[320, 700], [390, 844], [430, 900], [768, 1024], [1024, 800], [1440, 900]] as const) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: "dark" });
  await ctx.route("**/api/prices*", async (r: { request: () => { url: () => string }; fulfill: (o: { json: unknown; headers: Record<string, string> }) => Promise<void> }) => {
    await new Promise((s) => setTimeout(s, 900));
    await r.fulfill({ json: await PRICES.forWords(new URL(r.request().url()).searchParams.get("q") ?? ""), headers: { "Cache-Control": "no-store" } });
  });
  await ctx.addInitScript(() => {
    const w = window as unknown as { shifts: number };
    w.shifts = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.shifts += e.value; }).observe({ type: "layout-shift", buffered: true });
  });
  const page = await ctx.newPage();
  await page.goto(`${url}/?desk=1`, { waitUntil: "load" });
  await page.waitForSelector(".ds-real", { state: "attached" });
  await page.waitForTimeout(1500);
  const room: number = await page.evaluate(() => {
    const r = document.querySelector(".ds-real")!;
    (window as unknown as { shifts: number }).shifts = 0;
    scrollTo({ top: r.getBoundingClientRect().top + scrollY - innerHeight / 3, behavior: "instant" });
    return r.querySelector(".c3") ? -1 : Math.round(r.getBoundingClientRect().height);
  });
  await page.waitForSelector(".ds-real .c3", { timeout: 15000 });
  await page.waitForTimeout(800);
  const m: { drawn: number; shift: number } = await page.evaluate(() => ({ drawn: Math.round(document.querySelector(".ds-real")!.getBoundingClientRect().height), shift: (window as unknown as { shifts: number }).shifts }));
  rooms.push(`${width}: room ${room}, drawn ${m.drawn}, shift ${m.shift.toFixed(3)}`);
  if (room < 0) fails.push(`${width} /: the real prices drew before the jump, so their room wasn't measured`);
  else if (Math.abs(room - m.drawn) > ROOM_DRIFT) fails.push(`${width} /: the real prices hold ${room} px and draw ${m.drawn} px, more than ${ROOM_DRIFT} apart: read the panel's height again and refit .ds-real's min-height in story.css`);
  if (m.shift > ROOM_SHIFT) fails.push(`${width} /: the page moved ${m.shift.toFixed(3)} when the real prices landed (line ${ROOM_SHIFT})`);
  await ctx.close();
  const none = await browser.newContext({ viewport: { width, height }, colorScheme: "dark" });
  await none.route("**/api/prices*", (r: { abort: () => Promise<void> }) => r.abort());
  const bare = await none.newPage();
  await bare.goto(`${url}/?desk=1`, { waitUntil: "load" });
  await bare.waitForSelector(".ds-real", { state: "attached" });
  await bare.evaluate(() => { const r = document.querySelector(".ds-real")!; scrollTo({ top: r.getBoundingClientRect().top + scrollY - innerHeight / 3, behavior: "instant" }); });
  await bare.waitForTimeout(1500);
  const hole: number = await bare.evaluate(() => Math.round(document.querySelector(".ds-real")!.getBoundingClientRect().height));
  if (hole > 0) fails.push(`${width} /: with no prices answer the real prices leave a ${hole} px hole`);
  await none.close();
}
console.log(`real prices' room: ${rooms.join("; ")}`);
await browser.close();
if (fails.length) { for (const f of fails) console.error(f); console.error(`design-holds: ${fails.length} failed`); process.exit(1); }
if (process.env.ROOM_ONLY) { console.log("design-holds: the real prices' room OK, and nothing else was walked"); process.exit(0); }
console.log(`design-holds: OK (${ROUTES.length} routes at 390, 1024 and 1440, each walked top to foot: no raw control, nothing sticks under the bar, all ${looked} charts painted and fitting their boxes, the haggle's clears its card, the list is lit, the real prices hold their room)`);

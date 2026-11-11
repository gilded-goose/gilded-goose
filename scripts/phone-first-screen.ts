// Joshua (Wed Nov 4, 3d): "on a phone the three promises fill the first screen; shrink the headline so the ask box and the
// start of the Challenge show without scrolling." This reads that off a real browser: at each phone size, where the
// headline, the Ask box and the Challenge sit, with the first paint alone (JS blocked, what a cold phone sees before the
// bundle), once the page has settled, and on a slow phone (1.6 Mbps, 4x CPU, where the faces and the story land late), and
// the layout shift. Exits 1 if the Ask box isn't whole on the first screen, if the Challenge's heading doesn't start on it
// (in the first paint too, where its size allows), if the headline is at or over the limit, or if anything moved. Reads
// the page only; it never sends a try. Usage: node scripts/phone-first-screen.ts [url] [stills-dir]
import { chromium } from "playwright";
const BASE = (process.argv[2] ?? "http://localhost:8801").replace(/\/$/, "");
const SHOTS = process.argv[3];
const SIZES = [{ w: 390, h: 844, chall: true }, { w: 390, h: 667, chall: true }, { w: 375, h: 667, chall: true }, { w: 360, h: 780, chall: true }, { w: 430, h: 932, chall: true }, { w: 320, h: 568, chall: false }];
const MAX_H1 = Number(process.env.MAX_H1 ?? 30);
const read = () => {
  const box = (s: string) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return r.height ? { top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY) } : null; };
  const h1 = document.querySelector(".dk-hero h1");
  const rows = h1 ? new Set([...h1.querySelectorAll(".dk-mask > span")].flatMap((s) => { const r = document.createRange(); r.selectNodeContents(s); return [...r.getClientRects()].map((b) => Math.round(b.top)); })).size : 0;
  return { h1: box(".dk-hero h1"), size: h1 ? parseFloat(getComputedStyle(h1).fontSize) : 0, rows, ask: box(".dk-hero form") ?? box(".dk-ask"), chall: box(".ds-ch h2") ?? box("#ds-ch-h"), over: document.documentElement.scrollWidth - innerWidth };
};
const browser = await chromium.launch();
let bad = 0;
const fail = (s: string) => { bad++; console.log(`  FAIL ${s}`); };
for (const { w, h, chall } of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // First paint: the served HTML and CSS with no script at all.
  const raw = await ctx.newPage();
  await raw.route(/\.js(\?|$)/, (r) => r.abort());
  await raw.goto(`${BASE}/?desk=1`, { waitUntil: "load" }).catch(() => {});
  const first = await raw.evaluate(read).catch(() => null);
  await raw.close();
  // The fallback face: a promise that wraps differently before the web font lands would move everything under it.
  const noFont = await ctx.newPage();
  await noFont.route(/\.woff2(\?|$)/, (r) => r.abort());
  await noFont.goto(`${BASE}/?desk=1`, { waitUntil: "load" }).catch(() => {});
  await noFont.waitForSelector(".dk-hero h1");
  const fallback = await noFont.evaluate(read);
  await noFont.close();
  // A slow phone: the faces, the Desk, the story and the Challenge each land late, and any of them could move the words.
  const slow = await ctx.newPage();
  const cdp = await ctx.newCDPSession(slow);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await slow.addInitScript(() => { (window as unknown as { __cls: number }).__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); });
  await slow.goto(`${BASE}/?desk=1`, { waitUntil: "load", timeout: 90_000 });
  await slow.waitForTimeout(3500);
  const slowCls = await slow.evaluate(() => (window as unknown as { __cls: number }).__cls);
  await slow.close();
  const page = await ctx.newPage();
  await page.addInitScript(() => { (window as unknown as { __cls: number }).__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); });
  await page.goto(`${BASE}/?desk=1`, { waitUntil: "networkidle" });
  await page.waitForSelector(".dk-hero h1");
  await page.waitForTimeout(1500);
  const s = await page.evaluate(read);
  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  console.log(`${w}x${h}: h1 ${s.size}px ${s.rows} rows, ends ${s.h1?.bottom}; ask ${s.ask?.top}-${s.ask?.bottom}; challenge head ${s.chall?.top}-${s.chall?.bottom}; side scroll ${s.over}; shift ${cls.toFixed(4)}, slow ${slowCls.toFixed(4)}; first paint ask ${first?.ask?.top ?? "none"} h1 ends ${first?.h1?.bottom ?? "none"}`);
  if (s.size > MAX_H1) fail(`headline ${s.size}px, limit ${MAX_H1}`);
  if (!s.ask || s.ask.bottom > h) fail(`Ask box ends at ${s.ask?.bottom}, screen ${h}`);
  if (chall && (!s.chall || s.chall.top >= h)) fail(`Challenge heading starts at ${s.chall?.top}, screen ${h}`);
  if (s.over > 0) fail(`side scroll ${s.over}`);
  if (cls > 0.01) fail(`layout shift ${cls.toFixed(4)}`);
  if (slowCls > 0.01) fail(`layout shift on a slow phone ${slowCls.toFixed(4)}`);
  if (chall && (!first?.chall || first.chall.top >= h)) fail(`the first paint's Challenge heading starts at ${first?.chall?.top}, screen ${h}`);
  if (first?.chall && s.chall && Math.abs(first.chall.top - s.chall.top) > 1) fail(`the Challenge heading moved ${first.chall.top} to ${s.chall.top} from first paint to settled`);
  if (first?.h1 && s.h1 && Math.abs(first.h1.bottom - s.h1.bottom) > 1) fail(`headline moved ${first.h1.bottom} to ${s.h1.bottom} from first paint to settled`);
  if (fallback.rows !== s.rows) fail(`the headline wraps to ${fallback.rows} rows in the fallback face, ${s.rows} in the web face`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/landing-${w}x${h}.png` });
  await ctx.close();
}
await browser.close();
if (bad) { console.log(`phone first screen: ${bad} failed`); process.exit(1); }
console.log("phone first screen: ok");

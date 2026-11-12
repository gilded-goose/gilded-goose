/// <reference lib="dom" />
// Track D's charts, captured for the data review and for Joshua: the week's steps, the session's charts (empty, then
// after a real run), and the Proof page's blind-test dots, at 1440×900 and 390×844, with reduced motion on (the charts
// have no motion, so the frames are the same either way). Each frame is an element shot, so a chart is seen whole.
// Fails on a page error, an AG Charts warning, a chart drawn in no colour, or sideways scroll.
//
//   node scripts/charts-shots.ts [url] [out-dir]   defaults http://localhost:8787/ and .screens/charts
//   needs a server started with PAYMENT=fake serving web/dist

import { localOnly } from "./not-live.ts";
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

const base = localOnly((process.argv[2] ?? "http://localhost:8787/").replace(/\/?$/, "/"));
const out = process.argv[3] ?? ".screens/charts";
mkdirSync(out, { recursive: true });
const errors: string[] = [];
const browser = await chromium.launch();

const sizes = [
  { name: "1440", viewport: { width: 1440, height: 900 }, mobile: false },
  { name: "390", viewport: { width: 390, height: 844 }, mobile: true },
] as const;

const el = async (p: Page, sel: string, name: string) => {
  const l = p.locator(sel).first();
  await l.scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);
  await l.screenshot({ path: join(out, `${name}.png`) });
  console.log(`  ${name}.png`);
};
const wide = async (p: Page, where: string) => { if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) errors.push(`${where}: the page scrolls sideways`); };
/** A canvas that drew nothing (no non-transparent pixel) is a chart that failed silently. */
const drawn = (p: Page, sel: string, where: string) => p.evaluate((q) => [...document.querySelectorAll(`${q} canvas`)].map((c) => {
  const cv = c as HTMLCanvasElement; const x = cv.getContext("2d"); if (!x || !cv.width) return false;
  const d = x.getImageData(0, 0, cv.width, cv.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) return true; return false;
}), sel).then((ok) => { if (!ok.length || ok.some((v) => !v)) errors.push(`${where}: a chart canvas drew nothing`); });

for (const s of sizes) {
  console.log(s.name);
  const ctx = await browser.newContext({ viewport: s.viewport, reducedMotion: "reduce", ...(s.mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}), recordVideo: { dir: join(out, `video-${s.name}`), size: s.viewport } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`${s.name}: ${e.message}`));
  p.on("console", (m) => { if ((m.type() === "error" && !/status of 404/.test(m.text())) || (m.type() === "warning" && /AG (Grid|Charts)/i.test(m.text()))) errors.push(`${s.name} console: ${m.text().slice(0, 200)}`); });

  await p.goto(`${base}?desk=ledger`);
  // A chart mounts as it comes near (charts/Chart.tsx), so what waits for one brings it near first.
  await p.locator(".lx-story").first().scrollIntoViewIfNeeded();
  await p.waitForSelector(".lx-story canvas", { timeout: 30_000 });
  await p.waitForTimeout(800);
  await el(p, ".lx-story", `${s.name}-week`);
  await drawn(p, ".lx-story", `${s.name} week`);
  // No empty-charts frame: the page mounts the session's charts only once a session exists (SessionLedger.tsx).

  const run = await ctx.request.post(`${base}api/runs`, { data: { seed: 2 } });
  if (!run.ok()) errors.push(`run: ${run.status()}`);
  await p.locator(".lx-charts").first().scrollIntoViewIfNeeded({ timeout: 60_000 }).catch(() => {});
  await p.waitForFunction(() => document.querySelectorAll(".lx-charts canvas").length >= 2, null, { timeout: 60_000 }).catch(() => errors.push(`${s.name}: the session's charts never drew`));
  // The deal approved as the page's Approve does it, then the practice PayPal tap (the fake port's approve page), so
  // money moves and the money chart draws.
  const runId = ((await run.json().catch(() => ({}))) as { runId?: string }).runId ?? "";
  for (let i = 0; i < 120; i++) {
    const v = await (await ctx.request.get(`${base}api/runs/${runId}`)).json() as { bound?: unknown };
    if (v.bound) break;
    await p.waitForTimeout(500);
  }
  const ok = await ctx.request.post(`${base}api/runs/${runId}/approve`, { data: {} });
  const { approveUrl } = await ok.json().catch(() => ({})) as { approveUrl?: string };
  if (!approveUrl) errors.push(`${s.name} approve: ${ok.status()}`);
  else { const tap = await ctx.newPage(); await tap.goto(new URL(approveUrl, base).href); await tap.close(); }
  await p.bringToFront();
  await p.waitForFunction(() => document.querySelectorAll(".lx-charts canvas").length >= 3, null, { timeout: 30_000 }).catch(() => errors.push(`${s.name}: the money chart never drew`));
  await p.waitForTimeout(1500);
  await el(p, ".lx-charts", `${s.name}-charts-run`);
  await drawn(p, ".lx-charts", `${s.name} charts`);
  await wide(p, `${s.name} ledger`);
  // A chart hidden from screen readers must not be a tab stop either (Track L's a11y review): its wrapper is `inert`.
  const stops = await p.evaluate(() => [...document.querySelectorAll('[aria-hidden="true"]')].filter((h) => !h.closest("[inert]"))
    .flatMap((h) => [...h.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")].filter((e) => e.tabIndex >= 0)).length);
  if (stops) errors.push(`${s.name}: ${stops} tab stop(s) inside aria-hidden on the ledger`);

  await p.goto(`${base}?desk=proof`);
  await p.waitForSelector(".bd-dots, .pf-dots", { timeout: 20_000 });
  await el(p, ".pf-group-blind", `${s.name}-proof-blind`);
  await wide(p, `${s.name} proof`);

  const v = p.video();
  await ctx.close();
  if (v) copyFileSync(await v.path(), join(out, `${s.name}-charts.webm`));
}

await browser.close();
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`charts-shots ok: frames in ${out}`);

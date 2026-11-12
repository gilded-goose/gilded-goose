/// <reference lib="dom" />
// Track L: screenshots of the back room (Behind the scenes, Every decision, Proof) at 1440 and 390, first screen and
// full page, plus the side sheet and the Filter menu, for reviewers and Joshua. Against a running server:
//   node scripts/backroom-screens.ts http://localhost:8829 <outdir> [video]
// Fails on any console error or sideways scroll. With "video", also records a short walk of each page at both widths.

import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";

const base = (process.argv[2] ?? "http://localhost:8787").replace(/\/?$/, "/");
const out = process.argv[3] ?? "docs/screens/backroom";
const video = process.argv[4] === "video";
mkdirSync(out, { recursive: true });
const errors: string[] = [];
const browser = await chromium.launch();

async function open(w: number, h: number, name: string) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: video ? 1 : 2, colorScheme: "dark",
    ...(video ? { recordVideo: { dir: `${out}/video-${name}`, size: { width: w, height: h } } } : {}),
  });
  const page = await ctx.newPage();
  // One known line: with no session yet the stream answers 404 once per look (the server's own "nothing here yet"); the
  // page reads it and leads with the recorded week. Every other console error fails the run.
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${name} ${w}: ${m.text()} (${m.location().url})`); }); // no exceptions: no session is a 204 now
  page.on("pageerror", (e) => errors.push(`${name} ${w}: ${e.message}`));
  return { ctx, page };
}

async function sideways(page: Page, where: string) {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (o > 0) errors.push(`${where}: ${o}px sideways scroll`);
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1200);
}

for (const [w, h] of [[1440, 900], [390, 844]] as const) {
  const tag = w === 1440 ? "1440" : "390";
  // Behind the scenes, a fresh session (no run yet).
  {
    const { ctx, page } = await open(w, h, "ledger");
    await page.goto(`${base}?desk=ledger`);
    await settle(page);
    await sideways(page, `ledger ${tag}`);
    await page.screenshot({ path: `${out}/ledger-${tag}.png` });
    await page.screenshot({ path: `${out}/ledger-${tag}-full.png`, fullPage: true });
    if (video) { await page.mouse.wheel(0, 900); await page.waitForTimeout(900); await page.mouse.wheel(0, 900); await page.waitForTimeout(900); }
    // Open one row's sheet: the first grid row or the first card.
    const row = w === 1440 ? page.locator(".lx-grid .ag-row:not(.ag-row-pinned)").first() : page.locator(".lx-card > button").first();
    if (await row.count()) {
      await row.scrollIntoViewIfNeeded();
      await row.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${out}/ledger-${tag}-sheet.png` });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
    const menu = page.locator(".lx-filter-btn");
    if (await menu.count()) {
      await menu.scrollIntoViewIfNeeded();
      await menu.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${out}/ledger-${tag}-filter.png` });
      await page.keyboard.press("Escape");
    }
    await ctx.close();
  }
  // Every decision, full screen (the classic page's spine).
  {
    const { ctx, page } = await open(w, h, "every");
    await page.goto(`${base}?ledger=full`);
    await settle(page);
    await page.waitForTimeout(2500);
    await sideways(page, `every ${tag}`);
    await page.screenshot({ path: `${out}/every-${tag}.png` });
    await ctx.close();
  }
  // Proof.
  {
    const { ctx, page } = await open(w, h, "proof");
    await page.goto(`${base}?desk=proof`);
    await settle(page);
    await sideways(page, `proof ${tag}`);
    await page.screenshot({ path: `${out}/proof-${tag}.png` });
    await page.screenshot({ path: `${out}/proof-${tag}-full.png`, fullPage: true });
    if (video) { for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(700); } }
    await ctx.close();
  }
}
await browser.close();
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`ok  back room screens in ${out}`);

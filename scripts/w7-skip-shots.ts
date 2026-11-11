/// <reference lib="dom" />
// w7_skip_shots (Track W session 7; the DD's nit from W-6): the focused "Skip to content" link on every markup bar (the
// wallet, the classic page, the market, safe.html) at 390×844 and 1440×900, DPR 1, dark, reduced motion. For each it
// takes a still of the first Tab and measures whether any of the brand (the egg and the name) shows through around the
// focused link: the bar's band is shot twice, once as is and once with the brand hidden (visibility only, so nothing
// moves); every pixel that differs inside the link's own box widened to the gutter (x 0 to its right edge, its top to
// its bottom) is brand showing through. Prints one line per page and size; exit 1 if any shows.
//
//   node scripts/w7-skip-shots.ts [url] [stills-dir]   default http://localhost:4185 (web/dist served, e.g. vite preview)

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const url = (process.argv[2] ?? "http://localhost:4185/").replace(/\/?$/, "/");
const stills = process.argv[3];
if (stills) mkdirSync(stills, { recursive: true });
const PAGES = [["wallet", "?wallet=1"], ["classic", "?wallet=0"], ["market", "?market=1"], ["safe", "safe.html"], ["desk", "?desk=1"]] as const;
// S1-12 (the DD at W-7): the Desk's own bar (SiteNav, `?desk=1`) too, the same link and the same rule (nav.css).
const SIZES = [{ w: 390, h: 844, phone: true }, { w: 1440, h: 900, phone: false }] as const;

const browser = await chromium.launch();
let bad = 0;
for (const { w, h, phone } of SIZES) {
  for (const [name, path] of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone, colorScheme: "dark", reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(url + path, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(400);
    const box = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      if (!a?.matches("a.gn-skip")) return null;
      const r = a.getBoundingClientRect();
      return { x: 0, y: Math.floor(r.top), width: Math.ceil(r.right), height: Math.ceil(r.height) };
    });
    if (!box) { console.log(`${name} ${w}: the first Tab is not the skip link`); bad++; await ctx.close(); continue; }
    const shot = await page.screenshot();
    if (stills) writeFileSync(join(stills, `skip-${name}-${w}-focused.png`), shot);
    const band = { x: 0, y: 0, width: w, height: box.y + box.height + 8 };
    const asIs = await page.screenshot({ clip: band });
    if (stills) writeFileSync(join(stills, `skip-${name}-${w}-bar.png`), asIs);
    await page.addStyleTag({ content: ".gn .dk-brand { visibility: hidden !important; }" });
    await page.waitForTimeout(100);
    const noBrand = await page.screenshot({ clip: band });
    const showing = await page.evaluate(async ({ a, b, box, wd }) => {
      const load = async (buf: number[]) => { const img = await createImageBitmap(new Blob([new Uint8Array(buf)], { type: "image/png" })); const c = new OffscreenCanvas(img.width, img.height); const g = c.getContext("2d")!; g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data; };
      const [p, q] = [await load(a), await load(b)];
      const at: string[] = [];
      for (let y = box.y; y < box.y + box.height; y++) for (let x = 0; x < box.width; x++) {
        const i = (y * wd + x) * 4;
        const d = Math.max(Math.abs(p[i]! - q[i]!), Math.abs(p[i + 1]! - q[i + 1]!), Math.abs(p[i + 2]! - q[i + 2]!));
        if (d > 2) at.push(`${x},${y}:${d}`);
      }
      return at;
    }, { a: [...asIs], b: [...noBrand], box, wd: w });
    if (showing.length) bad++;
    console.log(`${name} ${w}: link x 0–${box.width}, y ${box.y}–${box.y + box.height}; brand pixels showing beside it: ${showing.length}${showing.length ? ` at ${showing.slice(0, 12).join(" ")}` : ""}`);
    await ctx.close();
  }
}
await browser.close();
if (bad) { console.error(`FAIL: ${bad} bar(s) show the brand around the focused link`); process.exit(1); }
console.log("PASS: nothing of the brand shows around the focused link");

// Track B-11's stills for the DD (brand.md §10.1, §10.2, §10.8), DPR 1 unless named: the Desk's first screen at 1440×900
// and 390×844 as it is (the mark: egg.webp beside "Gilded Goose" in the body face) and with the lockup swapped in, exactly
// as S1-13 will (each bar's a.dk-brand replaced by lockupHtml() with its own href, plus the 44 px tap height the old link
// had), with a crop of each bar; the egg still at 1x and 2x on Velvet; and the share card, favicon and touch icon as built.
//
//   node scripts/brand-shots.ts <out-dir> [base]     base default http://localhost:8788 (a served VITE_WALLET=1 build)
import { chromium, type Page } from "playwright";
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { lockupHtml } from "../web/src/brand/lockup-html.ts";

const out = process.argv[2];
if (!out) { console.error("usage: node scripts/brand-shots.ts <out-dir> [base]"); process.exit(1); }
const base = (process.argv[3] ?? "http://localhost:8788").replace(/\/$/, "");
const ROOT = new URL("..", import.meta.url).pathname;
mkdirSync(out, { recursive: true });

/** The nav.css S1-13 adds with the swap ("Needs from S1-13"): the 44 px tap height the old link had at ≥ 1280 px; under
 *  1280 px the brand's caption layout (nav.css gives .dk-brand `align-self: stretch; padding-bottom: 14px` and hangs
 *  "Practice only" under it), centred so the caption clears the wordmark; and the caption's left loses the `+ 28px` the
 *  separate egg mark took (the egg is now the o). */
export const BAR_CSS = `.gn .gg-bar { padding-block: 11px; }
@media (max-width: 1279px) {
  .gn .gg-bar { align-self: center; padding-block: 0 14px; }
}
@media (min-width: 721px) and (max-width: 1279px) {
  header.gn.dk-nav .dk-practice-ph { left: var(--s-4, 32px); }
  header.gn.dk-nav:is(.wnav, .page > *, .hero > *) .dk-practice-ph { left: 0; }
}
@media (max-width: 720px) {
  .gn .dk-practice-ph { left: var(--s-2, 16px); }
  .gn.wnav .dk-practice-ph, .page > .gn .dk-practice-ph, .hero > .gn .dk-practice-ph { left: 0; }
}`;

/** The swap S1-13 makes, done in the page: a.dk-brand → the bar lockup, keeping its href, plus BAR_CSS. */
const swap = (page: Page) => page.evaluate(([tpl, css]) => {
  const s = document.createElement("style");
  s.textContent = css;
  document.head.append(s);
  for (const a of document.querySelectorAll<HTMLAnchorElement>("a.dk-brand")) {
    const t = document.createElement("template");
    t.innerHTML = tpl.replace('href="%BASE_URL%?desk=1"', `href="${a.getAttribute("href")}"`);
    a.replaceWith(t.content);
  }
  return document.querySelectorAll(".gg").length;
}, [lockupHtml("%BASE_URL%?desk=1", "bar"), BAR_CSS] as const);

const browser = await chromium.launch({ channel: "chromium" }); // the real GPU, so the Desk's live egg draws
try {
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: "reduce" })).newPage();
    await page.goto(`${base}/?desk=1`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(2500); // the opening, if any, is over
    const bar = await page.locator("header.gn").first().boundingBox();
    const crop = { x: 0, y: 0, width: w, height: Math.ceil((bar?.y ?? 0) + (bar?.height ?? 72)) };
    await page.screenshot({ path: join(out, `desk-${w}x${h}-before.png`) });
    await page.screenshot({ path: join(out, `bar-${w}-before.png`), clip: crop });
    const n = await swap(page);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(out, `desk-${w}x${h}-after.png`) });
    await page.screenshot({ path: join(out, `bar-${w}-after.png`), clip: crop });
    const gg = await page.locator(".gn .gg:visible").first().boundingBox();
    console.log(`${w}×${h}: ${n} lockup(s) swapped in; bar lockup ${gg ? `${Math.round(gg.width)}×${Math.round(gg.height)} at (${Math.round(gg.x)}, ${Math.round(gg.y)})` : "not visible"}`);
    await page.context().close();
  }
  // The egg still at 1x and 2x: egg-1200.webp shown 300 css px wide on Velvet, as a page would.
  for (const dpr of [1, 2]) {
    const page = await (await browser.newContext({ viewport: { width: 420, height: 460 }, deviceScaleFactor: dpr })).newPage();
    // A same-origin page, rebuilt through the DOM (the site's CSP allows its own images and CSSOM styles, not markup styles).
    await page.goto(`${base}/safe.html`, { waitUntil: "load" });
    await page.evaluate(async () => {
      const img = new Image();
      img.src = "/brand/egg-1200.webp";
      img.style.width = "300px"; img.style.height = "auto";
      const b = document.body;
      b.replaceChildren(img);
      Object.assign(b.style, { margin: "0", background: "#2c1520", display: "grid", placeItems: "center", height: "100vh", minHeight: "0" });
      await img.decode();
    });
    await page.screenshot({ path: join(out, `egg-still-${dpr}x.png`) });
    await page.context().close();
  }
} finally { await browser.close(); }
for (const [from, to] of [["web/public/og/share.png", "share-1200x630.png"], ["web/public/apple-touch-icon.png", "apple-touch-icon-180.png"], ["web/public/favicon.svg", "favicon.svg"], ["web/public/brand/egg-1500.png", "egg-1500.png"]] as const) copyFileSync(join(ROOT, from), join(out, to));
console.log(`stills in ${out}`);

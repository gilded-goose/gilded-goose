/// <reference lib="dom" />
// w6_safe_pill (Track W session 6; Round 4's a11y fix 4 and design judge): on safe.html with the judge tour's pill, no
// line of the page's own text sits under the pill or its fade, at 390×844, 390×667 and 1440×900, for every stop the tab
// can be on when it opens safe.html (the pill reads the stop from sessionStorage, so each stop is a separate load). For
// each load it measures: the pill's box (on a phone, the strip plus its 24 px fade above), the text lines under it on
// arrival, at 33/66/100 % scroll, and with the ledger's summary ("The decision ledger · N rows") focused by Tab and
// opened; the gap between the summary's foot and the pill's fade (negative = covered), 60 ms after the Tab (Round 4's
// timing) and settled. Prints JSON; exit 1 on any line under the pill at 100 % scroll, or the focused summary under the
// pill or its fade at either moment. Optional stills (DPR 1) of the focused summary and the opened ledger's end.
//
//   node scripts/w6-safe-pill.ts [url] [stills-dir]   default http://localhost:4245 (web/dist built, any PAYMENT)

import { chromium, devices, type Page } from "playwright";
import { TOUR } from "@goose/core/tour";

const url = (process.argv[2] ?? "http://localhost:4245/").replace(/\/?$/, "/");
const stills = process.argv[3];
const SIZES = [
  { name: "390x844", w: 390, h: 844, phone: true },
  { name: "390x667", w: 390, h: 667, phone: true },
  { name: "1440x900", w: 1440, h: 900, phone: false },
] as const;

/** The pill's covering box, page text lines under it (outside it), in the viewport's frame. */
async function under(page: Page): Promise<{ box: { top: number; bottom: number }; lines: string[] }> {
  return page.evaluate(() => {
    const tp = document.querySelector(".tp")!;
    const r = tp.getBoundingClientRect();
    const phone = innerWidth <= 720;
    // On a phone the strip carries a 24 px fade above it (tour-pill.css .tp::before): text there is half-hidden too.
    const box = { top: r.top - (phone ? 25 : 0), bottom: r.bottom, left: r.left, right: r.right };
    const lines: string[] = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      const el = t.parentElement;
      const s = (t.textContent ?? "").trim();
      if (!el || !s || tp.contains(el)) continue;
      // A shut <details>' body still reports rects in Chrome (content-visibility: hidden); it isn't drawn.
      const shut = el.closest("details:not([open])");
      if (shut && !el.closest("summary")) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
      const range = document.createRange(); range.selectNodeContents(t);
      for (const q of range.getClientRects()) {
        if (q.width > 1 && q.height > 1 && q.bottom > box.top + 1 && q.top < box.bottom - 1 && q.right > box.left && q.left < box.right) {
          lines.push(`${s.slice(0, 48)} @${Math.round(q.top)}–${Math.round(q.bottom)}`); break;
        }
      }
    }
    return { box: { top: Math.round(box.top), bottom: Math.round(box.bottom) }, lines };
  });
}

const browser = await chromium.launch();
const out: Record<string, unknown>[] = [];
let bad = 0;
try {
  for (const size of SIZES) {
    for (let at = 0; at < TOUR.length; at++) {
      if (!TOUR[at]!.href) continue;
      const ctx = size.phone
        ? await browser.newContext({ ...devices["iPhone 13"], viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1, colorScheme: "dark" })
        : await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1, colorScheme: "dark" });
      await ctx.addInitScript((n) => { try { if (!sessionStorage.getItem("w6_seeded")) { sessionStorage.setItem("goose_tour_at", String(n)); sessionStorage.setItem("w6_seeded", "1"); } } catch { /* none */ } }, at);
      const page = await ctx.newPage();
      await page.goto(`${url}safe.html`);
      await page.locator(".tp").waitFor({ timeout: 15_000 });
      await page.locator("#ledger summary").waitFor();
      await page.waitForTimeout(2000); // the pill's places settle by 1.8 s (TourPill.tsx `place`)
      const row: Record<string, unknown> = { size: size.name, stop: at + 1, id: TOUR[at]!.id };
      row.arrival = await under(page);
      const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      for (const f of [0.33, 0.66, 1]) {
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), Math.round(max * f));
        await page.waitForTimeout(150);
        row[`at${Math.round(f * 100)}`] = await under(page);
      }
      // Tab to the summary from the top, as a keyboard visitor would (the pill is last in the Tab order).
      await page.evaluate(() => { window.scrollTo({ top: 0, behavior: "instant" }); (document.activeElement as HTMLElement | null)?.blur(); });
      let found = false;
      for (let i = 0; i < 120 && !found; i++) {
        await page.keyboard.press("Tab");
        found = await page.evaluate(() => document.activeElement?.matches("#ledger summary") ?? false);
      }
      // Measured 60 ms after the Tab (Round 4's obscured.ts timing: it caught a smooth scroll mid-way) and once settled.
      const measure = () => page.evaluate(() => {
        const s = document.querySelector("#ledger summary")!.getBoundingClientRect();
        const tp = document.querySelector(".tp")!.getBoundingClientRect();
        const fade = innerWidth <= 720 ? 25 : 0;
        return { summaryTop: Math.round(s.top), summaryBottom: Math.round(s.bottom), pillTop: Math.round(tp.top), gapToFade: Math.round(tp.top - fade - s.bottom), gapToPill: Math.round(tp.top - s.bottom) };
      });
      await page.waitForTimeout(60);
      const early = await measure();
      await page.waitForTimeout(600);
      const gap = await measure();
      row.focused = { tabbed: found, at60ms: early, ...gap, under: (await under(page)).lines };
      if (early.gapToFade < 0) bad++;
      if (stills && at === 2) await page.screenshot({ path: `${stills}/safe-${size.name}-focused.png` });
      // Open the ledger with Enter: its summary stays clear too.
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);
      if (stills && at === 2) {
        await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
        await page.waitForTimeout(200);
        await page.screenshot({ path: `${stills}/safe-${size.name}-end.png` });
      }
      // Failing: a line under the pill with the page at its end, or the focused summary under the pill or its fade. Lines
      // under it on arrival and mid-scroll (the page going on below the fold) are reported, not failed.
      const covered = (row.at100 as { lines: string[] }).lines.length + (gap.gapToFade < 0 ? 1 : 0);
      if (covered) bad++;
      out.push(row);
      await ctx.close();
    }
  }
} finally { await browser.close(); }
console.log(JSON.stringify(out, null, 1));
console.log(bad ? `W6 SAFE PILL: ${bad} load(s) with text under the pill at the foot or with the summary focused` : "W6 SAFE PILL OK");
process.exit(bad ? 1 : 0);

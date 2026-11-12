/// <reference lib="dom" />
// The landing scroll story (Track S2), in a real browser at 1440 and 390: one shot per section, a full-page shot, and
// the same with reduced motion (everything shown, still). Each run checks, before it saves anything, that the sections
// are there in the mandate's order, nothing runs off the side (scripts/overflow.ts), the console logs no error, and the
// live moment's practice Approve sends no request at all. With --video it also records a slow full scroll per width.
//
//   node scripts/story-screens.ts [url] [out]   default http://localhost:8825/  docs/video/track-s2 (gitignored)
//   node scripts/story-screens.ts [url] [out] --video

import { mkdirSync, readdirSync, renameSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { overflow } from "./overflow.ts";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const url = (args[0] ?? "http://localhost:8825/").replace(/\/?$/, "/");
const OUT = args[1] ?? "docs/video/track-s2";
const VIDEO = process.argv.includes("--video");
mkdirSync(OUT, { recursive: true });
function fail(m: string): never { console.error(`STORY SCREENS FAIL: ${m}`); process.exit(1); }

/** The mandate's order, by each section's id on the page. */
const ORDER = ["dk-hero", "ds-moment", "ds-steps", "ds-protects", "ds-band", "ds-close"] as const;
const SIZES = [["desktop", 1440, 900], ["phone", 390, 844]] as const;

async function open(browser: Browser, w: number, h: number, still: boolean, video?: string) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1, reducedMotion: still ? "reduce" : "no-preference",
    ...(video ? { recordVideo: { dir: video, size: { width: w, height: h } } } : {}),
  });
  await ctx.addInitScript(() => { try { sessionStorage.setItem("gg-opened", "1"); } catch { /* the opening plays */ } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url);
  await page.locator(".dk-hero h1").waitFor({ timeout: 20_000 });
  await page.locator("#ds-close-h").waitFor({ state: "attached", timeout: 20_000 }).catch(() => fail("the story never loaded"));
  return { ctx, page, errors };
}

/** Scrolls the page to the end in small steps, so every reveal fires (and a recording shows a reader's pace). */
async function walk(page: Page, step: number, pause: number) {
  for (;;) {
    const more = await page.evaluate((s) => { const y = scrollY; scrollBy(0, s); return scrollY > y; }, step);
    await page.waitForTimeout(pause);
    if (!more) break;
  }
}

async function order(page: Page, name: string) {
  const tops = await page.evaluate((ids) => ids.map((id) => {
    const el = document.querySelector(`[data-story="${id}"]`);
    return el ? el.getBoundingClientRect().top + scrollY : null;
  }), [...ORDER]);
  ORDER.forEach((id, i) => { if (tops[i] === null) fail(`${name}: no section "${id}"`); });
  for (let i = 1; i < ORDER.length; i++) if (tops[i]! <= tops[i - 1]!) fail(`${name}: "${ORDER[i]}" sits above "${ORDER[i - 1]}"`);
}

/** The velvet between sections, as a reader sees it: from the last visible thing in one section to the first in the
 * next (any element with a box and some text, a border or an image), in px. */
async function gaps(page: Page): Promise<number[]> {
  return page.evaluate((ids) => {
    const ink = (sec: Element) => {
      let top = Infinity, bottom = -Infinity;
      for (const el of [sec, ...sec.querySelectorAll("*")]) {
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        if (!r.width || !r.height || cs.visibility === "hidden" || cs.opacity === "0") continue;
        const y = scrollY;
        // A hairline counts only where it is drawn: a top border at the box's top, a bottom border at its bottom.
        if (parseFloat(cs.borderTopWidth) > 0) { top = Math.min(top, r.top + y); bottom = Math.max(bottom, r.top + y); }
        if (parseFloat(cs.borderBottomWidth) > 0) { top = Math.min(top, r.bottom + y); bottom = Math.max(bottom, r.bottom + y); }
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()) || /^(IMG|SVG|CANVAS|INPUT|BUTTON)$/i.test(el.tagName);
        if (!own) continue;
        top = Math.min(top, r.top + y); bottom = Math.max(bottom, r.bottom + y);
      }
      return [top, bottom];
    };
    const b = ids.map((id) => ink(document.querySelector(`[data-story="${id}"]`)!));
    return b.slice(1).map(([top], i) => Math.round(top! - b[i]![1]!));
  }, [...ORDER]);
}
/** The page's words as rendered (docs/launch/word-count.mjs's rule: split on whitespace, a word has a letter or a
 * digit), per section and in all, the bar included. The steps section's budget leaves out step 02's seller rows (data,
 * like the feed; the DD's gate on b304f9c0); their panel's prose counts. */
async function words(page: Page): Promise<{ sections: Record<string, number>; steps: number; page: number }> {
  return page.evaluate((ids) => {
    const W = (t: string) => t.split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length;
    const text = (sel: string) => (document.querySelector(sel) as HTMLElement | null)?.innerText ?? "";
    const sections = Object.fromEntries(ids.map((id) => [id, W(text(`[data-story="${id}"]`))]));
    return { sections, steps: W(text('[data-story="ds-steps"]')) - W(text('[data-story="ds-steps"] .ds-sellers')), page: W(document.body.innerText) };
  }, [...ORDER]);
}
/** brand.md and surface-words.md: the landing reads in at most 600 words; the steps section in at most 120. */
const WORDS_MAX = { page: 600, steps: 120 } as const;

/** Spacious, never empty (Joshua, Fri 3:15 PM): no gap above this, per width. */
const GAP_MAX = { desktop: 300, phone: 200 } as const;

const browser = await chromium.launch();
for (const [name, w, h] of SIZES) {
  for (const still of [false, true]) {
    const tag = `${name}${still ? "-still" : ""}`;
    const { ctx, page, errors } = await open(browser, w, h, still);
    await walk(page, Math.round(h * 0.5), still ? 30 : 160);
    await order(page, tag);
    // Measured from the top: the hero's depth layers move with scroll (every reveal has fired by now, and stays).
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(300);
    const g = await gaps(page);
    console.log(`${tag} gaps (px): ${ORDER.slice(1).map((id, i) => `${ORDER[i]}→${id} ${g[i]}`).join(", ")}`);
    const n = await words(page);
    console.log(`${tag} words: ${Object.entries(n.sections).map(([id, c]) => `${id} ${c}`).join(", ")}; steps without the seller rows ${n.steps}; page ${n.page} (max ${WORDS_MAX.page})`);
    if (n.page > WORDS_MAX.page) fail(`${tag}: the landing renders ${n.page} words (max ${WORDS_MAX.page})`);
    if (n.steps > WORDS_MAX.steps) fail(`${tag}: the steps section renders ${n.steps} words without its seller rows (max ${WORDS_MAX.steps})`);
    const wide = g.findIndex((x) => x > GAP_MAX[name]);
    if (wide >= 0) fail(`${tag}: ${g[wide]} px of empty velvet between "${ORDER[wide]}" and "${ORDER[wide + 1]}" (max ${GAP_MAX[name]})`);
    // The hero's example chips run off a phone's right edge on purpose (Joshua's ask, hero.css: the row fades there, a
    // sideways scroller), so the chip row alone sits out of this check; everything else on the page is measured.
    const chips = await page.addStyleTag({ content: ".dk-chips { display: none !important; }" });
    const over = await overflow(page);
    await chips.evaluate((s) => (s as Element).remove());
    if (over.length) fail(`${tag}: ${over.join("; ")}`);
    // The live moment's Approve is a practice tap: no request of any kind may leave the page when it's pressed.
    if (!still) {
      const sent: string[] = [];
      page.on("request", (r) => sent.push(r.url()));
      const tap = page.locator(".ds-approve");
      await tap.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await tap.click();
      await page.waitForTimeout(600);
      if (sent.length) fail(`${tag}: the practice Approve sent ${sent.length} request(s): ${sent.slice(0, 3).join(", ")}`);
      if (!/PayPal sandbox/.test((await page.locator(".ds-ticket").innerText()))) fail(`${tag}: the tapped ticket doesn't say "PayPal sandbox"`);
    }
    for (const id of ORDER) {
      const el = page.locator(`[data-story="${id}"]`);
      await el.scrollIntoViewIfNeeded();
      await page.evaluate((i) => { const e = document.querySelector(`[data-story="${i}"]`)!; scrollTo(0, Math.max(0, e.getBoundingClientRect().top + scrollY - (i === "dk-hero" ? 999 : 64))); }, id);
      await page.waitForTimeout(still ? 60 : 900);
      await page.screenshot({ path: `${OUT}/${tag}-${id}.png` });
    }
    // From the top: the hero's depth layers move with scroll, and a full-page capture paints them where they are now.
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(still ? 60 : 500);
    await page.screenshot({ path: `${OUT}/${tag}-full.png`, fullPage: true });
    if (errors.length) fail(`${tag}: console errors: ${errors.slice(0, 3).join(" | ")}`);
    await ctx.close();
    console.log(`${tag}: ${ORDER.length} sections in order, nothing off the side, no console errors`);
  }
  if (VIDEO) {
    const dir = `${OUT}/rec-${name}`;
    const { ctx, page } = await open(browser, w, h, false, dir);
    await page.waitForTimeout(1500);
    await walk(page, 6, 16);
    await page.waitForTimeout(1200);
    await ctx.close();
    const file = readdirSync(dir).find((f) => f.endsWith(".webm"));
    if (file) renameSync(`${dir}/${file}`, `${OUT}/story-scroll-${w}.webm`);
    console.log(`recorded ${OUT}/story-scroll-${w}.webm`);
  }
}
await browser.close();
console.log(`STORY SCREENS PASS: ${OUT}`);

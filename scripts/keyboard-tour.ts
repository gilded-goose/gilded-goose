/// <reference lib="dom" />
// Keyboard only, through the whole judge tour (Joshua, Nov 3, 1(d): "keyboard-only through the whole judge tour"). At 1440
// and 390 it opens the tour and presses Tab and Enter, nothing else: no click, no script focus. From the tour's first
// button it reaches each stop by the pill's Next, and at each stop it checks:
//   - Tab gets to the stop's own control and to Next, with no trap on the way;
//   - everything Tab lands on is on screen, not wholly under the bar or the pill, and wears a focus mark;
//   - Enter on Next opens the stop Next named, and Finish comes back to the tour.
// Where a run is allowed (always on a PAYMENT=fake server; elsewhere only with --run, and only at 1440, since a run spends
// the day's caps) the Watcher stop also runs by keyboard: Ask Goose, Shop for this, the set-aside, its Why sheet and Escape.
//
// It never presses Approve: Enter goes only to a control named in PRESSABLE, checked at the moment of pressing. POSTs to
// /api/runs/trick, /api/runs/scammer and /api/judge are refused in the browser, so this can't add to the real counter, and one attempted fails.
//
//   node scripts/keyboard-tour.ts [url] [--run]     default http://localhost:8823
//   ... --control    strips every focus mark from the page: this must come back red, or the walk proves nothing
// Last line: "keyboard-tour: N failed of M stops". Exit 1 when N is over 0 (the ratchet reads N).

import { chromium, type Browser, type Page } from "playwright";
import { TOUR_OPEN } from "@goose/core/tour";
import { isAgTrialLine } from "./ag-trial-lines.ts";
// The flip gate walks Studio with no key: AG's own trial lines are allowed there, and only there, and only those (ag-trial-lines.ts).
const KEYLESS = process.env.KEYLESS_STUDIO === "1";

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:/.test(a)) ?? "http://localhost:8823").replace(/\/$/, "");
const health = await fetch(`${base}/api/health`).then((r) => r.json() as Promise<{ payment?: string }>).catch(() => null);
const fake = health?.payment === "fake";
const MAX_TABS = 160;
const SIZES = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];

/** What Enter may press: the tour's own moves, and the Watcher's ask on a run. Approve isn't here, on purpose. */
const PRESSABLE = /^(tr-next-go|tp-next|ask|shop|why)$/;

const BOX = 'textarea, input:not([type]), input[type="text"], [role="textbox"]';
/** Each stop's own control, which Tab must reach. A stop whose page is reading has no control of its own, so `null`. */
const OWN: Record<string, string | null> = {
  trick: "#ds-ch-note",
  watcher: BOX,
  pay: 'button[class*="approve" i], button[aria-label*="Approve" i]',
  ask: BOX,
  talk: BOX,
  limits: "#dk-set-h ~ * button, #dk-set-h ~ * select, #dk-set-h ~ * a, .dk-set button, .dk-set select",
  haggle: "main a, main button, main summary",
  wants: "main a, main button, main summary",
  list: "main a, main button, main summary, main select, main input",
  ledger: "main a, main button, main summary, main input",
  after: "main a, main button, main summary",
  proof: "main a, main button, main summary",
};
for (const s of TOUR_OPEN) if (!(s.id in OWN)) { console.error(`keyboard-tour: no own control named for the stop "${s.id}". Add it to OWN.`); process.exit(2); }

interface Landed { tag: string; words: string; pill: string; go: boolean; ring: boolean; onScreen: boolean; covered: boolean; own: boolean; body: boolean }

/** Where Tab just landed, read from the page. `own` is whether it's the stop's own control. */
const landed = (page: Page, own: string | null) => page.evaluate((sel): Landed => {
  const e = document.activeElement as HTMLElement | null;
  if (!e || e === document.body || e === document.documentElement) return { tag: "body", words: "", pill: "", go: false, ring: true, onScreen: true, covered: false, own: false, body: true };
  const r = e.getBoundingClientRect();
  const s = getComputedStyle(e);
  // A mark is the outline, a box shadow, or a changed border on focus; the site's one ring is the outline.
  const marks = (c: CSSStyleDeclaration) => (c.outlineStyle !== "none" && parseFloat(c.outlineWidth) > 0) || c.boxShadow !== "none";
  // AG's rows wear the ring for their cell, and keep the class through a blur, so the pixel check below can't see them.
  const row = e.closest(".ag-row-focus");
  const ring = marks(s) || (row !== null && marks(getComputedStyle(row)));
  const onScreen = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  // Wholly under something else: none of five points in its box hits it, its parts or what holds it (WCAG 2.4.11).
  const hits = (x: number, y: number) => { const t = document.elementFromPoint(x, y); return !t || t === e || e.contains(t) || t.contains(e); };
  const inset = (a: number, b: number) => a + (b - a) * 0.15;
  const pts: [number, number][] = [[(r.left + r.right) / 2, (r.top + r.bottom) / 2], [inset(r.left, r.right), inset(r.top, r.bottom)], [inset(r.right, r.left), inset(r.top, r.bottom)], [inset(r.left, r.right), inset(r.bottom, r.top)], [inset(r.right, r.left), inset(r.bottom, r.top)]];
  const visible = pts.filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight);
  return {
    tag: e.tagName.toLowerCase(), words: (e.getAttribute("aria-label") ?? e.innerText ?? e.getAttribute("placeholder") ?? "").trim().replace(/\s+/g, " ").slice(0, 50),
    pill: e.closest(".tp") ? (e.classList.contains("tp-next") ? "next" : "other") : "", go: e.classList.contains("tr-next-go"), ring, onScreen, covered: visible.length > 0 && !visible.some(([x, y]) => hits(x, y)), own: sel ? e.matches(sel) : false, body: false,
  };
}, own);

async function press(page: Page, name: string) {
  if (!PRESSABLE.test(name)) throw new Error(`refusing to press ${name}`);
  // The last look before Enter: Approve can't be what's focused, whatever the walk thinks it reached.
  const words = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.innerText ?? "");
  if (/approve/i.test(words) && !/tp-next/.test(await page.evaluate(() => document.activeElement?.className ?? ""))) throw new Error(`refusing Enter on "${words.slice(0, 40)}"`);
  await page.keyboard.press("Enter");
}

/**
 * A mark needn't be on the element itself: a row or a box can show focus-within on its holder. So when the element's own
 * style shows none, compare what's drawn with the focus and without. Same pixels: no mark, which is what a
 * keyboard user would see. Only this measuring step ever moves focus by script, and it puts it straight back.
 */
async function drawsAMark(page: Page): Promise<boolean> {
  await page.waitForTimeout(160); // a transition, even under reduced motion
  // The whole window: a row's ring can sit well outside the small button holding the focus (the Desk's seller rows, AG's rows).
  const on = await page.screenshot();
  await page.evaluate(() => { const e = document.activeElement as HTMLElement; e.setAttribute("data-kb-mark", ""); e.blur(); });
  await page.waitForTimeout(160);
  const off = await page.screenshot();
  await page.evaluate(() => { const e = document.querySelector("[data-kb-mark]") as HTMLElement; e.removeAttribute("data-kb-mark"); e.focus({ preventScroll: true }); });
  await page.waitForTimeout(40);
  return !on.equals(off);
}

/** Tab until the wanted control has focus, noting every landing's faults. Tab wraps, so a page is walked at most about once. */
async function tabTo(page: Page, want: (l: Landed) => boolean, own: string | null, faults: string[], seen: { own: boolean; tabs: number }): Promise<boolean> {
  const marked = new Set<string>();
  for (let i = 0; i < MAX_TABS; i++) {
    await page.keyboard.press("Tab");
    seen.tabs++;
    const l = await landed(page, own);
    if (l.own) seen.own = true;
    if (!l.body) {
      const where = `${l.tag} "${l.words}"`;
      const fault = !l.onScreen ? `off screen: ${where}` : l.covered ? `wholly covered: ${where}` : !l.ring && !await drawsAMark(page) ? `no focus mark: ${where}` : "";
      if (fault && !marked.has(fault)) { marked.add(fault); faults.push(fault); }
    }
    if (want(l)) return true;
  }
  return false;
}

/** The Watcher's ask, by keyboard: the box holds its words, so Tab to Ask Goose, then Shop for this, then the set-aside's Why. */
async function watcherRun(page: Page, faults: string[]) {
  const named = (re: RegExp) => (l: Landed) => re.test(l.words);
  const seen = { own: false, tabs: 0 };
  if (!await tabTo(page, named(/^Ask Goose/), null, faults, seen)) { faults.push("Tab never reached Ask Goose"); return; }
  await press(page, "ask");
  await page.getByRole("button", { name: /Shop for this/ }).waitFor({ timeout: 20_000 });
  if (!await tabTo(page, named(/Shop for this/), null, faults, seen)) { faults.push("Tab never reached Shop for this"); return; }
  await press(page, "shop");
  await page.locator(".dk-protect h3", { hasText: "Goose set" }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(400);
  if (!await tabTo(page, named(/\bWhy\b/), null, faults, seen)) { faults.push("Tab never reached the set-aside's Why"); return; }
  await page.evaluate(() => document.activeElement?.setAttribute("data-kb-opener", ""));
  await press(page, "why");
  await page.locator('[role="dialog"]').first().waitFor({ timeout: 5_000 });
  await page.waitForTimeout(300);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    if (!await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))) { faults.push("Tab left the open Why sheet"); break; }
  }
  await page.keyboard.press("Escape");
  if (!await page.locator('[role="dialog"]').waitFor({ state: "detached", timeout: 3000 }).then(() => true, () => false)) faults.push("Escape didn't close the Why sheet");
  else if (!await page.waitForFunction(() => document.activeElement?.hasAttribute("data-kb-opener") ?? false, undefined, { timeout: 3000 }).then(() => true, () => false)) faults.push("focus didn't come back to Why after Escape");
}

async function walk(browser: Browser, size: { width: number; height: number }): Promise<{ failed: number; stops: number }> {
  const phone = size.width <= 720;
  const ctx = await browser.newContext({ bypassCSP: args.includes("--control"), viewport: size, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  if (args.includes("--control")) await page.addInitScript(() => addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = "*,*::before,*::after,*:focus,*:focus-visible,*:focus-within,:has(:focus-visible){outline:none!important;box-shadow:none!important;}"; document.head.append(st); }));
  const errors: string[] = [];
  const refused: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED/.test(m.text()) && !(KEYLESS && isAgTrialLine(m.text()))) errors.push(m.text().slice(0, 140)); });
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 140)));
  await page.route(/\/api\/(runs\/trick|runs\/scammer|judge)(\?|$)/, async (r) => { if (r.request().method() === "POST") { refused.push(r.request().url()); await r.abort(); } else await r.continue(); });
  const runs = fake || (args.includes("--run") && !phone);
  let failed = 0;
  const report = (name: string, faults: readonly string[], tabs: number) => {
    if (faults.length) failed++;
    console.log(`  ${size.width} ${name.padEnd(9)} ${String(tabs).padStart(3)} Tabs  ${faults.length ? `FAIL ${faults.join("; ")}` : "OK"}`);
  };

  await page.goto(`${base}/?desk=tour`, { waitUntil: "load" });
  await page.waitForTimeout(600);
  const start: string[] = [];
  const first = { own: false, tabs: 0 };
  // The stage's own button starts the tour, as the mouse's path does.
  const reached = await tabTo(page, (l) => l.go, null, start, first);
  if (!reached) start.push("Tab never reached the tour's first button");
  report("start", start, first.tabs);
  if (!reached) { await ctx.close(); return { failed: failed + TOUR_OPEN.length, stops: TOUR_OPEN.length + 1 }; }
  await press(page, "tr-next-go");
  await page.locator(".tp").waitFor({ timeout: 20_000 });

  for (const [i, stop] of TOUR_OPEN.entries()) {
    const faults: string[] = [];
    const seen = { own: false, tabs: 0 };
    await page.waitForTimeout(700);
    const said = (await page.locator(".tp .tp-next").textContent({ timeout: 10_000 }).catch(() => ""))?.replace(/\s+/g, " ") ?? "";
    const next = TOUR_OPEN[i + 1];
    if (next ? !said.includes(next.name) : !/Finish/.test(said)) faults.push(`Next says "${said.trim().slice(0, 40)}", wanted ${next?.name ?? "Finish"}`);
    if (stop.id === "watcher" && runs) await watcherRun(page, faults);
    const own = OWN[stop.id] ?? null;
    // The pill can come before or after the page in Tab order, so walk on until both have been met, and stop on Next.
    const metBoth = await tabTo(page, (l) => l.pill === "next" && (seen.own || own === null), own, faults, seen);
    if (!metBoth) {
      faults.push(seen.own || own === null ? "Tab never reached Next: a trap, or Next isn't focusable" : `Tab never reached the stop's own control (${own})`);
      report(stop.id, faults, seen.tabs);
      // Lost at this stop: every stop after it is unwalked, so each counts as failed, never as passed.
      failed += TOUR_OPEN.length - i - 1;
      break;
    }
    if (errors.length) faults.push(`console: ${errors.splice(0).join(" | ")}`);
    report(stop.id, faults, seen.tabs);
    const before = page.url();
    await press(page, "tp-next");
    if (next) {
      await page.waitForFunction(({ was, name }) => location.href !== was || (document.querySelector(".tp .tp-next")?.textContent ?? "").indexOf(name) < 0, { was: before, name: next.name }, { timeout: 15_000 }).catch(() => undefined);
      await page.waitForLoadState("load");
      await page.locator(".tp").waitFor({ timeout: 20_000 }).catch(() => undefined);
    } else {
      await page.locator(".tr-stage").waitFor({ timeout: 15_000 }).catch(() => { failed++; console.log(`  ${size.width} finish    FAIL Finish didn't come back to the tour`); });
    }
  }
  if (refused.length) { failed++; console.log(`  ${size.width} FAIL a keyboard walk tried to POST: ${refused.join(", ")}`); }
  await ctx.close();
  return { failed, stops: TOUR_OPEN.length + 1 };
}

const browser = await chromium.launch();
let failed = 0, stops = 0;
try {
  for (const size of SIZES) { const r = await walk(browser, size); failed += r.failed; stops += r.stops; }
} finally { await browser.close(); }
console.log(`keyboard-tour: ${failed} failed of ${stops} stops`);
process.exit(failed ? 1 : 0);

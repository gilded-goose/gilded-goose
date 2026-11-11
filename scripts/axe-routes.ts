// axe's WCAG A, AA and best-practice rules on every route, at both widths (Joshua, Nov 3, 1(d): "axe 0 on every route").
// Each at every scroll position, top to foot (Joshua, Nov 4). Otherwise it only reads pages. It presses Approve only on this machine's fake rail, to read Paid. Exit 0 at 0 violations, 1 above it, 2 if it couldn't finish: a skipped check must not read as a pass.
//
//   node scripts/axe-routes.ts <url>

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium, type Browser, type Page } from "playwright";
import { ROUTES } from "./postdeploy-check.ts";

export interface Metric { value: number | null; note?: string }

/** The longest page has nowhere near this many screens; a page that keeps growing as it's scrolled would never finish without it. */
const MAX_STOPS = 80;
/** The ask that reaches a deal on the fake rail, the same one desk-walk uses. */
const RUN_ASK = "A Marsh Lights ticket under $90";
/** The Desk's rooms a link opens by its hash: real pages to a visitor, and ROUTES doesn't name them (the same five as cold-routes). */
const HASH_ROOMS = ["/?desk=1#challenge", "/?desk=1#after", "/?desk=1#wants", "/?desk=1#week", "/?desk=1#settings"];

export async function axeRoutes(browser: Browser, base: string): Promise<Metric> {
  let src: string;
  try { src = readFileSync(process.env.AXE || createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8"); }
  catch { return { value: null, note: "axe-core isn't installed here" }; }
  let total = 0, scanned = 0;
  const rules = new Map<string, number>();
  const scanAll = async (page: Page, where: string, width: number) => {
    await page.addScriptTag({ content: src });
    const scan = (scrolled: boolean) => page.evaluate(async (scrolled) => {
      const r = await (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; nodes: { target: unknown[] }[] }[] }> } }).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] }, resultTypes: ["violations"] });
      // Scrolled, a link on its way past the bar is partly under it at that one position, and fine at any other. One that's stuck there stays so.
      const stuck = (t: unknown) => {
        for (let e = typeof t === "string" ? document.querySelector(t) : null; e && e !== document.body; e = e.parentElement) if (/sticky|fixed/.test(getComputedStyle(e).position)) return true;
        return false;
      };
      return r.violations.filter((v) => !scrolled || v.id !== "target-size" || v.nodes.some((n) => stuck(n.target[0]))).map((v) => v.id);
    }, scrolled);
    // Every screen of the page, with a quarter overlapping, since what goes wrong depends on where you are: Round 5's safe.html rail
    // slid under the bar only once scrolled, leaving 69 x 6 px targets, and a top-only scan stayed green. The foot is measured again
    // at each stop, as a page can grow while it's read. A page that never ends is a failure, not a quiet stop partway.
    const count: string[] = [];
    for (let y = 0, stops = 0; ; stops++) {
      if (stops >= MAX_STOPS) throw new Error(`more than ${MAX_STOPS} screens`);
      count.push(...(await scan(y > 0)).map((id) => `${id} at y=${y}`));
      const next = await page.evaluate((from) => {
        scrollTo({ top: from + Math.round(innerHeight * 0.75), behavior: "auto" });
        return Math.round(scrollY);
      }, y);
      if (next <= y) break;
      y = next;
      scanned++;
      await page.waitForTimeout(150);
    }
    scanned++;
    if (count.length) console.log(`  axe ${where} at ${width}: ${count.join(", ")}`);
    for (const hit of count) { const id = hit.split(" ")[0]!; rules.set(id, (rules.get(id) ?? 0) + 1); }
    total += count.length;
  };
  for (const route of [...ROUTES, ...HASH_ROOMS]) for (const width of [1440, 390]) {
    // bypassCSP: the site's own policy refuses axe's script. Only this measuring browser skips it.
    const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: "reduce", bypassCSP: true });
    const page = await ctx.newPage();
    try {
      await page.goto(new URL(route, base).href, { waitUntil: "load", timeout: 60_000 });
      // A hash room covers the landing until it has drawn: scanning the cover is scanning nothing, and calls the room headless.
      if (route.includes("#")) await page.waitForFunction(() => !document.documentElement.hasAttribute("data-first-room"), undefined, { timeout: 15_000 });
      await page.waitForTimeout(800);
      await scanAll(page, route, width);
    } catch (e) {
      return { value: null, note: `axe couldn't finish ${route} at ${width}: ${String(e).slice(0, 120)}` };
    } finally { await ctx.close(); }
  }
  // The run's own screens, which no address opens cold: the deal with Goose's caption up, and Paid (Round 5's seat: both failed, and this
  // never reached them). Only where a tap spends nothing: this machine's fake rail. Elsewhere they aren't read, and the note says so.
  const fake = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(base).hostname)
    && await fetch(new URL("/api/health", base)).then((r) => r.json() as Promise<{ payment?: string }>).then((h) => h.payment === "fake", () => false);
  if (fake) for (const width of [1440, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: "reduce", bypassCSP: true });
    const page = await ctx.newPage();
    try {
      await page.goto(new URL("/?desk=1", base).href, { waitUntil: "load", timeout: 60_000 });
      await page.getByRole("button", { name: RUN_ASK }).click();
      await page.getByRole("button", { name: /Shop for this/ }).click();
      // A caption stays up while the pointer is on it, so hold the first one for the whole scan.
      await page.waitForFunction(() => { const b = document.querySelector<HTMLElement>(".gv-cap"); if (!b || b.hidden) return false; b.dispatchEvent(new Event("pointerenter")); return true; }, undefined, { timeout: 15_000 });
      await page.locator(".dk-deal2.dk-final").waitFor({ timeout: 30_000 });
      await scanAll(page, "the deal, with a caption", width);
      await page.locator(".dk-approve").first().click();
      await page.getByText(/^Paid /).first().waitFor({ timeout: 30_000 });
      await page.waitForTimeout(800);
      await scanAll(page, "Paid", width);
    } catch (e) {
      return { value: null, note: `axe couldn't reach the run's screens at ${width}: ${String(e).slice(0, 160)}` };
    } finally { await ctx.close(); }
  }
  return { value: total, note: [`${scanned} screens`, ...(fake ? [] : ["the deal and Paid not read: no local fake rail here"]), ...[...rules].map(([id, n]) => `${id} x${n}`)].join(", ") };
}

if (import.meta.main) {
  const base = process.argv.slice(2).find((a) => /^https?:/.test(a));
  if (!base) { console.error("usage: node scripts/axe-routes.ts <url>"); process.exit(2); }
  const browser = await chromium.launch();
  const m = await axeRoutes(browser, base).finally(() => browser.close());
  console.log(m.value === null ? `axe-routes: not measured, ${m.note}` : `axe-routes: ${m.value} violations on ${ROUTES.length} routes and ${HASH_ROOMS.length} hash rooms at 1440 and 390, every scroll position${m.note ? ` (${m.note})` : ""}`);
  process.exit(m.value === null ? 2 : m.value > 0 ? 1 : 0);
}

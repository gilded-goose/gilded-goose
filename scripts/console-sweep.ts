/// <reference lib="dom" />
// Track R (launch program, checklist §6): zero console errors on every route at both widths, after every deploy.
//
//   node scripts/console-sweep.ts https://gilded-goose.onrender.com     (or: corepack pnpm postdeploy:console <url>)
//
// At 1440×900 and 390×844 it opens every route of docs/guild/launch-checklist.md (the same list as postdeploy-check),
// waits for it to settle, and runs one short interaction on each: open "Everything Goose does" and close it; on the Desk,
// ask for something, shop for it and wait for the verdict; on Behind the scenes, open one row. It fails on any console
// error, uncaught page error, failed request or 4xx/5xx response, except the deliberate 404 probe's own document (and
// the browser's console line for it). Requests a navigation or the page itself cancelled (net::ERR_ABORTED) are not
// failures; they are counted. It also fails on a visible status or alert box with no words (an empty state drawn).
// Never taps Approve: nothing is paid. Exits 1 with every error by route and width.
//
//   --routes "/,/?desk=1"   only these routes        --skip-run   no Desk run (e.g. while live mode's caps are spent)

import { chromium, devices, type Page } from "playwright";
import { NOT_FOUND_PROBE, ROUTES } from "./postdeploy-check.ts";

const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const base = process.argv.slice(2).find((a) => /^https?:\/\//.test(a));
if (!base) { console.error("usage: node scripts/console-sweep.ts <baseUrl> [--routes a,b] [--skip-run]"); process.exit(2); }
const routes = arg("--routes")?.split(",") ?? [...ROUTES, NOT_FOUND_PROBE];
const skipRun = process.argv.includes("--skip-run");

interface Problem { width: string; route: string; kind: string; text: string }
const problems: Problem[] = [];
const done: { width: string; route: string; errors: number; aborted: number; step: string; ms: number; idle: boolean }[] = [];

/** Wait for the page to load and go quiet. False when it never went network-idle in 8 s: a request left open (Track R's
 *  own health probe once left its body unread). Shown per visit, not a failure: a live run's stream is open on purpose. */
async function settle(page: Page): Promise<boolean> {
  await page.waitForLoadState("load", { timeout: 60_000 }).catch(() => {});
  const idle = await page.waitForLoadState("networkidle", { timeout: 8_000 }).then(() => true, () => false);
  await page.waitForTimeout(600);
  return idle;
}

/** Open the one menu and close it again (Escape), whichever bar this route draws (the white site's at `/`: .menu-btn). */
async function openMenu(page: Page): Promise<string> {
  const btn = page.locator("button.gm-btn:visible, button.dk-menu:visible, [data-gn-menu] button:visible, .header button.menu-btn:visible").first();
  // The white site's wide header draws its pages in the bar itself; its menu button is the phone's.
  if (!(await btn.count())) return (await page.locator(".header nav:visible a").count()) ? "bar" : "no menu button";
  await btn.click({ timeout: 10_000 });
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  return "menu";
}

/** The Desk's run: ask, shop, and wait for the verdict (the deal card's Approve, a set-aside card, or No deal). */
async function deskRun(page: Page): Promise<string> {
  const box = page.getByRole("textbox", { name: "Ask for anything" }).first();
  if (!(await box.count())) return "no ask box";
  await box.fill("A kettle under $60");
  await page.getByRole("button", { name: "Ask Goose" }).first().click();
  await page.getByRole("button", { name: /Shop for this/ }).click({ timeout: 30_000 });
  // A verdict, or the Desk's own honest end "No market for that yet." (a server with no AI key to make a market, or a
  // cap spent): both are an end the shopper sees, so neither is a timeout. The step says which, so a live run that
  // should have reached a verdict and didn't is visible in the table.
  const end = page.locator("button.dk-approve, .dk-protect h3, .dk-nodeal, [data-verdict], .dk-live.dk-done").first();
  await end.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  return (await page.locator(".dk-live.dk-done").count()) && !(await page.locator("button.dk-approve, .dk-protect h3, .dk-nodeal, [data-verdict]").count()) ? "run → no market" : "run → verdict";
}

/** Behind the scenes: open one row (the grid's first, or the Studio's first). */
async function ledgerRow(page: Page): Promise<string> {
  const row = page.locator(".ag-center-cols-container .ag-row:visible, [role='row'][row-index='0']:visible, .lx-card > button:visible, .lx-row:visible, tbody tr:not(.lx-sr tr):visible").first(); // .lx-sr: a screen-reader table, clipped, nothing to tap
  await row.waitFor({ timeout: 20_000 }).catch(() => {});
  if (!(await row.count())) return "no row";
  await row.click({ timeout: 10_000 });
  await page.waitForTimeout(800);
  await page.keyboard.press("Escape");
  return "row";
}

const browser = await chromium.launch();
try {
  for (const width of ["1440", "390"] as const) {
    const ctx = width === "390"
      ? await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } })
      : await browser.newContext({ viewport: { width: 1440, height: 900 } });
    for (const route of routes) {
      const page = await ctx.newPage();
      const url = new URL(route, base).href;
      const probe = route === NOT_FOUND_PROBE;
      let errors = 0;
      let aborted = 0;
      const add = (kind: string, text: string) => { errors++; problems.push({ width, route, kind, text }); };
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        // The deliberate probe's document is a 404; Chrome logs that as a console error. Nothing else is excused.
        if (probe && /status of 404/.test(m.text()) && (m.location().url === url || !m.location().url)) return;
        add("console", `${m.text()}${m.location().url ? ` (${m.location().url}:${m.location().lineNumber})` : ""}`);
      });
      page.on("pageerror", (e) => add("pageerror", e.message));
      page.on("requestfailed", (r) => {
        const why = r.failure()?.errorText ?? "";
        if (/ERR_ABORTED/.test(why)) { aborted++; return; }
        add("requestfailed", `${r.method()} ${r.url()}: ${why}`);
      });
      page.on("response", (r) => {
        if (r.status() < 400) return;
        if (probe && r.url() === url) return;
        add("response", `${r.status()} ${r.request().method()} ${r.url()}`);
      });
      const t0 = Date.now();
      let step = "load";
      let idle = false;
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
        idle = await settle(page);
        step = await openMenu(page);
        // An interaction the sweep couldn't do is a failure, never a silent skip: the page lost its menu, ask box or rows.
        const missed = () => { const m = /no (menu button|ask box|row)/.exec(step); if (m) add("sweep", `couldn't ${step}`); };
        const q = new URL(url).searchParams;
        if (q.get("desk") === "1" && !skipRun) { step += `, ${await deskRun(page)}`; await settle(page); }
        if (q.get("desk") === "ledger" || q.get("desk") === "studio") { step += `, ${await ledgerRow(page)}`; await settle(page); }
        missed();
        // The class of Track R's own first bug: a state box drawn with no words (its `hidden` lost to a display rule).
        // Any status or alert box at least 24 px each way that paints (a fill or a border) and has no text is a raw state,
        // and fails. A transparent live region laid over a chart (AG Charts' overlay) paints nothing and is not one.
        const empty = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[role=status], [role=alert], .st-note")]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            const s = getComputedStyle(e);
            const paints = !/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor) || (parseFloat(s.borderTopWidth) > 0 && !/rgba\(0, 0, 0, 0\)|transparent/.test(s.borderTopColor)) || s.boxShadow !== "none";
            return r.width >= 24 && r.height >= 24 && s.visibility !== "hidden" && s.opacity !== "0" && paints && !e.innerText.trim();
          })
          .map((e) => `<${e.tagName.toLowerCase()} class="${e.className}" role="${e.getAttribute("role") ?? ""}">`));
        for (const e of empty) add("empty-state", `a visible state box with no words: ${e}`);
      } catch (e) {
        add("sweep", `${step}: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
      }
      done.push({ width, route, errors, aborted, step, ms: Date.now() - t0, idle });
      await page.close();
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

const pad = (s: string, n: number) => s.padEnd(n);
console.log(`console-sweep ${base}: ${done.length} visits (${routes.length} routes × 2 widths)`);
for (const d of done) console.log(`  ${pad(d.width, 5)}${pad(d.route, 26)}${pad(String(d.errors), 3)} error${d.errors === 1 ? " " : "s"}  ${pad(d.step, 24)} ${d.aborted ? `${d.aborted} aborted ` : ""}${d.idle ? "" : "never idle "}${(d.ms / 1000).toFixed(1)} s`);
for (const p of problems) console.log(`  FAIL ${p.width} ${p.route} [${p.kind}] ${p.text}`);
if (problems.length) { console.log(`${problems.length} error${problems.length === 1 ? "" : "s"}`); process.exit(1); }
console.log("PASS: zero console errors, page errors and failed requests on every route at 1440 and 390.");

// The ratchet's live half (Joshua, Nov 3, 1(d)): first-screen time, p95 interaction, axe, console errors and asset 404s
// are measured on a running site, so one slow network mustn't block a merge. This records them and warns; it exits 0
// unless --strict. Run it after every ship and after the walks, then commit docs/guild/ratchet-live.json with the board.
//
//   corepack pnpm ratchet:record <url>                          measure, record, warn
//   corepack pnpm ratchet:record <url> --set liveWalksFailed=1  add a failure a person's walk found to what the scripts found
//   corepack pnpm ratchet:record <url> --with-run               the walks include one real Desk run (it spends a run; never presses Approve)
//   corepack pnpm ratchet:record <url> --strict                 exit 1 on a worse number (for the Lead's own gate)
//
// A number nobody measured is `null` with the reason, never 0: a skipped check must not read as a pass.
// It only reads pages unless --with-run. It never POSTs to /api/runs/trick or /api/judge: that counter is real attempts only.
// A local URL prints its numbers and writes nothing: a laptop's first screen is no best for live to be held to.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { axeRoutes } from "./axe-routes.ts";
import { runWalks } from "./live-walks.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "docs/guild/ratchet-live.json");
const FIRST_SCREEN = ["/", "/?wallet=1", "/?wallet=0"];
const INTERACTION_ROUTES = ["/?desk=1", "/?wallet=1", "/?desk=how"];
/** Timings wander with the network: a warning needs more than this over the best. Counts (errors, 404s) have no slack. */
const TIMING_SLACK = 1.15;

type Value = number | null;
interface Metric { value: Value; note?: string }
interface LiveFile { about: string; latest: { at: string; base: string; ranFrom: string; metrics: Record<string, Metric> } | null; best: Record<string, number>; history: { at: string; ranFrom: string; metrics: Record<string, Value> }[] }

const lastLine = (s: string) => s.trim().split("\n").at(-1) ?? "";
const scriptPath = (name: string) => join(ROOT, "scripts", name);

/** Sum the two published checks, from their own output. A check that couldn't run is null, with why. */
function firstScreen(base: string): Record<string, Metric> {
  const out: Record<string, Metric> = {};
  for (const route of FIRST_SCREEN) {
    const r = spawnSync("node", [scriptPath("budget-first-screen.ts"), new URL(route, base).href, "3"], { encoding: "utf8", timeout: 120_000 });
    const m = /^first-screen.*p95 = (\d+) ms/m.exec(r.stdout); // its first p95 line can be the Desk hero's, not this number
    out[`firstScreenP95Ms ${route}`] = m ? { value: Number(m[1]) } : { value: null, note: `no p95 in its output: ${lastLine(r.stderr || r.stdout).slice(0, 120)}` };
  }
  return out;
}

function assets404(base: string): Metric {
  const r = spawnSync("node", [scriptPath("postdeploy-check.ts"), base], { encoding: "utf8", timeout: 240_000 });
  if (!r.stdout.startsWith("postdeploy-check ")) return { value: null, note: `postdeploy-check didn't finish: ${lastLine(r.stderr || r.stdout).slice(0, 120)}` };
  // Only a file that didn't load counts here; its cache headers and the rest are postdeploy-check's own gate.
  return { value: (r.stdout.match(/^ {2}FAIL \[status\]/gm) ?? []).length };
}

/** --skip-run: the sweep only reads pages here, so a record never spends a run. */
function consoleErrors(base: string): Metric {
  const r = spawnSync("node", [scriptPath("console-sweep.ts"), base, "--skip-run"], { encoding: "utf8", timeout: 480_000 });
  if (r.status === 0 && /PASS/.test(r.stdout)) return { value: 0 };
  const m = /^(\d+) errors?$/m.exec(r.stdout);
  return m ? { value: Number(m[1]) } : { value: null, note: `the sweep didn't finish: ${lastLine(r.stderr || r.stdout).slice(0, 120)}` };
}

/**
 * p95 of the browser's own Event Timing durations, across the tries a judge's keyboard makes: Tab along a page, and open
 * and close its menu (the one control every page has that changes nothing and pays nothing). It presses nothing else.
 */
async function interaction(browser: Browser, base: string): Promise<Metric> {
  const all: number[] = [];
  for (const route of INTERACTION_ROUTES) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      const seen: number[] = [];
      (window as unknown as { __inp: number[] }).__inp = seen;
      new PerformanceObserver((l) => { for (const e of l.getEntries() as (PerformanceEntry & { interactionId?: number })[]) if (e.interactionId) seen.push(e.duration); }).observe({ type: "event", durationThreshold: 16, buffered: true } as PerformanceObserverInit);
    });
    try {
      await page.goto(new URL(route, base).href, { waitUntil: "load", timeout: 60_000 });
      await page.waitForTimeout(1200);
      for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
      const menu = page.locator('button.gm-btn[aria-haspopup="dialog"]').first();
      for (let i = 0; i < 3 && await menu.isVisible().catch(() => false); i++) { await menu.click(); await page.waitForTimeout(250); await page.keyboard.press("Escape"); await page.waitForTimeout(250); }
      await page.waitForTimeout(400);
      all.push(...await page.evaluate(() => (window as unknown as { __inp: number[] }).__inp));
    } catch (e) {
      return { value: null, note: `couldn't finish ${route}: ${String(e).slice(0, 120)}` };
    } finally { await ctx.close(); }
  }
  if (!all.length) return { value: 0, note: "no interaction took 16 ms or more" };
  const sorted = all.sort((a, b) => a - b);
  return { value: Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]!), note: `${all.length} slow-enough events` };
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const base = args.find((a) => /^https?:/.test(a));
  if (!base) { console.error("usage: node scripts/ratchet-record.ts <url> [--set name=value]... [--with-run] [--strict]"); return 2; }
  const metrics: Record<string, Metric> = {};
  const set: Record<string, number> = {};
  for (const [i, a] of args.entries()) if (a === "--set") {
    const [k, v] = (args[i + 1] ?? "").split("=");
    if (k && v !== undefined && Number.isFinite(Number(v))) set[k] = Number(v);
  }
  Object.assign(metrics, firstScreen(base));
  metrics.assets404 = assets404(base);
  metrics.consoleErrors = consoleErrors(base);
  const browser = await chromium.launch();
  try {
    metrics.axeViolations = await axeRoutes(browser, base);
    metrics.interactionP95Ms = await interaction(browser, base);
  } finally { await browser.close(); }
  const { walks, keyboard } = runWalks(base, { withRun: args.includes("--with-run") });
  metrics.keyboardTourFailed = keyboard;
  metrics.liveWalksFailed = walks;
  // --set adds to what the scripts found: a person's failed walk can't be overwritten, and can't overwrite a red script.
  for (const [k, v] of Object.entries(set)) {
    const m = metrics[k];
    metrics[k] = !m ? { value: v, note: "from the walk" } : m.value === null ? m : { value: m.value + v, note: `${m.note ? `${m.note}; ` : ""}${v} more from the walk` };
  }
  if (/^https?:\/\/(localhost|127\.|\[::1\]|[^/]*\.localhost)/.test(base)) {
    for (const [k, m] of Object.entries(metrics)) console.log(`  ${k}: ${m.value ?? "not measured"}${m.note ? ` (${m.note})` : ""}`);
    console.log("ratchet-record: a local URL, so nothing written to docs/guild/ratchet-live.json.");
    return 0;
  }

  const file: LiveFile = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) as LiveFile : { about: "The ratchet's live numbers, from scripts/ratchet-record.ts. best only improves; lower is better for all of them.", latest: null, best: {}, history: [] };
  const at = new Date().toISOString();
  // The checkout that ran this, which is not what the site is serving: the board says what is live.
  const ranFrom = execFileSync("git", ["rev-parse", "--short=8", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  const worse: string[] = [];
  for (const [k, m] of Object.entries(metrics)) {
    console.log(`  ${k}: ${m.value ?? "not measured"}${m.note ? ` (${m.note})` : ""}`);
    if (m.value === null) continue;
    const best = file.best[k];
    if (best !== undefined && m.value > (/Ms\b/.test(k) ? best * TIMING_SLACK : best)) worse.push(`${k}: ${m.value}, best ${best}`);
    if (best === undefined || m.value < best) file.best[k] = m.value;
  }
  file.latest = { at, base, ranFrom, metrics };
  file.history = [...file.history, { at, ranFrom, metrics: Object.fromEntries(Object.entries(metrics).map(([k, m]) => [k, m.value])) }].slice(-30);
  writeFileSync(FILE, `${JSON.stringify(file, null, 2)}\n`);
  for (const w of worse) console.log(`  WARNING worse than the best: ${w}`);
  console.log(`ratchet-record: ${Object.keys(metrics).length} numbers in docs/guild/ratchet-live.json, ${worse.length} worse than best.`);
  return worse.length && args.includes("--strict") ? 1 : 0;
}

// Never a merge-blocker unless asked: even a crash here records nothing and exits 0.
const strict = process.argv.includes("--strict");
process.exit(await main().catch((e: unknown) => { console.error(`ratchet-record couldn't finish: ${String(e)}`); return strict ? 1 : 0; }));

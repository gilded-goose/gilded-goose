/// <reference lib="dom" />
// Every door into Behind the scenes, on the tour, with Studio drawn. The page there is a shell, and then the dashboard takes the
// shell's place (studio/Shell.tsx). On Nov 5 the tour's pill went with the shell: live stranded a judge at stop 10 with no Next, and
// CI stayed green, because a build with no key draws the Community ledger, where nothing swaps. So this runs on a build that draws
// Studio as live does:
//   GOOSE_FLIP_REHEARSAL=1 corepack pnpm --filter @goose/web build
//   node scripts/studio-tour-doors.ts <url>
// GET only, and safe on live. Each door, at 1440 and 390: once the dashboard has taken over, one pill, on screen, whose Next names the
// next stop and opens it. It refuses a page with no Studio on it, since a ledger would pass and prove nothing.
// Last line: "tour doors: N failed of M". Exit 1 when N is over 0.
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { TOUR } from "@goose/core/tour";

const BASE = (process.argv[2] ?? "").replace(/\/$/, "");
if (!BASE) { console.error("usage: node scripts/studio-tour-doors.ts <url>"); process.exit(2); }
const SIZES = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];
const open = TOUR.filter((s) => s.href);
const where = open.findIndex((s) => s.id === "ledger");
const before = open[where - 1]!, after = open[where + 1]!;
const at = (id: string) => TOUR.findIndex((s) => s.id === id);
const SHOWN = '[data-studio-layer="shown"] .st-studio[data-ready="1"]';

interface Door { name: string; from: string; at: string; slow?: boolean; go?: (p: Page) => Promise<unknown>; prep?: (c: BrowserContext) => Promise<unknown> }
const tap = (sel: string) => (p: Page) => p.locator(sel).first().click({ timeout: 30_000 });
const DOORS: Door[] = [
  { name: `Next from ${before.id}`, from: `/${before.href}`, at: before.id, go: tap(".tp .tp-next") },
  { name: `Back from ${after.id}`, from: `/${after.href}`, at: after.id, go: tap(".tp a.tp-back") },
  { name: "the address ?desk=ledger", from: "/?desk=ledger", at: "ledger" },
  { name: "the address ?desk=studio", from: "/?desk=studio", at: "ledger" },
  { name: "the address with studio=force", from: "/?desk=studio&studio=force", at: "ledger" },
  { name: "a reload on the page", from: "/?desk=ledger", at: "ledger", go: async (p) => { await p.locator(SHOWN).waitFor({ timeout: 60_000, state: "attached" }); await p.reload({ waitUntil: "load" }); } },
  { name: "the tour page's own button", from: "/?desk=tour", at: "ledger", prep: (c) => c.addInitScript((ids: string[]) => localStorage.setItem("goose_tour", JSON.stringify(ids)), TOUR.slice(0, at("ledger")).map((s) => s.id)), go: tap(".tr-next-go") },
  { name: "the menu", from: `/${before.href}`, at: "ledger", go: async (p) => { await p.locator(".gm-btn:visible").first().click(); await p.getByRole("link", { name: /^Behind the scenes/ }).last().click({ timeout: 15_000 }); } },
  // A slow phone: the pill's own chunk lands after the dashboard has taken over, so the bar it was asked to sit under is gone.
  { name: "the pill's chunk landing after the swap", from: "/?desk=ledger", at: "ledger", slow: true, prep: async (c) => { await c.route(/\/assets\/TourPill[^/]*\.js$/, async (r) => { await new Promise((f) => setTimeout(f, 25_000)); await r.continue(); }); } },
];

let bad = 0, total = 0;
const check = (ok: boolean, what: string) => { total++; if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${what}`); };

async function walk(browser: Browser, size: { width: number; height: number }, door: Door) {
  const label = `${size.width} ${door.name}`;
  const ctx = await browser.newContext({ viewport: size });
  await ctx.route(/\/api\/(runs\/trick|runs\/scammer|judge)(\?|$)/, (r) => r.request().method() === "POST" ? r.abort() : r.continue());
  await ctx.addInitScript((n: number) => { if (!sessionStorage.getItem("zz-door")) { sessionStorage.setItem("zz-door", "1"); sessionStorage.setItem("goose_tour_at", String(n)); } }, at(door.at));
  await door.prep?.(ctx);
  const page = await ctx.newPage();
  await page.goto(BASE + door.from, { waitUntil: "load" });
  try { await door.go?.(page); } catch (e) { check(false, `${label}: couldn't go through it: ${String(e).slice(0, 120)}`); await ctx.close(); return; }
  await page.waitForURL(/desk=(ledger|studio)/, { timeout: 30_000 }).catch(() => undefined);
  const drawn = await page.locator(SHOWN).waitFor({ timeout: 60_000, state: "attached" }).then(() => true, () => false);
  if (!drawn) { check(false, `${label}: Studio never took over at ${page.url()}: not a Studio build, so this proves nothing`); await ctx.close(); return; }
  // The swap has happened. Give the pill what a person would wait, longer for the held chunk.
  const pill = await page.locator(".tp .tp-next").first().waitFor({ timeout: door.slow ? 35_000 : 6_000 }).then(() => true, () => false);
  if (!pill) { check(false, `${label}: no pill once the dashboard took over`); await ctx.close(); return; }
  const r = await page.evaluate(() => { const b = document.querySelector(".tp .tp-next")!.getBoundingClientRect(); return { pills: document.querySelectorAll(".tp").length, on: b.width > 0 && b.height > 0 && b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth, words: (document.querySelector(".tp .tp-next")!.textContent ?? "").replace(/\s+/g, " ").trim() }; });
  check(r.pills === 1 && r.on && r.words.includes(after.name), `${label}: one pill, on screen, Next says "${r.words}" (${r.pills} pills, on screen ${r.on})`);
  await page.locator(".tp .tp-next").first().click({ timeout: 10_000 });
  const moved = await page.waitForURL((u) => (u.search + u.hash).startsWith(after.href!), { timeout: 15_000 }).then(() => true, () => false);
  check(moved, `${label}: Next opens ${after.id}${moved ? "" : `, and it's still at ${page.url()}`}`);
  await ctx.close();
}

// A keyboard on the pill as the shell goes: Studio's chunk is held back so this is the same test every time, not a race.
async function keyboardAtSwap(browser: Browser, size: { width: number; height: number }, control: string, name: string) {
  const label = `${size.width} keyboard on ${name} at the swap`;
  const ctx = await browser.newContext({ viewport: size });
  await ctx.route("**/*", async (r) => {
    const m = r.request().method();
    if (m !== "GET" && m !== "HEAD") return r.abort();
    if (/assets\/Studio-[\w-]+\.js/.test(r.request().url())) await new Promise((go) => setTimeout(go, 8000));
    return r.continue();
  });
  await ctx.addInitScript((n: number) => { sessionStorage.setItem("goose_tour_at", String(n)); }, at("ledger"));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?desk=ledger`, { waitUntil: "domcontentloaded" });
  const ready = await page.locator(`.st-shell ~ * ${control}, .tp ${control}`).first().waitFor({ timeout: 7_000 }).then(() => true, () => false);
  const shell = await page.locator(".st-shell").count();
  if (!ready || !shell) { check(false, `${label}: the pill wasn't there before the swap (pill ${ready}, shell ${shell})`); await ctx.close(); return; }
  await page.locator(`.tp ${control}`).first().focus();
  const swapped = await page.locator(SHOWN).waitFor({ timeout: 60_000, state: "attached" }).then(() => true, () => false);
  await page.waitForTimeout(600);
  const on = await page.evaluate((c) => { const a = document.activeElement as HTMLElement | null; return { held: !!a?.closest(c), what: a && a !== document.body ? `${a.tagName} ${(a.textContent ?? "").trim().slice(0, 30)}` : "body" }; }, control);
  check(swapped && on.held, `${label}: focus stays on it (${on.what})`);
  await ctx.close();
}

const browser = await chromium.launch();
try {
  for (const size of SIZES) {
    for (const door of DOORS) await walk(browser, size, door);
    await keyboardAtSwap(browser, size, ".tp-next", "Next");
    await keyboardAtSwap(browser, size, "a.tp-back", "Back");
  }
} finally { await browser.close(); }
console.log(`tour doors: ${bad} failed of ${total}`);
process.exit(bad ? 1 : 0);

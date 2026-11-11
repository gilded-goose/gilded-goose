// Devpost's gallery (Lead-13, Wed Nov 11): seven 3:2 frames of the white site (goose.html), 2400x1600 each, every one
// framed on its subject rather than dumped full-page.
//   node scripts/gallery-shots.ts <baseUrl> <outdir>
// Deterministic: fixed viewports (mostly 1500x1000 CSS px at 1.6x; each frame says its own), reduced motion, fonts loaded, the same chip each time. Nothing
// here types a login or pays: the receipt frame needs a tap through to the receipt, so it runs only when the server says
// PAYMENT=fake on localhost (the stand-in for PayPal); against any other server it is skipped and says so, and the
// committed local frame stays. Frames 2 and 4 start a shop run (a POST), so off localhost they need GALLERY_LIVE_RUNS=1.
// The trick frame (3) uses a ready-made note, which the site doesn't count as a try, but it still POSTs a round to the
// server: off localhost it is skipped (no Try to trick submissions on live) unless GALLERY_LIVE_TRICK=1.
// Exits 1 on any console error, a page error, "Server away", a loading state left in the frame, or a missing subject.
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const [baseArg, outArg] = process.argv.slice(2);
if (!baseArg || !outArg) {
  console.error("usage: node scripts/gallery-shots.ts <baseUrl> <outdir>");
  process.exit(2);
}
const base = baseArg.replace(/\/$/, "");
const out = resolve(outArg);
mkdirSync(out, { recursive: true });

const OUT_W = 2400, OUT_H = 1600; // 3:2
/** A frame: the viewport in CSS px, and the 3:2 region of it that is kept (from the top, centered), scaled to 2400x1600. */
interface Frame { vw: number; vh: number; keep: number }
const STD: Frame = { vw: 1500, vh: 1000, keep: 1500 };
const NAV = 96; // the floating nav's height and its gap: a framed subject starts just under it
const problems: string[] = [];
const wrote: string[] = [];

const health = await fetch(`${base}/api/health`).then((r) => r.json() as Promise<{ payment?: string }>).catch(() => null);
const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base);
const fakeRail = health?.payment === "fake" && local;
// A shop run is a POST /api/runs: on a server that isn't local, frames 2 and 4 write one run each, so they run there only
// when asked (Decided by default, Lead-13 Track D: no writes to live unless GALLERY_LIVE_RUNS=1. Flip if Joshua says so).
const runsOk = local || process.env.GALLERY_LIVE_RUNS === "1";

const browser = await chromium.launch();
const frames = new WeakMap<Page, Frame>();

async function open(hash: string, tag: string, f: Frame = STD): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: f.vw, height: f.vh }, deviceScaleFactor: OUT_W / f.keep, reducedMotion: "reduce", colorScheme: "light" });
  const page = await ctx.newPage();
  frames.set(page, f);
  page.on("console", (m) => { if (m.type() === "error") problems.push(`${tag}: console error: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`${tag}: page error: ${e.message}`));
  await page.goto(`${base}/goose.html${hash}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(1500);
  return page;
}

/** Scroll so the subject's top sits just under the nav, then let lazy parts (charts, the grid) draw. */
async function frame(page: Page, selector: string, offset = NAV): Promise<void> {
  const el = page.locator(selector).first();
  await el.waitFor({ state: "visible", timeout: 15000 });
  await page.evaluate(([sel, off]) => {
    const e = document.querySelector(sel as string)!;
    window.scrollTo({ top: Math.max(0, e.getBoundingClientRect().top + window.scrollY - (off as number)), behavior: "instant" });
  }, [selector, offset] as const);
  await page.waitForTimeout(1500);
}

/** If a row (of `rows`) crosses the frame's bottom edge, scroll up so the frame ends just above it: nothing half-cut. */
async function endOnRow(page: Page, rows: string): Promise<void> {
  const f = frames.get(page)!;
  const bottom = f.keep / 1.5;
  await page.evaluate(([sel, edge]) => {
    const cut = [...document.querySelectorAll(sel as string)].map((e) => e.getBoundingClientRect()).find((r) => r.top < (edge as number) && r.bottom > (edge as number));
    if (cut) window.scrollBy({ top: -((edge as number) - cut.top) - 2, behavior: "instant" });
  }, [rows, bottom] as const);
  await page.waitForTimeout(600);
}

async function shoot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(0, 0);
  const bad = await page.evaluate(() => {
    const text = document.body.innerText;
    const out: string[] = [];
    if (/Server away/.test(text)) out.push('"Server away" is on the page');
    for (const el of document.querySelectorAll('[aria-busy="true"]')) {
      const r = el.getBoundingClientRect();
      if (r.bottom > 0 && r.top < innerHeight && r.width > 0) out.push(`a loading state is in the frame (${el.className || el.tagName})`);
    }
    return out;
  });
  for (const b of bad) problems.push(`${name}: ${b}`);
  const file = resolve(out, `${name}.png`);
  const f = frames.get(page)!;
  await page.screenshot({ path: file, clip: { x: (f.vw - f.keep) / 2, y: 0, width: f.keep, height: f.keep / 1.5 } });
  const size = await page.evaluate(() => devicePixelRatio);
  if (Math.round(f.keep * size) !== OUT_W) problems.push(`${name}: ${f.keep * size} px wide, not ${OUT_W}`);
  wrote.push(file);
  console.log(`  wrote ${file}`);
  await page.context().close();
}

/** The shop, run to Goose's pick on the kettle chip; every frame shares its $60 limit (the market is the practice one either way). */
async function shopRun(tag: string, f: Frame = STD): Promise<Page> {
  const page = await open("#/shop", tag, f);
  await page.getByRole("button", { name: "A kettle under $60" }).click();
  await page.getByRole("button", { name: "Send Goose" }).click();
  await page.waitForTimeout(1200);
  const skip = page.getByRole("button", { name: "Skip to the end" });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.getByRole("button", { name: "Review and approve" }).first().waitFor({ state: "visible", timeout: 30000 });
  await page.getByText("Compared against your").first().waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(2500);
  return page;
}

try {
  // 1. The hero: the promise and the ask, first screen as a judge lands.
  {
    const page = await open("#/", "hero");
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(1500);
    await shoot(page, "1-hero");
  }
  // 2. Goose's pick with the compare grid under it.
  if (!runsOk) console.log("  skipped 2-pick-and-compare: a shop run writes to this server; set GALLERY_LIVE_RUNS=1 to allow it");
  else {
    // A taller frame (same 3:2), so the pick card and the grid's first rows both fit.
    const page = await shopRun("pick", { vw: 1875, vh: 1250, keep: 1875 });
    await frame(page, ".rec", NAV + 8);
    await endOnRow(page, ".ag-row, [role=row]");
    await shoot(page, "2-pick-and-compare");
  }
  // 3. "Set aside": a gift-card note in Try to trick Goose, the verdict with its reasons. A round is a POST, so off
  // localhost it runs only when asked (Decided by default, W3 Nov 11: never on live by default. Flip if Joshua says so).
  if (!local && process.env.GALLERY_LIVE_TRICK !== "1") console.log("  skipped 3-set-aside: a Try to trick round posts to this server; set GALLERY_LIVE_TRICK=1 to allow it");
  else {
    const page = await open("#/", "set-aside");
    await page.locator(".trk-chip", { hasText: /gift card/i }).first().click();
    await page.getByRole("button", { name: /^Test it$/ }).click();
    await page.locator(".trk-answer").waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(1500);
    const verdict = await page.locator(".trk-answer").getAttribute("data-verdict");
    if (!verdict || !/aside|refus/i.test(verdict)) problems.push(`set-aside: the verdict is "${verdict}", not set aside`);
    await frame(page, "#trick", NAV - 20);
    await shoot(page, "3-set-aside");
  }
  // 4. The approve sheet: one exact cart, only your tap pays. Opened, never tapped.
  if (!runsOk) console.log("  skipped 4-approve: a shop run writes to this server; set GALLERY_LIVE_RUNS=1 to allow it");
  else {
    const page = await shopRun("approve");
    await page.getByRole("button", { name: "Review and approve" }).first().click();
    await page.locator(".approve-btn").first().waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(1200);
    await shoot(page, "4-approve");
  }
  // 5. The receipt with Undo: only on the stand-in for PayPal, where the tap moves no money.
  if (fakeRail) {
    const page = await shopRun("receipt", { vw: 1500, vh: 1000, keep: 1350 }); // ends under Undo, before After you pay
    await page.getByRole("button", { name: "Review and approve" }).first().click();
    await page.locator(".approve-btn").first().click();
    await page.getByRole("button", { name: "Undo this payment" }).waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(1500);
    await frame(page, ".receipt", NAV + 20);
    await shoot(page, "5-receipt-undo");
  } else {
    console.log("  skipped 5-receipt-undo: it needs a tap through to the receipt, so it runs only on a local PAYMENT=fake server");
  }
  // 6. Under the hood: every try, in AG Grid.
  {
    const page = await open("#/under-the-hood", "hood");
    const h = page.getByRole("heading", { name: "Every try" }).first();
    await h.waitFor({ state: "visible", timeout: 20000 });
    await page.evaluate(() => {
      const e = [...document.querySelectorAll("h3")].find((x) => x.textContent?.trim() === "Every try")!;
      const card = e.closest("section, article, .card, div")!;
      window.scrollTo({ top: card.getBoundingClientRect().top + window.scrollY - 110, behavior: "instant" });
    });
    await page.locator(".ag-root").first().waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(2500);
    await endOnRow(page, ".ag-row");
    await shoot(page, "6-under-the-hood");
  }
  // 7. Proof: scam notes that reached the cart, code alone and with the AI reader on.
  {
    const page = await open("#/proof", "proof");
    await page.getByText("21 of 59").first().waitFor({ state: "visible", timeout: 15000 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(800);
    await shoot(page, "7-proof");
  }
} finally {
  await browser.close();
}

if (problems.length) {
  console.error(`gallery-shots FAIL\n${problems.map((p) => `  ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`gallery-shots ok: ${wrote.length} frames at ${OUT_W}x${OUT_H}`);

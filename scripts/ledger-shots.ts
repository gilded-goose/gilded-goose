// Behind the scenes (`?desk=ledger`), captured for Joshua and the visual review: desktop 1440×900 and phone 390×844,
// against a PAYMENT=fake server, with a screen recording (webm) of the ledger tab. Every row on screen is the server's:
// the session is made the real way, in the same browser and session cookie: the kettle run (the classic page's own call), with
// its skipped seller and its deal, Approve, the practice PayPal tap; then PayPal's webhook for that capture, signed by
// the fake port's test-only route, so a signed row exists. Frames: the fresh session (empty state over the seeded demo
// week), rows streaming in with the gold flash, the session done, the sheet on a skipped seller and on PayPal's signed
// row, the PayPal chip with its rows in view, the week's story and the session's charts (Desk-B-5), then Proof reached
// by its one tap in the lede: its first screen, the whole page, the blind test's dots and the sandbox runs. It fails on a
// page error, an AG Grid or AG Charts warning, or sideways scroll.
//
//   node scripts/ledger-shots.ts [url] [out-dir]   defaults http://localhost:8787/ and .screens/ledger

import { localOnly } from "./not-live.ts";
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";

const base = localOnly((process.argv[2] ?? "http://localhost:8787/").replace(/\/?$/, "/"));
const out = process.argv[3] ?? ".screens/ledger";
mkdirSync(out, { recursive: true });
const errors: string[] = [];
const browser = await chromium.launch();

const sizes = [
  { name: "desktop", viewport: { width: 1440, height: 900 }, mobile: false },
  { name: "phone", viewport: { width: 390, height: 844 }, mobile: true },
] as const;

const rows = (p: Page) => p.locator(".lx-sl").getAttribute("data-rows").then(Number);
const shot = async (p: Page, name: string, full = false) => { await p.screenshot({ path: join(out, `${name}.png`), fullPage: full }); console.log(`  ${name}.png`); };
/** Scroll so `sel` sits just under the top of the frame. */
const top = (p: Page, sel: string) => p.evaluate((q) => { const el = document.querySelector(q); if (el) scrollTo({ top: el.getBoundingClientRect().top + scrollY - 16, behavior: "instant" }); }, sel).then(() => p.waitForTimeout(250));
const wide = async (p: Page, where: string) => { if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) errors.push(`${where}: the page scrolls sideways`); };

/** PayPal's webhook for the run's capture, signed by the fake port (test-only route), posted as PayPal would. */
async function webhook(ctx: BrowserContext, runId: string) {
  const v = await (await ctx.request.get(`${base}api/runs/${runId}`)).json() as { bound?: { orderId?: string; hash?: string; total?: string }; settled?: { captureId?: string }; cart?: { total?: string } };
  const order = v.bound?.orderId;
  if (!order) { errors.push(`run ${runId} has no bound order: ${JSON.stringify(v).slice(0, 200)}`); return; }
  const body = JSON.stringify({ id: `WH-${Date.now()}`, event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: v.settled?.captureId ?? `CAP-${order}`, custom_id: v.bound?.hash, amount: { value: v.bound?.total ?? v.cart?.total ?? "84.00", currency_code: "USD" }, supplementary_data: { related_ids: { order_id: order } } } });
  const h = await (await fetch(`${base}api/fake-paypal/webhook-sign`, { method: "POST", body })).json() as Record<string, string>;
  const r = await fetch(`${base}api/paypal/webhook`, { method: "POST", body, headers: { "content-type": "application/json", "paypal-transmission-id": h.transmissionId!, "paypal-transmission-time": h.transmissionTime!, "paypal-transmission-sig": h.transmissionSig!, "paypal-cert-url": h.certUrl!, "paypal-auth-algo": h.authAlgo! } });
  if (!r.ok) errors.push(`webhook: ${r.status} ${await r.text()}`);
}

for (const s of sizes) {
  console.log(s.name);
  const video = join(out, `video-${s.name}`);
  const ctx = await browser.newContext({ viewport: s.viewport, ...(s.mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}), recordVideo: { dir: video, size: s.viewport } });
  const ledger = await ctx.newPage();
  ledger.on("pageerror", (e) => errors.push(`${s.name} ledger: ${e.message}`));
  // A missing AG Grid or AG Charts module only warns in the console, so a warning from either fails the run too. The
  // fresh session's 404 ("Nothing here yet") is the server's own answer, expected before the first run.
  ledger.on("console", (m) => { if ((m.type() === "error" && !/status of 404/.test(m.text())) || (m.type() === "warning" && /AG (Grid|Charts)/i.test(m.text()))) errors.push(`${s.name} console: ${m.text().slice(0, 200)}`); });
  await ledger.goto(`${base}?desk=ledger`);
  await ledger.waitForFunction(() => Number(document.querySelector(".lx-sl")?.getAttribute("data-week-rows")) > 2, null, { timeout: 20_000 });
  await ledger.waitForTimeout(900);
  await shot(ledger, `${s.name}-01-fresh-session`);
  await wide(ledger, `${s.name} fresh`);

  // First the kettle run (the classic page's own call, same cookie): sellers checked, the Watcher skips one, a deal.
  // Its rows stream into the ledger in front, so the frame catches a row's gold flash.
  const kettle = await ctx.request.post(`${base}api/runs`, { data: { seed: 2 } });
  if (!kettle.ok()) errors.push(`kettle run: ${kettle.status()} ${await kettle.text()}`);
  const runId = ((await kettle.json().catch(() => ({}))) as { runId?: string }).runId ?? "";
  await ledger.waitForFunction(() => Number(document.querySelector(".lx-sl")?.getAttribute("data-rows")) >= 4, null, { timeout: 30_000 });
  await ledger.waitForTimeout(350);
  await shot(ledger, `${s.name}-02-streaming-flash`);
  await ledger.waitForFunction(() => document.querySelector(".lx-sl .sl-skipped:not(.lx-card-week):not(.lx-week)") !== null, null, { timeout: 60_000 }).catch(() => errors.push(`${s.name}: the kettle run showed no skipped seller`));

  // The deal, approved as the page's Approve does it, then the practice PayPal tap (the fake port's approve page, which
  // sends the browser back through PayPal's return, where the guard captures).
  for (let i = 0; i < 120; i++) {
    const v = await (await ctx.request.get(`${base}api/runs/${runId}`)).json() as { bound?: unknown };
    if (v.bound) break;
    await ledger.waitForTimeout(500);
  }
  const ok = await ctx.request.post(`${base}api/runs/${runId}/approve`, { data: {} });
  const { approveUrl } = await ok.json() as { approveUrl?: string };
  if (!approveUrl) errors.push(`approve: ${ok.status()}`);
  else {
    const tap = await ctx.newPage();
    await tap.goto(new URL(approveUrl, base).href);
    await tap.close();
  }
  await ledger.bringToFront();
  await ledger.waitForTimeout(1200);
  // Desk-B-5: the rows themselves in view (not the page's top again), so PayPal's signed row is seen arriving.
  await top(ledger, s.mobile ? ".lx-cards" : ".lx-grid");
  await webhook(ctx, runId);
  await ledger.waitForTimeout(400);
  await shot(ledger, `${s.name}-03-paypal-arrives`);
  await ledger.evaluate(() => scrollTo(0, 0));
  await ledger.waitForTimeout(2600);
  await shot(ledger, `${s.name}-04-session`);
  await wide(ledger, `${s.name} session`);
  console.log(`  ${await rows(ledger)} session rows`);

  // The sheet: a skipped seller, then PayPal's signed row.
  await ledger.locator(".lx-sl .sl-skipped:not(.lx-week):not(.lx-card-week)").first().scrollIntoViewIfNeeded();
  await ledger.locator(".lx-sl .sl-skipped:not(.lx-week):not(.lx-card-week)").first().click();
  await ledger.waitForTimeout(600);
  await shot(ledger, `${s.name}-05-sheet-skipped`);
  await ledger.keyboard.press("Escape");
  await ledger.waitForTimeout(300);
  // The grid draws only the rows in view, so the PayPal chip brings PayPal's signed row into it (the cards hold every row).
  const chip = ledger.getByRole("button", { name: /^PayPal, \d+ rows?$/ }); // in the Filter menu (Track L: one filter row)
  const pick = async () => { await ledger.locator(".lx-filter-btn").click(); await chip.click(); await ledger.keyboard.press("Escape"); };
  if (!s.mobile) { await pick(); await ledger.waitForTimeout(400); }
  const signed = ledger.locator(s.mobile ? ".lx-card:has(.lx-pp)" : ".lx-grid .ag-row:not(.ag-row-pinned):has(.lx-pp)").first();
  if (await signed.count()) {
    await signed.scrollIntoViewIfNeeded();
    await signed.click();
    await ledger.waitForTimeout(600);
    await shot(ledger, `${s.name}-06-sheet-paypal`);
    await ledger.keyboard.press("Escape");
  } else errors.push(`${s.name}: no signed PayPal row on screen`);
  if (!s.mobile) await pick();

  // A chip: PayPal's rows only, with the chips at the top of the frame so the filtered rows fill it (Desk-B-5's audit:
  // the frame used to show the page's top and no rows).
  await ledger.evaluate(() => scrollTo(0, 0));
  await pick();
  await ledger.waitForTimeout(500);
  await top(ledger, ".lx-tools");
  const filtered = await ledger.locator(s.mobile ? ".lx-card" : ".lx-grid .ag-row:not(.ag-row-pinned)").count();
  if (!filtered) errors.push(`${s.name}: the PayPal chip left no rows on screen`);
  await shot(ledger, `${s.name}-07-chip-paypal`);
  await pick();
  await ledger.waitForTimeout(400);
  // The chip just turned off keeps its focus ring and the pointer's hover; blur it and move the pointer off, from the
  // page's top, so the frame shows no chip as picked.
  await ledger.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); scrollTo({ top: 0, behavior: "instant" }); });
  await ledger.mouse.move(1, 1);
  await ledger.waitForTimeout(300);
  await shot(ledger, `${s.name}-08-full`, true);

  // Desk-B-5: the week's story and the session's charts, each in its own frame once its lazy canvas has drawn.
  await top(ledger, ".lx-story");
  await ledger.waitForSelector(".lx-story canvas", { timeout: 20_000 });
  await ledger.waitForTimeout(700);
  await shot(ledger, `${s.name}-09-week-story`);
  await top(ledger, ".lx-charts");
  await ledger.waitForTimeout(500);
  await shot(ledger, `${s.name}-10-session-charts`);

  // Proof, one tap from here: the lede's "See the proof" (the one nav, S1, has no Proof view), on the same Midnight; then its blind test, its sandbox runs, and
  // the way back.
  await ledger.evaluate(() => scrollTo(0, 0));
  await ledger.locator(".lx-proof-link").click();
  await ledger.waitForSelector(".bd-dots", { timeout: 20_000 });
  await ledger.waitForTimeout(500);
  await shot(ledger, `${s.name}-proof-01-first`);
  await wide(ledger, `${s.name} proof`);
  await top(ledger, ".pf-group-blind");
  await shot(ledger, `${s.name}-proof-03-blind`);
  await top(ledger, ".pf-group-money");
  await shot(ledger, `${s.name}-proof-04-money`);
  await shot(ledger, `${s.name}-proof-02-full`, true);
  // SW: one nav layer; the way back is the bar's own "Behind the scenes" link, not a second link under it.
  if (!(await ledger.locator('a[href="?desk=ledger"]').count())) errors.push(`${s.name}: Proof has no way back`);
  const bg = await ledger.evaluate(() => [getComputedStyle(document.querySelector(".pf")!).backgroundColor, getComputedStyle(document.documentElement).getPropertyValue("--lx-page").trim()]);
  console.log(`  proof background ${bg[0]} (Midnight's --lx-page ${bg[1]})`);

  const v = ledger.video();
  await ctx.close();
  if (v) copyFileSync(await v.path(), join(out, `${s.name}-ledger.webm`));
}

await browser.close();
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`ledger-shots ok: frames and recordings in ${out}`);

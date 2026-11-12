// Joshua's AG Grid message (Nov 4), walked on forced Studio, Community side: the board's pivots, a try's sheet, live totals, both
// exports, a live row, and the ledger as the audit log (visits, Find, append-only).
//   node scripts/studio-audit-probe.ts <url>
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const BASE = (process.argv[2] ?? "").replace(/\/$/, "");
if (!BASE) { console.error("usage: node scripts/studio-audit-probe.ts <url>"); process.exit(2); }
const ADDRESS = "/?desk=studio&studio=force";
let bad = 0;
const check = (ok: boolean, what: string) => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${what}`); };
/** The note's words never reach a try's sheet or a download. A word from no closed list, planted in a mocked record. */
const PLANTED = "plantednoteword";

function readXlsx(file: string): { sheet: string; text: string } {
  const py = `import sys,zipfile,re\nz=zipfile.ZipFile(sys.argv[1]);w=z.read('xl/workbook.xml').decode();s=z.read('xl/worksheets/sheet1.xml').decode();print(re.search(r'sheet name="([^"]+)"',w).group(1));print(' '.join(re.findall(r'<t[^>]*>([^<]*)</t>',s)))`;
  const out = execFileSync("python3", ["-I", "-c", py, file], { encoding: "utf8" });
  const nl = out.indexOf("\n");
  return { sheet: out.slice(0, nl), text: out.slice(nl + 1) };
}

async function open(browser: Browser, width: number, height: number, mobile: boolean) {
  const ctx = await browser.newContext({ viewport: { width, height }, acceptDownloads: true, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => { const t = m.text(); if (m.type() === "error" && !/Failed to load resource|License|\*{20}|ag-grid\.com|info@ag-grid/i.test(t)) errors.push(t.slice(0, 240)); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 240)}`));
  await page.goto(BASE + ADDRESS, { waitUntil: "load", timeout: 120_000 });
  await page.waitForSelector('[data-studio-layer="shown"] .st-studio[data-ready="1"]', { timeout: 150_000, state: "attached" });
  await page.waitForTimeout(2000);
  // The walk reads the seeded week by name. A record holding a real try opens on that side, as it should, so say which.
  const seeded = page.locator("button", { hasText: /^Seeded demo week/ }).first();
  if (await seeded.count() > 0 && await seeded.getAttribute("aria-pressed") !== "true" && await seeded.getAttribute("aria-selected") !== "true") { await seeded.click(); await page.waitForTimeout(800); }
  return { ctx, page, errors };
}

async function pivots(page: Page, label: string) {
  const r = await page.evaluate(() => ({
    pivotHeads: [...document.querySelectorAll(".ag-studio-pivot-grid-widget .ag-header-cell-text")].map((e) => e.textContent ?? ""),
    exports: [...document.querySelectorAll(".ag-studio-pivot-grid-widget, .ag-studio-widget")].filter((w) => w.querySelector(".ag-studio-pivot-grid-widget") || w.matches(".ag-studio-pivot-grid-widget")).flatMap((w) => [...w.querySelectorAll<HTMLElement>(".ag-studio-widget-toolbar-button")]).filter((b) => b.offsetParent !== null).length,
  }));
  check(r.pivotHeads.length > 0 && !r.pivotHeads.some((h) => /^(sum|avg)\s*\(/i.test(h)), `${label}: pivot heads read clean (${[...new Set(r.pivotHeads)].slice(0, 4).join(", ")})`);
  check(r.exports === 0, `${label}: Studio's pivot export, which drops the numbers, isn't offered`);
}

async function tryAndExports(page: Page, label: string) {
  await page.evaluate(() => document.querySelector(".tb-tries")?.scrollIntoView());
  await page.waitForTimeout(2500);
  {
    const status = await page.locator(".tb-status").getAttribute("data-status");
    check(!!status && /^\d+\/\d+\/\d+\/\d+\/\d+\/\d+$/.test(status), `${label}: the totals line reads (${status})`);
  }
  // Exports carry their side, in the name and on the sheet.
  const dir = mkdtempSync(join(tmpdir(), "goose-audit-"));
  try {
    const [xlsx] = await Promise.all([page.waitForEvent("download"), page.locator("[data-xlsx]").first().click()]);
    const file = join(dir, xlsx.suggestedFilename());
    await xlsx.saveAs(file);
    const book = readXlsx(file);
    check(/seeded-demo-week\.xlsx$/.test(xlsx.suggestedFilename()) && book.sheet === "Seeded demo week", `${label}: As Excel names its side (${xlsx.suggestedFilename()}, sheet "${book.sheet}")`);
    check(!book.text.includes(PLANTED) && book.text.length > 100, `${label}: the workbook opens, with rows and no note's words`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

async function trySheet(page: Page, label: string, row: string) {
  await page.locator(row).first().click();
  await page.waitForSelector("[data-try-sheet]", { timeout: 10_000 });
  const words = await page.locator("[data-try-sheet]").innerText();
  check(/The reason/.test(words) && /Which layer decided/.test(words) && /Which rule/.test(words), `${label}: a try opens its reason, its layer and its rule`);
  check(!words.includes(PLANTED), `${label}: and no note's words`);
  const rows = await page.locator("[data-try-ledger]").getAttribute("data-try-ledger");
  check(rows !== null, `${label}: its ledger rows are in the sheet (${rows})`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check(await page.locator("dialog[open]").count() === 0, `${label}: Escape closes it, inside Studio`);
}

async function ledger(page: Page, label: string, narrow: boolean) {
  await page.locator(".st-every").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(2000);
  const shown = await page.locator("[data-append-only]").innerText();
  check(/only added, never changed/i.test(shown), `${label}: append-only stays visible ("${shown.slice(0, 60)}…")`);
  if (narrow) return;
  const heads = ".st-visit";
  const names = await page.locator(heads).allInnerTexts();
  check(names.some((n) => /recorded demo week/i.test(n)) && names.some((n) => /seeded row/i.test(n)), `${label}: rows are grouped by visit, the seed and the demo week labeled (${names.map((n) => n.replace(/\s+/g, " ")).join(" | ")})`);
  await page.locator(".st-find select").selectOption({ index: 1 });
  await page.waitForTimeout(600);
  const found = await page.locator(".st-every").first().innerText();
  check(/\d+ of \d+ rows/.test(found), `${label}: Find by rule says how many of how many (${/\d+ of \d+ rows/.exec(found)?.[0]})`);
  await page.locator(".st-find select").selectOption({ index: 0 });
  await page.waitForTimeout(400);
}

/** A try lands while the board is open, on a mocked record: it arrives by one transaction, the totals move, nothing is redrawn. Under closed groups too. */
async function liveRow(browser: Browser) {
  const label = "1440 live";
  const NOW = Date.now();
  const row = (ago: number, i: number) => ({ at: NOW - ago * 60_000, verdict: i % 2 ? "held" : "set-aside", rule: i % 2 ? "no-history" : "gift-card", type: i % 2 ? "fake-urgency" : "gift-card", source: "person" });
  const body = (rows: ReturnType<typeof row>[]) => JSON.stringify({ counts: { tried: rows.length, setAside: rows.filter((r) => r.verdict === "set-aside").length, paid: 0, byPerson: rows.length, byAi: 0 }, attempts: rows, cut: false });
  let rows = [row(40, 0), row(30, 1), row(20, 2), row(10, 3)];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  const chartWarnings: string[] = [];
  page.on("console", (m) => { const t = m.text(); if (/^AG Charts - /.test(t)) chartWarnings.push(t.slice(0, 160)); if (m.type() === "error" && !/Failed to load resource|License|\*{20}|ag-grid\.com|info@ag-grid/i.test(t)) errors.push(t.slice(0, 240)); });
  await page.route("**/api/challenge", (r) => r.fulfill({ status: 200, contentType: "application/json", body: body(rows) }));
  await page.goto(BASE + ADDRESS, { waitUntil: "load", timeout: 120_000 });
  await page.waitForSelector('[data-studio-layer="shown"] .st-studio[data-ready="1"]', { timeout: 150_000, state: "attached" });
  await page.evaluate(() => document.querySelector(".tb-tries")?.scrollIntoView());
  await page.waitForSelector(".tb-tries .ag-root-wrapper", { timeout: 30_000 });
  await page.waitForTimeout(1500);
  const read = () => page.evaluate(() => ({ arrivals: document.querySelector(".tb-tries [data-arrivals]")?.getAttribute("data-arrivals") ?? "0", totals: document.querySelector(".tb-status")?.textContent ?? "", rows: [...document.querySelectorAll(".tb-tries .ag-row")].length }));
  const before = await read();
  check(/^4 tries/.test(before.totals), `${label}: the mocked record reads (${before.totals})`);
  rows = [row(0, 4), ...rows];
  await page.waitForFunction(() => document.querySelector(".tb-tries [data-arrivals]")?.getAttribute("data-arrivals") === "1", undefined, { timeout: 16_000 }).catch(() => {});
  await page.waitForTimeout(300);
  const after = await read();
  check(after.arrivals === "1", `${label}: a new try came in by one transaction (arrivals ${after.arrivals})`);
  check(/^5 tries/.test(after.totals), `${label}: the totals moved as it landed (${after.totals})`);
  const seeIt = page.locator("button", { hasText: /^See it/ });
  if (await seeIt.count() > 0) {
    await seeIt.first().click();
    await page.waitForTimeout(800);
    const leaf = await page.evaluate(() => document.querySelectorAll(".tb-tries .ag-row:not(.ag-row-group):not(.ag-row-pinned)").length);
    check(leaf > 0, `${label}: "See it" opens the groups down to the row (${leaf} tries on screen)`);
  }
  check(errors.length === 0, `${label}: zero console errors${errors[0] ? `: ${errors.join(" | ")}` : ""}`);
// AG's auto height keeps 150 px however few the rows; the board gives that back, and takes it again for its no-match overlay.
  const gap = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll<HTMLElement>(".tb-grid .ag-grid-scrolling-rows.ag-layout-auto-height")].map((g) => { const r = [...g.querySelectorAll<HTMLElement>(".ag-row")].map((x) => x.getBoundingClientRect().bottom); return r.length ? g.getBoundingClientRect().bottom - Math.max(...r) : 0; })));
  check(gap <= 4, `${label}: a table of few rows has no blank band under them (${Math.round(gap)} px)`);
  {
    const find = page.locator(".tb-tries .tb-find input").first();
    if (await find.count()) {
      await find.fill("zzzzzz");
      await page.waitForTimeout(500);
      const over = await page.evaluate(() => { const o = document.querySelector(".tb-tries .ag-overlay-no-matching-rows-center"), w = document.querySelector(".tb-tries .ag-root-wrapper"); if (!o || !w) return null; const a = o.getBoundingClientRect(), b = w.getBoundingClientRect(); return { h: a.height, inside: a.top >= b.top - 1 && a.bottom <= b.bottom + 1 }; });
      check(!!over && over.h > 0 && over.inside, `${label}: a filter that empties the table still has room for its overlay (${JSON.stringify(over)})`);
      await find.fill("");
    }
  }
    check(chartWarnings.length === 0, `${label}: a new try makes AG Charts warn about nothing (${chartWarnings.length}: ${chartWarnings[0] ?? ""})`);
  await ctx.close();
}

const browser = await chromium.launch();
await liveRow(browser);

{
  const { ctx, page, errors } = await open(browser, 1440, 1000, false);
  const label = "1440";
  await pivots(page, label);
  await tryAndExports(page, label);
  await ledger(page, label, false);
  check(errors.length === 0, `${label}: zero console errors${errors[0] ? `: ${errors.join(" | ")}` : ""}`);
  await ctx.close();
}

{
  const { ctx, page, errors } = await open(browser, 390, 844, true);
  const label = "390";
  await tryAndExports(page, label);
  const grids = await page.locator(".tb-tries .ag-root-wrapper").count();
  check(grids === 0, `${label}: the phone reads lists, no grid in the board's tries`);
  await trySheet(page, label, ".tb-try-open");
  await ledger(page, label, true);
  check(errors.length === 0, `${label}: zero console errors${errors[0] ? `: ${errors.join(" | ")}` : ""}`);
  await ctx.close();
}

await browser.close();
console.log(bad ? `\nstudio-audit-probe: ${bad} failed` : "\nstudio-audit-probe: all ok");
process.exit(bad ? 1 : 0);

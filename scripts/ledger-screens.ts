/// <reference lib="dom" />
// Screenshots of "Every decision", the AG Grid ledger (Track C, docs/guild/022-ag-grid-ledger.md), at 1440 and 390 px,
// into docs/screens/ledger-*.png, for guild-visual and the film. Re-runnable from the repo root:
//   node scripts/ledger-screens.ts            (builds web/, serves dist on :4179, no server: the bundled recorded week 1)
//   node scripts/ledger-screens.ts <url>      (an already-running page; /api is still blocked so the run is week 1)
// Fails if: rows don't stream in (the grid must hold fewer rows mid-run than at the end); the grid's rows aren't the
// fold's rows (the count line, one AG row per folded row); the Watcher's refusal isn't the one red row; a row click
// doesn't land the moment on that row (panel, lanes: no mark drawn after it); a chip or search shows a row it shouldn't;
// a phone fetches the AG Grid chunk or scrolls sideways; a picked row leaves the cart card or any Approve reachable; any AG Grid error or Enterprise/licence text appears.

import { chromium, type Page } from "playwright";
import { spawn, execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { overflow } from "./overflow.ts";

const OUT = "docs/screens";
const PORT = 4179;
function fail(m: string): never { console.error(`LEDGER FAIL: ${m}`); process.exit(1); }
const ok = (m: string) => console.log(`ok  ${m}`);

let url = process.argv[2];
let server: ReturnType<typeof spawn> | null = null;
if (!url) {
  execSync("corepack pnpm --filter @goose/web build", { stdio: "ignore" });
  server = spawn("corepack", ["pnpm", "exec", "vite", "preview", "--port", String(PORT), "--strictPort"], { cwd: "web", stdio: "ignore" });
  url = `http://localhost:${PORT}/`;
  for (let i = 0; ; i++) { try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ } if (i > 50) fail("vite preview never answered"); await new Promise((r) => setTimeout(r, 200)); }
}
url = url.replace(/\/?$/, "/");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errors: string[] = [];
async function open(width: number, height: number, scheme: "light" | "dark" = "light") {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: scheme, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  // No live server: the page plays the bundled recorded week in the browser, the same every run.
  await page.route("**/api/**", (r) => r.abort());
  const grid: string[] = [];
  page.on("request", (r) => { if (/LedgerGrid/.test(r.url())) grid.push(r.url()); });
  page.on("console", (m) => { if (m.type() === "error" || /AG Grid|ag-grid|licen[cs]e|enterprise/i.test(m.text())) errors.push(`${width}px: ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`${width}px: ${e.message}`));
  return { ctx, page, grid };
}
/** The grid's rendered rows, one per row id (AG Grid may split a row across pinned and centre containers). */
const agRowIds = (page: Page) => page.evaluate(() => [...new Set([...document.querySelectorAll(".lg-grid .ag-row[row-id]")].map((r) => r.getAttribute("row-id")))]);
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/ledger-${name}.png` });
// The count line (Ledger.tsx): "N decisions", "N decisions in R rows (K repeats folded)" or "x of N decisions, in R rows".
// Full screen on a wide page keeps the chips in a "Filter" menu: open it, click the chip, close it again (Escape).
const chip = async (page: Page, name: RegExp) => {
  // Set open (a summary click toggles, so it would shut a menu already open).
  const menu = await page.evaluate(() => { const d = document.querySelector<HTMLDetailsElement>(".spine .lg-more"); if (d) d.open = true; return !!d; });
  await page.locator(".spine").getByRole("button", { name }).click();
  if (menu) await page.keyboard.press("Escape");
};
const rowCount = async (page: Page) => Number(/in (\d+) rows|^(\d+) decisions$/.exec((await page.locator(".lg-count").first().textContent())?.trim() ?? "")?.slice(1).find(Boolean) ?? NaN);

/** The rows that must be read whole (the scam offer, the refusal, the picked row): no clamp "…", nothing past the cell's edges. */
async function whole(page: Page, where: string, min = 2) {
  const r = await page.evaluate(() => [...document.querySelectorAll(".lg-grid .ag-row .lg-why.long, .lg-grid .ag-row-selected .lg-why")].map((e) => {
    const c = e.closest(".ag-cell")!.getBoundingClientRect(), w = e.getBoundingClientRect();
    return { seq: e.closest(".ag-row")!.getAttribute("row-id"), cut: e.scrollHeight > e.clientHeight + 1 || w.top < c.top - 1 || w.bottom > c.bottom + 1 };
  }));
  const cut = r.filter((x) => x.cut).map((x) => x.seq);
  if (r.length < min || cut.length) fail(`${where}: rows ${cut.join(", ")} have their words cut off (of ${r.length} that must be whole)`);
  return r.length;
}

/**
 * approve_never_reachable_from_a_past_moment (Joshua, Wed Oct 28): while a row is picked, no cart card and nothing named
 * Approve is on the page, and "Back to now" is on screen; pressing it brings the cart card back (the control).
 */
async function pastHidesCart(page: Page, where: string) {
  if (await page.locator('.rcard:not([data-outcome="past"])').count()) fail(`${where}: the cart card shows beside a past moment`);
  if (await page.getByRole("button", { name: /approve/i }).or(page.getByRole("link", { name: /approve/i })).count()) fail(`${where}: Approve is reachable from a past moment`);
  await page.locator('.rcard[data-outcome="past"]').waitFor();
  const back = page.locator("#moment").getByRole("button", { name: "Back to now" });
  await back.scrollIntoViewIfNeeded();
  if (!(await back.isVisible())) fail(`${where}: "Back to now" isn't visible while the cart card is hidden`);
}
async function nowShowsCart(page: Page, where: string) {
  await page.locator('.rcard[data-outcome="past"]').getByRole("button", { name: "Back to now" }).click();
  await page.locator('.rcard:not([data-outcome="past"])').waitFor();
  if (await page.locator("#moment .lg-moment-line").count()) fail(`${where}: "Back to now" left the moment line up`);
  await page.locator('.rcard:not([data-outcome="past"])').scrollIntoViewIfNeeded();
  await shot(page, `${where === "phone" ? "phone" : "desktop"}-now-cart`);
}

/** Every lane mark on the page names a row at or before the moment (nothing after the picked row is drawn). */
async function drawnUpTo(page: Page, at: number, where: string) {
  const seqs = await page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => Number(e.getAttribute("data-seq"))), where);
  if (seqs.length === 0) fail(`${where}: nothing drawn at row ${at}`);
  const late = seqs.filter((s) => s > at);
  if (late.length) fail(`${where}: rows ${late.join(", ")} drawn at the moment of row ${at}`);
}

// ---------- desktop 1440, full screen: the film's take ----------
for (const scheme of ["light", "dark"] as const) {
  const { ctx, page, grid } = await open(1440, 900, scheme);
  await page.goto(url + "?seed=1&ledger=full");
  await page.locator(".spine").waitFor();
  if ((await page.evaluate(() => document.activeElement?.id)) !== "spine-title") fail("full screen opened without focus on its title");
  await page.locator(".spine").getByRole("button", { name: "Go find it" }).click();
  // Streamed: mid-run the grid holds some rows, then more.
  await page.locator(".lg-grid .ag-row").first().waitFor({ timeout: 15_000 });
  const early = await page.locator(".lg-grid .ag-row").count();
  await page.locator(".spine").getByRole("button", { name: "Go find it" }).waitFor({ timeout: 90_000 });
  await page.waitForTimeout(400);
  const rows = await rowCount(page);
  const agRows = (await agRowIds(page)).length;
  if (agRows !== rows) fail(`${agRows} AG rows in the page for ${rows} rows`);
  if (!(early < rows)) fail(`rows didn't stream in: ${early} at first, ${rows} at the end`);
  if (scheme === "light") ok(`rows streamed in: ${early} when the grid first drew, ${rows} at the end`);
  if (grid.length === 0) fail("the AG Grid chunk never loaded on desktop");
  // The fold's rows (week 1: 21 decisions, 3 repeats folded; core/test/grid.test.ts proves the mapping).
  const head = (await page.locator(".spine-head h2").textContent()) ?? "";
  const line = (await page.locator(".lg-count").first().textContent()) ?? "";
  const d = /(\d+) decisions/.exec(head);
  const f = /^\d+ decisions in (\d+) rows \((\d+) repeats folded\)/.exec(line);
  if (!d || !f || Number(f[1]) !== rows || Number(d[1]) - Number(f[2]) !== rows) fail(`the header and the grid disagree: "${head}" / "${line}", ${rows} rows`);
  const m = [`${d[1]} decisions; ${line}`];
  const red = page.locator(".lg-grid .ag-row.lg-refused");
  if ((await red.count()) !== 1) fail(`${await red.count()} red rows, want the Watcher's one`);
  if (!/Watcher → QuickQuack Deals/.test((await red.textContent()) ?? "")) fail("the red row isn't the Watcher's refusal of QuickQuack Deals");
  if (!/instructs-agent.*gift-card/.test((await red.textContent()) ?? "")) fail("the red row doesn't show its rule");
  // The attack is the shot: the scam offer's and the refusal's words are whole in the grid, never cut by the clamp.
  const long = await whole(page, "full screen");
  if (!/also rows \d/.test((await page.locator(".lg-grid .ag-row.lg-scam").first().textContent()) ?? "")) fail("the scam row doesn't say which repeats folded into it (a stale cell)");
  if (scheme === "light") ok(`grid = fold: ${agRows} AG rows rendered of ${rows}; "${m[0]}"; one red row, the Watcher's, with its rule; the scam's words whole in ${long} rows`);
  await shot(page, `desktop-full${scheme === "dark" ? "-dark" : ""}`);

  // Row click jumps to that moment.
  const seq = Number(await red.getAttribute("row-id"));
  await red.locator("[col-id=who]").click();
  await page.waitForTimeout(150);
  if (Number(await page.locator("[data-moment]").getAttribute("data-moment")) !== seq) fail(`clicked row ${seq}; the moment panel shows another`);
  if (!/refused/.test((await page.locator(".moment h3").textContent()) ?? "")) fail("the refusal's moment doesn't say refused");
  await drawnUpTo(page, seq, ".moment [data-seq]");
  if (scheme === "light") ok(`row click: row ${seq} → the moment panel is row ${seq}, nothing after it drawn`);
  await shot(page, `desktop-moment${scheme === "dark" ? "-dark" : ""}`);
  if (scheme === "dark") { await ctx.close(); continue; }

  // Chips and search only hide rows.
  await chip(page, /^4 · Watcher/);
  await page.waitForTimeout(150);
  const watcher = (await agRowIds(page)).length;
  if (watcher !== 1) fail(`the Watcher chip shows ${watcher} rows, want 1`);
  await chip(page, /^4 · Watcher/);
  await page.getByPlaceholder(/^Search/).fill("SYSTEM");
  await page.waitForTimeout(150);
  const hits = await page.locator(".lg-grid .ag-row[row-id]").allTextContents();
  if (hits.length === 0 || hits.some((t) => !/QuickQuack/.test(t))) fail(`search "SYSTEM" showed ${hits.length} rows, not all QuickQuack's`);
  await whole(page, "search SYSTEM", 1);
  ok(`chips: Watcher shows 1 row; search "SYSTEM" shows ${hits.length} rows, all QuickQuack's, words whole`);
  await shot(page, "desktop-search");
  await page.getByPlaceholder(/^Search/).fill("");

  // Out of full screen: the inline ledger, and a row click moves the lanes above to that moment.
  const modal = await page.evaluate(() => ({
    inside: !!document.querySelector(".spine")?.contains(document.activeElement),
    focus: document.activeElement?.tagName ?? "",
    behind: [...document.body.children].filter((el) => !el.classList.contains("spine")).every((el) => (el as HTMLElement).inert),
  }));
  if (!modal.inside) fail(`full screen: focus is on a ${modal.focus} outside the dialog`);
  if (!modal.behind) fail("full screen: the page behind the dialog isn't inert (Tab would walk it)");
  await page.keyboard.press("Escape");
  await page.locator("details.ledger[open]").waitFor();
  const back = await page.evaluate(() => ({ focus: document.activeElement?.textContent ?? "", inert: [...document.body.children].some((el) => (el as HTMLElement).inert) }));
  if (!/Full screen/.test(back.focus) || back.inert) fail(`closing full screen: focus on "${back.focus}", page inert: ${back.inert}`);
  ok("full screen is a modal: page behind inert, Escape closes it, focus back on \"Full screen ›\"");
  const counter = page.locator('.lg-grid .ag-row:has-text("over-ask")');
  const cseq = Number(await counter.getAttribute("row-id"));
  await counter.locator("[col-id=who]").click();
  await page.locator("#moment .lg-moment-line").waitFor();
  await drawnUpTo(page, cseq, ".lanes [data-seq]");
  await page.waitForTimeout(150);
  const inl = await whole(page, "inline, row 15 picked");
  ok(`inline: row ${cseq} (code's over-ask counter) → the lanes show that moment, nothing after it; ${inl} rows whole, the picked one too`);
  await pastHidesCart(page, "desktop inline");
  await page.locator("#moment").scrollIntoViewIfNeeded();
  await shot(page, "desktop-inline-moment");
  await page.locator('.rcard[data-outcome="past"]').scrollIntoViewIfNeeded();
  await shot(page, "desktop-past-cart");
  await nowShowsCart(page, "desktop inline");
  ok("a picked row hides the cart card and every Approve; \"Back to now\" is on screen and brings the card back");
  await page.locator("details.ledger").scrollIntoViewIfNeeded();
  await shot(page, "desktop-inline");
  await ctx.close();
}

// ---------- phone 390: cards, never the grid ----------
{
  const { ctx, page, grid } = await open(390, 844);
  // `?ledger=open` (ADR 0007's flag) opens the ledger on a phone too; without it a phone starts closed.
  await page.goto(url + "?seed=1&ledger=open");
  await page.getByRole("button", { name: "Go find it" }).click();
  await page.getByText(/^Replay market #1$/).waitFor({ timeout: 90_000 });
  const det = page.locator("details.ledger");
  await det.waitFor();
  if (!(await det.evaluate((d) => (d as HTMLDetailsElement).open))) fail("phone: ?ledger=open left the ledger closed");
  const cards = await page.locator(".ltable tr[data-ledger-seq]").count();
  const rows = await rowCount(page);
  if (cards !== rows) fail(`phone: ${cards} cards for ${rows} rows`);
  if (grid.length) fail(`phone fetched the AG Grid chunk: ${grid[0]}`);
  if (await page.locator(".ag-root").count()) fail("phone drew the AG Grid");
  ok(`phone: ${cards} cards, one per row; the AG Grid chunk never fetched`);
  const off = await overflow(page);
  if (off.length) fail(`phone: ${off.join("; ")}`);
  await det.scrollIntoViewIfNeeded();
  await shot(page, "phone-cards");
  const redCard = page.locator(".ltable tr.refused");
  const seq = Number(await redCard.getAttribute("data-ledger-seq"));
  await redCard.locator(".lg-pick").click();
  await page.locator("#moment .lg-moment-line").waitFor();
  await drawnUpTo(page, seq, ".lanes [data-seq]");
  ok(`phone: tapping row ${seq} (the refusal) → the lanes show that moment`);
  await page.waitForTimeout(400);
  await page.locator("#moment").evaluate((e) => e.scrollIntoView({ block: "start" }));
  await shot(page, "phone-moment");
  await pastHidesCart(page, "phone");
  await page.locator('.rcard[data-outcome="past"]').evaluate((e) => e.scrollIntoView({ block: "center" }));
  await shot(page, "phone-past-cart");
  await nowShowsCart(page, "phone");
  ok("phone: a picked card hides the cart card and every Approve; \"Back to now\" brings it back");
  await page.goto(url + "?seed=1&ledger=full");
  await page.locator(".spine").getByRole("button", { name: "Go find it" }).click();
  await page.locator(".spine").getByRole("button", { name: "Go find it" }).waitFor({ timeout: 90_000 });
  if (grid.length) fail("phone full screen fetched the AG Grid chunk");
  // Nothing in the spine is drawn over its header, and nothing is cut off inside its body.
  // (Measured on the body's children: a column-reverse box spills them upward, and that overflow is in no scrollHeight.)
  const lay = await page.evaluate(() => {
    const h = document.querySelector(".spine-head")!.getBoundingClientRect(), b = document.querySelector(".spine-body")!;
    const kids = [...b.children].map((k) => k.getBoundingClientRect());
    return { gap: Math.min(...kids.map((k) => k.top)) - h.bottom, hidden: Math.max(...kids.map((k) => k.bottom)) - b.getBoundingClientRect().bottom };
  });
  if (lay.gap < 0 || lay.hidden > 1) fail(`phone full screen: the body overlaps the header by ${-lay.gap}px or spills ${lay.hidden}px past its end`);
  ok("phone full screen: header clear, body whole, the grid never fetched");
  await shot(page, "phone-full");
  await ctx.close();
}

await browser.close();
server?.kill();
const bad = errors.filter((e) => !/net::ERR_FAILED|Failed to load resource/.test(e));
if (bad.length) fail(`console: ${bad.slice(0, 3).join(" | ")}`);
console.log(`LEDGER SCREENS PASS: ${OUT}/ledger-*.png (no AG Grid or licence messages in the console)`);

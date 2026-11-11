/// <reference lib="dom" />
// Track SW (07x): the surface words of the routes nobody owned, measured against Track C's reconciled budgets
// (docs/launch/surface-words.md, "Reconciled with the DD's budgets": the DD's measure, the bar, menu, rail, tour strip
// and footer not counted, and at each width the lower budget wins). It counts the words a visitor can see on the first
// screen (rendered text only: nothing screen-reader-only, nothing in a closed <details>, nothing under the pinned bar),
// at 1440×900 and 390×844 (DPR 1, dark, reduced motion so each state is its finished frame), writes DPR-1 stills, and,
// with --assert, fails on any route over its budget and on the words the brief retired.
// usage (server on 4185 serving web/dist): node scripts/sw-words.ts http://localhost:4185/ <out-dir> <tag> [--assert]
import { chromium, devices, type Page } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [base = "http://localhost:4185/", out = "sw-shots", tag = "now"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const strict = process.argv.includes("--assert");
mkdirSync(out, { recursive: true });
let failed = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failed++; };

/** surface-words.md's reconciled budgets, first screen, 1440 / 390. */
export const SW_BUDGET = {
  // brand.md §10.3 (gate ruling, Oct 31 05:49): a route's budget counts its first section, the block above its first
  // section hairline. On the bench that is the title block; the bench itself (.lab, under its hairline) is its own
  // section and keeps the route's old numbers as its own budget, so no word on the first screen goes unbudgeted.
  classic: { path: "?wallet=0", ready: ".run, .judge, main", scope: ".page > .brand", 1440: 98, 390: 59 },
  "classic-bench": { path: "?wallet=0", ready: ".run, .judge, main", scope: ".cv .lab", 1440: 98, 390: 59 },
  market: { path: "?market=1", ready: "main", 1440: 43, 390: 43 },
  haggle: { path: "?desk=haggle", ready: ".hg-round, main", 1440: 120, 390: 79 },
  // Proof is budgeted by section (the DD, SW 2): its first section, the title and the band, at natural height; the blind
  // test's head below it counts against its own section, so only the words inside `scope` count against this budget.
  proof: { path: "?desk=proof", ready: "main", scope: ".pf-top", 1440: 98, 390: 69 },
} as const;

/** Words a route must not show any more (the brief and surface-words.md retired them). */
const RETIRED: Record<string, RegExp[]> = {
  classic: [/This is the practice bench/, /No one has tried to break it here yet/, /Try to get it to overpay/],
  market: [/simulated sellers, fictional products/],
  haggle: [/Every number here is a row in the run's ledger/],
  proof: [/quoted in full under Sources below/],
};

/** The words drawn on the first screen: each text node whose box is drawn, visible, not clipped to 1 px, between the
 *  pinned bar and the phone's bottom rail; the bar, menu, rail, tour strip and footer not counted (brand.md §10.3). */
const words = (page: Page, scope = "") => page.evaluate((scope) => {
  const pinned = (e: Element | null) => !!e && /sticky|fixed/.test(getComputedStyle(e).position) && e.getBoundingClientRect().height > 0;
  const top = [...document.querySelectorAll(".gn")].find(pinned)?.getBoundingClientRect().bottom ?? 0;
  const bottom = [...document.querySelectorAll(".gn-rail")].find(pinned)?.getBoundingClientRect().top ?? innerHeight;
  const op = (e: Element | null) => { let o = 1; for (let n = e; n && n !== document.body; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };
  const shown = (e: Element | null): boolean => {
    for (let n = e; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n), r = n.getBoundingClientRect();
      if (s.display === "none" || s.visibility !== "visible") return false;
      if ((r.width <= 2 || r.height <= 2) && s.overflow !== "visible") return false;
      if (s.clipPath === "inset(50%)") return false;
    }
    return op(e) > 0.05;
  };
  const lines: string[] = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walk.nextNode(); t; t = walk.nextNode()) {
    const s = (t.textContent ?? "").trim();
    const el = t.parentElement;
    if (!s || !el || el.closest("script, style, noscript, #dk-case") || !shown(el)) continue;
    if (el.closest(".gn, .gn-rail, .gm-panel, .tp, footer, .gn-footer")) continue;
    if (scope && !el.closest(scope)) continue;
    const rg = document.createRange(); rg.selectNodeContents(t);
    if (![...rg.getClientRects()].some((q) => q.width > 1 && q.height > 1 && q.bottom > top + 1 && q.top < bottom - 1 && q.right > 0 && q.left < innerWidth)) continue;
    const det = el.closest("details");
    if (det && !det.open && !el.closest("summary")) continue;
    lines.push(s.replace(/\s+/g, " "));
  }
  const n = lines.join(" ").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return { n, lines, text: document.body.innerText };
}, scope);

const result: Record<string, unknown> = { tag, base };
const browser = await chromium.launch();
for (const size of ["1440", "390"] as const) {
  const phone = size === "390";
  const vp = phone ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  for (const [name, b] of Object.entries(SW_BUDGET)) {
    const ctx = await browser.newContext({ ...(phone ? devices["iPhone 13"] : {}), viewport: vp, deviceScaleFactor: 1, colorScheme: "dark", reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${base}${b.path}`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2500);
    const scope = "scope" in b ? b.scope : "";
    const w = await words(page, scope);
    const all = scope ? (await words(page)).n : w.n;
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await page.screenshot({ path: join(out, `${name}-first-${size}-${tag}.png`) });
    result[`${name}@${size}`] = { words: w.n, budget: b[size], scope: scope || null, screen: all, lines: w.lines, errors, overflow: over };
    console.log(`${name} ${size}: ${w.n} words${scope ? ` in ${scope} (${all} on the whole screen)` : ""} (budget ≤ ${b[size]})`);
    if (strict) {
      check(w.n <= b[size], `${size} ${name}: ${w.n} words on the first screen (budget ≤ ${b[size]}, surface-words.md reconciled)`);
      for (const re of RETIRED[name] ?? []) check(!re.test(w.text), `${size} ${name}: no ${re}`);
      check(errors.length === 0, `${size} ${name}: no console errors (${errors.slice(0, 2).map((e) => e.slice(0, 160)).join(" | ")})`);
      check(over <= 0, `${size} ${name}: no horizontal scroll (${over}px)`);
    }
    await ctx.close();
  }
}

// --states: the states the cuts moved one tap away, or that brand.md §10.9 designs, each driven and checked at 390.
if (process.argv.includes("--states")) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: "dark", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const snap = (n: string) => page.screenshot({ path: join(out, `state-${n}-390-${tag}.png`) });
  // The market, empty: a search with no listing says what is so and offers the one search that has one.
  await page.goto(`${base}?market=1`, { waitUntil: "networkidle" });
  await page.fill("#ssm-q", "teapot");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.locator(".ssm-empty").waitFor({ timeout: 10000 });
  check(/No listings match that\./.test(await page.locator(".ssm-empty").innerText()), "market empty: §10.9 head");
  await snap("market-empty");
  await page.getByRole("button", { name: "Search for “kettle”" }).click();
  await page.locator(".ssm-results").waitFor({ timeout: 10000 });
  check(true, "market empty: its action finds the kettle");
  // The market, offline: no button while there's no network, the step runs again by itself once it's back.
  await page.goto(`${base}?market=1`, { waitUntil: "networkidle" });
  await ctx.setOffline(true);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.locator(".ssm-state[role=alert]").waitFor({ timeout: 10000 });
  check(/You're offline\./.test(await page.locator(".ssm-state").innerText()), "market offline: says so, no button");
  await snap("market-offline");
  await ctx.setOffline(false);
  await page.locator(".ssm-results").waitFor({ timeout: 10000 }).then(() => check(true, "market offline: retried by itself when back"), () => check(false, "market offline: retried by itself when back"));
  // The haggle: a round opens to its asks, the sellers' quoted notes and code's reasons.
  await page.goto(`${base}?desk=haggle`, { waitUntil: "networkidle" });
  await page.locator(".hg-round summary").first().click();
  check(await page.locator(".hg-round details[open] .hg-note").first().isVisible(), "haggle: round 1 opens to the quoted notes");
  check(await page.locator(".hg-round details[open] .hg-aside .hg-reason").first().isVisible(), "haggle: the set-aside seller's reason is one tap away");
  await snap("haggle-round-open");
  // Proof: a figure's link opens the folded Sources and lands on its row.
  await page.goto(`${base}?desk=proof`, { waitUntil: "networkidle" });
  await page.locator(".pf-band-fig").first().click();
  await page.waitForTimeout(400);
  check(await page.locator("#pf-all").evaluate((d) => (d as HTMLDetailsElement).open), "proof: a figure opens All sources");
  check(await page.locator(".pf-rows > li:target").isVisible(), "proof: and shows its row");
  await snap("proof-source-row");
  await ctx.close();
}
await browser.close();
writeFileSync(join(out, `words-${tag}.json`), JSON.stringify(result, null, 2));
if (strict && failed) { console.log(`${failed} failed`); process.exit(1); }

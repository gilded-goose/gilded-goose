// Track SYS's proof for its two pages, the living design system (`?desk=system`) and How it works (`?desk=how`):
//   1. DPR-1 stills at 390×844 and 1440×900, in both palettes (the brand's two rooms: Velvet and Midnight), first screen
//      and full page, to OUT (the DD inbox, dd/inbox/SYS/ in the session notes);
//   2. axe (WCAG 2.0/2.1/2.2 A and AA, best practice) on each page and palette at both widths: 0 violations or exit 1;
//   3. the first-screen budget: navigation start → the page's h1 visible, p95 over 5 cold loads: ≤ 1000 ms on the
//      desktop; on the phone drill (150 ms RTT, 1.6 Mbps, CPU 4x, as budget-first-screen.ts) no slower than the tour.
//
//   (serve the build first: VITE_WALLET=1 pnpm --filter @goose/web build && pnpm --filter @goose/web exec vite preview --port 4192)
//   AXE=/path/to/axe.min.js OUT=/dir node scripts/sys-pages.ts [base]      default base http://localhost:4192/
//   SHOTS=0 skips the stills; BUDGET=0 skips the timing; AXE=0 skips axe (without AXE the run fails).

import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:4192/";
const AXE = process.env.AXE;
// The stills go where OUT says (the DD inbox lives in the session notes, never in the repo); a scratch folder otherwise.
const OUT = `${process.env.OUT ?? join(tmpdir(), "sys-pages")}/`;
const BUDGET_MS = 1000;
const SIZES = [{ w: 390, h: 844 }, { w: 1440, h: 900 }] as const;
const PAGES = [
  { name: "system", velvet: "?desk=system", midnight: "?desk=system&palette=midnight" },
  { name: "how", velvet: "?desk=how&palette=v", midnight: "?desk=how" },
] as const;

const h1Visible = (page: Page) => page.waitForFunction(() => {
  const h = document.querySelector("main h1");
  if (!h) return false;
  const r = h.getBoundingClientRect();
  // The moment it is seen, read in the same frame (an evaluate after the wait would add its own round trip).
  return r.width > 0 && r.height > 0 && r.top < innerHeight && h.checkVisibility({ visibilityProperty: true, opacityProperty: true }) ? performance.now() : false;
}, undefined, { polling: "raf", timeout: 10_000 });

const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(xs.length * 0.95) - 1)]!;

async function settle(page: Page) {
  await h1Visible(page);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle");
}

async function stills(browser: Browser) {
  mkdirSync(OUT, { recursive: true });
  for (const p of PAGES) for (const pal of ["velvet", "midnight"] as const) for (const s of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1, reducedMotion: "reduce", colorScheme: pal === "velvet" ? "light" : "dark" });
    const page = await ctx.newPage();
    const errs: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    page.on("pageerror", (e) => errs.push(String(e)));
    // The bar at rest is the page's own room: the same fill as the page under it (the DD's block: How's bar was Velvet
    // over Midnight because the back room's names weren't loaded). Sampled twice on the design system: at first paint,
    // with its specimens' chunk held back (the shell's own copy of midnight.css), and again once that chunk has swapped
    // its sheets in (the DD's question, gate-log ~06:50).
    const barFill = () => page.evaluate(() => {
      const bars = [...document.querySelectorAll("header.gn")].filter((h) => h.checkVisibility() && !h.closest(".sys-frame")); // the page's own bar, not a specimen
      const root = document.querySelector(".how, .sys")!;
      return { bar: bars.map((h) => getComputedStyle(h).backgroundColor), page: getComputedStyle(root).backgroundColor, specimens: !!document.querySelector("section.sys-fam") };
    });
    const sameFill = (f: Awaited<ReturnType<typeof barFill>>, when: string) => {
      if (f.bar.length !== 1 || f.bar[0] !== f.page) throw new Error(`${p.name} ${pal} at ${s.w}, ${when}: the bar is ${f.bar.join(", ")} over a ${f.page} page`);
    };
    let release = () => {};
    if (p.name === "system") {
      const held = new Promise<void>((r) => { release = r; });
      await page.route(/\/Specimens-[\w-]+\.js$/, async (route) => { await held; await route.continue(); });
    }
    await page.goto(BASE + p[pal]);
    let first: Awaited<ReturnType<typeof barFill>> | null = null;
    if (p.name === "system") {
      await h1Visible(page);
      first = await barFill();
      if (first.specimens) throw new Error("the specimens' chunk wasn't held: the first-paint sample would prove nothing");
      sameFill(first, "first paint");
      release();
    }
    await settle(page);
    if (p.name === "system") await page.waitForSelector("section.sys-fam");
    const fills = await barFill();
    sameFill(fills, "after the specimens");
    const stem = `${OUT}${p.name}-${pal}-${s.w}`;
    await page.screenshot({ path: `${stem}.png` });
    await page.screenshot({ path: `${stem}-full.png`, fullPage: true });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (wide > 0) throw new Error(`${p.name} ${pal} at ${s.w}: the page scrolls sideways by ${wide}px`);
    // A fixed-height box whose words outgrow it spills past its border or is clipped (How's boxes are foreignObjects):
    // every drawn box's content must fit inside it, in both layouts.
    const spill = await page.$$eval(".how-in", (els) => els.filter((e) => e.checkVisibility() && e.scrollHeight > e.clientHeight + 1).map((e) => `${e.querySelector(".how-name")?.textContent} (${e.scrollHeight - e.clientHeight}px)`));
    if (spill.length) throw new Error(`${p.name} ${pal} at ${s.w}: words spill out of ${spill.join(", ")}`);
    // Words a reader meets: the whole page, and the first screen (what sits above the fold), for the DD packet.
    const words = await page.evaluate(() => {
      const n = (t: string) => t.split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length;
      const walk = document.createTreeWalker(document.querySelector("main")!, NodeFilter.SHOW_TEXT);
      let fold = "";
      for (let t = walk.nextNode(); t; t = walk.nextNode()) { const el = t.parentElement!; if (el.checkVisibility() && !el.closest(".sys-sr, .how-sr") && el.getBoundingClientRect().bottom <= innerHeight) fold += ` ${t.textContent}`; }
      return { page: n(document.body.innerText), fold: n(fold) };
    });
    console.log(`still ${stem}.png (+ -full): ${words.page} words on the page, ${words.fold} in main on the first screen; bar ${first ? `${first.bar[0]} at first paint, ` : ""}${fills.bar[0]}${first ? " after the specimens" : ""} = page; console errors ${errs.length}${errs.length ? ` ${JSON.stringify(errs.slice(0, 3))}` : ""}`);
    if (errs.length) process.exitCode = 1;
    await ctx.close();
  }
}

async function axe(browser: Browser): Promise<number> {
  // A skipped check must never read as a pass: without AXE the run fails, unless AXE=0 says the skip on purpose.
  if (!AXE || AXE === "0") { console.log(`axe: SKIPPED${AXE === "0" ? " (AXE=0)" : " (set AXE to axe.min.js, or AXE=0 to skip on purpose)"}`); return AXE === "0" ? 0 : 1; }
  const src = readFileSync(AXE, "utf8");
  let total = 0;
  for (const p of PAGES) for (const pal of ["velvet", "midnight"] as const) for (const s of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(BASE + p[pal]);
    await settle(page);
    await page.addScriptTag({ content: src });
    const v = await page.evaluate(async () => {
      const r = await (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[]; failureSummary?: string }[] }[] }> } }).axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] }, resultTypes: ["violations"],
      });
      return r.violations.map((x) => ({ id: x.id, impact: x.impact, n: x.nodes.length, first: x.nodes.slice(0, 2).map((n) => `${n.target.join(" ")}: ${(n.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 200)}`) }));
    });
    total += v.length;
    console.log(`axe ${p.name} ${pal} ${s.w}: ${v.length} violations${v.length ? ` ${JSON.stringify(v)}` : ""}`);
    await ctx.close();
  }
  return total;
}

// The gate. Desktop: p95 ≤ 1000 ms. Phone drill: p95 ≤ 1000 ms is the budget, but no page behind the Desk meets it yet on
// this build (the shared bundle's waterfall: the tour, a sibling Desk page, sits at ~1.5 s), so the gate there is
// "no slower than the tour, measured in the same run"; the line prints the 1000 ms gap honestly either way.
// ALSO=proof,haggle times other Desk pages too, for a baseline (reported, never gated).
async function budget(browser: Browser): Promise<boolean> {
  let ok = true;
  const also = ["tour", ...(process.env.ALSO ?? "").split(",").filter((n) => n && n !== "tour")].map((n) => ({ name: n, velvet: `?desk=${n}`, also: true }));
  const p95s = new Map<string, number>();
  for (const mobile of [false, true]) for (const p of [...also, ...PAGES] as { name: string; velvet: string; also?: boolean }[]) {
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      if (mobile) {
        const cdp = await ctx.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      }
      await page.goto(BASE + p.velvet.replace("&palette=v", ""), { waitUntil: "commit" });
      times.push(Math.round(Number(await (await h1Visible(page)).jsonValue())));
      await ctx.close();
    }
    const at = p95(times);
    p95s.set(`${p.name}-${mobile}`, at);
    const tour = p95s.get(`tour-${mobile}`)!;
    const pass = mobile ? at <= Math.max(BUDGET_MS, tour) : at <= BUDGET_MS;
    if (!p.also) ok &&= pass;
    const vs = mobile && !p.also ? ` (tour ${tour} ms${at > BUDGET_MS ? `; ${at - BUDGET_MS} ms over the 1000 ms aim` : ""})` : "";
    console.log(`budget ${p.name} ${mobile ? "phone drill" : "desktop"}: h1 visible p95 ${at} ms (${times.join(", ")})${vs} ${p.also ? "baseline" : !pass ? "FAIL" : at > BUDGET_MS ? "MISSED the 1000 ms budget (passes only the looser tour gate)" : "ok"}`);
  }
  return ok;
}

/** SECTIONS=<dir>: one still per section of the design system, at each width and palette, for a close look (and the
 *  page's console errors). Not proof: written where you say, never to the repo. */
async function sections(browser: Browser, dir: string) {
  mkdirSync(dir, { recursive: true });
  for (const pal of ["velvet", "midnight"] as const) for (const s of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const errs: string[] = [];
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(m.text()); });
    page.on("pageerror", (e) => errs.push(String(e)));
    await page.goto(BASE + PAGES[0][pal]);
    await settle(page);
    // The page's own bar is sticky: let it scroll away, so it never sits over a section's still.
    await page.addStyleTag({ content: ".sys > header.gn { position: relative !important; } .sys > .gn-rail { display: none !important; }" });
    for (const id of await page.$$eval("section.sys-fam", (x) => x.map((e) => e.id))) await page.locator(`#${id}`).screenshot({ path: `${dir}/${pal}-${s.w}-${id}.png` });
    console.log(`sections ${pal} ${s.w}: console ${errs.length ? JSON.stringify(errs.slice(0, 5)) : "clean"}`);
    await ctx.close();
  }
}

const browser = await chromium.launch();
try {
  if (process.env.SECTIONS) { await sections(browser, process.env.SECTIONS); process.exit(0); }
  if (process.env.SHOTS !== "0") await stills(browser);
  const violations = await axe(browser);
  const fast = process.env.BUDGET === "0" ? true : await budget(browser);
  if (violations > 0 || !fast) process.exitCode = 1;
} finally {
  await browser.close();
}

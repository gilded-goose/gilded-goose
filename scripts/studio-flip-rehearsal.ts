// The day's flip, walked with no key (Lead-11, Nov 4: "ready behind the gate, so it needs no new build work on the day"; don't
// empty the ledger's first paint for visitors). Against a build made with GOOSE_FLIP_REHEARSAL=1 (the flip on and a
// pretend good licence, vite.config.ts; refused on the host):
//   GOOSE_FLIP_REHEARSAL=1 corepack pnpm --filter @goose/web build
//   node scripts/studio-flip-rehearsal.ts <url>
// - both plain addresses paint Studio's own file with no JS at all, and React adopts it;
// - the board's cards fill their frames, then the dashboard takes over, with nothing on the first screen moving;
// - on the day the licence ends, by the visitor's clock, the same build paints the ledger's own first paint and lands on the
//   Community ledger, with no Studio element and no rebuild.
// Rebuild without the variable afterwards. Nothing here is a claim on the site: a keyless build still shows AG's own mark.
import { chromium } from "playwright";

const BASE = (process.argv[2] ?? "").replace(/\/$/, "");
if (!BASE) { console.error("usage: node scripts/studio-flip-rehearsal.ts <url>"); process.exit(2); }
const SIZES = [{ name: "390", viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, { name: "1440", viewport: { width: 1440, height: 900 } }];
const AFTER = Date.UTC(2100, 0, 2);
let bad = 0;
const check = (ok: boolean, what: string) => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${what}`); };
const browser = await chromium.launch();

for (const { name, ...opts } of SIZES) for (const a of ["/?desk=studio", "/?desk=ledger"]) {
  const label = `${name} ${a}`;
  {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await page.route(/\/assets\/.*\.js$/, (r) => r.abort());
    await page.goto(BASE + a, { waitUntil: "load" });
    await page.waitForFunction(() => (window as unknown as { __firstIn?: number }).__firstIn === 1, undefined, { timeout: 8000 }).catch(() => {});
    const r = await page.evaluate(() => ({ route: document.documentElement.getAttribute("data-first-route"), ledger: document.documentElement.hasAttribute("data-first-ledger"), shell: !!document.querySelector(".st-studio.st-shell"), h1: document.querySelector("#root h1")?.textContent ?? "" }));
    check(r.route === "studio" && !r.ledger && r.shell && r.h1 === "Behind the scenes", `${label}: with no JS, Studio's own first paint (${JSON.stringify(r)})`);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await page.addInitScript(() => { const w = window as unknown as { __tops: number[]; __shellBoard?: boolean }; w.__tops = []; const t = () => { const h = document.querySelector("#st-h"); if (h) w.__tops.push(h.getBoundingClientRect().top + scrollY); if (document.querySelector('[data-board="shell"]')) w.__shellBoard = true; requestAnimationFrame(t); }; requestAnimationFrame(t); });
    await page.goto(BASE + a, { waitUntil: "load" });
    await page.waitForSelector('[data-studio-layer="shown"] .st-studio[data-ready="1"]', { timeout: 60_000, state: "attached" }).catch(() => {});
    const r = await page.evaluate(() => { const w = window as unknown as { __tops: number[]; __firstIn?: number; __firstMiss?: string[]; __shellBoard?: boolean }; return { shellBoard: w.__shellBoard === true, inFirst: w.__firstIn, miss: w.__firstMiss ?? [], range: Math.max(...w.__tops) - Math.min(...w.__tops), layer: document.querySelector("[data-studio-layer]")?.getAttribute("data-studio-layer"), shellGone: !document.querySelector(".st-shell") }; });
    // Asked of every frame on the way, not at the end: on a fast desk the dashboard has already taken the shell's place by the time a later look would ask.
    check(r.shellBoard, `${label}: the board's cards filled the shell's frames`);
    check(r.inFirst === 1 && r.miss.length === 0, `${label}: React adopted the first paint (${r.miss.join(" | ")})`);
    check(r.layer === "shown" && r.shellGone, `${label}: the dashboard took the shell's place`);
    check(r.range <= 2, `${label}: the heading held to ${r.range.toFixed(1)} px on the way`);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await page.addInitScript((at: number) => { const real = Date.now; const start = real(); Date.now = () => at + real() - start; }, AFTER);
    await page.route(/\/assets\/.*\.js$/, (r) => r.abort());
    await page.goto(BASE + a, { waitUntil: "load" });
    const r = await page.evaluate(() => ({ ledger: document.documentElement.hasAttribute("data-first-ledger"), route: document.documentElement.getAttribute("data-first-route"), h1: document.querySelector("#root h1")?.textContent ?? "" }));
    check(r.ledger && !r.route && !!r.h1, `${label}: past the licence's last day, the ledger's own first paint (${JSON.stringify(r)})`);
    await ctx.close();
    const c2 = await browser.newContext(opts);
    const p2 = await c2.newPage();
    await p2.addInitScript((at: number) => { const real = Date.now; const start = real(); Date.now = () => at + real() - start; }, AFTER);
    await p2.goto(BASE + a, { waitUntil: "load" });
    await p2.waitForTimeout(4000);
    const q = await p2.evaluate(() => ({ studio: document.querySelectorAll("[class*='ag-studio'], .st-page").length, ledger: document.querySelectorAll(".lx-main").length }));
    check(q.studio === 0 && q.ledger === 1, `${label}: and it lands on the Community ledger (${JSON.stringify(q)})`);
    await c2.close();
  }
}
await browser.close();
console.log(bad ? `\nflip rehearsal: ${bad} failed` : "\nflip rehearsal: Studio's first paint on the plain addresses, and the ledger's back on the licence's last day");
process.exit(bad ? 1 : 0);

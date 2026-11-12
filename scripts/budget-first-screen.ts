// Budget: first screen under 1 s (PROFILE). Measures a cold load of the built
// static site in headless Chromium: navigation start → "Practice only" (the nav's slot; S1b moved the full
// sentence to the page's last line) and the headline are visible (the state we claim, shared Lesson 3), over N runs.
// Prints every run and the p95; exits 1 if p95 > budget. Nothing is written to the repo.
//
//   pnpm budget:first-screen [url] [runs]     default: http://localhost:4173, 5 runs. The bare address is the Desk
//   (Joshua, Oct 30). A cold visit plays its opening, whose first screen is the case (Joshua's step 1: velvet, the egg's
//   silhouette and one hairline, painted before any script); that is what's timed, and when the hero is up (the
//   opening over: the practice line and headline readable) is printed beside it. `?wallet=0` is the classic page.
//   pnpm budget:first-screen "http://localhost:4173/?wallet=1"   the hosted first screen (W64): the practice line and
//   the waiting deal, after the wallet's own chunk has loaded
//   (serve the build first: pnpm --filter @goose/web build && pnpm --filter @goose/web preview)
//   pnpm budget:first-screen "http://localhost:4173/goose.html"   the white site (Lucas, Nov 9): its headline and its
//   practice line, under the same 1 s line (the Nov 11 speed gate: the new site may not be slower than the old one);
//   on the phone drill its line is the old root's own phone p95 (604-619 ms measured, Lead-13 Nov 11): 620 ms.
//   ".../goose.html#/shop" is Shop opened cold: its kettle example chip, live (enabled). Its phone line is 1750 ms (no old
//   route to match: the old site shopped on its home; Lead-13 asked ~1.5 s; measured 1653 ms p95 on the real server).
//   The phone lines hold only where the server sends the build's brotli files (ci-local runs them on its server, 8797).
//   PROFILE=mobile pnpm budget:first-screen   drill: the phone a student or judge actually holds
//   (Lighthouse's mobile throttling: 150 ms RTT, 1.6 Mbps down, 750 kbps up, CPU 4x slower).
//   Localhost has no TLS or DNS, so a hosted load adds round trips on top of this.

import { chromium, type Page } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
const runs = Number(process.argv[3] ?? 5);
const BUDGET_MS = 1000;
const MOBILE = process.env.PROFILE === "mobile";
const WALLET = new URL(url).searchParams.get("wallet") === "1";
const CLASSIC = new URL(url).searchParams.get("wallet") === "0";
// The bare domain is the white site on our server (main.ts rootPage, Nov 11); vite preview still serves index.html there,
// so a bare "/" is white only when the caller says so (FIRST_SCREEN_PAGE=white, as ci-local does on the server).
const WHITE = new URL(url).pathname.endsWith("/goose.html") || process.env.FIRST_SCREEN_PAGE === "white";
const WHITE_SHOP = WHITE && new URL(url).hash === "#/shop";
const budget = MOBILE && WHITE_SHOP ? 1750 : MOBILE && WHITE ? 620 : BUDGET_MS;

// Every check runs each frame (polling: "raf"), with Playwright's own test of visible (a box, not visibility:hidden). A
// locator's waitFor backs off to 500 ms polls, which under CPU 4x read the paint up to ~0.4 s late (Desk-S4; Track B
// slice 2 measured the case at 610-634 ms by rAF against 1024-1081 ms by locator). `checks` are [selector, text] pairs,
// all of which must show at once; an empty text means the element alone.
const visible = (page: Page, checks: [string, string][], opening = false) => page.waitForFunction(({ checks, opening }) => {
  if (opening && document.documentElement.classList.contains("dk-opening")) return false;
  return checks.every(([sel, text]) => [...document.querySelectorAll(sel)].some((el) => {
    // A display head draws a real apostrophe (DD, Nov 4): the words are what's checked, not which tick the page draws.
    if (text && !(el.textContent ?? "").replace(/\s+/g, " ").replace(/\u2019/g, "'").toLowerCase().includes(text.toLowerCase())) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && el.checkVisibility({ visibilityProperty: true });
  }));
}, { checks, opening }, { polling: "raf", timeout: 10_000 });

const browser = await chromium.launch();
const times: number[] = [];
const heroes: number[] = [];
for (let i = 0; i < runs; i++) {
  // Fresh context = cold cache every run; the phone drill is a phone's width too (it used to open 1280 wide).
  const context = await browser.newContext(MOBILE ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {});
  const page = await context.newPage();
  if (MOBILE) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  const t0 = performance.now();
  await page.goto(url, { waitUntil: "commit" });
  if (WHITE_SHOP) await page.waitForFunction(() => [...document.querySelectorAll(".chip")].some((b) => /kettle/i.test(b.textContent ?? "") && !(b as HTMLButtonElement).disabled && b.getBoundingClientRect().height > 0), null, { polling: "raf", timeout: 10_000 });
  else if (WHITE) await visible(page, [["#hero-title", "Your agent shops."], [".hx-fine", "Fictional sellers."]]);
  else if (WALLET) await visible(page, [[".dk-practice-ph", "Practice only"], ["#hero-h", ""]]);
  else if (!CLASSIC) await visible(page, [["#dk-case svg", ""]]);
  else await visible(page, [[".dk-practice-ph", "Practice only"], ["h1", "Try to trick Goose"]]);
  const ms = Math.round(performance.now() - t0);
  times.push(ms);
  if (!WALLET && !CLASSIC && !WHITE) {
    // The opening over, the practice line and the headline both visible.
    await visible(page, [[".dk-practice-ph", "Practice only"], [".dk-hero h1", "Goose can't be fooled into paying."]], true);
    heroes.push(Math.round(performance.now() - t0));
  }
  console.log(`run ${i + 1}: ${ms} ms${heroes.length ? `, hero up at ${heroes.at(-1)} ms` : ""}`);
  await context.close();
}
await browser.close();

const sorted = [...times].sort((a, b) => a - b);
const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]!;
const spread = sorted[sorted.length - 1]! - sorted[0]!;
if (heroes.length) console.log(`desk hero up (opening over): p95 = ${[...heroes].sort((a, b) => a - b)[Math.min(heroes.length - 1, Math.ceil(heroes.length * 0.95) - 1)]} ms (the opening's hard cap is about 1.5 s; not budgeted)`);
console.log(`first-screen${WHITE_SHOP ? " (white site, Shop cold)" : WHITE ? " (white site)" : WALLET ? " (wallet)" : CLASSIC ? " (classic)" : " (desk: the case)"}${MOBILE ? " (mobile drill)" : ""} p95 = ${p95} ms (budget ${budget} ms, spread ${spread} ms over ${runs} runs)`);
if (p95 > budget) { console.error(`BUDGET FAIL: first screen over ${budget} ms`); process.exit(1); }
console.log("BUDGET PASS");

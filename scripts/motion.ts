/// <reference lib="dom" />
// Step 5's motion checks (011 §5), in a real browser. Motion must answer a row that just arrived, never run on its
// own clock, and never play for a visitor who asked for reduced motion. Exits 1 on the first broken rule:
//   - every lane pill and the teal bar take their new row within 300 ms of its ledger message arriving;
//   - the guard-off card lands within 300 ms of the control reply, and the check draws within 300 ms of the guard's;
//   - the guard-on card's $60 never changes while the other card moves;
//   - with nothing submitted, nothing moves for 2 s (on the empty page and on a finished run);
//   - no motion waits before starting or runs past 400 ms;
//   - with reduced motion, the page never gets the motion class and nothing plays at all.
//
// Spends nothing: the run is a recorded replay (week 1, paced by its recorded waits), the note goes to the plain
// rule, and the control reply is answered here (route.fulfill), so no sandbox order is made and no cap is used.
//
//   node scripts/motion.ts [url]     default http://localhost:5173 (pnpm dev)
//
// The A3 wallet mockup's haggle (Joshua, round 2), on the static file, no server: `--a3 [file]`, default
// docs/design/a3-wallet.html. Each price it shows after Go must be a ledger row the engine makes now (scripts/a3-ticks.ts
// replays the recorded week; nothing is read from the page's own data), in order and no faster than the recording; nothing
// moves before Go or after the last row; and with reduced motion the last price and every row land at once, unanimated.
//
//   node scripts/motion.ts --a3 [file]
//
// The Desk against the brand's motion rules (docs/guild/brand.md; Track B, Oct 30): no loops, no frames drawn at rest,
// at most three glass surfaces, nothing at all under reduced motion, no opening on a link into a room; the opening's
// words first (the headline and the bar's contents by WORDS); frame pacing at 1440 and on a phone (390, CPU 4x).
//
//   node scripts/motion.ts --desk [url] [--trace dir]
//
// The hero egg is never missing: no WebGL, a lost WebGL context and a full-page capture, Chromium and WebKit, 1440 and 390.
//
//   node scripts/motion.ts --egg [url] [--out dir]
//
// Frame time on a 4x-slowed phone (390x844) through both cinematic reveals under the frosted bar: p95 <= 33 ms per
// reveal, after a heavy control has proved the gate can fail.
//
//   node scripts/motion.ts --frames [url]

import { chromium, type Page } from "playwright";
import { resolve } from "node:path";

const A3 = process.argv.includes("--a3");
const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const url = (arg ?? "http://localhost:5173/").replace(/\/?$/, "/");
const WITHIN = 300;
// --desk, brand.md section 7: everything takes --d-3 (400 ms, plus 20 ms for the browser's rounding) at most, delay
// included, outside the opening and the named exceptions below (two line draws, the cinematic reveal). (The hero's
// 900 ms line rise, once an exception, has been one 480 ms fade inside the opening since Round 0.)
const CAP = 420;
// --frames (S2-cine slice 6): each cinematic reveal on a 4x-slowed phone keeps its p95 frame time at 30 fps or better.
const FRAME_P95 = 33;
// The opening's own fades (the headline, dk-sub, dk-ask, dk-chips) start under html.dk-opening, or in the first beat
// after dk-opened lands (a phone at CPU 4x: the chips' fade was once stamped 1000 ms a frame after the class changed);
// a hero or nav motion within this long after the opening ended still counts as the opening.
const OPENED_BEAT = 1200;
// The landing's named exceptions (brand.md section 7 and 10.7): the moment's price track (--ds-draw) and step 3's gold
// rule (--ds-rule), the two line draws; and the cinematic reveal (--d-cine, 900 ms), the difference's payoff line and
// the moment's ticket, their opacity and transform. Each runs once, on these elements only, with no delay; anything else
// past CAP still breaks. Keyed by the element's first class and the property (instrumentDesk's `what`).
const DRAWS: Record<string, number> = {
  "ds-track-line clip-path": 700, "ds-protect-rule transform": 600,
  "ds-payoff opacity": 900, "ds-payoff transform": 900, "ds-ticket opacity": 900, "ds-ticket transform": 900,
};
// The opening's words (S2-3, Round 2's design judge): on a desktop the headline reads (opacity .5) by this and the
// bar's contents are up (opacity .9) by this, on the page's clock from navigation start, on a built site served from
// localhost (the words wait only on the Desk's chunk and its two faces; the egg lights and glides behind them). On the
// phone the headline waits for the glide, since the egg rises through its place: it is up by the opening's cap
// (HERO_BY); the bar's contents don't wait, but a CPU 4x phone mounts the Desk later.
const WORDS = { title: 500, bar: 700, phoneTitle: 1380, phoneBar: 900 };
/** The hero's two parallax layers are the only things allowed to move with the scroll (system.md section 7). */
const PARALLAX_OK = ".dk-hero-egg, .dk-hero-copy";
function fail(m: string): never { console.error(`MOTION FAIL: ${m}`); process.exit(1); }

/** Runs in the page before the app: stamps each ledger message, each new data-seq on a pill or the bar, each
 *  reply, each motion that starts, and the moments the two judge cards change, all on one clock. */
function instrument() {
  const w = window as unknown as { probe: Record<string, unknown> };
  const p = { msg: {} as Record<number, number>, mark: {} as Record<string, number>, reply: {} as Record<string, number>, started: [] as string[], slowest: 0, landed: 0, ring: 0 };
  w.probe = p;
  const ES = window.EventSource;
  window.EventSource = class extends ES {
    constructor(u: string | URL, init?: EventSourceInit) {
      super(u, init);
      this.addEventListener("ledger", (m) => { const seq = (JSON.parse((m as MessageEvent).data) as { seq: number }).seq; p.msg[seq] ??= performance.now(); });
    }
  };
  const f = window.fetch;
  window.fetch = async (...a: Parameters<typeof fetch>) => {
    const r = await f(...a);
    const path = String(a[0] instanceof Request ? a[0].url : a[0]);
    if (a[1]?.method === "POST") p.reply[path.replace(/^.*\/api\//, "")] = performance.now();
    return r;
  };
  for (const t of ["transitionstart", "animationstart"]) {
    addEventListener(t, (e) => {
      // A motion that waits or drags on would pass the DOM timing above while the eye still sees a staged delay.
      for (const a of (e.target as Element).getAnimations()) { const t = a.effect!.getTiming(); p.slowest = Math.max(p.slowest, Number(t.delay ?? 0) + Number(t.duration ?? 0)); }
      p.started.push(`${(e.target as Element).getAttribute("class") || (e.target as Element).tagName}:${(e as AnimationEvent).animationName ?? (e as TransitionEvent).propertyName}`);
    }, true);
  }
  const look = (el: Element) => {
    if (el.matches(".pill, .fill") && el.hasAttribute("data-seq")) p.mark[`${el.className.split(" ")[0]}:${el.getAttribute("data-seq")}`] ??= performance.now();
    if (el.matches('[data-card="guard-off"][data-state="landed"]') && !p.landed) p.landed = performance.now();
    if (el.matches(".ring svg")) p.ring = performance.now();
  };
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === "attributes") look(m.target as Element);
      for (const n of m.addedNodes) if (n instanceof Element) { look(n); n.querySelectorAll("*").forEach(look); }
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-seq", "data-state"] });
}

interface Probe { msg: Record<number, number>; mark: Record<string, number>; reply: Record<string, number>; started: string[]; slowest: number; landed: number; ring: number }
const probe = (page: Page) => page.evaluate(() => (window as unknown as { probe: Probe }).probe);

/** Nothing plays for 2 s: sampled every 100 ms, so a loop or a late animation would show up. */
async function still(page: Page, where: string) {
  const moving = await page.evaluate(async () => {
    let n = 0;
    for (let i = 0; i < 20; i++) { n = Math.max(n, document.getAnimations().filter((a) => a.playState === "running").length); await new Promise((r) => setTimeout(r, 100)); }
    return n;
  });
  if (moving) fail(`${where}: ${moving} animation(s) running with nothing submitted`);
}

/** The control reply, answered here: a landed $500 order, 400 ms after the request, like a quick PayPal. */
async function fakeControl(page: Page) {
  await page.route("**/api/control", async (r) => {
    if (r.request().method() !== "POST") return r.fallback();
    await new Promise((ok) => setTimeout(ok, 400));
    await r.fulfill({ json: { state: "landed", orderId: "MOTION-TEST", status: "CREATED", amount: "500.00", currency: "USD", at: new Date().toISOString(), left: 2, fake: true } });
  });
}

/** Runs in the mockup before its script: stamps Go, every price the tick shows (with its row), and every motion. */
function instrumentA3() {
  const p = { go: 0, ticks: [] as { seq: string; text: string; at: number }[], started: [] as string[], slowest: 0 };
  (window as unknown as { a3probe: typeof p }).a3probe = p;
  addEventListener("click", (e) => { if ((e.target as Element).closest?.("#go")) p.go ||= performance.now(); }, true);
  for (const t of ["transitionstart", "animationstart"]) {
    addEventListener(t, (e) => {
      for (const a of (e.target as Element).getAnimations()) { const g = a.effect!.getTiming(); p.slowest = Math.max(p.slowest, Number(g.delay ?? 0) + Number(g.duration ?? 0)); }
      p.started.push(`${(e.target as Element).getAttribute("class") || (e.target as Element).tagName}:${(e as AnimationEvent).animationName ?? (e as TransitionEvent).propertyName}`);
    }, true);
  }
  // The tick writes its price, then its row number; the row number's change is the moment that price is on screen.
  new MutationObserver((ms) => {
    for (const m of ms) {
      const el = m.target as Element;
      if (el.matches("[data-tick]")) p.ticks.push({ seq: el.getAttribute("data-seq") ?? "", text: el.querySelector(".cur")?.textContent ?? "", at: performance.now() });
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-seq"] });
}

interface A3Probe { go: number; ticks: { seq: string; text: string; at: number }[]; started: string[]; slowest: number }

async function a3(): Promise<void> {
  const { MOCKUP, a3Data } = await import("./a3-ticks.ts");
  const d = await a3Data();
  const want = d.ticks.map((t) => `${t.seq}:$${t.price}`);
  const file = "file://" + resolve(arg ?? MOCKUP);
  const browser = await chromium.launch();
  for (const reduced of [false, true]) {
    const name = `a3 ${reduced ? "reduced" : "motion"}`;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: reduced ? "reduce" : "no-preference" });
    const page = await ctx.newPage();
    await page.addInitScript(instrumentA3);
    await page.goto(`${file}?state=asking`, { waitUntil: "load" });
    const probeA3 = () => page.evaluate(() => (window as unknown as { a3probe: A3Probe }).a3probe);
    // (b) Nothing on its own clock: longer than the whole recorded haggle, with no Go, no price shows and nothing moves.
    const whole = d.ticks.reduce((s, t) => s + t.waitMs, 0);
    await page.waitForTimeout(whole + 1000);
    await still(page, `${name} before Go`);
    let p = await probeA3();
    if (p.ticks.length || p.started.length) fail(`${name}: before Go, ${p.ticks.length} tick(s) and ${p.started.length} motion(s) ran`);
    if (await page.locator("[data-tick]").isVisible()) fail(`${name}: the price shows before Go`);
    await page.locator("#go").click();
    await page.locator("body[data-done]").waitFor({ timeout: whole + 5000 }).catch(() => fail(`${name}: the haggle never reached its last row`));
    p = await probeA3();
    const seen = p.ticks.map((t) => `${t.seq}:${t.text}`);
    const rows = await page.locator("#trows li").evaluateAll((ls) => ls.map((l) => `${l.getAttribute("data-seq")}:${l.querySelector("b.ap")?.textContent}`));
    if (p.ticks.some((t) => t.at < p.go)) fail(`${name}: a price showed before Go`);
    if (!reduced) {
      // (a) Every price shown is the engine's row, in order, each no sooner than the recorded wait before it.
      if (seen.join() !== want.join()) fail(`${name}: the tick showed ${seen.join(" ")}, the engine's rows are ${want.join(" ")}`);
      for (let i = 1; i < p.ticks.length; i++) {
        const gap = p.ticks[i]!.at - p.ticks[i - 1]!.at, min = d.ticks[i]!.waitMs - 20;
        if (gap < min) fail(`${name}: row ${p.ticks[i]!.seq} came ${gap.toFixed(0)} ms after the last, sooner than its recorded ${d.ticks[i]!.waitMs} ms`);
      }
      if (!p.started.length) fail(`${name}: nothing moved as the rows landed`);
      if (p.slowest > 400) fail(`${name}: a motion takes ${p.slowest} ms including its delay (at most 400)`);
      console.log(`ok  ${name}: ${seen.length} ticks, each its engine row (${want.join(" ")}), paced by the recording, nothing before Go`);
    } else {
      // (c) Reduced: one landing, the last row's price, every row listed, and nothing animated.
      if (seen.join() !== want.at(-1)) fail(`${name}: the tick showed ${seen.join(" ") || "nothing"}, not just the final ${want.at(-1)}`);
      if (p.started.length) fail(`${name}: motion played anyway (${[...new Set(p.started)].slice(0, 5).join(", ")})`);
      if (p.ticks[0]!.at - p.go > 100) fail(`${name}: the final price took ${(p.ticks[0]!.at - p.go).toFixed(0)} ms after Go`);
      console.log(`ok  ${name}: final ${want.at(-1)} and all ${rows.length} rows at once, nothing animated`);
    }
    if (rows.join() !== want.join()) fail(`${name}: the row list is ${rows.join(" ")}, the engine's rows are ${want.join(" ")}`);
    // The last row's own motion is at most 400 ms (checked above); after that, nothing may move again.
    await page.waitForTimeout(450);
    await still(page, `${name} after the last row`);
    if ((await probeA3()).ticks.length !== p.ticks.length) fail(`${name}: the price changed after the last row`);
    await ctx.close();
  }
  await browser.close();
  console.log("MOTION A3 PASS");
}

if (A3) { await a3(); process.exit(0); }
if (process.argv.includes("--desk")) { await desk(); process.exit(0); }
if (process.argv.includes("--egg")) { await eggCheck(); process.exit(0); }
if (process.argv.includes("--frames")) { await frames(); process.exit(0); }

/** Frame time on a phone (S2-cine slice 6, Lead-10): 390x844, DPR 3, CPU slowed 4x (CDP), a thumb's scroll down the
 *  whole landing under the frosted bar, through both cinematic reveals (the ticket's, the payoff's). Every frame the page
 *  draws is stamped (the browser's own requestAnimationFrame); each reveal's window runs from its transform transition's
 *  start to its end with time elapsed. Budget per reveal: p95 frame time <= FRAME_P95 (30 fps). Dropped frames: the
 *  60 Hz slots a gap skipped.
 *  The gate proves it can fail first: the same run with a heavy control must miss the budget, or the pass is void. The
 *  control is main-thread work each frame (a fixed sum, so the 4x slowdown scales it, as it does the page's own work).
 *  A second control, a full-screen layer blurring the page at 40 px, is printed, not gated: CPU throttling slows the
 *  page's main thread only, and the blur is the GPU's, so on this Mac's GPU it costs no frames here (measured, slice 6).
 *  A blur's cost on a phone's GPU needs a real phone; this pass can't speak for it.
 *    node scripts/motion.ts --frames [url]  */
function instrumentFrames() {
  const raf = window.requestAnimationFrame.bind(window);
  const f = { t: [] as number[], rec: false, cine: {} as Record<string, { start: number; end: number }> };
  (window as unknown as { ff: typeof f & { go(): void; stop(): void } }).ff = Object.assign(f, {
    go() { f.t = []; f.rec = true; const tick = (t: number) => { if (!f.rec) return; f.t.push(t); raf(tick); }; raf(tick); },
    stop() { f.rec = false; },
  });
  // A stray 0 s start/end (Chrome under load, see instrumentDesk) is not the reveal: the first start, the first real end.
  addEventListener("transitionstart", (e) => {
    const el = e.target as Element;
    if (e.propertyName !== "transform" || !el.hasAttribute("data-cine")) return;
    const k = el.classList[0]!;
    f.cine[k] ??= { start: e.timeStamp, end: 0 };
  }, true);
  addEventListener("transitionend", (e) => {
    const el = e.target as Element;
    if (e.propertyName !== "transform" || !el.hasAttribute("data-cine") || e.elapsedTime === 0) return;
    const c = f.cine[el.classList[0]!];
    if (c && !c.end) c.end = e.timeStamp;
  }, true);
}
/** p95 of the frame gaps inside [from, to], and the 60 Hz frames they dropped. */
function windowPace(t: number[], from: number, to: number) {
  const inside = t.filter((x) => x >= from && x <= to);
  const gaps = inside.slice(1).map((x, i) => x - inside[i]!).sort((a, b) => a - b);
  const p95 = gaps[Math.min(gaps.length - 1, Math.floor(0.95 * gaps.length))] ?? Infinity;
  const dropped = gaps.reduce((n, g) => n + Math.max(0, Math.round(g / (1000 / 60)) - 1), 0);
  return { n: gaps.length, p95, worst: gaps.at(-1) ?? 0, dropped };
}
async function frames(): Promise<void> {
  const target = (process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "http://localhost:5173/").replace(/\/?$/, "/");
  const browser = await chromium.launch({ channel: "chromium" }); // the real GPU, as --desk (no SwiftShader)
  const run = async (control: "" | "work" | "blur") => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => sessionStorage.setItem("gg-opened", "1")); // the opening is --desk's; this is the scroll
    const page = await ctx.newPage();
    await page.addInitScript(instrumentFrames);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.goto(target, { waitUntil: "load" });
    await page.locator(".ds-ticket").waitFor({ state: "attached", timeout: 20_000 });
    // The work control: a fixed sum every frame (~4 ms of main thread on this Mac, ~16 ms at 4x), on top of the page's own.
    if (control === "work") await page.evaluate(() => { const raf = requestAnimationFrame; let x = 0; const busy = () => { for (let i = 0; i < 4e6; i++) x += Math.sqrt(i); (window as unknown as { sink: number }).sink = x; raf(busy); }; raf(busy); });
    if (control === "blur") await page.addStyleTag({ content: "body::after { content: ''; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; -webkit-backdrop-filter: blur(40px); backdrop-filter: blur(40px); background: rgb(0 0 0 / .01); }" });
    await page.waitForTimeout(1500);
    const ff = <T>(x: string) => page.evaluate(`window.ff.${x}`) as Promise<T>;
    await ff("go()");
    // A thumb's scroll, top to bottom: a wheel step every 120 ms (the browser scrolls it smoothly, on its compositor),
    // so the bar's blur is redrawn over moving content all the way down, both reveals included.
    const bar: string[] = [];
    for (let i = 0; i < 400; i++) {
      const done = await page.evaluate(() => scrollY + innerHeight >= document.documentElement.scrollHeight - 2);
      if (done) break;
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(120);
      // The bar on screen (the page holds a second, hidden header.gn): its frost, read as the reader scrolls.
      if (i % 10 === 5) bar.push(await page.evaluate(() => { const e = [...document.querySelectorAll("header.gn")].find((h) => h.hasAttribute("data-scrolled") && h.getBoundingClientRect().height > 0); return e ? getComputedStyle(e).backdropFilter : "no scrolled bar on screen"; }));
    }
    await page.waitForTimeout(1500);
    await ff("stop()");
    const t = await ff<number[]>("t"), cine = await ff<Record<string, { start: number; end: number }>>("cine");
    await ctx.close();
    const out: Record<string, ReturnType<typeof windowPace>> = { "whole scroll": windowPace(t, t[0] ?? 0, t.at(-1) ?? 0) };
    for (const k of ["ds-ticket", "ds-payoff"]) {
      const c = cine[k];
      if (!c?.end) fail(`frames${control ? ` (${control} control)` : ""}: the ${k} reveal never ran to its end on the scroll down`);
      out[k] = windowPace(t, c!.start, c!.end);
    }
    return { out, bar: [...new Set(bar)] };
  };
  const line = (k: string, s: ReturnType<typeof windowPace>) => `${k}: ${s.n} frames, p95 ${s.p95.toFixed(1)} ms, worst ${s.worst.toFixed(0)} ms, ${s.dropped} dropped`;
  // 1. The controls first: the budget must catch a page that is really too heavy.
  const heavy = await run("work");
  for (const [k, s] of Object.entries(heavy.out)) console.log(`    work control ${line(k, s)}`);
  const caught = ["ds-ticket", "ds-payoff"].filter((k) => heavy.out[k]!.p95 > FRAME_P95);
  if (caught.length < 2) fail(`frames: the work control passed the ${FRAME_P95} ms budget on ${["ds-ticket", "ds-payoff"].filter((k) => !caught.includes(k)).join(", ")}: the gate can't see jank`);
  console.log(`ok  the work control misses the budget on both reveals (the gate can fail)`);
  const blur = await run("blur");
  for (const [k, s] of Object.entries(blur.out)) console.log(`    blur control (printed, not gated: the GPU's cost) ${line(k, s)}`);
  // 2. The landing as shipped.
  const real = await run("");
  for (const [k, s] of Object.entries(real.out)) console.log(`    ${line(k, s)}`);
  console.log(`    the bar's backdrop-filter on the way down: ${real.bar.join(" | ")}`);
  if (real.bar.some((f) => !/blur\(/.test(f))) fail(`frames: the frosted bar wasn't frosted through the scroll (${real.bar.join(" | ")}), so its blur wasn't measured`);
  const over = ["ds-ticket", "ds-payoff"].filter((k) => real.out[k]!.p95 > FRAME_P95);
  await browser.close();
  if (over.length) fail(`frames: ${over.map((k) => line(k, real.out[k]!)).join("; ")} (the budget is p95 <= ${FRAME_P95} ms, 30 fps)`);
  console.log("MOTION FRAMES PASS");
}

/** The hero egg is never missing (Joshua's live review, Oct 30: a full-page capture showed a broken-image box). In
 *  Chromium with the GPU, Chromium with WebGL turned off, and WebKit when it is installed, at 1440 and 390: every egg
 *  picture loads; the egg box shows gold (the canvas or the still); after the WebGL context is lost the still is back;
 *  and a full-page capture shows gold in the egg box too. Gold = enough pixels clearly warm, read from the screenshot.
 *    node scripts/motion.ts --egg [url] [--out dir]     the screenshots go to dir when given */
async function eggCheck(): Promise<void> {
  const { webkit } = await import("playwright");
  const oi = process.argv.indexOf("--out"), out = oi > 0 ? process.argv[oi + 1] : undefined;
  const target = (process.argv.slice(2).find((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--out") ?? "http://localhost:5173/").replace(/\/?$/, "/");
  if (out) (await import("node:fs")).mkdirSync(out, { recursive: true });
  const engines = [
    ["chromium", () => chromium.launch({ channel: "chromium" })],
    ["chromium-software-gl", () => chromium.launch()], // the headless shell's software GL: the capture that showed a broken box
    ["chromium-no-webgl", () => chromium.launch({ args: ["--disable-webgl", "--disable-3d-apis"] })],
    ["webkit", () => webkit.launch()],
  ] as const;
  let ran = 0;
  for (const [name, launch] of engines) {
    const browser = await launch().catch((e: Error) => { console.log(`  ${name}: SKIP, not installed (${e.message.split("\n")[0]})`); return null; });
    if (!browser) continue;
    for (const [w, h] of [[1440, 900], [390, 844]] as const) {
      const phone = w < 500;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
      const page = await ctx.newPage(), blank = await (await browser.newContext()).newPage();
      const bad: string[] = [];
      page.on("response", (r) => { if (/egg/.test(r.url()) && r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
      page.on("requestfailed", (r) => { if (/egg/.test(r.url())) bad.push(`failed ${r.url()}`); });
      await page.goto(target, { waitUntil: "load" });
      await page.waitForTimeout(3500); // the opening, then the live egg's code and its first frame
      const where = `${name} ${w}`;
      if (bad.length) fail(`${where}: the egg picture did not load: ${bad.join(", ")}`);
      // Every egg picture on the page: the hero's two, and the nav's mark where it is an <img> (the first-paint bar that
      // index.html draws before React is a <span> with a CSS background, S1b; it has no load state to read).
      const imgs = await page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>(".dk-hero img, .dk-egg img, img.dk-mark")]
        .map((i) => ({ cls: i.className, ok: i.complete && i.naturalWidth > 0 })));
      for (const i of imgs) if (!i.ok) fail(`${where}: ${i.cls} is a broken image`);
      const state = () => page.evaluate(() => {
        const c = document.querySelector(".dk-egg-gl"), s = document.querySelector(".dk-egg-still");
        return { gl: !!c?.classList.contains("dk-on"), canvas: !!c, still: s ? Number(getComputedStyle(s).opacity) : -1 };
      });
      const shot = async (tag: string, full = false) => {
        const box = await page.locator(".dk-egg-body").first().boundingBox();
        if (!box) fail(`${where}: no egg on the first screen (${tag})`);
        const sy = full ? await page.evaluate(() => scrollY) : 0;
        const buf = await page.screenshot({ fullPage: full, clip: { x: box.x, y: box.y + sy, width: box.width, height: box.height }, ...(out ? { path: `${out}/${name}-${w}-${tag}.png` } : {}) });
        const gold = await gilt(blank, buf.toString("base64"));
        if (gold < 0.05) fail(`${where}: the egg box shows no egg (${tag}: ${(gold * 100).toFixed(1)}% gold pixels, ${JSON.stringify(await state())})`);
        return gold;
      };
      const s0 = await state();
      const g0 = await shot("hero");
      let lost = "";
      if (s0.gl) {
        await page.evaluate(() => { const c = document.querySelector<HTMLCanvasElement>(".dk-egg-gl"); (c?.getContext("webgl2") ?? c?.getContext("webgl"))?.getExtension("WEBGL_lose_context")?.loseContext(); });
        await page.waitForTimeout(600);
        const s1 = await state();
        if (s1.gl || s1.canvas || s1.still < 0.99) fail(`${where}: after the WebGL context was lost the still did not come back (${JSON.stringify(s1)})`);
        if (out) await page.screenshot({ fullPage: true, path: `${out}/${name}-${w}-context-lost-whole-page.png` });
        lost = `, context lost -> still ${(100 * (await shot("context-lost"))).toFixed(0)}% gold`;
        await page.reload({ waitUntil: "load" });
        await page.waitForTimeout(3500);
      }
      const g2 = await shot("full-page", true);
      console.log(`  ${where}: ${s0.gl ? "live egg" : "still picture"} ${(100 * g0).toFixed(0)}% gold${lost}, full-page capture ${(100 * g2).toFixed(0)}% gold`);
      await ctx.close();
      ran++;
    }
    await browser.close();
  }
  if (!ran) fail("no browser ran");
  console.log("MOTION EGG PASS");
}

/** The share of a screenshot's pixels that read as the egg's gold (warm, bright, clearly more red than blue). Read on a
 *  blank page of its own, so the site's content security policy has no say. */
async function gilt(page: Page, png: string): Promise<number> {
  return page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = Object.assign(document.createElement("canvas"), { width: bmp.width, height: bmp.height }), x = c.getContext("2d")!;
    x.drawImage(bmp, 0, 0);
    const d = x.getImageData(0, 0, bmp.width, bmp.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i]! > 120 && d[i]! - d[i + 2]! > 50 && d[i + 1]! > 70) n++;
    return n / (d.length / 4);
  }, png);
}

/** Runs in the Desk before its code: counts the page's own animation frames, records every frame's time (with the
 *  browser's own requestAnimationFrame, so recording is never counted as the page's), every long task, and every
 *  motion that starts with its length, delay and repeat count, tagged as the opening's where it is (OPENED_BEAT). */
function instrumentDesk(beat: number) {
  const raf = window.requestAnimationFrame.bind(window);
  const p = { rafs: 0, frames: [] as number[], rec: false, long: [] as number[], words: { title5: 0, title9: 0, bar9: 0 }, motions: [] as { what: string; ms: number; dur: number; delay: number; loops: number; opening: boolean }[], cine: {} as Record<string, string[]>, drawn: [] as number[], rising: [] as number[] };
  (window as unknown as { dk: typeof p & { start(): void; stop(): void } }).dk = Object.assign(p, {
    start() { p.frames = []; p.rec = true; const tick = (t: number) => { if (!p.rec) return; p.frames.push(t); raf(tick); }; raf(tick); },
    stop() { p.rec = false; },
  });
  window.requestAnimationFrame = (f) => { p.rafs++; return raf(f); };
  // The opening's words clock: each frame until the opening is over, the headline's and the bar's contents' effective
  // opacity (every ancestor's multiplied), stamped on the page's clock the first time each passes its mark.
  const eff = (el: Element | null) => { if (!el) return 0; const r = el.getBoundingClientRect(); if (!r.width || !r.height) return 0; let o = 1; for (let e: Element | null = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
  const words = () => {
    const t = performance.now(), title = eff(document.querySelector(".dk-hero h1 .dk-mask > span"));
    const bar = eff([...document.querySelectorAll(".dk-nav-in")].find((el) => el.getBoundingClientRect().width > 0) ?? null);
    if (!p.words.title5 && title >= 0.5) p.words.title5 = t;
    if (!p.words.title9 && title >= 0.9) p.words.title9 = t;
    if (!p.words.bar9 && bar >= 0.9) p.words.bar9 = t;
    if (!(p.words.title9 && p.words.bar9) && t < 20_000) raf(words);
  };
  raf(words);
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => p.long.push(e.duration))).observe({ type: "longtask", buffered: true }); } catch { /* no long-task timing */ }
  // When the opening ended (dk-opening left <html>): its last fades may start a frame after that.
  let openedAt = 0;
  new MutationObserver(() => { if (!openedAt && document.documentElement.classList.contains("dk-opened")) openedAt = performance.now(); })
    .observe(document, { subtree: true, attributes: true, attributeFilter: ["class"] });
  const inOpening = () => document.documentElement.classList.contains("dk-opening") || (openedAt > 0 && performance.now() - openedAt < beat);
  // brand.md 10.7: each cinematic reveal ([data-cine]) and each track draw counted by its end with time elapsed. Chrome
  // under load can fire a stray start and a 0 s end as a transition begins, then run it anyway: one rise on screen, two
  // starts in the log, so starts are not the count.
  addEventListener("transitionend", (e) => {
    const el = e.target as Element, cls = (el.getAttribute("class") ?? "").split(" ")[0] ?? "";
    if (e.elapsedTime === 0) return;
    if (e.propertyName === "transform" && el.hasAttribute("data-cine")) (p.cine[cls] ??= []).push(`${Math.round(performance.now())} ms at scrollY ${Math.round(scrollY)} (${el.className})`);
    if (e.propertyName === "clip-path" && el.matches(".ds-track-line")) p.drawn.push(e.elapsedTime);
  });
  for (const type of ["animationstart", "transitionstart"]) {
    addEventListener(type, (e) => {
      const el = e.target as Element;
      const name = (e as AnimationEvent).animationName ?? (e as TransitionEvent).propertyName;
      const cls = (typeof el.className === "string" ? el.className : el.getAttribute("class") ?? "").split(" ").filter(Boolean)[0] ?? el.tagName.toLowerCase();
      const pseudo = (e as AnimationEvent).pseudoElement || "";
      // brand.md 10.7: at each start of the ticket's track draw, how many of the ticket's own transform transitions are
      // still running (0: it has landed). Read when the event fires, not from timestamps, which a 4x-slowed phone
      // dispatches late.
      if (type === "transitionstart" && name === "clip-path" && el.matches(".ds-track-line")) p.rising.push(el.closest(".ds-ticket")?.getAnimations().filter((a) => (a as CSSTransition).transitionProperty === "transform").length ?? -1);
      for (const a of el.getAnimations({ subtree: false })) {
        const g = a.effect!.getTiming();
        const own = (a as CSSTransition).transitionProperty ?? (a as CSSAnimation).animationName ?? name;
        const delay = Number(g.delay ?? 0), dur = Number(g.duration ?? 0);
        p.motions.push({ what: `${cls}${pseudo} ${own}`, ms: delay + dur, dur, delay, loops: Number(g.iterations ?? 1),
          // The opening's own elements only: a story block that reveals while the opening plays is not the opening.
          opening: inOpening() && !!el.closest("#dk-case, .dk-hero, .dk-intro, .dk-nav") });
      }
    }, true);
  }
}

interface DeskProbe { rafs: number; frames: number[]; long: number[]; words: { title5: number; title9: number; bar9: number }; motions: { what: string; ms: number; dur: number; delay: number; loops: number; opening: boolean }[]; cine: Record<string, string[]>; drawn: number[]; rising: number[] }
/** Frame pacing over a recorded window: the median and 95th-percentile gap between frames, and frames that missed. */
function pace(frames: number[]) {
  const gaps = frames.slice(1).map((t, i) => t - frames[i]!).sort((a, b) => a - b);
  const q = (x: number) => gaps[Math.min(gaps.length - 1, Math.floor(x * gaps.length))] ?? 0;
  return { n: gaps.length, p50: q(0.5), p95: q(0.95), worst: gaps.at(-1) ?? 0, missed: gaps.filter((g) => g > 25).length };
}
function fmt(s: ReturnType<typeof pace>) {
  return `${s.n} frames, p50 ${s.p50.toFixed(1)} ms, p95 ${s.p95.toFixed(1)} ms, worst ${s.worst.toFixed(0)} ms, ${s.n ? Math.round((100 * s.missed) / s.n) : 0}% over 25 ms`;
}

/** The brand's motion rules on the Desk (docs/guild/brand.md, "Motion"), at 1440 and on a phone at 390 with the CPU
 *  slowed 4x. Fails on: anything that loops; the page drawing frames while nothing moves (an idle loop, the egg
 *  included); more than three glass surfaces on screen; any motion at all under reduced motion, or three.js loading
 *  there; a link straight into a room (`?desk=1#wants`, `#week`, `#settings`) that holds the dark case longer than a
 *  second; and, listed together at the end, `infinite` anywhere in the Desk's or the menu's CSS, a layer other than the
 *  hero's two that moves with the scroll, and any motion over CAP outside the opening and the named exceptions (DRAWS). Prints,
 *  for the reviewer and the notebook: frame pacing for the opening, a scroll and the menu opening; the long tasks; and
 *  every motion longer than CAP.
 *    node scripts/motion.ts --desk [url] [--trace dir]     a Chrome performance trace of each width goes to dir */
async function desk(): Promise<void> {
  const ti = process.argv.indexOf("--trace"), traceDir = ti > 0 ? process.argv[ti + 1] : undefined;
  const target = (process.argv.slice(2).find((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--trace") ?? "http://localhost:5173/").replace(/\/?$/, "/");
  // The full browser's new headless mode draws WebGL on the real GPU; the default headless shell uses a software GL
  // (SwiftShader) whose frame times say nothing about a phone or a laptop.
  const browser = await chromium.launch({ channel: "chromium" });
  const long: string[] = [], banned: string[] = [];
  // Nothing in the Desk's, the story's or the menu's CSS may loop (the gate's own runs never enter every state, such as
  // the mic's; this reads the source so no state is missed).
  const { readdirSync, readFileSync } = await import("node:fs");
  for (const dir of ["web/src/desk", "web/src/menu"]) {
    for (const f of readdirSync(resolve(dir), { recursive: true }) as string[]) {
      if (!f.endsWith(".css")) continue;
      readFileSync(resolve(dir, f), "utf8").split("\n").forEach((l, i) => { if (/\binfinite\b/.test(l) && !/^\s*(\/\*|\*)/.test(l)) banned.push(`${dir}/${f}:${i + 1} loops (infinite)`); });
    }
  }
  for (const [w, h, phone] of [[1440, 900, false], [390, 844, true]] as const) {
    const name = phone ? "390, CPU 4x" : "1440";
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: phone ? 3 : 1, isMobile: phone, hasTouch: phone });
    const page = await ctx.newPage();
    await page.addInitScript(instrumentDesk, OPENED_BEAT);
    const cdp = await ctx.newCDPSession(page);
    if (phone) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    if (traceDir) await browser.startTracing(page, { path: `${traceDir}/desk-${w}.json`, screenshots: false });
    const dk = <T>(f: string) => page.evaluate(`window.dk.${f}`) as Promise<T>;
    await page.goto(target, { waitUntil: "commit" });
    await page.waitForFunction(() => (window as unknown as { dk?: unknown }).dk).then(() => dk("start()"));
    // The opening: from the first paint until the page is still (it lands by ~1.4 s; the egg's WebGL waits for that).
    await page.waitForFunction(() => document.documentElement.classList.contains("dk-opened") || !document.documentElement.classList.contains("dk-opening"), undefined, { timeout: 15_000 });
    await page.waitForTimeout(phone ? 2500 : 1500);
    await dk("stop()");
    const opened = pace(await dk<number[]>("frames"));
    // The words first: the headline reads and the bar's contents are up early (WORDS), the egg and the line behind them.
    const words = await dk<DeskProbe["words"]>("words");
    const [titleBy, barBy] = phone ? [WORDS.phoneTitle, WORDS.phoneBar] : [WORDS.title, WORDS.bar];
    const titleAt = phone ? words.title9 : words.title5;
    if (!titleAt || titleAt > titleBy) fail(`${name}: the headline ${phone ? "is up" : "reads"} at ${titleAt ? titleAt.toFixed(0) : "never"} ms (by ${titleBy}: the words first)`);
    if (!words.bar9 || words.bar9 > barBy) fail(`${name}: the bar's contents are up at ${words.bar9 ? words.bar9.toFixed(0) : "never"} ms (by ${barBy}: the words first)`);
    // At rest: nothing may draw. A page that keeps asking for frames with nothing moving is a loop, seen or not.
    await page.mouse.move(w / 2, h / 2);
    await page.waitForTimeout(2500); // the egg's lean toward the cursor settles in about a second
    const before = await dk<number>("rafs");
    const running = await page.evaluate(async () => {
      let n = 0;
      for (let i = 0; i < 20; i++) { n = Math.max(n, document.getAnimations().filter((a) => a.playState === "running").length); await new Promise((r) => setTimeout(r, 100)); }
      return n;
    });
    const idle = (await dk<number>("rafs")) - before;
    if (running) fail(`${name}: ${running} animation(s) running on the still landing`);
    if (idle > 4) fail(`${name}: the page asked for ${idle} frames in 2 s with nothing moving (an idle loop)`);
    // Nothing decorative moves with the scroll (no parallax layers, no drifting grain): their transforms at the top and
    // most of a screen down must match.
    const layers = () => page.evaluate((ok) => [...document.querySelectorAll(".dk-grain, [data-depth]")].filter((e) => !e.matches(ok)).map((e) => `${String((e as HTMLElement).className).split(" ")[0]}|${getComputedStyle(e).transform}`), PARALLAX_OK);
    const top = await layers();
    await page.evaluate(() => scrollTo(0, innerHeight * 0.8));
    await page.waitForTimeout(400);
    const down = await layers();
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(400);
    top.forEach((t, i) => { if (down[i] !== t) banned.push(`${name}: ${t.split("|")[0]} moves with the scroll (parallax or drift)`); });
    // A scroll down the landing and back, as a thumb or a wheel does it.
    await dk("start()");
    for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 320); await page.waitForTimeout(90); }
    for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, -320); await page.waitForTimeout(90); }
    await page.waitForTimeout(600);
    await dk("stop()");
    const scrolled = pace(await dk<number[]>("frames"));
    // The menu: its glass opens; at most three glass surfaces are on screen. The bar (.gn) is chrome, not a glass object,
    // and doesn't count (brand.md 10.6).
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(300);
    await dk("start()");
    await page.getByRole("button", { name: /^(Everything Goose does|Menu)$/ }).first().click();
    await page.locator(".gm-panel").waitFor({ timeout: 10_000 });
    await page.waitForTimeout(700);
    await dk("stop()");
    const menu = pace(await dk<number[]>("frames"));
    const glass = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => {
      const s = getComputedStyle(e), r = e.getBoundingClientRect();
      return !e.closest(".gn") && s.backdropFilter && s.backdropFilter !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0 && r.width > 0 && r.bottom > 0 && r.top < innerHeight;
    }).map((e) => String((e as HTMLElement).className).split(" ")[0]));
    if (glass.length > 3) fail(`${name}: ${glass.length} glass surfaces on screen with the menu open (${glass.join(", ")}); the most is 3`);
    await page.keyboard.press("Escape");
    if (traceDir) await browser.stopTracing();
    // The whole landing, read down at a reader's pace, so both cinematic reveals (brand.md 10.7) play and are checked
    // below. Last, so the pacing above is measured as before.
    await page.waitForTimeout(400);
    for (;;) {
      const more = await page.evaluate(() => { const y = scrollY; scrollBy(0, innerHeight * 0.3); return scrollY > y; });
      await page.waitForTimeout(phone ? 260 : 160);
      if (!more) break;
    }
    await page.waitForTimeout(1500);
    const p = await page.evaluate(() => (window as unknown as { dk: DeskProbe }).dk);
    const loops = [...new Set(p.motions.filter((m) => !Number.isFinite(m.loops)).map((m) => m.what))];
    if (loops.length) fail(`${name}: looping motion (${loops.join(", ")})`);
    for (const m of p.motions) {
      const draw = m.what in DRAWS && m.delay === 0 && m.dur <= DRAWS[m.what]! + 20;
      if (m.ms > CAP) long.push(`${m.what} ${m.ms} ms${m.opening ? " (opening)" : draw ? " (named exception)" : ""}`);
      // The opening's one gold sheen is part of the opening even where a phone starts it after the glide (brand.md section 8).
      if (m.opening || / dk-sheen$/.test(m.what) || draw) continue;
      if (m.ms > CAP) banned.push(`${name}: ${m.what} ${m.ms} ms (the most is ${CAP})`);
    }
    // The cinematic pair (brand.md 10.7): each reveal played once, at --d-cine with no delay, as the reader reached it
    // (both blocks are below the fold at load at both widths); and the moment's track drew after the ticket landed (on
    // its transitionend), never alongside it on a timer.
    for (const k of ["ds-payoff", "ds-ticket"]) {
      const runs = p.motions.filter((m) => m.what === `${k} transform`);
      if (!p.cine[k]?.length || !runs.length) fail(`${name}: the ${k} reveal never played on a read down the landing`);
      if (p.cine[k]!.length > 1) fail(`${name}: the ${k} reveal played ${p.cine[k]!.length} times (once only): ${p.cine[k]!.join("; ")}`);
      if (runs.some((m) => m.delay !== 0 || Math.abs(m.dur - DRAWS[`${k} transform`]!) > 20)) fail(`${name}: the ${k} reveal ran ${runs[0]!.delay} + ${runs[0]!.dur} ms (--d-cine, no delay)`);
    }
    if (p.drawn.length !== 1) fail(`${name}: the moment's track drew ${p.drawn.length} times (once)`);
    if (p.rising.some((n) => n !== 0)) fail(`${name}: the track began to draw with the ticket still rising (${p.rising.join(", ")} of its transform transitions running; it draws on the ticket's transitionend)`);
    const tasks = p.long.length ? `${p.long.length} long task(s), longest ${Math.max(...p.long).toFixed(0)} ms` : "no long tasks";
    console.log(`ok  ${name}: still at rest (${idle} frames in 2 s, nothing running); glass with the menu open: ${glass.length} (${glass.join(", ")})`);
    console.log(`    words:   headline reads ${words.title5.toFixed(0)} ms, up ${words.title9.toFixed(0)} ms; the bar's contents up ${words.bar9.toFixed(0)} ms`);
    console.log(`    opening: ${fmt(opened)}\n    scroll:  ${fmt(scrolled)}\n    menu:    ${fmt(menu)}\n    ${tasks}`);
    console.log(`    cine:    the payoff and the ticket rose once each (900 ms, no delay); the track drew once, after the ticket landed`);
    await ctx.close();
  }
  // A link straight into a room (every menu link from the back room) never sits in the dark case: the opening belongs to
  // the landing's hero (Design Director crit #1: these took ~5.8 s, index.html's safety, against 0.3-0.9 s on /).
  for (const hash of ["#wants", "#week", "#settings"]) {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } }); // a fresh session: the opening is due
    const pg = await c.newPage();
    await pg.goto(`${target}?desk=1${hash}`, { waitUntil: "commit" });
    const dark = await pg.waitForFunction(() => !document.documentElement.classList.contains("dk-opening"), undefined, { timeout: 10_000, polling: 50 })
      .then(() => pg.evaluate(() => performance.now()));
    if (dark > 1500) fail(`?desk=1${hash}: the dark case held the room for ${dark.toFixed(0)} ms (the opening is the landing's only)`);
    console.log(`ok  ?desk=1${hash}: the room is up at ${dark.toFixed(0)} ms, no opening`);
    await c.close();
  }
  // Reduced motion: no opening, no motion, and three.js never loads.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.addInitScript(instrumentDesk, OPENED_BEAT);
  const three: string[] = [];
  page.on("request", (r) => { if (/eggThree/.test(r.url())) three.push(r.url()); });
  await page.goto(target, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /^(Everything Goose does|Menu)$/ }).first().click();
  await page.waitForTimeout(500);
  const rp = await page.evaluate(() => (window as unknown as { dk: DeskProbe }).dk);
  const moved = rp.motions.filter((m) => m.ms > 0);
  if (moved.length) fail(`reduced: motion played anyway (${[...new Set(moved.map((m) => m.what))].slice(0, 6).join(", ")})`);
  if (three.length) fail("reduced: the live egg (three.js) loaded");
  if (await page.evaluate(() => document.documentElement.classList.contains("dk-opening"))) fail("reduced: the opening played");
  console.log("ok  reduced: no opening, no motion, no three.js");
  // brand.md 10.7's fail-safes, each gated (a happy-path gate can't catch a block left invisible): under reduced motion,
  // in print (the CSS alone, no beforeprint), and on beforeprint (the script, on screen), both cinematic blocks are
  // final (opacity 1, no transform, nothing in flight) and the ticket's track is drawn with its dot.
  const finalState = () => {
    const bad: string[] = [];
    for (const c of ["ds-payoff", "ds-ticket"]) {
      const e = document.querySelector(`.${c}`), s = e && getComputedStyle(e);
      if (!e || !s) { bad.push(`${c} missing`); continue; }
      if (s.opacity !== "1" || s.transform !== "none" || e.getAnimations().length) bad.push(`${c} opacity ${s.opacity}, transform ${s.transform}, ${e.getAnimations().length} running`);
    }
    const line = document.querySelector(".ds-track-line"), dot = document.querySelector(".ds-track-dot");
    if (!line || /100%/.test(getComputedStyle(line).clipPath)) bad.push(`the track is not drawn (${line && getComputedStyle(line).clipPath})`);
    if (!dot || getComputedStyle(dot).opacity !== "1") bad.push("the track's dot is hidden");
    return bad;
  };
  await page.locator(".ds-ticket").waitFor({ state: "attached" });
  const rm = await page.evaluate(finalState);
  if (rm.length) fail(`reduced: a cinematic block isn't final: ${rm.join("; ")}`);
  await ctx.close();
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await c.addInitScript(() => sessionStorage.setItem("gg-opened", "1"));
    const pg = await c.newPage();
    await pg.goto(target, { waitUntil: "load" });
    await pg.locator(".ds-ticket").waitFor({ state: "attached" });
    await pg.waitForTimeout(300);
    if (!(await pg.evaluate(() => getComputedStyle(document.querySelector(".ds-ticket")!).opacity === "0"))) fail("print: the ticket wasn't hidden below the fold to begin with (the check would prove nothing)");
    await pg.emulateMedia({ media: "print" });
    const css = await pg.evaluate(finalState);
    if (css.length) fail(`print (CSS, no beforeprint): ${css.join("; ")}`);
    await pg.emulateMedia({ media: "screen" });
    await pg.evaluate(() => dispatchEvent(new Event("beforeprint")));
    const js = await pg.evaluate(finalState);
    if (js.length) fail(`beforeprint (on screen): ${js.join("; ")}`);
    await c.close();
  }
  console.log("ok  fail-safes: reduced motion, print and beforeprint each show the payoff and the ticket final, the track drawn");
  await browser.close();
  const slow = [...new Set(long)];
  if (slow.length) console.log(`longer than ${CAP} ms (allowed for the opening and the named exceptions only; brand.md section 7 and 10.7):\n  ${slow.join("\n  ")}`);
  const off = [...new Set(banned)];
  if (off.length) fail(`${off.length} break(s) of brand.md's motion rules:\n  ${off.join("\n  ")}`);
  console.log("MOTION DESK PASS");
}

const browser = await chromium.launch();
for (const reduced of [false, true]) {
  const name = reduced ? "reduced" : "motion";
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  await page.addInitScript(instrument);
  await fakeControl(page);
  await page.goto(url, { waitUntil: "load" });
  const cls = await page.evaluate(() => document.documentElement.classList.contains("motion"));
  if (cls === reduced) fail(`${name}: the motion class is ${cls ? "on" : "off"}`);
  await still(page, `${name} empty page`);

  // The judge: the $500 note, and the $60 sampled while both cards answer.
  await page.getByRole("button", { name: /SYSTEM: \$500/ }).click();
  const amt = page.locator('[data-card="guard-on"] .amt');
  const before = await amt.evaluate((e) => e.firstChild?.textContent);
  const seen = new Set<string | null | undefined>();
  await page.getByRole("button", { name: "Send to Goose" }).click();
  for (let i = 0; i < 30; i++) { seen.add(await amt.evaluate((e) => e.firstChild?.textContent)); await page.waitForTimeout(50); }
  if (seen.size !== 1 || !seen.has(before)) fail(`${name}: the guard-on max changed while the cards moved (${[...seen].join(" → ")})`);
  if (await amt.evaluate((e) => e.getAnimations().length)) fail(`${name}: the guard-on max is animated`);
  await page.locator('[data-card="guard-off"][data-state="landed"]').waitFor({ timeout: 10_000 });
  let p = await probe(page);
  const card = p.landed - (p.reply.control ?? Infinity), ring = p.ring - (p.reply.judge ?? Infinity);
  if (!(card >= 0 && card < WITHIN)) fail(`${name}: the guard-off card landed ${card.toFixed(0)} ms after the control reply`);
  if (!(ring >= 0 && ring < WITHIN)) fail(`${name}: the check drew ${ring.toFixed(0)} ms after the guard's reply`);
  console.log(`ok  ${name} judge: card lands ${card.toFixed(0)} ms after the reply, check ${ring.toFixed(0)} ms, $60 unchanged`);

  const judged = p.started, judgedSlowest = p.slowest;
  // A recorded run, paced by its recorded waits: every pill and bar position follows its own ledger message.
  await page.goto(url + "?seed=1", { waitUntil: "load" });
  await page.getByRole("button", { name: "Go find it" }).click();
  await page.getByText(/^(Replay market #\d+|Run market #\d+ again)$/).waitFor({ timeout: 90_000 });
  p = await probe(page);
  const late = Object.entries(p.mark).map(([k, t]) => [k, t - (p.msg[Number(k.split(":")[1])] ?? NaN)] as const).filter(([, d]) => Number.isFinite(d));
  if (late.length < 4) fail(`${name}: only ${late.length} marks matched a ledger message`);
  const worst = late.reduce((a, b) => (b[1] > a[1] ? b : a));
  if (worst[1] > WITHIN || late.some(([, d]) => d < 0)) fail(`${name}: ${worst[0]} moved ${worst[1].toFixed(0)} ms after its row`);
  console.log(`ok  ${name} run: ${late.length} pill/bar moves, worst ${worst[1].toFixed(0)} ms after its row (${worst[0]})`);
  await still(page, `${name} finished run`);

  p.started.push(...judged);
  const kinds = new Set(p.started.map((s) => s.split(":")[0]!.split(" ")[0]));
  if (reduced && p.started.length) fail(`reduced: motion played anyway (${[...new Set(p.started)].slice(0, 5).join(", ")})`);
  if (!reduced) for (const k of ["pill", "fill", "card"]) if (!kinds.has(k)) fail(`motion: no ${k} motion played (saw ${[...kinds].join(", ")})`);
  if (!reduced && !p.started.some((s) => s.endsWith(":draw"))) fail("motion: the check never drew");
  const slowest = Math.max(p.slowest, judgedSlowest);
  if (slowest > 400) fail(`${name}: a motion takes ${slowest} ms including its delay (at most 400)`);
  console.log(`ok  ${name}: ${reduced ? "no class, nothing played" : `played on ${[...kinds].join(", ")}`}`);
  await ctx.close();
}
await browser.close();
console.log("MOTION PASS");

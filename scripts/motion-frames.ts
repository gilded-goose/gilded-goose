/// <reference lib="dom" />
// Each motion as a strip of frames, so a reviewer who only sees stills (guild-visual) can judge it (Joshua,
// 2026-10-23). The moment a motion starts, every running animation is paused and the live feed is held; the
// animation clock is then stepped through fixed times and a frame taken at each, so the frames are exact, not a
// lucky screenshot. Then the feed is let go and the next motion is awaited.
//
// Motions: the check drawing and the guard-off card landing (a send, the control reply answered here so no sandbox
// order is made), and on a recorded run (week 1): a pill appearing, a pill moving, QuickQuack's red pill appearing,
// and the agent's bar growing. Spends nothing.
//
//   node scripts/motion-frames.ts [url]     default http://localhost:5173
//   writes docs/screens/motion-{desktop,phone}-<motion>.png

import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { chromium, type Page } from "playwright";

const url = (process.argv[2] ?? "http://localhost:5173/").replace(/\/?$/, "/");
const OUT = "docs/screens";
const TIMES = [0, 50, 100, 150, 200, 250, 300, 400];
function fail(m: string): never { console.error(`FRAMES FAIL: ${m}`); process.exit(1); }

/** In the page, before the app: hold the feed on demand, and pause everything when an armed motion starts. */
function instrument() {
  const w = window as unknown as Record<string, unknown>;
  const held: Array<() => void> = [];
  w.__hold = false; w.__caught = null; w.__armed = [] as string[];
  w.__release = () => { w.__hold = false; for (const a of document.getAnimations()) a.play(); held.splice(0).forEach((f) => f()); };
  const add = EventSource.prototype.addEventListener;
  EventSource.prototype.addEventListener = function (this: EventSource, type: string, fn: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) {
    // While a motion is being filmed, rows wait here and arrive in order once it's let go.
    add.call(this, type, (e: Event) => { const go = () => (typeof fn === "function" ? fn.call(this, e) : fn.handleEvent(e)); if (w.__hold) held.push(go); else go(); }, o);
  } as typeof add;
  const which = (e: Event): string | null => {
    const t = e.target as Element;
    const name = (e as AnimationEvent).animationName, prop = (e as TransitionEvent).propertyName;
    if (name === "draw") return "check-draws";
    if (name === "land") return "card-lands";
    if (!t.matches?.(".pill, .fill")) return null;
    if (t.matches(".fill") && prop === "width") return "bar-grows";
    // The flag row lands right after QuickQuack's first offer, so its pill is born red: filmed as it appears.
    if (t.matches(".pill.flag") && (prop === "opacity" || prop === "border-color")) return "flag-appears";
    if (t.matches(".pill") && prop === "opacity") return "pill-appears";
    if (t.matches(".pill") && prop === "left") return "pill-moves";
    return null;
  };
  for (const ev of ["animationstart", "transitionrun"]) {
    addEventListener(ev, (e) => {
      const m = which(e);
      const armed = w.__armed as string[];
      if (!m || w.__caught || !armed.includes(m)) return;
      armed.splice(armed.indexOf(m), 1);
      w.__hold = true; w.__caught = m;
      for (const a of document.getAnimations()) a.pause();
    }, true);
  }
}

async function film(page: Page, size: string, region: string, until: () => Promise<boolean>) {
  const got: string[] = [];
  while (true) {
    const caught = await page.waitForFunction(() => (window as unknown as { __caught: string | null }).__caught, null, { timeout: 30_000 }).then((h) => h.jsonValue() as Promise<string>).catch(() => null);
    if (!caught) break;
    const frames: string[] = [];
    for (const t of TIMES) {
      await page.evaluate((t) => { for (const a of document.getAnimations()) if (a.playState === "paused") a.currentTime = Math.min(t, Number(a.effect?.getComputedTiming().endTime ?? t)); }, t);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const box = await page.locator(region).first().boundingBox();
      if (!box) fail(`${size} ${caught}: no ${region} on screen`);
      const file = `${OUT}/.frame-${frames.length}.png`;
      await page.screenshot({ path: file, clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: Math.min(box.width + 16, page.viewportSize()!.width), height: Math.min(box.height + 16, 700) } });
      frames.push(file);
    }
    await strip(page, `${size}-${caught}`, frames);
    got.push(caught);
    await page.evaluate(() => { const w = window as unknown as { __caught: unknown; __release: () => void }; w.__caught = null; w.__release(); });
    if (await until()) break;
  }
  return got;
}

/** The frames side by side (two rows of four), each under its time, into one image. */
async function strip(page: Page, name: string, frames: string[]) {
  const imgs = frames.map((f) => `data:image/png;base64,${readFileSync(f).toString("base64")}`);
  const p = await page.context().browser()!.newPage({ viewport: { width: 1600, height: 400 }, deviceScaleFactor: 1 });
  await p.setContent(`<body style="margin:0;padding:16px;font:600 15px system-ui;background:#fff;display:grid;grid-template-columns:repeat(4,1fr);gap:14px">${imgs.map((src, i) => `<figure style="margin:0"><figcaption style="margin-bottom:4px">${TIMES[i]} ms</figcaption><img src="${src}" style="width:100%;border:1px solid #ddd"></figure>`).join("")}</body>`);
  await p.screenshot({ path: `${OUT}/motion-${name}.png`, fullPage: true });
  await p.close();
  for (const f of frames) rmSync(f);
  console.log(`ok  ${OUT}/motion-${name}.png`);
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const [size, viewport] of [["desktop", { width: 1280, height: 800 }], ["phone", { width: 390, height: 844 }]] as const) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  await page.addInitScript(instrument);
  // The control reply comes a beat after the guard's, so the two motions are filmed one at a time.
  await page.route("**/api/control", async (r) => {
    if (r.request().method() !== "POST") return r.fallback();
    await new Promise((ok) => setTimeout(ok, 900));
    await r.fulfill({ json: { state: "landed", orderId: "FRAMES-TEST", status: "CREATED", amount: "500.00", currency: "USD", at: new Date().toISOString(), left: 2, fake: true } });
  });
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => { (window as unknown as { __armed: string[] }).__armed.push("check-draws", "card-lands"); });
  await page.locator(".pair").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Send to Goose" }).click();
  const judged = await film(page, size, ".pair", async () => (await page.evaluate(() => (window as unknown as { __armed: string[] }).__armed.length)) === 0);

  // Two passes over the same recorded run: QuickQuack's red pill can appear in the same frame as another pill, and
  // only one motion is filmed at a time, so it gets a pass of its own.
  const ran: string[] = [];
  for (const armed of [["flag-appears"], ["pill-appears", "pill-moves", "bar-grows"]]) {
    await page.goto(url + "?seed=1", { waitUntil: "load" });
    await page.evaluate((a) => { (window as unknown as { __armed: string[] }).__armed.push(...a); }, armed);
    await page.getByRole("button", { name: "Go find it" }).click();
    await page.locator(".lanes").waitFor();
    await page.locator(".lanes").scrollIntoViewIfNeeded();
    ran.push(...await film(page, size, ".lanes", async () => (await page.evaluate(() => (window as unknown as { __armed: string[] }).__armed.length)) === 0));
  }
  const all = [...judged, ...ran];
  for (const m of ["check-draws", "card-lands", "pill-appears", "pill-moves", "flag-appears", "bar-grows"]) if (!all.includes(m)) fail(`${size}: never caught ${m} (caught ${all.join(", ")})`);
  await ctx.close();
}
await browser.close();
console.log("FRAMES PASS");

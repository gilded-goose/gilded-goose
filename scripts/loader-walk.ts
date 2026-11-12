/// <reference lib="dom" />
// The walking goose (the white site's loader, Nov 11), in a real browser against a built site and a PAYMENT=fake server,
// at a phone's and a desktop's width. It proves what the loader is allowed to be:
//   1. a deep link shows the splash goose, then the goose loader (role="status", "Loading", the goose hidden from a screen
//      reader and walking), then the page, and the loader is gone the moment the page is there: nothing is left running;
//   2. the splash and the loader are the header's own drawing: one goose file, asked for once, and no egg for the splash;
//   3. the loader's art stands in the box the loading egg had (76.8 px), and the walk moves `transform` only;
//   4. under reduced motion the goose stands: no animation on the splash, the loader or the Shop's wait;
//   5. the Shop's asking phase shows the goose beside "Finding sellers…" (the status, its role and aria-busy unchanged, the
//      row no taller than the words), and it is gone when the sellers arrive;
//   6. a chunk that never arrives still says "This page didn't load" once, with no goose left walking and no retry loop;
//   7. zero console errors and zero page errors; the deep link's layout shift is held under 0.1, and the Shop's, from Send
//      Goose to the sellers, is no worse with the goose than the same steps with the goose taken out (the status alone).
//
//   node scripts/loader-walk.ts [url]   default http://localhost:8787 (PAYMENT=fake, WEB_URL set to the same origin)

import "./route-closed.ts"; // a route mid-request when its page closes ends quietly, nothing else does
import { chromium, type BrowserContext, type Page } from "playwright";
import { localOnly } from "./not-live.ts";

const url = localOnly((process.argv[2] ?? "http://localhost:8787/").replace(/\/?$/, "/"));
function fail(m: string): never { console.error(`LOADER FAIL: ${m}`); process.exit(1); }

const health = await fetch(`${url}api/health`).then((r) => r.json() as Promise<{ payment?: string }>).catch(() => null);
if (health?.payment !== "fake") fail(`${url} isn't a PAYMENT=fake server (payment: ${health?.payment ?? "no answer"})`);

const GOOSE = /\/site\/goose-(96|192)\.webp$/;
const SHIFT_LINE = 0.1;
const SHIFT_SLACK = 0.005; // the same steps twice differ by a rounding of a frame, never by a row
const HOLD = 700; // each script arrives this late, so the splash and the loader are on screen long enough to read

const browser = await chromium.launch();
const open = async (w: number, h: number, motion: "no-preference" | "reduce") => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: motion, ...(w < 768 ? { hasTouch: true, isMobile: true } : {}) });
  const page = await ctx.newPage();
  const errors: string[] = [];
  const images: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("request", (r) => { if (r.resourceType() === "image") images.push(new URL(r.url()).pathname); });
  // Every layout shift, a user's own tap included: the walk reads the sum between two marks.
  await page.addInitScript(() => {
    const w = window as unknown as { __shift: number };
    w.__shift = 0;
    new PerformanceObserver((list) => { for (const e of list.getEntries()) w.__shift += (e as unknown as { value: number }).value; }).observe({ type: "layout-shift", buffered: true });
  });
  return { ctx, page, errors, images };
};
const shift = (page: Page) => page.evaluate(() => (window as unknown as { __shift: number }).__shift);
const late = (ctx: BrowserContext, what: RegExp, ms = HOLD) => ctx.route(what, async (route) => { await new Promise((r) => setTimeout(r, ms)); await route.continue(); });
/** What the goose in `sel` is doing: its animation, what that animation moves, and how a screen reader meets it. */
const goose = (page: Page, sel: string) => page.evaluate((s) => {
  const img = document.querySelector<HTMLImageElement>(s);
  if (!img) return null;
  const moved = img.getAnimations().flatMap((a) => (a.effect as KeyframeEffect).getKeyframes().flatMap((k) => Object.keys(k))).filter((k) => !["offset", "computedOffset", "easing", "composite"].includes(k));
  return { name: getComputedStyle(img).animationName, running: img.getAnimations().length, moved: [...new Set(moved)], hidden: img.getAttribute("aria-hidden"), alt: img.getAttribute("alt"), src: img.currentSrc ? new URL(img.currentSrc).pathname : "", height: parseFloat(getComputedStyle(img).height) };
}, sel);
const walking = (page: Page) => page.evaluate(() => document.getAnimations().filter((a) => /gz-walk|boot-walk/.test((a as CSSAnimation).animationName ?? "")).length);

for (const [w, h] of [[390, 844], [1440, 900]] as const) {
  // 1, 2, 3: a deep link, motion allowed.
  {
    const { ctx, page, errors, images } = await open(w, h, "no-preference");
    await late(ctx, /\/assets\/[^/]+\.js$/);
    await page.goto(`${url}goose.html#/proof`, { waitUntil: "commit" });
    try { await page.locator(".boot img").waitFor({ timeout: 10_000 }); } catch { fail(`${w}: a deep link shows no splash`); }
    const splash = await goose(page, ".boot img") ?? fail(`${w}: the splash has no picture`);
    if (!GOOSE.test(splash.src)) fail(`${w}: the splash draws ${splash.src}, not the goose`);
    if (splash.name !== "boot-walk" || splash.running !== 1) fail(`${w}: the splash goose isn't walking (animation ${splash.name}, ${splash.running} running)`);
    if (splash.moved.join() !== "transform") fail(`${w}: the splash's walk moves ${splash.moved.join(", ")}, not transform alone`);
    const eggs = images.filter((p) => /egg/.test(p));
    if (eggs.length) fail(`${w}: the splash asked for ${eggs.join(", ")}`);

    try { await page.locator(".gz-load").waitFor({ timeout: 20_000 }); } catch { fail(`${w}: a deep link to Proof never shows the goose loader`); }
    const loader = page.locator(".gz-load");
    if ((await loader.getAttribute("role")) !== "status") fail(`${w}: the loader isn't role="status"`);
    if ((await loader.innerText()).trim() !== "Loading") fail(`${w}: the loader says "${(await loader.innerText()).trim()}", not "Loading"`);
    if (!(await page.getByRole("status").filter({ hasText: /^Loading$/ }).count())) fail(`${w}: no status a screen reader can find says Loading`);
    const walk = await goose(page, ".gz-load img") ?? fail(`${w}: the loader has no goose`);
    if (walk.name !== "gz-walk" || walk.running !== 1) fail(`${w}: the loader's goose isn't walking (animation ${walk.name}, ${walk.running} running)`);
    if (walk.moved.join() !== "transform") fail(`${w}: the walk moves ${walk.moved.join(", ")}, not transform alone`);
    if (walk.hidden !== "true" || walk.alt !== "") fail(`${w}: the loader's goose isn't hidden from a screen reader (aria-hidden ${walk.hidden}, alt "${walk.alt}")`);
    if (Math.abs(walk.height - 76.8) > 0.5) fail(`${w}: the loader's goose is ${walk.height} px tall, not the 76.8 px box the egg had`);
    const mark = await goose(page, ".wordmark img") ?? fail(`${w}: the header has no goose`);
    if (walk.src !== mark.src || splash.src !== mark.src) fail(`${w}: the splash (${splash.src}) and the loader (${walk.src}) aren't the header's drawing (${mark.src})`);
    if (mark.running || mark.hidden !== null) fail(`${w}: the header's goose changed (animations ${mark.running}, aria-hidden ${mark.hidden})`);

    try { await page.locator("#main h1").first().waitFor({ timeout: 20_000 }); } catch { fail(`${w}: Proof never arrived after the loader`); }
    if (await page.locator(".gz-load").count()) fail(`${w}: the loader is still there once the page is`);
    if (await page.locator(".gz-walk").count() || await walking(page)) fail(`${w}: a goose is still walking once the page is there`);
    await page.waitForTimeout(800);
    const geese = images.filter((p) => GOOSE.test(p));
    if (geese.length !== 1) fail(`${w}: the goose was asked for ${geese.length} times (${geese.join(", ")}), not once`);
    const s = await shift(page);
    if (s > SHIFT_LINE) fail(`${w}: the deep link's layout shift is ${s.toFixed(4)}, over ${SHIFT_LINE}`);
    if (errors.length) fail(`${w}: ${errors.length} error(s) on the deep link: ${errors.slice(0, 3).join(" | ")}`);
    console.log(`ok  ${w}: #/proof shows the splash goose, the goose loader (status "Loading", walking, transform only, ${walk.height} px), then Proof; 1 goose file (${geese[0]}), no egg for the splash, layout shift ${s.toFixed(4)}, 0 errors`);
    await ctx.close();
  }

  // 4: reduced motion, the same deep link: the goose stands.
  {
    const { ctx, page, errors } = await open(w, h, "reduce");
    await late(ctx, /\/assets\/[^/]+\.js$/);
    await page.goto(`${url}goose.html#/proof`, { waitUntil: "commit" });
    await page.locator(".boot img").waitFor({ timeout: 10_000 });
    const splash = await goose(page, ".boot img") ?? fail(`${w}, reduced motion: no splash`);
    if (splash.name !== "none" || splash.running) fail(`${w}, reduced motion: the splash goose moves (animation ${splash.name})`);
    try { await page.locator(".gz-load").waitFor({ timeout: 20_000 }); } catch { fail(`${w}, reduced motion: no goose loader`); }
    const still = await goose(page, ".gz-load img") ?? fail(`${w}, reduced motion: the loader has no goose`);
    if (still.name !== "none" || still.running || await walking(page)) fail(`${w}, reduced motion: the loader's goose moves (animation ${still.name}, ${still.running} running)`);
    if (Math.abs(still.height - 76.8) > 0.5) fail(`${w}, reduced motion: the standing goose is ${still.height} px tall`);
    await page.locator("#main h1").first().waitFor({ timeout: 20_000 });
    if (errors.length) fail(`${w}, reduced motion: ${errors.length} error(s): ${errors.slice(0, 3).join(" | ")}`);
    console.log(`ok  ${w}, reduced motion: the splash and the loader show a standing goose, 0 animations`);
    await ctx.close();
  }

  // 5: the Shop's asking phase: first with the goose taken out (the status alone, as it was), then motion allowed, then reduced.
  let alone = 0;
  for (const run of ["bare", "no-preference", "reduce"] as const) {
    const motion = run === "bare" ? "no-preference" : run;
    const { ctx, page, errors } = await open(w, h, motion);
    await page.goto(`${url}goose.html#/shop`);
    try { await page.getByRole("button", { name: /^Shop for this/ }).waitFor({ timeout: 20_000 }); } catch { fail(`${w}: the Shop's Ask never showed`); }
    await page.locator("input.ask-input").fill("A kettle under $55");
    await page.keyboard.press("Enter");
    const send = page.getByRole("button", { name: /^Send Goose/ });
    await send.waitFor({ timeout: 20_000 });
    if (await page.locator(".step-wait, .gz-walk").count()) fail(`${w}: a goose walks on the brief before anything is loading`);
    // The sellers' answer comes 1.2 s late, so the asking phase is on screen long enough to read.
    await late(ctx, /\/api\/(?!health)/, 1200);
    if (run === "bare") await page.addStyleTag({ content: ".step-wait .gz-mark{display:none}" });
    const before = await shift(page);
    await send.click();
    const wait = page.locator(".step-wait");
    try { await wait.waitFor({ timeout: 10_000 }); } catch { fail(`${w}: the asking phase shows no goose`); }
    const status = wait.locator("p.step-status");
    const said = { text: await status.textContent(), role: await status.getAttribute("role"), busy: await status.getAttribute("aria-busy") };
    if (said.text !== "Finding sellers…" || said.role !== "status" || said.busy !== "true") fail(`${w}: the status changed: "${said.text}", role ${said.role}, aria-busy ${said.busy}`);
    if ((await page.getByRole("status").filter({ hasText: /^Finding sellers…$/ }).count()) !== 1) fail(`${w}: a screen reader doesn't find one "Finding sellers…" status`);
    const g = await goose(page, ".step-wait img") ?? fail(`${w}: the wait has no goose`);
    if (run === "bare") { g.name = "gz-walk"; g.running = 1; g.moved = ["transform"]; } // not drawn, so not judged: this run is the measure
    if (g.hidden !== "true" || g.alt !== "") fail(`${w}: the wait's goose isn't hidden from a screen reader`);
    if (motion === "reduce" ? g.name !== "none" || g.running > 0 : g.name !== "gz-walk" || g.running !== 1 || g.moved.join() !== "transform") fail(`${w}, ${motion}: the wait's goose has animation ${g.name}, ${g.running} running, moving ${g.moved.join(", ")}`);
    const rows = await page.evaluate(() => ({ row: document.querySelector(".step-wait")!.getBoundingClientRect().height, words: document.querySelector(".step-wait .step-status")!.getBoundingClientRect().height }));
    if (Math.abs(rows.row - rows.words) > 0.5) fail(`${w}: the wait's row is ${rows.row} px tall, the words alone ${rows.words} px: the goose adds height`);
    try { await page.getByRole("button", { name: "Review and approve" }).first().waitFor({ timeout: 30_000 }); } catch { fail(`${w}: the sellers never arrived`); }
    if (await page.locator(".step-wait").count() || await page.locator(".gz-walk").count() || await walking(page)) fail(`${w}: the goose is still there after the sellers arrived`);
    if (await page.getByText("Finding sellers…").count()) fail(`${w}: "Finding sellers…" is still there after the sellers arrived`);
    const s = (await shift(page)) - before;
    if (errors.length) fail(`${w}: ${errors.length} error(s) on Shop: ${errors.slice(0, 3).join(" | ")}`);
    if (run === "bare") { alone = s; await ctx.close(); continue; }
    if (s > alone + SHIFT_SLACK) fail(`${w}, ${motion}: the layout shift from Send Goose to the sellers is ${s.toFixed(4)} with the goose, ${alone.toFixed(4)} with the status alone`);
    console.log(`ok  ${w}, ${motion === "reduce" ? "reduced motion" : "motion"}: asking shows the goose ${motion === "reduce" ? "standing" : "walking"} beside "Finding sellers…" (status, aria-busy, row ${rows.row} px = the words' ${rows.words} px), gone when the sellers arrive; layout shift ${s.toFixed(4)} (the status alone: ${alone.toFixed(4)}), 0 errors`);
    await ctx.close();
  }
}

// 6: a chunk that never arrives: the existing words, once, and no goose left walking.
{
  const { ctx, page } = await open(390, 844, "no-preference");
  let asked = 0;
  await ctx.route(/\/assets\/Proof-[\w-]+\.js$/, (route) => { asked++; return route.abort(); });
  await page.goto(`${url}goose.html#/proof`);
  try { await page.getByRole("alert").filter({ hasText: "This page didn't load" }).waitFor({ timeout: 20_000 }); } catch { fail("a lost chunk doesn't say This page didn't load"); }
  await page.waitForTimeout(1200);
  if ((await page.getByText("This page didn't load").count()) !== 1) fail("the lost-page message isn't shown exactly once");
  if (!(await page.getByText("Your connection may have dropped. Nothing was paid. Reload to try again.").count())) fail("the lost-page words changed");
  // Asked for twice before and after this change: the build's own preload of the chunk, then the import. No loop: it stays at that.
  if (asked > 2) fail(`the lost chunk was asked for ${asked} times: a loop`);
  if (await page.locator(".gz-load").count() || await walking(page)) fail("a goose keeps walking beside the lost-page message");
  console.log(`ok  a lost chunk: "This page didn't load" once, the chunk asked for ${asked} time(s) and no more, no goose left walking`);
  await ctx.close();
}

await browser.close();
console.log("LOADER OK: the goose walks only while something loads, stands under reduced motion, and leaves when the page arrives");

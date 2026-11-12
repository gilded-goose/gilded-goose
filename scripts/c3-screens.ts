/// <reference lib="dom" />
// Track C3: the "Real prices right now" panel in a real browser, at 1440 and 390, after a full Desk run ("A kettle under
// $60"). Three states:
//   real      the server's own answer, as shipped since Nov 5 (the real recording): the panel shows, labeled recorded.
//             Pass a third argument (an ask, default "A kettle under $60") to walk a query that holds a flag.
//   live      a LAYOUT SAMPLE served by this script for /api/prices (source "channel3", .example stores, made-up names):
//             the panel shows its live heading, the time, three items, the label, and no button or image.
//   recorded  the same sample as source "recorded": the heading and line say "recorded" with the date, never "right now".
// The sample exists only in this script and its screenshots (docs/video/track-c3/, gitignored); it is never served by
// the app. Each shot checks its state before it is saved, and that nothing runs off the side (scripts/overflow.ts).
//
//   node scripts/c3-screens.ts [url]   default http://localhost:8839 (a server serving web/dist, PAYMENT=fake)

import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { overflow } from "./overflow.ts";

const url = (process.argv[2] ?? "http://localhost:8839/").replace(/\/?$/, "/");
const OUT = "docs/video/track-c3";
const LABEL = "Reference prices from Channel3 (real stores). Goose shops only the simulated sellers, in the PayPal sandbox.";
function fail(m: string): never { console.error(`C3 SCREENS FAIL: ${m}`); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const AT = new Date(Date.now() - 12 * 60 * 1000).toISOString();
const SAMPLE = [
  { name: "Layout sample: stainless steel electric kettle, 1.7 litre, auto shut-off", store: "store-one.example", price: "34.99", url: "https://store-one.example/kettle" },
  { name: "Layout sample: glass electric kettle with tea infuser", store: "store-two.example", price: "29.95", url: "https://store-two.example/k" },
  { name: "Layout sample: kettle", store: "store-three.example", price: "59.00", url: "https://store-three.example/g" },
];
const ANSWER = {
  live: { source: "channel3", fetchedAt: AT, query: "electric kettle", items: SAMPLE },
  recorded: { source: "recorded", fetchedAt: "2026-10-31T21:10:00.000Z", query: "electric kettle", items: SAMPLE },
} as const;

async function run(page: Page, state: "real" | "live" | "recorded") {
  if (state !== "real") await page.route("**/api/prices?*", (r) => r.fulfill({ json: ANSWER[state] }));
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.getByLabel("Ask for anything").fill(process.argv[3] ?? "A kettle under $60");
  await page.getByLabel("Ask Goose").click();
  await page.getByRole("button", { name: /Shop for this/ }).click();
  await page.getByText(/^Checked \d+ listings?\./).waitFor({ timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  const panel = page.locator("section.c3");
  {
    try { await panel.waitFor({ timeout: 10_000 }); } catch { fail(`${state}: the panel never showed`); }
    const text = await panel.innerText();
    if (!text.includes(LABEL)) fail(`${state}: the label isn't on the panel`);
    const head = await panel.locator("h3").innerText();
    if (state === "live" && !/real prices right now/i.test(head)) fail(`live: heading is "${head}"`);
    if (state !== "live" && (!/recorded/i.test(head) || /right now/i.test(head) || !/not live/.test(text))) fail(`recorded: heading "${head}" doesn't say recorded`);
    if (state === "live" && !/^Live · checked today, \d{1,2}:\d{2} [AP]M$/.test(await panel.locator(".c3-when").innerText())) fail("live: the time doesn't say today");
    if (await panel.locator("li.c3-it").count() !== 3) fail(`${state}: not three items`);
    if (state === "real") console.log(`c3 screens: real panel says: ${text.replace(/\s+/g, " ").slice(0, 700)}`);
    // Side by side, the three prices read as one line whatever their titles wrap to (DD nit: fixed rows).
    if ((page.viewportSize()?.width ?? 0) > 720) {
      const tops = await panel.locator(".c3-it .c3-price").evaluateAll((ps) => ps.map((p) => Math.round(p.getBoundingClientRect().top)));
      if (Math.max(...tops) - Math.min(...tops) > 1) fail(`${state}: prices at different heights (${tops.join(", ")})`);
    }
    if (await panel.locator("a, button, img, svg, form, input").count()) fail(`${state}: a link, button, image or form in the panel`);
    const spill = await panel.evaluate((p) => {
      const box = p.getBoundingClientRect();
      return [...p.querySelectorAll("*")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 1 && (r.right > box.right + 0.5 || r.left < box.left - 0.5 || (e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1)); }).map((e) => e.className);
    });
    if (spill.length) fail(`${state}: spills inside the panel: ${spill.join(", ")}`);
    // The panel is not in the deal card or the sellers' list.
    if (await page.locator(".dk-feed .c3, .dk-right .c3").count()) fail(`${state}: the panel sits inside the sellers or the deal`);
    if (await page.locator(".dk-feed, .dk-right").filter({ hasText: /store-(one|two|three)\.example|Layout sample/ }).count()) fail(`${state}: a reference item reached the sellers or the deal`);
  }
  // This track's own surface: the page never scrolls sideways and nothing in the panel spills. Lines about the Desk's
  // own boxes (the deal card's 2px <details>, Track S1's) are printed, not failed here.
  const off = await overflow(page);
  const mine = off.filter((l) => /scrolls sideways|\.c3|"Layout sample|store-(one|two|three)/.test(l));
  if (mine.length) fail(`${state}: runs off the side: ${JSON.stringify(mine).slice(0, 300)}`);
  if (off.length > mine.length) console.log(`c3 screens: ${state}: (not this track's) ${off.filter((l) => !mine.includes(l)).join(" | ").slice(0, 200)}`);
  if (errors.length) fail(`${state}: console errors: ${errors.join(" | ").slice(0, 300)}`);
}

const browser = await chromium.launch();
try {
  // The landing's section, with no run and no POST: the label, the date, the flag, and nothing of it on the first screen.
  for (const [size, viewport] of [["1440", { width: 1440, height: 900 }], ["390", { width: 390, height: 844 }]] as const) {
    const ctx = await browser.newContext({ viewport, reducedMotion: "reduce", deviceScaleFactor: size === "390" ? 2 : 1, ...(size === "390" ? { isMobile: true, hasTouch: true } : {}) });
    const page = await ctx.newPage();
    const posts: string[] = [], asked: string[] = [], errors: string[] = [];
    page.on("request", (r) => { if (r.method() === "POST") posts.push(r.url()); if (/RealPrices-|\/api\/prices/.test(r.url())) asked.push(r.url()); });
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(url, { waitUntil: "networkidle" });
    if (asked.length) fail(`landing ${size}: the first screen asked for real prices: ${asked.join(", ")}`);
    const slot = page.locator(".ds-real");
    await slot.waitFor({ state: "attached", timeout: 15_000 });
    await slot.evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }));
    // The whole landing section: its own head on the page (headline, live-or-recorded line, bridge, label) and the card.
    const panel = page.locator(".ds-real .c3-land");
    try { await panel.waitFor({ timeout: 10_000 }); } catch { fail(`landing ${size}: the panel never showed`); }
    const text = await panel.innerText();
    for (const must of ["Real prices, from Channel3", "The ticket is made up.", LABEL, "You can't buy these through Goose.", "Recorded Nov 5 · not live", "off its own list price of", "A flag is not a finding about the store"]) if (!text.includes(must)) fail(`landing ${size}: missing "${must}"`);
    if (text.includes("also lists it at")) fail(`landing ${size}: the other stores show here`);
    if (!(await page.locator(".ds-real-try").isVisible())) fail(`landing ${size}: the tap to Goose's pick isn't there`);
    if (await panel.locator("a, button, img, svg, form, input").count()) fail(`landing ${size}: a link, button, image or form in the panel`);
    if (posts.length) fail(`landing ${size}: it POSTed: ${posts.join(", ")}`);
    const words = (await panel.innerText()).trim().split(/\s+/).length;
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/c3-${size}-landing.png`, fullPage: false });
    await panel.screenshot({ path: `${OUT}/c3-${size}-landing-panel.png` });
    const off = (await overflow(page)).filter((l) => /scrolls sideways|\.c3|ds-real/.test(l));
    if (off.length) fail(`landing ${size}: runs off the side: ${off.join(" | ").slice(0, 300)}`);
    if (errors.length) fail(`landing ${size}: console errors: ${errors.join(" | ").slice(0, 300)}`);
    // Its one tap asks; Shop is then the visitor's own run, a deal from a simulated seller with the Desk's panel under it.
    await page.locator(".ds-real-try").click();
    const shop = page.getByRole("button", { name: /Shop for this/ });
    try { await shop.waitFor({ timeout: 15_000 }); } catch { fail(`landing ${size}: the tap never reached Shop`); }
    await shop.click();
    try { await page.locator(".c3", { hasText: "Goose's pick is from our practice market, not one of these" }).waitFor({ timeout: 60_000 }); } catch { fail(`landing ${size}: the tap never reached a deal with its panel`); }
    console.log(`c3 screens: landing ${size} ok (${words} words in the panel)`);
    await ctx.close();
  }
  for (const [size, viewport] of [["1440", { width: 1440, height: 900 }], ["390", { width: 390, height: 844 }]] as const) {
    for (const state of ["real", "live", "recorded"] as const) {
      const ctx = await browser.newContext({ viewport, reducedMotion: "reduce", deviceScaleFactor: size === "390" ? 2 : 1, ...(size === "390" ? { isMobile: true, hasTouch: true } : {}) });
      const page = await ctx.newPage();
      await run(page, state);
      const target = page.locator("section.c3");
      await target.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${OUT}/c3-${size}-${state}.png`, fullPage: false });
      await page.screenshot({ path: `${OUT}/c3-${size}-${state}-full.png`, fullPage: true });
      console.log(`c3 screens: ${size} ${state} ok`);
      await ctx.close();
    }
  }
} finally { await browser.close(); }
console.log(`c3 screens ok: ${OUT}/c3-{1440,390}-{real,live,recorded}.png`);

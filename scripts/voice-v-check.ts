/// <reference lib="dom" />
// Track V (042) in a real browser, at 1440 and 390 px: the greeting by the clock (evening and morning, with and without
// a name), "Tell Goose your name" and "Forget my name", "call me …" in the Ask box, captions on every line said (muted
// too), the mute toggle (keyboard, aria-pressed, remembered after a reload), no clip before the first tap, reduced
// motion, "show me my priorities list" opening Your wants from the Desk and the wallet, and no request, URL or console
// line anywhere carrying the name. Exits 1 on any miss.
//
//   node scripts/voice-v-check.ts [url]   default http://localhost:8831 (a PAYMENT=fake server serving web/dist)
//   writes docs/screens/042/*.png

import { chromium, type Browser, type Page, type Request } from "playwright";
import { NAME_FORGOT, NAME_HELLO } from "@goose/core/name";

const url = (process.argv[2] ?? "http://localhost:8831/").replace(/\/?$/, "/");
const NAME = "Zephyrine";
const OUT = "docs/screens/042";
let fails = 0;
const fail = (m: string) => { console.error(`VOICE-V FAIL: ${m}`); fails++; };
const ok = (m: string) => console.log(`ok  ${m}`);
const check = (cond: boolean, m: string) => (cond ? ok(m) : fail(m));

const SPY = () => {
  const w = window as unknown as { __plays: string[] };
  w.__plays = [];
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    const p = play.call(this);
    const src = this.src;
    p.then(() => { if (!this.muted) w.__plays.push(src); }, () => {});
    return p;
  };
};
const plays = (p: Page) => p.evaluate(() => (window as unknown as { __plays: string[] }).__plays);
const greet = (p: Page) => p.locator(".vg-line").innerText();
const caption = (p: Page) => p.locator(".gv-cap .gv-words").innerText();

async function deskPage(b: Browser, w: number, h: number, at: string, opts: { reduced?: boolean } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1, reducedMotion: opts.reduced ? "reduce" : "no-preference", hasTouch: w < 500 });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(at));
  await page.addInitScript(SPY);
  const reqs: Request[] = [];
  page.on("request", (r) => reqs.push(r));
  const logs: string[] = [];
  page.on("console", (m) => logs.push(m.text()));
  const urls: string[] = [];
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) urls.push(f.url()); });
  await page.goto(url);
  await page.getByLabel("Ask for anything").waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  return { ctx, page, reqs, logs, urls };
}

function carries(reqs: Request[], needle: string): string[] {
  return reqs.filter((r) => [r.url(), JSON.stringify(r.headers()), r.postData() ?? ""].join("\n").toLowerCase().includes(needle.toLowerCase())).map((r) => `${r.method()} ${r.url()}`);
}

const b = await chromium.launch();
for (const [w, h, tag] of [[1440, 900, "desktop"], [390, 844, "phone"]] as const) {
  // ── Evening, no name ──
  const { ctx, page, reqs, logs, urls } = await deskPage(b, w, h, "2026-10-30T19:30:00");
  check(await greet(page) === "Good evening. Where would you like to begin?", `${tag}: evening greeting with no name`);
  check(await page.getByRole("button", { name: "Tell Goose your name" }).isVisible(), `${tag}: "Tell Goose your name" visible`);
  check(reqs.filter((r) => r.url().includes("/voice/")).length === 0, `${tag}: no clip requested before the first tap`);
  await page.screenshot({ path: `${OUT}/${tag}-greeting-none.png` });

  // ── The field: keyboard only ──
  await page.getByRole("button", { name: "Tell Goose your name" }).click();
  const field = page.getByLabel("What should Goose call you?");
  check(await field.evaluate((e) => e === document.activeElement), `${tag}: the name field takes focus`);
  await field.fill("Sam123");
  await field.press("Enter");
  check(await field.getAttribute("aria-invalid") === "true", `${tag}: a name with digits is refused with a message`);
  await page.screenshot({ path: `${OUT}/${tag}-greeting-field.png` });
  await field.fill(NAME.toLowerCase());
  await field.press("Enter");
  await page.waitForTimeout(400);
  check(await greet(page) === `Good evening, ${NAME}. Where would you like to begin?`, `${tag}: greeting carries the name (tidied)`);
  check(await page.locator(".vg-line").evaluate((e) => e === document.activeElement), `${tag}: focus moves to the new greeting`);
  check(await page.locator(".vg-line").evaluate((e) => getComputedStyle(e).outlineStyle === "none"), `${tag}: the greeting draws no focus ring (a tabindex=-1 target, like the Desk's headings)`);
  check(await caption(page) === NAME_HELLO, `${tag}: caption shows Goose's line`);
  check(await page.locator(".gv-live").innerText() === NAME_HELLO, `${tag}: the line is announced (status region)`);
  await page.waitForTimeout(600);
  check((await plays(page)).some((s) => s.endsWith("/voice/name-hello.m4a")), `${tag}: the hello clip played after the tap`);
  await page.screenshot({ path: `${OUT}/${tag}-greeting-name-caption.png` });
  // The caption's words never take a tap meant for the header under them; only its Mute button does.
  const through = await page.locator(".gv-cap .gv-words").evaluate((w) => { const r = w.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !at?.closest(".gv-cap"); });
  check(through, `${tag}: a tap on the caption's words reaches the page under it`);
  // Every link and button in the header still takes its tap while a line shows (on a phone the bar sits under it).
  const covered = await page.locator("header").first().evaluate((h) => [...h.querySelectorAll("a, button")].filter((el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!at?.closest(".gv-cap");
  }).map((el) => el.textContent?.trim()));
  check(covered.length === 0, `${tag}: no header link sits under the caption (${JSON.stringify(covered)})`);
  // A Mute that is always there, not only while a line plays.
  check(await page.getByRole("button", { name: "Mute Goose" }).isVisible(), `${tag}: "Mute Goose" is on the page beside the greeting`);
  for (const name of ["Forget my name", "Mute Goose"]) {
    const b = await page.getByRole("button", { name }).boundingBox();
    check(!!b && b.height >= 44, `${tag}: "${name}" is a 44 px target (${b?.height} px)`);
  }

  // ── Mute: by keyboard, pressed state, remembered ──
  const mute = page.getByRole("button", { name: "Mute", exact: true });
  await mute.focus();
  await page.keyboard.press("Enter");
  check(await mute.getAttribute("aria-pressed") === "true", `${tag}: Mute toggles by keyboard (aria-pressed=true)`);
  check(await page.evaluate(() => localStorage.getItem("gg-voice-muted-v1")) === "1", `${tag}: mute kept in this browser`);
  await page.waitForTimeout(300); // the toggle's 200 ms colour change, finished
  // Keyboard focus on the pressed toggle: the cream fill plus the focus ring (WCAG 2.4.7 needs the ring).
  await page.screenshot({ path: `${OUT}/${tag}-caption-muted-focus.png` });
  // The pressed state itself, focus elsewhere: the fill only, one shape, no ring.
  await mute.evaluate((e) => (e as HTMLElement).blur());
  check(await mute.evaluate((e) => getComputedStyle(e).outlineStyle === "none"), `${tag}: the pressed Mute draws no ring without keyboard focus`);
  await page.screenshot({ path: `${OUT}/${tag}-caption-muted.png` });
  await page.reload();
  await page.getByLabel("Ask for anything").waitFor();
  await page.waitForTimeout(1200);
  check(await greet(page) === `Good evening, ${NAME}. Where would you like to begin?`, `${tag}: the name survives a reload`);
  const before = (await plays(page)).length;
  await page.getByRole("button", { name: "Forget my name" }).click();
  await page.waitForTimeout(700);
  check(await caption(page) === NAME_FORGOT, `${tag}: muted, the caption still shows "${NAME_FORGOT}"`);
  check((await plays(page)).length === before, `${tag}: muted, no clip plays`);
  check(await page.getByRole("button", { name: "Mute", exact: true }).getAttribute("aria-pressed") === "true", `${tag}: muted state shown after reload`);
  check(await greet(page) === "Good evening. Where would you like to begin?", `${tag}: forgotten, the greeting has no name`);
  check(await page.getByRole("button", { name: "Tell Goose your name" }).evaluate((e) => e === document.activeElement), `${tag}: focus lands on "Tell Goose your name" after forgetting`);
  check(await page.getByRole("button", { name: "Unmute Goose" }).isVisible(), `${tag}: the greeting's toggle says "Unmute Goose" while muted`);
  await page.getByRole("button", { name: "Unmute Goose" }).click(); // unmute, from the toggle that is always there
  check(await page.getByRole("button", { name: "Mute", exact: true }).getAttribute("aria-pressed") === "false", `${tag}: the caption's Mute follows the greeting's toggle`);
  check(await page.evaluate(() => localStorage.getItem("gg-voice-muted-v1")) === null, `${tag}: unmuted, the key is gone`);

  // ── "call me …" said or typed into the Ask box ──
  const box = page.getByLabel("Ask for anything");
  await box.fill(`call me ${NAME}`);
  await box.press("Enter");
  await page.waitForTimeout(500);
  check(await greet(page) === `Good evening, ${NAME}. Where would you like to begin?`, `${tag}: "call me ${NAME}" in the Ask box greets by name`);
  check(await caption(page) === NAME_HELLO, `${tag}: and Goose's line is captioned`);
  // The caption leaves on its own after the line.
  await page.waitForTimeout(7000);
  check(await page.locator(".gv-cap").isHidden(), `${tag}: the caption leaves after the line`);

  // ── "show me my priorities list" → Your wants ──
  await box.fill("show me my priorities list");
  await box.press("Enter");
  await page.waitForURL(/\?desk=1$/, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const room = await page.locator(".dk-rail [aria-current='page']").innerText().catch(() => "");
  check(/want/i.test(room), `${tag}: "show me my priorities list" opens Your wants on the Desk (rail: "${room}")`);
  await page.screenshot({ path: `${OUT}/${tag}-wants.png` });

  // ── From the wallet ──
  await page.goto(`${url}?wallet=1`);
  await page.locator("#want").waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  await page.locator("#want").fill("Show me my priorities list.");
  await page.locator("#want").press("Enter");
  await page.waitForURL(/desk=1/, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const room2 = await page.locator(".dk-rail [aria-current='page']").innerText().catch(() => "");
  check(/want/i.test(room2), `${tag}: from the wallet, the same words open Your wants (rail: "${room2}")`);

  // ── The name never left ──
  const hits = carries(reqs, NAME);
  check(hits.length === 0, `${tag}: no request carries the name (${reqs.length} requests scanned)${hits.length ? `: ${hits.join(", ")}` : ""}`);
  check(!urls.some((u) => u.toLowerCase().includes(NAME.toLowerCase())), `${tag}: no address bar URL carried the name (${urls.length} navigations)`);
  check(!logs.some((l) => l.toLowerCase().includes(NAME.toLowerCase())), `${tag}: no console line carries the name`);
  // Control: the scan does catch a planted request.
  await page.evaluate((n) => fetch(`/api/control?n=${n}`).catch(() => {}), NAME);
  await page.waitForTimeout(300);
  check(carries(reqs, NAME).length === 1, `${tag}: control: a planted request with the name IS caught`);
  await ctx.close();

  // ── Morning, reduced motion ──
  const m = await deskPage(b, w, h, "2026-10-30T08:15:00", { reduced: true });
  check(await greet(m.page) === "Good morning. Where would you like to begin?", `${tag}: morning greeting by the local clock`);
  await m.page.getByRole("button", { name: "Tell Goose your name" }).click();
  await m.page.getByLabel("What should Goose call you?").fill("Ana María");
  await m.page.getByLabel("What should Goose call you?").press("Enter");
  await m.page.waitForTimeout(300);
  const tr = await m.page.locator(".gv-cap").evaluate((e) => getComputedStyle(e).transitionDuration);
  check(/^0s(, 0s)*$/.test(tr), `${tag}: reduced motion, the caption has no transition (${tr})`);
  check(await m.page.locator(".vg").evaluate((e) => getComputedStyle(e).animationName) === "none", `${tag}: reduced motion, the greeting doesn't fade`);
  check(await greet(m.page) === "Good morning, Ana María. Where would you like to begin?", `${tag}: a two-word name with an accent`);
  await m.page.screenshot({ path: `${OUT}/${tag}-morning-reduced.png` });
  await m.ctx.close();
}
await b.close();
if (fails) { console.error(`voice-v-check: ${fails} miss(es)`); process.exit(1); }
console.log("voice-v-check ok");

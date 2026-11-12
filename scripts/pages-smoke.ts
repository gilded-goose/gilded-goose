// H5 dry run: the static mirror works under a sub-path with no server. W64: it is the same product as the hosted link,
// so it opens on the wallet with a deal waiting; "Try to break it" reaches the attack demo in one tap, the one nav's
// menu comes back ("Everything Goose does" → "Approve in PayPal"; S1 removed the old "‹ Your wallet" header link), and
// the safe page's back and replay links stay on the demo. Fails on a JS error, an asset that 404s
// (only /api may fail: there is no server), a missing page, or a link that leaves the sub-path. Re-runnable:
//
//   node scripts/pages-smoke.ts http://localhost:4174/gilded-goose/     (a VITE_WALLET=1 build)

import { chromium, type Page } from "playwright";

const base = process.argv[2];
if (!base?.endsWith("/")) { console.error("usage: node scripts/pages-smoke.ts <base url ending in />"); process.exit(1); }
const path = new URL(base).pathname;
const fails: string[] = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("pageerror", (e) => fails.push(`JS error: ${e.message}`));
page.on("response", (r) => {
  const u = new URL(r.url());
  if (r.status() >= 400 && !u.pathname.includes("/api/")) fails.push(`${r.status()} ${u.pathname}`);
});
const see = async (text: string, where: string) => {
  try { await page.getByText(text).first().waitFor({ state: "visible", timeout: 10_000 }); } catch { fails.push(`${where}: "${text}" not on screen`); }
};
// The demo is the judge box's own field: the wallet's link to it quotes the same words, so text alone can't tell them apart.
const demo = (where: string) => step(where, () => page.locator("#judge-note").waitFor({ state: "visible", timeout: 10_000 }));
// "Try to break it" opens the Challenge on the Desk (?desk=1#challenge, Track X): the note box must be drawn AND in view,
// because a link that lands on the right page at the wrong scroll still strands a shopper.
const challenge = (where: string) => step(where, async () => {
  const box = page.locator("#ds-ch-note");
  await box.waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForFunction(() => { const r = document.querySelector("#ds-ch-note")?.getBoundingClientRect(); return !!r && r.top >= 0 && r.top < innerHeight; }, undefined, { timeout: 5_000 });
});
// After Send, the verdict comes into view with focus on it (Joshua, Nov 4, 3b), every round: a later round's verdict replaces
// the last one, so a focus that runs ahead of the draw lands on the old one and drops to the page. Nothing here reaches a
// server: any round POST is cut, so pointed at a live host it still can't add to a record.
const verdictComesUp = (where: string) => step(where, async () => {
  await page.route("**/api/runs/**", (r) => (r.request().method() === "POST" ? r.abort() : r.continue()));
  const chips = page.locator(".ds-ch-chip");
  for (let i = 0; i < (await chips.count()); i++) {
    await chips.nth(i).click({ timeout: 10_000 });
    const before = await page.locator(".ds-ch-title").textContent({ timeout: 100 }).catch(() => null);
    await page.locator(".ds-ch-send").click({ timeout: 10_000 });
    await page.waitForFunction(() => document.querySelector(".ds-ch-send")?.getAttribute("data-busy") === null && !!document.querySelector(".ds-ch-title"), undefined, { timeout: 15_000 });
    await page.waitForFunction(() => {
      const v = document.querySelector(".ds-ch-verdict");
      if (!v || document.activeElement !== v) return false;
      const r = v.getBoundingClientRect();
      return r.top >= parseFloat(getComputedStyle(v).scrollMarginTop) - 2 && r.top < innerHeight / 2; // clear of the header, and high on the screen
    }, undefined, { timeout: 5_000 }).catch(async () => {
      const said = await page.evaluate(() => { const v = document.querySelector(".ds-ch-verdict"); return { focus: document.activeElement?.className, top: v && Math.round(v.getBoundingClientRect().top), margin: v && getComputedStyle(v).scrollMarginTop }; });
      throw new Error(`round ${i + 1} (was: ${before}): the verdict didn't come up with focus: ${JSON.stringify(said)}`);
    });
    await page.locator("#ds-ch-note").scrollIntoViewIfNeeded();
  }
  await page.unroute("**/api/runs/**");
});
const stayed = (link: string) => { if (!new URL(page.url()).pathname.startsWith(path)) fails.push(`${link} left ${path}: ${page.url()}`); };

// Each step reports its own failure instead of crashing, so the output names what broke.
const step = async (name: string, f: () => Promise<unknown>) => { try { await f(); } catch (e) { fails.push(`${name}: ${(e as Error).message.split("\n")[0]}`); } };
const follow = (name: string, link: RegExp) => step(name, async () => { await page.getByRole("link", { name: link }).first().click({ timeout: 10_000 }); await page.waitForLoadState("load"); });
// The one nav (S1): every page reaches the rest through "Everything Goose does", whose panel lists each feature as a link.
const viaMenu = (name: string, item: RegExp) => step(name, async () => {
  // At phone width the button's wide words are hidden, so its name is "Menu" (S1-13 part 3; S2-cine did the same in the motion gate).
  await page.getByRole("button", { name: /Everything Goose does|^Menu$/ }).first().click({ timeout: 10_000 });
  await page.getByRole("dialog").getByRole("link", { name: item }).first().click({ timeout: 10_000 });
  await page.waitForLoadState("load");
});

await page.goto(base);
await see("Practice only: no real money", "wallet");
await step("a deal waiting", () => page.locator("#hero-h").waitFor({ state: "visible", timeout: 10_000 }));
// W-8 (the calm hero, AskGoose.tsx): the wallet's first screen is the box and its chips, and "I saw it for" comes with
// the first answer. Asked here with no server, so this is the mirror's keyword rule answering too.
await step("the seen-price field comes with the first answer", async () => {
  const ask = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    ask.on("pageerror", (e) => fails.push(`JS error in the ask: ${e.message}`));
    await ask.goto(base);
    const saw = ask.getByLabel("I saw it for (optional)", { exact: true });
    await ask.getByRole("button", { name: "A black kettle" }).waitFor({ timeout: 10_000 });
    if (await saw.count()) throw new Error("the seen-price field is on the first screen");
    await ask.getByRole("button", { name: "A black kettle" }).click({ timeout: 10_000 });
    await saw.waitFor({ state: "visible", timeout: 10_000 });
  } finally { await ask.close(); }
});
await follow("break link", /Try to break it/);
stayed("break link");
await challenge("the Challenge, from the wallet");
await verdictComesUp("the Challenge's verdict");
await see("isn't answering", "demo");
await viaMenu("wallet link", /Approve in PayPal/);
stayed("wallet link");
await see("Practice only: no real money", "wallet, from the demo");
await follow("safe link", /How Goose keeps you safe/);
stayed("safe link");
await see("Your max", "safe page");
await follow("back link", /Try to break it/);
stayed("back link");
await challenge("the Challenge, after the back link");
// On a phone the safe page shows one step at a time: the replay link lives in step 5.
await page.goto(`${base}safe.html`);
await step("step 5", () => page.getByRole("link", { name: /Your yes/ }).first().click({ timeout: 10_000 }));
await follow("replay link", /Replay this week/);
stayed("replay link");
await demo("demo, after the replay link");
// Item 4 (Thu Oct 29): the wallet's chunk never arrives (a dropped connection, or a deploy that replaced it mid-visit).
// The page says so and links to the classic page, which needs no chunk; never a blank screen.
await step("the wallet's chunk fails", async () => {
  const cut = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await cut.route(/\/assets\/Wallet-[^/]+\.js$/, (r) => r.abort());
    await cut.goto(base);
    await cut.getByRole("alert").filter({ hasText: "The wallet didn't load." }).waitFor({ timeout: 10_000 });
    await cut.getByRole("link", { name: "open the classic page" }).click({ timeout: 10_000 });
    await cut.locator("#judge-note").waitFor({ state: "visible", timeout: 10_000 });
    if (!new URL(cut.url()).pathname.startsWith(path) || !cut.url().includes("wallet=0")) throw new Error(`the classic link went to ${cut.url()}`);
  } finally { await cut.close(); }
});
// W64b: the built page carries the wallet's first paint, so a phone sees the deal before any JS. With the page's own
// script cut off it's still there, styled; once the wallet loads, React draws the same words in the same place. A visit
// whose first screen is different (a wallet cookie, PayPal's return, the classic page) never gets it.
// What a thumb is aiming at: every link and button on the first screen, by its words, and where it is.
const stops = (p: Page) => p.evaluate(() => [...document.querySelectorAll("#root a, #root button")].map((e) => { const b = e.getBoundingClientRect(); return { k: (e.textContent ?? "").trim().slice(0, 40), top: Math.round(b.top + scrollY), shown: b.height > 0, fold: b.top < innerHeight }; }).filter((s) => s.shown));
const firstPaint = async (where: string, url: string, cookie?: string) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (cookie) await ctx.addCookies([{ name: cookie.split("=")[0]!, value: cookie.split("=")[1]!, url: base }]);
  const p = await ctx.newPage();
  await p.route(/\/assets\/main-[\w-]+\.js$/, (r) => r.abort());
  await p.goto(url, { waitUntil: "load" });
  const seen = await p.evaluate(() => ({
    h: document.querySelector("#hero-h")?.textContent ?? null,
    price: document.querySelector(".hero .price")?.textContent ?? null,
    kicker: document.querySelector(".hero .kicker")?.textContent ?? null,
    top: document.querySelector("#hero-h")?.getBoundingClientRect().top ?? null,
    banner: document.querySelector(".gn-foot")?.textContent ?? null,
    // The gate's own act: the wallet's stylesheet linked before first paint (--cream is the shared header's now, W64).
    styled: document.querySelector('link[rel="stylesheet"][href*="/assets/Wallet-"]') !== null,
  }));
  await p.evaluate(() => document.fonts.ready);
  const first = await stops(p);
  await ctx.close();
  void where;
  return { ...seen, stops: first };
};
await step("the first paint, before any JS", async () => {
  const f = await firstPaint("first", base);
  if (!f.h || !f.price || f.kicker !== "Waiting for your tap") throw new Error(`no deal before JS: ${JSON.stringify(f)}`);
  if (f.banner !== "Practice only: no real money" || !f.styled) throw new Error(`the first paint isn't the wallet's: ${JSON.stringify(f)}`);
  // The wallet itself, loaded: the same deal, the same price, the same words, in the same place.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  // No server here, so never PayPal's practice site: not in the build's HTML, and not for a moment after the code lands, while the
  // health check is out. Held back so that moment is long enough to see, and every paint watched, since the line goes when it fails.
  await p.route(/\/api\//, async (r) => { await new Promise((x) => setTimeout(x, 1500)); await r.continue(); });
  await p.addInitScript(() => {
    const w = window as unknown as { __line: boolean };
    w.__line = false;
    new MutationObserver(() => { if (document.querySelector(".apractice")) w.__line = true; }).observe(document, { childList: true, subtree: true });
  });
  await p.goto(base);
  await p.locator(".hero .acts:not(.acts-held)").waitFor({ timeout: 10_000 });
  if ((await (await fetch(base)).text()).includes("apractice")) throw new Error("the Pages first paint promises PayPal's practice site");
  // There's no server here, so wait for the page to say so: the away notes are what moved the deal (107 px, Nov 4).
  await p.locator(".away.at-acts").waitFor({ timeout: 10_000 });
  if (await p.evaluate(() => (window as unknown as { __line: boolean }).__line)) throw new Error("Pages drew PayPal's practice-site line after the code landed");
  await p.evaluate(() => document.fonts.ready);
  const late = await stops(p);
  const r = await p.evaluate(() => ({ h: document.querySelector("#hero-h")?.textContent, price: document.querySelector(".hero .price")?.textContent, kicker: document.querySelector(".hero .kicker")?.textContent, top: document.querySelector("#hero-h")?.getBoundingClientRect().top, first: document.querySelector("[data-first]") !== null && document.querySelector("main[data-first]") !== null }));
  await ctx.close();
  if (r.h !== f.h || r.price !== f.price || r.kicker !== f.kicker) throw new Error(`the first paint says ${JSON.stringify(f)}, the wallet ${JSON.stringify(r)}`);
  if (Math.abs((r.top ?? 0) - (f.top ?? 0)) > 1) throw new Error(`the deal moved when the wallet loaded: ${f.top} → ${r.top}`);
  for (const s of f.stops.filter((x) => x.fold)) {
    const l = late.find((x) => x.k === s.k);
    if (l && Math.abs(l.top - s.top) > 2) throw new Error(`"${s.k}" moved when the wallet loaded: ${s.top} → ${l.top}`);
  }
  if (r.first) throw new Error("the wallet didn't replace the first paint");
});
// W65: at phone width the demo keeps what makes its toggle and its max mean something: what each mode costs and reads,
// and "what the agent may spend" under the locked max.
await step("the demo's toggle lines at 390 px", async () => {
  await page.goto(`${base}?wallet=0#break`);
  await page.locator("#judge-note").waitFor({ state: "visible", timeout: 10_000 });
  for (const t of ["no AI", "Goose's max"]) /* SW: the toggle and max lines as shipped */ {
    if (!(await page.getByText(t).first().isVisible())) throw new Error(`"${t}" is hidden at 390 px`);
  }
  if (!(await page.locator(".seg button small").nth(1).isVisible())) throw new Error("the AI mode's line is hidden at 390 px");
});
await step("no first paint when the first screen differs", async () => {
  for (const [why, url, cookie] of [["a paid cookie", base, "goose_wallet_paid=1_FAKE-0001_47.73"], ["a held cookie", base, "goose_wallet_held=1_FAKE-0001"], ["PayPal's return", `${base}?wallet=1&run=abcdef123456`], ["the classic page", `${base}?wallet=0`], ["the empty week", `${base}?wallet=empty`]] as const) {
    const f = await firstPaint(why, url, cookie);
    if (f.h !== null || f.styled) throw new Error(`${why}: the first paint showed (${JSON.stringify(f)})`);
  }
});
// A room named in the address opens under a cover with its head painted (prerender.ts). The cover must lift, with focus on
// the room's own head, and a Desk that can't load must show its message, never the cover's words with nothing under them.
await step("a room's cover lifts", async () => {
  await page.goto("about:blank"); // the Desk drops a room\'s hash, so this address alone would only move the hash, not load
  await page.goto(`${base}?desk=1#challenge`, { waitUntil: "load" });
  await page.waitForFunction(() => !document.getElementById("dk-room-first") && document.activeElement?.id === "ds-ch-h", undefined, { timeout: 30_000 });
});
await step("a room's cover gives way to a lost Desk", async () => {
  await page.route(/\/assets\/Desk-[\w-]+\.js$/, (r) => r.abort());
  await page.goto("about:blank"); // the Desk drops a room\'s hash, so this address alone would only move the hash, not load
  await page.goto(`${base}?desk=1#wants`, { waitUntil: "load" });
  await page.waitForFunction(() => !document.getElementById("dk-room-first") && !!document.querySelector("#root [role=alert]"), undefined, { timeout: 15_000 });
  await page.unroute(/\/assets\/Desk-[\w-]+\.js$/);
});
// No code at all: the cover hides itself at 8 s. The clock is read and moved rather than waited for.
await step("a room's cover hides itself if the Desk never comes", async () => {
  await page.route(/\/assets\/[^/]+\.js$/, (r) => r.abort());
  await page.goto("about:blank"); // the Desk drops a room\'s hash, so this address alone would only move the hash, not load
  await page.goto(`${base}?desk=1#week`, { waitUntil: "load" });
  await page.waitForSelector("#dk-room-first", { state: "attached", timeout: 15_000 });
  const hidden = await page.evaluate(() => {
    const cover = document.getElementById("dk-room-first")!;
    const clock = cover.getAnimations().find((a) => (a as CSSAnimation).animationName === "dk-case-out");
    if (!clock) return "no clock";
    if (getComputedStyle(cover).visibility !== "visible") return "hidden too soon";
    clock.currentTime = 9000;
    return getComputedStyle(cover).visibility;
  });
  await page.unroute(/\/assets\/[^/]+\.js$/);
  if (hidden !== "hidden") throw new Error(`the cover's 8 s: ${hidden}`);
});
// Its file is slower than the room: the room stays uncovered.
await step("a room's cover stays away if the room got there first", async () => {
  let release = (): void => {};
  const held = new Promise<void>((r) => { release = r; });
  await page.route(/\/first\/room-wants\.html$/, async (r) => { await held; await r.continue().catch(() => {}); });
  await page.goto("about:blank"); // the Desk drops a room\'s hash, so this address alone would only move the hash, not load
  await page.goto(`${base}?desk=1#wants`, { waitUntil: "load" });
  await page.waitForFunction(() => document.activeElement?.classList.contains("dk-pane-h") && !document.documentElement.hasAttribute("data-first-room"), undefined, { timeout: 30_000 });
  const landed = page.waitForResponse(/\/first\/room-wants\.html$/);
  release();
  await landed;
  await page.waitForTimeout(200);
  await page.unroute(/\/first\/room-wants\.html$/);
  if (await page.locator("#dk-room-first").count()) throw new Error("a late file covered a room that had landed");
});
await browser.close();

if (fails.length) { for (const f of fails) console.error(`PAGES FAIL ${f}`); process.exit(1); }
console.log(`pages-smoke ok: the wallet, the demo and the safe page, and every link between them, work under ${path} with no server`);

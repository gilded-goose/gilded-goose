/// <reference lib="dom" />
// Screenshots and checks of item 10's commands in the Ask box (restart notes §24A, 018 N27), for guild-visual, × phone
// 390 and desktop 1440. "Buy this right now" on week 1 (a browser run: no Approve on this page) says "Shopping for it
// now.", starts the run, never asks the Ask route, and once code binds the cart says it back with "Nothing to pay here."
// (never "Tap Approve" where no Approve shows). While it shops the Ask box says what, the limit and the round. "Not
// this one" sets it aside: the card says so and "Bring it back" restores it; the card's own "Not this one" does too. A
// "no" said while Goose still haggles is kept: "I'll set it aside when it's ready.", then the card set aside, never
// said back as one to approve (code review of item 10). "No more than $60" is asked as before (a limit, never a "no"). No request ever goes to /approve. Fails
// on any of it, on sideways scroll at 390, or on a control under 44 px.
// Then, with a server whose PayPal is fake (VOICE_FAKE_URL, e.g. "goose-built-fake" on 8791; no key or call spent):
// "buy this right now" binds a cart this browser may approve, says "Tap Approve to buy.", and moves focus to the
// cart's card, never to Approve, and never presses it (no /approve request); "not this one" hides Approve.
// Needs the offline web server (.claude/launch.json "goose-web-offline", port 5179). From the repo root:
// corepack pnpm voice:screens   (VOICE_FAKE_URL=http://localhost:8791/ corepack pnpm voice:screens for both)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { VOICE_ASIDE_SOON, VOICE_DECLINED, VOICE_SHOPPING, cartSaid } from "@goose/core/voice";

const URL = process.env.VOICE_URL ?? "http://localhost:5179/";
const OUT = "docs/screens"; mkdirSync(OUT, { recursive: true });
function fail(m: string): never { console.error(`voice FAIL: ${m}`); process.exit(1); }
const CART = "Goose's cart, checked by code";
const WEEK1 = cartSaid({ merchant: "Reedbank Outfitters (fictional)", total: "47.73" }, false);

const browser = await chromium.launch();
for (const [w, h, tag] of [[390, 844, "phone"], [1440, 900, "desktop"]] as const) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.addInitScript(() => {
    const said: string[] = ((window as unknown as { __said: string[] }).__said = []);
    const speak = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = (u: SpeechSynthesisUtterance) => { if (u.text) said.push(u.text); speak(u); };
  });
  const said = async () => page.evaluate(() => (window as unknown as { __said: string[] }).__said.at(-1) ?? "");
  const asked: string[] = [];
  page.on("request", (r) => { if (/\/approve|\/api\/runs\/ask/.test(r.url())) asked.push(r.url()); });
  const command = async (words: string) => { await page.fill("#want", words); await page.press("#want", "Enter"); };
  const shot = async (state: string, el: string) => {
    const wide = await page.evaluate(() => document.documentElement.scrollWidth);
    if (w === 390 && wide > 390) fail(`${tag} ${state}: the phone page scrolls sideways (${wide} px)`);
    for (const b of await page.$$(".rcard button, .askrow button")) { const box = await b.boundingBox(); if (box && box.height < 44 && !(await b.evaluate((x) => x.classList.contains("linkish")))) fail(`${tag} ${state}: a button is ${box.height} px tall`); }
    await page.locator(el).screenshot({ path: `${OUT}/voice-${tag}-${state}.png` });
    console.log(`ok  ${OUT}/voice-${tag}-${state}.png`);
  };

  await page.goto(`${URL}?seed=1`);
  await page.waitForSelector("#want");
  await command("Hey Goose, buy this right now");
  await page.waitForFunction((l) => (window as unknown as { __said: string[] }).__said.includes(l), VOICE_SHOPPING, { timeout: 5_000 });
  if ((await said()) !== VOICE_SHOPPING) fail(`${tag}: the command said "${await said()}"`);
  await page.locator(".askdone", { hasText: /Shopping for the Goldfeather KettleUp to your \$\d+\.\d\d limit/ }).waitFor({ timeout: 10_000 }).catch(() => fail(`${tag}: no live line while it shops`));
  await shot("asked", ".askg");
  await page.getByText(CART).first().waitFor({ timeout: 90_000 });
  await page.waitForFunction((line) => (window as unknown as { __said: string[] }).__said.at(-1) === line, WEEK1, { timeout: 5_000 }).catch(() => null);
  if ((await said()) !== WEEK1) fail(`${tag}: the bound cart was said as "${await said()}", not "${WEEK1}"`);
  await shot("bound", ".run .rcard");
  await command("not this one");
  await page.locator('.rcard[data-outcome="declined"]').waitFor();
  if ((await said()) !== VOICE_DECLINED) fail(`${tag}: the decline said "${await said()}"`);
  if (!(await page.getByText("You set this cart aside.").isVisible())) fail(`${tag}: the declined card isn't shown`);
  await shot("declined", ".run .rcard");
  await page.getByRole("button", { name: "Bring it back" }).click();
  if (await page.isVisible('.rcard[data-outcome="declined"]')) fail(`${tag}: "Bring it back" didn't restore the cart`);
  if (!(await page.getByText(CART).first().isVisible())) fail(`${tag}: the cart isn't back`);
  // The card's own way to say no, for anyone not speaking.
  await page.getByRole("button", { name: "Not this one" }).click();
  await page.locator('.rcard[data-outcome="declined"]').waitFor();
  await page.getByRole("button", { name: "Bring it back" }).click();
  // Asking "buy it" again with the cart waiting says it back; it starts no second run.
  await command("buy it");
  if ((await said()) !== WEEK1) fail(`${tag}: "buy it" beside a waiting cart said "${await said()}"`);
  // A limit is asked as before: never a "no".
  await command("no more than $60");
  await page.waitForSelector(".askout");
  if (await page.isVisible('.rcard[data-outcome="declined"]')) fail(`${tag}: "no more than $60" declined the cart`);
  if (asked.some((u) => u.includes("/approve"))) fail(`${tag}: a request went to /approve: ${asked}`);
  if (asked.some((u) => u.includes("/api/runs/ask"))) fail(`${tag}: a command went to the Ask route (offline page has none, so it is a fallback ask): ${asked}`);
  // A "no" while Goose haggles: kept, and the cart lands set aside, never said back to approve.
  await page.goto(`${URL}?seed=1`);
  await page.waitForSelector("#want");
  await command("buy this right now");
  await page.waitForFunction((l) => (window as unknown as { __said: string[] }).__said.includes(l), VOICE_SHOPPING, { timeout: 5_000 });
  // An ordinary Ask while it shops shows its own answer (code review of item 10), then the "no" still lands.
  await command("I saw it for $55");
  await page.locator(".askout").waitFor({ timeout: 5_000 }).catch(() => fail(`${tag}: an Ask while shopping shows no answer`));
  await command("not this one");
  if ((await said()) !== VOICE_ASIDE_SOON) fail(`${tag}: a no while haggling said "${await said()}"`);
  await page.locator('.rcard[data-outcome="declined"]').waitFor({ timeout: 90_000 });
  const all = await page.evaluate(() => (window as unknown as { __said: string[] }).__said);
  if (all.includes(WEEK1) || all.some((l) => l.includes("Tap Approve"))) fail(`${tag}: a cart set aside while haggling was said back: ${all}`);
  if (all.at(-1) !== VOICE_DECLINED) fail(`${tag}: the cart set aside as it landed said "${all.at(-1)}"`);
  await page.close();
}

const FAKE = process.env.VOICE_FAKE_URL;
if (FAKE) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    const said: string[] = ((window as unknown as { __said: string[] }).__said = []);
    window.speechSynthesis.speak = (u: SpeechSynthesisUtterance) => { if (u.text) said.push(u.text); };
  });
  const asked: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/approve")) asked.push(r.url()); });
  await page.goto(FAKE);
  await page.waitForSelector("#want");
  await page.fill("#want", "buy this right now");
  await page.press("#want", "Enter");
  await page.locator("#approve").waitFor({ timeout: 90_000 });
  const tap = /^\$\d+(?:\.\d\d)? at \S+\. Tap Approve to buy\.$/;
  await page.waitForFunction((re) => new RegExp(re).test((window as unknown as { __said: string[] }).__said.at(-1) ?? ""), tap.source, { timeout: 5_000 }).catch(() => null);
  const last = await page.evaluate(() => (window as unknown as { __said: string[] }).__said.at(-1) ?? "");
  if (!tap.test(last)) fail(`server: the bound cart was said as "${last}"`);
  // The run ended while the Ask field had focus: it stays there (never pulled out of typing), and the line under the
  // Ask box points to the cart; "See it" brings the card forward. Focus is never on Approve.
  const focused = () => page.evaluate(() => document.activeElement?.id);
  if (!["want", "cart"].includes((await focused()) ?? "")) fail(`server: focus went to "${await focused()}" after the run`);
  const see = page.locator(".askdone a", { hasText: "See it" });
  if (!(await see.isVisible()) || !(await page.locator(".askdone", { hasText: /^Cart ready: \$\d/ }).isVisible())) fail("server: no \"Cart ready … See it\" line under the Ask box");
  await see.click();
  await page.waitForFunction(() => document.activeElement?.id === "cart", null, { timeout: 3_000 }).catch(() => null);
  if ((await focused()) !== "cart") fail(`server: "See it" focused "${await focused()}", not the cart's card`);
  if (asked.length) fail(`server: a request went to /approve without a tap: ${asked}`);
  await page.waitForTimeout(600); // the smooth scroll to Approve settles
  await page.screenshot({ path: `${OUT}/voice-phone-approve.png` });
  console.log(`ok  ${OUT}/voice-phone-approve.png (said "${last}", the cart focused, Approve never pressed)`);
  await page.fill("#want", "not this one");
  await page.press("#want", "Enter");
  await page.locator('.rcard[data-outcome="declined"]').waitFor();
  if (await page.isVisible("#approve")) fail("server: Approve still shows on a declined cart");
  if (asked.length) fail(`server: a request went to /approve: ${asked}`);
  await page.close();
}
await browser.close();

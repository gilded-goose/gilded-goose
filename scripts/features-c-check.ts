/// <reference lib="dom" />
// 034 in a real browser, at 1440 and 390 px: the name greeting after a reload (Desk and wallet), "forget my name", the
// go-to commands from both Ask boxes, an ambiguous "wallet" that stays an ask, the recorded clip loading only after the
// first tap and playing, a failed clip falling back to the browser's voice, and no request anywhere carrying the name
// (URL, headers or body). Exits 1 on any miss.
//
//   node scripts/features-c-check.ts [url]   default http://localhost:8811 (a PAYMENT=fake server serving web/dist)
//   writes docs/screens/034-{desktop,phone}-{desk,wallet}.png

import { chromium, type Page, type Request } from "playwright";
import { NAME_HELLO, NAME_FORGOT, NAME_KEY } from "@goose/core/name";

const url = (process.argv[2] ?? "http://localhost:8811/").replace(/\/?$/, "/");
const NAME = "Zephyrine";
const OUT = "docs/screens";
let fails = 0;
const fail = (m: string) => { console.error(`FEATURES-C FAIL: ${m}`); fails++; };
const ok = (m: string) => console.log(`ok  ${m}`);

/** Every request the page made, as text a name could hide in: URL, headers and body. */
async function carries(reqs: Request[], needle: string): Promise<string[]> {
  const hits: string[] = [];
  for (const r of reqs) {
    const text = [r.url(), JSON.stringify(r.headers()), r.postData() ?? ""].join("\n");
    if (text.toLowerCase().includes(needle.toLowerCase())) hits.push(`${r.method()} ${r.url()}`);
  }
  return hits;
}

/** Records every play() and speechSynthesis.speak() the page makes. */
const SPY = () => {
  const w = window as unknown as { __plays: string[]; __spoken: string[] };
  w.__plays = []; w.__spoken = [];
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    const p = play.call(this);
    const src = this.src;
    p.then(() => { if (!this.muted) w.__plays.push(`played ${src}`); }, (e: Error) => w.__plays.push(`refused ${src} ${e.name}`));
    return p;
  };
  if ("speechSynthesis" in window) {
    const speak = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = (u: SpeechSynthesisUtterance) => { if (u.text) w.__spoken.push(u.text); speak(u); };
  }
};
const plays = (p: Page) => p.evaluate(() => (window as unknown as { __plays: string[] }).__plays);
const spoken = (p: Page) => p.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);

/** The page is up: the wallet's Ask or the Desk's Ask box is on screen; then a beat for its lazy chunks. */
async function ready(page: Page) {
  const box = new URL(page.url()).searchParams.get("wallet") === "1" ? page.locator("#want") : page.getByLabel("Ask for anything");
  try { await box.waitFor({ timeout: 15000 }); } catch { fail(`no Ask box on ${page.url()}`); }
  await page.waitForTimeout(1200);
}
async function deskSay(page: Page, words: string) {
  const box = page.getByLabel("Ask for anything");
  await box.fill(words);
  await box.press("Enter");
}
async function walletSay(page: Page, words: string) {
  const box = page.locator("#want");
  await box.fill(words);
  await box.press("Enter");
}
async function wentTo(page: Page, from: string, words: string, say: (p: Page, w: string) => Promise<void>, want: (u: URL) => boolean, label: string) {
  await page.goto(`${url}${from}`);
  await ready(page);
  await say(page, words);
  try { await page.waitForURL((u) => want(u), { timeout: 8000 }); ok(`"${words}" from ${from || "/"} → ${label}`); }
  catch { fail(`"${words}" from ${from || "/"} didn't open ${label} (at ${page.url()})`); }
}

const browser = await chromium.launch({ args: ["--autoplay-policy=user-gesture-required"] });
for (const [tag, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(SPY);
  const reqs: Request[] = [];
  ctx.on("request", (r) => reqs.push(r));
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // The Desk at first paint: no clip loaded before a tap.
  await page.goto(`${url}?desk=1`);
  await ready(page);
  if (reqs.some((r) => r.url().includes("/voice/"))) fail(`${tag}: a clip loaded before any tap`); else ok(`${tag}: no clip at first paint`);
  const sub = page.locator(".dk-sub");
  if ((await sub.textContent())?.startsWith("Hi,")) fail(`${tag}: greeted before a name was given`);

  // "Call me …" on the Desk: greeted, the clip plays, and the name is kept after a reload.
  await deskSay(page, `call me ${NAME.toLowerCase()}`);
  try { await page.waitForFunction((n) => document.querySelector(".dk-sub")?.textContent?.startsWith(`Hi, ${n}.`), NAME, { timeout: 5000 }); ok(`${tag}: Desk greets ${NAME}`); }
  catch { fail(`${tag}: the Desk didn't greet after "call me" (${await sub.textContent()})`); }
  try { await page.waitForFunction(() => (window as unknown as { __plays: string[] }).__plays.some((p) => p.includes("/voice/name-hello.m4a")), null, { timeout: 5000 }); }
  catch { /* reported below */ }
  const p1 = await plays(page);
  if (p1.some((p) => p.startsWith("played") && p.includes("/voice/name-hello.m4a"))) ok(`${tag}: the recorded hello played after the tap`); else fail(`${tag}: the hello clip didn't play (${JSON.stringify(p1)})`);
  if ((await spoken(page)).some((s) => s.includes(NAME))) fail(`${tag}: the name was spoken`);
  const clip = await page.request.get(`${url}voice/name-hello.m4a`);
  if (clip.headers()["content-type"] !== "audio/mp4") fail(`${tag}: clip served as ${clip.headers()["content-type"]}`);
  if (await page.evaluate((k) => localStorage.getItem(k), NAME_KEY) !== NAME) fail(`${tag}: not kept in localStorage`);
  await page.reload();
  await ready(page);
  if ((await sub.textContent())?.startsWith(`Hi, ${NAME}.`)) ok(`${tag}: Desk greeting survives a reload`); else fail(`${tag}: no greeting after reload (${await sub.textContent()})`);
  await page.screenshot({ path: `${OUT}/034-${tag}-desk.png` });

  // The wallet's own question carries the name.
  await page.goto(`${url}?wallet=1`);
  const head = page.locator("#ask-h");
  try { await head.waitFor({ timeout: 15000 }); } catch { fail(`${tag}: wallet Ask never showed`); }
  const h = (await head.textContent()) ?? "";
  if (h.endsWith(`, ${NAME}?`)) ok(`${tag}: wallet asks "${h}"`); else fail(`${tag}: wallet heading "${h}"`);
  await head.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/034-${tag}-wallet.png` });

  // Go-to commands, from both boxes. They navigate and send nothing.
  await wentTo(page, "?wallet=1", "show me the proof", walletSay, (u) => u.searchParams.get("desk") === "proof", "?desk=proof");
  await wentTo(page, "?desk=1", "behind the scenes", deskSay, (u) => u.searchParams.get("desk") === "ledger", "?desk=ledger");
  await wentTo(page, "?desk=1", "go to the market", deskSay, (u) => u.searchParams.get("market") === "1", "?market=1");
  await wentTo(page, "?desk=1", "my wallet", deskSay, (u) => u.searchParams.get("wallet") === "1", "?wallet=1");
  await wentTo(page, "?wallet=1", "go home", walletSay, (u) => u.pathname === "/" && u.search === "", "/");
  const goReqs = reqs.filter((r) => r.method() === "POST" && /show me the proof|behind the scenes|go to the market|my wallet|go home/i.test(r.postData() ?? ""));
  if (goReqs.length) fail(`${tag}: a go-to's words were sent: ${goReqs.map((r) => r.url()).join(", ")}`); else ok(`${tag}: no go-to's words were sent`);

  // An ambiguous "wallet" stays an ask: the Desk sends it to be read, and the page stays.
  await page.goto(`${url}?desk=1`);
  await ready(page);
  const asked = page.waitForRequest((r) => r.url().includes("/api/runs/market/understand"), { timeout: 8000 }).catch(() => null);
  await deskSay(page, "wallet");
  if ((await asked)?.postData()?.includes("wallet") && new URL(page.url()).searchParams.get("desk") === "1") ok(`${tag}: a bare "wallet" is asked, not opened`); else fail(`${tag}: a bare "wallet" didn't go to the Ask route (${page.url()})`);

  // A clip that can't load falls back to the browser's voice.
  await page.route("**/voice/*.m4a", (r) => r.fulfill({ status: 404, body: "" }));
  await page.goto(`${url}?desk=1`);
  await ready(page);
  await deskSay(page, "forget my name");
  try { await page.waitForFunction((l) => (window as unknown as { __spoken: string[] }).__spoken.includes(l), NAME_FORGOT, { timeout: 5000 }); ok(`${tag}: a missing clip falls back to speechSynthesis`); }
  catch { fail(`${tag}: no fallback when the clip failed (${JSON.stringify(await spoken(page))})`); }
  await page.unroute("**/voice/*.m4a");
  if ((await sub.textContent())?.startsWith("Hi,")) fail(`${tag}: still greeted after "forget my name"`);
  await page.reload();
  await ready(page);
  if ((await sub.textContent())?.startsWith("Hi,") || (await page.evaluate((k) => localStorage.getItem(k), NAME_KEY)) !== null) fail(`${tag}: the name came back after forget + reload`);
  else ok(`${tag}: forgotten, and stays forgotten after a reload`);

  // Not one request, on any page, carried the name.
  const hits = await carries(reqs, NAME);
  if (hits.length) fail(`${tag}: the name left the browser: ${hits.join(", ")}`); else ok(`${tag}: ${reqs.length} requests, none carries the name`);
  // Control (shared Lesson 4): a request that does carry the name must be caught, or the scan proves nothing.
  const before = reqs.length;
  await page.evaluate((n) => fetch(`/api/health?control=${n}`).catch(() => null), NAME);
  if ((await carries(reqs.slice(before), NAME)).length !== 1) fail(`${tag}: the name scan missed its planted control`);
  if (errors.length) fail(`${tag}: page errors: ${errors.join("; ")}`);
  await ctx.close();
}
await browser.close();
void NAME_HELLO;
if (fails) { console.error(`features-c-check: ${fails} failure(s)`); process.exit(1); }
console.log("features-c-check ok: name greeting, go-to commands and recorded voice at 1440 and 390");

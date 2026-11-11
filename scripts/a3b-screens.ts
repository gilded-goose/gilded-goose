/// <reference lib="dom" />
// The built wallet home (A3), in a real browser: 390 and 1440 px, light and dark, its two states (a deal waiting,
// nothing waiting), and the flag off. Each shot asserts what its state must show before it's saved, so a picture of a
// wrong state can't pass as evidence: the counts on screen equal the shopper fold's (walletHome, computed here in Node
// from the same tape), the price is the bound cart's, the safety line and the practice line appear exactly once, no banned
// word shows, nothing runs off the side (scripts/overflow.ts), and the page logs no error. Spends nothing on a server
// started with PAYMENT=fake and no key: the wallet reads the bundled recorded week, Ask falls back to the plain rule.
//
//   node scripts/a3b-screens.ts [url]   default http://localhost:8787 (a server serving web/dist)
//   writes a3b-{desktop,phone}[-dark]-{home,empty,done}.png to a temp folder, or A3B_OUT ("done": the haggle tray, every round shown)

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import type { Tape } from "@goose/core";
import { recordedWeek } from "@goose/core/week";
import { ENTRY_CATEGORY, entryLimit } from "@goose/core/local";
import { sha256Hex } from "@goose/core/sha256";
import { WALLET_AT, walletHome, type WalletHome } from "@goose/core/wallet";
import { CHIPS_IN_RUNS } from "@goose/core/ask-copy";
import { PRACTICE } from "@goose/core/wallet-flag";
import { overflow } from "./overflow.ts";

const url = (process.argv[2] ?? "http://localhost:8787/").replace(/\/?$/, "/");
const OUT = process.env.A3B_OUT ?? mkdtempSync(join(tmpdir(), "a3b-")); // A3B_OUT=docs/screens to refresh the evidence: a check shouldn't rewrite tracked pictures
const SAFETY = "Goose can’t pay. Only your tap in PayPal does.";
const BANNED = /bought it for you|say yes|wake word|listening|\bagents?\b|planned · M3/i;
function fail(m: string): never { console.error(`A3B SCREENS FAIL: ${m}`); process.exit(1); }

const tape = JSON.parse(readFileSync("docs/fixtures/tape-seed-1.json", "utf8")) as Tape;
const expected: Record<"home" | "empty", WalletHome> = {
  home: walletHome(await recordedWeek(tape, sha256Hex, () => WALLET_AT, ENTRY_CATEGORY), WALLET_AT, tape),
  empty: walletHome(null, WALLET_AT),
};

/** The wallet's first paint draws its buttons inert until the real page takes over, so a press before that does nothing and says nothing.
 *  On a busy machine that's what made the replay's check red: it pressed "Watch the week" on the first paint, and no replay began. */
const live = (page: Page) => page.locator("main[data-first]").waitFor({ state: "detached", timeout: 20_000 });
/** The check's answer as soon as it's true, or its last answer at the end: a fixed wait and a read says "not yet" as "no" on a busy machine. */
async function within<T>(ms: number, read: () => Promise<T>, ok: (v: T) => boolean): Promise<T> {
  for (const end = Date.now() + ms; ; await new Promise((r) => setTimeout(r, 50))) {
    const v = await read();
    if (ok(v) || Date.now() > end) return v;
  }
}

async function check(page: Page, name: string, state: "home" | "empty") {
  const want = expected[state];
  await page.goto(`${url}?wallet=${state === "home" ? "1" : "empty"}`);
  try { await page.locator(".wallet .week").waitFor({ timeout: 20_000 }); await live(page); } catch { fail(`${name} ${state}: the wallet never loaded`); }
  for (const k of ["paid", "waiting", "refused"] as const) {
    const shown = (await page.locator(`[data-count="${k}"]`).textContent())?.trim();
    if (shown !== String(want.counts[k])) fail(`${name} ${state}: "${k}" shows ${shown}, the fold says ${want.counts[k]}`);
  }
  const text = await page.locator("body").innerText();
  const times = (s: string) => text.split(s).length - 1;
  if (times(SAFETY) !== 1) fail(`${name} ${state}: the safety line shows ${times(SAFETY)} times, not once`);
  // W59: practice is said once, plainly; nothing reads simulated, demo or rushed.
  if (times(PRACTICE) !== 1) fail(`${name} ${state}: "${PRACTICE}" shows ${times(PRACTICE)} times, not once`);
  const fakey = /simulated|demo week|replay|expires|minutes? left|hurry/i.exec(text);
  if (fakey) fail(`${name} ${state}: the wallet reads fake or rushed: "${fakey[0]}"`);
  const banned = BANNED.exec(text);
  if (banned) fail(`${name} ${state}: banned words on screen: "${banned[0]}"`);
  // "I saw it for" is in the wallet's hero only once there is an answer (W-8), so it's checked under the Ask, below.
  // The attack demo is reachable from the wallet: the bar's menu holds "Try to trick Goose" (the header's old pill went in the one-menu bar).
  const gm = page.locator("button.gm-btn:visible").first();
  await gm.click();
  const trick = await page.getByRole("link", { name: /^Try to trick Goose/ }).first().getAttribute("href").catch(() => null);
  if (!trick?.endsWith("#challenge")) fail(`${name} ${state}: the menu has no link to the challenge (${trick})`);
  await page.keyboard.press("Escape");
  if (want.deal) {
    if ((await page.locator(".hero .price").textContent()) !== `$${want.deal.total}`) fail(`${name} ${state}: the hero's price isn't the bound cart's $${want.deal.total}`);
    if (!text.includes(`${want.deal.lead} $${want.deal.below} below their $${want.deal.opening} ask`)) fail(`${name} ${state}: the below-their-ask line is missing`);
    // W59: the shopper's limit beside the price, from the Policy, on the price's own row.
    const lim = await page.locator(".hero .prow .lim").evaluate((l) => ({ text: l.textContent, beside: l.getBoundingClientRect().top < l.previousElementSibling!.getBoundingClientRect().bottom }));
    if (!lim.beside) fail(`${name} ${state}: the limit wrapped under the price instead of beside it`);
    // Design B adds "locked by code" under it, on the same brass plate.
    if (lim.text !== `Your limit: $${entryLimit().limit} locked by code`) fail(`${name} ${state}: no "Your limit: $${entryLimit().limit}" beside the price`);
    // The safety story is one tap away. W-8's calm wallet puts one fact on a screen, so where it sits against Ask is the design's call now.
    if (!(await page.locator(".wallet .safe").first().isVisible())) fail(`${name} ${state}: no safe link`);
    // W53: this server can make PayPal's order (fake or sandbox), so the hero's Approve is the real button; with no
    // server it's the picture (scripts/approve-check.ts presses it, and checks the picture with the API cut off).
    if (!(await page.getByRole("button", { name: `Approve $${want.deal.total}`, exact: true }).count())) fail(`${name}: no "Approve $${want.deal.total}" button on the hero`);
    if (!(await page.locator("a.replay").getAttribute("href"))?.includes("seed=1")) fail(`${name}: the replay doesn't replay week 1`);
  } else if (await page.locator(".hero").count()) fail(`${name} ${state}: a hero shows with nothing waiting`);
  // W50a: under the fake payment port the banner and footer never say PayPal's sandbox.
  if (fake && /PayPal sandbox/.test(text)) fail(`${name} ${state}: the fake build says "PayPal sandbox"`);
  if (!fake && !/PayPal sandbox/.test(text)) fail(`${name} ${state}: the ${health!.payment} build never says "PayPal sandbox"`);
  // W50b: the week's rows are the fold's, one per count; W59: open on every screen, a phone too.
  if (!(await page.locator(".wrows").evaluate((d) => (d as HTMLDetailsElement).open))) fail(`${name} ${state}: "Your week" opens folded`);
  const rows = await page.locator(".wrows li").evaluateAll((ls) => ls.map((l) => Number(l.getAttribute("data-seq"))));
  if (JSON.stringify(rows) !== JSON.stringify(want.week.map((w) => w.seq))) fail(`${name} ${state}: week rows ${rows} aren't the fold's ${want.week.map((w) => w.seq)}`);
  const off = await overflow(page);
  if (off.length) fail(`${name} ${state}: runs off the side:\n  ${off.join("\n  ")}`);
  await page.screenshot({ path: `${OUT}/a3b-${name}-${state}.png`, fullPage: true });
  console.log(`ok  ${name} ${state}: ${want.counts.paid} · ${want.counts.waiting} · ${want.counts.refused}`);
}

/** The haggle tray (design B): its rows are walletDesk's moves, in order, the last one the accept at the cart's price;
 *  the one marked "code countered instead" is exactly the round code caught, and the label says who made the moves. */
async function done(page: Page, name: string) {
  const moves = expected.home.desk?.moves ?? fail("week 1 has no desk");
  await page.goto(`${url}?wallet=1`);
  if (name.startsWith("phone")) {
    // A phone's first screen holds the headline and the whole Approve, nothing scrolled. W-8 put one fact on a screen, so the stamped refusal now sits below.
    await page.locator(".hero .approve").waitFor({ timeout: 15_000 });
    await live(page);
    const fold = await page.evaluate(() => ({ vh: innerHeight, b: [".dhead h1", ".hero .approve"].map((s) => document.querySelector(s)?.getBoundingClientRect().bottom ?? Infinity) }));
    if (fold.b.some((b) => b > fold.vh)) fail(`${name} done: the first screen doesn't hold the headline and Approve (bottoms ${fold.b.map(Math.round)} of ${fold.vh})`);
    // The rounds fold under the deal card: one tap opens them, and the fold says how many.
    const tap = page.locator(".logfold");
    if (!(await tap.innerText()).includes(`${moves.length} rounds`)) fail(`${name} done: the fold doesn't say "${moves.length} rounds"`);
    await tap.click();
    if ((await tap.getAttribute("aria-expanded")) !== "true") fail(`${name} done: the fold didn't open`);
  }
  try { await page.locator(".desk .log li").last().waitFor({ timeout: 15_000 }); } catch { fail(`${name} done: the haggle tray never showed`); }
  const seqs = await page.locator(".desk .log li").evaluateAll((ls) => ls.map((l) => Number(l.getAttribute("data-seq"))));
  if (JSON.stringify(seqs) !== JSON.stringify(moves.map((m) => m.seq))) fail(`${name} done: rows ${seqs} aren't the ledger's ${moves.map((m) => m.seq)}`);
  if (moves.at(-1)?.kind !== "accept" || moves.at(-1)?.price !== expected.home.deal?.total) fail(`${name} done: the last round isn't the accept at the cart's price`);
  if (/code bid|They ask/.test(await page.locator(".desk .log").innerText())) fail(`${name} done: the rounds still say "code bid" or "They ask"`);
  // Shopper copy names no model (W4, Round 2): the moves are "by an AI model", and which one is on the Proof page.
  if (!expected.home.label?.startsWith("recorded · ")) fail(`${name} done: week 1 has no recorded label`);
  if ((await page.locator(".dlabel").textContent()) !== "Recorded · moves by an AI model") fail(`${name} done: the desk doesn't say who made Goose's moves`);
  const caught = await page.locator(".desk .log li").evaluateAll((ls) => ls.map((l) => l.classList.contains("caught") && l.textContent!.includes("code countered instead")));
  if (JSON.stringify(caught) !== JSON.stringify(moves.map((m) => m.kind === "caught"))) fail(`${name} done: "code countered instead" marks rows ${caught}, not the rounds code caught`);
  const prices = await page.locator(".desk .log li > b").allTextContents();
  if (JSON.stringify(prices) !== JSON.stringify(moves.map((m) => `$${m.price}`))) fail(`${name} done: prices ${prices} aren't the ledger's`);
  const off = await overflow(page);
  if (off.length) fail(`${name} done: runs off the side:\n  ${off.join("\n  ")}`);
  await page.screenshot({ path: `${OUT}/a3b-${name}-done.png`, fullPage: true });
  console.log(`ok  ${name} done: rows ${seqs.join(", ")}`);
}

// W50a's check runs in both modes, never silently off: fake must not say "PayPal sandbox"; sandbox must (the control).
const health = await fetch(`${url}api/health`).then((r) => r.json() as Promise<{ payment?: string }>).catch(() => null);
if (!health?.payment) fail("/api/health didn't say which payment mode runs");
const fake = health.payment === "fake";
console.log(`ok  payment mode: ${health.payment}`);

const browser = await chromium.launch();
// The page opens settled, every round at full contrast (W4, Round 2). Asked to, with motion allowed, the replay brings the rounds in
// over its ~6 s, not all at once; by its end every row shows. Each row waits as a dashed placeholder, so a round has landed once its price shows.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  await page.goto(`${url}?wallet=1`);
  await page.locator(".desk .log li").last().waitFor({ state: "attached", timeout: 15_000 });
  const shown = () => page.locator(".desk .log li > b").evaluateAll((bs) => bs.filter((b) => Number(getComputedStyle(b).opacity) > 0.99).length);
  const settled = await shown(), rows = expected.home.desk?.moves.length ?? 0;
  if (settled !== rows) fail(`motion: the page opened with ${settled} of ${rows} rounds, not settled`);
  await live(page);
  await page.getByRole("button", { name: "Watch the week" }).click();
  // A replay that began has hidden a round within 2 s, and a page that never hides one stays red. Its ~6 s, and then every row shows.
  const first = await within(2_000, shown, (n) => n < rows);
  const last = await within(9_000, shown, (n) => n === rows);
  if (first >= rows || last !== rows) fail(`motion: ${first} of ${rows} rounds at once, ${last} at the replay's end`);
  console.log(`ok  motion: ${first} of ${rows} round(s) at first, all ${last} by the replay's end`);
  await page.close();
}
try {
  for (const [size, w, h] of [["desktop", 1440, 900], ["phone", 390, 844]] as const) {
    for (const scheme of ["light", "dark"] as const) {
      const name = scheme === "dark" ? `${size}-dark` : size;
      const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: scheme, reducedMotion: "reduce" });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      await check(page, name, "home");
      await check(page, name, "empty");
      await done(page, name);
      // Ask on the wallet still says chips don't steer a run (A1's honesty line).
      await page.locator("#want").fill("a kettle like mine");
      await page.getByRole("button", { name: "Ask", exact: true }).click();
      try { await page.getByText(CHIPS_IN_RUNS).waitFor({ timeout: 15_000 }); } catch { fail(`${name}: chips showed without "${CHIPS_IN_RUNS}"`); }
      // "I saw it for", under the answer: a 44 px box, and empty, its "$" wears the hint's colour, so the hint never reads as a price already typed.
      const saw = await page.locator(".sawbox").evaluate((b) => ({ h: b.getBoundingClientRect().height, v: b.querySelector("input")!.value, ink: [getComputedStyle(b.querySelector("span[aria-hidden]")!).color, getComputedStyle(b.querySelector("input")!, "::placeholder").color] })).catch(() => null);
      if (!saw || saw.h < 44) fail(`${name}: no 44 px "I saw it for" box under the answer`);
      if (saw.v === "" && saw.ink[0] !== saw.ink[1]) fail(`${name}: the empty field's "$" (${saw.ink[0]}) isn't the hint's colour (${saw.ink[1]})`);
      // The flag off: the classic page, untouched. Since Joshua's Oct 30 change the bare address opens the Desk, so the
      // classic page is `?wallet=0` (Track J: the bare address here failed on the Desk, never on the classic page).
      await page.goto(`${url}?wallet=0`);
      await page.locator("#root > *").first().waitFor({ timeout: 20_000 });
      if (await page.locator(".wallet").count()) fail(`${name}: the wallet shows with no flag`);
      if (!(await page.locator(".page > .brand").isVisible())) fail(`${name}: the current home's header is hidden with no flag`);
      if (errors.length) fail(`${name}: the page logged errors:\n  ${errors.slice(0, 3).join("\n  ")}`);
      console.log(`ok  ${name} flag off: the current home`);
      await page.close();
    }
  }
} finally { await browser.close(); }

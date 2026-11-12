/// <reference lib="dom" />
// Screenshots of the running app, one per state, for review (guild-visual) and the milestone doc: desktop 1280×800
// and phone 390×844. Each shot waits for the text its state must show and asserts it, so a picture of an
// unfinished or wrong state can't pass as evidence (shared Lesson 3). Exits 1 if a state is never reached, a lane
// mark names no ledger row (project Lesson 21), or anything runs off the side or hides its end (scripts/overflow.ts).
//
// What it spends: each browser makes up to 3 real, unapproved sandbox orders (the guard-off control, its own cap),
// and one fresh press per browser is a live Haiku haggle when the key is set (one of the day's capped haggles).
// Weeks 1 and 3 are recorded replays and cost nothing.
//
//   pnpm screens [url] [no-ai-url]   default http://localhost:5173 (start it with pnpm dev); the second address, a
//                                    server with BUYER=rule (e.g. http://localhost:8790), adds the two no-AI states
//   writes docs/screens/m2-{desktop,phone}-<state>.png
//   pnpm screens --safe [url]       only "See how it keeps you safe" (5b): writes docs/screens/5b-{desktop,phone}-<state>.png.
//                                    Spends nothing on a server started with PAYMENT=fake and no key: week 1 is a recorded
//                                    replay, the note goes to the plain rule and the control order to the fake port.

import { localOnly } from "./not-live.ts";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { APPROVAL_TTL_MS, haikuLine, type OpenResults } from "@goose/core";
import { overflow } from "./overflow.ts";

const SAFE = process.argv[2] === "--safe";
const args = SAFE ? process.argv.slice(3) : process.argv.slice(2);
const url = localOnly((args[0] ?? "http://localhost:5173/").replace(/\/?$/, "/"));
const noAi = args[1]?.replace(/\/?$/, "/");
const OUT = "docs/screens";
function fail(m: string): never { console.error(`SCREENS FAIL: ${m}`); process.exit(1); }

const FINISHED = /^(Replay market #\d+|Run market #\d+ again)$/;
const CAPPED = "You've made this browser's 3 control orders for today";

async function shot(page: Page, name: string, state: string, texts: Array<string | RegExp>) {
  for (const t of texts) {
    // A visible copy: the same words may also sit in a line the phone hides (the buyer label is in the heading and the lane).
    try { await page.getByText(t).locator("visible=true").first().waitFor({ state: "visible", timeout: 60_000 }); }
    catch { fail(`${name} ${state}: never showed ${String(t)}`); }
  }
  const off = await overflow(page);
  if (off.length) fail(`${name} ${state}: runs off the side:\n  ${off.join("\n  ")}`);
  await page.screenshot({ path: `${OUT}/m2-${name}-${state}.png`, fullPage: true });
  console.log(`ok  ${name} ${state}`);
}

/** Pick a chip, send it, and wait until both cards have answered. Returns the guard-off card's state. */
async function sendNote(page: Page, chip: RegExp | null): Promise<string> {
  if (chip) await page.getByRole("button", { name: chip }).click();
  // The card from the last send is still on screen, so wait for this send's own control request to end, then for
  // the box to be idle again; only then is the card this send's answer.
  const ended = new Promise<void>((resolve) => {
    const h = (req: { url(): string; method(): string }) => {
      if (!req.url().endsWith("/api/control") || req.method() !== "POST") return;
      page.off("requestfinished", h); page.off("requestfailed", h); resolve();
    };
    page.on("requestfinished", h); page.on("requestfailed", h);
  });
  await page.getByRole("button", { name: "Send to Goose" }).click();
  const idle = Promise.all([ended, page.locator("button.send:not([disabled])").waitFor({ timeout: 30_000 })]);
  try { await Promise.race([idle, new Promise((_, no) => setTimeout(no, 30_000).unref())]); }
  catch { fail("the guard-off card never answered"); }
  await page.locator("button.send:not([disabled])").waitFor({ timeout: 30_000 });
  return (await page.locator('[data-card="guard-off"]').getAttribute("data-state")) ?? "";
}

async function press(page: Page, path: string, base = url) {
  await page.goto(base + path);
  await page.getByRole("button", { name: "Go find it" }).click();
  try { await page.getByText(FINISHED).waitFor({ state: "visible", timeout: 90_000 }); }
  catch { fail(`the run at /${path} never finished`); }
}

/** Every lane mark and step names a row the ledger shows, as a card or a grid row (or folds into a shown row). */
async function marksBacked(page: Page, name: string) {
  const { marks, rows } = await page.evaluate(() => ({
    marks: [...document.querySelectorAll(".lanes [data-seq], .steps [data-seq], .cap[data-seq], .saved[data-seq]")].map((e) => Number(e.getAttribute("data-seq"))),
    // The cards and the AG Grid both carry the row's seq and the seqs folded into it (Track C).
    rows: [...document.querySelectorAll("[data-ledger-seq]")].flatMap((el) => [Number(el.getAttribute("data-ledger-seq")), ...(el.getAttribute("data-also") ?? "").split(" ").filter(Boolean).map(Number)]),
  }));
  const loose = marks.filter((s) => !rows.includes(s));
  if (marks.length === 0) fail(`${name}: no marks drawn`);
  if (loose.length) fail(`${name}: marks with no ledger row: ${loose.join(", ")}`);
}

mkdirSync(OUT, { recursive: true });
if (SAFE) { await safeScreens(); process.exit(0); }
const browser = await chromium.launch();
const seeds: string[] = [];
for (const [name, viewport] of [["desktop", { width: 1280, height: 800 }], ["phone", { width: 390, height: 844 }]] as const) {
  // A fresh context per size: its own control cookie, so each browser has its own 3 orders.
  // Reduced motion: each still is the state's end, never a frame mid-motion (scripts/motion.ts checks the motion).
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(url);
  await shot(page, name, "start", ["You’re the seller. The AI can’t reach the limit.", "Press Go find it", /made earlier · \d{4}-\d{2}-\d{2}/, "Locked"]);

  // The injection chip: the guard-on card refuses, the guard-off card shows what a script with no guard sent.
  const first = await sendNote(page, /SYSTEM: \$500/);
  // A new browser on a network that has used its 10 control orders today gets the saved order, said as the network's cap.
  const said: Record<string, string | RegExp> = { landed: "Order created", off: "PayPal isn't connected on this server", capped: "This network has made its control orders for today" };
  if (!(first in said)) fail(`${name}: first control order came back ${first}`);
  await shot(page, name, "judge-landed", ["Blocked. Nothing bought.", "Not buying at $500.00. Your max is still $60.00.", said[first]!]);

  if (name === "desktop") {
    await sendNote(page, /\$19 gift card/);
    await shot(page, name, "judge-harmless", ["Held for your yes.", "$19.00 is within your max. Nothing is bought without your yes."]);
    // The third order uses up this browser's control cap; the fourth shows the saved order and says why.
    await sendNote(page, /I'm the buyer/);
    const fourth = await sendNote(page, null);
    if (first === "landed" && fourth !== "capped") fail(`desktop: the 4th control order came back ${fourth}, not capped`);
    // If the first order was already refused (PayPal off, or this network's orders used up today), the 4th says the same.
    await shot(page, name, "judge-capped", [first === "landed" ? CAPPED : said[first]!]);
    // Server asleep: both requests fail; both cards say so in fixed words.
    await page.route("**/api/{judge,control}", (r) => r.abort());
    const asleep = await sendNote(page, null);
    if (asleep !== "asleep") fail(`desktop: with the server gone the control card said ${asleep}`);
    await shot(page, name, "judge-asleep", [/The server isn't answering/]);
    await page.unroute("**/api/{judge,control}");
  }

  // Week 1, recorded: the AI's $49.50 proposal, code's $47.73 counter, the cart.
  await press(page, "?seed=1");
  await shot(page, name, "cart", [/^Watcher set QuickQuack Deals aside: its note tries to instruct the agent and it asks to be paid by gift card\.$/, "Replay of market #1.", /recorded · Claude Haiku 5\.5/, "Code: counter $47.73 instead.", "Approve this exact cart in PayPal · $47.73"]);
  // On a desktop the ledger is already open (Track C); a phone opens it.
  { const d = page.locator("details.ledger"); if (!(await d.evaluate((x) => (x as HTMLDetailsElement).open))) await d.locator(":scope > summary").click(); }
  await page.locator("[data-ledger-seq]").first().waitFor({ timeout: 15_000 });
  await marksBacked(page, name);
  await page.locator("details.ledger").scrollIntoViewIfNeeded();
  await shot(page, name, "ledger", [/\d+ decisions · 3 sellers, \d rounds/, /^never shown to the agent$/]);

  // Week 3, recorded: both sellers with a record ask over the max; the agent walks.
  await press(page, "?seed=3");
  await shot(page, name, "walk", ["No deal: the agent walked away.", "Nothing was bought and nothing was charged."]);

  // A fresh market: live Haiku within the day's cap, else the plain rule or a recording, with the reason shown.
  await press(page, "");
  const seed = await page.evaluate(() => document.querySelector("[data-seed]")?.getAttribute("data-seed") ?? "");
  seeds.push(seed);
  await shot(page, name, "fresh", [/(buyer: )?(Claude Haiku 5\.5, live|plain rule, no AI|recorded · )/]); // the phone shows it in the agent's lane only
  await ctx.close();
}
// A server with live AI off (BUYER=rule; launch config goose-built-no-ai): a fresh press replays a recording and
// says why; a number with no recording falls back to the plain rule and says why. Neither spends anything.
if (noAi) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await press(page, "", noAi);
  await shot(page, "desktop", "recorded-note", ["Live AI is off on this server, so this is a recorded run.", /buyer: recorded · Claude Haiku 5\.5/]);
  await press(page, "?seed=777", noAi);
  await shot(page, "desktop", "rule-reason", ["Live AI is off on this server and market #777 has no recording at $60.00, so a plain rule is buying.", "buyer: plain rule, no AI"]);
  await ctx.close();
}
await browser.close();
// Two fresh presses, two markets (project Lesson 18); compared on the number the page shows, not on model text.
if (seeds.some((s) => !/^\d+$/.test(s) || Number(s) <= 3)) fail(`a fresh press showed no fresh market number (got ${JSON.stringify(seeds)})`);
if (seeds[0] === seeds[1]) fail(`two fresh presses used the same market #${seeds[0]}`);
console.log(`SCREENS PASS: ${OUT}/m2-*.png (every mark backed, two fresh markets differed)`);

/**
 * Every visible text's colour against the background it sits on (the nearest solid one above it): the smallest ratio,
 * and each run of text under 4.5:1 (WCAG AA). Gradients count as their solid fallback underneath.
 */
async function contrast(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r, g, b]: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!); };
    const bg = (el: Element | null): number[] => {
      for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c[3] ?? 1) > 0.5) return c; }
      return [255, 255, 255];
    };
    const out: string[] = [];
    for (const el of document.querySelectorAll("body *")) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
      const r = el.getBoundingClientRect();
      if (!own || r.width === 0 || getComputedStyle(el).visibility === "hidden" || el.closest("details:not([open]) > :not(summary)") || el.closest("[disabled]") || parseFloat(getComputedStyle(el).fontSize) === 0) continue;
      const a = lum(rgb(getComputedStyle(el).color)), b = lum(bg(el));
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (ratio < 4.5) out.push(`<${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}> "${el.textContent!.trim().slice(0, 30)}" ${ratio.toFixed(2)}:1`);
    }
    return [...new Set(out)].slice(0, 5);
  });
}

/** 5b, "See how it keeps you safe": each step on desktop and at 390 px, every claim waited for and checked. */
async function safeScreens() {
  // Read, never typed (N26): the sentence the page must show is the file's.
  const haiku = haikuLine(JSON.parse(readFileSync("spikes/s3-claude/results-open.json", "utf8")) as OpenResults).sentence;
  const minutes = `expires in ${APPROVAL_TTL_MS / 60_000} minutes`;
  const browser = await chromium.launch();
  const snap = async (page: Page, name: string, state: string, texts: Array<string | RegExp>, full = false) => {
    for (const t of texts) {
      try { await page.getByText(t).locator("visible=true").first().waitFor({ state: "visible", timeout: 30_000 }); }
      catch { fail(`5b ${name} ${state}: never showed ${String(t)}`); }
    }
    const off = await overflow(page);
    if (off.length) fail(`5b ${name} ${state}: runs off the side:\n  ${off.join("\n  ")}`);
    const low = await contrast(page);
    if (low.length) fail(`5b ${name} ${state}: text under 4.5:1:\n  ${low.join("\n  ")}`);
    await page.screenshot({ path: `${OUT}/5b-${name}-${state}.png`, fullPage: full });
    console.log(`ok  5b ${name} ${state}`);
  };
  /** Every "Proof ›" names a row the ledger table holds, and opening one shows that row. */
  const proofs = async (page: Page, name: string) => {
    const { proof, rows } = await page.evaluate(() => ({
      proof: [...document.querySelectorAll("[data-proof]")].map((e) => Number(e.getAttribute("data-proof"))),
      rows: [...document.querySelectorAll("tr[data-seqs]")].flatMap((tr) => tr.getAttribute("data-seqs")!.split(" ").map(Number)),
    }));
    const loose = proof.filter((n) => !rows.includes(n));
    if (proof.length < 4) fail(`5b ${name}: only ${proof.length} Proof links`);
    if (loose.length) fail(`5b ${name}: Proof with no ledger row: ${loose.join(", ")}`);
    return proof.length;
  };
  const send = async (page: Page) => {
    await page.getByRole("button", { name: "Send the note" }).click();
    try { await page.locator("[data-answer]").waitFor({ timeout: 30_000 }); } catch { fail("5b: the note was never answered"); }
  };
  for (const scheme of ["light", "dark"] as const) {
    for (const [name, viewport] of [["desktop", { width: 1280, height: 800 }], ["phone", { width: 390, height: 844 }]] as const) {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, reducedMotion: "reduce", colorScheme: scheme });
      const page = await ctx.newPage();
      const dark = scheme === "dark" ? "-dark" : "";
      // W38: reading the story starts no run, so a visit makes no order; the only POSTs are the visitor's own Send.
      const posted: string[] = [];
      page.on("request", (r) => { if (r.method() === "POST") posted.push(new URL(r.url()).pathname); });
      await page.goto(`${url}safe.html`);
      if (name === "desktop") {
        await snap(page, name, `start${dark}`, ["See how it keeps you safe.", "Locked by code", /This exact cart only · \d+ min/, "Not yet:", "Counter $47.73 instead.", minutes, haiku]);
        if (posted.length) fail(`5b: the page POSTed on load (${posted.join(", ")}); W38 says a visit makes no order`);
        if (await page.getByText("Approve in PayPal").count()) fail("5b: a custom button must not say \"Approve in PayPal\"");
        if (dark) { await ctx.close(); continue; }
        const n = await proofs(page, name);
        await snap(page, name, "full", [haiku], true);
        await page.locator("#c2").scrollIntoViewIfNeeded();
        await page.evaluate(() => document.getElementById("c2")!.scrollIntoView({ block: "start" }));
        await send(page);
        // The same beat: the control card has its answer in the same render as the stamp.
        const control = await page.locator("[data-control]").getAttribute("data-control");
        if (control === "saved") fail("5b desktop: the Blocked stamp landed before the control card answered");
        await snap(page, name, "sent", ["Blocked. Nothing bought.", control === "landed" ? "Just now · your note's price" : "Made earlier"]);
        await page.evaluate(() => document.getElementById("c4")!.scrollIntoView({ block: "start" }));
        await snap(page, name, "haggle", ["below their opening ask", "overruled", /recorded · Claude Haiku 5\.5/, "seller · data", "dropped its price unprompted", "Plain code checks every move and can change it."]);
        if (posted.some((x) => x !== "/api/judge" && x !== "/api/control")) fail(`5b: unexpected POST ${posted.join(", ")}`);
        await page.evaluate(() => document.getElementById("c5")!.scrollIntoView({ block: "start" }));
        await page.locator("#c5 [data-proof]").click();
        await snap(page, name, "yes", ["This exact cart only", minutes, /^Ledger row \d+ · guard · \$47\.73$/]);
        console.log(`    ${n} Proof links, each a ledger row`);
      } else {
        await snap(page, name, `step-1${dark}`, ["See how it keeps you safe.", "Locked by code", /^All limits · \d+ ›$/, "Not yet:"]);
        if (posted.length) fail(`5b phone: the page POSTed on load (${posted.join(", ")}); W38 says a visit makes no order`);
        if (dark) {
          for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /^Next: / }).locator("visible=true").first().click();
          await page.getByRole("button", { name: /^See the haggle/ }).click();
          await snap(page, name, `step-4${dark}`, ["overruled"]);
          await ctx.close(); continue;
        }
        await page.getByRole("button", { name: /^All limits/ }).click();
        await snap(page, name, "settings", ["Asks your yes", "Always ask", "Not yet:"]);
        await page.getByRole("button", { name: "Next: a seller tries a trick ›" }).click();
        await send(page);
        await snap(page, name, "step-2-sent", ["2 of 5 · The trick", "Blocked. Nothing bought.", "AI · off on this server"]);
        await page.getByRole("button", { name: "Next: the same note, no guard ›" }).click();
        await snap(page, name, "step-3", ["3 of 5 · The $500", "Without the guard, nothing stops the $500."]);
        await page.getByRole("button", { name: "Next: how it haggles ›" }).click();
        await snap(page, name, "step-4", ["4 of 5 · The haggle", "below their opening ask"]);
        await page.getByRole("button", { name: /^See the haggle/ }).click();
        await page.locator("#c4 .stamp").scrollIntoViewIfNeeded();
        await snap(page, name, "step-4-open", ["Counter $47.73 instead."]);
        await page.getByRole("button", { name: "Next: your yes ›" }).click();
        await snap(page, name, "step-5", ["5 of 5 · Your yes", minutes, "Show all", "Recorded cart: no order exists"]);
        await proofs(page, name);
        await snap(page, name, "all", [haiku], true);
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log(`SCREENS PASS (5b): ${OUT}/5b-*.png (nothing off the side, no text under 4.5:1, every Proof a ledger row)`);
}

/// <reference lib="dom" />
// Screenshots of the A3 wallet mockup (docs/design/a3-wallet.html) for Joshua's critique and guild-visual: four states
// (home with a deal waiting, empty, asking, settings) plus the end of a haggle, × desktop 1440 and phone 390, plus the
// phone home in dark mode. Fails if the page's numbers drift from the engine (scripts/a3-ticks.ts) or a price is typed
// into the markup; if a phone page scrolls sideways; if a state's key text isn't on screen; if home says more than its
// one safety line, or a dev label, or "demo week" other than once; if the hero isn't the first thing on screen; if
// anything that looks like Approve is a control (a recorded cart can't be paid, W38); if a visible control (links
// included) is under 44 × 44 px; if the Ask Goose text is cut off; if the safety card's step count disagrees with
// web/src/Safe.tsx STEPS; if the phone puts the safety card above your week; or if a phone asking page grows past its
// cap (shared Lessons 1, 3, 4, 6).
// Re-runnable from the repo root: node scripts/a3-screens.ts
import { chromium, type Page } from "playwright";
import { resolve } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";
import { MOCKUP, a3Data, drift } from "./a3-ticks.ts";

function fail(m: string): never { console.error(`A3 FAIL: ${m}`); process.exit(1); }

// The numbers first: the page's #a3-data block must be the engine's output, and no price may sit in the markup itself.
const html = readFileSync(MOCKUP, "utf8");
const d = await a3Data();
const moved = drift(html, d);
if (moved) fail(`the mockup's numbers drifted from the engine: ${moved}`);
const markup = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
const typed = markup.match(/\$\d[\d,]*(\.\d\d)?/g);
if (typed) fail(`a price is typed into the markup (${typed.join(", ")}); fill it from #a3-data`);
console.log(`ok  numbers: #a3-data equals the engine (${d.ticks.length} ticks, rows ${d.ticks.map((t) => t.seq).join(", ")}), no price typed in the markup`);

const file = "file://" + resolve(MOCKUP);
const OUT = "docs/screens"; mkdirSync(OUT, { recursive: true });
const usd = (p: string) => `$${p}`;
const SAFETY = "Goose can’t pay. Only your tap in PayPal does.";
/** The done state's refusal line, from the engine's refused row (row 5): plain words, no "agent". */
function refusedLine() { const r = d.week.find((w) => w.kind === "refused")!; return `${r.item} ${r.note[0]!.toLowerCase()}${r.note.slice(1)}. Refused.`; }
const always = ["SIMULATED MARKET · fictional sellers · PayPal sandbox"];
const hero = [d.item, d.seller, usd(d.deal.total), `${usd(d.deal.below)} below`, `their ${usd(d.deal.opening)} ask`, "recorded, can’t be paid", `expires in ${d.deal.minutes} minutes`, "Replay this week to approve it yourself"];
const expect: Record<string, string[]> = {
  home: [...hero, SAFETY, "Want something else?", "How Goose keeps you safe", "Your week", "demo week", "you paid", "to approve", "refused"],
  empty: ["What should Goose find?", SAFETY, "How Goose keeps you safe", "Your week", "demo week", "you paid"],
  asking: ["kettle", "from your week", "under your limit", "from a fictional catalog", "Checked by code", "Go: find it and haggle", "Goose used this for “black”"],
  done: [`Haggling with ${d.seller}`, "From the ledger", `${usd(d.deal.below)} below`, refusedLine(), "recorded, can’t be paid", "Replay this week to approve it yourself", SAFETY],
  settings: ["Your limits", usd(d.limits.kitchen), usd(d.limits.perPurchase), usd(d.limits.weekly), "Which categories ask first", "Asks first", "Ready without questions, still one tap", "Undo refunds it"],
};
// Off the home (Joshua, round 2): the limit card, the spent line and the offer bound live in Settings now; no dev labels.
const notOnHome = [/planned · M3/i, /spent without your yes/i, /≤ ?\$/, /Locked by code/i, /\bM3\b/, /Goose is on/i, /\bdays? ago\b/i, /\bagent\b/i];
// The step count on the safety card must be the shipped page's (web/src/Safe.tsx STEPS), read, never retyped.
const steps = (readFileSync("web/src/Safe.tsx", "utf8").match(/const STEPS = \[([^\]]*)\]/)?.[1] ?? "").split(",").filter((x) => x.trim()).length;
const word = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"][steps];
// Words the mockup must never say (honesty rules): the agent never buys on its own, approval is a tap, not a "yes" said
// aloud, nothing listens, and no real brand appears (a few kitchen and store brands as the tripwire).
const banned = [/bought it for you/i, /say yes/i, /wake word/i, /listening/i, /\$\d+(\.\d\d)? ?(or less|max)\b.*under your limit/i, /\b(KitchenAid|Cuisinart|Breville|Smeg|Hamilton Beach|De'?Longhi|Amazon|Walmart|eBay|Etsy)\b/i];
const count = (body: string, s: string) => body.toLowerCase().split(s.toLowerCase()).length - 1;

const browser = await chromium.launch();
const shots: [string, { width: number; height: number }, "light" | "dark", string][] = [];
for (const state of Object.keys(expect)) {
  shots.push([state, { width: 1440, height: 900 }, "light", `a3-${state}-desktop.png`]);
  shots.push([state, { width: 390, height: 844 }, "light", `a3-${state}-phone.png`]);
}
shots.push(["home", { width: 390, height: 844 }, "dark", "a3-home-phone-dark.png"]);

/** The end of a haggle: Go pressed, waited for until the page marks the last row landed (a named wait, Lesson 3). */
async function haggled(page: Page, name: string) {
  await page.getByRole("button", { name: /^Go: find it and haggle/ }).click();
  await page.locator("body[data-done]").waitFor({ timeout: 15_000 }).catch(() => fail(`${name}: the haggle never reached its last row`));
  const rows = await page.locator("#trows li").evaluateAll((ls) => ls.map((l) => `${l.getAttribute("data-seq")}:${l.querySelector("b.ap")?.textContent}`));
  const want = d.ticks.map((t) => `${t.seq}:${usd(t.price)}`);
  if (rows.join() !== want.join()) fail(`${name}: the haggle's rows are ${rows.join(" ")}, the engine's are ${want.join(" ")}`);
  // Goose's own bid each round: its real counter row, nothing else.
  const bids = await page.locator("#trows [data-goose]").evaluateAll((ls) => ls.map((l) => `${l.getAttribute("data-goose")}:${l.querySelector("b")?.textContent}`));
  const wantBids = d.ticks.filter((t) => t.goose).map((t) => `${t.goose!.seq}:${usd(t.goose!.price)}`);
  if (bids.join() !== wantBids.join()) fail(`${name}: Goose's bids show ${bids.join(" ") || "none"}, the engine's are ${wantBids.join(" ")}`);
  // One round number per round: the accept row carries a check, never a second "4".
  const nums = await page.locator("#trows .rd1").evaluateAll((ls) => ls.map((l) => l.textContent!.trim()).filter(Boolean));
  if (new Set(nums).size !== nums.length) fail(`${name}: a round number repeats in the haggle (${nums.join(" ")})`);
  // Row numbers and the label are behind "From the ledger": hidden until it's opened, then every row is named.
  if (await page.locator("#trows .rn").first().isVisible()) fail(`${name}: row numbers show before "From the ledger" is opened`);
  const cur = await page.locator("[data-tick] .cur").innerText();
  if (cur !== usd(d.deal.total)) fail(`${name}: the haggle ends on ${cur}, the bound cart is ${usd(d.deal.total)}`);
}

for (const [state, viewport, colorScheme, out] of shots) {
  const name = `${viewport.width}/${state}${colorScheme === "dark" ? "/dark" : ""}`;
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2, colorScheme });
  await page.goto(`${file}?state=${state === "done" ? "asking" : state}`);
  if (state === "done") await haggled(page, name);
  for (const text of [...always, ...expect[state]!]) {
    if (!(await page.getByText(text, { exact: false }).locator("visible=true").first().isVisible())) fail(`${name}: "${text}" not on screen`);
  }
  const body = await page.evaluate(() => document.body.innerText);
  for (const re of banned) if (re.test(body)) fail(`${name}: banned wording ${re}`);
  if (/under your limit \(\$|under \$/.test(body)) fail(`${name}: the "under your limit" chip shows an amount`);
  if (state !== "settings") {
    for (const re of notOnHome) if (re.test(body)) fail(`${name}: ${re} belongs off the home (Settings, or behind "How Goose keeps you safe")`);
    if (count(body, "seeded") > 1) fail(`${name}: "seeded" shows ${count(body, "seeded")} times (at most once)`);
    if (count(body, "demo week") !== 1) fail(`${name}: "demo week" shows ${count(body, "demo week")} times (exactly once)`);
    const safety = count(body, SAFETY);
    if (state !== "asking" && safety !== 1) fail(`${name}: the safety line shows ${safety} times (exactly once)`);
    if (state === "asking" && safety > 1) fail(`${name}: the safety line shows ${safety} times`);
    // Approve is a picture on a recorded week: nothing that says Approve may be a link or a button (W38).
    const approveCtl = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("a, button, [role=button]")].filter((el) => el.offsetParent !== null && /^\s*approve/i.test(el.textContent || "")).length);
    if (approveCtl) fail(`${name}: ${approveCtl} control(s) say Approve; a recorded cart's Approve is a picture, the replay is the action`);
    const card = await page.locator(".safe span").first().innerText();
    const m = card.match(/^(\w+) steps/i);
    if (m && m[1]!.toLowerCase() !== word) fail(`${name}: the safety card says "${m[1]} steps", web/src/Safe.tsx STEPS has ${steps}`);
    if (/^bought$|paid with one tap/im.test(body)) fail(`${name}: say "you paid", not "bought" or "paid with one tap"`);
  }
  // The hero is the first thing on screen: the deal (home) or Ask (empty), above everything else, its action in view.
  if (state === "home" || state === "empty") {
    const sel = state === "home" ? ".hero" : ".ask";
    const pos = await page.evaluate((sel) => {
      const h = document.querySelector(sel)!.getBoundingClientRect();
      const others = [...document.querySelectorAll(".hero, .ask, .week, .safe")].filter((e) => e !== document.querySelector(sel) && (e as HTMLElement).offsetParent !== null).map((e) => e.getBoundingClientRect().top);
      const act = document.querySelector(sel === ".hero" ? ".hero .replay" : "#want")!.getBoundingClientRect();
      return { top: h.top, firstOther: Math.min(...others), actBottom: act.bottom, vh: innerHeight };
    }, sel);
    if (pos.top > pos.firstOther + 1) fail(`${name}: the hero (${sel}) isn't the first thing on screen`);
    if (pos.actBottom > pos.vh) fail(`${name}: the hero's action ends at ${Math.round(pos.actBottom)}px, below the first screen (${pos.vh}px)`);
  }
  if (viewport.width < 900 && state !== "settings") {
    const order = await page.evaluate(() => document.querySelector(".week")!.getBoundingClientRect().top < document.querySelector(".safe")!.getBoundingClientRect().top);
    if (!order) fail(`${name}: on a phone, your week must sit above "How Goose keeps you safe"`);
  }
  // Phone height caps: the asking page stays one short scroll; the haggle's end adds the price, its five rows and the
  // deal's action, so it gets its own cap rather than loosening the first.
  const cap = { asking: 1400, done: 1700 }[state as "asking" | "done"];
  if (viewport.width < 900 && cap) {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    if (h > cap) fail(`${name}: the phone ${state} page is ${h}px tall (max ${cap.toLocaleString("en-US")})`);
  }
  // Phone details: each count keeps 12 px from the next divider; the banner never starts a line with "·"; "kettle"
  // and "black" share a row.
  if (viewport.width < 900 && state !== "settings") {
    const tight = await page.evaluate(() => [...document.querySelectorAll(".tile")].slice(0, -1).map((t) => t.querySelector(".t")!.getBoundingClientRect().right - (t.nextElementSibling as HTMLElement).getBoundingClientRect().left).filter((g) => g > -12));
    if (tight.length) fail(`${name}: a count sits ${tight.map((g) => Math.round(-g)).join(", ")} px from the next divider (min 12)`);
  }
  const dot = await page.evaluate(() => { const b = document.querySelector(".banner")!; const left = b.getBoundingClientRect().left + parseFloat(getComputedStyle(b).paddingLeft); return [...b.children].filter((s) => s.getBoundingClientRect().left <= left + 1 && /^·/.test(s.textContent!.trim())).length; });
  if (dot) fail(`${name}: a banner line starts with "·"`);
  if (state === "asking" && viewport.width < 900) {
    const [k, b] = await page.locator("#chips .chip").evaluateAll((ls) => ls.slice(0, 2).map((l) => l.getBoundingClientRect().top));
    if (k !== b) fail(`${name}: "kettle" and "black" don't share a row`);
  }
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (sideways > 0) fail(`${name}: page scrolls sideways by ${sideways}px`);
  const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("a, button, input, textarea, select, summary, [role=switch], [role=radio], [tabindex]")]
    .filter((el) => el.offsetParent !== null || el.getClientRects().length > 0)
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && (r.height < 44 || r.width < 44))
    .map(({ el, r }) => `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`));
  // Named checks: the back link's hit area, and no tappable control for anything not built.
  const back = await page.locator(".back").filter({ visible: true }).first().boundingBox().catch(() => null);
  if (state === "settings" && (!back || back.width < 44 || back.height < 44)) fail(`${name}: "‹ Home" hit area is ${back ? `${Math.round(back.width)}×${Math.round(back.height)}` : "missing"}`);
  const dead = await page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => (b as HTMLElement).offsetParent !== null && /^(undo|review|change limits)$/i.test((b.textContent || "").trim())).length);
  if (dead) fail(`${name}: ${dead} control(s) for something not built`);
  if (small.length) fail(`${name}: touch targets under 44 px: ${small.join("; ")}`);
  // The Ask Goose text (typed want, or the placeholder) must fit its box, not be cut off mid-word.
  const cut = await page.evaluate(() => {
    // A textarea that wraps: cut off means its text (or placeholder) is taller than the box. One line or two, never clipped.
    const el = document.getElementById("want") as HTMLTextAreaElement;
    return el.clientWidth === 0 ? 0 : el.scrollHeight - el.clientHeight;
  });
  if (cut > 1) fail(`${name}: Ask Goose text is cut off by ${cut}px`);
  await page.screenshot({ path: `${OUT}/${out}`, fullPage: true });
  if (state === "done") {
    await page.locator("#ledgerbtn").click();
    for (const text of [d.label, ...d.ticks.map((t) => `row ${t.seq}`)]) if (!(await page.getByText(text).locator("visible=true").first().isVisible())) fail(`${name}: "From the ledger" doesn't show "${text}"`);
  }
  // A switch must switch: clicking it flips aria-checked (a control that does nothing fails below as dead).
  for (const sw of await page.locator("[role=switch]").filter({ visible: true }).all()) {
    const before = await sw.getAttribute("aria-checked"); await sw.click();
    if ((await sw.getAttribute("aria-checked")) === before) fail(`${name}: a switch didn't switch`);
    await sw.click();
  }
  console.log(`ok  ${name} -> ${OUT}/${out}`);
  await page.close();
}
await browser.close();
console.log(`A3 PASS: ${shots.length} screens in ${OUT}/a3-*.png`);

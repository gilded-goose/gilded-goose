// What the Desk does around a run, walked in a real browser (Round 5's shopper seat; Joshua, Nov 4: "the page must never say Goose
// speaks if it doesn't"). The run's lines are clips requested and captions shown, only on a run her tap started; muted, no clip plays
// and the caption still shows. A reload asks for nothing. What it proves stops there: sound itself stays unheard on an iPhone (the
// iPhone check's job). It presses Approve only on a local fake rail: to read Cancel's way back, and to read a paid link from a stranger's browser.
//   node scripts/desk-walk.ts http://localhost:8823
import "./route-closed.ts"; // a route mid-request when its page closes ends quietly, nothing else does
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { greeting } from "../core/src/view/name.ts";
import { RETURN_ALREADY, RETURN_ALREADY_HEAD, RETURN_UNKNOWN, STOP_SAID, returnCard, returnKind } from "../core/src/view/return.ts";
import { localOnly } from "./not-live.ts";
import { THROWN, swapExport } from "./walk-throw.ts";

const url = localOnly((process.argv[2] ?? "http://localhost:8823").replace(/\/$/, ""));
const { chromium } = await import(`${process.cwd()}/node_modules/playwright/index.mjs`);
const fails: string[] = [];
const fail = (m: string) => { fails.push(m); console.error(`FAIL ${m}`); };
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

const browser = await chromium.launch();

/** One phone or desk page with its clip requests and every caption it shows, in order. */
/** True as soon as it holds, false if it never does in 3 s: a fixed wait and a read says "not yet" as "no" on a busy machine. */
async function within(holds: () => Promise<boolean>): Promise<boolean> {
  for (const end = Date.now() + 3000; ; await new Promise((r) => setTimeout(r, 50))) {
    if (await holds()) return true;
    if (Date.now() > end) return false;
  }
}
async function open(width: number, muted = false) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 720 ? 844 : 900 }, colorScheme: "dark", hasTouch: width < 720 });
  if (muted) await ctx.addInitScript(() => localStorage.setItem("gg-voice-muted-v1", "1"));
  await ctx.addInitScript(() => {
    (window as unknown as { caps: string[] }).caps = [];
    const seen = () => {
      const el = document.querySelector(".gv-cap p:not([aria-live])"), t = el?.textContent?.trim();
      const caps = (window as unknown as { caps: string[] }).caps;
      if (t && caps.at(-1) !== t) caps.push(t);
    };
    addEventListener("DOMContentLoaded", () => new MutationObserver(seen).observe(document.documentElement, { childList: true, subtree: true, characterData: true }));
  });
  const page = await ctx.newPage();
  const clips: string[] = [];
  page.on("request", (r: { url(): string }) => { const m = /\/voice\/([\w-]+)\.m4a/.exec(r.url()); if (m) clips.push(m[1]!); });
  return { ctx, page, clips, caps: () => page.evaluate(() => (window as unknown as { caps: string[] }).caps) as Promise<string[]> };
}

/** Types an ask, and presses Shop for this. */
async function shop(page: { goto: Function; getByRole: Function; waitForSelector: Function }, words: string) {
  await page.goto(`${url}/?desk=1`);
  await page.getByRole("textbox").first().fill(words);
  await page.getByRole("button", { name: "Ask Goose" }).click();
  await page.getByRole("button", { name: /Shop for this/ }).click();
}

const DEAL = "A Marsh Lights ticket under $90";
const FIRST = "shopping"; // speech.ts primes on the first clip it holds, so that one may repeat: compared after dropping it
const said = (clips: string[]) => clips.filter((c, i) => c !== clips[i - 1]).filter((c, i) => i > 0 || c !== "tap-approve");

// The deal: three lines, in order, as clips requested and captions shown.
for (const width of [390, 1440]) {
  const { ctx, page, clips, caps } = await open(width);
  await shop(page, DEAL);
  await page.waitForSelector(".dk-deal2 .dk-approve");
  await page.waitForFunction(() => (window as unknown as { caps: string[] }).caps.includes("Tap Approve to buy."), undefined, { timeout: 15000 }).catch(() => undefined);
  const lines = await caps(), heard = said(clips);
  console.log(`${width} deal: clips ${heard.join(", ")}; captions: ${lines.join(" | ")}`);
  if (!same(heard, [FIRST, "set-aside", "tap-approve"])) fail(`${width}: a deal's clips were ${heard.join(", ")}`);
  if (!same(lines, ["Shopping for it now.", "Set aside. Nothing is paid without your tap.", "Tap Approve to buy."])) fail(`${width}: a deal's captions were ${lines.join(" | ")}`);
  await ctx.close();
}

// Muted: no clip the shopper would hear (the first tap's silent unlock is muted by speech.ts, and isn't a line); the words still show.
{
  const { ctx, page, clips, caps } = await open(390, true);
  await shop(page, DEAL);
  await page.waitForSelector(".dk-deal2 .dk-approve");
  await page.waitForFunction(() => (window as unknown as { caps: string[] }).caps.includes("Tap Approve to buy."), undefined, { timeout: 15000 }).catch(() => undefined);
  const lines = await caps();
  console.log(`muted: clips ${clips.join(", ") || "none"}; captions: ${lines.join(" | ")}`);
  if (clips.some((c) => ["shopping", "set-aside"].includes(c))) fail(`muted, a line's clip still loaded: ${clips.join(", ")}`);
  if (!lines.includes("Tap Approve to buy.")) fail(`muted, the words stopped showing: ${lines.join(" | ")}`);
  await ctx.close();
}

// No deal: the last line says so, and never "Tap Approve".
{
  const { ctx, page, clips, caps } = await open(390);
  await shop(page, "A Marsh Lights ticket under $5");
  await page.waitForFunction(() => (window as unknown as { caps: string[] }).caps.includes("No cart this time. Nothing was charged."), undefined, { timeout: 20000 }).catch(() => undefined);
  const lines = await caps(), heard = said(clips);
  console.log(`no deal: clips ${heard.join(", ")}; captions: ${lines.join(" | ")}`);
  if (lines.at(-1) !== "No cart this time. Nothing was charged." || lines.includes("Tap Approve to buy.")) fail(`no deal's captions were ${lines.join(" | ")}`);
  await ctx.close();
}

// A reload is nobody's tap: no clip requested, no caption shown.
{
  const { ctx, page, clips, caps } = await open(390);
  await shop(page, DEAL);
  await page.waitForSelector(".dk-deal2 .dk-approve");
  clips.length = 0;
  await page.reload();
  await page.waitForTimeout(2500);
  const lines = await caps();
  console.log(`reload: clips ${clips.join(", ") || "none"}; captions: ${lines.join(" | ") || "none"}`);
  if (clips.length || lines.length) fail(`a reload spoke: ${clips.join(", ")} | ${lines.join(" | ")}`);
  await ctx.close();
}

// Back and reload (Round 5's shopper seat, B1). Every case starts on a page outside the site, as the seat's did: leaving is the bug.
const outside = "about:blank";
const atDesk = async (page: { url(): string }) => page.url().startsWith(url);
{
  const { ctx, page, clips } = await open(390);
  await page.goto(outside);
  await shop(page, DEAL);
  await page.waitForSelector(".dk-deal2 .dk-approve");
  // Reload keeps the deal, finished and silent.
  clips.length = 0;
  await page.reload();
  await page.waitForSelector(".dk-deal2 .dk-approve", { timeout: 5000 }).catch(() => fail("a reload lost the deal"));
  await page.waitForTimeout(1500);
  if (clips.length) fail(`a reload spoke: ${clips.join(", ")}`);
  // The Why sheet: Back closes it, and the deal is still there.
  const why = page.getByRole("button", { name: /^Why/ }).first();
  if (await why.count()) {
    await why.click();
    await page.waitForSelector(".dk-sheet");
    await page.goBack();
    if (!(await within(async () => !(await page.locator(".dk-sheet").count())))) fail("Back didn't close the sheet");
    if (!(await page.locator(".dk-deal2 .dk-approve").count())) fail("Back from the sheet lost the deal");
  } else fail("no Why? to open on the deal");
  // Back from the deal: the landing, still on the site.
  await page.goBack();
  await page.waitForTimeout(300);
  if (!(await atDesk(page))) fail(`Back from a deal left the site, for ${page.url()}`);
  if (await page.locator(".dk[data-app]").count()) fail("Back from a deal stayed in the app");
  // Forward brings it back, finished; Back again; and only one more Back leaves.
  await page.goForward();
  await page.waitForSelector(".dk-deal2 .dk-approve", { timeout: 3000 }).catch(() => fail("Forward lost the deal"));
  await page.goBack();
  await page.waitForTimeout(300);
  await page.goBack();
  await page.waitForTimeout(300);
  if (await atDesk(page)) fail(`two Backs from a deal should have left, and it's still on ${page.url()}`);
  await ctx.close();
}
// Each room opened in place: Back is the landing, not the page before.
for (const room of ["wants", "week", "settings", "after"]) {
  const { ctx, page } = await open(1440);
  await page.goto(outside);
  await page.goto(`${url}/?desk=1`);
  await page.waitForTimeout(300);
  await page.evaluate((r: string) => dispatchEvent(new CustomEvent("goose:room", { detail: r, cancelable: true })), room);
  await page.waitForSelector(".dk[data-app]");
  await page.reload();
  await page.waitForSelector(".dk[data-app]", { timeout: 5000 }).catch(() => fail(`a reload lost the ${room} room`));
  await page.goBack();
  await page.waitForTimeout(300);
  if (!(await atDesk(page))) fail(`Back from ${room} left the site`);
  if (await page.locator(".dk[data-app]").count()) fail(`Back from ${room} stayed in the room`);
  await ctx.close();
}
// A room reached by its address is where she arrived: Back goes where she came from, and the hash is gone from the address as before.
{
  const { ctx, page } = await open(1440);
  await page.goto(outside);
  await page.goto(`${url}/?desk=1#wants`);
  await page.waitForSelector(".dk[data-app]");
  if (page.url().includes("#")) fail(`the hash stayed: ${page.url()}`);
  await page.goBack();
  await page.waitForTimeout(300);
  if (await atDesk(page)) fail("Back from a room she arrived at didn't go back to where she came from");
  await ctx.close();
}

// Offline wins (Round 5's shopper seat, nit 4): no live Approve under "You're offline."
{
  const { ctx, page } = await open(390);
  await shop(page, DEAL);
  const approve = page.locator(".dk-deal2 .dk-approve");
  await approve.waitFor();
  await ctx.setOffline(true);
  if (!(await within(() => approve.isDisabled()))) fail("offline, Approve stayed enabled");
  await ctx.setOffline(false);
  if (!(await within(() => approve.isEnabled()))) fail("back online, Approve stayed off");
  await ctx.close();
}

// A lost chunk never empties the page. Offline before a room's chunk came, or a tab left open across a release: a room says so and
// gives one way forward; an optional piece just isn't there, and what she was doing stays (Round 5: each of these left an empty root).
const openRoom = (page: { evaluate: Function }, room: string) => page.evaluate((r: string) => dispatchEvent(new CustomEvent("goose:room", { detail: r, cancelable: true })), room);
const headOf = (room: string) => (room === "after" ? "#ap-room-h" : "#root .dk-work .dk-pane-h");
for (const [room, chunk, width] of [["wants", "**/assets/Panes-*", 390], ["week", "**/assets/Panes-*", 1440], ["settings", "**/assets/Panes-*", 390], ["after", "**/assets/AfterPay-*", 1440], ["after", "**/assets/AfterPay-*", 390]] as const) {
  const { ctx, page } = await open(width);
  const said = `${room} at ${width}`;
  await ctx.route(chunk, (r: { abort(): unknown }) => r.abort());
  await page.goto(`${url}/?desk=1`);
  await page.waitForTimeout(400);
  await ctx.setOffline(true);
  await openRoom(page, room);
  const lost = page.locator(".dk-room-lost");
  await lost.waitFor({ timeout: 6000 }).catch(() => fail(`${said}: offline with its chunk gone, the room drew no state`));
  const offline = await lost.innerText().catch(() => "");
  if (!/This room didn't load\./.test(offline) || !/You're offline\./.test(offline)) fail(`${said}: offline it said ${offline}`);
  // The room takes focus just after it draws, and a loaded machine can read in between.
  await page.waitForFunction(() => document.activeElement?.classList.contains("dk-pane-h"), undefined, { timeout: 3000 }).catch(() => fail(`${said}: focus isn't on the lost room's head`));
  await page.getByRole("button", { name: "Back to Goose" }).click();
  if (!(await within(async () => !(await lost.count())))) fail(`${said}: Back to Goose stayed in the room`);
  if (!(await page.getByRole("textbox").first().isVisible())) fail(`${said}: Back to Goose didn't reach the Ask box`);
  await openRoom(page, room);
  await lost.waitFor({ timeout: 3000 }).catch(() => fail(`${said}: the lost room didn't come back`));
  // She's back: Reload, and the room opens.
  await ctx.setOffline(false);
  await ctx.unroute(chunk);
  const reload = lost.getByRole("button", { name: "Reload" });
  await reload.waitFor({ timeout: 3000 }).catch(() => fail(`${said}: back online, no Reload`));
  await reload.click().catch(() => undefined);
  await page.waitForSelector(headOf(room), { timeout: 8000 }).catch(() => fail(`${said}: Reload didn't open the room`));
  if (await lost.count()) fail(`${said}: still lost after Reload`);
  await ctx.close();
}
// Arriving at a room by its address, chunk gone: the cover over it lifts, and the state is what's left.
{
  const { ctx, page } = await open(390);
  await ctx.route("**/assets/AfterPay-*", (r: { abort(): unknown }) => r.abort());
  await page.goto(`${url}/?desk=1#after`);
  await page.locator(".dk-room-lost").waitFor({ timeout: 6000 }).catch(() => fail("a room reached by address, chunk gone, drew no state"));
  // The cover lifts just after the room draws, and a loaded machine can read in between.
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-first-room"), undefined, { timeout: 3000 }).catch(() => fail("the cover stayed over a lost room"));
  await ctx.close();
}
// A slow line: words, not a blank, and only if it's really slow.
{
  const { ctx, page } = await open(390);
  await ctx.route("**/assets/AfterPay-*", async (r: { continue(): unknown }) => { await new Promise((ok) => setTimeout(ok, 1800)); await r.continue(); });
  await page.goto(`${url}/?desk=1`);
  await page.waitForTimeout(400);
  await openRoom(page, "after");
  await page.waitForTimeout(800);
  const wait = page.locator(".dk-room-wait");
  if (!(await wait.count()) || !/Goose is loading this\./.test(await wait.innerText()) || (await wait.evaluate((e: Element) => getComputedStyle(e).opacity)) !== "1") fail("a slow room showed no words at 800 ms");
  await page.waitForSelector("#ap-room-h", { timeout: 8000 }).catch(() => fail("the slow room never came"));
  await ctx.close();
}
// An optional piece: gone, and the page she's on stays.
for (const chunk of ["**/assets/Egg-*", "**/assets/Story-*", "**/assets/MenuPanel-*"]) {
  const { ctx, page } = await open(390);
  await ctx.route(chunk, (r: { abort(): unknown }) => r.abort());
  await page.goto(`${url}/?desk=1`);
  await page.waitForTimeout(1500);
  if (chunk.includes("Menu")) {
    const menu = page.locator("button.gm-btn:visible").first();
    await menu.click();
    if (!(await within(async () => (await menu.getAttribute("aria-expanded")) === "true"))) fail("the menu's button never opened, so this proves nothing");
  }
  if (!(await page.getByRole("textbox").first().isVisible().catch(() => false))) fail(`${chunk} gone: the Ask box went with it`);
  await ctx.close();
}
{
  const { ctx, page } = await open(390);
  await ctx.route("**/assets/RealPrices-*", (r: { abort(): unknown }) => r.abort());
  const asked = page.waitForRequest(/RealPrices-/, { timeout: 25000 }).catch(() => null);
  await shop(page, DEAL);
  if (!(await asked)) fail("the run never asked for Real prices, so this proves nothing");
  await page.waitForTimeout(600);
  if (!(await page.locator(".dk-deal2 .dk-approve").count())) fail("Real prices lost: the deal and its Approve went with it");
  await ctx.close();
}

// Back-room charts: a phone doesn't mount seven at once below its fold (a 500 ms task), and every one of them still comes when it's reached.
{
  const { ctx, page } = await open(390);
  await page.goto(`${url}/?desk=ledger`);
  await page.waitForSelector(".lx-story", { state: "attached", timeout: 15000 });
  await page.waitForTimeout(2500);
  const count = () => page.evaluate(() => document.querySelectorAll("canvas").length);
  const atRest = await count();
  let y = 0, foot = 0;
  do { foot = await page.evaluate(() => document.documentElement.scrollHeight); y += 500; await page.evaluate((to: number) => scrollTo(0, to), y); await page.waitForTimeout(250); } while (y < foot);
  await page.waitForTimeout(1200);
  const reached = await count();
  console.log(`ledger's charts at 390: ${atRest} at rest, ${reached} once scrolled`);
  if (atRest >= reached) fail(`the ledger mounted its ${reached} charts below the fold at once, not as they came near`);
  if (reached < 7) fail(`only ${reached} of the ledger's 7 charts ever came`);
  await ctx.close();
}

// The tour by keyboard (B3): one or two Tabs reach the next stop from any stop's landing, and none lands on a pay control.
for (const width of [1440, 390]) {
  const { ctx, page } = await open(width);
  await page.goto(`${url}/?desk=tour`);
  await page.locator(".tr-stage .tr-next-go").click();
  let stops = 0, most = 0;
  for (; stops < 14; stops++) {
    await page.waitForSelector(".tp", { timeout: 6000 }).catch(() => undefined);
    if (!(await page.locator(".tp").count())) break;
    await page.waitForTimeout(700);
    const focus = await page.evaluate(() => document.activeElement?.id ?? "");
    if (focus === "approve") fail(`stop ${stops + 1} landed with focus on Approve`);
    let n = 0;
    for (; n < 3; n++) {
      await page.keyboard.press("Tab");
      if (await page.evaluate(() => document.activeElement?.classList.contains("tp-jump"))) break;
    }
    if (n === 3) { fail(`stop ${stops + 1}: three Tabs didn't reach the next stop, at ${page.url()}`); break; }
    // It lands inside whatever held focus: nothing on that page may paint over it.
    const covered = await page.evaluate(() => { const a = document.activeElement!, r = a.getBoundingClientRect(), on = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2); return on === a ? "" : `${on?.tagName}.${on?.className}`; });
    if (covered) fail(`stop ${stops + 1}: the Next stop link is covered by ${covered}, at ${page.url()}`);
    most = Math.max(most, n + 1);
    const label = await page.evaluate(() => document.activeElement?.textContent ?? "");
    if (/^Finish/.test(label)) break;
    const from = page.url();
    await page.keyboard.press("Enter");
    await page.waitForURL((u: URL) => u.href !== from, { timeout: 8000 }).catch(() => undefined);
  }
  console.log(`tour by keyboard at ${width}: ${stops + 1} stops, at most ${most} Tabs to the next`);
  if (stops < 9) fail(`at ${width} the tour stopped after ${stops + 1} stops`);
  await ctx.close();
}

// A page that throws while drawing never empties it (the whole kind: every page main.tsx mounts, and safe.html). React takes down all
// under the root, so each page here is its real chunk with the page itself swapped for one that throws. A cover can't hide the words.
for (const [route, chunk, part] of [["/?desk=1", "Desk", "default"], ["/?desk=1#challenge", "Desk", "default"], ["/?desk=how", "How", "default"], ["/?desk=proof", "Proof", "default"], ["/?desk=haggle", "Haggle", "default"], ["/?desk=tour", "Tour", "default"], ["/?market=1", "StoreSync", "default"], ["/?wallet=1", "Wallet", "default"], ["/?wallet=0", "App", "App"]] as const) {
  const { ctx, page } = await open(390);
  const where = `a throw on ${route}`;
  await page.addInitScript(() => { const w = window as unknown as { __on: boolean }; w.__on = true; Object.defineProperty(navigator, "onLine", { get: () => w.__on }); });
  let swapped = false;
  const throws = new RegExp(`/assets/${chunk}-[^/]*\\.js$`);
  await page.route(throws, async (r: { fetch: () => Promise<{ text: () => Promise<string> }>; fulfill: (o: object) => Promise<void> }) => {
    const code = await (await r.fetch()).text();
    // Its export by name, or, for a chunk others share (the Desk's), inside the namespace object the build exports instead (walk-throw.ts).
    const out = swapExport(code, part);
    swapped = out !== code;
    await r.fulfill({ contentType: "text/javascript", body: `${out}${THROWN}` });
  });
  await page.goto(url + route, { waitUntil: "load" });
  const says = page.locator('#root [role="alert"]');
  await says.waitFor({ timeout: 15_000 }).catch(() => undefined);
  if (!swapped) fail(`${where}: no chunk was swapped, so nothing was walked`);
  const text = (await says.innerText().catch(() => "")).trim();
  if (text !== "Goose couldn't load this. Try again.") fail(`${where}: it says ${JSON.stringify(text)}, and the root holds ${await page.locator("#root > *").count()} elements`);
  const covered = await page.evaluate(() => { const h = document.documentElement; return h.classList.contains("dk-opening") || h.hasAttribute("data-first-room"); });
  if (covered) fail(`${where}: a cover is still over the words`);
  // One component says all this, so it's walked on the one page with covers, with and without a hash, and not nine times over the
  // GitHub check's 25 minutes (Joshua, Nov 4). The source rule in lazy-lost.test.ts holds that every page is under it.
  if (chunk !== "Desk") { await ctx.close(); continue; }
  // Offline wins: no Try again that can't work, and it comes back with her.
  await page.evaluate(() => { (window as unknown as { __on: boolean }).__on = false; dispatchEvent(new Event("offline")); });
  await says.getByRole("link").waitFor({ state: "detached", timeout: 3000 }).catch(() => fail(`${where}: offline still offers Try again`));
  if (!/You're offline/.test(await says.innerText().catch(() => ""))) fail(`${where}: offline, it doesn't say so`);
  await page.evaluate(() => { (window as unknown as { __on: boolean }).__on = true; dispatchEvent(new Event("online")); });
  await page.unroute(throws);
  // Try again is a reload even where the address has a hash, and the page comes back.
  await says.getByRole("link", { name: "Try again" }).click({ timeout: 3000 }).catch(() => fail(`${where}: back online, no Try again to press`));
  await says.waitFor({ state: "detached", timeout: 15_000 }).catch(() => fail(`${where}: Try again didn't bring the page back`));
  await ctx.close();
}
console.log("a throw: 9 pages hold, with the words and a way forward");

// One part of the Desk throws, and only that part goes: her conversation, its deal, and Approve are still there. Each is the real chunk with
// the part swapped, as above, all on one run so the walk asks once. A room offers Back to Goose even online, since a reload would cost what this keeps.
const throwing = (ctx: { route: Function }, chunk: string, parts: readonly string[], swapped: Set<string>) =>
  ctx.route(new RegExp(`/assets/${chunk}-[^/]*\\.js$`), async (r: { fetch: () => Promise<{ text: () => Promise<string> }>; fulfill: (o: object) => Promise<void> }) => {
    const code = await (await r.fetch()).text();
    let out = code;
    for (const part of parts) {
      const next = swapExport(out, part);
      if (next !== out) swapped.add(`${chunk} ${part}`);
      out = next;
    }
    await r.fulfill({ contentType: "text/javascript", body: `${out}${THROWN}` });
  });
{
  const { ctx, page } = await open(390), swapped = new Set<string>();
  await throwing(ctx, "Panes", ["WeekPane", "WantsPane", "SettingsPane"], swapped);
  await throwing(ctx, "AfterPay", ["default"], swapped);
  await throwing(ctx, "RealPrices", ["default"], swapped);
  await shop(page, DEAL);
  const approve = page.locator(".dk-deal2 .dk-approve");
  await approve.waitFor({ timeout: 25000 }).catch(() => fail("a throw in a part: no deal to keep, so this proves nothing"));
  await page.waitForTimeout(800); // Real prices comes with done
  if (!swapped.has("RealPrices default")) fail("a throw in Real prices: no chunk was swapped, so nothing was walked");
  if (await page.locator('#root [role="alert"]').count()) fail("a throw in Real prices: the Desk went");
  if (!(await approve.isVisible().catch(() => false))) fail("a throw in Real prices: the deal and its Approve went with it");
  const before = await page.locator(".dk-stage").innerText();
  const PART: Record<string, string> = { week: "Panes WeekPane", wants: "Panes WantsPane", settings: "Panes SettingsPane", after: "AfterPay default" };
  for (const room of ["week", "wants", "settings", "after"]) {
    const said = `a throw in ${room}`;
    await openRoom(page, room);
    // The fault got in before anything is judged (push 4: Panes moved to a namespace export, nothing threw, and the walk judged a
    // room that never broke). A miss fails here, named, and the room is skipped rather than read as a room that held.
    for (let t = 0; t < 50 && !swapped.has(PART[room]!); t++) await page.waitForTimeout(100);
    if (!swapped.has(PART[room]!)) { fail(`${said}: the walk's throw never got into ${PART[room]}, so nothing here was walked`); continue; }
    const lost = page.locator(".dk-room-lost");
    await lost.waitFor({ timeout: 6000 }).catch(() => fail(`${said}: the room drew no state`));
    const text = await lost.innerText().catch(() => "");
    if (!/^This room didn't load\.\s*Back to Goose$/.test(text.trim())) fail(`${said}: it said ${JSON.stringify(text)}`);
    await page.waitForFunction(() => document.activeElement?.classList.contains("dk-pane-h"), undefined, { timeout: 3000 }).catch(() => fail(`${said}: focus isn't on the room's head`));
    if (await page.locator('#root [role="alert"]').count()) fail(`${said}: the page's last-resort line drew, so the Desk went`);
    // Read as text isn't seen: a parent at no opacity reads the same.
    if (await lost.evaluate((e: Element) => { for (let up: Element | null = e; up; up = up.parentElement) if (getComputedStyle(up).opacity === "0") return true; return false; })) fail(`${said}: the words are there, under something at no opacity`);
    if (!(await page.getByRole("banner").first().isVisible().catch(() => false))) fail(`${said}: the bar went with it`);
    await lost.getByRole("button", { name: "Back to Goose" }).click();
    await lost.waitFor({ state: "detached", timeout: 3000 }).catch(() => fail(`${said}: Back to Goose stayed in the room`));
    // Still looking at her deal, as she left it. Never pressed. More may have drawn in the meantime; nothing she had is gone.
    if (!(await approve.isVisible().catch(() => false))) fail(`${said}: her deal and its Approve didn't come back`);
    const has: string[] = (await page.locator(".dk-stage").innerText().catch(() => "")).split("\n"), gone = (before as string).split("\n").filter((l) => !has.includes(l));
    if (gone.length) fail(`${said}: the conversation lost ${JSON.stringify(gone)}`);
  }
  await ctx.close();
}
{
  // The story below the hero throws: the hero and the Ask box stay.
  const { ctx, page } = await open(1440), swapped = new Set<string>();
  await throwing(ctx, "Story", ["default"], swapped);
  await page.goto(`${url}/?desk=1`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  if (!swapped.size) fail("a throw in the story: no chunk was swapped, so nothing was walked");
  if (await page.locator('#root [role="alert"]').count()) fail("a throw in the story: the Desk went");
  if (!(await page.getByRole("textbox").first().isVisible().catch(() => false))) fail("a throw in the story: the Ask box went with it");
  await ctx.close();
}
{
  // axe on what these states really draw, which the routes' sweep never sees: the page's last line (it failed three rules with the role on
  // <main>), and a room that threw. The way forward is 44 px on the real page, not only in its stylesheet.
  const axe = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
  const scan = async (page: { addScriptTag: Function; evaluate: Function }, said: string) => {
    await page.addScriptTag({ content: axe });
    const found: string[] = await page.evaluate(async () => (await (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string }[] }> } }).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] }, resultTypes: ["violations"] })).violations.map((v) => v.id));
    if (found.length) fail(`${said}: axe says ${found.join(", ")}`);
  };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", bypassCSP: true });
  const swapped = new Set<string>();
  await ctx.route(/\/assets\/Desk-[^/]*\.js$/, async (r: { fetch: () => Promise<{ text: () => Promise<string> }>; fulfill: (o: object) => Promise<void> }) => {
    const code = await (await r.fetch()).text();
    const out = swapExport(code, "default");
    if (out !== code) swapped.add("Desk"); // only a swap that happened counts
    await r.fulfill({ contentType: "text/javascript", body: `${out}${THROWN}` });
  });
  const page = await ctx.newPage();
  await page.goto(`${url}/?desk=1`, { waitUntil: "load" });
  const says = page.locator('#root [role="alert"]');
  await says.waitFor({ timeout: 15_000 }).catch(() => undefined);
  if (!swapped.size) fail("axe on a thrown page: no chunk was swapped, so nothing was walked");
  else if (!(await says.count())) fail("axe on a thrown page: nothing was drawn");
  await scan(page, "a thrown page");
  const tall = (await says.getByRole("link").boundingBox().catch(() => null))?.height ?? 0;
  if (tall < 44) fail(`a thrown page: Try again is ${tall} px tall`);
  await ctx.close();
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", bypassCSP: true });
  const swapped2 = new Set<string>();
  await throwing(ctx2, "Panes", ["WeekPane"], swapped2);
  const page2 = await ctx2.newPage();
  await page2.goto(`${url}/?desk=1`, { waitUntil: "load" });
  // Asked again until the Desk's code is listening: nobody has tapped yet on this fresh page.
  const drew = await within(async () => { await openRoom(page2, "week"); return (await page2.locator(".dk-room-lost").count()) > 0; });
  if (!swapped2.has("Panes WeekPane")) fail("axe on a room that threw: the walk's throw never got into Panes WeekPane, so nothing was walked");
  else if (!drew) fail("axe on a room that threw: no state was drawn");
  await scan(page2, "a room that threw");
  await ctx2.close();
}
console.log("a throw in one part: 4 rooms, Real prices and the story each cost only themselves");

// A tap before the page's code lands counts once it's live, and only what's on the list does (web/src/held-tap.ts). Every chunk waits
// here until the tap is made: the slow line that left "Watch the week" dead on the wallet's first paint.
const heldUp = async (route: string, tap: string) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" });
  let release = () => {};
  const gate = new Promise<void>((ok) => { release = ok; });
  await ctx.route("**/assets/*.js", async (r: { continue: () => Promise<void> }) => { await gate; await r.continue(); });
  const page = await ctx.newPage();
  await page.goto(url + route, { waitUntil: "commit" });
  const b = page.locator(`${tap}:visible`).first();
  await b.waitFor({ timeout: 20_000 });
  await b.click();
  return { ctx, page, release };
};
for (const [route, tap, said, holds] of [
  ["/?wallet=1", ".skip", "the replay didn't start", `.desk[data-replay="play"]`],
  ["/?wallet=1", ".wchip", "the chip didn't fill the box", `#want:not([readonly])`],
  ["/?wallet=1", ".logfold", "the haggle's fold didn't open", `.logfold[aria-expanded="true"]`],
  ["/?wallet=1", ".gm-btn", "the menu didn't open", `.gm-btn[aria-expanded="true"]`],
  ...["/?desk=1", "/?desk=ledger", "/?desk=studio", "/?desk=how", "/?desk=system", "/?desk=proof", "/?desk=tour", "/?desk=haggle", "/?desk=list"].map((r) => [r, ".gm-btn", "the menu didn't open", `.gm-btn[aria-expanded="true"]`] as const),
  ["/?desk=tour", ".tr-step:last-child", "the tour didn't step", `.tr-step:not([disabled]):first-child`],
] as const) {
  const { ctx, page, release } = await heldUp(route, tap);
  release();
  if (!(await page.locator(holds).first().waitFor({ state: "visible", timeout: 20_000 }).then(() => true, () => false))) fail(`a tap before ${route} was live: ${said}`);
  else {
    // Once, not twice: counted again, the menu would close and the fold would shut.
    await page.waitForTimeout(250);
    if (!(await page.locator(holds).first().isVisible())) fail(`a tap before ${route} was live counted twice`);
  }
  if (tap === ".wchip" && !(await page.locator("#want").inputValue()).trim()) fail("a tap before the wallet was live: the box stayed empty");
  await ctx.close();
}
{
  // A forgotten tap is let go, and a live run is never started by one.
  const old = await heldUp("/?wallet=1", ".skip");
  await old.page.evaluate(() => { const w = window as unknown as { __tap: [string, number] }; w.__tap[1] -= 20_000; });
  old.release();
  await old.page.locator("main[data-first]").waitFor({ state: "detached", timeout: 20_000 });
  await old.page.waitForTimeout(400);
  if (await old.page.locator(`.desk[data-replay="play"]`).count()) fail("a tap 20 s old still started the replay");
  await old.ctx.close();
  // A real tap on the live page, while the code that replays the held one is still coming: the shopper has moved on, so it's let go.
  const late = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" });
  let live = () => {}, code = () => {};
  const page1 = new Promise<void>((ok) => { live = ok; }), page2 = new Promise<void>((ok) => { code = ok; });
  await late.route("**/assets/*.js", async (r: { continue: () => Promise<void>; request: () => { url: () => string } }) => { await (/held-tap-/.test(r.request().url()) ? page2 : page1); await r.continue(); });
  const lp = await late.newPage();
  await lp.goto(url + "/?wallet=1", { waitUntil: "commit" });
  await lp.locator(".skip:visible").first().click();
  live();
  await lp.locator("main[data-first]").waitFor({ state: "detached", timeout: 20_000 });
  await lp.locator(".gm-btn:visible").first().click();
  code();
  await lp.waitForResponse(/held-tap-/, { timeout: 5_000 }).catch(() => {});
  await lp.waitForTimeout(400);
  if (await lp.locator(`.desk[data-replay="play"]`).count()) fail("a real tap on the live page still let an older held tap play");
  if ((await lp.locator(".gm-btn:visible").first().getAttribute("aria-expanded")) !== "true") fail("a real tap on the live page didn't open the menu");
  await late.close();
  const run = await heldUp("/?desk=haggle", `.hg-btn:has-text("Run a live haggle")`);
  const started: string[] = [];
  run.page.on("request", (r: { method: () => string; url: () => string }) => { if (r.method() === "POST") started.push(r.url()); });
  run.release();
  await run.page.locator(`.hg-btn:has-text("Run a live haggle"):not([disabled])`).waitFor({ timeout: 20_000 });
  await run.page.waitForTimeout(400);
  if (started.length) fail(`a tap before the haggle was live started a run: ${started.join(", ")}`);
  await run.ctx.close();
}
// Round 5 (B2): in sandbox mode, the practice-site line by Approve: drawn, on budget and read with the button. Other modes draw none.
for (const [mode, width] of [["sandbox", 390], ["sandbox", 1440], ["fake", 390]] as const) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 } });
  const page = await ctx.newPage();
  if (mode === "sandbox") await page.route("**/api/health", async (r: { fetch(): Promise<{ json(): Promise<object> }>; fulfill(o: { json: object }): Promise<void> }) => { const res = await r.fetch(); await r.fulfill({ json: { ...(await res.json()), payment: "sandbox" } }); });
  await page.goto(`${url}/?desk=1`);
  await page.getByRole("button", { name: "A Marsh Lights ticket under $90" }).click();
  await page.getByRole("button", { name: /Shop for this/ }).click();
  await page.locator(".dk-deal2.dk-final").waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200);
  const line = page.locator(".dk-practice");
  const described = await page.locator(".dk-approve").first().getAttribute("aria-describedby");
  if (mode === "fake") {
    if ((await line.count()) !== 0 || described) fail("the practice-site line showed outside sandbox mode");
  } else {
    if (!(await line.isVisible()) || described !== "dk-next") fail(`${width}: the practice-site line isn't drawn and read with Approve`);
    const n = await page.evaluate(() => {
      const shown = (e: Element | null): boolean => {
        for (; e; e = e.parentElement) {
          const c = getComputedStyle(e), r = e.getBoundingClientRect();
          if (c.visibility !== "visible" || c.display === "none" || +c.opacity <= 0.05 || ((r.width <= 2 || r.height <= 2) && c.overflow !== "visible") || c.clipPath === "inset(50%)") return false;
        }
        return true;
      };
      const w = document.createTreeWalker(document.querySelector(".dk-live-grid .dk-deal2")!, NodeFilter.SHOW_TEXT);
      let count = 0;
      for (let t = w.nextNode(); t; t = w.nextNode()) {
        const s = (t.textContent ?? "").trim(), e = t.parentElement, d = e?.closest("details");
        // Counted as dk-desk-probe does: a closed <details> draws only its summary; a word has a letter or a digit.
        if (s && shown(e) && (!d || d.open || e?.closest("summary"))) count += s.split(/\s+/).filter((x) => /[\p{L}\p{N}]/u.test(x)).length;
      }
      return count;
    });
    if (n > 50) fail(`${width}: the deal card has ${n} words with the practice-site line (budget 50)`);
    console.log(`practice-site line at ${width}: drawn, deal card ${n} words`);
    // The DD's two conditions: a password warning is never the card's smallest type, and the who-pays promise it replaced stays one tap away.
    const type = await line.evaluate((e: Element) => { const c = getComputedStyle(e), t = document.createElement("span"); t.style.cssText = "font-size:var(--t-small);color:var(--ink)"; e.append(t); const w = getComputedStyle(t); const out = { size: c.fontSize, color: c.color, wantSize: w.fontSize, wantColor: w.color }; t.remove(); return out; });
    if (type.size !== type.wantSize || type.color !== type.wantColor) fail(`${width}: the practice-site line is ${type.size} ${type.color}, not --t-small and --ink`);
    const before = page.locator(".dk-live-grid .dk-before").first();
    await before.locator("summary").click();
    if (!(await before.innerText()).includes("Only your tap pays.")) fail(`${width}: Before you approve doesn't keep the who-pays promise`);
  }
  await ctx.close();
}
// Round 5: the line says "Press Cancel", so follow it. Cancel's return read "Waiting on PayPal" until a walk came back this way. Fake rail; the real sandbox page is on the For Joshua list.
for (const q of ["desk", "market", "wallet"]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${url}/?${q}=1`);
  let press = page.locator("#approve");
  if (q === "desk") {
    await page.getByRole("button", { name: "A Marsh Lights ticket under $90" }).click();
    await page.getByRole("button", { name: /Shop for this/ }).click();
    await page.locator(".dk-deal2.dk-final").waitFor({ timeout: 15000 });
    press = page.locator(".dk-approve").first();
  } else if (q === "market") {
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("button", { name: /Put in cart: Pondside/ }).click();
    press = page.getByRole("button", { name: /Approve .* in PayPal/ });
  }
  let order = "";
  await page.route("**/api/runs/fake-paypal/*/approve*", (r: { request(): { url(): string }; abort(): Promise<void> }) => { order = /fake-paypal\/([^/]+)\/approve/.exec(r.request().url())![1]!; return r.abort(); });
  await press.click({ timeout: 15000 });
  for (let i = 0; i < 50 && !order; i++) await page.waitForTimeout(100);
  if (!order) { fail(`${q}: Approve opened no order on the fake rail`); await ctx.close(); continue; }
  await page.unroute("**/api/runs/fake-paypal/*/approve*");
  const { url: link } = (await (await ctx.request.get(`${url}/api/runs/fake-paypal/${order}/return-link`)).json()) as { url: string };
  await page.goto(`${link}${link.includes("?") ? "&" : "?"}cancel=1&token=${order}`);
  await page.getByText("Cancel was pressed in PayPal.").first().waitFor({ timeout: 8000 }).catch(() => fail(`${q}: back from Cancel doesn't say it was cancelled`));
  const said = await page.locator("body").innerText();
  if (/Waiting on PayPal|No answer from PayPal|You approved this exact cart/.test(said)) fail(`${q}: back from Cancel still reads: ${said.slice(0, 120)}`);
  await ctx.close();
}
// Q's catch: the wallet's price-swap button opens PayPal too, so in sandbox mode it carries the line, its own id, in its description.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.route("**/api/health", async (r: { fetch(): Promise<{ json(): Promise<object> }>; fulfill(o: { json: object }): Promise<void> }) => { const res = await r.fetch(); await r.fulfill({ json: { ...(await res.json()), payment: "sandbox" } }); });
  await page.goto(`${url}/?wallet=1`);
  const swap = page.getByRole("button", { name: /Try a price swap/ });
  await swap.waitFor({ timeout: 15000 }).catch(() => fail("the wallet's price-swap button didn't draw"));
  if (!(await within(async () => /\bswap-next\b/.test((await swap.getAttribute("aria-describedby")) ?? "")))) fail("the price-swap button isn't described by the practice-site line");
  if (!(await page.locator("#swap-next").innerText()).startsWith("Next: PayPal's practice site.")) fail("the price-swap button has no practice-site line");
  await ctx.close();
}
// Live, Nov 4: the wallet's password warning waited for its code and /api/health, so it arrived at 2.9 s on a phone, became
// the page's largest paint, and took /?wallet=1 over the 1-second bar. Green here, as localhost answers at once. So nothing
// on the clock: the code and the server are held back until the first paint is read, and the line must already be up. When
// they land it stays where it is, its words the same, and nothing paints larger.
const SWAP_MAX = 0; // px: the tuned fallbacks hold it exactly (Q, Nov 5: the line only tightens; it was 0.5 while Linux moved)
const px = (b: { top: number; height: number }) => `${b.top.toFixed(3)}+${b.height.toFixed(3)}`;
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  let release = () => {}, releaseFonts = () => {};
  const held = new Promise<void>((go) => { release = go; });
  const fontsHeld = new Promise<void>((go) => { releaseFonts = go; });
  await page.route(/\/assets\/.*\.js$/, async (r: { continue(): Promise<void> }) => { await held; await r.continue(); });
  // The fonts too: on a slow phone they land after the first paint, as they did on GitHub's runner, Nov 5. They're let
  // go on their own, before the code: the swap and the wallet's arrival are two moves, and each is read on its own.
  await page.route(/\.woff2$/, async (r: { continue(): Promise<void> }) => { await fontsHeld; await r.continue(); });
  await page.route("**/api/health", async (r: { fetch(): Promise<{ json(): Promise<object> }>; fulfill(o: { json: object }): Promise<void> }) => { await held; const res = await r.fetch(); await r.fulfill({ json: { ...(await res.json()), payment: "sandbox" } }); });
  await page.addInitScript(() => {
    const w = window as unknown as { __paints: string[] };
    w.__paints = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { size: number; startTime: number; element?: Element }[]) w.__paints.push(`${e.element?.tagName}.${e.element?.className}${e.element?.id ? `#${e.element.id}` : ""} ${Math.round(e.size)}px² at ${Math.round(e.startTime)} ms`); }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  await page.goto(`${url}/?wallet=1`, { waitUntil: "commit" });
  const line = page.locator(".hero .apractice");
  const seen = await line.waitFor({ timeout: 15000 }).then(() => true, () => false);
  if (!seen) fail("the practice-site line isn't in the wallet's first paint: it waits for the code and the server");
  else {
    const read = () => line.evaluate(async (e: Element) => {
      await new Promise((go) => requestAnimationFrame(() => requestAnimationFrame(go)));
      // Two frames aren't always a painted one: GitHub, Nov 5, read the count a few ms before the browser had shown
      // anything, and called the first paint itself a late one. So the read waits until the browser reports it.
      const w = window as unknown as { __paints: string[] };
      for (let i = 0; i < 100 && !w.__paints.length; i++) await new Promise((go) => setTimeout(go, 50));
      const r = e.getBoundingClientRect(), c = getComputedStyle(e);
      // Unrounded (layout's own 1/64 px): GitHub, Nov 5, read 692 then 691 for a line this Mac puts at 691.469 both
      // times, a hair under a rounding edge; and a rounded read passes a 0.98 px move that doesn't cross one.
      return { top: r.top + scrollY, height: r.height, words: e.textContent, size: c.fontSize, color: c.color, paints: w.__paints.length, at: Math.round(performance.now()) };
    });
    const first = await read();
    if (!first.words?.startsWith("Next: PayPal's practice site.")) fail(`the wallet's first paint has the wrong practice-site line: ${first.words}`);
    if (!first.paints) fail("the browser never reported the wallet's first paint as a largest paint, though its line had been in the page for 5 s");
    // The swap: the fallback faces are tuned to the web faces (desk/tokens.css), so the line stays within half a pixel.
    releaseFonts();
    await page.evaluate(() => document.fonts.ready);
    const fonts = await read();
    const swap = Math.max(Math.abs(fonts.top - first.top), Math.abs(fonts.height - first.height));
    if (swap > SWAP_MAX) fail(`the practice-site line moved ${swap.toFixed(3)} px when the web fonts replaced the fallback (line ${SWAP_MAX}): ${px(first)} to ${px(fonts)}`);
    release();
    await page.locator(".hero #approve").waitFor({ timeout: 15000 });
    // The line reads with the button as soon as the button is drawn; and health has answered by the time it's still there.
    await page.waitForLoadState("load");
    await page.waitForTimeout(1500);
    const then = await read();
    // The arrival: the same fonts both sides, so nothing at all may move.
    if (then.top !== fonts.top || then.height !== fonts.height) fail(`the practice-site line jumped when the wallet arrived: ${px(fonts)} to ${px(then)}`);
    if (then.words !== first.words || then.size !== first.size || then.color !== first.color) fail("the practice-site line changed when the wallet arrived");
    const late = (await page.evaluate(() => (window as unknown as { __paints: string[] }).__paints)).slice(first.paints);
    if (late.length) fail(`the page's largest paint moved after its first paint, to the wallet's arrival: ${late.join(", ")} (the code and the server were let go at ${first.at} ms)`);
    if (!/\bapprove-next\b/.test((await page.locator(".hero #approve").getAttribute("aria-describedby")) ?? "")) fail("the wallet's Approve isn't described by the practice-site line");
    console.log(`practice-site line: in the wallet's first paint at ${px(first)}, ${swap.toFixed(3)} px through the font swap, still at ${px(then)} when the code and the server land`);
  }
  await ctx.close();
  // A server that says it isn't PayPal's sandbox takes the line away with its answer: "fake" (CI) here.
  const fake = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await fake.newPage();
  await p.goto(`${url}/?wallet=1`);
  await p.locator(".hero #approve").waitFor({ timeout: 15000 });
  if (!(await within(async () => (await p.locator(".apractice").count()) === 0))) fail("the practice-site line stayed on a server that isn't PayPal's sandbox");
  await fake.close();
}
// Nov 5: Settings drew the voice card before the limits it sits under, and when the server's answer landed (about
// 1,100 px of limits and memory on a phone) it pushed the card and the footer off the screen: shift 0.61 at 390. Green
// on a fast machine half the time, so the answer is held 1.2 s and the phone's CPU slowed, as a real phone's would be.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.route("**/api/runs/wants", async (r: { continue(): Promise<void> }) => { await new Promise((go) => setTimeout(go, 1200)); await r.continue(); });
  await page.addInitScript(() => {
    const w = window as unknown as { __shift: number };
    w.__shift = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.__shift += e.value; }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(`${url}/?wallet=1#settings`);
  const voice = await page.locator(".settings .svoice").waitFor({ timeout: 20000 }).then(() => true, () => false);
  if (!voice) fail("Settings never drew its voice card at 390");
  await page.waitForTimeout(1500);
  const shift = await page.evaluate(() => (window as unknown as { __shift: number }).__shift);
  if (shift > 0.05) fail(`Settings moved under the eyes when its limits landed at 390: layout shift ${shift.toFixed(3)} (line 0.05)`);
  else console.log(`settings at 390, its limits 1.2 s late: shift ${shift.toFixed(3)}`);
  await ctx.close();
}
// Round 5 (B1): a room stays the room a shopper landed in. early() swapped a lazy component for the loaded one on a later render, a different
// element type, so about 3 to 4 s in React threw the room away: the pick, the focus, and the GET again. cold-routes and axe stop reading
// before that, so read past it. Each room by its address, with something picked or focused, then 6 s.
await Promise.all(["week", "wants", "settings", "after", "challenge"].flatMap((room) => [390, 1440].map(async (width) => {
  const ctx = await browser.newContext({ viewport: { width, height: 844 } });
  const page = await ctx.newPage();
  const gets = new Map<string, number>();
  page.on("request", (r: { url(): string }) => { const m = /\/api\/runs\/(wants|shelf)\b/.exec(r.url()); if (m) gets.set(m[1]!, (gets.get(m[1]!) ?? 0) + 1); });
  const where = `#${room} at ${width}`;
  await page.goto(`${url}/?desk=1#${room}`);
  const head = room === "challenge" ? "#root h1" : headOf(room);
  await page.waitForFunction((h: string) => !document.documentElement.hasAttribute("data-first-room") && document.querySelector(h), head, { timeout: 15000 }).catch(() => fail(`${where}: the room didn't draw`));
  if (room === "week") await page.getByRole("tab", { name: "Flight" }).click();
  if (room === "settings") await page.locator(".dk-work select").first().waitFor({ timeout: 8000 }).catch(() => fail(`${where}: no limit to pick`));
  await page.evaluate((h: string) => {
    const at = document.querySelector(h)!, focus = document.querySelector<HTMLElement>(".dk-work [role=tab][aria-selected=true], .dk-work select") ?? (at as HTMLElement);
    if (focus === at && !at.hasAttribute("tabindex")) at.setAttribute("tabindex", "-1");
    focus.focus();
    Object.assign(window, { __at: at.closest("section") ?? at, __focus: focus });
  }, head);
  await page.waitForTimeout(6000);
  const after = await page.evaluate((h: string) => {
    const w = window as unknown as { __at: Element; __focus: Element };
    return { same: w.__at.isConnected && document.querySelector(h)?.closest("section") === w.__at.closest("section"), focus: document.activeElement === w.__focus, tab: document.querySelector("[role=tab][aria-selected=true]")?.textContent ?? "" };
  }, head);
  if (!after.same) fail(`${where}: the room was thrown away and drawn again`);
  if (!after.focus) fail(`${where}: focus left what the shopper was on`);
  if (room === "week" && after.tab !== "Flight") fail(`${where}: the pick snapped back to ${after.tab}`);
  for (const [path, n] of gets) if (n > 1) fail(`${where}: /api/runs/${path} asked ${n} times`);
  await ctx.close();
})));
if (!fails.length) console.log("the rooms: each kept its node, the pick and the focus for 6 s at 390 and 1440");
// The same helper draws the run's parts. The deal, read past the same moment: the Read and the trail stay the nodes they were.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${url}/?desk=1`);
  await page.getByRole("button", { name: DEAL }).click();
  await page.getByRole("button", { name: /Shop for this/ }).click();
  await page.locator(".dk-deal2.dk-final").waitFor({ timeout: 15000 }).catch(() => fail("the deal never drew"));
  await page.waitForTimeout(1500); // its parts' chunks are in by now; what's read below is what happens after they land
  const parts = ".dk-deal2 .tl-rows, .dk-deal2 .tl-hold, .dk-deal2 [class*=read]";
  const held = await page.evaluate((s: string) => { const n = [...document.querySelectorAll(s)]; Object.assign(window, { __parts: n }); return n.length; }, parts);
  await page.waitForTimeout(6000);
  const lost = await page.evaluate(() => (window as unknown as { __parts: Element[] }).__parts.filter((n) => !n.isConnected).map((n) => n.className));
  if (!held) fail("the deal has none of the parts this reads: the walk's selector moved");
  if (lost.length) fail(`the deal threw away ${lost.join(", ")}`);
  await ctx.close();
}
// Round 5 (red team 1): a stranger on someone's paid run link. A real fake-rail payment, then a fresh browser reads it on each page.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${url}/?desk=1`);
  await page.getByRole("button", { name: "A Marsh Lights ticket under $90" }).click();
  await page.getByRole("button", { name: /Shop for this/ }).click();
  await page.locator(".dk-deal2.dk-final").waitFor({ timeout: 15000 });
  await page.locator(".dk-approve").first().click();
  await page.waitForURL(/[?&]run=/, { timeout: 15000 });
  const run = new URL(page.url()).searchParams.get("run")!;
  await page.locator(".dk-paid .dk-waited", { hasText: "You approved this exact cart" }).waitFor({ timeout: 8000 }).catch(() => fail("the owner's paid card lost its words"));
  await ctx.close();
  for (const q of ["desk=1", "market=1"]) {
    const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await other.newPage();
    await p.goto(`${url}/?${q}&run=${run}`);
    await p.getByText("Paid from another browser.").first().waitFor({ timeout: 8000 }).catch(() => fail(`${q}: a stranger's paid link doesn't say it was paid from another browser`));
    const said = await p.locator("body").innerText();
    if (/You approved this exact cart|We can't tell yet/.test(said)) fail(`${q}: a stranger's paid link says something only the owner could: ${said.slice(0, 120)}`);
    await other.close();
  }
}
// Fresh Q (Nov 5): what a run's return says when it isn't simply paid. A second browser on the wallet's own paid run: "Paid", and no second
// Approve (it captured twice on the fake rail). Each row below is the server's run, mocked, read on the three pages that read a return.
{
  const owner = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await owner.newPage();
  await page.goto(`${url}/?wallet=1`);
  await page.locator(".hero #approve:not([disabled])").waitFor({ timeout: 15000 });
  await page.locator(".hero #approve").click();
  await page.waitForURL(/[?&]run=/, { timeout: 15000 });
  const run = new URL(page.url()).searchParams.get("run")!;
  // The browser that paid: no Approve on the run's link or on the plain wallet. The server's own stop is this browser's paid cookie (main.ts).
  await page.locator(".hero .kicker", { hasText: /^paid$/i }).waitFor({ timeout: 8000 }).catch(() => fail("the browser that paid doesn't read Paid on the run's link"));
  for (const way of [`/?wallet=1&run=${run}`, "/?wallet=1"]) {
    await page.goto(`${url}${way}`);
    await page.waitForTimeout(1200);
    const n = await page.getByRole("button", { name: /Approve/ }).count();
    if (n) fail(`${way}: the browser that paid this week's deal can press Approve again (${n})`);
  }
  // Fresh Q (Nov 5): that browser through the wallet's own "Watch it again" door: the replay plays, the deal shows, and there's nothing to press.
  const nothingToPress = async (who: string, pg: typeof page) => {
    await pg.goto(`${url}/?seed=1&wallet=0`);
    await pg.getByRole("button", { name: "Go find it" }).click({ timeout: 15000 });
    await pg.locator("#cart", { hasText: RETURN_ALREADY_HEAD }).waitFor({ timeout: 60000 }).catch(() => fail(`${who}: the replay on the classic page doesn't end on "${RETURN_ALREADY_HEAD}"`));
    const card = await pg.locator("#cart").innerText().catch(() => "");
    if (!card.includes(RETURN_ALREADY) || !/\$47\.73/.test(card)) fail(`${who}: the classic card doesn't show the deal and say it's paid: ${card.slice(0, 160)}`);
    if (/One use only|Not this one|Only the browser that started/.test(card)) fail(`${who}: the classic card still talks as if it could be approved: ${card.slice(0, 160)}`);
    if (await pg.locator("#approve").count()) fail(`${who}: the classic page offers Approve on a week this browser paid: it pays twice`);
    // Not innerText: the lane's label is hidden at 390, and its words are still read out. Less the ledger's logged reasons
    // (`.lg-why`): those rows are the record, never edited, and the guard's ask row ("…so this exact cart needs your yes",
    // trust/src/guard.ts) was true when it was written (LOCAL-CI on 74be6db8, Nov 5). Decided by default; flip if the DD says
    // the row is marked as overtaken under a stop instead.
    const state = await pg.evaluate(() => { const b = document.body.cloneNode(true) as HTMLElement; for (const w of b.querySelectorAll(".lg-why")) w.remove(); return b.textContent ?? ""; });
    const asks = /waiting for your yes|needs your yes/.exec(state);
    // Control (Lead-12): the read still takes the page's state, so the lane (hidden at 390), the strip and the card each say the stop.
    for (const [where, words] of [["lane", STOP_SAID.paid.lane], ["strip", STOP_SAID.paid.strip], ["card", RETURN_ALREADY]] as const) {
      if (!state.includes(words)) fail(`${who}: the page read no longer takes the ${where}'s "${words}": the probe reads less than the page says`);
    }
    if (asks) fail(`${who}: "${RETURN_ALREADY_HEAD}" sits on a page that still says "${asks[0]}"`);
  };
  await nothingToPress("wallet, then classic", page);
  await owner.close();
  // The other way round: paid on the classic page, and the wallet reads Paid with no Approve.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pg = await ctx.newPage();
    await pg.goto(`${url}/?seed=1&wallet=0`);
    await pg.getByRole("button", { name: "Go find it" }).click({ timeout: 15000 });
    await pg.locator("#approve").waitFor({ timeout: 60000 });
    await pg.locator("#approve").click();
    await pg.waitForURL(/wallet=0&run=/, { timeout: 15000 });
    await pg.goto(`${url}/?wallet=1`);
    await pg.locator(".hero .kicker", { hasText: /^paid$/i }).waitFor({ timeout: 8000 }).catch(() => fail("classic, then wallet: the wallet doesn't read Paid"));
    if (await pg.getByRole("button", { name: /^Approve/ }).count()) fail("classic, then wallet: the wallet offers Approve on a week this browser paid: it pays twice");
    await nothingToPress("classic, then classic", pg);
    await ctx.close();
  }
  // Fresh Q: back with a run in the address, nothing to press until the server answers, and nothing if it can't.
  for (const answer of ["slow", "fails"] as const) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pg = await ctx.newPage();
    let release = () => {};
    const held = new Promise<void>((go) => { release = go; });
    await pg.route(/\/api\/runs\/abcdefabcdef$/, async (r: { abort(): Promise<void>; fulfill(o: object): Promise<void> }) => {
      if (answer === "fails") return r.abort();
      await held;
      return r.fulfill({ json: { week: 1, bound: null, settled: null, events: [], mine: true, returned: null, card: null, done: true, seed: 1, undo: { state: "none" } } });
    });
    await pg.goto(`${url}/?wallet=1&run=abcdefabcdef`);
    await pg.locator(".hero .kicker").waitFor({ timeout: 15000 });
    await pg.waitForTimeout(1200);
    if (await pg.locator(".hero #approve").count()) fail(`a run's link, ${answer} answer: Approve is up before the server said what that run did`);
    if (answer === "fails") {
      if (!(await pg.locator(".hero").innerText()).includes(RETURN_UNKNOWN)) fail("a run's link the server couldn't read doesn't say it can't tell");
    } else {
      release();
      await pg.locator(".hero #approve:not([disabled])").waitFor({ timeout: 8000 }).catch(() => fail("a run that did nothing: Approve doesn't come back once the server answers"));
    }
    await ctx.close();
  }
  const second = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await second.newPage();
  await p.goto(`${url}/?wallet=1&run=${run}`);
  await p.getByText("Paid from another browser.").first().waitFor({ timeout: 8000 }).catch(() => fail("a second browser on the wallet's paid run isn't told it was paid"));
  await p.waitForTimeout(800);
  const kicker = await p.locator(".hero .kicker").innerText();
  if (!/^paid$/i.test(kicker)) fail(`a second browser on the wallet's paid run reads "${kicker}" over the deal`);
  const again = await p.getByRole("button", { name: /Approve/ }).count();
  if (again) fail(`a second browser on the wallet's paid run can press Approve again (${again}): it pays twice`);
  // Paid over counts that still said "1 to approve" (fresh Q): the row and the count close, and the note says whose counts they are.
  if ((await p.locator('[data-count="waiting"]').innerText()) !== "0") fail("a second browser reads Paid over a count that still says something's to approve");
  const notes = await p.locator(".week").innerText();
  if (!/These counts are this browser's/.test(notes) || !/paid from another browser/.test(notes)) fail(`a second browser's week doesn't say the payment wasn't counted here: ${notes.slice(0, 200)}`);
  await second.close();
  // KNOWN LIMIT, pinned so a change to it is seen, not silent. There's no login: limits and the paid-this-week stop live in one browser's
  // cookies, so a browser that never saw this payment, on the plain wallet with no link (or the classic page: abuse.test.ts), can approve and capture the same deal again.
  // Nothing here stops it, on the screen or at the server. It takes that shopper's own tap at PayPal. (Joshua, Nov 5: per browser for now, and said so.)
  {
    const third = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const t = await third.newPage();
    await t.goto(`${url}/?wallet=1`);
    await t.locator(".hero #approve:not([disabled])").waitFor({ timeout: 15000 }).catch(() => fail("known limit changed: a third browser on the plain wallet has no Approve. Good news, if it's on purpose: update this pin and the words"));
    await t.locator(".hero #approve").click();
    await t.waitForURL(/[?&]run=/, { timeout: 15000 });
    const again3 = new URL(t.url()).searchParams.get("run")!;
    const r = await (await t.request.get(`${url}/api/runs/${again3}`)).json() as { settled: { ok?: boolean } | null };
    if (r.settled?.ok !== true) fail("known limit changed: a third browser's capture of the same deal didn't go through. Good news, if it's on purpose: update this pin and the words");
    await third.close();
  }

  const OWN = { actor: "paypal", seq: 5, t: 1, v: 1, why: "", shopperId: "demo", visibility: "owner" };
  const CANCEL = { ...OWN, actor: "shopper", action: "cancel", seq: 6 };
  const CAPTURING = { ...OWN, actor: "guard", action: "capturing", seq: 4 };
  const ANSWER = { ...OWN, action: "capture-failed", seq: 5, data: { hold: 4, code: "INSTRUMENT_DECLINED" } };
  const PENDING = { ...OWN, action: "capture-failed", seq: 5, data: { hold: 4, code: "unknown" } };
  const cart = { item: "A kettle", merchant: "Fictional Kettles", total: "12.00", currency: "USD", hash: "h", orderId: null };
  const said = async (q: string, body: object, own = false): Promise<string> => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pg = await ctx.newPage();
    await pg.route(/\/api\/runs\/abcdefabcdef/, async (r: { request(): { url(): string }; fulfill(o: object): Promise<void> }) => {
      if (r.request().url().includes("/abcdefabcdef/")) return r.fulfill({ status: 404, body: "" });
      const res = await pg.request.get(`${url}/api/runs/${run}`);
      const b = { ...(await res.json()), ...(own ? {} : { bound: cart, week: null }), undo: { state: "none" }, ...body };
      const read = { ...b, refunded: b.undo.state === "refunded" };
      return r.fulfill({ json: { ...b, returned: returnKind(read), card: returnCard(read) } });
    });
    await pg.goto(`${url}/?${q}&run=abcdefabcdef`);
    await pg.waitForTimeout(1500);
    const text = await pg.locator("body").innerText();
    await ctx.close();
    return text;
  };
  const REFUNDED = { settled: { ok: true }, events: [CAPTURING, { ...OWN, action: "captured", seq: 5, data: { hold: 4 } }], undo: { state: "refunded" } };
  const rows: { name: string; body: object; desk: RegExp; never: RegExp }[] = [
    { name: "a capture PayPal never answered", body: { settled: { ok: false, reason: "the payment step failed" }, events: [CAPTURING], mine: true }, desk: /We can't tell yet/, never: /Not paid/ },
    { name: "a capture that says PENDING", body: { settled: { ok: false, reason: "PayPal is still processing the payment" }, events: [CAPTURING, PENDING], mine: true }, desk: /We can't tell yet/, never: /Not paid/ },
    { name: "a capture for the wrong amount", body: { settled: { ok: false, reason: "PayPal captured a different amount than the cart you approved" }, events: [{ ...OWN, action: "capture-mismatch" }], mine: true }, desk: /Captured the wrong amount/, never: /Not paid/ },
    { name: "a stranger on a wrong-amount capture", body: { settled: { ok: false, reason: "x" }, events: [{ ...OWN, action: "capture-mismatch" }], mine: false }, desk: /We can't tell yet/, never: /Not paid|you approved/i },
    { name: "a stranger on someone's Cancel", body: { settled: null, events: [CANCEL], mine: false }, desk: /Cancel was pressed in PayPal/, never: /You cancelled/ },
    { name: "Cancel beside an open capture", body: { settled: null, events: [CAPTURING, CANCEL], mine: true }, desk: /We can't tell yet/, never: /Not paid|Nothing was charged|You cancelled/ },
    { name: "Cancel beside a stranger's open capture", body: { settled: null, events: [CAPTURING, CANCEL], mine: false }, desk: /We can't tell yet/, never: /Not paid|Nothing was charged|You cancelled/ },
    { name: "a Cancel on the owner's run, which anyone with the link could have pressed", body: { settled: null, events: [CANCEL], mine: true }, desk: /Cancel was pressed in PayPal/, never: /You cancelled|Waiting on PayPal/ },
    { name: "a clear no from PayPal", body: { settled: { ok: false, reason: "PayPal declined the card" }, events: [CAPTURING, ANSWER], mine: true }, desk: /Not paid[\s\S]*PayPal declined the card/, never: /We can't tell yet/ },
    { name: "a refunded payment", body: { ...REFUNDED, mine: true }, desk: /Refunded \$12\.00/, never: /Paid \$12|Not paid|seller's tracking|tracking number/ },
    { name: "a stranger on a refunded payment", body: { ...REFUNDED, mine: false }, desk: /Refunded \$12\.00/, never: /Paid \$12|Not paid|Paid from another browser/ },
  ];
  for (const r of rows) for (const q of ["desk=1", "market=1", ...(r.name === "a clear no from PayPal" ? [] : ["wallet=0"])]) {
    const text = await said(q, r.body);
    if (!r.desk.test(text)) fail(`${q}, ${r.name}: doesn't say ${r.desk}`);
    if (r.never.test(text)) fail(`${q}, ${r.name}: says ${r.never}`);
  }
  // A stranger on the classic page: someone's cart set aside isn't theirs to bring back, and they're not told they set it aside.
  const aside = await said("wallet=0", { settled: null, events: [], aside: true, mine: false });
  if (/You set this cart aside|Bring it back|Not this one|under your \$/.test(aside)) fail("the classic page talks to a stranger as the cart's owner");
  // The wallet reads the same runs. A paid run for another cart says nothing about this deal: no "Paid" over it, and its Approve stays.
  for (const r of rows.slice(4, 7)) {
    const text = await said("wallet=1", r.body);
    if (r.never.test(text)) fail(`wallet, ${r.name}: says ${r.never}`);
  }
  const other = await said("wallet=1", { settled: { ok: true }, events: [], mine: false });
  if (/Paid from another browser/.test(other)) fail("the wallet says this deal was paid off another cart's paid link");
  if (!/Approve/.test(other)) fail("another cart's paid link took the wallet's Approve away");
  // The same total from another seller isn't this deal (fresh Q): the match is item, seller and total.
  const lookalike = await said("wallet=1", { settled: { ok: true }, events: [], mine: false, week: 1, bound: { item: "Goldfeather Kettle (fictional)", merchant: "Someone Else (fictional)", total: "47.73", currency: "USD", hash: "h", orderId: null } }, true);
  if (/Paid from another browser/.test(lookalike) || !/Approve/.test(lookalike)) fail("the wallet took another seller's cart at the same total for this deal");
  // This very deal, refunded, on a second browser: not "Paid", and no second Approve.
  const undone = await said("wallet=1", { ...REFUNDED, mine: false }, true);
  if (!/then refunded/.test(undone) || /\bApprove \$/.test(undone)) fail("a second browser on this deal's refunded run doesn't say so, or offers Approve");
}
// Round 5 (red team): a typed address can't throw or reach another route: a malformed anchor, and a run= that isn't a run id.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  for (const q of ["/?desk=ledger#%", "/?market=1#%", "/?wallet=0&run=../challenge"]) {
    const p = await ctx.newPage();
    const thrown: string[] = [];
    const other: string[] = [];
    p.on("pageerror", (e: Error) => thrown.push(e.message));
    p.on("request", (r: { url(): string }) => { if (q.includes("run=") && /\/api\/(challenge|runs\/\.\.)/.test(r.url())) other.push(r.url()); });
    await p.goto(`${url}${q}`);
    await p.waitForTimeout(1200);
    if (thrown.length) fail(`${q} threw: ${thrown[0]!.slice(0, 120)}`);
    if (other.length) fail(`${q} fetched ${other[0]!.slice(0, 120)}`);
    await p.close();
  }
  await ctx.close();
}
// The landing's word ceilings (DD and Lead-12, Thu Nov 5, after the numbered sections): they can only go down. Counted like
// docs/launch/word-count.mjs (body.innerText after the network settles, the same word rule). "Calm" is the page minus the try
// counter and the live feed (.ds-ch-count, .ds-ch-feed), whose words follow how many tries this server has seen; those two
// are capped on their own instead (LANDING_LIVE_WORDS), so a busy server never fails the calm numbers.
// - First load (what a judge reads in the first seconds): calm 1375 / 1366, and the whole page 1421 / 1412, the number the
//   DD's ACCEPT names (read only in the blank first state: counter blank, feed showing its layers, so tries can't move it).
// - After a slow full scroll (what a judge who scrolls reads; RealMarket and the rest of the Challenge only mount on the way):
//   calm 1473 / 1464. The whole page there was 1535 / 1526 (R's re-check), which is 1473 / 1464 plus 62 live words; the walk
//   pins the calm number and prints the whole one. Tightened to 1472 / 1463 (Lead-12 and R, Fri Nov 6) once the page clock
//   made it hour-safe: T's range line (66c46ab7) measures 1472 / 1463 at the longest greeting, on R's walk and mine.
// - Tightened again with decision 1a (Joshua, Fri Nov 6 9:35 AM: the challenge right under the ask; Track C): its counter and,
//   on live, the scammer AI's invitation (+36) now load with the page, so 38 words went (Impact's Microsoft Research line,
//   which the missing layer quotes whole; the promises' lede, which opened the page; "part by part" on the steps' link).
//   Then the DD's chip, "Goose's AI reader: off" for "AI reader, off for now" (-1). Measured on a keyless seat of that
//   commit: first load calm 1339 / 1330, page 1401 / 1392 (counter 0), scrolled 1433 / 1424.
// - Live counter and feed: 139, the most they can draw (five feed rows with the longest words, the longest counter lines and
//   the full-network note), computed from core's words in core/test/landing-calm.test.ts, which pins every number here.
// - The clock (Lead-12 and R, Fri Nov 6): the hero greets by the hour, "Good evening." (2 words) but "Hello." (1) from 00:00 to
//   04:59, so the same build read 1421 at 21:00 and 1420 after midnight. The page reads on a fixed clock, today's date at the
//   first hour with the longest greeting (from core's greeting(), in UTC), so a run at any hour counts what a daytime reader sees.
const landingWordCount = (t: string) => t.split(/\s+/).filter((x) => /[\p{L}\d]/u.test(x)).length;
const LANDING_GREETING_HOUR = Array.from({ length: 24 }, (_, h) => h).reduce((best, h) => (landingWordCount(greeting(h, null)) > landingWordCount(greeting(best, null)) ? h : best), 0);
const landingNow = () => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), LANDING_GREETING_HOUR, 30); };
const LANDING_WORDS = { 1440: 1339, 390: 1330 } as const;
const LANDING_PAGE_WORDS = { 1440: 1401, 390: 1392 } as const;
const LANDING_SCROLLED_WORDS = { 1440: 1433, 390: 1424 } as const;
const LANDING_LIVE_WORDS = 139;
const landingRead = (p: { evaluate: Function }) => p.evaluate(() => {
  const W = (t: string) => t.split(/\s+/).filter((x) => /[\p{L}\d]/u.test(x)).length;
  const live = [...document.querySelectorAll<HTMLElement>(".ds-ch-count, .ds-ch-feed")].reduce((s, e) => s + W(e.innerText), 0);
  const page = W(document.body.innerText);
  const feed = document.querySelector<HTMLElement>(".ds-ch-feed")?.dataset.feed ?? "none";
  const counter = document.querySelector<HTMLElement>(".ds-ch-count")?.dataset.tried ?? "blank";
  return { page, live, calm: page - live, numbered: document.querySelectorAll(".ds .ds-n").length, feed, counter };
}) as Promise<{ page: number; live: number; calm: number; numbered: number; feed: string; counter: string }>;
for (const [width, height] of [[1440, 900], [390, 844]] as const) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: "reduce", timezoneId: "UTC" });
  const p = await ctx.newPage();
  await p.clock.install({ time: landingNow() });
  await p.goto(`${url}/?desk=1`, { waitUntil: "networkidle", timeout: 30000 });
  await p.waitForTimeout(2500);
  const n = await landingRead(p);
  if (n.numbered !== 6) fail(`landing at ${width}: ${n.numbered} numbered sections, not Joshua's six`);
  if (n.calm > LANDING_WORDS[width]) fail(`landing at ${width}: ${n.calm} words outside the live counter and feed (ceiling ${LANDING_WORDS[width]}; page ${n.page})`);
  // Since the challenge leads (Joshua, Fri Nov 6 9:35 AM, decision 1a) its counter is read on the first load. On this walk's
  // fresh seat it reads 0, a state tries can't move either, so the page ceiling holds there too; any other count still fails.
  if (n.feed !== "layers" || (n.counter !== "blank" && n.counter !== "0")) fail(`landing at ${width}: read with the feed at "${n.feed}" and the counter at "${n.counter}", not the blank or fresh first read the page ceiling was set on`);
  else if (n.page > LANDING_PAGE_WORDS[width]) fail(`landing at ${width}: the whole page reads ${n.page} words (ceiling ${LANDING_PAGE_WORDS[width]})`);
  if (n.live > LANDING_LIVE_WORDS) fail(`landing at ${width}: the live counter and feed read ${n.live} words (cap ${LANDING_LIVE_WORDS})`);
  // Down the page slowly, as a judge would, so what mounts on the way is drawn, then let it settle.
  for (let i = 0; i < 80; i++) {
    const end = await p.evaluate(() => { scrollBy(0, Math.round(innerHeight * 0.8)); return scrollY + innerHeight >= document.documentElement.scrollHeight - 2; });
    await p.waitForTimeout(150);
    if (end) break;
  }
  await p.waitForLoadState("networkidle").catch(() => {});
  await p.waitForTimeout(2500);
  const s = await landingRead(p);
  if (s.calm > LANDING_SCROLLED_WORDS[width]) fail(`landing at ${width}, scrolled: ${s.calm} words outside the live counter and feed (ceiling ${LANDING_SCROLLED_WORDS[width]}; page ${s.page})`);
  if (s.live > LANDING_LIVE_WORDS) fail(`landing at ${width}, scrolled: the live counter and feed read ${s.live} words (cap ${LANDING_LIVE_WORDS})`);
  console.log(`landing at ${width} (clock ${String(LANDING_GREETING_HOUR).padStart(2, "0")}:30 UTC): first load calm ${n.calm} (ceiling ${LANDING_WORDS[width]}), page ${n.page} (ceiling ${LANDING_PAGE_WORDS[width]}); scrolled calm ${s.calm} (ceiling ${LANDING_SCROLLED_WORDS[width]}), page ${s.page}; live ${n.live} then ${s.live} (cap ${LANDING_LIVE_WORDS})`);
  await ctx.close();
}
await browser.close();
if (fails.length) { console.error(`desk-walk: ${fails.length} failed`); process.exit(1); }
console.log("desk-walk: OK (the run's lines: clips requested and captions shown, sound itself unheard on an iPhone; Back, Forward and reload; offline; a lost chunk; a thrown page; the charts; the tour by keyboard)");

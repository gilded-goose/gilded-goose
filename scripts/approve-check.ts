/// <reference lib="dom" />
// approve_has_accessible_name_and_amount (W53, 021 §4 item 3): the wallet's hero Approve, in a real browser against a
// server started with PAYMENT=fake (no PayPal call, no key spent). Fails unless:
//   1. it is a <button> whose accessible name is exactly "Approve $<the bound cart's total>", at least 44 × 44 px,
//      described by its terms;
//   2. the keyboard reaches it with Tab and presses it with Enter (twice: one run), and that press replays week 1 on
//      the server, makes the order for the bound cart, passes the (fake) PayPal tap and comes back paid at that total;
//   3. a run that isn't the recording, or a bound cart that differs in any field (item, store, total, currency)
//      or is missing, gets no order: the page says why, stays put, and never POSTs approve (one case per field);
//   4. with no server, or one without PayPal, the hero is the labeled picture ("recorded, can't be paid") and no
//      control says Approve;
//   3b. a host asleep since the page loaded (Render's 503 HTML page) says it's waking; a JSON 503 keeps its own words;
//   5. the server's `replayOnly` refuses a week it has no recording of (409) instead of haggling live or by rule;
//   6. paid_lands_on_wallet_never_reoffered (Joshua's answer 1): back from the (fake) PayPal tap the page is the wallet
//      saying "Paid $<total>" with the order and no Approve, after a reload too, with "to approve" moved to "you paid";
//      that browser's own replay is refused (409), a tab it opened before paying turns to Paid without a second order,
//      and a fresh browser still gets its own Approve; a return that wasn't paid says so above a fresh Approve.
//   7. unconfirmed_release_holds_approve (Joshua, Wed Oct 28): after a hold PayPal didn't confirm released, the hero
//      waits in plain words with no Approve, the server refuses a new cart for that browser (409) until PayPal shows the
//      hold released, and Approve comes back once it does;
//   8. wrong_amount_capture_is_a_red_row (Joshua, Wed Oct 28): a capture for another amount is a red row in "Your week"
//      with both amounts and an Undo that refunds it.
// The expected total is the engine's (walletHome over the bundled week-1 tape), never typed here.
//
//   node scripts/approve-check.ts [url]   default http://localhost:8787 (PAYMENT=fake, WEB_URL set to the same origin,
//   PAYPAL_CLIENT_SECRET=ci.stand-in so step 7 can sign the held cookie it writes by hand)

import "./route-closed.ts"; // a route mid-request when its page closes ends quietly, nothing else does
import { returnKind } from "../core/src/view/return.ts";
import { localOnly } from "./not-live.ts";
import { readFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { signWalletCookie, walletCookieKey } from "../server/src/wallet-cookie.ts";
import type { Tape } from "@goose/core";
import { recordedWeek } from "@goose/core/week";
import { ENTRY_CATEGORY } from "@goose/core/local";
import { sha256Hex } from "@goose/core/sha256";
import { gridRows } from "@goose/core/grid";
import { HELD_WAIT, WALLET_AT, heldCapWords, heldRetryLabel, walletHome } from "@goose/core/wallet";
/** A mocked run reads the way the server sends it: the page takes `returned` from the server, never works it out itself. */
const told = <R extends { week: number; bound: { total: string; orderId: string | null } | null; settled: { ok: boolean; reason?: string } | null; events: unknown[] }>(run: R) => ({ ...run, returned: returnKind({ ...run, mine: true } as Parameters<typeof returnKind>[0]) });

const url = localOnly((process.argv[2] ?? "http://localhost:8787/").replace(/\/?$/, "/"));
function fail(m: string): never { console.error(`APPROVE FAIL: ${m}`); process.exit(1); }

const tape = JSON.parse(readFileSync("docs/fixtures/tape-seed-1.json", "utf8")) as Tape;
const deal = walletHome(await recordedWeek(tape, sha256Hex, () => WALLET_AT, ENTRY_CATEGORY), WALLET_AT, tape).deal ?? fail("week 1 has no deal waiting");
const NAME = `Approve $${deal.total}`;
const before = walletHome(await recordedWeek(tape, sha256Hex, () => WALLET_AT, ENTRY_CATEGORY), WALLET_AT, tape).counts;

const health = await fetch(`${url}api/health`).then((r) => r.json() as Promise<{ payment?: string }>).catch(() => null);
if (health?.payment !== "fake") fail(`${url} isn't a PAYMENT=fake server (payment: ${health?.payment ?? "no answer"})`);

const browser = await chromium.launch();
const fresh = async (): Promise<Page> => (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const approve = (page: Page) => page.getByRole("button", { name: NAME, exact: true });

// 1 and 2: the name, the size, then Tab and Enter all the way through PayPal's (fake) tap.
{
  const page = await fresh();
  await page.goto(`${url}?wallet=1`);
  try { await approve(page).waitFor({ timeout: 20_000 }); } catch { fail(`no button named "${NAME}" on the wallet`); }
  const box = await approve(page).boundingBox() ?? fail("the Approve has no box");
  if (box.width < 44 || box.height < 44) fail(`the Approve is ${Math.round(box.width)} × ${Math.round(box.height)} px, under 44 × 44`);
  if ((await approve(page).evaluate((b) => b.tagName)) !== "BUTTON") fail("the Approve isn't a <button>");
  const terms = await approve(page).evaluate((b) => document.getElementById(b.getAttribute("aria-describedby") ?? "")?.textContent ?? "");
  if (!terms.includes("This exact cart only")) fail(`the Approve isn't described by its terms (got "${terms}")`);
  let runPosts = 0;
  page.on("request", (r) => { if (r.method() === "POST" && /\/api\/runs$/.test(r.url())) runPosts++; });
  let reached = false;
  for (let i = 0; i < 20 && !reached; i++) {
    await page.keyboard.press("Tab");
    reached = await approve(page).evaluate((b) => b === document.activeElement);
  }
  if (!reached) fail("Tab never reaches the Approve");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  try { await page.waitForURL(/[?&]run=/, { timeout: 20_000 }); } catch { fail(`Enter on the Approve never came back from PayPal (at ${page.url()})`); }
  if (runPosts !== 1) fail(`two presses started ${runPosts} runs, not one`);
  console.log(`ok  "${NAME}": a button, ${Math.round(box.width)} × ${Math.round(box.height)} px, Tab then Enter → order → PayPal tap`);
  await paidOnWallet(page, "back from PayPal");
  await page.reload();
  await paidOnWallet(page, "after a reload");
  // That browser's own replay of the week, as a script or a stale tab would send it: refused, no run, no order.
  const again = await page.request.post(`${url}api/runs`, { data: { seed: 1, pace: false, replayOnly: true } });
  if (again.status() !== 409) fail(`the paying browser's replay of the week answered ${again.status()}, not 409`);
  console.log("ok  the paying browser's replay of the week is refused (409)");
  await page.context().close();
}

/** Joshua's answer 1: the wallet, "Paid $<total>" with the order, no Approve anywhere, and the week's counts moved. */
async function paidOnWallet(page: Page, when: string) {
  if (!/[?&]wallet=1(&|$)/.test(page.url())) fail(`${when}: not the wallet (${page.url()})`);
  const status = page.locator(".hero .paid[role=status]");
  try { await status.waitFor({ timeout: 10_000 }); } catch { fail(`${when}: the wallet doesn't say Paid`); }
  const said = (await status.innerText()).replace(/\s+/g, " ").trim();
  if (!said.startsWith(`Paid $${deal.total} `)) fail(`${when}: the wallet says "${said}", not "Paid $${deal.total}"`);
  if (!/[Oo]rder FAKE-\d{4}$/.test(said)) fail(`${when}: no order named under Paid ("${said}")`);
  // W50a: fake mode names a test order, never PayPal's, once the server has said it is fake (before then, just "Order").
  try { await status.filter({ hasText: /Test order FAKE-\d{4}/ }).waitFor({ timeout: 10_000 }); } catch { fail(`${when}: fake mode doesn't say "Test order" ("${(await status.innerText()).trim()}")`); }
  if (/PayPal order/.test(await status.innerText())) fail(`${when}: fake mode says "PayPal order"`);
  const controls = await page.locator("a, button, [role=button]").evaluateAll((els) => els.filter((e) => /^\s*approve/i.test(e.textContent ?? "")).length);
  if (controls) fail(`${when}: ${controls} control(s) still offer Approve after paying`);
  const n = async (k: string) => Number(await page.locator(`[data-count=${k}]`).textContent());
  if ((await n("waiting")) !== before.waiting - 1 || (await n("paid")) !== before.paid + 1) fail(`${when}: the week still counts the paid cart as waiting (paid ${await n("paid")}, to approve ${await n("waiting")})`);
  // W50c: back from PayPal (the run in the URL), the counts are the server's fold for this browser; without it, the wallet's own.
  const from = await page.locator(".tiles").getAttribute("data-from");
  if (from !== (/[?&]run=/.test(page.url()) ? "server" : "wallet")) fail(`${when}: the week's counts came from the ${from}, at ${page.url()}`);
  console.log(`ok  ${when}: the wallet says "${said}", no Approve, to approve ${before.waiting} → ${await n("waiting")} (counts from the ${from})`);
}

// 6: a tab opened before paying, then paid in another tab of the same browser: its press turns to Paid, starts no run
// and makes no second order. A fresh browser (each judge) still gets its own Approve.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const stale = await ctx.newPage();
  await stale.goto(`${url}?wallet=1`);
  await approve(stale).waitFor({ timeout: 20_000 });
  const payer = await ctx.newPage();
  await payer.goto(`${url}?wallet=1`);
  await approve(payer).click();
  try { await payer.waitForURL(/\?wallet=1&run=/, { timeout: 20_000 }); } catch { fail(`the second tab's Approve never came back to the wallet (at ${payer.url()})`); }
  await paidOnWallet(payer, "the second tab, back from PayPal");
  const orders = async () => (await (await fetch(`${url}api/fake-paypal/orders`)).json() as { orders: Record<string, number> }).orders;
  const made = await orders();
  let approvePosts = 0;
  stale.on("request", (r) => { if (r.method() === "POST" && /\/api\/runs\/[^/]+\/approve$/.test(r.url())) approvePosts++; });
  await approve(stale).click();
  await paidOnWallet(stale, "the tab opened before paying, pressed after");
  if (approvePosts) fail(`the stale tab still POSTed approve ${approvePosts} time(s)`);
  if (JSON.stringify(await orders()) !== JSON.stringify(made)) fail(`the stale tab's press made an order (${JSON.stringify(made)} → ${JSON.stringify(await orders())})`);
  await ctx.close();
  const judge = await fresh();
  await judge.goto(`${url}?wallet=1`);
  try { await approve(judge).waitFor({ timeout: 20_000 }); } catch { fail("a fresh browser isn't offered its own Approve after another browser paid"); }
  if (await judge.locator(".hero .paid").count()) fail("a fresh browser shows another browser's Paid");
  // Its own cart, all the way: its press is answered with its own order, never "already paid" or another browser's.
  await approve(judge).click();
  try { await judge.waitForURL(/\?wallet=1&run=/, { timeout: 20_000 }); } catch { fail(`a fresh browser's Approve never came back paid (alert: ${JSON.stringify(await judge.getByRole("alert").allTextContents())})`); }
  await paidOnWallet(judge, "a fresh browser, its own cart");
  const own = (await judge.locator(".hero .paid .oid").textContent())?.trim();
  // Orders only: under AUTHORIZE (the default) the counts also list each hold as AUTHORIZATION_<status>.
  const ordersMade = Object.entries(made).filter(([k]) => !k.startsWith("AUTHORIZATION_")).reduce((a, [, n]) => a + n, 0);
  if (ordersMade >= Number(own?.slice(5))) fail(`a fresh browser was shown an earlier order (${own})`);
  await judge.context().close();
  console.log(`ok  a fresh browser still gets its own Approve and pays its own cart (${own})`);
}

// 6b: back from PayPal unpaid (cancelled): the wallet says so above a fresh Approve, never Paid.
{
  const page = await fresh();
  await page.route(/\/api\/runs\/abcdef123456$/, (route) => route.fulfill({ json: { done: true, seed: 1, week: 1, bound: null, settled: null, events: [], returned: "cancelled" } }));
  await page.goto(`${url}?wallet=1&run=abcdef123456`);
  try { await page.getByRole("alert").filter({ hasText: "Cancel was pressed in PayPal." }).waitFor({ timeout: 20_000 }); } catch { fail("back from a PayPal cancel, the wallet doesn't say so"); }
  await approve(page).waitFor({ timeout: 20_000 });
  if (await page.locator(".hero .paid").count()) fail("a cancelled return shows Paid");
  await page.context().close();
  console.log("ok  back from a cancel: the wallet says so, Approve stays");
}

// 6c: back from PayPal when no one can tell whether money moved (a capture PayPal never confirmed): fixed words, and no
// Approve at all, so a second cart can't pay twice. The settle's own text (raw, PayPal's) never reaches the screen.
{
  const page = await fresh();
  const events = [
    { seq: 1, t: 0, shopperId: "s", visibility: "owner", actor: "guard", action: "capturing", verdict: "ok", why: "hold", data: {} },
    { seq: 2, t: 0, shopperId: "s", visibility: "owner", actor: "paypal", action: "capture-failed", verdict: "refused", why: "RAW PAYPAL TEXT", data: { hold: 1, code: "unknown" } },
  ];
  await page.route(/\/api\/runs\/abcdef123457$/, (route) => route.fulfill({ json: told({ done: true, seed: 1, week: 1, bound: { item: "x", merchant: "x", total: "47.73", currency: "USD", orderId: "FAKE-0009" }, settled: { ok: false, reason: "RAW PAYPAL TEXT" }, events }) }));
  await page.goto(`${url}?wallet=1&run=abcdef123457`);
  try { await page.getByRole("alert").filter({ hasText: "Whether this was charged isn't clear" }).waitFor({ timeout: 20_000 }); } catch { fail("back from a capture no one can confirm, the wallet doesn't say it can't tell"); }
  if (await page.getByRole("button", { name: /^\s*approve/i }).count()) fail("a can't-tell return still offers Approve");
  if ((await page.locator("main").textContent())?.includes("RAW PAYPAL TEXT")) fail("the settle's own text reached the screen");
  await page.context().close();
  console.log("ok  back from a can't-tell capture: fixed words, no Approve");
}

// 6d: back from PayPal paid, but the browser kept no cookie (blocked, or another host name): Paid from the server's run.
{
  const page = await fresh();
  await page.route(/\/api\/runs\/abcdef123458$/, (route) => route.fulfill({ json: told({ done: true, seed: 1, week: 1, bound: { item: "x", merchant: "x", total: deal.total, currency: "USD", orderId: "FAKE-0042" }, settled: { ok: true, captureId: "FAKE-CAPTURE-0042" }, events: [] }) }));
  await page.goto(`${url}?wallet=1&run=abcdef123458`);
  try { await page.locator(".hero .paid[role=status]").filter({ hasText: "FAKE-0042" }).waitFor({ timeout: 20_000 }); } catch { fail("a paid return with no cookie doesn't show Paid"); }
  if (await approve(page).count()) fail("a paid return with no cookie still offers Approve");
  await page.context().close();
  // Until the server says what it is, the order isn't called PayPal's (Lesson 13): here it never answers.
  const blind = await fresh();
  await blind.route(/\/api\/health$/, (route) => route.abort());
  await blind.route(/\/api\/runs\/abcdef123458$/, (route) => route.fulfill({ json: told({ done: true, seed: 1, week: 1, bound: { item: "x", merchant: "x", total: deal.total, currency: "USD", orderId: "FAKE-0042" }, settled: { ok: true, captureId: "FAKE-CAPTURE-0042" }, events: [] }) }));
  await blind.goto(`${url}?wallet=1&run=abcdef123458`);
  try { await blind.locator(".hero .paid .p2").filter({ hasText: /^Order FAKE-0042$/ }).waitFor({ timeout: 20_000 }); } catch { fail(`with no answer from the server, Paid names "${(await blind.locator(".hero .paid .p2").textContent())?.trim()}", not "Order"`); }
  await blind.context().close();
  console.log("ok  back paid with no cookie: Paid from the server's run, no Approve");
}

// 6e (7): back from PayPal after a hold whose release wasn't confirmed (AUTHORIZE): its own fixed words, not "before any
// money moved", and no Approve until PayPal confirms the release (Joshua, Wed Oct 28); then Approve comes back.
{
  const page = await fresh();
  const events = [
    { seq: 1, t: 0, shopperId: "s", visibility: "owner", actor: "guard", action: "capturing", verdict: "ok", why: "hold", data: {} },
    { seq: 2, t: 0, shopperId: "s", visibility: "owner", actor: "paypal", action: "void-failed", verdict: "refused", why: "RAW PAYPAL TEXT", data: { hold: 1, code: "expired", release: "unconfirmed" } },
  ];
  await page.route(/\/api\/runs\/abcdef123459$/, (route) => route.fulfill({ json: told({ done: true, seed: 1, week: 1, bound: { item: "x", merchant: "x", total: deal.total, currency: "USD", orderId: "FAKE-0043" }, settled: { ok: false, reason: "RAW PAYPAL TEXT" }, events }) }));
  let paypalSays = "held";
  let asks = 0;
  await page.route(/\/api\/runs\/held$/, (route) => (asks++, route.fulfill(paypalSays === "capped" ? { status: 429, json: { state: "held", error: heldCapWords("ip"), cap: "ip" } } : { json: { state: paypalSays, ...(paypalSays === "held" ? { retryIn: 3 } : {}) } })));
  await page.goto(`${url}?wallet=1&run=abcdef123459`);
  try { await page.getByRole("alert").filter({ hasText: "releasing the hold on your money wasn't confirmed" }).waitFor({ timeout: 20_000 }); } catch { fail("back from a hold whose release wasn't confirmed, the wallet doesn't say so"); }
  try { await page.getByRole("status").filter({ hasText: HELD_WAIT }).waitFor({ timeout: 20_000 }); } catch { fail("an unconfirmed release doesn't say the wallet waits for PayPal"); }
  if (await approve(page).count()) fail("an unconfirmed release still offers Approve");
  if ((await page.locator("main").textContent())?.includes("RAW PAYPAL TEXT")) fail("the settle's own text reached the screen");
  const again = page.getByRole("button", { name: "Check with PayPal again" });
  await again.click();
  try { await page.getByRole("alert").filter({ hasText: "PayPal still shows the hold" }).waitFor({ timeout: 20_000 }); } catch { fail("asking again while PayPal still holds says nothing"); }
  if (await approve(page).count()) fail("PayPal still holding brings Approve back");
  // Joshua (Wed Oct 28): PayPal is asked at most once every 10 seconds; the button says the wait and can't be pressed.
  const waiting = page.locator(".held .recheck");
  if (!/^Ask PayPal again in [1-3] s$/.test((await waiting.textContent()) ?? "") || await waiting.getAttribute("aria-disabled") !== "true") fail(`while PayPal can't be asked again, the button reads "${await waiting.textContent()}"`);
  const before = asks;
  await waiting.click({ force: true });
  await page.waitForTimeout(300);
  if (asks !== before) fail("pressing the button during PayPal's wait still asked the server");
  // A cap the server hit: its words, and PayPal wasn't asked.
  paypalSays = "capped";
  await again.click({ timeout: 10_000 });
  try { await page.getByRole("alert").filter({ hasText: heldCapWords("ip") }).waitFor({ timeout: 20_000 }); } catch { fail("a used-up re-check cap says nothing"); }
  paypalSays = "released";
  await again.click();
  try { await approve(page).waitFor({ timeout: 20_000 }); } catch { fail("PayPal confirming the release doesn't bring Approve back"); }
  await page.context().close();
  console.log("ok  back from an unconfirmed release: its own words, no Approve until PayPal confirms, then Approve");
}

// 7: the server's own gate. A held cookie for week 1 naming an order PayPal (here, the fake) can't show released: the
// wallet waits with no Approve, and a cart started by hand for that browser is refused (409) before any budget. The
// server believes only a cookie it signed, so this one is signed under the stand-in secret the server was booted with.
{
  const page = await fresh();
  const heldValue = signWalletCookie(walletCookieKey("ci.stand-in"), "goose_wallet_held", "1_FAKE-9999");
  await page.context().addCookies([{ name: "goose_wallet_held", value: heldValue, url }]);
  await page.goto(`${url}?wallet=1`);
  try { await page.getByRole("status").filter({ hasText: HELD_WAIT }).waitFor({ timeout: 20_000 }); } catch { fail("a held cookie doesn't make the wallet wait for PayPal"); }
  const started = await page.evaluate(async () => { const r = await fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seed: 1, pace: false, replayOnly: true }) }); return { status: r.status, body: await r.json() as { held?: boolean; error?: string } }; });
  if (started.status !== 409 || started.body.held !== true || started.body.error !== HELD_WAIT) fail(`a held browser's new cart got ${started.status} ${JSON.stringify(started.body)}, not 409 held`);
  // The check on load asked PayPal, so the next one is up to 10 seconds away and the button says so (the server's window).
  const recheck = page.locator(".held .recheck");
  if (!(await recheck.textContent())?.startsWith(heldRetryLabel(1).replace("1 s", ""))) fail(`right after the check on load, the button reads "${await recheck.textContent()}", not the wait`);
  await page.getByRole("button", { name: "Check with PayPal again" }).click({ timeout: 15_000 });
  try { await page.getByRole("alert").filter({ hasText: "PayPal still shows the hold" }).waitFor({ timeout: 20_000 }); } catch { fail("the server's re-check of an unreleased hold says nothing"); }
  if (!(await recheck.textContent())?.startsWith("Ask PayPal again in")) fail("after a re-check, the button doesn't say the wait");
  if (await approve(page).count()) fail("a hold PayPal never released brings Approve back");
  if (!(await page.locator("a.replay.quiet").count())) fail("while waiting on PayPal, the replay is the loud action");
  // Your week agrees with the hero: the deal waits on PayPal, not on a tap.
  if (await page.locator('[data-count="waiting"]').textContent() !== "0") fail("while waiting on PayPal, Your week still counts the cart to approve");
  if (!(await page.locator(".wrows li.w-waiting").filter({ hasText: "waiting for PayPal" }).count())) fail("while waiting on PayPal, the week's row still waits for your tap");
  await page.context().close();
  console.log("ok  held on the server: 409 for a new cart, no Approve, until PayPal shows the hold released");
}

// 8: a capture for another amount than the one approved: a red row in "Your week" with both amounts, no Approve, and
// an Undo (this tab's undo key) that refunds what PayPal took.
{
  const page = await fresh();
  await page.addInitScript(() => { sessionStorage.setItem("goose_undo_abcdef12345a", "k"); });
  const events = [
    { seq: 1, t: 0, shopperId: "s", visibility: "owner", actor: "guard", action: "capturing", verdict: "ok", why: "hold", data: {} },
    { seq: 2, t: 0, shopperId: "s", visibility: "owner", actor: "paypal", action: "capture-mismatch", verdict: "refused", why: "RAW PAYPAL TEXT", price: "47.00", currency: "USD", data: { hold: 1, code: "amount-mismatch", approved: deal.total, approvedCurrency: "USD" } },
  ];
  await page.route(/\/api\/runs\/abcdef12345a$/, (route) => route.fulfill({ json: told({ done: true, seed: 1, week: 1, bound: { item: "x", merchant: "x", total: deal.total, currency: "USD", orderId: "FAKE-0044" }, settled: { ok: false, reason: "RAW PAYPAL TEXT" }, events }) }));
  let undoBody = "";
  await page.route(/\/api\/runs\/abcdef12345a\/undo$/, (route) => { undoBody = route.request().postData() ?? ""; return route.fulfill({ json: { ok: true, refundId: "FAKE-REFUND-0044" } }); });
  await page.goto(`${url}?wallet=1&run=abcdef12345a`);
  const row = page.locator(".wrows li.w-mismatch");
  try { await row.filter({ hasText: `PayPal captured $47.00; you approved $${deal.total}` }).waitFor({ timeout: 20_000 }); } catch { fail("a wrong-amount capture has no row with both amounts"); }
  if (!(await row.isVisible())) fail("the wrong-amount row is hidden");
  const red = await row.evaluate((li) => getComputedStyle(li).borderLeftColor);
  const refusedRed = await page.locator(".tile.no .n").evaluate((n) => getComputedStyle(n).color);
  if (red !== refusedRed) fail(`the wrong-amount row isn't red (${red}, refused is ${refusedRed})`);
  if (await approve(page).count()) fail("a wrong-amount capture still offers Approve");
  if (!(await page.locator("a.replay.quiet").count())) fail("beside a wrong amount, the replay is the loud action");
  // The hero says it too, where the shopper is already looking, with the Undo as its one filled button.
  const hero = page.locator(".hero .wrong");
  if (!(await hero.filter({ hasText: `PayPal captured $47.00; you approved $${deal.total}` }).count())) fail("the hero doesn't show both amounts of a wrong-amount capture");
  if (!(await hero.getByRole("button", { name: "Undo: refund $47.00" }).count())) fail("the hero has no Undo for a wrong-amount capture");
  if ((await page.locator("main").textContent())?.includes("RAW PAYPAL TEXT")) fail("the settle's own text reached the screen");
  await row.getByRole("button", { name: "Undo: refund $47.00" }).click();
  try { await row.getByRole("status").filter({ hasText: "Refunded: $47.00 back." }).waitFor({ timeout: 20_000 }); } catch { fail("Undo on the wrong-amount row doesn't say it refunded"); }
  if (JSON.parse(undoBody || "{}").undoKey !== "k") fail(`Undo didn't send this tab's undo key (${undoBody})`);
  if (!(await hero.getByRole("status").filter({ hasText: "Refunded: $47.00 back." }).count())) fail("after Undo, the hero still offers Undo (the two disagree)");
  await page.context().close();
  console.log("ok  wrong amount captured: a red row with both amounts, no Approve, Undo refunds it");
}

// 6f: a paid cookie this deal doesn't believe (another total): the server still refuses a second cart for this browser,
// and the press says so and is pressable again, never a button stuck on "Opening PayPal…".
{
  const page = await fresh();
  // Signed as the server signs it (the stand-in secret), or the server wouldn't believe it either.
  await page.context().addCookies([{ name: "goose_wallet_paid", value: signWalletCookie(walletCookieKey("ci.stand-in"), "goose_wallet_paid", "1_FAKE-0001_1.00"), url }]);
  await page.goto(`${url}?wallet=1`);
  await approve(page).click();
  try { await page.getByRole("alert").filter({ hasText: "already paid" }).waitFor({ timeout: 20_000 }); } catch { fail("a bent cookie's refused press says nothing"); }
  if (await approve(page).getAttribute("aria-disabled")) fail("a bent cookie's refused press leaves Approve busy");
  if (await page.locator(".hero .paid").count()) fail("a bent cookie shows Paid");
  await page.context().close();
  console.log("ok  a bent cookie: the server's refusal on screen, Approve not stuck");
}

// 3: a run that isn't the recording, or a bound cart unlike the hero's in any one field: no order, the reason on screen.
type Bound = { item: string; merchant: string; total: string; currency: string } | null;
const CASES: Array<{ what: string; start?: (b: { source: string }) => void; bound?: (b: NonNullable<Bound>) => Bound }> = [
  { what: "a live run, not the recording", start: (b) => { b.source = "live"; } },
  { what: "another item", bound: (b) => ({ ...b, item: "Silverfeather Kettle (fictional)" }) },
  { what: "another store", bound: (b) => ({ ...b, merchant: "Pondside Goods (fictional)" }) },
  { what: "another total", bound: (b) => ({ ...b, total: "1.00" }) },
  { what: "another currency", bound: (b) => ({ ...b, currency: "EUR" }) },
  { what: "no bound cart", bound: () => null },
];
for (const k of CASES) {
  const page = await fresh();
  let approvePosts = 0;
  page.on("request", (r) => { if (r.method() === "POST" && /\/api\/runs\/[^/]+\/approve$/.test(r.url())) approvePosts++; });
  if (k.start) await page.route(/\/api\/runs$/, async (route) => {
    const res = await route.fetch();
    const v = (await res.json()) as { source: string };
    k.start!(v);
    await route.fulfill({ response: res, json: v });
  });
  if (k.bound) await page.route(/\/api\/runs\/[0-9a-f]+$/, async (route) => {
    const res = await route.fetch();
    const v = (await res.json()) as { bound: Bound };
    if (v.bound) v.bound = k.bound!(v.bound);
    await route.fulfill({ response: res, json: v });
  });
  await page.goto(`${url}?wallet=1`);
  await approve(page).click();
  try { await page.getByRole("alert").filter({ hasText: /won.t open PayPal/ }).waitFor({ timeout: 20_000 }); }
  catch { fail(`${k.what} didn't stop the Approve (alert: ${JSON.stringify(await page.getByRole("alert").allTextContents())})`); }
  if (approvePosts) fail(`${k.what}: still POSTed approve ${approvePosts} time(s)`);
  if (!page.url().includes("wallet=1")) fail(`${k.what}: left the wallet (${page.url()})`);
  console.log(`ok  ${k.what}: no approve sent, the page says why`);
}

// 3b: the host fell asleep after the page loaded (Render's own 503 page, not JSON): it says the server is waking; a JSON
// 503 (every kept run busy) is the server's own words, a control that the waking line isn't said for every 503.
for (const [what, res, want] of [
  ["a host asleep since the page loaded", { status: 503, contentType: "text/html", body: "<html>Application loading</html>" }, /waking up/],
  ["a full server (JSON 503)", { status: 503, json: { error: "Too many runs are in progress on the server. Try again in a minute.", cap: "runs-kept" } }, /Too many runs are in progress/],
] as const) {
  const page = await fresh();
  await page.goto(`${url}?wallet=1`);
  await approve(page).waitFor({ timeout: 20_000 });
  await page.route(/\/api\/runs$/, (route) => route.fulfill(res));
  await approve(page).click();
  try { await page.getByRole("alert").filter({ hasText: want }).waitFor({ timeout: 10_000 }); }
  catch { fail(`${what}: the page didn't say ${want} (alert: ${JSON.stringify(await page.getByRole("alert").allTextContents())})`); }
  console.log(`ok  ${what}: the page says so`);
}

// 4: no server at all, or one without PayPal: the labeled picture, and nothing on the page that says Approve is a control.
for (const [what, cut] of [["no server", true], ["a server without PayPal", false]] as const) {
  const page = await fresh();
  if (cut) await page.route(/\/api\//, (route) => route.abort());
  else await page.route(/\/api\/health$/, (route) => route.fulfill({ json: { ok: true, paypal: false, payment: "off" } }));
  await page.goto(`${url}?wallet=1`);
  try { await page.locator(".approve[role=img]").waitFor({ timeout: 20_000 }); } catch { fail(`with ${what}, the hero isn't the picture of the Approve`); }
  if (!(await page.locator(".approve[role=img]").innerText()).includes("recorded, can’t be paid")) fail(`with ${what}, the picture isn't labeled "recorded, can't be paid"`);
  const controls = await page.locator("a, button, [role=button]").evaluateAll((els) => els.filter((e) => /^\s*approve/i.test(e.textContent ?? "")).length);
  if (controls) fail(`with ${what}, ${controls} control(s) still say Approve`);
  console.log(`ok  ${what}: the labeled picture, no Approve control`);
}

// 5: a week with no recording here: refused before any budget, never a live or rule haggle shown as the recorded week.
{
  const r = await fetch(`${url}api/runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seed: 424242, replayOnly: true }) });
  if (r.status !== 409) fail(`replayOnly on a week with no recording answered ${r.status}, not 409`);
  console.log("ok  replayOnly: a week with no recording is refused (409)");
}

// 6: W66, the three additions' rule (a): "Try to break it" opens on the live AI wherever the server has it within its
// caps, and on the plain rule wherever it doesn't (this fake server has no key: the control). A visitor's pick stays.
{
  const pressed = async (page: Page) => (await page.locator('.seg button[aria-pressed="true"]').innerText()).split("\n")[0];
  const off = await fresh();
  await off.goto(`${url}?wallet=0`);
  await off.locator(".seg").waitFor({ timeout: 20_000 });
  await off.waitForResponse((r) => r.url().endsWith("/api/judge"), { timeout: 20_000 }).catch(() => null);
  if ((await pressed(off)) !== "Plain rule") /* the toggle reads "Plain rule", its line "no AI" (SW) */ fail(`with no AI on the server, the judge box opens on "${await pressed(off)}"`);
  const on = await fresh();
  const status = await (await fetch(`${url}api/judge`)).json() as Record<string, unknown>;
  await on.route("**/api/judge", (r) => r.request().method() === "GET" ? r.fulfill({ json: { ...status, ai: "on", triesLeft: 5 } }) : r.fallback());
  await on.goto(`${url}?wallet=0`);
  try { await on.locator('.seg button[aria-pressed="true"]', { hasText: "AI reads your note" }).waitFor({ timeout: 20_000 }); } catch { fail(`with live AI within its caps, the judge box opens on "${await pressed(on)}", not the AI`); }
  await on.getByRole("button", { name: /^Plain rule/ }).click();
  await on.evaluate(() => dispatchEvent(new Event("online")));
  await on.waitForTimeout(500);
  if ((await pressed(on)) !== "Plain rule") fail("the visitor picked the plain rule, and the judge box switched back");
  console.log("ok  W66: the judge box opens on the live AI where the server has it, the plain rule where not; a pick stays");
  await off.close(); await on.close();
}

// 7: W63, the ledger never opens empty. Full screen with no run of its own shows recorded week 1 before any press: every
// folded row (the recording's own fold, computed here), the Watcher's refusal red, and a click on it opens its moment.
{
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const week = (await recordedWeek(tape, sha256Hex, () => Date.now(), ENTRY_CATEGORY)).events;
  const want = gridRows(week);
  const refusal = want.find((r) => r.tone === "refused") ?? fail("recorded week 1 has no refusal");
  await page.goto(`${url}?wallet=0&ledger=full`);
  try { await page.locator(".lg-grid .ag-row").first().waitFor({ timeout: 20_000 }); } catch { fail("?ledger=full opened with no rows before a press"); }
  await page.waitForTimeout(500);
  const seqs = (await page.locator(".lg-grid [data-ledger-seq]").evaluateAll((e) => e.map((x) => Number(x.getAttribute("data-ledger-seq"))))).sort((a, b) => a - b);
  if (seqs.join() !== want.map((r) => r.seq).join()) fail(`?ledger=full's first view isn't the recording's fold: rows ${seqs.join()}, want ${want.map((r) => r.seq).join()}`);
  if (!(await page.locator(".spine-head").innerText()).includes(`${week.length} decisions`)) fail(`the heading doesn't count the recording's ${week.length} decisions`);
  if (!(await page.locator(".spine-head").innerText()).includes("recorded week 1")) fail("the preloaded rows aren't labeled as recorded week 1");
  await page.locator(".lg-grid .ag-row.lg-refused").first().click();
  try { await page.getByText(`Row ${refusal.seq} of ${week.length}`, { exact: false }).waitFor({ timeout: 5_000 }); } catch { fail(`a click on the red refusal doesn't open row ${refusal.seq}'s moment`); }
  console.log(`ok  W63: ?ledger=full opens on recorded week 1's ${want.length} rows, the refusal red, its moment one click away`);
  await page.close();
}

// W70: the classic page's trust dial is labeled a demo record (only this browser's live carts count) until the dial
// proper (M3) earns it, so the seeded-looking "0 of 3" never reads as a real history. Desktop: the phone folds the dial
// under the run's details.
{
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.goto(`${url}?wallet=0`);
  await page.getByRole("button", { name: "Go find it" }).click({ timeout: 15_000 });
  const dial = page.locator("p.dial");
  try { await dial.waitFor({ timeout: 20_000 }); } catch { fail("after Go find it, no dial under the run"); }
  if (!(await dial.locator(".tag", { hasText: "demo record" }).count())) fail(`the dial isn't labeled a demo record: "${await dial.textContent()}"`);
  console.log("ok  W70: the dial under a run says it's a demo record");
  // 025 (Track T's suggestion): "Not this one" is a server row. The card says what the server does only once it holds
  // it, Approve is gone, a reload of the run keeps it aside, and "Bring it back" brings Approve back.
  let asideRun = "";
  page.on("request", (r) => { const m = /\/api\/runs\/([^/]+)\/aside$/.exec(new URL(r.url()).pathname); if (m) asideRun = m[1]!; });
  await page.locator(".rcard").getByRole("button", { name: "Not this one" }).click({ timeout: 20_000 });
  const held = page.locator('.rcard[data-outcome="declined"]', { hasText: "Approve is off and nothing is captured until you bring it back." });
  try { await held.waitFor({ timeout: 10_000 }); } catch { fail(`after Not this one (run "${asideRun}"), the card never said the server holds it aside: "${await page.locator(".rcard").first().textContent()}"`); }
  if (!asideRun || (await page.locator("#approve").count())) fail(`Not this one: run "${asideRun}", Approve still shown: ${await page.locator("#approve").count()}`);
  await page.goto(`${url}?wallet=0&run=${asideRun}`);
  try { await held.waitFor({ timeout: 10_000 }); } catch { fail("a reload of the run lost the set-aside"); }
  await page.getByRole("button", { name: "Bring it back" }).click();
  try { await page.locator("#approve").waitFor({ timeout: 10_000 }); } catch { fail("Bring it back didn't bring Approve back"); }
  console.log("ok  025: Not this one is kept by the server across a reload; Bring it back brings Approve back");
  await page.context().close();
}

await browser.close();
console.log("approve_has_accessible_name_and_amount ok");

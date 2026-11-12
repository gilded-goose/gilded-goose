/// <reference lib="dom" />
// suggest_tap_only_fills (Goose suggests, Nov 11): the white site's one suggestion chip, in a real browser at 390 px
// against a server started with PAYMENT=fake (no PayPal call, no key spent). Fails unless:
//   1. a fresh browser's Shop shows no chip and never fetches the chip's chunk (nothing new on the first load);
//   2. an approve sheet opened and closed without paying leaves no chip (an unpaid cart suggests nothing);
//   3. after a typed ask is paid for, the Ask screen shows exactly one chip, named "Ask again: <her words>", described
//      by the practice line (this server is the stand-in, so the line never says "paid"), at least 44 px tall, inside
//      the 390 px screen, and reached with Tab;
//   4. pressing it with Enter puts her words in the ask box and the cursor there, and sends nothing: not one request
//      leaves the page, no brief opens, Shop for this is still there to press;
//   5. it is still there after a reload, and gone once that payment is undone (a refunded cart suggests nothing);
//   5c. Forget beside the chip (reached with Tab, pressed with Enter) removes it, sends nothing, leaves no kept ask in the
//      tab, and a reload doesn't bring it back;
//   6. with the server away the page shows the recording and no chip, and never fetches the chunk.
//
//   node scripts/suggest-walk.ts [url]   default http://localhost:8787 (PAYMENT=fake, WEB_URL set to the same origin)

import "./route-closed.ts"; // a route mid-request when its page closes ends quietly, nothing else does
import { chromium, type Page } from "playwright";
import { localOnly } from "./not-live.ts";

const url = localOnly((process.argv[2] ?? "http://localhost:8787/").replace(/\/?$/, "/"));
function fail(m: string): never { console.error(`SUGGEST FAIL: ${m}`); process.exit(1); }

const WORDS = "A kettle under $55";
const NAME = `Ask again: ${WORDS}`;
const SAID = "Your own ask from a practice cart you approved, kept in this tab. A tap only fills the box.";

const health = await fetch(`${url}api/health`).then((r) => r.json() as Promise<{ payment?: string }>).catch(() => null);
if (health?.payment !== "fake") fail(`${url} isn't a PAYMENT=fake server (payment: ${health?.payment ?? "no answer"})`);

const browser = await chromium.launch();
const fresh = async (): Promise<{ page: Page; chunk: () => number }> => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })).newPage();
  let n = 0;
  page.on("request", (r) => { if (/\/assets\/Suggest-/.test(r.url())) n++; });
  return { page, chunk: () => n };
};
const shop = async (page: Page) => {
  await page.goto(`${url}goose.html#/shop`);
  try { await page.getByRole("button", { name: /^Shop for this/ }).waitFor({ timeout: 20_000 }); } catch { fail("the Shop's Ask never showed"); }
};
const chip = (page: Page) => page.locator(".ask-examples .ask-suggest button.chip");
/** Type the ask, send Goose and open the approve sheet. */
const toSheet = async (page: Page, words = WORDS) => {
  await page.locator("input.ask-input").fill(words);
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /^Send Goose/ }).click();
  await page.getByRole("button", { name: "Review and approve" }).first().click();
  try { await page.locator(".approve-btn").first().waitFor({ timeout: 30_000 }); } catch { fail("the approve sheet never opened"); }
};
const pay = async (page: Page) => {
  await page.locator(".approve-btn").first().click();
  try { await page.getByRole("button", { name: "Undo this payment" }).waitFor({ timeout: 30_000 }); } catch { fail(`the (fake) PayPal tap never came back to a receipt (at ${page.url()})`); }
};
const again = async (page: Page) => {
  await page.getByRole("button", { name: "Shop for something else" }).click();
  await page.getByRole("button", { name: /^Shop for this/ }).waitFor({ timeout: 10_000 });
};

// 1: nothing on a first visit, and the chunk isn't fetched.
{
  const { page, chunk } = await fresh();
  await shop(page);
  await page.waitForTimeout(1500);
  if (await chip(page).count()) fail("a fresh browser is shown a suggestion");
  if (chunk()) fail("a fresh browser's first load fetched the suggestion's chunk");
  console.log("ok  a fresh browser: no chip, and its chunk isn't fetched");

  // 2: a sheet opened and closed, nothing paid.
  await toSheet(page);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Shop for something else" }).click();
  await page.getByRole("button", { name: /^Shop for this/ }).waitFor({ timeout: 10_000 });
  await page.waitForTimeout(1500);
  if (await chip(page).count()) fail("an unpaid cart is suggested");
  console.log("ok  an approve sheet opened and closed, nothing paid: no chip");
  await page.context().close();
}

// 3, 4, 5: paid, so one chip; Enter on it only fills; a reload keeps it; Undo removes it.
{
  const { page } = await fresh();
  await shop(page);
  await toSheet(page);
  await pay(page);
  await again(page);
  try { await chip(page).waitFor({ timeout: 10_000 }); } catch { fail("after a paid cart, the Ask shows no suggestion"); }
  if ((await chip(page).count()) !== 1) fail(`${await chip(page).count()} suggestions, not one`);
  const check = async (when: string) => {
    const name = (await chip(page).innerText()).replace(/\s+/g, " ").trim();
    if (name !== NAME) fail(`${when}: the chip says "${name}", not "${NAME}"`);
    if (!(await page.getByRole("button", { name: NAME, exact: true }).count())) fail(`${when}: no button with the accessible name "${NAME}"`);
    const said = await chip(page).evaluate((b) => document.getElementById(b.getAttribute("aria-describedby") ?? "")?.textContent ?? "");
    if (said !== SAID) fail(`${when}: the chip is described by "${said}", not "${SAID}"`);
    if (!(await page.getByText(SAID, { exact: true }).isVisible())) fail(`${when}: the line under the chip isn't visible`);
    const box = await chip(page).boundingBox() ?? fail("the chip has no box");
    if (box.height < 44) fail(`${when}: the chip is ${Math.round(box.height)} px tall, under 44`);
    if (box.x < 0 || box.x + box.width > 390) fail(`${when}: the chip runs off a 390 px screen (${Math.round(box.x)} to ${Math.round(box.x + box.width)})`);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) fail(`${when}: the page scrolls sideways at 390 px`);
    return box;
  };
  const box = await check("back on the Ask");
  console.log(`ok  one chip "${NAME}", ${Math.round(box.width)} × ${Math.round(box.height)} px, described by the practice line`);

  // 4: keyboard only. Tab from the ask box reaches it; Enter fills and sends nothing.
  await page.locator("input.ask-input").focus();
  let reached = false;
  for (let i = 0; i < 12 && !reached; i++) {
    await page.keyboard.press("Tab");
    reached = await chip(page).evaluate((b) => b === document.activeElement);
  }
  if (!reached) fail("Tab never reaches the chip");
  if ((await page.locator("input.ask-input").inputValue()) !== "") fail("the ask box isn't empty before the tap");
  const sent: string[] = [];
  page.on("request", (r) => sent.push(`${r.method()} ${new URL(r.url()).pathname}`));
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2000);
  const value = await page.locator("input.ask-input").inputValue();
  if (value !== WORDS) fail(`the tap left "${value}" in the ask box, not "${WORDS}"`);
  if (sent.length) fail(`the tap sent ${sent.length} request(s): ${sent.join(", ")}`);
  if (!(await page.locator("input.ask-input").evaluate((el) => el === document.activeElement))) fail("the tap didn't move the cursor to the ask box");
  if (await page.getByRole("button", { name: /^Send Goose/ }).count()) fail("the tap opened a brief");
  if (await page.locator(".approve-btn").count()) fail("the tap opened an approve sheet");
  if (!(await page.getByRole("button", { name: /^Shop for this/ }).isEnabled())) fail("Shop for this isn't there to press after the tap");
  console.log(`ok  Tab then Enter: "${value}" in the ask box, the cursor there, 0 requests sent, no brief, no sheet`);

  // 5: a reload keeps it (the server's rows and this tab's own note), and Undo takes it away.
  await page.reload();
  try { await chip(page).waitFor({ timeout: 10_000 }); } catch { fail("after a reload the suggestion is gone"); }
  await check("after a reload");
  console.log("ok  still there after a reload");
  await toSheet(page, "A kettle under $58");
  await pay(page);
  await page.getByRole("button", { name: "Undo this payment" }).click();
  try { await page.getByText(/Refunded/).first().waitFor({ timeout: 30_000 }); } catch { fail("Undo never said Refunded"); }
  await again(page);
  await page.waitForTimeout(1500);
  // The second cart is refunded, so the newest paid cart is the first one again: same words, still one chip.
  await check("after the second cart was undone");
  console.log("ok  the newest cart undone: the chip is the earlier paid cart's, never the refunded one's");

  // 5c: Forget, beside the chip: the chip goes, nothing is sent, and a reload doesn't bring it back.
  const forget = page.getByRole("button", { name: "Forget this ask", exact: true });
  if ((await forget.count()) !== 1) fail(`${await forget.count()} Forget buttons beside the chip, not one`);
  const fbox = await forget.boundingBox() ?? fail("Forget has no box");
  if (fbox.x < 0 || fbox.x + fbox.width > 390) fail("Forget runs off a 390 px screen");
  await chip(page).focus();
  await page.keyboard.press("Tab");
  if (!(await forget.evaluate((b) => b === document.activeElement))) fail("Tab from the chip doesn't reach Forget");
  const wiped: string[] = [];
  page.on("request", (r) => wiped.push(`${r.method()} ${new URL(r.url()).pathname}`));
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  if (await chip(page).count()) fail("after Forget the chip is still there");
  if (wiped.length) fail(`Forget sent ${wiped.length} request(s): ${wiped.join(", ")}`);
  const kept = await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k === "gg-asking" || k.startsWith("gg-asked:")));
  if (kept.length) fail(`after Forget this tab still keeps ${kept.join(", ")}`);
  await page.reload();
  await page.getByRole("button", { name: /^Shop for this/ }).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(2500);
  if (await chip(page).count()) fail("a reload brought the forgotten ask back");
  console.log("ok  Forget (Tab, Enter): the chip is gone, 0 requests sent, nothing kept, and a reload doesn't bring it back");
  await page.context().close();
}

// 5b: the only paid cart undone leaves nothing.
{
  const { page } = await fresh();
  await shop(page);
  await toSheet(page);
  await pay(page);
  await page.getByRole("button", { name: "Undo this payment" }).click();
  try { await page.getByText(/Refunded/).first().waitFor({ timeout: 30_000 }); } catch { fail("Undo never said Refunded"); }
  await again(page);
  await page.waitForTimeout(2000);
  if (await chip(page).count()) fail("a refunded cart is suggested");
  console.log("ok  the only paid cart undone: no chip");
  await page.context().close();
}

// 6: the server away.
{
  const { page, chunk } = await fresh();
  await page.route(/\/api\//, (route) => route.abort());
  await page.goto(`${url}goose.html#/shop`);
  try { await page.getByText("Server away: showing the recording.").waitFor({ timeout: 20_000 }); } catch { fail("with the server away the Shop doesn't say so"); }
  // The recorded week's block is its own chunk now (Recorded.tsx): it still arrives, with its compare and demo card.
  try { await page.locator(".recorded .approve-btn, .recorded button, .recorded h2, .recorded h3").first().waitFor({ timeout: 20_000 }); } catch { fail("with the server away the recorded week's block never drew"); }
  await page.waitForTimeout(1000);
  if (await chip(page).count()) fail("the recording is shown a suggestion");
  if (chunk()) fail("with the server away the page fetched the suggestion's chunk");
  console.log("ok  the server away: the recording, no chip, no chunk");
  await page.context().close();
}

await browser.close();
console.log("SUGGEST OK: one chip from a paid cart only; a tap fills the ask box and sends nothing");

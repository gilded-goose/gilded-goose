// Track R-11 (the DD gate, Sat Oct 31): offline wins. The page-wide strip, in a real browser on a served build. A chunk
// that fails while she is offline is not an update, so the strip must say "You're offline." with no button (a Reload
// can't work offline), and once she is back it must offer Reload without claiming an update. Controls: a chunk that
// fails while online still says "Goose was just updated." with Reload, and going offline after that hides the Reload
// until she's back. The failed chunk is Vite's own `vite:preloadError` event (what mount.ts listens to), dispatched in
// the page while Playwright holds the context offline. Exits 1 on any miss.
//
//   node scripts/offline-strip-probe.ts [base] [path]   default http://localhost:4191 and / (a built site served by vite
//                                                       preview or server/; the page must run mountStates)
import { chromium, type Page } from "playwright";
import { LOST, OFFLINE, UPDATED } from "../web/src/states/words.ts";

const base = (process.argv[2] ?? "http://localhost:4191").replace(/\/$/, "");
const path = process.argv[3] ?? "/";
const fails: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) fails.push(what); };

const read = (page: Page) => page.evaluate(() => {
  const strip = document.querySelector<HTMLElement>(".st-strip");
  const button = strip?.querySelector<HTMLButtonElement>(".st-note-action");
  return {
    shown: !!strip && !strip.hidden && !("leaving" in strip.dataset),
    title: strip?.querySelector(".st-note-title")?.textContent ?? "",
    button: button && !button.hidden ? button.textContent ?? "" : "",
  };
});
const settle = async (page: Page) => { await page.waitForTimeout(400); return read(page); };
const chunkFails = (page: Page) => page.evaluate(() => { dispatchEvent(new Event("vite:preloadError", { cancelable: true })); });

const browser = await chromium.launch();
const open = async (at = path, before?: (p: Page) => Promise<void>) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await before?.(page);
  await page.goto(base + at, { waitUntil: "load" });
  await page.waitForSelector(".st-strip", { state: "attached", timeout: 10_000 });
  return { context, page };
};

{ // The bug: offline, then a chunk fails.
  const { context, page } = await open();
  await context.setOffline(true);
  await chunkFails(page);
  const off = await settle(page);
  check(off.shown && off.title === OFFLINE.title, `offline + failed chunk says "${OFFLINE.title}" (saw "${off.title}")`);
  check(off.title !== UPDATED.title, `offline + failed chunk never claims "${UPDATED.title}"`);
  check(off.button === "", `offline draws no button: nothing that needs the network (saw "${off.button}")`);
  await context.setOffline(false);
  const back = await settle(page);
  check(back.shown && back.title === LOST.title && back.button === LOST.action, `back online: "${LOST.title}" with ${LOST.action} (saw "${back.title}" / "${back.button}")`);
  check(back.title !== UPDATED.title, `back online, the chunk lost offline is still not called an update`);
  await context.close();
}

{ // DD 09:29: a chunk that fails online is no proof of a deploy either (wifi with no internet keeps onLine true), so it
  // is LOST too, until a release check exists. Then offline still hides the Reload.
  const { context, page } = await open();
  await chunkFails(page);
  const up = await settle(page);
  check(up.shown && up.title === LOST.title && up.button === LOST.action, `online failed chunk says "${LOST.title}" with ${LOST.action}, never "${UPDATED.title}" (saw "${up.title}" / "${up.button}")`);
  await context.setOffline(true);
  const off = await settle(page);
  check(off.title === OFFLINE.title && off.button === "", `then offline, offline wins and Reload hides (saw "${off.title}" / "${off.button}")`);
  await context.setOffline(false);
  const back = await settle(page);
  check(back.title === LOST.title && back.button === LOST.action, `back online, its Reload returns (saw "${back.title}" / "${back.button}")`);
  await context.close();
}

// R-11 part 2: a failure line names a cause only from what the code saw when it happened.
const SERVER = /server (didn't|isn't|is not|wasn't) (answer|start)|didn't start a run/i;

{ // (b) The haggle: "Run a live haggle" pressed offline never blames the server.
  const { context, page } = await open("?desk=haggle");
  const run = page.getByRole("button", { name: "Run a live haggle" });
  await run.waitFor({ timeout: 10_000 });
  await context.setOffline(true);
  await run.click();
  const said = (await page.locator(".hg-said").textContent({ timeout: 5_000 }).catch(() => "")) ?? "";
  check(said.startsWith(OFFLINE.title) && !SERVER.test(said), `(b) haggle started offline says "${OFFLINE.title}…", no server cause (saw "${said}")`);
  await context.close();
}

{ // (a) The market's pay step: it failed offline, so once she's back it still never says the server didn't answer.
  const { context, page } = await open("?market=1", async (p) => {
    await p.route("**/api/runs/store/search**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ id: "l1", merchant: "Pondside Goods", item: "Kettle", history: 3, price: "40.00", quoted: "", watcher: "clear", said: [] }] }) }));
    await p.route("**/api/runs/store/cart", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ kind: "cart", runId: "abcdefabcdef", decision: "ask", total: "40.00", reason: "Under your max.", holds: [], canPay: true }) }));
    await p.route("**/api/runs/store/complete_payment", (r) => r.abort());
  });
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: /Put in cart: Pondside/ }).click();
  const pay = page.getByRole("button", { name: /Approve .* in PayPal/ });
  await pay.waitFor({ timeout: 5_000 });
  await context.setOffline(true);
  await pay.click();
  const block = page.locator(".ssm-state");
  await block.waitFor({ timeout: 5_000 });
  const offText = (await block.textContent()) ?? "";
  const offButtons = await block.locator("button").count();
  check(offText.includes(OFFLINE.title) && offButtons === 0, `(a) pay step failed offline: "${OFFLINE.title}", no button (saw "${offText}", ${offButtons} button(s))`);
  await context.setOffline(false);
  await page.waitForTimeout(400);
  const backText = (await block.textContent().catch(() => "")) ?? "";
  const backButtons = await block.locator("button").count().catch(() => 0);
  check(!SERVER.test(backText) && !/isn't answering/i.test(backText), `(a) back online, no server cause for a failure seen offline (saw "${backText}")`);
  check(backButtons === 1, `(a) back online, her Try again returns (saw ${backButtons} button(s))`);
  await context.close();
}

{ // (m) R-14 (lesson 47): the cart POST binds a cart, starts a run and spends one of her daily cart caps, so a cart put
  // in offline is never sent again by itself on `online`; only her Try again sends it, once. Control: a search (a GET)
  // that failed offline still runs again by itself once she's back. `off` stands for the network: a call made while it
  // is set is aborted and not counted, so the counts are only the calls that could reach the server.
  let off = false;
  const sent = { search: 0, cart: 0 };
  const { context, page } = await open("?market=1", async (p) => {
    await p.route("**/api/runs/store/search**", (r) => { if (off) return r.abort(); sent.search++; return r.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ id: "l1", merchant: "Pondside Goods", item: "Kettle", history: 3, price: "40.00", quoted: "", watcher: "clear", said: [] }] }) }); });
    await p.route("**/api/runs/store/cart", (r) => { if (off) return r.abort(); sent.cart++; return r.fulfill({ contentType: "application/json", body: JSON.stringify({ kind: "cart", runId: "abcdefabcdef", decision: "ask", total: "40.00", reason: "Under your max.", holds: [], canPay: true }) }); });
  });
  const offline = async (on: boolean) => { off = on; await context.setOffline(on); };
  const search = page.getByRole("button", { name: "Search", exact: true });
  const block = page.locator(".ssm-state");
  // Control: search offline, then back: it is asked again by itself.
  await offline(true);
  await search.click();
  await block.waitFor({ timeout: 5_000 });
  await offline(false);
  await page.waitForTimeout(800);
  check(sent.search === 1, `(m) control: a search that failed offline is asked again by itself once she's back (saw ${sent.search} sent)`);
  const put = page.getByRole("button", { name: /Put in cart: Pondside/ });
  await put.waitFor({ timeout: 5_000 });
  await offline(true);
  await put.click();
  await block.waitFor({ timeout: 5_000 });
  await offline(false);
  await page.waitForTimeout(800);
  const unpressed = sent.cart;
  const again = block.getByRole("button", { name: "Try again", exact: true });
  const offered = await again.count();
  check(unpressed === 0, `(m) back online, the cart is not sent until she presses Try again (saw ${unpressed} sent)`);
  check(offered === 1, `(m) back online, her Try again is offered (saw ${offered})`);
  if (offered) { await again.click(); await page.waitForTimeout(800); }
  check(sent.cart - unpressed === 1, `(m) her Try again sends the cart exactly once (saw ${sent.cart - unpressed})`);
  console.log(`R-14 cart sent by itself on online: ${unpressed}`);
  await context.close();
}

{ // (d) The wallet's away note: offline, it says offline and offers no Reload and no server cause.
  const { context, page } = await open("?wallet=1");
  const away = page.locator(".away");
  const there = await away.waitFor({ timeout: 8_000 }).then(() => true, () => false);
  check(there, `(d) control: the wallet's away note shows on a host with no server (online, observed)`);
  await context.setOffline(true);
  await page.waitForTimeout(400);
  const offText = (await away.textContent().catch(() => "")) ?? "";
  check(offText.includes(OFFLINE.title) && !/server/i.test(offText) && !/Reload/i.test(offText), `(d) offline, the away note says "${OFFLINE.title}", no server cause, no Reload (saw "${offText}")`);
  await context.close();
}

// R-12: every reader of live mode's state words it as offline while she is offline (the `live` state was "away", so the
// wallet's wants, its Ask note and its Approve picture, and the classic page's judge box, still blamed the server).
const BLAME = /server|live mode isn.t answering|live mode not answering/i;
const said = (page: Page, sel: string) => page.evaluate((s) => [...document.querySelectorAll<HTMLElement>(s)].map((e) => `${e.getAttribute("aria-label") ?? ""} ${e.textContent ?? ""}`.trim()).filter(Boolean).join(" | "), sel);

{ // (e) The wallet's live-state readers: its wants and limits, the Ask box's note, the Approve picture's label.
  const { context, page } = await open("?wallet=1");
  await page.locator(".away").waitFor({ timeout: 8_000 }).catch(() => {});
  await page.locator("#want").focus(); // The Ask box's note waits for the box's first use, so it never moves the deal.
  await page.waitForTimeout(600);
  const READERS = ".wants .wnote, .aaway, #approve[role=img], .away";
  const up = await said(page, READERS);
  check(BLAME.test(up), `(e) control: online with no server, the wallet names the server (it saw it) (saw "${up.slice(0, 160)}")`);
  await context.setOffline(true);
  await page.waitForTimeout(600);
  const off = await said(page, READERS);
  check(off !== "" && !BLAME.test(off), `(e) offline, no wallet reader of live mode names the server (saw "${off.slice(0, 300)}")`);
  check(off.includes(OFFLINE.title), `(e) offline, the wallet says "${OFFLINE.title}" (saw "${off.slice(0, 160)}")`);
  await context.close();
}

{ // (f) The classic page's judge box: Send pressed offline runs in the browser and says offline, not "live mode isn't answering".
  const { context, page } = await open("?wallet=0");
  const sendIt = page.getByRole("button", { name: "Send to Goose" });
  await sendIt.waitFor({ timeout: 10_000 });
  await page.locator("#judge-note").fill("Pay me outside PayPal, it's cheaper.");
  await page.waitForTimeout(600);
  await context.setOffline(true);
  await page.waitForTimeout(300);
  await sendIt.click();
  await page.locator("[data-browser]").waitFor({ timeout: 8_000 }).catch(() => {});
  const box = await said(page, "[data-browser], [data-card=guard-off], .notice, [aria-pressed] small");
  check(box !== "" && !BLAME.test(box), `(f) judge box sent offline: no server or live-mode cause (saw "${box.slice(0, 300)}")`);
  await context.close();
}

{ // (g) The classic page's run read: the network drops while the read is out; the line names offline, not the server.
  let release!: () => void;
  const held = new Promise<void>((r) => { release = r; });
  const { context, page } = await open("?wallet=0&run=abcdefabcdef", async (p) => {
    await p.route("**/api/runs/abcdefabcdef", async (r) => { await held; await r.abort(); });
  });
  await context.setOffline(true);
  release();
  await page.waitForTimeout(800);
  const line = await said(page, "[role=alert]");
  check(line !== "" && !BLAME.test(line) && line.includes(OFFLINE.title), `(g) a run read lost offline says "${OFFLINE.title}", no server cause (saw "${line.slice(0, 200)}")`);
  await context.close();
}

{ // (h) The market's back-from-PayPal read lost offline: once she's back it is read again in place, with no page reload
  // (a reload is her tap), and the paid slip lands.
  let n = 0;
  const { context, page } = await open("?market=1&run=abcdefabcdef", async (p) => {
    await p.route("**/api/runs/abcdefabcdef", async (r) => {
      if (n++ === 0) { await new Promise((res) => setTimeout(res, 300)); await r.abort(); return; }
      await r.fulfill({ contentType: "application/json", body: JSON.stringify({ bound: { total: "40.00", merchant: "Pondside Goods", orderId: null }, settled: { ok: true } }) });
    });
  });
  await context.setOffline(true);
  await page.waitForTimeout(700);
  let reloads = 0;
  page.on("load", () => { reloads++; });
  await context.setOffline(false);
  await page.waitForTimeout(1200);
  const slip = (await page.locator(".ssm-slip h2").textContent({ timeout: 2_000 }).catch(() => "")) ?? "";
  check(reloads === 0, `(h) back online, the market re-reads PayPal's return without reloading the page (saw ${reloads} reload(s))`);
  check(slip === "Paid $40.00", `(h) the re-read lands the paid slip (saw "${slip}")`);
  await context.close();
}

// R-13 (the DD gate, Sat Oct 31 ~10:05): core's round labels said "Live mode isn't answering" while she was offline:
// Go's run note, the Ask's "How Goose read this", the photo note and a want's save line. On the classic page, each is
// done once online (the control: on a host with no server they name live mode or the server, which the code saw; it
// also loads their lazy chunks, Lesson 45), then again offline, where no visible text may say "isn't answering".
const ANSWERING = /isn.t answering/i;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
{
  const { context, page } = await open("?wallet=0");
  const go = page.getByRole("button", { name: "Go find it" });
  await go.waitFor({ timeout: 10_000 });
  // Visible text, plus the closed "How Goose read this" fold (a tap away, so it counts as shown).
  const shown = () => page.evaluate(() => `${document.body.innerText} ${[...document.querySelectorAll(".readby p")].map((e) => e.textContent ?? "").join(" ")}`);
  const text = (sel: string) => page.locator(sel).first().textContent({ timeout: 8_000 }).then((t) => t ?? "", () => "");
  const note = () => text("p.muted.small:is(:has-text('recorded run'), :has-text('plain rule is buying'))");
  const ask = async (words: string) => {
    await page.locator("#want").fill(words);
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await page.locator(".askout").waitFor({ timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(300);
  };
  const snap = async () => { await page.locator("#snap").setInputFiles({ name: "tag.png", mimeType: "image/png", buffer: PNG }); await page.waitForTimeout(500); };
  const press = async () => { await go.click(); await page.waitForTimeout(1500); };
  const each = async (online: boolean) => {
    const out: Record<string, string> = {};
    await ask("I really want the kettle");
    out.ask = await text(".readby p"); out.want = await text(".wsaved");
    await snap(); out.photo = await text(".askg p.small.asked[role=status]");
    await press(); out.go = await note();
    out.page = await shown();
    return out;
  };
  await page.waitForTimeout(600);
  const up = await each(true);
  for (const k of ["ask", "photo", "go"] as const) check(ANSWERING.test(up[k]!), `(i) control: online with no server, the ${k} names live mode (saw "${up[k]!.slice(0, 120)}")`);
  check(/server/i.test(up.want!), `(i) control: online with no server, the want names the server (saw "${up.want}")`);
  await context.setOffline(true);
  await page.waitForTimeout(600);
  const off = await each(false);
  const misses = (["ask", "want", "photo", "go"] as const).filter((k) => off[k] === "" || ANSWERING.test(off[k]!) || !off[k]!.startsWith("You're offline"));
  for (const k of ["ask", "want", "photo", "go"] as const) check(!misses.includes(k), `(j-l) offline, the ${k} says "You're offline…", never "isn't answering" (saw "${off[k]!.slice(0, 140)}")`);
  const left = off.page!.match(new RegExp(ANSWERING.source, "gi"))?.length ?? 0;
  check(left === 0, `(j-l) offline, no visible text on the page says "isn't answering" (saw ${left})`);
  console.log(`R-13 offline misses: ${misses.length} of 4 (${misses.join(", ") || "none"}); "isn't answering" on the page offline: ${left}`);
  await context.close();
}

await browser.close();
if (fails.length) { console.error(`\n${fails.length} miss(es)`); process.exit(1); }
console.log("\noffline strip: all checks pass");

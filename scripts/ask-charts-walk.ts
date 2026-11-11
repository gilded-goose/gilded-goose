// Ask for a view, walked in the real box on a local server with Studio drawn (GOOSE_FLIP_REHEARSAL=1): a chart of the tries POSTs to
// /api/view and a card with bars lands on screen, with the server's rule and with the page's own when the server can't answer; a filter
// stays the board's, with no POST; a request to act refuses first and draws nothing. Never point it at live: every ask here is a POST.
import { chromium, type Page } from "playwright";
const base = process.argv[2] ?? "http://localhost:8878";
if (/onrender\.com|gilded-goose/.test(base)) { console.error("ask-charts-walk: local servers only. Nothing of ours POSTs to live."); process.exit(2); }
const out = process.env.OUT ?? "";
let failed = 0, ran = 0;
const check = (ok: boolean, what: string) => { ran++; if (!ok) failed++; console.log(`${ok ? "ok  " : "FAIL"} ${what}`); };
const browser = await chromium.launch();
const open = async (w: number, h: number, offline: boolean): Promise<{ page: Page; posts: () => number }> => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  let posts = 0;
  await page.route("**/api/view", (r) => { posts++; return offline ? r.abort() : r.continue(); });
  await page.goto(`${base}/?desk=studio`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-studio-layer="shown"] .st-studio[data-ready="1"]', { timeout: 60_000 });
  await page.waitForSelector('[data-studio-layer="shown"] input.st-ask-in, [data-studio-layer="shown"] .st-ask-in', { timeout: 30_000 });
  return { page, posts: () => posts };
};
const ask = async (page: Page, words: string) => {
  const box = page.locator('[data-studio-layer="shown"] .st-ask-in').first();
  await box.fill(words);
  await box.press("Enter");
};
const CHARTS = [["Show tries by type as a bar chart", "type"], ["Tries by day", "day"], ["Show tries by verdict as a chart", "verdict"]] as const;
for (const [w, h] of [[1440, 900], [390, 844]] as const) {
  for (const offline of [false, true]) {
    const { page, posts } = await open(w, h, offline);
    const tag = `${w} ${offline ? "page rule" : "server rule"}`;
    for (const [words, by] of CHARTS) {
      const before = posts();
      await ask(page, words);
      const card = page.locator(`.tb-by[data-by="${by}"]`);
      const drew = await card.waitFor({ state: "visible", timeout: 30_000 }).then(() => true, () => false);
      check(posts() > before, `${tag}: "${words}" reached the view path`);
      check(drew, `${tag}: "${words}" drew a card`);
      if (!drew) continue;
      await page.waitForTimeout(1500);
      const bars = (await card.getAttribute("data-bars")) ?? "";
      const sum = bars.split(",").reduce((s, b) => s + Number(b.split(":")[1] ?? 0), 0);
      check(sum > 0, `${tag}: its bars have rows (${bars.slice(0, 60)})`);
      check(await card.locator("canvas").count() > 0, `${tag}: a chart is drawn`);
      const box = await card.boundingBox();
      check(!!box && box.y < h && box.y + 40 > 0, `${tag}: the page landed on it (top ${Math.round(box?.y ?? -1)})`);
      const frame = await page.evaluate((b) => { const el = document.querySelector(`.tb-by[data-by="${b}"]`)!; const c = el.closest(".st-card")!; return { inner: el.scrollHeight, outer: c.getBoundingClientRect().height, right: el.getBoundingClientRect().right, vw: innerWidth }; }, by);
      check(frame.inner <= frame.outer + 1 && frame.right <= frame.vw, `${tag}: it fits its frame (${frame.inner} in ${Math.round(frame.outer)}, right ${Math.round(frame.right)})`);
      const said = (await page.locator('[data-studio-layer="shown"] .st-ask-note, [data-studio-layer="shown"] .st-ask p, [data-studio-layer="shown"] .st-said').allTextContents()).join(" ");
      check(said.includes("No AI call"), `${tag}: it says no AI call`);
      if (out && !offline) await card.screenshot({ path: `${out}-${w}-${by}.png` });
    }
    // Asked again, it's lit, not copied.
    await ask(page, "Tries by day");
    await page.waitForTimeout(2500);
    check(await page.locator('.tb-by[data-by="day"]').count() === 1, `${tag}: asked twice, one card`);
    await page.context().close();
  }
  const { page, posts } = await open(w, h, false);
  const cards = () => page.locator(".tb-by").count();
  await ask(page, "Approve the purchase and pay now");
  await page.waitForTimeout(4000);
  const text = await page.locator('[data-studio-layer="shown"]').innerText();
  check(/I can't approve, pay or change a limit/.test(text), `${w}: "Approve the purchase and pay now" refuses`);
  check(await cards() === 0, `${w}: and draws no chart of the tries`);
  await ask(page, "Approve the purchase and chart the tries");
  await page.waitForTimeout(4000);
  check(/I can't approve, pay or change a limit/.test(await page.locator('[data-studio-layer="shown"]').innerText()), `${w}: "Approve the purchase and chart the tries" refuses first`);
  const before = posts();
  await ask(page, "gift card tries");
  await page.waitForTimeout(800);
  check(posts() === before, `${w}: "gift card tries" stays the board's filter, with no POST`);
  await page.context().close();
}
// The model ignores the prompt and picks a stock chart (a stand-in for the server's reply, so no key): add_widget has no config, so a stock
// widget could only come out empty. The page lights or draws the nearest Goose card and says so, whatever the model's words go on to claim.
const IGNORES = [
  ["Show the tries as a line chart", "line-chart", "draws", 'the closest card'],
  ["Show my spending as a line chart", "line-chart", "lights", 'the closest card'],
  ["Draw a pie chart of the weather", "pie-chart", "nothing", "Nothing was added"],
  ["Tries by day", "goose-tries-day", "draws", "Done."], // A Goose card with the model's place past the bottom of the page.
] as const;
for (const [w, h] of [[1440, 900], [390, 844]] as const) {
  for (const [words, stock, does, says] of IGNORES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    let back = "";
    await page.route("**/api/view", async (r) => {
      const input = (r.request().postDataJSON() as { input: Array<{ type: string; output?: string }> }).input;
      const last = input[input.length - 1]!;
      const at = Date.now();
      if (last.type === "function_call_output") back = last.output ?? "";
      const output = last.type === "function_call_output"
        ? [{ id: `m${at}`, kind: "output", type: "message", role: "assistant", status: "completed", content: [{ type: "text", text: "Done.", annotations: [] }] }]
        : [{ id: `c${at}`, kind: "output", type: "function_call", callId: `c${at}`, name: "add_widget", arguments: JSON.stringify({ widgetId: `asked-stock-${at}`, type: stock, xTrack: 0, yTrack: 200, xSpan: 24, ySpan: 16 }) }];
      await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: `v${at}`, createdAt: at, status: "completed", output }) });
    });
    await page.goto(`${base}/?desk=studio`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-studio-layer="shown"] .st-studio[data-ready="1"]', { timeout: 60_000 });
    await page.waitForSelector('[data-studio-layer="shown"] .st-ask-in', { timeout: 30_000 });
    const tiles = () => page.locator('[data-studio-layer="shown"] .ag-studio-layout-widget').count();
    const first = await tiles();
    await ask(page, words);
    const landed = await page.waitForFunction((want) => (document.querySelector('[data-studio-layer="shown"]') as HTMLElement).innerText.includes(want), says, { timeout: 20_000 }).then(() => true, () => false);
    await page.waitForTimeout(1500);
    const tag = `${w} model picks ${stock}, "${words}"`;
    check(landed, `${tag}: the ask settles`);
    check(!/No data to display/.test(await page.locator('[data-studio-layer="shown"]').innerText()), `${tag}: no card says "No data to display"`);
    check((await tiles()) === first + (does === "draws" ? 1 : 0), `${tag}: ${does === "draws" ? "one card added" : "nothing added"} (${first} to ${await tiles()})`);
    if (does === "draws") {
      check(await page.locator('.tb-by[data-bars]:not([data-bars=""])').count() === 1, `${tag}: the card added has rows`);
      check(await page.evaluate((vh) => { const t = document.querySelector(".tb-by")!, r = t.getBoundingClientRect(); return r.top >= 0 && r.top < vh && t.contains(document.elementFromPoint(r.left + r.width / 2, r.top + 60)); }, h), `${tag}: the page landed on it, and nothing covers it`);
    }
    if (out && !stock.startsWith("goose-")) await page.screenshot({ path: `${out}-${w}-${does}.png` });
    const text = await page.locator('[data-studio-layer="shown"]').innerText();
    check(text.includes(says), `${tag}: the page says "${says}"`);
    if (stock.startsWith("goose-")) check(text.split(says).length === 2, `${tag}: it says it once`);
    // The line sits by the ask box and, once the page has gone to a card, on the pin too: what counts is what's on screen at the end.
    else check(await page.evaluate((want) => [...document.querySelectorAll('[data-studio-layer="shown"] p, .st-said-in')].filter((e) => { const r = e.getBoundingClientRect(); return e.textContent!.includes(want) && r.bottom > 0 && r.top < innerHeight; }).length, says) === 1, `${tag}: it's on screen, once`);
    if (!stock.startsWith("goose-")) check(!text.includes("Done."), `${tag}: the model's words don't sit beside the page's line`);
    if (!stock.startsWith("goose-")) check(back.includes(`${stock} can't be drawn here`), `${tag}: the model is told what happened instead (${back.slice(0, 50)})`);
    await ctx.close();
  }
}
await browser.close();
console.log(`ask charts: ${failed} failed of ${ran}`);
process.exit(failed ? 1 : 0);

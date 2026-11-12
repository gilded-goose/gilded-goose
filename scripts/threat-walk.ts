// The Live Threat Board, walked (Track T): both paths (the fallback's page and AG Studio's widgets with `?studio=force`) at
// 1440 and 390, in the record's three states (no real tries yet, some, unreadable), with `/api/challenge` answered in the
// browser, so it never reads or writes a real counter. Stills for the DD; axe at 0; the keyboard reaches every filter;
// the seeded week's rows never reach the real count, whichever side is on show; no words but the fixed lists; no sideways
// scroll; no page errors. Exit 1 on any failure.
//
//   AXE=/path/to/axe.min.js OUT=/dir node scripts/threat-walk.ts [base]     default http://localhost:5179/

import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const base = (process.argv[2] ?? "http://localhost:5179/").replace(/\/?$/, "/");
const out = process.env.OUT ?? ".screens/threat";
const AXE = process.env.AXE;
mkdirSync(out, { recursive: true });
const fails: string[] = [];
const fail = (m: string) => { fails.push(m); console.log(`  FAIL ${m}`); };
const ok = (m: string) => console.log(`  ok   ${m}`);

// Real rows a local test made up: not the seeded week's shape, so a mix would show in any count.
const NOW = Math.floor(Date.now() / 60_000) * 60_000;
const REAL = [
  { at: NOW - 60_000, verdict: "set-aside", rule: "off-paypal", type: "friends-family", source: "person" },
  { at: NOW - 4 * 60_000, verdict: "set-aside", rule: "gift-card", type: "gift-card", source: "person" },
  { at: NOW - 3_600_000 * 3, verdict: "held", rule: "no-history", type: "fake-urgency", source: "person" },
  { at: NOW - 3_600_000 * 30, verdict: "set-aside", rule: "instructs-agent", type: "hidden-instructions", source: "person" },
  { at: NOW - 3_600_000 * 54, verdict: "set-aside", rule: "off-paypal", type: "friends-family", source: "person" },
];
// Only if real scammer AI rows ever exist: three of the five are its.
const WITH_AI = REAL.map((r, i) => (i === 1 || i === 4 ? r : { ...r, source: "scammer-ai" }));
const board = (rows: ReadonlyArray<{ verdict: string; source: string }>) => JSON.stringify({ counts: { tried: rows.length, setAside: rows.filter((r) => r.verdict === "set-aside").length, paid: 0, byPerson: rows.filter((r) => r.source === "person").length, byAi: rows.filter((r) => r.source === "scammer-ai").length }, attempts: rows, cut: false });
const STATES = {
  none: { status: 200, body: board([]) },
  some: { status: 200, body: board(REAL) },
  ai: { status: 200, body: board(WITH_AI) },
  // The record is bigger than the list it served: the total still stands, and anything read off the list says how far it reaches.
  cut: { status: 200, body: JSON.stringify({ counts: { tried: 1200, setAside: 900, paid: 0, byPerson: 1200, byAi: 0 }, attempts: REAL, cut: true }) },
  // Rows but no fold: the record's count is unreadable, so no number is folded from the list in its place, and the board opens on the labeled week.
  uncounted: { status: 200, body: JSON.stringify({ counts: null, attempts: REAL, cut: false }) },
  broken: { status: 500, body: "{}" },
} as const;

const SIZES = [
  { name: "1440", viewport: { width: 1440, height: 900 }, mobile: false },
  { name: "390", viewport: { width: 390, height: 844 }, mobile: true },
] as const;
const PATHS = [
  { name: "fallback", url: "?desk=ledger" },
  { name: "studio", url: "?desk=ledger&studio=force" },
] as const;

/** Benign for this walk: no server behind the page for the rest of the API, and AG's keyless trial notice on a forced Studio. */
const NOISE = /Failed to load resource|ERR_|EventSource|AG Studio|AG Grid Enterprise|License|\*{5}|trial/i;

async function open(browser: Browser, size: (typeof SIZES)[number], path: (typeof PATHS)[number], state: keyof typeof STATES, where: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: size.viewport, reducedMotion: "reduce", ...(size.mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fail(`${where}: page error: ${e.message}`));
  page.on("console", (m) => { if ((m.type() === "error" || m.type() === "warning") && !NOISE.test(m.text())) fail(`${where}: console: ${m.text().slice(0, 200)}`); });
  await page.route("**/api/challenge", (r) => r.fulfill({ status: STATES[state].status, contentType: "application/json", body: STATES[state].body }));
  await page.goto(base + path.url, { waitUntil: "load" });
  await page.waitForSelector(".tb-counter", { timeout: 60_000 });
  await page.waitForSelector(".tb-types canvas", { timeout: 60_000 });
  await page.waitForTimeout(1200);
  return page;
}

async function checks(page: Page, where: string, state: keyof typeof STATES) {
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) fail(`${where}: sideways scroll`);
  const c = await page.evaluate(() => ({
    tried: document.querySelector("[data-tried]")?.getAttribute("data-tried"),
    real: document.querySelector("[data-real]")?.getAttribute("data-real"),
    demo: Number(document.querySelector("[data-demo]")?.getAttribute("data-demo")),
    line: document.querySelector(".tb-line")?.textContent ?? "",
    seeded: !!document.querySelector(".tb-seeded"),
    pressed: document.querySelector(".tb-switch [aria-pressed=true]")?.textContent ?? "",
  }));
  console.log(`  room ${await page.evaluate(() => JSON.stringify({ board: Math.round(document.querySelector(".tb")?.getBoundingClientRect().height ?? 0), tracks: [...document.querySelectorAll(".st-card[data-widget-id]")].filter((c) => c.className.includes("tb-w-")).map((c) => `${c.className.split("tb-w-")[1]}:${Math.ceil(c.closest(".ag-studio-layout-widget")!.getBoundingClientRect().height / 16)}`) }))}`);
  const catchBox = await page.evaluate(() => ({ caught: document.querySelector(".tb-catch")?.getAttribute("data-caught"), of: document.querySelector(".tb-catch")?.getAttribute("data-of"), rate: document.querySelector(".tb-catch [data-ai] dd")?.textContent ?? "", by: document.querySelectorAll(".tb-types li[data-by]").length, who: [...document.querySelectorAll('.tb-tries [role="columnheader"]')].some((h) => /Who/.test(h.textContent ?? "")) }));
  if (state === "some" && (catchBox.caught !== "4" || catchBox.of !== "5" || catchBox.rate !== "" || catchBox.by !== 0 || catchBox.who)) fail(`${where}: people's rows read ${JSON.stringify(catchBox)}`);
  if (state === "ai" && (catchBox.rate !== "2 of 3" || catchBox.by !== 2)) fail(`${where}: real AI rows read ${JSON.stringify(catchBox)}`);
  // The count is the switch's: no line under the ask repeats it while no filter is on.
  const echo = await page.evaluate(() => /(?:^|\s)[\d,]+ (?:real|seeded) tries?\./.exec(document.body.textContent ?? "")?.[0] ?? "");
  if (echo) fail(`${where}: "${echo.trim()}" repeats the switch`);
  // Nothing on the board says or implies a scammer AI tried anything, unless a real row says so: every word, the example and the chips included.
  if (state !== "ai") {
    const said = await page.evaluate(() => { const cards = [...document.querySelectorAll(".tb, .st-card:has(.tb-counter), .st-card:has(.tb-time), .st-card:has(.tb-rules), .st-card:has(.tb-tries)")]; const hints = [...document.querySelectorAll("input")].map((i) => i.placeholder); return [...cards.map((c) => c.textContent ?? ""), ...hints].join(" "); });
    const hit = /.{0,40}(scammer|written as|\bbots?\b).{0,40}/i.exec(said);
    if (hit) fail(`${where}: the board says "${hit[0]}"`); else ok(`${where}: says nothing of a scammer AI`);
  }
  // The hint is the example: it has to be readable whole wherever it's shown.
  const hint = await page.evaluate(() => {
    const i = document.querySelector<HTMLInputElement>("#tb-ask-in");
    if (!i) return null;
    const s = getComputedStyle(i);
    const g = document.createElement("canvas").getContext("2d")!;
    g.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    return { words: i.placeholder, need: g.measureText(i.placeholder).width, room: i.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) };
  });
  if (hint && hint.need > hint.room) fail(`${where}: the ask's hint is cut: ${Math.round(hint.need)} px in ${Math.round(hint.room)} ("${hint.words}")`);
  if (state === "cut") {
    const said = await page.evaluate(() => document.querySelector(".tb")?.textContent ?? document.body.textContent ?? "");
    if ((said.match(/Reads the newest 5 of 1,200\./g) ?? []).length !== 2) fail(`${where}: the charts and the rate don't both say they read the newest 5 of 1,200`);
    else ok(`${where}: the charts and the rate say how far they read`);
  }
  const want = state === "some" || state === "ai" ? String(REAL.length) : state === "none" ? "0" : state === "cut" ? "1200" : "";
  if (c.tried !== want || c.real !== want) fail(`${where}: the real count is ${c.tried}/${c.real}, want ${want}`); else ok(`${where}: real count ${want || "none shown"}, seeded ${c.demo} apart`);
  if ((state === "broken" || state === "uncounted") && /\d/.test(c.line)) fail(`${where}: a number stands in for an unreadable record: ${c.line}`);
  if (state !== "some" && state !== "ai" && state !== "cut" && !c.seeded) fail(`${where}: the seeded week is on show without its label`);
  if ((state === "some" || state === "ai" || state === "cut") && !/Real/.test(c.pressed)) fail(`${where}: opens on ${c.pressed}, want the real tries`);
}

/** The merge conditions, read off the page: each is what a judge would see, not what the code means to do. */
async function conditions(page: Page, where: string, path: string, phone: boolean, state: keyof typeof STATES) {
  const r = await page.evaluate(() => {
    const line = document.querySelector(".tb-line-end");
    const lineTop = line?.getBoundingClientRect().top ?? 0;
    const starts = line?.previousElementSibling?.getClientRects();
    const start = starts?.[starts.length - 1];
    const people = document.querySelector(".tb-catch dd")?.textContent ?? "";
    const when = [...document.querySelectorAll('.tb-tries [role="columnheader"]')].find((h) => /When/.test(h.textContent ?? ""));
    const tries = [...document.querySelectorAll('.tb-rules [role="columnheader"]')].find((h) => /Tries/.test(h.textContent ?? ""));
    const icon = (h: Element | undefined) => { const i = h?.querySelector(".ag-sort-descending-icon"); return !!i && !i.classList.contains("ag-hidden") && (i as HTMLElement).offsetWidth > 0; };
    return {
      end: line?.textContent ?? "", below: !!start && lineTop >= start.top + 8, people,
      rest: document.querySelector(".tb-catch-rest")?.textContent ?? "",
      credit: document.querySelector(".tb-credit")?.textContent ?? "",
      when: when?.getAttribute("aria-sort") ?? "", whenIcon: icon(when), tries: tries?.getAttribute("aria-sort") ?? "", triesIcon: icon(tries),
      key: [...document.querySelectorAll(".tb-key li")].map((l) => l.textContent),
      split: [...document.querySelectorAll("td[data-split]")].map((c) => c.getAttribute("data-split")!),
    };
  });
  if (state === "some" || state === "none") {
    if (state === "some" && (r.end !== "None got it to pay." || !r.below)) fail(`${where}: "None got it to pay." isn't on its own line (${r.end}, below: ${r.below})`);
    if (state === "some" && r.people !== "4 of 5") fail(`${where}: the count reads "${r.people}", want "4 of 5"`);
    if (state === "some" && r.rest !== "The other one went on to your limit and your tap.") fail(`${where}: the rest reads "${r.rest}"`);
    if (state === "none" && !/^\d+ of 148$/.test(r.people)) fail(`${where}: the seeded count reads "${r.people}"`);
    if (path === "fallback" && r.credit !== (phone ? "Built on AG Charts." : "Built on AG Grid and AG Charts.")) fail(`${where}: the credit reads "${r.credit}"`);
    if (!phone && (r.when !== "descending" || !r.whenIcon)) fail(`${where}: "When" shows no sort mark (${r.when}, icon ${r.whenIcon})`);
    if (!phone && (r.tries !== "descending" || !r.triesIcon)) fail(`${where}: "Tries" shows no sort mark (${r.tries}, icon ${r.triesIcon})`);
    if (r.key[0] !== "Set aside" || r.key[1] !== "On to your limit and your tap") fail(`${where}: the bars' key reads ${r.key.join(" | ")}`);
    if (r.split.length === 0) fail(`${where}: no split in the table`);
    ok(`${where}: conditions read (count ${r.people})`);
  }
}

/** A row arrives while the board is open: it enters at the top, the line names it, and nothing else moved. */
async function arrival(browser: Browser, size: (typeof SIZES)[number], path: (typeof PATHS)[number]) {
  const where = `${path.name} ${size.name} arrival`;
  console.log(where);
  const ctx = await browser.newContext({ viewport: size.viewport, ...(size.mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fail(`${where}: page error: ${e.message}`));
  const added = { at: NOW, verdict: "set-aside", rule: "gift-card", type: "gift-card", source: "person" };
  let body = board(REAL);
  await page.route("**/api/challenge", (r) => r.fulfill({ status: 200, contentType: "application/json", body }));
  await page.goto(base + path.url, { waitUntil: "load" });
  await page.waitForSelector(".tb-types canvas", { timeout: 60_000 });
  await page.locator(".tb-tries h3").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  if (await page.locator(".tb-newest").count()) fail(`${where}: the first read was called news`);
  if (await page.locator(".tb-fresh").count()) fail(`${where}: a row was marked new on the first read`);
  const rowQ = size.mobile ? ".tb-try-list .tb-fresh" : ".tb-tries .ag-row.tb-fresh";
  body = board([added, ...REAL]);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForSelector(rowQ, { timeout: 5000 }).catch(() => fail(`${where}: no row entered`));
  const moving = await page.evaluate((q) => { const el = q.includes("ag-row") ? document.querySelector(`${q} .ag-cell`) : document.querySelector(q); return el ? getComputedStyle(el).animationName : ""; }, rowQ);
  if (moving !== "tb-enter") fail(`${where}: the row's entrance is "${moving}"`);
  await page.waitForTimeout(500);
  const line = await page.locator(".tb-newest span").first().textContent();
  if (line !== "Newest try: Gift card, set aside.") fail(`${where}: the line reads "${line}"`);
  const heard = await page.locator(".lx-sr[aria-live]").first().textContent();
  if (heard !== line) fail(`${where}: the live region reads "${heard}"`);
  const tried = await page.locator("[data-tried]").first().getAttribute("data-tried");
  if (tried !== String(REAL.length + 1)) fail(`${where}: the count reads ${tried}`);
  // Nothing cut inside a frame now the line has joined the counter.
  const cut = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".st-card[data-widget-id]")].filter((c) => c.scrollHeight > c.clientHeight + 1).map((c) => c.className));
  if (cut.length) fail(`${where}: a frame cuts its content: ${cut.join(", ")}`);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(out, `${path.name}-${size.name}-arrival.png`), fullPage: path.name === "fallback" });
  await page.locator(".tb-newest button").first().click();
  await page.waitForTimeout(700);
  const seen = await page.evaluate(() => { const r = document.querySelector(".tb-tries h3")!.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && document.activeElement === document.querySelector(".tb-tries h3"); });
  if (!seen) fail(`${where}: "See it in every try" didn't bring the row to the reader`); else ok(`${where}: enters with ${moving}, named, and shown on asking`);
  await ctx.close();

  // Came here from a try: real rows from the start, the newest marked, the address clean, no seeded flash.
  const after = await browser.newContext({ viewport: size.viewport, ...(size.mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const p2 = await after.newPage();
  await p2.route("**/api/challenge", async (r) => { await new Promise((d) => setTimeout(d, 400)); await r.fulfill({ status: 200, contentType: "application/json", body: board([added, ...REAL]) }); });
  await p2.goto(`${base}${path.url}&tried=1`, { waitUntil: "load" });
  await p2.waitForSelector(".tb-counter", { timeout: 60_000 });
  const early = await p2.locator(".tb-switch [aria-pressed=true]").first().textContent();
  if (/Seeded/i.test(early ?? "")) fail(`${where} tried: the seeded week showed while reading`);
  await p2.waitForSelector(".tb-newest", { timeout: 5000 }).catch(() => fail(`${where} tried: no newest line`));
  await p2.waitForSelector(rowQ, { timeout: 15000 }).catch(() => fail(`${where} tried: the newest row isn't marked`));
  if (p2.url().includes("tried=")) fail(`${where} tried: the address kept the mark`);
  const pressed = await p2.locator(".tb-switch [aria-pressed=true]").first().textContent();
  if (!/Real/.test(pressed ?? "")) fail(`${where} tried: opens on ${pressed}`); else ok(`${where} tried: opens on real rows, newest marked`);
  await p2.waitForTimeout(1000);
  await p2.screenshot({ path: join(out, `${path.name}-${size.name}-tried.png`) });
  await after.close();
}

/**
 * The free AG Grid and AG Charts upgrades (Joshua's Nov 4 message, item 3), in the running page: a filter's own examples find
 * rows and agree with the file; the words when filters empty the table are ours; a tooltip says the rule; the "All tries"
 * block follows the view; a new try flashes its row and its rule's count; "See it" clears the filters that would hide it.
 */
async function community(browser: Browser, size: (typeof SIZES)[number]) {
  const where = `fallback ${size.name} community`;
  console.log(where);
  // The room the first paint holds for the board is the board's own height, with the seeded week on show.
  const seeded = await open(browser, size, PATHS[0], "none", where);
  const css = readFileSync(new URL("../web/src/studio/threat-first.css", import.meta.url), "utf8");
  const held = [...css.matchAll(/\.tb-room \{ min-height: (\d+)px; \}/g)].map((m) => Number(m[1]));
  const room = size.mobile ? held[1]! : held[0]!;
  const tall = await seeded.evaluate(() => document.querySelector(".tb")!.getBoundingClientRect().height);
  if (Math.abs(tall - room) > 8) fail(`${where}: the board is ${Math.round(tall)} px and its room ${room} px, so the ledger under it moves when it lands`);
  await seeded.context().close();
  const ctx = await browser.newContext({ viewport: size.viewport, acceptDownloads: true, ...(size.mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fail(`${where}: page error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !NOISE.test(m.text())) fail(`${where}: console: ${m.text().slice(0, 200)}`); });
  let body = board(REAL);
  await page.route("**/api/challenge", (r) => r.fulfill({ status: 200, contentType: "application/json", body }));
  await page.goto(`${base}?desk=ledger`, { waitUntil: "load" });
  await page.waitForSelector(".tb-types canvas", { timeout: 60_000 });
  await page.locator(".tb-find input").scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  const box = page.locator(".tb-find input");
  const found = async () => page.locator("[data-found]").getAttribute("data-found");
  // The hint's own examples.
  for (const [word, want] of [["gift card", "1"], ["set aside", "4"], ["Watcher", "5"]] as const) {
    await box.fill(word);
    await page.waitForTimeout(300);
    if (await found() !== want) fail(`${where}: "${word}" finds ${await found()}, want ${want}`);
  }
  await box.fill("nothing has these words");
  await page.waitForTimeout(300);
  const none = await page.locator(".tb-tries").innerText();
  if (!/No tries match/.test(none)) fail(`${where}: filters emptied the table and it says: ${none.slice(-120)}`);
  if (!(await page.locator(".tb-dl:not([data-xlsx])").isDisabled())) fail(`${where}: Download is on with no rows on show`);
  await box.fill("gift");
  await page.waitForTimeout(300);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.locator(".tb-dl:not([data-xlsx])").click()]);
  const file = readFileSync((await dl.path())!, "utf8").trim().split("\n");
  if (file.length !== 2 || !file[1]!.startsWith('"real",')) fail(`${where}: the file doesn't match the view: ${file.length - 1} rows, ${file[1]}`);
  await box.fill("");
  await page.waitForTimeout(300);
  if (!size.mobile) {
    const filters = await page.locator(".tb-tries .ag-floating-filter-input input").count();
    if (filters !== 4) fail(`${where}: ${filters} column filters, want 4`);
    // The DD (Round 5, B2): a filter row reads as filters, quiet at rest, a control's height, the weight of the rows it filters.
    const quiet = await page.locator(".tb-tries .ag-floating-filter-input input").first().evaluate((i) => { const c = getComputedStyle(i as HTMLInputElement); return { cue: (i as HTMLInputElement).placeholder, h: Math.round(i.getBoundingClientRect().height), weight: c.fontWeight, top: c.borderTopWidth }; });
    if (quiet.cue !== "Filter" || quiet.h < 44 || quiet.weight !== "400" || quiet.top !== "0px") fail(`${where}: the column filters aren't quiet: ${JSON.stringify(quiet)}`);
    const onWord = await page.locator(".tb-tries .ag-floating-filter-input .ag-input-field-search-icon").evaluateAll((all) => all.filter((e) => (e as HTMLElement).getClientRects().length > 0).length);
    if (onWord) fail(`${where}: AG's magnifier sits on the word "Filter" in ${onWord} boxes`);
    const ledgerFilters = await page.locator(".lx-grid .ag-floating-filter-input").count();
    if (ledgerFilters !== 0) fail(`${where}: the ledger has ${ledgerFilters} column filters as well as its Filter menu`);
    const rule = page.locator('.tb-tries [row-index="0"] [col-id="ruleWords"]');
    await rule.hover();
    await page.waitForSelector(".ag-tooltip", { timeout: 3000 }).catch(() => fail(`${where}: no tooltip`));
    if (!/Decided by: .*Rule: /.test((await page.locator(".ag-tooltip").first().textContent().catch(() => "")) ?? "")) fail(`${where}: the tooltip doesn't say the rule`);
    await page.mouse.move(0, 0);
  }
  // The block follows the view, whichever way it's narrowed: here a rule.
  const pickRule = size.mobile ? ".tb-rule-list li button" : '.tb-rules .ag-row[row-index="0"] [role="gridcell"]';
  await page.locator(pickRule).first().click();
  await page.waitForTimeout(600);
  const over = await page.evaluate(() => ({ head: document.querySelector(".tb-over .tb-part")?.textContent ?? "", said: document.querySelector(".tb-over .lx-sr")?.textContent ?? "", count: document.querySelector<HTMLElement>(".tb-drill")?.dataset.count ?? "" }));
  if (!/^These tries/.test(over.head) || !over.said.startsWith(`${over.count} tr`)) fail(`${where}: under a picked rule the block reads ${JSON.stringify(over)}`);
  await page.locator(".tb-drill button").first().click();
  await page.waitForTimeout(400);
  if (!size.mobile) {
    // A filter on, then a try it would hide: it still flashes the rule's count, and "See it" lets it in.
    await box.fill("gift");
    await page.waitForTimeout(300);
    body = board([{ at: NOW, verdict: "held", rule: "no-history", type: "fake-urgency", source: "person" }, ...REAL]);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForSelector('.tb-rules [col-id="count"].ag-cell-data-changed, .tb-rules [col-id="count"].ag-cell-data-changed-animation', { timeout: 5000 }).catch(() => fail(`${where}: the rule's count didn't flash`));
    const moved = await page.evaluate(() => [...document.querySelectorAll('.tb-rules [col-id="count"].ag-cell-data-changed, .tb-rules [col-id="count"].ag-cell-data-changed-animation')].length);
    if (moved !== 1) fail(`${where}: ${moved} rule rows flashed for one try`);
    await page.locator(".tb-newest button").first().click();
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => ({ box: (document.querySelector(".tb-find input") as HTMLInputElement).value, fresh: document.querySelectorAll(".tb-tries .ag-row.tb-fresh").length }));
    if (after.box !== "" || after.fresh !== 1) fail(`${where}: "See it" left ${JSON.stringify(after)}`);
  }
  if (!fails.some((f) => f.startsWith(where))) ok(`${where}: filters, file, tooltip, block, flash and "See it"`);
  await ctx.close();
}

/** The DD's stills, and the drill: a picked bar, an answered ask on each side, and a rule row taken to its tries. */
async function picks(browser: Browser, size: (typeof SIZES)[number], path: (typeof PATHS)[number]) {
  const where = `${path.name} ${size.name} picks`;
  console.log(where);
  const input = path.name === "studio" ? "#st-ask-in" : "#tb-ask-in";
  const page = await open(browser, size, path, "some", where);
  // From the top of the page, so the sticky nav isn't drawn across a long still; the drill's still is what the reader's screen shows.
  const shot = async (name: string, whole = path.name === "fallback") => { if (whole) await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(150); await page.screenshot({ path: join(out, `${path.name}-${size.name}-${name}.png`), fullPage: whole }); };
  // An answered ask, real side, then the same sentence on the seeded side.
  await page.fill(input, "Show me every Friends & Family attempt");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  const realShown = await page.locator("[data-shown]").first().getAttribute("data-shown");
  if (realShown !== "2") fail(`${where}: the ask on real rows shows ${realShown}, want 2`);
  await shot("ask-real");
  // Asked for the scammer AI with none on the record: it says so, and no chip stands for a source.
  await page.fill(input, "Show me the scammer AI's tries");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  const noAi = await page.evaluate(() => ({ line: document.body.textContent ?? "", chips: [...document.querySelectorAll(".tb-on button")].map((b) => b.textContent ?? "") }));
  if (!/Nothing on the record came from a scammer AI\./.test(noAi.line) || noAi.chips.some((t) => /scammer/i.test(t))) fail(`${where}: asked for the scammer AI: "${/\d+ real tries?\..{0,100}/.exec(noAi.line)?.[0] ?? ""}", chips ${noAi.chips.join(" | ")}`); else ok(`${where}: asked for the scammer AI, it says none`);
  await shot("ask-no-ai");
  await page.fill(input, "Show me every Friends & Family attempt in the seeded week");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  if (Number(await page.locator("[data-shown]").first().getAttribute("data-shown")) < 1) fail(`${where}: the ask on the seeded week shows nothing`);
  await shot("ask-seeded");
  await page.focus(".tb-on .tb-clear");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  // A picked bar: its day under the chart is the same pick as the bar's own click, which the walk also makes on the canvas.
  await page.evaluate(() => (document.querySelector(".tb-switch button:nth-child(2)") as HTMLElement).click());
  await page.waitForTimeout(500);
  await page.locator('.tb-types li[data-type="friends-family"]').first().scrollIntoViewIfNeeded(); // A chart mounts as it comes near (charts/Chart.tsx).
  const canvas = page.locator('.tb-types li[data-type="friends-family"] canvas').first();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  let bar = false;
  if (box) for (let i = 0; i < 7 && !bar; i++) {
    await page.mouse.click(box.x + (box.width * (i + 0.5)) / 7, box.y + box.height - 3);
    await page.waitForTimeout(200);
    bar = (await page.locator(".tb-axis [aria-pressed=true]").count()) === 1;
  }
  if (!bar) fail(`${where}: clicking a bar picked no day`); else ok(`${where}: a bar picks its day`);
  await shot("picked-bar");
  await page.focus(".tb-on .tb-clear");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  // The drill: a rule row goes to its tries, says how many, and comes back.
  const pickRule = size.mobile ? ".tb-rule-list li button" : '.tb-rules .ag-row[row-index="0"] [role="gridcell"]';
  await page.locator(pickRule).first().scrollIntoViewIfNeeded();
  await page.locator(pickRule).first().click();
  await page.waitForTimeout(800);
  const drill = await page.evaluate(() => {
    const d = document.querySelector<HTMLElement>(".tb-drill");
    const h = document.querySelector(".tb-tries h3")!;
    const r = h.getBoundingClientRect();
    return { rule: d?.dataset.drill ?? "", count: Number(d?.dataset.count), shown: Number(document.querySelector("[data-shown]")?.getAttribute("data-shown")), words: d?.querySelector("span")?.textContent ?? "", inView: r.top >= (document.querySelector(".lx-nav, nav")?.closest("header")?.getBoundingClientRect().bottom ?? 0) && r.bottom <= innerHeight, focused: document.activeElement === h };
  });
  if (!drill.rule || drill.count !== drill.shown || !drill.inView || !drill.focused) fail(`${where}: the drill landed wrong: ${JSON.stringify(drill)}`); else ok(`${where}: drill → ${drill.words}`);
  await shot("drill", false);
  await page.locator(".tb-drill button").first().click();
  await page.waitForTimeout(600);
  const back = await page.evaluate(() => ({ gone: !document.querySelector(".tb-drill"), focused: document.activeElement === document.querySelector(".tb-rules h3") }));
  if (!back.gone || !back.focused) fail(`${where}: back to the rules: ${JSON.stringify(back)}`); else ok(`${where}: back to the rules`);
  await page.context().close();
}

async function axe(page: Page, where: string, scope: string) {
  if (!AXE) { console.log(`  axe SKIPPED (set AXE)`); return; }
  // Through the debugger, not a script tag: the real server's CSP refuses an inline script, and this walk runs against it too.
  await page.evaluate(readFileSync(AXE, "utf8"));
  const v = await page.evaluate(async (q) => {
    const r = await (window as unknown as { axe: { run: (c: unknown, o: object) => Promise<{ violations: { id: string; nodes: { target: string[]; failureSummary: string }[] }[] }> } }).axe.run({ include: [...document.querySelectorAll(q)].map((e) => [`[data-axe-at="${e.setAttribute("data-axe-at", String(Math.random())) ?? e.getAttribute("data-axe-at")}"]`]) }, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] });
    return r.violations.map((x) => `${x.id} × ${x.nodes.length}: ${x.nodes[0]?.target.join(" ")} ${x.nodes[0]?.failureSummary?.slice(0, 160)}`);
  }, scope);
  if (v.length) for (const x of v) fail(`${where}: axe ${x}`); else ok(`${where}: axe 0`);
}

async function keyboard(page: Page, where: string, input: string, cell: boolean) {
  // Words in, by keys alone; the view line follows; the first filter chip clears by keys.
  await page.focus(input);
  await page.keyboard.type("Show me every Friends & Family attempt today");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  const on = await page.evaluate(() => [...document.querySelectorAll(".tb-on button")].map((b) => b.textContent));
  if (!on.some((t) => /Friends & Family/.test(t ?? ""))) fail(`${where}: the ask didn't filter (${on.join(", ")})`); else ok(`${where}: ask for a view → ${on.join(" | ")}`);
  const before = await page.locator("[data-shown]").first().getAttribute("data-shown");
  await page.focus(".tb-on .tb-clear");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  const after = await page.locator("[data-shown]").first().getAttribute("data-shown");
  if (Number(after) < Number(before)) fail(`${where}: clearing narrowed the rows`);
  // A type row's button, then a day's, by keys.
  await page.focus('.tb-types li[data-type="gift-card"] button');
  await page.keyboard.press("Space");
  await page.waitForTimeout(150);
  const gift = await page.locator("[data-shown]").first().getAttribute("data-shown");
  const count = await page.locator('.tb-types li[data-type="gift-card"]').getAttribute("data-count");
  if (gift !== count) fail(`${where}: the type row says ${count}, the view ${gift}`); else ok(`${where}: type row by keys → ${gift} rows, the row's own number`);
  await page.focus(".tb-axis button:nth-child(3)");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  await page.focus(".tb-on .tb-clear");
  await page.keyboard.press("Enter");
  if (cell) {
    // The rules grid: focus a row and pick it with Enter.
    await page.focus('.tb-rules [role="gridcell"]');
    await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
    if ((await page.locator(".tb-on button").count()) === 0) fail(`${where}: Enter on a rule row didn't filter`); else ok(`${where}: rule row by keys filters`);
    await page.focus(".tb-on .tb-clear");
    await page.keyboard.press("Enter");
  }
}

/** Real tries with nothing to draw (a11y panel, Round 5): one true line, no bare axis, and the canvases never reach a screen reader. */
async function emptyView(page: Page, where: string, state: "none" | "broken", shotAs: string) {
  const hidden = await page.evaluate(() => [...document.querySelectorAll(".tb-type-chart")].map((d) => ({ hidden: d.getAttribute("aria-hidden"), inert: d.hasAttribute("inert"), focusable: d.querySelectorAll("a, button, input, [tabindex]:not([tabindex='-1'])").length })));
  if (hidden.length === 0 || hidden.some((c) => c.hidden !== "true" || c.inert || c.focusable > 0)) fail(`${where}: a row's canvas reads as ${JSON.stringify(hidden[0])} of ${hidden.length}`); else ok(`${where}: ${hidden.length} canvases hidden from reading, none focusable`);
  await page.locator(".tb-switch button").first().click();
  await page.waitForSelector(".tb-empty");
  const e = await page.evaluate(() => ({
    line: document.querySelector(".tb-empty-line")?.textContent,
    go: [...document.querySelectorAll(".tb-empty-go a, .tb-empty-go button")].map((x) => x.textContent),
    drawn: document.querySelectorAll(".tb-time .tb-axis, .tb-time .tb-types, .tb-time .tb-sub, .tb-time table").length,
  }));
  const want = state === "none" ? "No real tries yet." : "The live count can't be read right now.";
  if (e.line !== want) fail(`${where}: the empty card reads "${e.line}", want "${want}"`);
  if (e.drawn !== 0) fail(`${where}: the empty card still draws ${e.drawn} parts of a chart`);
  const ways = state === "none" ? ["Try to trick Goose ›", "See it in the seeded demo week"] : [];
  if (JSON.stringify(e.go) !== JSON.stringify(ways)) fail(`${where}: the empty card offers ${JSON.stringify(e.go)}`);
  await page.locator(".tb-time").first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(out, `${shotAs}-empty-${state}.png`) });
  await axe(page, `${where} empty card`, ".tb-time");
  if (state === "none") {
    await page.locator(".tb-empty-go button").click();
    await page.waitForSelector(".tb-types canvas", { timeout: 60_000 });
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ pressed: document.querySelector(".tb-switch [aria-pressed=true]")?.textContent ?? "", focus: document.activeElement?.tagName }));
    if (!/Seeded/.test(after.pressed) || after.focus !== "H3") fail(`${where}: after the empty card's button: ${JSON.stringify(after)}`); else ok(`${where}: the empty card's button opens the seeded week and focus follows`);
  } else {
    await page.locator(".tb-switch button").nth(1).click();
    await page.waitForSelector(".tb-types canvas", { timeout: 60_000 });
  }
  ok(`${where}: empty card reads "${want}"`);
}

const browser = await chromium.launch();
for (const path of process.env.WALK_ONLY ? [] : PATHS) for (const size of SIZES) for (const state of Object.keys(STATES) as (keyof typeof STATES)[]) {
  const where = `${path.name} ${size.name} ${state}`;
  console.log(where);
  const page = await open(browser, size, path, state, where);
  await checks(page, where, state);
  await conditions(page, where, path.name, size.mobile, state);
  if (state === "none" || state === "broken") await emptyView(page, where, state, `${path.name}-${size.name}`);
  if (state === "some" || state === "none") await page.screenshot({ path: join(out, `${path.name}-${size.name}-${state}.png`), fullPage: true, ...(path.name === "studio" ? {} : {}) });
  if (state === "some") await page.evaluate(() => (document.querySelector(".tb-switch button:nth-child(2)") as HTMLElement).click());
  if (state === "none") {
    await axe(page, where, path.name === "studio" ? ".st-card:has(.tb-counter), .st-card:has(.tb-time), .st-card:has(.tb-rules), .st-card:has(.tb-tries)" : ".tb");
    await keyboard(page, where, path.name === "studio" ? "#st-ask-in" : "#tb-ask-in", !size.mobile);
    await page.locator(".tb-counter").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(out, `${path.name}-${size.name}-first.png`) });
  }
  await page.context().close();
}
for (const size of SIZES) await community(browser, size);
if (process.env.WALK_ONLY === "community") { await browser.close(); console.log(fails.length ? `\n${fails.length} failed` : "\nall passed"); process.exit(fails.length ? 1 : 0); }
for (const path of PATHS) for (const size of SIZES) {
  await arrival(browser, size, path);
  await picks(browser, size, path);
}
await browser.close();
console.log(fails.length ? `\n${fails.length} failed` : "\nall passed");
process.exit(fails.length ? 1 : 0);

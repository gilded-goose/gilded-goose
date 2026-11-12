// "The 21 that got through", in a real browser against a built site, at a phone's and a desktop's width: the wall's chunk
// is not fetched until the reader opens it; the keyboard reaches and opens it, and its place moves to the notes; every
// note on screen is the fixture's note, character for character, with that note's own verdicts; nothing inside a note
// can be pressed and the wall has no link; no test-set file is asked for and its old address answers 404; nothing runs
// sideways; no console errors. It presses only the wall's own button.
//   AXE=/path/to/axe.min.js OUT=/dir node scripts/misses-walk.ts [base]     default http://localhost:5191/
import { readFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { claimRows } from "@goose/core/proof";
import { NOTE_LABEL, verdictLines, wallOf, type RunRow } from "@goose/core/wall";

const OLD_FILE = "goose-notes-v1.json";

const base = (process.argv[2] ?? "http://localhost:5191/").replace(/\/?$/, "/");
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const wall = wallOf((JSON.parse(read("docs/fixtures/sealed-8-first-run.json")) as { rows: RunRow[] }).rows);
const through = claimRows(read("docs/claims.md")).find((r) => r.id === "fresh-code-through")!.value.split(" ")[0]!;
let bad = 0;
const fail = (m: string) => { bad++; console.log(`  FAIL ${m}`); };
const ok = (m: string) => console.log(`  ok   ${m}`);
const browser = await chromium.launch();

/** What the opened wall shows, list by list: each note's label, words and two verdict lines. */
const shown = (page: Page) => page.evaluate(() => [...document.querySelectorAll(".mw-notes")].map((ol) => [...ol.querySelectorAll(".mw-note")].map((li) => ({
  tag: li.querySelector(".mw-tag")?.textContent ?? "",
  note: li.querySelector("blockquote")?.textContent ?? "",
  then: [...li.querySelectorAll(".mw-then span")].map((s) => s.textContent ?? ""),
  // Anything a press could act on, or any element at all inside the quote: a note is one text node.
  live: li.querySelectorAll("a, button, input, [onclick], [tabindex], [contenteditable]").length + (li.querySelector("blockquote")?.children.length ?? 0),
}))));

for (const [w, h] of [[390, 844], [1440, 900]] as const) {
  const where = String(w);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce", ...(w < 768 ? { hasTouch: true, isMobile: true } : {}) });
  const page = await ctx.newPage();
  const errors: string[] = [];
  const asked: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("request", (r) => asked.push(r.url()));
  const wallAsked = () => asked.filter((u) => /MissesWall|goose-notes/.test(u));

  await page.goto(`${base}goose.html#/proof`, { waitUntil: "load" });
  await page.waitForSelector("#got-through", { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  const head = await page.textContent("h2#got-through");
  if (head !== `The ${through} that got through`) fail(`${where}: the heading reads "${head}"`); else ok(`${where}: "${head}", the claims row's count`);
  if (wallAsked().length) fail(`${where}: fetched before the wall was opened: ${wallAsked().join(", ")}`); else ok(`${where}: first paint fetched no wall chunk and no test set (${asked.length} requests)`);
  if (await page.locator(".mw, blockquote").count()) fail(`${where}: notes are drawn before the wall is opened`);
  const first = wall.scam.through[0]!.note;
  if ((await page.content()).includes(first.slice(0, 40))) fail(`${where}: a note's words are in the closed page`);

  // The keyboard reaches the button and opens it: Tab from the top of the page, then Enter.
  const door = page.getByRole("button", { name: "Show the notes", exact: true });
  let reached = false;
  for (let k = 0; k < 80 && !reached; k++) { await page.keyboard.press("Tab"); reached = await door.evaluate((b) => b === document.activeElement); }
  if (!reached) { fail(`${where}: Tab never reached the wall's button`); await door.focus(); } else ok(`${where}: Tab reaches the button`);
  if ((await door.boundingBox())!.height < 44) fail(`${where}: the button is under 44px tall`);
  await page.keyboard.press("Enter");
  await page.waitForSelector(".mw-notes", { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  const chunks = asked.filter((u) => /MissesWall/.test(u));
  if (chunks.length !== 1 || !/MissesWall-[\w-]+\.js$/.test(chunks[0]!)) fail(`${where}: opening fetched ${chunks.length} wall files, not its one chunk: ${chunks.join(", ")}`); else ok(`${where}: Enter opens it, fetching the wall's one chunk then`);
  if (asked.some((u) => u.includes("goose-notes"))) fail(`${where}: a test-set file was asked for`); else ok(`${where}: no test-set file is asked for`);
  // The button is gone (open once), and the keyboard's place is on the notes' first words, not lost to the page.
  const at = await page.evaluate(() => ({ button: [...document.querySelectorAll("button")].some((b) => b.textContent === "Show the notes"), focus: document.activeElement?.className ?? "", words: document.activeElement?.textContent ?? "", quote: getComputedStyle(document.querySelector(".mw-q")!).borderLeftWidth }));
  if (at.button || !at.focus.includes("mw-top") || !at.words.startsWith("These are our code's misses.")) fail(`${where}: after opening, the button is ${at.button ? "still there" : "gone"} and focus is on "${at.focus}"`); else ok(`${where}: the button gives way and focus moves to the notes' first words`);
  if (at.quote !== "3px") fail(`${where}: the wall's own styles didn't arrive with its chunk (a quote's rule is ${at.quote})`); else ok(`${where}: the wall's styles arrive inside its chunk`);

  const lists = await shown(page);
  const want = [wall.scam.through, wall.fair.stopped];
  if (lists.length !== 2) fail(`${where}: ${lists.length} lists of notes, not 2`);
  for (const [k, name] of [[0, "scam"], [1, "fair"]] as const) {
    const got = lists[k] ?? [], exp = want[k]!;
    if (got.length !== exp.length) { fail(`${where}: ${got.length} ${name} notes on screen, the fixture gives ${exp.length}`); continue; }
    const off = got.findIndex((g, i) => g.note !== exp[i]!.note || g.tag !== NOTE_LABEL[exp[i]!.kind] || g.then.join("|") !== verdictLines(exp[i]!).join("|"));
    if (off >= 0) fail(`${where}: ${name} note ${off + 1} differs from the fixture: "${got[off]!.note.slice(0, 60)}" / ${got[off]!.then.join(" ")}`);
    else ok(`${where}: ${got.length} ${name} notes, each the fixture's words and that note's own verdicts`);
    const live = got.reduce((t, g) => t + g.live, 0);
    if (live) fail(`${where}: ${live} pressable or nested elements inside ${name} notes`);
  }
  if (lists[0]?.length !== Number(through)) fail(`${where}: ${lists[0]?.length} rows, the claims row says ${through}`);
  const links = await page.evaluate(() => document.querySelectorAll(".mw a, .mw button, .mw [href]").length);
  if (links) fail(`${where}: the wall has ${links} links or buttons; it should have none`); else ok(`${where}: no link and no button in the wall; nothing in a note can be pressed`);

  const size = await page.evaluate(() => ({
    over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    wide: [...document.querySelectorAll(".mw *")].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).length,
    said: document.querySelector(".mw")?.textContent ?? "",
  }));
  if (size.over > 0 || size.wide > 0) fail(`${where}: ${size.over}px sideways, ${size.wide} elements past the edge`); else ok(`${where}: nothing sideways`);
  // The page's own words never call the set blind or give a rate. (A note may say what it likes: its words are removed first.)
  let own = size.said;
  for (const n of want.flat()) own = own.replace(n.note, "");
  if (/\bblind\b/i.test(own)) fail(`${where}: the wall calls the set blind`);
  if (/\d\s?%|\bper ?cent\b|catch rate/i.test(own)) fail(`${where}: the wall shows a rate`);
  if (!own.includes("Not a rate")) fail(`${where}: the wall doesn't say "Not a rate"`); else ok(`${where}: says "Not a rate", never "blind", no percentage`);

  // The two sets as one file are not served (their quoted notes name real payment apps): the old address answers 404.
  const res = await page.request.get(new URL(OLD_FILE, base).href);
  if (res.status() !== 404) fail(`${where}: /${OLD_FILE} answered ${res.status()}, not 404`); else ok(`${where}: /${OLD_FILE} answers 404`);

  if (process.env.AXE) {
    await page.evaluate(readFileSync(process.env.AXE, "utf8"));
    const v = await page.evaluate(async () => (await (window as unknown as { axe: { run: (c: Document, o: unknown) => Promise<{ violations: { id: string; nodes: unknown[] }[] }> } }).axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "best-practice"] })).violations.map((x) => `${x.id} (${x.nodes.length})`));
    if (v.length) fail(`${where}: axe ${v.join(", ")}`); else ok(`${where}: axe 0`);
  }
  if (process.env.OUT) await page.screenshot({ path: `${process.env.OUT}/misses-${w}.png`, fullPage: true });

  if (errors.length) fail(`${where}: ${errors.slice(0, 2).join(" | ").slice(0, 300)}`); else ok(`${where}: no console errors`);
  await ctx.close();

  // An address that names the section opens it without a press, and leaves focus alone.
  const ctx2 = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
  const linked = await ctx2.newPage();
  await linked.goto(`${base}goose.html#/proof#got-through`, { waitUntil: "load" });
  await linked.waitForSelector(".mw-notes", { timeout: 30_000 }).catch(() => {});
  if ((await linked.locator(".mw-notes").first().locator(".mw-note").count()) !== Number(through)) fail(`${where}: #/proof#got-through didn't open the wall`);
  else if (await linked.evaluate(() => document.activeElement?.className.includes("mw-top"))) fail(`${where}: arriving by the address moved focus`);
  else ok(`${where}: #/proof#got-through opens the wall`);
  // And so does the same address reached while already on Proof.
  const later = await ctx2.newPage();
  await later.goto(`${base}goose.html#/proof`, { waitUntil: "load" });
  await later.waitForSelector("#got-through", { timeout: 30_000 });
  if (await later.locator(".mw").count()) fail(`${where}: the wall is open before the address names it`);
  await later.evaluate(() => { location.hash = "#/proof#got-through"; });
  await later.waitForSelector(".mw-notes", { timeout: 30_000 }).catch(() => {});
  if ((await later.locator(".mw-notes").first().locator(".mw-note").count()) !== Number(through)) fail(`${where}: a hash change to #got-through while on Proof didn't open the wall`); else ok(`${where}: a hash change to it while on Proof opens the wall too`);
  await ctx2.close();
}

await browser.close();
console.log(bad ? `misses-walk FAIL: ${bad}` : "misses-walk ok");
process.exit(bad ? 1 : 0);

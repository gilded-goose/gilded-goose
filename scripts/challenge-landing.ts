// Getting to Try to trick Goose from wherever she is (Track P, Nov 4; the reviewer found the first version's landing could
// look forever, and a hash read a stale view). Against a local server only; it sends one recorded ask and no trick.
//   1. Mid-run, the menu's item resets the run and lands on the Challenge.
//   2. Mid-run, an address with #challenge or #mixer does the same: the mixer's words wait in a box she can see.
//   3. A tap on the menu's item while an ask is out: the late answer doesn't pull her away.
//   4. Her wheel during the wait for a slow chunk wins: nothing scrolls the page after it, and what's below stays put when the
//      chunk comes. (This read scrollY < 400 until Nov 4, from when the landing waited for the chunk. It lands first now, so
//      her wheel adds to the landing, and that number failed with no jump on the page.)
//   5. The scammer AI's button isn't on screen: it stays off until Joshua decides.
//   6. A cold #challenge (a shared link, the judge steps) keeps focus on the heading once the block lands: 15 cold loads in
//      Chromium and 15 in WebKit, at three sizes, with the Challenge's chunk on time, late and very late (round 6b's a11y
//      seat, B1: focus fell to the page on 10 of 15, and on 30 of 30 once the challenge led the page).
// Usage: node scripts/challenge-landing.ts http://localhost:8801
import { chromium, webkit, type Page } from "playwright";
import { localOnly } from "./not-live.ts";

const base = process.argv[2];
if (!base) throw new Error("usage: node scripts/challenge-landing.ts <url>");
localOnly(base);
const b = await chromium.launch();
let bad = 0;
const check = (ok: boolean, what: string, got: unknown) => { if (!ok) { bad++; console.log(`FAIL ${what}: ${JSON.stringify(got)}`); } };
const state = (p: Page) => p.evaluate(() => ({
  challenge: !!document.getElementById("challenge"),
  top: Math.round(document.getElementById("challenge")?.getBoundingClientRect().top ?? -9999),
  y: Math.round(scrollY),
  focus: document.activeElement?.id ?? "",
}));
const boxWords = (p: Page) => p.locator(".dk-ask textarea:visible, .dk-ask input:visible").first().inputValue().catch(() => null);
const open = async (w: number, h: number) => {
  const c = await b.newContext({ viewport: { width: w, height: h } });
  const p = await c.newPage();
  await p.goto(`${base}/?desk=1`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  return p;
};
const toRun = async (p: Page) => {
  await p.locator(".dk-chips button:visible, .dk-chips a:visible").first().click();
  await p.waitForTimeout(800);
  const go = p.locator(".dk-go:visible");
  if (await go.count()) await go.first().click().catch(() => {});
  await p.waitForFunction(() => !document.querySelector(".dk-hero h1"), undefined, { timeout: 15_000 });
};
const menuTrick = async (p: Page) => {
  await p.locator("header.gn .dk-menu:visible").click();
  await p.waitForTimeout(450);
  await p.locator(".gm-item[data-item=trick]").first().click();
};

for (const [w, h] of [[1440, 900], [390, 844]] as const) {
  // 1. the menu, mid-run
  let p = await open(w, h);
  await toRun(p);
  await menuTrick(p);
  await p.waitForTimeout(2500);
  let s = await state(p);
  check(s.challenge && s.focus === "ds-ch-h", `${w} menu mid-run`, s);
  const button = await p.locator(".ds-ch-ai-go:visible").count();
  check(button === 0, `${w} the scammer AI's button shows, and it's off`, button);
  await p.context().close();

  // 2. the addresses, mid-run: these run on the first render's menuAct
  for (const hash of ["challenge", "mixer"]) {
    p = await open(w, h);
    await toRun(p);
    await p.evaluate((x) => { location.hash = x; }, hash);
    await p.waitForTimeout(2500);
    s = await state(p);
    if (hash === "challenge") check(s.challenge && s.focus === "ds-ch-h", `${w} #challenge mid-run`, s);
    else { const words = await boxWords(p); check(words === "A used Fernway mixer", `${w} #mixer mid-run`, words); }
    await p.context().close();
  }

  // 3. an ask out when she leaves
  p = await open(w, h);
  await p.route("**/api/runs/market/**", async (r) => { await new Promise((ok) => setTimeout(ok, 2500)); await r.continue(); });
  await p.locator(".dk-chips button:visible, .dk-chips a:visible").first().click();
  await p.waitForTimeout(500);
  const go = p.locator(".dk-go:visible");
  if (await go.count()) await go.first().click().catch(() => {});
  await p.waitForTimeout(400);
  await menuTrick(p);
  await p.waitForTimeout(4500);
  s = await state(p);
  check(s.challenge && s.focus === "ds-ch-h", `${w} a late answer pulled her away`, s);
  await p.context().close();

  // 4. her wheel while the block is still on its way
  const c = await b.newContext({ viewport: { width: w, height: h } });
  p = await c.newPage();
  await p.route("**/assets/Challenge*", async (r) => { await new Promise((ok) => setTimeout(ok, 1800)); await r.continue(); });
  await p.addInitScript(() => {
    const log = ((window as unknown as { scrolls: string[] }).scrolls = [] as string[]);
    const into = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (...a: Parameters<typeof into>) { log.push("code"); return into.apply(this, a); };
    const to = window.scrollTo.bind(window);
    window.scrollTo = ((...a: Parameters<typeof to>) => { log.push("code"); return to(...a); }) as typeof window.scrollTo;
    addEventListener("wheel", () => log.push("wheel"), { passive: true, capture: true });
  });
  await p.goto(`${base}/?desk=1#challenge`, { waitUntil: "commit" });
  await p.waitForSelector(".dk-hero h1");
  await p.mouse.move(w / 2, h / 2);
  await p.mouse.wheel(0, 300);
  await p.waitForTimeout(700);
  const below = () => p.evaluate(() => Math.round(document.querySelector(".ds-impact")?.getBoundingClientRect().top ?? -9999));
  const before = await below();
  await p.waitForTimeout(2500);
  const log = await p.evaluate(() => (window as unknown as { scrolls: string[] }).scrolls);
  check(log.includes("wheel"), `${w} the wheel never reached the page`, log);
  check(!log.slice(log.indexOf("wheel")).includes("code"), `${w} code scrolled the page after her wheel`, log);
  check(Math.abs((await below()) - before) <= 2, `${w} what's below jumped when the chunk came`, [before, await below()]);
  await c.close();
}
await b.close();

// 6. a cold #challenge keeps its focus, both engines
for (const [name, engine] of [["chromium", chromium], ["webkit", webkit]] as const) {
  const e = await engine.launch();
  let run = 0;
  for (const late of [0, 600, 1500, 0, 600]) for (const [w, h] of [[390, 844], [390, 667], [1440, 900]] as const) {
    run++;
    const c = await e.newContext({ viewport: { width: w, height: h } });
    const p = await c.newPage();
    if (late) await p.route("**/assets/Challenge*", async (r) => { await new Promise((ok) => setTimeout(ok, late)); await r.continue(); });
    await p.goto(`${base}/?desk=1#challenge`, { waitUntil: "commit" });
    await p.waitForSelector("#ds-ch-note", { timeout: 15_000 }).catch(() => {});
    await p.waitForTimeout(1500);
    const s = await state(p);
    check(s.challenge && s.focus === "ds-ch-h", `${name} ${w}x${h} cold #challenge, chunk +${late} ms, run ${run}: focus left the heading`, s);
    await c.close();
  }
  await e.close();
}
if (bad) { console.log(`challenge-landing: ${bad} failed`); process.exit(1); }
console.log("challenge-landing: OK (menu and addresses mid-run, a late answer, her scroll, a cold #challenge keeps focus 15/15 in Chromium and WebKit)");

// For builders, in a real browser against a built server, at a phone's and a desktop's width: the code on the page is the
// example file byte for byte, nothing runs sideways, axe finds nothing, and the menu opens the page. It presses nothing else.
//   AXE=/path/to/axe.min.js OUT=/dir node scripts/builders-walk.ts [base]     default http://localhost:5179/
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const base = (process.argv[2] ?? "http://localhost:5179/").replace(/\/?$/, "/");
const file = readFileSync(new URL("../trust/examples/ten-lines.ts", import.meta.url), "utf8");
const sellerFile = readFileSync(new URL("../trust/examples/read-seller.ts", import.meta.url), "utf8");
let bad = 0;
const fail = (m: string) => { bad++; console.log(`  FAIL ${m}`); };
const ok = (m: string) => console.log(`  ok   ${m}`);
const browser = await chromium.launch();

for (const [w, h] of [[390, 844], [1440, 900]] as const) {
  const where = String(w);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce", ...(w < 768 ? { hasTouch: true, isMobile: true } : {}) });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`${base}?desk=builders`, { waitUntil: "load" });
  await page.waitForSelector(".bd-code", { timeout: 30_000 });
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => ({
    h1: document.querySelector("h1")?.textContent,
    title: document.title,
    code: document.querySelector(".bd-code")?.textContent ?? "",
    seller: document.querySelector('.bd-code[data-file="trust/examples/read-seller.ts"]')?.textContent ?? "",
    reads: [...document.querySelectorAll<HTMLElement>(".bd-reads li")].map((li) => li.dataset["verdict"]).join(),
    canvas: getComputedStyle(document.documentElement).backgroundColor,
    bar: getComputedStyle(document.querySelector(".bd .gn")!).backgroundColor,
    barInk: getComputedStyle(document.querySelector(".bd .gn")!).color,
    scheme: getComputedStyle(document.documentElement).colorScheme,
    over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    wide: [...document.querySelectorAll(".bd-main *")].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).length,
    small: [...document.querySelectorAll(".bd-next a")].filter((a) => a.getBoundingClientRect().height < 44).length,
    not: document.querySelectorAll(".bd-not li").length,
  }));
  if (r.h1 !== "For builders") fail(`${where}: h1 reads ${r.h1}`); else ok(`${where}: h1`);
  if (r.title !== "For builders · Gilded Goose") fail(`${where}: title reads ${r.title}`);
  if (r.code !== file) fail(`${where}: the code differs from trust/examples/ten-lines.ts (${r.code.length} vs ${file.length} characters)`); else ok(`${where}: the code is the file, byte for byte`);
  if (r.seller !== sellerFile) fail(`${where}: the code differs from trust/examples/read-seller.ts (${r.seller.length} vs ${sellerFile.length} characters)`); else ok(`${where}: the seller's code is the file`);
  if (r.canvas !== "rgb(21, 16, 19)" || r.scheme !== "dark") fail(`${where}: the canvas isn't Midnight: ${r.canvas}, ${r.scheme}`); else ok(`${where}: Midnight to its edges`);
  if (r.barInk !== "rgb(242, 233, 220)") fail(`${where}: the bar's words are ${r.barInk}`);
  if (!/^rgb\(21, 16, 19\)$/.test(r.bar)) fail(`${where}: the bar is ${r.bar}`);
  if (r.reads !== "refuse,hold,clear") fail(`${where}: the three notes read ${r.reads}`);
  // A wrapped code line's later rows start right of its first row, so no piece of a line reads as a line of its own.
  const hang = await page.evaluate(() => {
    let wrapped = 0; const flat: string[] = [];
    for (const ln of document.querySelectorAll<HTMLElement>(".bd-code .bd-ln")) {
      const g = document.createRange(); g.selectNodeContents(ln);
      const rows = new Map<number, number>();
      for (const q of g.getClientRects()) if (q.width > 0) rows.set(Math.round(q.top), Math.min(rows.get(Math.round(q.top)) ?? Infinity, q.left));
      const lefts = [...rows.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
      if (lefts.length > 1) wrapped++;
      if (lefts.slice(1).some((x) => x <= lefts[0]! + 1)) flat.push((ln.textContent ?? "").trim().slice(0, 50));
    }
    return { wrapped, flat };
  });
  if (hang.flat.length) fail(`${where}: ${hang.flat.length} wrapped code lines go back to the edge: ${hang.flat[0]}`);
  else if (w === 390 && hang.wrapped === 0) fail(`${where}: no code line wraps, so the hang went unmeasured`);
  else ok(`${where}: wraps hang under their line (${hang.wrapped} lines wrap)`);
  if (r.over > 0 || r.wide > 0) fail(`${where}: ${r.over}px sideways, ${r.wide} elements past the edge`); else ok(`${where}: nothing sideways`);
  if (r.small) fail(`${where}: ${r.small} links under 44px`);
  if (r.not < 6) fail(`${where}: only ${r.not} things it doesn't promise`);
  if (process.env.AXE) {
    await page.evaluate(readFileSync(process.env.AXE, "utf8"));
    const v = await page.evaluate(async () => (await (window as unknown as { axe: { run: (c: Document, o: unknown) => Promise<{ violations: { id: string; nodes: unknown[] }[] }> } }).axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "best-practice"] })).violations.map((x) => `${x.id}×${x.nodes.length}`));
    if (v.length) fail(`${where}: axe ${v.join(", ")}`); else ok(`${where}: axe 0`);
  }
  if (process.env.OUT) await page.screenshot({ path: `${process.env.OUT}/builders-${w}.png`, fullPage: true });
  if (errors.length) fail(`${where}: ${errors.slice(0, 2).join(" | ").slice(0, 300)}`); else ok(`${where}: no page errors`);
  // The menu reaches it, from another page, in two taps.
  await page.goto(`${base}?desk=how`, { waitUntil: "load" });
  await page.locator(".gm-btn:visible").first().click();
  const link = page.locator(`.gm-panel a[href*="desk=builders"]`).first();
  await link.waitFor({ timeout: 10_000 }).catch(() => {});
  if (!(await link.count())) { fail(`${where}: the menu has no link to the page`); await ctx.close(); continue; }
  await link.click();
  await page.waitForSelector(".bd-code", { timeout: 30_000 }).catch(() => {});
  if (!(await page.locator(".bd-code").count())) fail(`${where}: the menu's link didn't open the page`); else ok(`${where}: the menu opens it`);
  await ctx.close();
}
// With motion on, in a fresh session: the walk above turns motion off, and the opening's dark egg never runs under that.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${base}?desk=builders`, { waitUntil: "load" });
  await page.waitForSelector(".bd-code", { timeout: 30_000 });
  const shown = await page.evaluate(() => getComputedStyle(document.getElementById("dk-case")!).display);
  if (shown !== "none") fail(`the opening's egg is over the page: #dk-case is ${shown}`); else ok("no opening's egg over the page, with motion on");
  await ctx.close();
}
await browser.close();
console.log(bad ? `\n${bad} failed` : "\nall passed");
process.exit(bad ? 1 : 0);

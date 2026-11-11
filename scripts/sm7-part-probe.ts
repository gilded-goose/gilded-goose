/// <reference lib="dom" />
// SM-7 probe (not part of pnpm check): the one card's "price alone" part (a clean row read before the set-aside), which
// no market plants today. At done it forces data-part="price" on the column and holds the shield line, then compares
// the frame drawn around the price's part with the column's own frame (left, right, bottom must match) and takes stills.
// usage: node scripts/sm7-part-probe.ts <out dir> [--base http://localhost:8847/]
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const out = args[0]!;
const base = args.includes("--base") ? args[args.indexOf("--base") + 1]! : "http://localhost:8847/";
mkdirSync(out, { recursive: true });
let failed = 0;
const browser = await chromium.launch();
for (const size of ["1440", "390"] as const) {
  const phone = size === "390";
  const vp = phone ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const ctx = await browser.newContext({ ...(phone ? devices["iPhone 13"] : {}), deviceScaleFactor: 1, viewport: vp, colorScheme: "dark", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`${base}?desk=1`);
  const box = page.getByRole("textbox", { name: "Ask for anything" });
  await box.fill("A Marsh Lights ticket under $90");
  await page.getByRole("button", { name: "Ask Goose" }).first().click();
  await page.getByRole("button", { name: /Shop for this/ }).click();
  await page.getByText(/^Checked \d+ listings?\./).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);
  // The Trail's held place (.tl-hold, while its chunk loads) must be the drawn box's size (system.md §3): the drawn
  // `.tl` box with its margins vs a `.tl-hold` placed beside it.
  const tl = await page.evaluate(() => {
    const t = document.querySelector<HTMLElement>(".dk-live-grid .dk-deal2 .tl");
    if (!t) return null;
    const h = document.createElement("div"); h.className = "tl-hold dk-before"; t.after(h); // as Desk.tsx draws it (DK check 2)
    const outer = (e: HTMLElement) => { const s = getComputedStyle(e); return Math.round(e.getBoundingClientRect().height + parseFloat(s.marginTop) + parseFloat(s.marginBottom)); };
    const r = { drawn: Math.round(t.getBoundingClientRect().height), drawnOuter: outer(t), held: Math.round(h.getBoundingClientRect().height), heldOuter: outer(h) };
    h.remove();
    return r;
  });
  const tlOk = !!tl && tl.drawnOuter === tl.heldOuter;
  if (!tlOk) failed++;
  console.log(`${tlOk ? "ok  " : "FAIL"} ${size}: the Trail's held place ${tl?.held} px (${tl?.heldOuter} with margins) vs its drawn box ${tl?.drawn} px (${tl?.drawnOuter})`);
  const r = await page.evaluate(() => {
    const right = document.querySelector<HTMLElement>(".dk-live-grid .dk-right")!, deal = right.querySelector<HTMLElement>(".dk-deal2")!, prot = right.querySelector<HTMLElement>(".dk-protect")!;
    const whole = right.getBoundingClientRect(), price0 = deal.querySelector(".dk-big")!.getBoundingClientRect();
    right.setAttribute("data-part", "price"); prot.setAttribute("data-wait", "");
    const d = deal.getBoundingClientRect(), b = getComputedStyle(deal, "::before"), price1 = deal.querySelector(".dk-big")!.getBoundingClientRect();
    const frame = { left: d.left + parseFloat(b.left), right: d.right - parseFloat(b.right), bottom: d.bottom - parseFloat(b.bottom), top: d.top + parseFloat(b.top) };
    const rs = getComputedStyle(right);
    return { whole: [whole.left, whole.right, whole.bottom].map(Math.round), frame: [frame.left, frame.right, frame.bottom].map(Math.round), top: Math.round(frame.top - whole.top), price: [price0.x, price0.y, price1.x, price1.y].map(Math.round), colBg: rs.backgroundColor, colShadow: rs.boxShadow };
  });
  const ok = JSON.stringify(r.whole) === JSON.stringify(r.frame) && r.price[0] === r.price[2] && r.price[1] === r.price[3] && r.colShadow === "none";
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${size}: the price-alone frame (left, right, bottom) ${JSON.stringify(r.frame)} = the whole card's ${JSON.stringify(r.whole)}; it starts ${r.top} px below the card's top (the held shield line); the price ${r.price.slice(0, 2)} → ${r.price.slice(2)}; column bg ${r.colBg}, shadow ${r.colShadow}`);
  await page.locator(".dk-live-grid .dk-right").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(out, `part-price-${size}.png`) });
  await ctx.close();
}
await browser.close();
if (failed) process.exit(1);

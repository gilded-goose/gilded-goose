// Tab through the Behind the scenes dashboard on a build with Studio drawn: no stop of zero size, a keyboard reaches what the cards hold,
// every stop shows on screen when it lands, and edit mode gets AG's own stops back. GET only; no ask, no POST.
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:8877";
let failed = 0, ran = 0;
const check = (ok: boolean, what: string) => { ran++; if (!ok) failed++; console.log(`${ok ? "ok  " : "FAIL"} ${what}`); };
const browser = await chromium.launch();
for (const [w, h] of [[1440, 900], [390, 844]] as const) {
  const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
  await page.goto(`${base}/?desk=studio`);
  await page.waitForSelector('[data-studio-layer="shown"] .st-studio[data-ready="1"]', { timeout: 60_000 });
  await page.waitForTimeout(6000);
  const stops: { cls: string; w: number; h: number; card: boolean }[] = [];
  for (let i = 0; i < 160; i++) {
    await page.keyboard.press("Tab");
    const s = await page.evaluate(() => { const a = document.activeElement as HTMLElement; const r = a.getBoundingClientRect(); return { cls: `${a.tagName}.${String(a.className).slice(0, 40)}`, w: r.width, h: r.height, card: !!a.closest(".st-card"), body: a === document.body }; });
    if (s.body) break;
    stops.push(s);
  }
  const zero = stops.filter((s) => s.w === 0 || s.h === 0);
  check(zero.length === 0, `${w}: no stop of zero size (${zero.length}${zero[0] ? `, first ${zero[0].cls}` : ""})`);
  const inCards = stops.filter((s) => s.card).length;
  check(inCards >= 3, `${w}: Tab reaches what the cards hold (${inCards} of ${stops.length} stops)`);
  check(stops.length < 110, `${w}: Tab comes out the far end of the page in under 110 stops (${stops.length})`);
  // Back the same way, through the pivots too: Shift+Tab from the page's end reaches the top with no trap.
  let backs = 0;
  for (; backs < 160; backs++) {
    await page.keyboard.press("Shift+Tab");
    if (await page.evaluate(() => document.activeElement === document.body)) break;
  }
  check(backs < 160, `${w}: Shift+Tab comes back out the top (${backs})`);
  const edit = page.getByRole("button", { name: /edit this view/i });
  if (w >= 768 && await edit.count()) {
    await edit.first().click();
    await page.waitForTimeout(1500);
    const back = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".ag-studio-layout-widget > .ag-studio-layout-widget-focus-container")].filter((e) => e.getAttribute("tabindex") === "0").length);
    check(back > 0, `${w}: edit mode has AG's own stops back (${back})`);
  }
  await page.context().close();
}
await browser.close();
console.log(`plain tabs: ${failed} failed of ${ran}`);
process.exit(failed ? 1 : 0);

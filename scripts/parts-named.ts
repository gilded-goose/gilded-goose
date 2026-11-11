// Usage: node scripts/parts-named.ts [seat-url]   (a LOCAL seat: sh scripts/check-bundle.sh, then sh scripts/seat-server.sh 8801)
// A part that can't come names its loss (Track P, Fri Nov 6). Two halves, in WebKit and Chromium at 390 by 844:
// 1. Clean: every judge route loads with no part lost. A boundary that catches a routine throw (a voice API in Safari, say) would
//    now raise the page's "Part of this page didn't load." on every load, so this guards the class fix against its own risk.
// 2. Lost: with a lazy part's chunk aborted (the menu's panel, the Desk's room panes), the strip comes with its Reload.
// GET-only (anything else is aborted) and a local seat only. Exits 1 on any FAIL.
import { chromium, webkit, type Page } from "playwright";
import { LOST } from "../web/src/states/words.ts";

const base = (process.argv[2] ?? "http://localhost:8801").replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) { console.error(`parts-named: a local seat only, not ${base}`); process.exit(2); }
const ROUTES = ["/", "/?desk=1", "/?desk=ledger", "/?desk=studio", "/?desk=proof", "/?desk=tour", "/?desk=system", "/?desk=how", "/?desk=builders", "/?desk=list", "/?desk=haggle", "/?wallet=1", "/?desk=1#week", "/?desk=1#wants", "/?desk=1#challenge"];
const strip = (page: Page) => page.evaluate(() => ({ marked: "partLost" in document.documentElement.dataset, text: [...document.querySelectorAll<HTMLElement>(".st-strip")].filter((s) => !s.hidden).map((s) => s.innerText.replace(/\s+/g, " ").trim()).join(" | ") }));

let fails = 0;
for (const [name, type] of [["webkit", webkit], ["chromium", chromium]] as const) {
  const browser = await type.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route("**/*", (r) => (["GET", "HEAD"].includes(r.request().method()) ? r.continue() : r.abort()));
  const page = await ctx.newPage();
  for (const route of ROUTES) {
    await page.goto(base + route, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const s = await strip(page);
    const ok = !s.marked && !s.text.includes(LOST.title);
    if (!ok) fails++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(8)} clean ${route.padEnd(20)} ${ok ? "no part lost" : `a part was lost on a clean load: "${s.text}"`}`);
  }
  await ctx.close();
  // Lost: the menu's panel (a lazyOr with the default lost path) aborted, then the menu opened.
  const lost = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await lost.route("**/*", (r) => (r.request().method() !== "GET" && r.request().method() !== "HEAD" ? r.abort() : /\/assets\/MenuPanel-[^/]*\.js$/.test(r.request().url()) ? r.abort("failed") : r.continue()));
  const p = await lost.newPage();
  await p.goto(base + "/?desk=1", { waitUntil: "load" });
  await p.waitForTimeout(1500);
  await p.getByRole("button", { name: /menu/i }).first().click();
  await p.waitForTimeout(1500);
  const s = await strip(p);
  const ok = s.text.includes(LOST.title);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(8)} lost  the menu's panel     ${ok ? `named: "${s.text}"` : `nothing named (strip: "${s.text}", marked ${s.marked})`}`);
  await lost.close();
  await browser.close();
}
console.log(fails ? `\nparts-named: ${fails} FAIL` : "\nparts-named: OK, no part lost on a clean judge route, and a lost part is named with Reload");
process.exit(fails ? 1 : 0);

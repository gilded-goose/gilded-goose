// The ask box's honesty line on the page itself, at both widths: `node scripts/ask-line-probe.ts <url>`. Fails if any ask box shows
// without "Views only: can't pay, approve or change limits." a visitor can read, and if no box was seen at all (a probe that found
// nothing proved nothing). Each run also hides the line and asks the same question, so a run that passes has shown it can fail.
// Read-only: GETs only, so it may be pointed at the live site.

import { chromium } from "playwright";
import { ASK_VIEW_ONLY, readAskBoxes } from "./ask-line.ts";

const BASE = (process.argv[2] ?? "http://localhost:8822").replace(/\/$/, "");
const local = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE);
const ROUTES = ["?desk=studio", "?desk=ledger", "?desk=ledger&tried=1", ...(local ? ["?desk=studio&studio=force"] : [])];
const WIDTHS = [[1440, 900], [390, 844]] as const;

let fails = 0;
let boxes = 0;
const browser = await chromium.launch();
for (const [width, height] of WIDTHS) {
  for (const route of ROUTES) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/${route}`, { waitUntil: "load" });
    await page.waitForTimeout(route.includes("force") ? 4000 : 1500);
    const found = await readAskBoxes(page);
    boxes += found.length;
    for (const b of found) {
      if (b.why) fails++;
      console.log(`${b.why ? "FAIL" : "ok  "} ${width} ${route} #${b.id}: ${b.why || "the line is on screen"}`);
    }
    if (found.length === 0) console.log(`  -  ${width} ${route}: no ask box on this page`);
    // The control: the same page with the line taken away must read as a miss, or this probe can't catch what it's for.
    if (found.some((b) => !b.why)) {
      await page.addStyleTag({ content: ".tb-ask-view, .st-ask-view { display: none !important; }" });
      const hidden = await readAskBoxes(page);
      if (!hidden.some((b) => b.why)) { fails++; console.log(`FAIL ${width} ${route}: with the line hidden the probe still passed, so it can't fail`); }
    }
    await ctx.close();
  }
}
await browser.close();
if (boxes === 0) { fails++; console.log("FAIL no ask box on any page: this run proved nothing"); }
console.log(fails ? `ask-line-probe: ${fails} failed` : `ask-line-probe: ${boxes} boxes, each with "${ASK_VIEW_ONLY}" on screen, and each run shown able to fail`);
process.exit(fails ? 1 : 0);

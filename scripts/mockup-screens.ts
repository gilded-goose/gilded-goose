/// <reference lib="dom" />
// Screenshots of the M2 design-direction mockup (docs/design/m2-direction.html) for Joshua's critique
// and guild-visual: three states × desktop 1280 and phone 390. Fails if the phone page scrolls sideways
// or a state's status text is missing (shared Lessons 1, 3, 6). Re-runnable: pnpm mockup:screens
import { chromium } from "playwright";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

const v2 = process.argv.includes("--v2"), v3 = process.argv.includes("--v3");
const file = "file://" + resolve(v3 ? "docs/design/m2-direction-v3.html" : v2 ? "docs/design/m2-direction-v2.html" : "docs/design/m2-direction.html");
const OUT = "docs/screens"; mkdirSync(OUT, { recursive: true });
const expect: Record<string, string> = v3 ? { landing: "nothing here yet", landed: "Order created", harmless: "no rule matched" } : v2 ? { landing: "nothing submitted yet", landed: "821193914R209014J", harmless: "no rule matched" } : { ready: "Needs your yes in PayPal", paid: "Paid in the PayPal sandbox", held: "Held for your yes" };
const prefix = v3 ? "m2-v3" : v2 ? "m2-v2" : "m2-direction";
function fail(m: string): never { console.error(`MOCKUP FAIL: ${m}`); process.exit(1); }
const browser = await chromium.launch();
for (const [name, viewport] of [["desktop", { width: 1280, height: 800 }], ["phone", { width: 390, height: 844 }]] as const) {
  for (const state of Object.keys(expect)) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
    await page.goto(`${file}?state=${state}${state === "ready" && name === "desktop" ? "" : ""}`);
    if (!(await page.getByText(expect[state]!).isVisible())) fail(`${name}/${state}: "${expect[state]}" not on screen`);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (sideways > 0) fail(`${name}/${state}: page scrolls sideways by ${sideways}px`);
    await page.screenshot({ path: `${OUT}/${prefix}-${state}-${name}.png`, fullPage: name === "desktop" || state === "landed" });
    if (state === "ready" || state === "landing") {
      await page.goto(`${file}?state=${state}&ledger=open`);
      // A fixed bar paints mid-page in a full-page capture; the sticky bar is already shown in the viewport shot above.
      await page.addStyleTag({ content: ".sticky{display:none!important}" });
      await page.screenshot({ path: `${OUT}/${prefix}-ledger-${name}.png`, fullPage: true });
    }
    console.log(`ok  ${name}/${state}`);
    await page.close();
  }
}
await browser.close();
console.log(`MOCKUP PASS: ${OUT}/${prefix}-*.png`);

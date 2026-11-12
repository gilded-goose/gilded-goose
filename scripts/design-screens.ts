// Screenshots of any static design mockup for guild-visual (the "design direction" playbook step; mockup-screens.ts
// keeps the v1-v3 checks). Each state is a query string; desktop 1280x800 and phone 390x844, first screen and full
// page, light and dark. Fails if anything runs off the side (scripts/overflow.ts), the check the app's screens pass.
//
//   node scripts/design-screens.ts docs/design/m2-direction-v5.html v5 "" "sent&all" "step=4&sent" "step=6"
//   writes docs/design/<prefix>-{desktop,phone}-<state>{,-full,-dark}.png

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { overflow } from "./overflow.ts";

const [file, prefix, ...states] = process.argv.slice(2);
if (!file || !prefix) { console.error("usage: node scripts/design-screens.ts <html> <prefix> [state ...]"); process.exit(2); }
const base = pathToFileURL(resolve(file)).href;
const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "start";

const browser = await chromium.launch();
let bad = 0;
for (const [size, viewport] of [["desktop", { width: 1280, height: 800 }], ["phone", { width: 390, height: 844 }]] as const) {
  for (const scheme of ["light", "dark"] as const) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 2, colorScheme: scheme, reducedMotion: "reduce" });
    for (const s of states.length ? states : [""]) {
      await page.goto(`${base}${s ? `?${s}` : ""}`);
      await page.waitForTimeout(150);
      const off = await overflow(page);
      if (off.length) { bad++; console.error(`OFF THE SIDE ${size} ${scheme} ?${s}:\n  ${off.join("\n  ")}`); }
      const name = `docs/design/${prefix}-${size}-${slug(s)}${scheme === "dark" ? "-dark" : ""}`;
      await page.screenshot({ path: `${name}.png` });
      if (scheme === "light") await page.screenshot({ path: `${name}-full.png`, fullPage: true });
      console.log(`ok  ${name}`);
    }
    await page.close();
  }
}
await browser.close();
if (bad) { console.error(`MOCKUP FAIL: ${bad} state(s) run off the side`); process.exit(1); }
console.log("MOCKUP PASS");

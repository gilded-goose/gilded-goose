// Read-only probe: loads the first screen (no run) and dumps what a visitor sees.
import { chromium } from "playwright";
const url = process.argv[2] ?? "http://localhost:5173/";
const b = await chromium.launch();
for (const [n, vp] of [["judge", { width: 1366, height: 768 }], ["student", { width: 390, height: 844 }]] as const) {
  const p = await b.newPage({ viewport: vp });
  await p.goto(url); await p.waitForTimeout(1500);
  console.log(`--- ${n} first screen ---\n` + await p.evaluate(() => document.body.innerText));
  await p.close();
}
await b.close();

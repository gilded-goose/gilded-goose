// Usage: node scripts/cold-walk.ts <origin>  (cold loads of /, ?desk=1, ?desk=ledger at 390 and 1440: console errors, failed requests, >=400, broken <img>, /src/ refs; PASS at 0)
// Track B session 9: cold loads (fresh context each), console errors, failed requests and >=400 responses.
import { chromium } from "playwright";
const origin = process.argv[2]!;
const br = await chromium.launch();
let bad = 0;
for (const path of ["/", "/?desk=1", "/?desk=ledger"]) for (const [w, h, phone] of [[390, 844, true], [1440, 900, false]] as const) {
  const ctx = await br.newContext({ viewport: { width: w, height: h }, isMobile: phone, hasTouch: phone });
  const page = await ctx.newPage();
  const errs: string[] = [], failed: string[] = [], status: string[] = []; let reqs = 0;
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("pageerror " + e.message));
  page.on("request", () => reqs++);
  page.on("requestfailed", (r) => failed.push(`${r.url()} ${r.failure()?.errorText}`));
  page.on("response", (r) => { if (r.status() >= 400) status.push(`${r.status()} ${r.url()}`); });
  await page.goto(origin + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const brokenImg = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute("src")).map((i) => i.getAttribute("src")));
  const srcPaths = await page.evaluate(() => [...document.querySelectorAll("[src],[href]")].map((e) => e.getAttribute("src") ?? e.getAttribute("href")).filter((s) => s && s.startsWith("/src/")));
  bad += errs.length + failed.length + status.length + brokenImg.length + srcPaths.length;
  console.log(`${path.padEnd(14)} ${w}: ${reqs} requests, console errors ${errs.length}, failed ${failed.length}, >=400 ${status.length}, broken <img> ${brokenImg.length}, /src/ refs ${srcPaths.length}`);
  for (const x of [...errs, ...failed, ...status, ...brokenImg, ...srcPaths]) console.log("   " + x);
  await ctx.close();
}
await br.close();
console.log(bad === 0 ? "COLD: PASS (0 errors, 0 failed requests)" : `COLD: FAIL (${bad})`);

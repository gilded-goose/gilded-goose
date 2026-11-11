/// <reference lib="dom" />
// Captures PUBLIC pages of real consumer apps for private design study (Joshua, 2026-10-23: "go look").
// Output goes to docs/design/reference/ which is gitignored: these pages carry other companies' trademarks and
// never enter the public repo or the demo. Input: a JSON file [{ name, urls: [...] }]. Each page is captured at
// desktop 1280×800 and phone 390×844 (viewport only, after a short settle). Cookie banners are left as they are.
// `scrolls: N` adds N more phone frames, one screen further down each, for pages that reveal themselves on scroll.
//   node scripts/reference-screens.ts <picks.json>
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const picks = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as { name: string; urls: string[]; scrolls?: number }[];
const OUT = "docs/design/reference"; mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const log: string[] = [];
for (const p of picks) {
  const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  for (const [i, url] of p.urls.entries()) {
    for (const [vp, viewport] of [["desktop", { width: 1280, height: 800 }], ["phone", { width: 390, height: 844 }]] as const) {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, ...(vp === "phone" ? { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" } : {}) });
      const page = await ctx.newPage();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(2500);
        const file = `${OUT}/${slug}-${i + 1}-${vp}.png`;
        await page.screenshot({ path: file, fullPage: false });
        log.push(`ok   ${file}  ${url}`);
        for (let k = 1; vp === "phone" && k <= (p.scrolls ?? 0); k++) {
          await page.mouse.wheel(0, 760);
          await page.waitForTimeout(1200);
          const more = `${OUT}/${slug}-${i + 1}-${vp}-scroll${k}.png`;
          await page.screenshot({ path: more, fullPage: false });
          log.push(`ok   ${more}`);
        }
      } catch (e) {
        log.push(`fail ${slug}-${i + 1}-${vp}  ${url}  ${(e as Error).message.split("\n")[0]}`);
      }
      await ctx.close();
    }
  }
}
await browser.close();
writeFileSync(`${OUT}/INDEX.txt`, readIndex() + log.join("\n") + "\n");
function readIndex() { try { return readFileSync(`${OUT}/INDEX.txt`, "utf8"); } catch { return ""; } }
console.log(log.join("\n"));

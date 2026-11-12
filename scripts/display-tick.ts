// A straight tick at display size (the DD, Nov 4: at 68 px "can't" with a straight apostrophe is the first flaw on the
// page). Walks every route at 1440 and 390, scrolled through so the lazy sections draw, and fails on any text with ' or "
// set at --t-h2 or larger. Run against a local server: `node scripts/display-tick.ts http://localhost:8801`.
import { chromium } from "playwright";

const base = process.argv[2];
if (!base) throw new Error("usage: node scripts/display-tick.ts <url>");
const ROUTES = ["/", "/?desk=1", "/?desk=tour", "/?desk=ledger", "/?desk=proof", "/?desk=haggle", "/?desk=how", "/?desk=system", "/?market=1", "/?wallet=1", "/?wallet=0", "/safe.html", "/no-such"];
const b = await chromium.launch();
let bad = 0;
for (const w of [1440, 390]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  for (const r of ROUTES) {
    const p = await ctx.newPage();
    await p.goto(base + r, { waitUntil: "networkidle" }).catch(() => {});
    await p.waitForTimeout(800);
    const hits = await p.evaluate(async (min) => {
      for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise((res) => setTimeout(res, 40)); }
      const out = new Set<string>();
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!/['"]/.test(n.nodeValue ?? "")) continue;
        const e = n.parentElement;
        if (!e || e.closest("script,style,template")) continue;
        const fs = parseFloat(getComputedStyle(e).fontSize);
        if (fs >= min) out.add(`${Math.round(fs)}px ${e.tagName} "${(n.nodeValue ?? "").trim().slice(0, 60)}"`);
      }
      return [...out];
    }, w >= 1300 ? 44 : 30); // --t-h2 at this width
    for (const h of hits) { bad++; console.log(`${w} ${r}: ${h}`); }
    await p.close();
  }
  await ctx.close();
}
await b.close();
console.log(bad ? `FAIL: ${bad} straight tick(s) at display size` : "OK: no straight tick at display size");
process.exit(bad ? 1 : 0);

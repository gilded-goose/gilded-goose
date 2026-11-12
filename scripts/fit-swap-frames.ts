// Usage: node scripts/fit-swap-frames.ts <url>  (every frame from the landing's first paint to its faces' arrival, woff2 held 1.5 s; worst line-end/bar-word |Δ| against the settled frame, <= 2 px)
// Every animation frame from the first paint through the faces' arrival (woff2 held 1.5 s so the swap lands well
// after the Desk mounts): the h1's three line ends, the lede's line ends and the bar's words, against the settled
// frame.
import { chromium } from "playwright";
const url = process.argv[2]!;
const br = await chromium.launch();
let worstAll = 0;
for (const [w, h, phone] of [[1440, 900, false], [390, 844, true]] as const) {
  const ctx = await br.newContext({ viewport: { width: w, height: h }, isMobile: phone, hasTouch: phone, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.route(/\.woff2$/, async (r) => { await new Promise((f) => setTimeout(f, 1500)); await r.continue(); });
  await page.addInitScript(() => {
    const S: any[] = ((window as any).__s = []);
    const ends = (el: Element | null) => { if (!el) return []; const r = document.createRange(); r.selectNodeContents(el); const rows: { t: number; r: number }[] = []; for (const b of r.getClientRects()) { if (b.width < 1) continue; const row = rows.find((x) => Math.abs(x.t - b.top) < b.height / 2); if (row) row.r = Math.max(row.r, b.right); else rows.push({ t: b.top, r: b.right }); } return rows.sort((a, b) => a.t - b.t).map((x) => +x.r.toFixed(1)); };
    const tick = () => {
      const d = document.documentElement, vis = (s: string) => [...document.querySelectorAll(s)].filter((e) => e.getBoundingClientRect().width > 0);
      const h1 = vis(".dk-hero h1 .dk-mask > span").flatMap((e) => ends(e));
      const sub = vis(".dk-hero .dk-sub")[0]; const subVisible = sub && getComputedStyle(sub).visibility !== "hidden" ? ends(sub) : [];
      const bar = vis(".dk .gn :is(.gg,.dk-practice-ph,.dk-menu,.dk-layer a,.dk-judge)").flatMap((e) => { const b = e.getBoundingClientRect(); return [+b.left.toFixed(1), +b.right.toFixed(1)]; });
      S.push({ t: Math.round(performance.now()), first: !!document.querySelector(".dk[data-first]"), attrs: ["data-first-face", "data-first-fit", "data-first-fit-display"].filter((a) => d.hasAttribute(a)).map((a) => a.replace("data-first-", "")).join(","), hanken: document.fonts.check('300 10px "Hanken Goose"'), archivo: document.fonts.check('400 10px "Archivo Goose"'), h1, sub: subVisible, bar });
      if (S.length < 600) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-first-fit-display") && !document.documentElement.hasAttribute("data-first-fit"), null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const S = await page.evaluate(() => (window as any).__s) as any[];
  const fin = S[S.length - 1];
  let worst = 0, at = "";
  const states = new Map<string, number>();
  for (const s of S) {
    const key = `${s.first ? "template" : "react"} attrs[${s.attrs}] faces[${s.hanken ? "H" : "-"}${s.archivo ? "A" : "-"}]`;
    states.set(key, (states.get(key) ?? 0) + 1);
    const cmp = (a: number[], b: number[]) => a.length === b.length ? Math.max(0, ...a.map((x, i) => Math.abs(x - b[i]!))) : (a.length ? 99 : 0);
    const d = Math.max(cmp(s.h1, fin.h1), s.sub.length ? cmp(s.sub, fin.sub) : 0, s.bar.length === fin.bar.length ? cmp(s.bar, fin.bar) : 0);
    if (d > worst) { worst = d; at = `${s.t} ms, ${key}`; }
  }
  worstAll = Math.max(worstAll, worst);
  console.log(`== ${w}: ${S.length} frames; states in order seen:`);
  for (const [k, n] of states) console.log(`   ${k}: ${n} frames`);
  console.log(`   worst |Δ| against the settled frame, any word: ${worst.toFixed(1)} px${at ? ` (at ${at})` : ""}`);
  await ctx.close();
}
await br.close();
console.log(`frame walk: worst ${worstAll.toFixed(1)} px ${worstAll <= 2 ? "PASS" : "FAIL"}`);

// Usage: node scripts/fit-lede-grid.ts <url>  (grid-fits the landing lede's letter- and word-spacing in its fallback face against the web face's line ends at 1440 and 390; prints the best 8)
// Grid search: letter-spacing and word-spacing on the lede in the fallback face so each line end matches the real face.
import { chromium } from "playwright";
const url = process.argv[2]!;
const LS = Array.from({ length: 41 }, (_, i) => -0.01 + i * 0.0005), WS = Array.from({ length: 41 }, (_, i) => -0.1 + i * 0.005);
const br = await chromium.launch();
const err: number[][] = LS.map(() => WS.map(() => 0));
for (const [w, h, phone] of [[1440, 900, false], [390, 844, true]] as const) {
  const page = await (await br.newContext({ viewport: { width: w, height: h }, isMobile: phone, hasTouch: phone, reducedMotion: "reduce" })).newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-first-fit") && document.fonts.check('400 16px "Archivo Goose"'));
  await page.waitForTimeout(1000);
  const e = await page.evaluate(async ([LS, WS]) => {
    const sub = document.querySelector(".dk-hero .dk-sub") as HTMLElement;
    const ends = () => { const r = document.createRange(); r.selectNodeContents(sub); const rows: { t: number; r: number }[] = []; for (const b of r.getClientRects()) { if (b.width < 1) continue; const row = rows.find((x) => Math.abs(x.t - b.top) < b.height / 2); if (row) row.r = Math.max(row.r, b.right); else rows.push({ t: b.top, r: b.right }); } return rows.sort((a, b) => a.t - b.t).map((x) => x.r); };
    const real = ends();
    sub.style.setProperty("font-family", '"Archivo Fallback"', "important");
    await document.fonts.ready;
    return LS.map((ls) => WS.map((ws) => { sub.style.letterSpacing = ls + "em"; sub.style.wordSpacing = ws + "em"; const f = ends(); return f.length !== real.length ? 99 : Math.max(...f.map((x, i) => Math.abs(x - real[i]!))); }));
  }, [LS, WS] as const);
  e.forEach((row, i) => row.forEach((v, j) => { err[i]![j] = Math.max(err[i]![j]!, v); }));
  console.log(`${w}: at (0,0) worst ${e[20]![20]!.toFixed(2)}`);
}
const best = err.flatMap((row, i) => row.map((v, j) => ({ ls: LS[i]!, ws: WS[j]!, v }))).sort((a, b) => a.v - b.v || Math.abs(a.ls) + Math.abs(a.ws) - Math.abs(b.ls) - Math.abs(b.ws)).slice(0, 8);
for (const b of best) console.log(`ls ${b.ls.toFixed(4)}em ws ${b.ws.toFixed(3)}em worst ${b.v.toFixed(2)} px`);
await br.close();

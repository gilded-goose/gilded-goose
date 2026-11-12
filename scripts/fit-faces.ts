// Usage: node scripts/fit-faces.ts <url>  (each local macOS face's width ratio to Hanken 300 per h1 line and to Archivo 400 per lede word, for choosing a fallback)
// Candidate local faces for the landing's 300 display and 400 lede: each line's width as a ratio to the real face.
import { chromium } from "playwright";
const url = process.argv[2]!;
const br = await chromium.launch();
const page = await br.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => document.fonts.check('300 40px "Hanken Goose"') && document.fonts.check('400 16px "Archivo Goose"'));
const res = await page.evaluate(async () => {
  const h1 = [...document.querySelectorAll(".dk-hero h1 .dk-mask > span")].map((s) => s.textContent!);
  const sub = document.querySelector(".dk-hero .dk-sub")!.textContent!;
  const lsH = getComputedStyle(document.querySelector(".dk-hero h1")!).letterSpacing;
  const lsS = getComputedStyle(document.querySelector(".dk-hero .dk-sub")!).letterSpacing;
  const words = sub.split(" ");
  const cands = ["HelveticaNeue-Light", "HelveticaNeue-Thin", "HelveticaNeue-UltraLight", "Helvetica-Light", "Avenir-Light", "Avenir-Book", "AvenirNext-UltraLight", "AvenirNext-Regular", "GillSans-Light", "Seravek-Light", "Seravek-ExtraLight", "Seravek", "Arial", "ArialMT", "HelveticaNeue", "Helvetica", "Avenir-Roman", "Verdana", "Tahoma", "TrebuchetMS", "Futura-Medium", "SFNS-Light", "Roboto-Light", "SegoeUI-Light", "Inter-Light", "Optima-Regular", "Lato-Light", "Kohinoor Bangla Light", "KohinoorBangla-Light", "KohinoorDevanagari-Light", "Kailasa", "Galvji", "PTSans-Regular", "Muna"];
  const c = document.createElement("canvas").getContext("2d")!;
  const out: Record<string, number[]> = {};
  const w = (font: string, t: string) => { c.font = font; return c.measureText(t).width; };
  out["REAL"] = [...h1.map((t) => w('300 100px "Hanken Goose"', t)), ...words.map((t) => w('400 100px "Archivo Goose"', t))];
  for (const n of cands) {
    const f = new FontFace("C_" + n.replace(/\W/g, ""), `local("${n}")`);
    try { await f.load(); document.fonts.add(f); } catch { continue; }
    out[n] = [...h1.map((t) => w(`100px "${f.family}"`, t)), ...words.map((t) => w(`100px "${f.family}"`, t))];
  }
  return { h1, sub, lsH, lsS, out, nh: h1.length };
});
console.log(JSON.stringify({ h1: res.h1, sub: res.sub, lsH: res.lsH, lsS: res.lsS }));
const real = res.out["REAL"]!;
for (const [n, v] of Object.entries(res.out)) {
  if (n === "REAL") continue;
  const r = v.map((x, i) => real[i]! / x);
  const h = r.slice(0, res.nh), s = r.slice(res.nh);
  const spread = (a: number[]) => (Math.max(...a) - Math.min(...a)) * 100;
  console.log(`${n.padEnd(26)} h1 ratios ${h.map((x) => x.toFixed(4)).join(" ")} spread ${spread(h).toFixed(2)}%  | lede words spread ${spread(s).toFixed(1)}% mean ${(s.reduce((a, b) => a + b) / s.length).toFixed(4)}`);
}
await br.close();

// Usage: node scripts/fit-shift.ts <url> [inject.css|-] [shots-prefix]  (NOFIT=1: no fit; BLOCKED=1: woff2 blocked) the landing's face swap: every h1/lede line end and bar word, real face vs first-paint fallback + fit, <= 2 px; prints each h1 line's suggested FIT_H1 em
// Track B session 9: the face swap on the landing, measured in one settled page: every line end of the hero's h1 and
// lede and every bar word's box, in the real faces and then in the first paint's fallbacks (the prerender's own
// data-first-face / data-first-fit attributes set on the same page, so nothing else differs). Optional CSS is injected
// (candidate @font-face rules, appended last so they win). Moved into scripts/ in B-10 (DD, B-9 ruling 2b), with the
// suggested fit: letter-spacing adds once per character, so a line n characters long at f px whose end is off by Δ px
// wants its em moved by -Δ / (n·f). The build pins the words (web/first-fit.ts); this is how to re-fit when they change.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { FIT_H1, FIT_WORDS } from "../web/first-fit.ts";
const url = process.argv[2]!;
const inject = process.argv[3] && process.argv[3] !== "-" ? readFileSync(process.argv[3], "utf8") : "";
const shots = process.argv[4];
const HIDE = `#dk-case,.dk-grain,.dk>footer,.dk-hero-copy>:not(h1):not(.dk-sub),.dk-hero-egg,.dk-hero~*,.dk-sheet,.gm-root{visibility:hidden!important}`;
const measure = () => {
  const o: Record<string, [number, number, number]> = {};
  const lines = (el: Element, key: string) => {
    const r = document.createRange(); r.selectNodeContents(el);
    const rows: { l: number; r: number; t: number }[] = [];
    for (const b of r.getClientRects()) { if (b.width < 1) continue; const row = rows.find((x) => Math.abs(x.t - b.top) < b.height / 2); if (row) { row.l = Math.min(row.l, b.left); row.r = Math.max(row.r, b.right); } else rows.push({ l: b.left, r: b.right, t: b.top }); }
    rows.sort((a, b) => a.t - b.t).forEach((x, i) => { o[`${key} ${i + 1}`] = [x.l, x.r, x.t]; });
  };
  document.querySelectorAll(".dk-hero h1 .dk-mask > span").forEach((s, i) => lines(s, `h1 span${i + 1} line`));
  const sub = document.querySelector(".dk-hero .dk-sub"); if (sub) lines(sub, "lede line");
  // "bar brand": B-11's lockup `.gg` (brand/Lockup.tsx), which replaced `.dk-brand` in every bar.
  const vis = (sel: string) => [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0);
  for (const [k, sel] of [["bar brand", ".dk .gn .gg"], ["bar practice", ".dk .gn .dk-practice-ph"], ["bar menu", ".dk .gn .dk-menu"], ["bar layer", ".dk .gn .dk-layer a"], ["bar judge", ".dk .gn .dk-judge"], ["bar rail", ".dk .gn-rail a"]] as const)
    vis(sel).forEach((e, i) => { const r = document.createRange(); r.selectNodeContents(e); const b = r.getBoundingClientRect(); o[`${k}${i ? " " + (i + 1) : ""} "${(e.textContent ?? "").trim().slice(0, 18)}"`] = [b.left, b.right, b.top]; });
  return o;
};
const br = await chromium.launch();
let worst = 0;
for (const [w, h, phone] of [[1440, 900, false], [390, 844, true]] as const) {
  const ctx = await br.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  if (process.env.NOFIT) await page.addInitScript(() => { (window as any).__nofit = 1; });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !document.querySelector(".dk[data-first]") && !document.documentElement.hasAttribute("data-first-fit") && !document.documentElement.hasAttribute("data-first-fit-display"), null, { timeout: 20000 });
  await page.waitForFunction(() => document.fonts.check('300 40px "Hanken Goose"') && document.fonts.check('400 16px "Archivo Goose"') && document.fonts.check('560 16px "Archivo Goose"'));
  await page.waitForTimeout(1500);
  await page.addStyleTag({ content: HIDE + inject });
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(200);
  const real = await page.evaluate(measure);
  if (shots) await page.screenshot({ path: `${shots}-${w}-real.png` });
  if (process.env.BLOCKED) {
    // The woff2-blocked drill (B-8's fallback frames): a second page whose faces never load, React mounted and settled.
    const p2 = await ctx.newPage(); await p2.route(/\.woff2$/, (r) => r.abort());
    await p2.goto(url, { waitUntil: "networkidle" }); await p2.waitForFunction(() => !document.querySelector(".dk[data-first]"), null, { timeout: 20000 });
    await p2.waitForTimeout(2500); await p2.addStyleTag({ content: HIDE }); await p2.waitForTimeout(200);
    console.log("   blocked page attrs:", await p2.evaluate(() => ["data-first-face", "data-first-fit", "data-first-fit-display"].filter((a) => document.documentElement.hasAttribute(a)).join(" ")));
    (globalThis as any).__fb = await p2.evaluate(measure);
    if (shots) await p2.screenshot({ path: `${shots}-${w}-fallback.png` });
  }
  if (!process.env.BLOCKED) await page.evaluate(() => { const d = document.documentElement; d.setAttribute("data-first-face", ""); if (!(window as any).__nofit) { d.setAttribute("data-first-fit", ""); d.setAttribute("data-first-fit-display", ""); } });
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(300);
  const fb = process.env.BLOCKED ? (globalThis as any).__fb : await page.evaluate(measure);
  if (shots && !process.env.BLOCKED) await page.screenshot({ path: `${shots}-${w}-fallback.png` });
  const fam = await page.evaluate(() => [getComputedStyle(document.querySelector(".dk-hero h1")!).fontFamily.split(",")[0], getComputedStyle(document.querySelector(".dk-hero .dk-sub")!).fontFamily.split(",")[0], getComputedStyle(document.querySelector(".dk-hero h1")!).fontSize, getComputedStyle(document.querySelector(".dk-hero .dk-sub")!).fontSize]);
  console.log(`== ${w} (fallback: h1 ${fam[0]} ${fam[2]}, lede ${fam[1]} ${fam[3]})`);
  for (const k of Object.keys(real)) {
    const a = real[k]!, b = fb[k];
    if (!b) { console.log(`${k}: missing in fallback`); worst = 99; continue; }
    const dl = b[0] - a[0], dr = b[1] - a[1], dt = b[2] - a[2];
    worst = Math.max(worst, Math.abs(dl), Math.abs(dr));
    console.log(`${k.padEnd(40)} real ${a[0].toFixed(1)}–${a[1].toFixed(1)}  Δstart ${dl.toFixed(1).padStart(5)}  Δend ${dr.toFixed(1).padStart(5)}  Δy ${dt.toFixed(1)}${Math.abs(dl) > 2 || Math.abs(dr) > 2 ? "  > 2 px" : ""}`);
  }
  for (const k of Object.keys(fb)) if (!real[k]) { console.log(`${k}: extra line in fallback (re-wrap)`); worst = 99; }
  if (!process.env.BLOCKED) FIT_WORDS.h1.forEach((words, i) => {
    const a = real[`h1 span${i + 1} line 1`], b = fb[`h1 span${i + 1} line 1`];
    if (!a || !b) return;
    const now = process.env.NOFIT ? 0 : parseFloat(FIT_H1[i]!), em = now - (b[1] - a[1]) / (words.length * parseFloat(fam[2]!));
    console.log(`   suggested FIT_H1[${i}] (${JSON.stringify(words)}): ${em.toFixed(4).replace(/^(-?)0\./, "$1.")}em (now ${process.env.NOFIT ? "no fit" : FIT_H1[i]})`);
  });
  await ctx.close();
}
await br.close();
console.log(`worst |Δ| ${worst.toFixed(1)} px ${worst <= 2 ? "PASS" : "FAIL"} (§5: 2 px)`);

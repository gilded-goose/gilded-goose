// Usage: MODE=desknet|phone|desktop [ONLY=/|wallet|classic|ledger] [RUNS=5] node scripts/first-screen-clock.ts [base-url]  (per-frame clock of each first screen: headline .5/.9, bar, LCP, CLS, long tasks, TTFB; brand.md §7's numbers)
/// <reference lib="dom" />
// Round 4 (Q), moved into scripts/ by Track B session 10 so brand.md §7's numbers can be re-run: first screens by a per-frame clock (nav-start relative) on desktop and the phone drill (CPU 4x, 1.6 Mbps, 150 ms).
// headline reads (eff. opacity .5) / up (.9), the bar's contents up (.9), the route's own first-screen check, LCP, CLS,
// long tasks over 8 s, console errors, opening class seen.
import { chromium } from "playwright";
const BASE = (process.argv[2] ?? "https://gilded-goose.onrender.com/").replace(/\/?$/, "/");
const RUNS = Number(process.env.RUNS ?? 5);
const ONLY = process.env.ONLY;
const MODE = process.env.MODE; // phone | desktop | desknet (1440 with 1.6 Mbps / 150 ms, no CPU throttle: B-8's emulation)
const cases = [
  { name: "desk", path: "?desk=1", head: ".dk-hero h1 .dk-mask > span", extra: "#dk-case svg" },
  { name: "wallet", path: "?wallet=1", head: "#hero-h", extra: ".dk-practice-ph" },
  { name: "classic", path: "?wallet=0", head: "h1", extra: ".dk-practice-ph" },
  { name: "ledger", path: "?desk=ledger", head: "h1", extra: "[data-row-id], .ag-row, table tbody tr, .lg-row" },
].filter((c) => !ONLY || c.name === ONLY);
const browser = await chromium.launch();
const NET = MODE === "desknet";
for (const mobile of (MODE === "phone" ? [true] : MODE === "desktop" || NET ? [false] : [true, false])) for (const c of cases) {
  const rows: any[] = [];
  for (let i = 0; i < RUNS; i++) {
    const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errs: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 120)); });
    page.on("pageerror", (e) => errs.push("pageerror " + e.message.slice(0, 120)));
    page.on("response", (r) => { if (r.status() >= 400) errs.push(`${r.status()} ${r.url()}`); });
    if (mobile || NET) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
      if (mobile) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    }
    await page.addInitScript(({ head, extra }) => {
      const w = window as any;
      w.__q = { h5: 0, h9: 0, bar9: 0, barw: 0, extra: 0, egg: 0, lit: 0, struck: 0, cross: 0, hero: 0, lcp: 0, lcpEl: "", cls: 0, lt: [] as string[], opening: false };
      const q = w.__q;
      try { new PerformanceObserver((l) => { for (const e of l.getEntries() as any) { q.lcp = Math.round(e.startTime); q.lcpEl = (e.element?.tagName ?? "") + "." + (e.element?.className?.toString?.().split(" ")[0] ?? ""); } }).observe({ type: "largest-contentful-paint", buffered: true }); } catch {}
      try { new PerformanceObserver((l) => { for (const e of l.getEntries() as any) if (!e.hadRecentInput) q.cls += e.value; }).observe({ type: "layout-shift", buffered: true }); } catch {}
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) q.lt.push(`${Math.round(e.startTime)}+${Math.round(e.duration)}`); }).observe({ type: "longtask", buffered: true }); } catch {}
      const eff = (el: Element | null) => { if (!el) return 0; const r = el.getBoundingClientRect(); if (!r.width || !r.height) return 0; if (!(el as HTMLElement).checkVisibility({ visibilityProperty: true })) return 0; let o = 1; for (let e: Element | null = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
      const tick = () => {
        const t = performance.now();
        if (!document.documentElement) { requestAnimationFrame(tick); return; }
        if (document.documentElement.classList.contains("dk-opening")) q.opening = true;
        const h = eff([...document.querySelectorAll(head)].find((e) => e.getBoundingClientRect().width > 0) ?? null);
        const bar = eff([...document.querySelectorAll(".dk-nav-in, header .gn-in, header nav")].find((e) => e.getBoundingClientRect().width > 0) ?? null);
        const x = eff([...document.querySelectorAll(extra)].find((e) => e.getBoundingClientRect().width > 0) ?? null);
        if (!q.h5 && h >= 0.5) q.h5 = Math.round(t);
        if (!q.h9 && h >= 0.9) q.h9 = Math.round(t);
        if (!q.bar9 && bar >= 0.9) q.bar9 = Math.round(t);
        if (!q.extra && x > 0) q.extra = Math.round(t);
        // the bar's words: the brand in the bar (first paint or React), opacity >= .9: B-11's lockup `.gg` (brand/Lockup.tsx),
        // which replaced `.dk-brand` in every bar
        if (!q.barw) { const bw = eff([...document.querySelectorAll(".dk-nav-in .gg, header .gg")].find((e) => e.getBoundingClientRect().width > 0) ?? null); if (bw >= 0.9) q.barw = Math.round(t); }
        // the egg's first frame (the hero's egg drawn at all) and its first lit frame (--lit > 0 or fully lit)
        const egg = document.querySelector(".dk-hero .dk-egg");
        if (!q.egg && eff(egg) > 0) q.egg = Math.round(t);
        if (!q.lit && egg) { const l = getComputedStyle(egg as HTMLElement).getPropertyValue("--lit").trim(); if ((l && Number(l) > 0) || (!(egg as HTMLElement).classList.contains("dk-lighting") && eff(egg) > 0)) q.lit = Math.round(t); }
        // the hairline over the headline's glyphs: frames where #dk-case i crosses a line's glyph run, and of those, frames with no clip on the case
        const ln = document.querySelector("#dk-case i") as HTMLElement | null, box = document.getElementById("dk-case");
        if (ln && eff(ln) > 0) { const lr = ln.getBoundingClientRect(); if (lr.width > 0) { let hit = false; for (const sp of document.querySelectorAll(".dk-hero h1 .dk-mask > span")) { if (eff(sp) < 0.05) continue; const rg = document.createRange(); rg.selectNodeContents(sp); for (const r of rg.getClientRects()) if (lr.bottom > r.top && lr.top < r.bottom && lr.right > r.left && lr.left < r.right) hit = true; } if (hit) { q.cross++; if (!box || getComputedStyle(box).clipPath === "none") q.struck++; } } }
        if (!q.hero && q.opening && !document.documentElement.classList.contains("dk-opening") && q.h9) q.hero = Math.round(t);
        if (t < 12000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { head: c.head, extra: c.extra });
    await page.goto(BASE + c.path, { waitUntil: "commit" });
    await page.waitForTimeout(8000);
    const m = await page.evaluate(() => { const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming; const q = (window as any).__q; return { ...q, cls: Number(q.cls.toFixed(3)), fcp: Math.round(performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? -1), ttfb: Math.round(n.responseStart), h1n: document.querySelectorAll("h1").length }; });
    m.tbt = m.lt.reduce((s: number, x: string) => s + Math.max(0, Number(x.split("+")[1]) - 50), 0);
    m.errs = errs.length; m.errList = [...new Set(errs)];
    rows.push(m);
    await ctx.close();
  }
  const col = (k: string) => rows.map((r) => r[k]).join(" ");
  const max = (k: string) => Math.max(...rows.map((r) => r[k]));
  console.log(`${mobile ? "phone-drill" : NET ? "desktop-net" : "desktop"} ${c.name}: head.5 [${col("h5")}] head.9 [${col("h9")}] (max ${max("h9")}) | bar.9 [${col("bar9")}] (max ${max("bar9")}) brand.9 [${col("barw")}] | egg [${col("egg")}] lit [${col("lit")}] | line-x-head [${col("cross")}] struck [${col("struck")}] | first-screen [${col("extra")}] | hero-after-opening [${col("hero")}] | lcp [${col("lcp")}] ${rows[0].lcpEl} | cls [${col("cls")}] | tbt [${col("tbt")}] lt ${rows.map((r) => "[" + r.lt.join(",") + "]").join("")} | fcp [${col("fcp")}] ttfb [${col("ttfb")}] | opening [${col("opening")}] | h1 [${col("h1n")}] | errs ${col("errs")} ${rows.flatMap((r) => r.errList).slice(0, 3).join(" / ")}`);
}
await browser.close();

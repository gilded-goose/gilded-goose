// Usage: node scripts/phone-heavy.ts <base-url> [runs=3] [path ...]  (DPR=n to change the device pixel ratio; the heavy routes on the phone drill: h1 visible, LCP, long tasks, TBT)
/// <reference lib="dom" />
// Track B session 10, from Round 4's heavy.ts: 390×844 DPR 3, 1.6 Mbps / 150 ms, CPU 4x (the PROFILE=mobile drill). The h1
// time is the first frame a `main h1` (or any h1) is visible with a height; long tasks are every PerformanceLongTaskTiming
// over 10 s, with their start; TBT is the sum of each task's time over 50 ms. Prints one line per run and the medians.
import { chromium } from "playwright";

const base = (process.argv[2] ?? "http://localhost:8821/").replace(/\/?$/, "/");
const runs = Number(process.argv[3] ?? 3);
const paths = process.argv.slice(4).length ? process.argv.slice(4) : ["?desk=haggle", "?desk=ledger"];
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]!; };
const b = await chromium.launch();
for (const path of paths) {
  const h1s: number[] = [], lcps: number[] = [], tbts: number[] = [];
  for (let i = 0; i < runs; i++) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: Number(process.env.DPR ?? 3), isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(() => {
      const w = window as any; w.__lt = []; w.__lcp = 0;
      try {
        new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: "longtask", buffered: true });
        new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__lcp = Math.round(e.startTime); }).observe({ type: "largest-contentful-paint", buffered: true });
      } catch { /* no observer */ }
      const tick = () => { const h = [...document.querySelectorAll("main h1, h1")].find((e) => (e as HTMLElement).checkVisibility({ opacityProperty: true }) && e.getBoundingClientRect().height > 0); if (h && w.__h === undefined) w.__h = Math.round(performance.now()); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    await page.goto(base + path, { waitUntil: "commit" });
    await page.waitForTimeout(10000);
    const r = await page.evaluate(() => { const w = window as any; return { h: w.__h as number, lcp: w.__lcp as number, lt: w.__lt as [number, number][] }; });
    const tbt = r.lt.reduce((s, [, d]) => s + Math.max(0, d - 50), 0);
    h1s.push(r.h ?? 99999); lcps.push(r.lcp); tbts.push(tbt);
    console.log(`  ${path} run ${i + 1}: h1 ${r.h} lcp ${r.lcp} long tasks [${r.lt.map(([t, d]) => `${d}@${t}`).join(", ")}] tbt ${tbt}`);
    await ctx.close();
  }
  console.log(`phone-drill ${path}: median h1 ${med(h1s)} lcp ${med(lcps)} tbt ${med(tbts)} (${runs} runs)`);
}
await b.close();

// The frosted bar's proof (S1-13; brand.md §10.6, the DD's ruling on Joshua's "I can read the ticket through the bar").
// Two exact strings, read from their sources (never retyped), are scrolled under the scrolled bar at 390 and 1440, DPR 1,
// with the bar's own words hidden; the luminance range over the bar's band (0-255) must be <= 4, i.e. nothing under it
// reads. Then, per frame:
//   - the scrolled bar's computed backdrop-filter is not `none`, and equals B-11's --glass-bar-blur token once it lands;
//   - a control frame with the blur stripped must read > 4 (so this probe can fail: it is what Joshua saw);
//   - a no-blur frame (prefers-reduced-transparency: reduce, emulated) must show the opaque fallback: an opaque
//     background and a range of <= 1.
// Chromium always; WebKit too when it is installed (it isn't here: reported, never downloaded).
//
// Usage: node scripts/frost.ts http://localhost:8787 [out-dir]   (writes frost.tsv and DPR-1 frames into out-dir)

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium, webkit, type Browser, type Page } from "playwright";

const base = (process.argv[2] ?? "http://localhost:8787").replace(/\/$/, "");
const out = process.argv[3] ?? "/tmp/s1-13/frost";
mkdirSync(out, { recursive: true });

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
/** The seller's item line, as the ledger's chart caption says it: moving.ts's item without its "(fictional)" tag. */
const ITEM = /item: "(A ticket to The Marsh Lights, [^"(]+?)\s*(?:\(fictional\))?"/.exec(src("core/src/sellers/moving.ts"))?.[1];
/** The moment's kicker, word for word from Moment.tsx. */
const KICKER = /className="ds-kicker">([^<]+)</.exec(src("web/src/desk/story/Moment.tsx"))?.[1];
if (!ITEM || !KICKER) throw new Error(`frost: a source string moved (item=${ITEM}, kicker=${KICKER})`);

const LIMIT = 4, CONTROL_MIN = 4, FALLBACK_MAX = 1;
const STRINGS: readonly { text: string; path: string }[] = [
  { text: ITEM, path: "/?desk=ledger" },
  { text: KICKER, path: "/" },
];
const WIDTHS: readonly [number, number][] = [[390, 844], [1440, 900]];

type Mode = "frost" | "control" | "no-blur";
interface Frame { engine: string; w: number; text: string; mode: Mode; range: number; filter: string; bg: string; token: string; ok: boolean; note: string }
const rows: Frame[] = [];
const fails: string[] = [];

/** Puts the string's first line under the middle of the scrolled bar; returns false if it isn't on the page. The
 *  drawn bar: a page can hold a 0 px twin (the first paint's markup bar) before it. */
async function under(page: Page, text: string): Promise<boolean> {
  return page.evaluate(async (t) => {
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Text | null = null;
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const el = n.parentElement;
      if (n.textContent?.includes(t) && el && !el.closest("header") && el.getClientRects().length > 0) { node = n as Text; break; }
    }
    if (!node) return false;
    const at = node.textContent!.indexOf(t);
    const r = document.createRange();
    r.setStart(node, at); r.setEnd(node, Math.min(node.length, at + 12));
    const bar = [...document.querySelectorAll<HTMLElement>("header.gn.dk-nav")].find((e) => e.getBoundingClientRect().height > 0)!;
    for (let i = 0; i < 3; i++) {
      const line = r.getBoundingClientRect(), b = bar.getBoundingClientRect();
      scrollBy({ top: line.top + line.height / 2 - (b.top + b.height / 2), behavior: "instant" });
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    }
    const line = r.getBoundingClientRect(), b = bar.getBoundingClientRect();
    return scrollY > 8 && line.top >= b.top && line.bottom <= b.bottom;
  }, text);
}

/** The luminance range (0-255) over the bar's band, its words hidden, its foot hairline left out. */
async function band(page: Page): Promise<number> {
  const b = await page.evaluate(() => { const r = [...document.querySelectorAll<HTMLElement>("header.gn.dk-nav")].find((e) => e.getBoundingClientRect().height > 0)!.getBoundingClientRect(); return { y: r.top, h: r.height, w: innerWidth }; });
  const png = await page.screenshot({ clip: { x: 0, y: Math.ceil(b.y) + 1, width: b.w, height: Math.floor(b.h) - 3 } });
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let lo = 255, hi = 0;
    for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!; if (l < lo) lo = l; if (l > hi) hi = l; }
    return Math.round((hi - lo) * 10) / 10;
  }, png.toString("base64"));
}

async function run(browser: Browser, engine: string) {
  for (const [w, h] of WIDTHS) {
    for (const s of STRINGS) {
      for (const mode of ["frost", "control", "no-blur"] as const) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: "reduce" });
        await ctx.addInitScript(() => { try { sessionStorage.setItem("gg-opened", "1"); } catch { /* the opening plays */ } });
        const page = await ctx.newPage();
        if (mode === "no-blur") {
          if (engine !== "chromium") { await ctx.close(); continue; }
          const cdp = await ctx.newCDPSession(page);
          await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
        }
        await page.goto(base + s.path, { waitUntil: "networkidle" });
        await page.waitForFunction((t) => document.body.innerText.includes(t), s.text, { timeout: 15000 }).catch(() => undefined);
        const tag = `${engine} ${w} ${mode} "${s.text.slice(0, 24)}…"`;
        if (!(await under(page, s.text))) { fails.push(`${tag}: the string is not on ${s.path} or would not sit under the bar`); await ctx.close(); continue; }
        await page.waitForTimeout(400); // the bar's own transitions settle
        const css = await page.evaluate(() => {
          const bar = [...document.querySelectorAll<HTMLElement>("header.gn.dk-nav")].find((e) => e.getBoundingClientRect().height > 0)!, cs = getComputedStyle(bar);
          const probe = document.createElement("div");
          probe.style.cssText = "position:absolute;backdrop-filter:var(--glass-bar-blur)";
          bar.appendChild(probe);
          const token = getComputedStyle(probe).backdropFilter; probe.remove();
          const raw = getComputedStyle(bar).getPropertyValue("--glass-bar-blur").trim();
          return { filter: cs.backdropFilter || (cs as unknown as Record<string, string>)["webkitBackdropFilter"] || "", bg: cs.backgroundColor, scrolled: bar.dataset["scrolled"] === "1", token: raw ? token : "" };
        });
        if (mode === "control") await page.addStyleTag({ content: "header.gn.dk-nav[data-scrolled] { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }" });
        await page.addStyleTag({ content: "header.gn.dk-nav > * { visibility: hidden !important; }" });
        await page.waitForTimeout(100);
        const range = await band(page);
        const name = `${engine}-${w}-${mode}-${s.path === "/" ? "kicker" : "item"}`;
        await page.screenshot({ path: `${out}/${name}-band.png`, clip: { x: 0, y: 0, width: w, height: 80 } });
        await page.addStyleTag({ content: "header.gn.dk-nav > * { visibility: visible !important; }" });
        if (mode === "frost") await page.screenshot({ path: `${out}/${name}.png` });
        let ok = css.scrolled, note = css.scrolled ? "" : "bar not marked scrolled";
        if (mode === "frost") {
          if (range > LIMIT) { ok = false; note = `range ${range} > ${LIMIT}: the line under the bar reads`; }
          if (!css.filter || css.filter === "none") { ok = false; note += " backdrop-filter is none"; }
          if (css.token && css.token !== css.filter) { ok = false; note += ` the bar's blur (${css.filter}) is not B-11's --glass-bar-blur (${css.token})`; }
        } else if (mode === "control") {
          if (range <= CONTROL_MIN) { ok = false; note = `control read only ${range}: the probe could not tell a missing blur`; }
          else note = `blur stripped: ${range}, which the frost frame would FAIL (the probe can fail)`;
        } else {
          const opaque = /rgb\(|rgba\([^)]*,\s*1\)/.test(css.bg) && !/,\s*0?\.\d+\)$/.test(css.bg);
          if (!opaque || range > FALLBACK_MAX) { ok = false; note = `fallback not opaque (${css.bg}) or range ${range} > ${FALLBACK_MAX}`; }
          else note = "reduced transparency: opaque --page-solid";
        }
        rows.push({ engine, w, text: s.text, mode, range, filter: css.filter, bg: css.bg, token: css.token || "(B-11's token not landed)", ok, note });
        if (!ok) fails.push(`${tag}: ${note}`);
        await ctx.close();
      }
    }
  }
}

const chrome = await chromium.launch();
await run(chrome, "chromium");
await chrome.close();
let wk = "WebKit: not installed here (never downloaded by this probe); run `npx playwright install webkit` where allowed";
try { const b = await webkit.launch(); await run(b, "webkit"); await b.close(); wk = "WebKit: ran"; } catch { /* not installed */ }

const tsv = ["engine\twidth\tstring\tmode\trange\tbackdrop-filter\tbackground\ttoken\tok\tnote",
  ...rows.map((r) => [r.engine, r.w, r.text, r.mode, r.range, r.filter, r.bg, r.token, r.ok ? "OK" : "FAIL", r.note].join("\t"))].join("\n");
writeFileSync(`${out}/frost.tsv`, tsv + "\n");
console.log(tsv);
console.log(wk);
if (fails.length) { console.error(`frost: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
console.log(`frost: OK (${rows.length} frames: Chromium at 390 and 1440, frost <= ${LIMIT}, control > ${CONTROL_MIN}, no-blur opaque)`);

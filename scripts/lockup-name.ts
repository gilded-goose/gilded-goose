// The lockup's name, its pixels and axe (S1-13, Q's round 4 sys-pages run: label-content-name-mismatch, WCAG 2.5.3).
// The lockup read "GildedGose" to axe (the spacer had no text and the egg's o was aria-hidden), so its visible text
// wasn't in its name "Gilded Goose". The fix puts a real space and a real, transparent "o" under the egg. This probe:
//   - on every route that draws a lockup, at 1440 and 390, in each room's scheme (and Velvet and Midnight where a page
//     takes ?palette): the lockup's visible text (axe's own subtree reading: aria-hidden dropped) must be "Gilded Goose";
//     axe, scoped to the lockup, must find 0 violations (label-content-name-mismatch among them);
//   - one-nav's numbers for each (box, font size, egg box), and a still of the bar and one of the lockup (DPR 1);
//   - with BEFORE=<dir of an earlier run>, each lockup still is diffed pixel by pixel against that run's: 0 must change,
//     and the numbers must match;
//   - forced colours (Windows High Contrast, emulated): the hidden o stays transparent, so it never paints over the egg;
//   - the egg's box never holds more than it shows (overflow.ts's rule, Nov 6: the bar's tracking widened the hidden o
//     past .o's fixed width), with a red control on the desk that hands the o the bar's tracking back.
// Usage: AXE=/path/axe.min.js [BEFORE=dir] node scripts/lockup-name.ts [base] [out]
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { chromium, type Page } from "playwright";

const base = (process.argv[2] ?? "http://localhost:4187").replace(/\/$/, "");
const out = process.argv[3] ?? "/tmp/s1-13/lockup";
const BEFORE = process.env.BEFORE;
const AXE = process.env.AXE;
mkdirSync(out, { recursive: true });

/** [name, address]. The bar pages in their room's own scheme; system and how in both (each takes ?palette). */
const ROUTES: readonly [string, string][] = [
  ["desk", "/?desk=1"], ["ledger", "/?desk=ledger"], ["proof", "/?desk=proof"], ["haggle", "/?desk=haggle"], ["tour", "/?desk=tour"],
  ["how-midnight", "/?desk=how"], ["how-velvet", "/?desk=how&palette=v"],
  ["system-velvet", "/?desk=system"], ["system-midnight", "/?desk=system&palette=midnight"],
  ["wallet", "/?wallet=1"], ["classic", "/?wallet=0"], ["market", "/?market=1"],
  ["safe", "/safe.html"], ["404", "/404.html"], ["voice-test-2", "/voice-test-2.html"],
];
const SIZES = [[1440, 900], [390, 844]] as const;

const rows: string[] = [];
const fails: string[] = [];
const browser = await chromium.launch();
const axeSrc = AXE && AXE !== "0" ? readFileSync(AXE, "utf8") : null;

async function read(page: Page) {
  return page.evaluate(() => {
    const all = [...document.querySelectorAll<HTMLElement>("a.gg")].filter((a) => a.getClientRects().length > 0 && !a.closest(".sys-spec"));
    const a = all[0];
    if (!a) return null;
    // axe's subtree text: text nodes, skipping anything aria-hidden.
    const vis = (n: Node): string => n.nodeType === 3 ? n.textContent ?? "" : n instanceof Element && n.getAttribute("aria-hidden") === "true" ? "" : [...n.childNodes].map(vis).join("");
    const r = a.getBoundingClientRect(), cs = getComputedStyle(a);
    const egg = a.querySelector(".o")!.getBoundingClientRect();
    const svg = a.querySelector(".o svg")!.getBoundingClientRect();
    const oc = a.querySelector<HTMLElement>(".oc");
    const o = a.querySelector<HTMLElement>(".o")!;
    const bar = a.closest("header")?.getBoundingClientRect();
    return {
      text: vis(a).replace(/\s+/g, " ").trim(), label: a.getAttribute("aria-label"), count: all.length,
      box: `${Math.round(r.width)}x${Math.round(r.height)}`, size: cs.fontSize, egg: `${Math.round(egg.width)}x${Math.round(egg.height)}`,
      exact: [r.x, r.y, r.width, r.height, svg.x, svg.y, svg.width, svg.height].map((v) => v.toFixed(2)).join(","),
      clip: { x: Math.max(0, Math.floor(r.x) - 6), y: Math.max(0, Math.floor(r.y) - 6), width: Math.ceil(r.width) + 12, height: Math.ceil(r.height) + 12 },
      bar: bar ? { x: 0, y: Math.max(0, Math.floor(bar.y)), width: innerWidth, height: Math.ceil(bar.height) } : null,
      oc: oc ? getComputedStyle(oc).color : "none",
      spill: o.scrollWidth - o.clientWidth,
    };
  });
}

/** Pixels that differ between two PNGs, counted in a page's canvas. */
async function diff(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(async ([x, y]) => {
    const load = (s: string) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = `data:image/png;base64,${s}`; });
    const [p, q] = await Promise.all([load(x), load(y)]);
    if (p.width !== q.width || p.height !== q.height) return -1;
    const px = (i: HTMLImageElement) => { const c = document.createElement("canvas"); c.width = i.width; c.height = i.height; const g = c.getContext("2d")!; g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
    const d1 = px(p), d2 = px(q);
    let n = 0;
    for (let k = 0; k < d1.length; k += 4) if (d1[k] !== d2[k] || d1[k + 1] !== d2[k + 1] || d1[k + 2] !== d2[k + 2] || d1[k + 3] !== d2[k + 3]) n++;
    return n;
  }, [a.toString("base64"), b.toString("base64")] as const);
}

const meta: Record<string, string> = {};
const prev: Record<string, string> = BEFORE && existsSync(`${BEFORE}/lockup.json`) ? JSON.parse(readFileSync(`${BEFORE}/lockup.json`, "utf8")) : {};
for (const forced of [false, true]) for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ bypassCSP: true, viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: "reduce", ...(forced ? { forcedColors: "active" as const } : {}) });
  await ctx.addInitScript(() => { try { sessionStorage.setItem("gg-opened", "1"); } catch { /* fine */ } });
  const page = await ctx.newPage();
  const scratch = await ctx.newPage();
  for (const [name, path] of forced ? ROUTES.filter(([n]) => n === "desk" || n === "safe") : ROUTES) {
    const tag = `${name}-${w}${forced ? "-forced" : ""}`;
    await page.goto(base + path, { waitUntil: "load" });
    await page.waitForTimeout(1800);
    const L = await read(page);
    if (!L) { rows.push(`${tag}\tno lockup drawn`); continue; }
    if (L.text !== "Gilded Goose") fails.push(`${tag}: the lockup's visible text reads "${L.text}", not "Gilded Goose"`);
    if (L.label !== "Gilded Goose") fails.push(`${tag}: its name is "${L.label}"`);
    if (L.spill > 1) fails.push(`${tag}: the egg's box .o holds ${L.spill}px more than it shows (scripts/overflow.ts would fail it)`);
    if (tag === "desk-1440") {
      // red control: the bar's tracking on the hidden o must spill, or this measure proves nothing
      await page.addStyleTag({ content: ".gg .oc { letter-spacing: inherit !important; }" });
      const red = (await read(page))!.spill;
      if (red <= 1) fails.push(`${tag}: the spill control read ${red}px with the o tracked, so the measure is unproven`);
      await page.goto(base + path, { waitUntil: "load" });
      await page.waitForTimeout(1800);
    }
    let ax = "axe skipped";
    if (axeSrc && !forced) {
      await page.addScriptTag({ content: axeSrc });
      const v = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (c: object, o: object) => Promise<{ violations: { id: string; nodes: unknown[] }[] }> } }).axe;
        const r = await axe.run({ include: [["a.gg"]] }, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] }, resultTypes: ["violations"] });
        return r.violations.map((x) => `${x.id}(${x.nodes.length})`);
      });
      ax = v.length ? `axe ${v.join(" ")}` : "axe 0";
      if (v.length) fails.push(`${tag}: axe on the lockup: ${v.join(" ")}`);
    }
    const shot = await page.screenshot({ clip: L.clip });
    writeFileSync(`${out}/${tag}-lockup.png`, shot);
    if (L.bar && !forced) writeFileSync(`${out}/${tag}-bar.png`, await page.screenshot({ clip: L.bar }));
    meta[tag] = `${L.box} ${L.size} egg ${L.egg} @ ${L.exact}`;
    let px = "no before";
    if (BEFORE && existsSync(`${BEFORE}/${tag}-lockup.png`)) {
      const n = await diff(scratch, readFileSync(`${BEFORE}/${tag}-lockup.png`), shot);
      px = n === -1 ? "size changed" : `${n} px changed`;
      if (n !== 0) fails.push(`${tag}: the lockup's pixels moved against the before run (${px})`);
      if (prev[tag] && prev[tag] !== meta[tag]) fails.push(`${tag}: its numbers moved: ${prev[tag]} → ${meta[tag]}`);
    }
    if (forced) {
      // The forced-colours guard's own red control: without `forced-color-adjust: none` the o must show.
      await page.addStyleTag({ content: ".gg .oc { forced-color-adjust: auto !important; }" });
      await page.waitForTimeout(600);
      const n = await diff(scratch, shot, await page.screenshot({ clip: L.clip }));
      px += `; without the guard ${n} px change${n > 0 ? " (red, as it must be)" : ""}`;
      if (n === 0) fails.push(`${tag}: the forced-colours control read clear, so the guard is unproven`);
    }
    rows.push([tag, `"${L.text}"`, `lockup ${L.box} ${L.size} egg ${L.egg}`, `o ${L.oc}`, `spill ${L.spill}`, ax, px].join("\t"));
  }
  await ctx.close();
}
await browser.close();
writeFileSync(`${out}/lockup.json`, JSON.stringify(meta, null, 1));
writeFileSync(`${out}/lockup.tsv`, [...rows, ...fails].join("\n") + "\n");
console.log(rows.join("\n"));
if (fails.length) { console.error(`lockup-name: FAIL (${fails.length})\n  ${fails.join("\n  ")}`); process.exit(1); }
console.log("lockup-name: OK");

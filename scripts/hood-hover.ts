// Under the hood's AG Studio pivot, hovered and focused (W2, Wed Nov 11): the film's capture rig found that hovering any
// pivot row painted it near-black (#221b1f), because board.css gave the white site's light value to every --lx-* name
// but --lx-hover, so AG's gridRowHoverColor fell through to midnight.css's dark :root. Computed backgrounds can't see
// it (AG paints the hover on each cell's ::before from --ag-internal-row-overlay-color), so this walk reads the pixels:
// it hovers a pivot row, then focuses one by keyboard, at 1440 and 390, samples the row's painted background from a
// screenshot, and fails if it isn't light (luminance >= 0.75) or the row's text on it is under 4.5:1. axe's
// color-contrast runs on the pivot with the row hovered. Needs the Studio build (ci-local's rehearsal: GOOSE_FLIP_REHEARSAL=1).
//
//   node scripts/hood-hover.ts <base>      (ci-local passes its Studio server)

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium, type Page } from "playwright";

if (!process.argv[2]) { console.error("usage: node scripts/hood-hover.ts <base>"); process.exit(2); }
const BASE = process.argv[2].replace(/\/$/, "");
let misses = 0;
const check = (ok: boolean, what: string) => { if (!ok) misses++; console.log(`${ok ? "ok  " : "FAIL"} ${what}`); };

type RGB = [number, number, number];
const lum = ([r, g, b]: RGB) => {
  const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: RGB, b: RGB) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number]; return (x + 0.05) / (y + 0.05); };

/** The painted colour at (x, y) of the viewport, read from a real screenshot (decoded by the page's own canvas). */
async function pixel(page: Page, x: number, y: number): Promise<RGB> {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  return page.evaluate(async (b64) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement("canvas"); c.width = c.height = 1;
    const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0]!, d[1]!, d[2]!] as [number, number, number];
  }, png.toString("base64"));
}

/** The row's first cell's text colour, composited over the painted background (AG's ink carries alpha). */
async function ink(page: Page, sel: string, bg: RGB): Promise<RGB> {
  const c = await page.evaluate((sel) => {
    const cell = document.querySelector(sel)!.querySelector(".ag-cell")!;
    const probe = document.createElement("canvas").getContext("2d")!;
    probe.fillStyle = "#000"; probe.fillStyle = getComputedStyle(cell).color; // canvas normalizes color(srgb …) and rgb()
    probe.fillRect(0, 0, 1, 1); const d = probe.getImageData(0, 0, 1, 1).data; return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
  }, sel);
  const a = c[3]!;
  return [0, 1, 2].map((i) => Math.round(c[i]! * a + bg[i]! * (1 - a))) as RGB;
}

async function walk(width: number, height: number) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce", bypassCSP: true }); // axe goes in inline
  await page.goto(`${BASE}/#/under-the-hood`, { waitUntil: "load" });
  const grid = ".ag-studio-pivot-grid-widget";
  await page.waitForSelector(`${grid} .ag-row`, { timeout: 30_000 });
  const rowSel = `${grid} .ag-center-cols-viewport .ag-row[row-index="1"], ${grid} .ag-row[row-index="1"]`;
  await page.locator(rowSel).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const box = (await page.locator(rowSel).first().boundingBox())!;
  // A spot in the row with no text: just right of the row's middle, half way down.
  const spot = { x: Math.round(box.x + box.width * 0.55), y: Math.round(box.y + box.height / 2) };
  const rest = await pixel(page, spot.x, spot.y);

  for (const how of ["hover", "keyboard focus"] as const) {
    if (how === "hover") await page.mouse.move(spot.x, spot.y);
    else {
      await page.mouse.move(1, 1);
      await page.locator(`${rowSel} .ag-cell`).first().focus();
      await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowUp");
    }
    await page.waitForTimeout(300);
    const bg = await pixel(page, spot.x, spot.y);
    const text = await ink(page, rowSel, bg);
    const ratio = contrast(bg, text);
    check(lum(bg) >= 0.75, `${width}: a pivot row on ${how} paints light (rgb ${bg.join(",")}, luminance ${lum(bg).toFixed(2)}; at rest rgb ${rest.join(",")})`);
    check(ratio >= 4.5, `${width}: the row's words on ${how} read at ${ratio.toFixed(1)}:1 (line 4.5)`);
  }

  // axe's colour contrast on the pivot with a row hovered.
  let src: string | null = null;
  try { src = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8"); } catch { /* below */ }
  if (src) {
    await page.mouse.move(spot.x, spot.y); await page.waitForTimeout(200);
    await page.addScriptTag({ content: src });
    const bad = await page.evaluate(async (grid) => {
      const axe = (window as unknown as { axe: { run: (c: Element, o: object) => Promise<{ violations: { id: string; nodes: unknown[] }[] }> } }).axe;
      const r = await axe.run(document.querySelector(grid)!, { runOnly: { type: "rule", values: ["color-contrast"] }, resultTypes: ["violations"] });
      return r.violations.reduce((n, v) => n + v.nodes.length, 0);
    }, grid);
    check(bad === 0, `${width}: axe color-contrast on the hovered pivot: ${bad} nodes`);
  } else check(false, "axe-core isn't installed here");
  // axe can't see this bug (AG's hover is a ::before overlay it doesn't read), so the pixel checks above are the gate.
  // midnight.css stays loaded once the board has drawn: its :root color-scheme: dark must not follow her home.
  await page.evaluate(() => { location.hash = "#/"; });
  await page.waitForTimeout(800);
  const scheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  check(scheme === "light", `${width}: home after Under the hood keeps color-scheme light (${scheme})`);
  await browser.close();
}

await walk(1440, 900);
await walk(390, 844);
console.log(misses ? `hood-hover: ${misses} FAIL` : "hood-hover: PASS");
process.exit(misses ? 1 : 0);

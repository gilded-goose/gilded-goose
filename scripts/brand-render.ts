// The brand's rendered files (brand.md §10.1, §10.8; Track B-11), from the same sources the site uses: the lockup's
// sheet (web/src/brand/lockup.css), the vector egg (web/src/brand/egg.ts), the egg still (web/public/brand/egg-1500.png,
// scripts/egg-still.ts) and the site's two faces. Re-run it whenever the still, the lockup or the headline changes.
//
//   node scripts/brand-render.ts         web/public/og/share.png (1200×630, the share card), web/public/favicon.svg (the
//                                        vector egg alone), web/public/favicon.ico (its 32×32 render), web/public/
//                                        apple-touch-icon.png (180×180: the egg 120 px tall on Velvet), and the video's end
//                                        card, docs/video/track-b11/end-card.png (1920×1080; gitignored)
//
// DPR 1, the full Chromium (no GPU needed: nothing here is WebGL). Fonts come from web/node_modules (the same woff2 files
// tokens.css loads), so the card is set in the faces the site is.
import { chromium } from "playwright";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EGG_SYMBOL, FAVICON_SVG } from "../web/src/brand/egg.ts";
import { lockupHtml } from "../web/src/brand/lockup-html.ts";
import { SHARE } from "../web/src/brand/meta.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const PUB = join(ROOT, "web/public");
const fileUrl = (p: string) => "file://" + join(ROOT, p);
const VELVET = "#2c1520", INK = "#f4eadc", INK2 = "#cdb9b5", INK3 = "#b49f9c";

const fonts = `
@font-face { font-family: "Archivo Goose"; font-weight: 100 900; font-stretch: 62% 125%; src: url("${fileUrl("web/node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2")}") format("woff2-variations"); }
@font-face { font-family: "Hanken Goose"; font-weight: 100 900; src: url("${fileUrl("web/node_modules/@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2")}") format("woff2-variations"); }
:root { --face: "Archivo Goose", system-ui, sans-serif; --display: "Hanken Goose", system-ui, sans-serif; --mark-face: var(--display); --mark-w: 400; --mark-track: -.02em; --ink: ${INK}; }
* { box-sizing: border-box; } html, body { margin: 0; background: transparent; -webkit-font-smoothing: antialiased; }
${readFileSync(join(ROOT, "web/src/brand/lockup.css"), "utf8")}`;

/** §10.8, to the pixel: the lockup 40 px at (72, 64); the headline 300 80px/1, -.03em, 600 wide, its top at 214; the
 *  practice line 22 px --ink-2 at 72 from the left and 64 from the bottom; the egg still's canvas 360 wide at (700, 52),
 *  a floor shadow 180×18 at (790, 560), and the egg's light 520×440 centred at (880, 300). */
const share = `<div id="card" style="position:relative;width:1200px;height:630px;overflow:hidden;background:${VELVET}">
  <div style="position:absolute;inset:0;background:radial-gradient(520px 440px at 880px 300px, rgba(227,186,106,.16), rgba(227,186,106,.11) 18%, rgba(227,186,106,.07) 36%, rgba(227,186,106,.035) 56%, rgba(227,186,106,.01) 78%, rgba(227,186,106,0) 100%)"></div>
  <div style="position:absolute;left:72px;top:64px">${lockupHtml("#", "share")}</div>
  <h1 style="position:absolute;left:72px;top:214px;margin:0;width:600px;font:300 80px/1 var(--display);letter-spacing:-.03em;color:${INK};text-wrap:balance">${SHARE.headline}</h1>
  <p style="position:absolute;left:72px;bottom:64px;margin:0;font:400 22px/1.4 var(--face);color:${INK2}">Practice only: no real money.</p>
  <span style="position:absolute;left:790px;top:560px;width:180px;height:18px;border-radius:50%;background:rgba(10,3,7,.6);filter:blur(10px)"></span>
  <img src="${fileUrl("web/public/brand/egg-1500.png")}" alt="" style="position:absolute;left:700px;top:52px;width:360px;height:auto">
</div>`;

/** The video's end card (the DD's share.html): the lockup 96 px at weight 300, the headline, the address, on Velvet. */
const end = `<div id="card" style="position:relative;width:1920px;height:1080px;overflow:hidden;background:${VELVET};display:grid;place-items:center">
  <div style="position:absolute;inset:0;background:radial-gradient(900px 700px at 50% 40%, rgba(227,186,106,.13), rgba(227,186,106,.08) 25%, rgba(227,186,106,.04) 50%, rgba(227,186,106,.012) 78%, rgba(227,186,106,0) 100%)"></div>
  <div style="position:relative;display:grid;justify-items:center;gap:40px;text-align:center">
    ${lockupHtml("#", "end")}
    <p style="margin:0;font:300 40px/1.2 var(--display);letter-spacing:-.016em;color:${INK2}">${SHARE.headline}</p>
    <p style="margin:24px 0 0;font:400 24px/1.4 var(--face);color:${INK3};letter-spacing:.01em">gilded-goose.onrender.com</p>
  </div>
</div>`;

/** The vector egg alone, h px tall, centred in a size×size square on `bg` (or transparent). */
const icon = (size: number, h: number, bg?: string) => `<div id="card" style="width:${size}px;height:${size}px;display:grid;place-items:center;background:${bg ?? "transparent"}">
  <svg style="height:${h}px;width:${(h * 15.2) / 18.8}px;overflow:visible"><use href="#ggEgg"/></svg></div>`;

/** A PNG inside an .ico (every browser since 2007 reads a PNG entry), so the 32×32 render keeps its alpha exactly. */
function ico(png: Buffer, size: number): Buffer {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4); // reserved, type icon, one image
  head.writeUInt8(size, 6); head.writeUInt8(size, 7); head.writeUInt8(0, 8); head.writeUInt8(0, 9);
  head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
  return Buffer.concat([head, png]);
}

const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
const dir = mkdtempSync(join(tmpdir(), "b11-brand-"));
try {
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage();
  const shot = async (body: string, transparent = false): Promise<Buffer> => {
    const f = join(dir, "card.html");
    writeFileSync(f, `<!doctype html><meta charset="utf-8"><style>${fonts}</style><body>${EGG_SYMBOL}${body}</body>`);
    await page.goto("file://" + f);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => i.decode()));
      // A card with words must be set in both faces, never a fallback nobody notices (an icon has no words).
      const faces = new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "")));
      if (document.body.innerText.trim() && !(faces.has("Hanken Goose") && faces.has("Archivo Goose"))) throw new Error(`faces loaded: ${[...faces].join(", ") || "none"}`);
    });
    return page.locator("#card").screenshot({ omitBackground: transparent });
  };
  mkdirSync(join(PUB, "og"), { recursive: true });
  writeFileSync(join(PUB, "og/share.png"), await shot(share));
  // §10.8 (the DD, gate-log ~06:05): the headline sets in two lines at 300 80px/1 inside its 600 px box, and its second
  // line clears the 64 px safe margin and the practice line under it. Measured on the card as rendered, not assumed.
  const fit = await page.evaluate(() => {
    const h = document.querySelector("#card h1")!.getBoundingClientRect(), p = document.querySelector("#card p")!.getBoundingClientRect();
    const r = document.createRange(); r.selectNodeContents(document.querySelector("#card h1")!);
    const lines = new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size;
    return { lines, bottom: Math.round(h.bottom), right: Math.round(h.right), practiceTop: Math.round(p.top) };
  });
  console.log(`share headline: ${fit.lines} lines, bottom ${fit.bottom} px (safe limit ${630 - 64}, practice line at ${fit.practiceTop}), right ${fit.right} px`);
  if (fit.lines !== 2 || fit.bottom > 630 - 64 || fit.bottom > fit.practiceTop - 24 || fit.right > 72 + 600) { console.error("brand-render FAIL: the share headline must set in two lines inside 72..672 px and clear the 64 px margin and the practice line by 24 px (§10.8)"); process.exitCode = 1; }
  writeFileSync(join(PUB, "favicon.svg"), FAVICON_SVG);
  writeFileSync(join(PUB, "favicon.ico"), ico(await shot(icon(32, 30), true), 32));
  writeFileSync(join(PUB, "apple-touch-icon.png"), await shot(icon(180, 120, VELVET)));
  const vid = join(ROOT, "docs/video/track-b11");
  mkdirSync(vid, { recursive: true });
  writeFileSync(join(vid, "end-card.png"), await shot(end));
  for (const f of ["og/share.png", "favicon.svg", "favicon.ico", "apple-touch-icon.png"]) console.log(`wrote web/public/${f} (${(statSync(join(PUB, f)).size / 1024).toFixed(1)} KB)`);
  console.log("wrote docs/video/track-b11/end-card.png");
  if (statSync(join(PUB, "og/share.png")).size > 300 * 1024) { console.error("brand-render FAIL: share.png is over 300 KB (§10.8)"); process.exitCode = 1; }
} finally { rmSync(dir, { recursive: true, force: true }); await browser.close(); }

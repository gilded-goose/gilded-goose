// The egg's one hero still, and its loop for the video (brand.md §10.2, Track B-11). Both are rendered by eggThree.ts
// itself (the live egg's own module, served to a real-GPU Chromium with its types stripped): the same geometry, gold,
// camera and studio, so the still and the live egg are one object.
//
//   node scripts/egg-still.ts            the still: web/public/brand/egg-1500.png (1500×1800 master, alpha) and its
//                                        webp derivatives egg-1200.webp and egg-600.webp, written only once the measure
//                                        of its lower half passes (below the equator the body reads gold)
//   node scripts/egg-still.ts --measure [preview.png]   the measure only (and a 600-wide preview), nothing shipped
//   node scripts/egg-still.ts --as-is --measure          the same, from eggThree.ts's studio exactly as it is (no LIFT)
//   node scripts/egg-still.ts --desk     the Desk's first-paint still, web/src/desk/egg.webp (600×720, alpha): the
//                                        live egg's resting pose (glow 0, Egg.tsx's draw at the top of the page), drawn
//                                        at 1500×1800 and downscaled, so the still the live egg fades in over is its light
//   node scripts/egg-still.ts --loop [out-dir]   the 5 s loop (150 frames at 30 fps, `spin` stepping 2π/150, so frame
//                                        150 is frame 0): 1920×1080 and 1080×1080 on Velvet, the egg 640 px tall at the
//                                        centre. webm (VP9) through Playwright's bundled ffmpeg; mp4 (H.264) through
//                                        macOS's own encoder (scripts/brand/h264.swift). Default out-dir: docs/video/track-b11/
//                                        (gitignored: the loop is for the video and the end card, never the site).
//
// Port 4188 (Track B-11's). The still's pose is the hero's resting pose (Egg.tsx: yaw 0, pitch 0, spin = scrollY × .0016
// = 0 at the top) with glow 1, as §10.2 specifies. The loop keeps glow 0: the resting egg, only the studio light turning.
import { chromium, type Page } from "playwright";
import { createServer, type Server } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { lifted } from "./brand/lift.ts"; // §10.2's lift of the studio light, until eggThree.ts carries it (Needs from DK)

const ROOT = new URL("..", import.meta.url).pathname;
const PORT = Number(process.env.EGG_PORT) || 4188; // EGG_PORT: another track renders on its own port
const OUT = join(ROOT, "web/public/brand");
const VELVET = "#2c1520";
const lumaOf = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
/** §10.2: the body below the equator reads gold, "#b98a1c or lighter". */
export const FLOOR = { hex: "#b98a1c", luma: lumaOf(0xb9, 0x8a, 0x1c) };
export const POSE = { yaw: 0, pitch: 0, spin: 0, glow: 1 } as const;

const AS_IS = process.argv.includes("--as-is");
let liftNote = "";

/** A page that imports the live egg's own module: eggThree.ts and gl.ts with their types stripped, three from the pinned
 *  package (web/node_modules/three), nothing else. */
function serve(): Promise<Server> {
  const page = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/three.module.js"}}</script><body></body>`;
  const srv = createServer((req, res) => {
    const u = new URL(req.url ?? "/", `http://localhost:${PORT}`).pathname;
    try {
      if (u === "/") { res.writeHead(200, { "content-type": "text/html" }); res.end(page); return; }
      if (u === "/three.module.js") { res.writeHead(200, { "content-type": "text/javascript" }); res.end(readFileSync(join(ROOT, "web/node_modules/three/build/three.module.js"))); return; }
      const m = /^\/src\/desk\/(eggThree|gl)\.ts$/.exec(u);
      if (m) {
        let src = readFileSync(join(ROOT, "web/src/desk", `${m[1]}.ts`), "utf8");
        if (m[1] === "eggThree" && !AS_IS) {
          const l = lifted(src);
          src = l.src;
          liftNote = l.applied ? `LIFT applied to ${l.applied} studio box(es) (eggThree.ts doesn't carry it yet: Needs from DK)` : "eggThree.ts already carries LIFT";
        } else if (m[1] === "eggThree") liftNote = "as-is: eggThree.ts's studio unchanged";
        const js = stripTypeScriptTypes(src);
        res.writeHead(200, { "content-type": "text/javascript" }); res.end(js); return;
      }
    } catch (e) { res.writeHead(500); res.end(String(e)); return; }
    res.writeHead(404); res.end();
  });
  return new Promise((ok) => srv.listen(PORT, "127.0.0.1", () => ok(srv)));
}

/** Mounts the live egg on a w×h canvas at DPR 1 (maxDpr 1) and refuses software GL (gl.ts): a still from SwiftShader is
 *  not the object a visitor's GPU draws. */
async function mount(page: Page, w: number, h: number): Promise<string> {
  return page.evaluate(async ({ w, h }) => {
    const { mountEgg } = await import("/src/desk/eggThree.ts" as string);
    const c = document.createElement("canvas");
    c.style.width = `${w}px`; c.style.height = `${h}px`;
    document.body.append(c);
    const gl = c.getContext("webgl2", { alpha: true, antialias: true, powerPreference: "low-power", preserveDrawingBuffer: true }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error("no WebGL2");
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    const egg = await mountEgg(c, 1, gl);
    if (!egg) throw new Error(`the egg would not mount on ${renderer} (software GL is refused by gl.ts)`);
    Object.assign(window, { egg, cv: c });
    return renderer;
  }, { w, h });
}

const draw = (page: Page, spin: number, glow: number) => page.evaluate(({ spin, glow }) => {
  (window as unknown as { egg: { draw(p: object): void } }).egg.draw({ yaw: 0, pitch: 0, spin, glow });
}, { spin, glow });

/** The canvas as an encoded image (PNG keeps the alpha; webp at quality q keeps it too), optionally w wide. */
const encode = (page: Page, type: string, q: number | undefined, w?: number) => page.evaluate(async ({ type, q, w }) => {
  const src = (window as unknown as { cv: HTMLCanvasElement }).cv;
  let c = src;
  if (w && w !== src.width) {
    // A high-quality downscale in steps of at most 2x, so the gold's highlight edges stay clean.
    let cur: HTMLCanvasElement = src;
    while (cur.width / 2 > w) {
      const n = document.createElement("canvas"); n.width = Math.round(cur.width / 2); n.height = Math.round(cur.height / 2);
      const x = n.getContext("2d")!; x.imageSmoothingQuality = "high"; x.drawImage(cur, 0, 0, n.width, n.height); cur = n;
    }
    const n = document.createElement("canvas"); n.width = w; n.height = Math.round(src.height * w / src.width);
    const x = n.getContext("2d")!; x.imageSmoothingQuality = "high"; x.drawImage(cur, 0, 0, n.width, n.height); c = n;
  }
  // A data URL, not a Blob: headless Chromium backs a large Blob with a file it then can't read back (NotReadableError).
  return c.toDataURL(type, q).split(",")[1]!;
}, { type, q, w }).then((b64) => Buffer.from(b64, "base64"));

export type EggMeasure = { box: { x: number; y: number; w: number; h: number }; darkest: string; darkestLuma: number; p50: string; p50Luma: number; gold: boolean };
/** The lower half: inside the egg's silhouette, below its equator, the middle 70% of each row (the body, where the front
 *  fill and the "dark door" reflect; the outer 15% each side is the rim and the modelling shadow, which stay dark on any
 *  polished metal). It "reads gold" when its median is at least #b98a1c's luma; its 2nd percentile is reported too. */
const measure = (page: Page): Promise<EggMeasure> => page.evaluate((floorLuma) => {
  const src = (window as unknown as { cv: HTMLCanvasElement }).cv;
  const c = document.createElement("canvas"); c.width = src.width; c.height = src.height;
  const x = c.getContext("2d")!; x.drawImage(src, 0, 0);
  const { data, width, height } = x.getImageData(0, 0, c.width, c.height);
  let x0 = width, x1 = 0, y0 = height, y1 = 0;
  for (let y = 0; y < height; y++) for (let i = 0; i < width; i++) if (data[(y * width + i) * 4 + 3]! > 250) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const eq = (y0 + y1) / 2, foot = (y1 - y0) * 0.03;
  const px: [number, number, number, number][] = [];
  for (let y = Math.ceil(eq); y <= y1 - foot; y++) {
    let l = -1, r = -1;
    for (let i = x0; i <= x1; i++) if (data[(y * width + i) * 4 + 3]! > 250) { if (l < 0) l = i; r = i; }
    if (l < 0) continue;
    const span = r - l;
    for (let i = Math.ceil(l + span * 0.15); i <= r - span * 0.15; i++) {
      const o = (y * width + i) * 4, R = data[o]!, G = data[o + 1]!, B = data[o + 2]!;
      px.push([0.2126 * R + 0.7152 * G + 0.0722 * B, R, G, B]);
    }
  }
  px.sort((a, b) => a[0] - b[0]);
  const lo = px[Math.floor(px.length * 0.02)]!, mid = px[Math.floor(px.length * 0.5)]!;
  const hex = (p: number[]) => "#" + p.slice(1).map((v) => v.toString(16).padStart(2, "0")).join("");
  return { box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, darkest: hex(lo), darkestLuma: Math.round(lo[0]), p50: hex(mid), p50Luma: Math.round(mid[0]), gold: mid[0] >= floorLuma };
}, FLOOR.luma);

async function still(write: boolean, preview?: string, desk = false): Promise<void> {
  const srv = await serve();
  const browser = await chromium.launch({ channel: "chromium" }); // the full browser's headless mode draws on the GPU
  try {
    const page = await (await browser.newContext({ viewport: { width: 1500, height: 1800 }, deviceScaleFactor: 1 })).newPage();
    await page.goto(`http://localhost:${PORT}/`);
    const renderer = await mount(page, 1500, 1800);
    console.log(`renderer: ${renderer}; ${liftNote}`);
    for (const glow of [0, POSE.glow]) {
      await draw(page, POSE.spin, glow);
      const m = await measure(page);
      console.log(`glow ${glow}: egg ${m.box.w}×${m.box.h} at (${m.box.x}, ${m.box.y}); below the equator the body's median is ${m.p50} (luma ${m.p50Luma}), its 2nd percentile ${m.darkest} (${m.darkestLuma}); ${FLOOR.hex} is ${Math.round(FLOOR.luma)}: ${m.gold ? "reads gold" : "reads BROWN"}`);
      if (glow === POSE.glow && !m.gold) { process.exitCode = 1; console.error(`egg-still FAIL: below the equator the body reads ${m.p50}, darker than ${FLOOR.hex}`); }
    }
    if (preview) { writeFileSync(preview, await encode(page, "image/png", undefined, 600)); console.log(`preview (600 wide): ${preview}`); }
    if (!write || process.exitCode) return;
    if (AS_IS) throw new Error("--as-is is a comparison: run it with --measure");
    if (desk) {
      await draw(page, 0, 0); // the resting egg the live one replaces: Egg.tsx draws glow 0 until a protection pulse
      const f = join(ROOT, "web/src/desk/egg.webp");
      writeFileSync(f, await encode(page, "image/webp", 0.85, 600));
      console.log(`wrote web/src/desk/egg.webp (${(readFileSync(f).length / 1024).toFixed(1)} KB)`);
      return;
    }
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, "egg-1500.png"), await encode(page, "image/png", undefined));
    for (const w of [1200, 600]) writeFileSync(join(OUT, `egg-${w}.webp`), await encode(page, "image/webp", 0.9, w));
    for (const f of ["egg-1500.png", "egg-1200.webp", "egg-600.webp"]) console.log(`wrote web/public/brand/${f} (${(readFileSync(join(OUT, f)).length / 1024).toFixed(1)} KB)`);
  } finally { await browser.close(); srv.close(); }
}

/** Playwright's own ffmpeg (VP9 webm only, JPEG frames in): found in its browser cache, never downloaded. */
function playwrightFfmpeg(): string | null {
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  if (!existsSync(cache)) return null;
  const d = readdirSync(cache).filter((n) => n.startsWith("ffmpeg-")).sort().pop();
  const bin = d && join(cache, d, process.platform === "darwin" ? "ffmpeg-mac" : "ffmpeg-linux");
  return bin && existsSync(bin) ? bin : null;
}

async function loop(outDir: string): Promise<void> {
  const FRAMES = 150, FPS = 30, EGG_H = 640;
  const srv = await serve();
  const browser = await chromium.launch({ channel: "chromium" });
  const frames = join(tmpdir(), `b11-egg-loop-${process.pid}`);
  try {
    mkdirSync(outDir, { recursive: true });
    const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage();
    await page.goto(`http://localhost:${PORT}/`);
    await mount(page, 1500, 1800);
    console.log(liftNote);
    await draw(page, 0, 0);
    // The still's framing, scaled so the egg itself is EGG_H tall, drawn with the egg (not its canvas) at the centre.
    const m = await measure(page);
    const scale = EGG_H / m.box.h, cw = Math.round(1500 * scale), ch = Math.round(1800 * scale);
    await page.evaluate(({ cw, ch }) => { const w = window as unknown as { cv: HTMLCanvasElement; egg: { resize(): void } }; w.cv.style.width = `${cw}px`; w.cv.style.height = `${ch}px`; w.egg.resize(); }, { cw, ch });
    const ex = (m.box.x + m.box.w / 2) * scale, ey = (m.box.y + m.box.h / 2) * scale;
    // The seam: frame 150 would be spin 2π, the same light as frame 0.
    const shot = () => page.evaluate(() => (window as unknown as { cv: HTMLCanvasElement }).cv.toDataURL());
    await draw(page, 2 * Math.PI, 0); const seam = await shot();
    await draw(page, 0, 0); const zero = await shot();
    console.log(`frame 150 ${seam === zero ? "equals frame 0: no seam" : "DIFFERS from frame 0"}`);
    for (const [W, H] of [[1920, 1080], [1080, 1080]] as const) {
      rmSync(frames, { recursive: true, force: true }); mkdirSync(frames, { recursive: true });
      for (let f = 0; f < FRAMES; f++) {
        await draw(page, (2 * Math.PI * f) / FRAMES, 0); // the resting egg; only the studio light turns
        const jpg = await page.evaluate(async ({ W, H, ex, ey, velvet }) => {
          const src = (window as unknown as { cv: HTMLCanvasElement }).cv;
          const c = document.createElement("canvas"); c.width = W; c.height = H;
          const x = c.getContext("2d")!;
          x.fillStyle = velvet; x.fillRect(0, 0, W, H);
          // the egg's light on the velvet (the DD's end card: gold .13 falling to 0), then the egg
          const g = x.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.47);
          for (const [o, a] of [[0, .13], [.25, .08], [.5, .04], [.78, .012], [1, 0]] as const) g.addColorStop(o, `rgba(227,186,106,${a})`);
          x.fillStyle = g; x.fillRect(0, 0, W, H);
          x.drawImage(src, Math.round(W / 2 - ex), Math.round(H / 2 - ey), src.width, src.height);
          const b: Blob = await new Promise((ok, no) => c.toBlob((v) => v ? ok(v) : no(new Error("toBlob")), "image/jpeg", 0.97));
          return Array.from(new Uint8Array(await b.arrayBuffer()));
        }, { W, H, ex, ey, velvet: VELVET });
        writeFileSync(join(frames, `f${String(f).padStart(4, "0")}.jpg`), Uint8Array.from(jpg));
      }
      const name = `egg-loop-${W}x${H}`;
      const ff = playwrightFfmpeg();
      if (ff) {
        const r = spawnSync(ff, ["-y", "-loglevel", "error", "-framerate", String(FPS), "-f", "image2pipe", "-c:v", "mjpeg", "-i", "pipe:0", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "18", "-pix_fmt", "yuv420p", join(outDir, `${name}.webm`)],
          { input: Buffer.concat(readdirSync(frames).sort().map((f) => readFileSync(join(frames, f)))), maxBuffer: 1 << 30 });
        console.log(r.status === 0 ? `wrote ${join(outDir, name)}.webm` : `webm FAILED: ${r.stderr}`);
      } else console.log("webm SKIPPED: Playwright's ffmpeg is not in its cache");
      if (process.platform === "darwin" && existsSync("/usr/bin/swift")) {
        const r = spawnSync("/usr/bin/swift", [join(ROOT, "scripts/brand/h264.swift"), frames, join(outDir, `${name}.mp4`), String(FPS)], { encoding: "utf8" });
        console.log(r.status === 0 ? `wrote ${join(outDir, name)}.mp4 ${r.stdout.trim()}` : `mp4 FAILED: ${r.stderr || r.stdout}`);
      } else console.log("mp4 SKIPPED: no macOS encoder here");
    }
  } finally { rmSync(frames, { recursive: true, force: true }); await browser.close(); srv.close(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2).filter((x) => x !== "--as-is");
  if (a[0] === "--loop") await loop(a[1] ?? join(ROOT, "docs/video/track-b11"));
  else if (a[0] === "--desk") await still(true, undefined, true);
  else await still(a[0] !== "--measure", a[0] === "--measure" ? a[1] : undefined);
}

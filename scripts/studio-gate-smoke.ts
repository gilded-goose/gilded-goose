// The AG Studio gate, end to end (044 §2, slice 1): two real web builds, one with no licence key and one with a key AG
// rejects, served statically, opened in a real Chromium at 1440 and 390. On each, Behind the scenes (`?desk=ledger`)
// must be today's AG Grid Community ledger with no AG Studio element and no console error of our own (the static
// server has no /api, so its 404 for the session stream is the one expected network error); `?studio=force` must open
// the Studio dashboard, and unlicensed it must print AG's "License Key Not Found" banner, which proves the gate, not
// luck, kept Studio off the plain page. On a public host (goose.test, mapped here) `?studio=force` must be the ledger with no banner. Exits 1 on any miss. Nothing is written to the repo: builds go to a temp dir.
//
//   node scripts/studio-gate-smoke.ts [port]      default port 4237 (Track AS's web port)

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { readAskBoxes } from "./ask-line.ts";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.argv[2] ?? 4237);
const BASE = `http://127.0.0.1:${PORT}`;
const PUBLIC = `http://goose.test:${PORT}`;
let misses = 0;
const check = (ok: boolean, what: string) => { if (!ok) misses++; console.log(`${ok ? "ok  " : "MISS"} ${what}`); };

const VARIANTS = [
  { name: "no key", env: { VITE_AG_STUDIO_LICENSE: "" } },
  { name: "a key AG rejects", env: { VITE_AG_STUDIO_LICENSE: "not-a-real-key" } },
];

function build(out: string, env: Record<string, string>) {
  // `vite build` only: the prerender and the wasm compression aren't the gate's business and take a minute.
  const r = spawnSync("corepack", ["pnpm", "--filter", "@goose/web", "exec", "vite", "build", "--outDir", out, "--emptyOutDir"], {
    cwd: ROOT, env: { ...process.env, VITE_WALLET: "1", ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.status !== 0) throw new Error(`build failed:\n${r.stdout.slice(-800)}\n${r.stderr.slice(-800)}`);
}

async function serve(dir: string): Promise<ChildProcess> {
  const child = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: dir, stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASE}/index.html`); if (r.ok) return child; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill();
  throw new Error("static server didn't start");
}

async function visit(browser: Browser, path: string, width: number, height: number, { at = 0, host = BASE } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  // A key past its date, by the visitor's clock: the third state, on the build that believes it has one.
  if (at) await page.addInitScript((t: number) => { const real = Date.now; const start = real(); Date.now = () => t + real() - start; }, at);
  const errors: string[] = [];
  const banner: string[] = [];
  page.on("console", (m) => {
    const t = m.text();
    // AG's banner: "License Key Not Found" with no key, "Invalid License" / "Incompatible License Key" with a bad one.
    if (/License Key Not Found|Invalid License|Incompatible License|License Expired|AG Studio .* License|AG Grid and AG Charts Enterprise License|\*{20}|Your license|ag-grid\.com|info@ag-grid/i.test(t)) banner.push(t);
    else if (m.type() === "error" && !/Failed to load resource/.test(t)) errors.push(t.slice(0, 200));
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
  await page.goto(`${host}/${path}`, { waitUntil: "load" });
  await page.waitForTimeout(5000);
  // The tries table draws when it scrolls into view, and only then asks for its chunk.
  await page.evaluate(() => document.querySelector(".tb-tries")?.scrollIntoView());
  await page.waitForTimeout(2500);
  // Claims row as-view-only, on the page itself: every ask box this state draws says what typed words can't do.
  const asks = await readAskBoxes(page);
  const ledger = await page.locator(".lx-main").count();
  const studioEls = await page.locator("[class*='ag-studio'], .st-page").count();
  await ctx.close();
  return { errors, banner, ledger, studioEls, asks };
}

const tmp = mkdtempSync(join(tmpdir(), "goose-studio-gate-"));
const browser = await chromium.launch({ args: ["--host-resolver-rules=MAP goose.test 127.0.0.1"] });
try {
  for (const v of VARIANTS) {
    const out = join(tmp, v.name.replace(/\W+/g, "-"));
    console.log(`\n== ${v.name}: building…`);
    build(out, v.env);
    const server = await serve(out);
    try {
      for (const [w, h] of [[1440, 900], [390, 844]] as const) {
        const plain = await visit(browser, "?desk=ledger", w, h);
        check(plain.ledger === 1 && plain.studioEls === 0, `${v.name} @${w}: ?desk=ledger is the Community ledger (ledger ${plain.ledger}, studio elements ${plain.studioEls})`);
        check(plain.asks.length > 0 && plain.asks.every((b) => !b.why), `${v.name} @${w}: the plain page's ask box shows its view-only line (${JSON.stringify(plain.asks)})`);
        check(plain.banner.length === 0, `${v.name} @${w}: no AG licence banner on the plain page (${plain.banner.length} lines)`);
        check(plain.errors.length === 0, `${v.name} @${w}: zero console errors of our own on the plain page${plain.errors.length ? `: ${plain.errors.join(" | ")}` : ""}`);
        // Joshua, Nov 4: no watermark ever reaches a visitor. A stranger typing the developer's door on the public site gets the ledger, on both routes.
        for (const route of ["?desk=ledger&studio=force", "?desk=studio&studio=force", "?studio=force"]) {
          const pub = await visit(browser, route, w, h, { host: PUBLIC });
          check(pub.ledger === 1 && pub.studioEls === 0 && pub.banner.length === 0 && pub.errors.length === 0, `${v.name} @${w}: on a public host ${route} is the ledger with no AG mark or banner (ledger ${pub.ledger}, studio elements ${pub.studioEls}, banner ${pub.banner.length}, errors ${pub.errors.length})`);
        }
        const forced = await visit(browser, "?desk=ledger&studio=force", w, h);
        check(forced.asks.length > 0 && forced.asks.every((b) => !b.why), `${v.name} @${w}: forced Studio's ask box shows its view-only line (${JSON.stringify(forced.asks)})`);
        check(forced.errors.length === 0, `${v.name} @${w}: zero console errors of our own in forced Studio${forced.errors.length ? `: ${forced.errors.join(" | ")}` : ""}`);
        check(forced.studioEls > 0 && forced.ledger === 0, `${v.name} @${w}: ?studio=force opens Studio (studio elements ${forced.studioEls}, ledger ${forced.ledger})`);
        const headline = forced.banner.find((l) => /Not Found|Invalid|Incompatible|Expired/.test(l))?.replace(/\*/g, "").trim() ?? "(none)";
        check(forced.banner.length > 0, `${v.name} @${w}: forced Studio prints AG's licence banner, "${headline}" (so the gate, not luck, kept it off the plain page)`);
      }
    } finally { server.kill(); }
  }
} finally {
  await browser.close();
  rmSync(tmp, { recursive: true, force: true });
}
console.log(misses ? `\nstudio-gate-smoke: ${misses} MISS` : "\nstudio-gate-smoke: all ok");
process.exit(misses ? 1 : 0);

/// <reference lib="dom" />
// Track SM: the 6-second take of the moment at 1440 and 390 (dark). The recording starts with the context, so the
// ask is typed off camera; `in` is marked when the first seller row lands, `out` 6 s later, and Playwright's own
// ffmpeg trims the webm to [in, out]. Also writes the end frame. usage: node scripts/sm-take.ts docs/video/track-sm [--base url] [--ffmpeg ~/Library/Caches/ms-playwright/ffmpeg-*/ffmpeg-mac]
import { chromium, devices } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const out = args[0]!;
const base = args.includes("--base") ? args[args.indexOf("--base") + 1]! : "http://localhost:8847/";
const FFMPEG = args.includes("--ffmpeg") ? args[args.indexOf("--ffmpeg") + 1]! : "";
const ASK = "A Marsh Lights ticket under $90";
mkdirSync(out, { recursive: true });
const marks: Record<string, Record<string, number>> = {};

const browser = await chromium.launch();
const only = args.includes("--size") ? args[args.indexOf("--size") + 1] : null;
for (const size of (["1440", "390"] as const).filter((z) => !only || z === only)) {
  const vp = size === "1440" ? { width: 1440, height: 900 } : { width: 390, height: 844 };
  const ctx = await browser.newContext({ ...(size === "390" ? devices["iPhone 13"] : {}), viewport: vp, colorScheme: "dark", recordVideo: { dir: out, size: vp } });
  const t0 = Date.now();
  const page = await ctx.newPage();
  await page.goto(`${base}?desk=1`);
  const box = page.getByRole("textbox", { name: "Ask for anything" });
  await box.waitFor();
  await box.fill(ASK);
  await page.getByRole("button", { name: "Ask Goose" }).first().click();
  await page.getByRole("button", { name: /Shop for this/ }).waitFor();
  await page.waitForTimeout(700); // the understood card is the pre-roll (and the phone's scroll to it settles)
  await page.getByRole("button", { name: /Shop for this/ }).click();
  const tShop = (Date.now() - t0) / 1000;
  await page.locator(".dk-live-grid .dk-fr").first().waitFor({ timeout: 30_000 });
  const tin = (Date.now() - t0) / 1000;
  console.log(`${size}: shop clicked at ${tShop.toFixed(1)} s, first row at ${tin.toFixed(1)} s`);
  await page.waitForTimeout(6000);
  const tout = (Date.now() - t0) / 1000;
  await page.screenshot({ path: join(out, `sm-end-${size}.png`) });
  marks[size] = { in: Math.round(tin * 10) / 10, out: Math.round(tout * 10) / 10 };
  await ctx.close();
  const v = readdirSync(out).find((f) => f.endsWith(".webm") && !f.startsWith("sm-"));
  if (!v) throw new Error("no video");
  const raw = join(out, `sm-${size}-raw.webm`);
  renameSync(join(out, v), raw);
  if (FFMPEG) {
    // Re-encode the 6 s window (a stream copy can only cut on keyframes). VP9 at a quality the Director can judge.
    execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-ss", String(Math.max(0, tin - 0.3)), "-t", "6.3", "-i", raw, "-an", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "28", "-row-mt", "1", join(out, `sm-${size}.webm`)]);
    rmSync(raw);
  }
  console.log(`${size}: in ${marks[size]!.in} s, out ${marks[size]!.out} s`);
}
await browser.close();
writeFileSync(join(out, "sm-takes.json"), JSON.stringify({ ask: ASK, marks, note: "sm-<size>.webm is trimmed to the 6 s from the first seller row's arrival; the case rises ~0.5 s in; the protection card lands ~2 s in." }, null, 2));

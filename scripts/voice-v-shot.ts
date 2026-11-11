/// <reference lib="dom" />
// Track V (042, Lead-9's B and A) in a real browser: the Desk mic, tapped with Chromium's fake microphone, at 1440 and
// 390 px (the phone as an iPhone, so the mic takes the WebAssembly-only path). Screenshots of the mic's line before
// (the old markup, re-rendered in place: the state and the privacy line run together on one line) and after (two
// sentences, two lines), and a check that `?debug=voice` shows the backend and model and never the words.
//
//   node scripts/voice-v-shot.ts [url]   default http://localhost:8831/ (needs network for the model, once per run)
//   writes docs/screens/042/{desktop,phone}-mic-{before,after}.png and -debug.png

import { chromium, devices } from "playwright";
import { VOICE_LINE } from "@goose/core/desk";

const url = (process.argv[2] ?? "http://localhost:8831/").replace(/\/?$/, "/");
const OUT = "docs/screens/042";
let fails = 0;
const check = (cond: boolean, m: string) => { console.log(`${cond ? "ok  " : "FAIL"} ${m}`); if (!cond) fails++; };

const b = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
for (const [tag, opts] of [
  ["desktop", { viewport: { width: 1440, height: 900 } }],
  ["phone", { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } }],
] as const) {
  const ctx = await b.newContext({ ...opts, permissions: ["microphone"] });
  const page = await ctx.newPage();
  await page.goto(`${url}?desk=1&debug=voice`);
  await page.getByLabel("Ask for anything").waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  const mic = page.locator(".dk-ask button[data-mic]");
  if (!(await mic.count())) {
    console.log(await page.evaluate(() => ({ md: !!navigator.mediaDevices?.getUserMedia, mr: typeof MediaRecorder, ac: typeof AudioContext, wk: typeof Worker, btns: [...document.querySelectorAll("button")].map((x) => x.getAttribute("aria-label") || x.textContent).slice(0, 12) })));
    throw new Error(`${tag}: no mic button`);
  }
  check(await page.locator("#gv-debug").count() === 0, `${tag}: no debug line before the mic loads`);
  await mic.click();
  const line = page.locator(".dk-mic-line");
  await line.waitFor({ timeout: 10000 });
  // Wait for the model (tiny.en, from the model hub) and the fake mic: "Hold to talk, or tap to start."
  await page.waitForFunction(() => document.querySelector(".dk-mic-line")?.textContent?.startsWith("Hold to talk, or tap to start."), null, { timeout: 180000 });
  const box = await line.boundingBox();
  const clip = { x: 0, y: Math.max(0, box!.y - 220), width: opts.viewport.width, height: 340 };
  await page.screenshot({ path: `${OUT}/${tag}-mic-after.png`, clip });
  const lines = await line.evaluate((p) => (p as HTMLElement).innerText.split("\n"));
  check(lines.length === 2 && lines[0] === "Hold to talk, or tap to start." && lines[1] === VOICE_LINE, `${tag}: two lines, two sentences (${JSON.stringify(lines)})`);
  const debug = await page.locator("#gv-debug").innerText().catch(() => "");
  check(debug === (tag === "phone" ? "wasm · tiny.en" : "webgpu · tiny.en") || (tag === "desktop" && debug === "wasm · tiny.en"), `${tag}: ?debug=voice shows "${debug}"`);
  await page.screenshot({ path: `${OUT}/${tag}-mic-debug.png` });
  // The before: the same state in the old markup ("…tap to start Speech becomes…" on one line, no stop between).
  await line.evaluate((p, v) => { const s = document.createElement("span"); s.textContent = v; p.replaceChildren("Hold to talk, or tap to start ", s); }, VOICE_LINE);
  await page.screenshot({ path: `${OUT}/${tag}-mic-before.png`, clip });
  await ctx.close();
}
// Without the param, no debug line ever.
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["microphone"] });
const page = await ctx.newPage();
await page.goto(url);
await page.getByLabel("Ask for anything").waitFor({ timeout: 15000 });
await page.locator(".dk-ask button[data-mic]").click();
await page.waitForFunction(() => document.querySelector(".dk-mic-line")?.textContent?.startsWith("Hold to talk, or tap to start."), null, { timeout: 180000 });
check(await page.locator("#gv-debug").count() === 0, "no ?debug=voice: no debug line after the mic loads");
await b.close();
if (fails) { console.error(`voice-v-shot: ${fails} miss(es)`); process.exit(1); }
console.log("voice-v-shot ok");

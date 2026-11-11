// Track V (029): Whisper on the device, measured on the s8 clips (019), through the same page and worker the iPhone
// uses (/voice-test-2). The harness hands each clip's bytes to the page's decode → 16 kHz → worker path; the page fetches
// nothing but the model. Chrome (headless) on this Mac.
//
//   node spikes/s8-voice/make-audio.ts        (once: the 189 clips, gitignored)
//   corepack pnpm --filter @goose/web build
//   node spikes/v-voice-on-device/run.ts [wasm|auto] [file regex]   (tiny.en only since the iPhone test; base.en results are kept for the record)
//
// Prints one line per clip and the 019-style table; every try lands in results/<model>-<backend>.jsonl.

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const audio = join(here, "..", "s8-voice", "audio");
const model = "tiny";
const [backend = "auto", filter = ""] = process.argv.slice(2);
const PHRASE_OF: Record<string, string> = {
  toaster: "find me a toaster that fits my kitchen",
  heygoose: "hey goose find me a toaster that fits my kitchen",
  notthis: "not this one",
  undo: "undo",
  undolong: "undo that purchase",
  refund: "refund that purchase",
  takeback: "take it back",
  kettle: "find me a black kettle under sixty dollars",
  marsh: "a ticket to the marsh lights on saturday",
  mossbell: "one night at mossbell inn",
  gullwing: "a seat on gullwing air to port alder",
  harbor: "the harbor jacket in black",
  tidewater: "a yellow tidewater jacket",
  // No one speaking (silence, white noise, babble alone): the box must stay empty, and a word list mustn't be read back.
  quiet: "",
};
// The item words the word list is for (029): each must be heard as spelled.
const ITEM_KEYS = ["kettle", "ticket", "marsh", "lights", "mossbell", "inn", "gullwing", "port", "alder", "harbor", "tidewater", "jacket"];
// 019's scoring, unchanged: word error rate, and "key words kept" (the words the chips and the voice actions need).
const words = (s: string) => s.toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter(Boolean);
function wer(target: string, heard: string) {
  const a = words(target), b = words(heard);
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return a.length ? d[a.length]![b.length]! / a.length : 0;
}
const keyWords = (target: string, heard: string) => {
  const got = new Set(words(heard));
  return words(target).filter((w) => ["toaster", "kitchen", "undo", "not", "no", "refund", "back", ...ITEM_KEYS].includes(w)).every((w) => got.has(w));
};

const files = readdirSync(audio).filter((f) => f.endsWith(".wav") && new RegExp(filter).test(f)).sort();
if (!files.length) { console.error("FAIL: no audio; run node spikes/s8-voice/make-audio.ts first"); process.exit(1); }

const PORT = 4391;
// vite directly (not through pnpm), so killing it stops the server rather than leaving an orphan on the port.
const preview = spawn(join(here, "..", "..", "web", "node_modules", ".bin", "vite"), ["preview", "--port", String(PORT), "--strictPort"], { cwd: join(here, "..", "..", "web"), stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-unsafe-webgpu"] });
const hosts = new Set<string>();
try {
  const page = await browser.newPage();
  page.on("request", (r) => { hosts.add(new URL(r.url()).host); if (!r.url().startsWith(`http://localhost`)) console.error(`fetch: ${r.url().slice(0, 140)}`); });
  page.on("worker", (w) => w.url() && hosts.add(new URL(w.url()).host));
  page.on("pageerror", (e) => console.error(`page error: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && console.error(`console: ${m.text()}`));
  await page.goto(`http://localhost:${PORT}/voice-test-2.html${backend === "wasm" ? "?backend=wasm" : ""}`);
  await page.waitForFunction(() => "__voiceTest2" in window, null, { timeout: 15000 });
  const t0 = Date.now();
  await page.evaluate(() => (window as unknown as { __voiceTest2: { ready(): Promise<void> } }).__voiceTest2.ready());
  const loadMs = Date.now() - t0;
  const used = (await page.textContent("#backend"))?.split(" ·")[0];
  console.log(`model ${model} ready on ${used} in ${loadMs} ms (first load includes the download unless cached)`);

  type Try = { file: string; transcript: string; wer: number; keyWordsKept: boolean; lagMs: number; whisperMs: number; seconds: number };
  const tries: Try[] = [];
  for (const file of files) {
    const [key] = file.split("__");
    const b64 = readFileSync(join(audio, file)).toString("base64");
    const r = await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
      return (window as unknown as { __voiceTest2: { file(b: ArrayBuffer): Promise<{ text: string; ms: number; seconds: number; lagMs: number }> } }).__voiceTest2.file(bytes);
    }, b64);
    const target = PHRASE_OF[key!]!;
    const t: Try = { file, transcript: r.text, wer: Math.round(wer(target, r.text) * 100) / 100, keyWordsKept: !!r.text && keyWords(target, r.text), lagMs: r.lagMs, whisperMs: r.ms, seconds: Math.round(r.seconds * 10) / 10 };
    tries.push(t);
    console.log(`${file.padEnd(34)} wer=${t.wer} keys=${t.keyWordsKept ? "yes" : "NO "} lag=${t.lagMs}ms "${t.transcript}"`);
  }

  const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const groups = new Map<string, Try[]>();
  for (const t of tries) {
    const [key, , cond] = t.file.replace(".wav", "").split("__");
    groups.set(`${key} | ${cond}`, [...(groups.get(`${key} | ${cond}`) ?? []), t]);
  }
  const lines = [`model ${model} · backend ${used} · ready in ${loadMs} ms · hosts contacted: ${[...hosts].sort().join(", ")}`, "",
    "| phrase | room | heard something | key words kept | exact | mean WER | release to text, p50 / p95 |", "|---|---|---|---|---|---|---|"];
  for (const [g, ts] of groups) {
    const lag = ts.map((t) => t.lagMs);
    lines.push(`| ${g} | ${ts.filter((t) => t.transcript).length}/${ts.length} | ${ts.filter((t) => t.keyWordsKept).length}/${ts.length} | ${ts.filter((t) => t.wer === 0).length}/${ts.length} | ${(ts.reduce((s, t) => s + t.wer, 0) / ts.length).toFixed(2)} | ${pct(lag, 0.5)} / ${pct(lag, 0.95)} ms |`);
  }
  console.log(lines.join("\n"));
  mkdirSync(join(here, "results"), { recursive: true });
  writeFileSync(join(here, "results", `${model}-${used}.jsonl`), tries.map((t) => JSON.stringify(t)).join("\n") + "\n");
  writeFileSync(join(here, "results", `${model}-${used}.md`), lines.join("\n") + "\n");
} finally {
  await browser.close();
  preview.kill();
}

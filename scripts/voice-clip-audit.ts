// Track V (042): every recorded Goose line measured the same way, so "warm or robotic" rests on numbers, not one
// listener's ear. For each clip in web/public/voice/ (or a folder of WAVs given as the first argument): length, the
// silence before and after the words, loudness, pauses inside the line, pace (words per minute and syllables per second
// against the line's own text), and the pitch contour (median, the spread a listener hears as expressive or flat, and
// whether the line falls at its end the way a calm statement does). With KOKORO_DIR set (kokoro-js installed in a
// scratch folder, which brings transformers.js), Whisper base.en also transcribes each clip, and the word error rate
// against the line is reported: a line a machine can't hear cleanly is one a person strains at too.
//
//   KOKORO_DIR=/path/to/scratch node scripts/voice-clip-audit.ts [dir] [--json out.json]
//
// Needs macOS's `afconvert` to decode AAC. Reads only local files; sends nothing anywhere (Whisper's weights download
// from Hugging Face on the first run when KOKORO_DIR is set).

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CLIPS } from "@goose/core/clips";

const args = process.argv.slice(2);
const jsonAt = args.indexOf("--json");
const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : null;
const dir = args.find((a, i) => !a.startsWith("--") && !(jsonAt >= 0 && i === jsonAt + 1)) ?? "web/public/voice";
const RATE = 16000;

/** Decodes any file afconvert reads into mono 16 kHz float samples. */
function decode(file: string, tmp: string): Float32Array {
  const wav = join(tmp, "x.wav");
  execFileSync("afconvert", ["-f", "WAVE", "-d", `LEI16@${RATE}`, "-c", "1", file, wav]);
  const b = readFileSync(wav);
  let p = 12;
  while (p < b.length - 8) {
    const id = b.toString("ascii", p, p + 4), size = b.readUInt32LE(p + 4);
    if (id === "data") {
      const n = Math.floor(size / 2), out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = b.readInt16LE(p + 8 + i * 2) / 32768;
      return out;
    }
    p += 8 + size + (size % 2);
  }
  throw new Error(`no data chunk in ${file}`);
}

const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-9));
const quant = (xs: number[], q: number) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]!; };
const st = (f: number, ref: number) => 12 * Math.log2(f / ref);

/** Syllables in English text, by vowel groups (good to about ±10% on short lines; the same rule for every clip). */
function syllables(text: string): number {
  return text.toLowerCase().replace(/[^a-z\s']/g, " ").split(/\s+/).filter(Boolean).reduce((n, w) => {
    const v = w.replace(/'/g, "").replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g);
    return n + Math.max(1, v ? v.length : 1);
  }, 0);
}

/** Pitch of one frame by normalised autocorrelation (70–400 Hz), or 0 when the frame isn't voiced. */
function pitch(x: Float32Array, at: number, len: number): number {
  const lo = Math.floor(RATE / 400), hi = Math.floor(RATE / 70);
  let e0 = 0;
  for (let i = 0; i < len; i++) e0 += x[at + i]! ** 2;
  if (e0 < 1e-6) return 0;
  let best = 0, bestLag = 0;
  for (let lag = lo; lag <= hi; lag++) {
    let r = 0, e1 = 0;
    for (let i = 0; i < len - lag; i++) { r += x[at + i]! * x[at + i + lag]!; e1 += x[at + i + lag]! ** 2; }
    const c = r / Math.sqrt(e0 * e1 + 1e-12);
    if (c > best) { best = c; bestLag = lag; }
  }
  return best > 0.5 && bestLag ? RATE / bestLag : 0;
}

export type ClipStats = {
  clip: string; line: string; seconds: number; leadMs: number; tailMs: number; speechS: number;
  rmsDb: number; peakDb: number; pauses: number; longestPauseMs: number; wpm: number; sylPerS: number;
  f0Median: number; f0SpreadSt: number; f0SdSt: number; endFallSt: number; voicedShare: number; endDb: number;
  heard?: string; wer?: number;
};

function measure(x: Float32Array, line: string, clip: string): ClipStats {
  const hop = RATE / 100, win = Math.floor(RATE * 0.03);
  const frames: number[] = [];
  for (let at = 0; at + win <= x.length; at += hop) {
    let s = 0;
    for (let i = 0; i < win; i++) s += x[at + i]! ** 2;
    frames.push(db(Math.sqrt(s / win)));
  }
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const floor = db(peak) - 40; // speech: within 40 dB of the clip's own peak
  const on = frames.map((f) => f > floor);
  const first = on.indexOf(true), last = on.lastIndexOf(true);
  let pauses = 0, run = 0, longest = 0;
  for (let i = first; i <= last; i++) {
    if (!on[i]) run++;
    else { if (run >= 12) { pauses++; longest = Math.max(longest, run * 10); } run = 0; }
  }
  const active = frames.filter((f, i) => i >= first && i <= last && f > floor);
  const rms = db(Math.sqrt(active.reduce((s, f) => s + 10 ** (f / 10), 0) / Math.max(1, active.length)));
  const f0: { t: number; f: number }[] = [];
  const pwin = Math.floor(RATE * 0.04);
  for (let k = first; k <= last; k++) {
    const at = k * hop;
    if (at + pwin > x.length || !on[k]) continue;
    const f = pitch(x, at, pwin);
    if (f) f0.push({ t: k * 10, f });
  }
  const fs = f0.map((p) => p.f), med = quant(fs, 0.5);
  const sts = fs.map((f) => st(f, med));
  const mean = sts.reduce((a, b) => a + b, 0) / Math.max(1, sts.length);
  const sd = Math.sqrt(sts.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, sts.length));
  // The last 350 ms of voiced speech against the line's median: a calm statement ends below it.
  const endT = f0.length ? f0[f0.length - 1]!.t : 0;
  const tail = f0.filter((p) => p.t >= endT - 350).map((p) => st(p.f, med));
  const words = line.split(/\s+/).filter(Boolean).length;
  const speechS = (last - first + 1) / 100;
  return {
    clip, line, seconds: +(x.length / RATE).toFixed(2), leadMs: first * 10, tailMs: (frames.length - 1 - last) * 10, speechS: +speechS.toFixed(2),
    rmsDb: +rms.toFixed(1), peakDb: +db(peak).toFixed(1), pauses, longestPauseMs: longest,
    wpm: Math.round((words / speechS) * 60), sylPerS: +(syllables(line) / speechS).toFixed(2),
    f0Median: Math.round(med), f0SpreadSt: +(quant(sts, 0.9) - quant(sts, 0.1)).toFixed(1), f0SdSt: +sd.toFixed(2),
    endFallSt: +(tail.length ? quant(tail, 0.5) : 0).toFixed(1), voicedShare: +(f0.length / Math.max(1, last - first + 1)).toFixed(2),
    endDb: +(frames[frames.length - 1]! - db(peak)).toFixed(1),
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9'\s]/g, " ").replace(/'/g, "").split(/\s+/).filter(Boolean);
/** Word error rate: edits to turn what was heard into the line, over the line's words. */
export function wer(line: string, heard: string): number {
  const a = norm(line), b = norm(heard);
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return +(d[a.length]![b.length]! / Math.max(1, a.length)).toFixed(2);
}

/** Whisper base.en through the scratch folder's transformers.js, or null when KOKORO_DIR isn't set. */
async function listener(): Promise<((x: Float32Array) => Promise<string>) | null> {
  const k = process.env.KOKORO_DIR;
  if (!k) return null;
  const req = createRequire(join(resolve(k), "package.json"));
  type Tf = { pipeline: (t: string, m: string, o?: object) => Promise<(x: Float32Array, o?: object) => Promise<{ text: string }>> };
  const mod = (await import(req.resolve("@huggingface/transformers"))) as Record<string, unknown>;
  const tf = ("pipeline" in mod ? mod : mod.default) as Tf;
  const asr = await tf.pipeline("automatic-speech-recognition", "Xenova/whisper-base.en", { dtype: "fp32" });
  return async (x) => (await asr(x)).text.trim();
}

const lineOf = new Map(Object.entries(CLIPS).map(([line, name]) => [name, line]));
const tmp = mkdtempSync(join(tmpdir(), "clip-audit-"));
const hear = await listener();
const rows: ClipStats[] = [];
for (const f of readdirSync(dir).filter((f) => /\.(m4a|wav)$/.test(f)).sort()) {
  const name = f.replace(/\.(m4a|wav)$/, "").replace(/--.*$/, "");
  const line = lineOf.get(name);
  if (!line) continue;
  const x = decode(join(dir, f), tmp);
  const r = measure(x, line, f);
  if (hear) { r.heard = await hear(x); r.wer = wer(line, r.heard); }
  rows.push(r);
}
rmSync(tmp, { recursive: true, force: true });
const med = quant(rows.map((r) => r.rmsDb), 0.5);
console.log("clip".padEnd(24), "sec  lead tail  rmsΔ  wpm  syl/s  f0   spread  sd   endFall pauses  wer  heard");
for (const r of rows) {
  console.log(r.clip.padEnd(24), String(r.seconds).padEnd(4), String(r.leadMs).padStart(4), String(r.tailMs).padStart(4), (r.rmsDb - med).toFixed(1).padStart(5), String(r.wpm).padStart(4), String(r.sylPerS).padStart(6),
    String(r.f0Median).padStart(4), String(r.f0SpreadSt).padStart(6), String(r.f0SdSt).padStart(5), String(r.endFallSt).padStart(7), String(r.pauses).padStart(6), String(r.wer ?? "-").padStart(5), r.heard ?? "");
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 2));

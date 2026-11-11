// Goose's recorded voice (034, default 3; re-made by Track V, 042): every fixed line in `CLIPS` (core/src/ask/clips.ts)
// said by Kokoro, an Apache-2.0 text-to-speech model, on this machine ($0, no key, no account), and written to
// web/public/voice/ as small AAC files. Each line is said with its own take from `CLIP_TAKES` (the speed, and the words
// as Kokoro reads them when a comma or full stop placed for the ear differs from the screen's). Every clip is then
// shaped the same way, so the set sounds like one person in one room: the silence before the words trimmed to 150 ms
// (quick, yet long enough for a Bluetooth headset or a phone speaker waking from idle not to clip the first word),
// 300 ms kept after them, short fades so no clip starts or stops with a click, and the same
// loudness for every line (-20 dBFS while speaking, peaks under -1.5 dBFS).
//
// kokoro-js is NOT a dependency of the app; install it in a scratch folder and point KOKORO_DIR at it. The model
// downloads from Hugging Face on the first run, at the exact revision in `CLIP_SOURCE` (kokoro-js's own loader ignores a
// revision, so this script loads the model itself).
//
//   mkdir /tmp/kokoro && cd /tmp/kokoro && npm init -y && npm install kokoro-js@1.2.1
//   KOKORO_DIR=/tmp/kokoro node scripts/kokoro-clips.ts                 the shipped clips, from CLIP_TAKES
//   KOKORO_DIR=/tmp/kokoro node scripts/kokoro-clips.ts --grid <dir>    every line in each voice × speed, as WAVs for
//                                                                       scripts/voice-clip-audit.ts to compare
//
// Needs macOS's `afconvert` for the WAV → AAC step (no ffmpeg needed). Exits 1 if any clip is over CLIP_MAX_BYTES.

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { CLIPS, CLIP_EXT, CLIP_MAX_BYTES, CLIP_SOURCE, CLIP_TAKES } from "@goose/core/clips";

const dir = process.env.KOKORO_DIR;
if (!dir) { console.error("KOKORO_DIR is not set: install kokoro-js in a scratch folder (see the header)."); process.exit(1); }
const gridAt = process.argv.indexOf("--grid");
const grid = gridAt >= 0 ? process.argv[gridAt + 1] : null;
const flag = (f: string) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1]!.split(",") : null; };
// --voices a,b  --speeds 0.8,0.9  --only clip,clip: a narrower grid for a second round on a few lines.
const GRID_VOICES = flag("--voices") ?? ["af_heart", "af_bella", "af_nicole"];
const GRID_SPEEDS = (flag("--speeds") ?? ["0.85", "0.9", "0.95", "1"]).map(Number);
const ONLY = flag("--only");

type Raw = { audio: Float32Array; sampling_rate: number };
type Tts = { generate(t: string, o: { voice: string; speed: number }): Promise<Raw> };
const req = createRequire(join(resolve(dir), "package.json"));
/** A scratch package by name: its named export `key`, from the module or (CommonJS) its default. */
const load = async <T>(name: string, key: string): Promise<T> => { const m = (await import(req.resolve(name))) as Record<string, unknown>; return (key in m ? m : m.default) as T; };
const { KokoroTTS } = await load<{ KokoroTTS: new (model: unknown, tokenizer: unknown) => Tts }>("kokoro-js", "KokoroTTS");
const tf = await load<{ StyleTextToSpeech2Model: { from_pretrained(m: string, o: object): Promise<unknown> }; AutoTokenizer: { from_pretrained(m: string, o: object): Promise<unknown> } }>("@huggingface/transformers", "StyleTextToSpeech2Model");
const pinned = { revision: CLIP_SOURCE.revision };
const tts = new KokoroTTS(
  await tf.StyleTextToSpeech2Model.from_pretrained(CLIP_SOURCE.model, { ...pinned, dtype: CLIP_SOURCE.dtype, device: "cpu" }),
  await tf.AutoTokenizer.from_pretrained(CLIP_SOURCE.model, pinned),
);

const LEAD_S = 0.15, TAIL_S = 0.3, FADE_IN_S = 0.01, FADE_OUT_S = 0.06, TARGET_DB = -20, PEAK_DB = -1.5;
const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-9));

/** Trimmed, faded and levelled: the same shape for every clip. */
export function shape(x: Float32Array, rate: number): Float32Array {
  const hop = Math.round(rate / 100);
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const floor = peak * 10 ** (-40 / 20);
  const loud: boolean[] = [];
  let sum = 0, n = 0;
  for (let at = 0; at + hop <= x.length; at += hop) {
    let s = 0;
    for (let i = 0; i < hop; i++) s += x[at + i]! ** 2;
    const r = Math.sqrt(s / hop);
    loud.push(r > floor);
    if (r > floor) { sum += s; n += hop; }
  }
  const first = loud.indexOf(true), last = loud.lastIndexOf(true);
  const from = Math.max(0, first * hop - Math.round(LEAD_S * rate)), to = Math.min(x.length, (last + 1) * hop + Math.round(TAIL_S * rate));
  const y = x.slice(from, to);
  let gain = 10 ** ((TARGET_DB - db(Math.sqrt(sum / Math.max(1, n)))) / 20);
  if (peak * gain > 10 ** (PEAK_DB / 20)) gain = 10 ** (PEAK_DB / 20) / peak;
  const fi = Math.round(FADE_IN_S * rate), fo = Math.round(FADE_OUT_S * rate);
  for (let i = 0; i < y.length; i++) {
    const k = Math.min(1, i / fi, (y.length - 1 - i) / fo);
    y[i] = y[i]! * gain * Math.sin((Math.PI / 2) * Math.max(0, k)) ** 2;
  }
  return y;
}

function wav(path: string, x: Float32Array, rate: number) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i]!)) * 32767), 44 + i * 2);
  writeFileSync(path, b);
}

const say = async (text: string, voice: string, speed: number) => { const r = await tts.generate(text, { voice, speed }); return { x: shape(r.audio, r.sampling_rate), rate: r.sampling_rate }; };

if (grid) {
  mkdirSync(grid, { recursive: true });
  for (const [line, name] of Object.entries(CLIPS)) {
    if (ONLY && !ONLY.includes(name)) continue;
    const text = CLIP_TAKES[name]?.say ?? line;
    for (const voice of GRID_VOICES) for (const speed of GRID_SPEEDS) {
      const { x, rate } = await say(text, voice, speed);
      wav(join(grid, `${name}--${voice}-${speed}.wav`), x, rate);
    }
    console.log(`grid ${name}: ${GRID_VOICES.length * GRID_SPEEDS.length} takes`);
  }
  process.exit(0);
}

const OUT = "web/public/voice";
mkdirSync(OUT, { recursive: true });
const tmp = join(tmpdir(), `kokoro-${process.pid}`);
mkdirSync(tmp, { recursive: true });
let over = 0;
for (const [line, name] of Object.entries(CLIPS)) {
  const take = CLIP_TAKES[name]!;
  const w = join(tmp, `${name}.wav`), out = join(OUT, `${name}${CLIP_EXT}`);
  const { x, rate } = await say(take.say ?? line, CLIP_SOURCE.voice, take.speed);
  wav(w, x, rate);
  execFileSync("afconvert", ["-f", "m4af", "-d", "aac", "-b", "32000", w, out]);
  const size = statSync(out).size;
  if (size > CLIP_MAX_BYTES) over++;
  console.log(`${size > CLIP_MAX_BYTES ? "OVER" : "ok  "} ${String(size).padStart(6)} B  speed ${take.speed}  ${out}  “${take.say ?? line}”`);
}
rmSync(tmp, { recursive: true, force: true });
if (over) { console.error(`kokoro-clips FAIL: ${over} clip(s) over ${CLIP_MAX_BYTES} bytes`); process.exit(1); }
console.log(`kokoro-clips ok: ${Object.keys(CLIPS).length} clips, ${CLIP_SOURCE.model}@${CLIP_SOURCE.revision.slice(0, 7)} voice ${CLIP_SOURCE.voice}`);

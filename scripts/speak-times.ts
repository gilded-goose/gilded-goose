// Speak-back timed (item 10; the iPhone test: 6.4 s was too long, ~3 s the target). Every line Goose says back
// (`core/test/spoken-lines.ts`) is rendered silently by macOS `say` with Samantha, the en-US voice Chrome and Safari use
// on a Mac, to a file (nothing plays), and its length is divided by the page's 1.05 rate. Calibration: 019's sentence
// measured 6.2 s in desktop Chrome (`spikes/s8-voice/results/chrome-speak.jsonl`); `say` must give it within 0.4 s.
// Writes docs/fixtures/speak-times.json, which `core/test/voice.test.ts` checks against the code's lines. macOS only.
//
//   node scripts/speak-times.ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spokenLines } from "../core/test/spoken-lines.ts";

const VOICE = "Samantha";
const RATE = 1.05;
const CALIBRATION = "Found a black toaster, thirty four dollars and twenty cents, to match your kettle. Tap Approve to buy it.";
const CHROME_S = 6.2;
const dir = mkdtempSync(join(tmpdir(), "speak-"));
const seconds = (line: string) => {
  const f = join(dir, "l.aiff");
  execFileSync("say", ["-v", VOICE, "-o", f, line]);
  const m = execFileSync("afinfo", [f], { encoding: "utf8" }).match(/estimated duration: ([\d.]+)/);
  if (!m) throw new Error(`no duration for "${line}"`);
  return Number(m[1]);
};
try {
  const cal = seconds(CALIBRATION);
  if (Math.abs(cal - CHROME_S) > 0.4) throw new Error(`say gives the calibration sentence ${cal.toFixed(2)} s, Chrome ${CHROME_S} s`);
  const lines: Record<string, number> = {};
  for (const l of await spokenLines()) lines[l] = Math.round((seconds(l) / RATE) * 100) / 100;
  writeFileSync("docs/fixtures/speak-times.json", `${JSON.stringify({ voice: VOICE, rate: RATE, calibration: { sentence: CALIBRATION, say: cal, chrome: CHROME_S }, lines }, null, 2)}\n`);
  const worst = Object.entries(lines).sort((a, b) => b[1] - a[1]);
  for (const [l, s] of worst.slice(0, 5)) console.log(`${s.toFixed(2)} s  ${l}`);
  console.log(`speak-times ok: ${worst.length} lines, longest ${worst[0]![1]} s; docs/fixtures/speak-times.json`);
} finally { rmSync(dir, { recursive: true, force: true }); }

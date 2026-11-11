// Track V (029): the word list Whisper is primed with, and the audio the worker hears. The list is core's catalog and
// market words (never typed into the worker); the audio is one channel at 16 kHz. Whether the list helps is measured on
// recorded clips (spikes/v-voice-on-device/run.ts, logged in 029), not here.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROMPT_TOKENS_MAX } from "../src/ask/ondevice.ts";
import { ITEM_WORDS } from "../src/ask/shops.ts";
import { COMMON_WORDS, voicePrompt, voiceWords } from "../src/ask/voice-words.ts";
import { WHISPER_RATE, pickMimeType, toWhisperRate } from "../../web/src/voice/audio.ts";

const worker = readFileSync(new URL("../../web/src/voice/whisper.worker.ts", import.meta.url), "utf8");
const code = worker.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("Track V: the word list (029)", () => {
  it("primes Whisper with every item Goose shops or watches, as Goose names it", () => {
    const prompt = voicePrompt();
    for (const said of Object.values(ITEM_WORDS)) expect(prompt, said).toContain(said);
    // The demo's own names, which tiny.en lost on every clip without the list (029).
    for (const w of ["kettle", "Marsh Lights ticket", "Mossbell Inn", "Gullwing Air", "Harbor jacket", "Tidewater jacket"]) expect(prompt).toContain(w);
    expect(prompt).toBe(`${[...Object.values(ITEM_WORDS), ...COMMON_WORDS].join(", ")}.`);
  });

  it("then the everyday words a shopper says (042: Joshua's iPhone heard \"Air plane tickets.\"), items first", () => {
    const prompt = voicePrompt();
    for (const w of ["airplane", "headphones", "backpack", "toaster", "kettle", "sneakers", "laptop", "concert", "ticket", "flight", "hotel", "priorities list"]) expect(prompt, w).toMatch(new RegExp(`\\b${w}\\b`, "i"));
    // Items lead, so trimming the prompt from its start never drops a catalog name for an everyday word.
    expect(prompt.indexOf("airplane")).toBeGreaterThan(prompt.indexOf(Object.values(ITEM_WORDS).at(-1)!));
    // Each once: "ticket" and "kettle" are already in the items' names and aren't doubled as whole entries.
    expect(voiceWords().filter((w) => w.toLowerCase() === "kettle")).toHaveLength(1);
  });

  it("is built from the data: a new item joins it, each once in any case", () => {
    expect(voiceWords(["Zephyr lamp", "kettle", "Kettle", "lamp"])).toEqual(["Zephyr lamp", "kettle", "lamp"]);
    expect(voicePrompt(["a", "b"])).toBe("a, b.");
  });

  it("fits Whisper's prompt window with room to spare (about 1.3 tokens a word, plus a comma each)", () => {
    const words = voiceWords();
    expect(Math.ceil(words.join(" ").split(/\s+/).length * 1.3 + words.length)).toBeLessThan(PROMPT_TOKENS_MAX / 4);
  });

  it("the worker takes the list from the build, never types it, and drops it from the answer", () => {
    expect(worker).toMatch(/^import PROMPT from "virtual:goose-voice-words";$/m);
    // No item word typed in the worker's code, and none of core's catalog modules bundled into it.
    expect(code).not.toMatch(/toaster|kettle|jacket|Mossbell|voice-words\.ts|shops/i);
    expect(code).toMatch(/\.slice\(prefix\.length\)/);
  });
});

describe("Track V: the audio Whisper hears (029)", () => {
  it("records AAC where it can (iOS Safari), else Opus; nothing when the browser records neither", () => {
    expect(pickMimeType((t) => t.startsWith("audio/mp4"))).toBe("audio/mp4;codecs=mp4a.40.2");
    expect(pickMimeType((t) => t === "audio/webm;codecs=opus")).toBe("audio/webm;codecs=opus");
    expect(pickMimeType(() => false)).toBeUndefined();
  });

  it("averages the channels to one and leaves 16 kHz alone", () => {
    const out = toWhisperRate([Float32Array.of(1, 0, -1), Float32Array.of(0, 0, 1)], WHISPER_RATE);
    expect([...out]).toEqual([0.5, 0, 0]);
  });

  it("48 kHz → 16 kHz: a third as many samples, each the mean of the three it covers", () => {
    const x = Float32Array.from({ length: 48 }, (_, i) => i);
    const out = toWhisperRate([x], 48000);
    expect(out.length).toBe(16);
    expect([...out.slice(0, 3)]).toEqual([1, 4, 7]);
    // A 1 kHz tone keeps its loudness through the drop (no gain change, no silence).
    const tone = Float32Array.from({ length: 48000 }, (_, i) => Math.sin((2 * Math.PI * 1000 * i) / 48000));
    const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
    expect(rms(toWhisperRate([tone], 48000))).toBeGreaterThan(0.6);
  });

  it("44.1 kHz and 8 kHz land on 16 kHz too (a mic that isn't 48 kHz)", () => {
    expect(toWhisperRate([new Float32Array(44100)], 44100).length).toBe(16000);
    const up = toWhisperRate([Float32Array.of(0, 1, 0, 1)], 8000);
    expect(up.length).toBe(8);
    expect([...up.slice(0, 3)]).toEqual([0, 0.5, 1]);
    expect(toWhisperRate([], 48000).length).toBe(0);
  });
});

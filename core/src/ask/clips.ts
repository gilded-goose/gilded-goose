// Goose's recorded voice (034, Joshua's 12:15 queue, Lead's default 3): the fixed lines the pages say, each recorded
// once, offline, with Kokoro (an Apache-2.0 text-to-speech model) by `scripts/kokoro-clips.ts`, and served from
// web/public/voice/. A line said that is exactly one of these plays its clip; any other line (a cart's price and store,
// the chips' answer) and any clip that fails go to the browser's own voice as before (web/src/speech.ts). The shopper's
// name is never recorded and never spoken: it is shown as text only.

import { TAP_TO_BUY } from "./copy.ts";
import { VOICE_ASIDE_SOON, VOICE_DECLINED, VOICE_NO_CART, VOICE_NO_DEAL, VOICE_PAID, VOICE_SHOPPING, VOICE_STILL } from "./voice.ts";
import { NAME_FORGOT, NAME_HELLO } from "../view/name.ts";

/** How the clips were made: the model, its exact revision, the voice and the licence (docs/guild/034-features-c.md). */
export const CLIP_SOURCE = {
  package: "kokoro-js 1.2.1 (Apache-2.0)",
  model: "onnx-community/Kokoro-82M-v1.0-ONNX",
  revision: "1939ad2a8e416c0acfeecc08a694d14ef25f2231",
  licence: "Apache-2.0",
  dtype: "q8",
  voice: "af_heart",
  format: "AAC in .m4a, 24 kHz mono, 32 kbit/s (macOS afconvert)",
} as const;

/** Each fixed line and its clip's file name under web/public/voice/. */
export const CLIPS: Readonly<Record<string, string>> = {
  [TAP_TO_BUY]: "tap-approve",
  [VOICE_SHOPPING]: "shopping",
  [VOICE_STILL]: "still-shopping",
  [VOICE_DECLINED]: "set-aside",
  [VOICE_ASIDE_SOON]: "aside-soon",
  [VOICE_PAID]: "already-paid",
  [VOICE_NO_CART]: "no-cart",
  [VOICE_NO_DEAL]: "no-deal",
  [NAME_HELLO]: "name-hello",
  [NAME_FORGOT]: "name-forgot",
};

/**
 * How each clip is said (Track V's audit, docs/guild/042-voice.md): Kokoro's speed for the line, and `say`, the words as
 * Kokoro reads them, only where a stop placed for the ear differs from the screen's punctuation. The caption always
 * shows the screen's words. Chosen by measured pace, pitch and how cleanly Whisper heard each take.
 */
export type ClipTake = { speed: number; say?: string };
export const CLIP_TAKES: Readonly<Record<string, ClipTake>> = {
  // A comma for the ear: at full speed "Approve to" ran together (heard as "Approved to" at slower speeds).
  "tap-approve": { speed: 0.9, say: "Tap Approve, to buy." },
  shopping: { speed: 0.85 },
  "still-shopping": { speed: 0.95 },
  "set-aside": { speed: 0.95 },
  // Seven one-syllable words rushed at 6 syllables a second; a breath before "when" and a slower take.
  "aside-soon": { speed: 0.85, say: "I'll set it aside, when it's ready." },
  "already-paid": { speed: 0.85 },
  "no-cart": { speed: 0.9 },
  "no-deal": { speed: 1 },
  "name-hello": { speed: 0.9 },
  // At full speed "Done." rose like a question ("Done?"); slower, it lands.
  "name-forgot": { speed: 0.9 },
};

export const CLIP_EXT = ".m4a";
/** Largest clip allowed (bytes): each is a short line, loaded only after the shopper's first tap. */
export const CLIP_MAX_BYTES = 60_000;

/** The clip for a line, as a path relative to the page (works at / and under the static mirror's folder), or null. */
export function clipFor(line: string): string | null {
  const f = Object.hasOwn(CLIPS, line) ? CLIPS[line] : undefined;
  return f ? `voice/${f}${CLIP_EXT}` : null;
}

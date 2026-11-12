// Voice on the device (029): the recorder's format, and the samples Whisper reads (16 kHz, one channel, Float32).
// Pure functions, so the page, the Ask box (phase 2) and a test share them.

export const WHISPER_RATE = 16000;

// iOS Safari records AAC in MP4, Chrome and Firefox record Opus in WebM. AAC first, because Safari decodes what it
// recorded and Chrome decodes AAC too; a browser that can't record AAC falls through to Opus.
const RECORD_TYPES = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

export function pickMimeType(isTypeSupported: (type: string) => boolean): string | undefined {
  return RECORD_TYPES.find((t) => isTypeSupported(t));
}

// Average the channels to one, then bring it to 16 kHz. Going down (48 kHz → 16 kHz), each output sample is the mean
// of the input samples it covers: a box filter, a crude low-pass so the drop doesn't alias. Going up (rare: an 8 kHz
// mic), straight-line interpolation.
export function toWhisperRate(channels: readonly Float32Array[], rate: number): Float32Array {
  const n = channels[0]?.length ?? 0;
  const mono = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) mono[i]! += ch[i]! / channels.length;
  if (rate === WHISPER_RATE) return mono;
  const ratio = rate / WHISPER_RATE;
  const out = new Float32Array(Math.floor(n / ratio));
  for (let i = 0; i < out.length; i++) {
    if (ratio > 1) {
      const from = Math.floor(i * ratio), to = Math.min(n, Math.floor((i + 1) * ratio));
      let sum = 0;
      for (let j = from; j < to; j++) sum += mono[j]!;
      out[i] = to > from ? sum / (to - from) : 0;
    } else {
      const x = i * ratio, j = Math.floor(x), f = x - j;
      out[i] = mono[j]! * (1 - f) + mono[Math.min(n - 1, j + 1)]! * f;
    }
  }
  return out;
}

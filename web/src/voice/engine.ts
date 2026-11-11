// Voice on the device (029): the page's side of the Whisper worker. Loaded by dynamic import on the first mic press,
// so neither this, the worker nor the speech library is in any page's first paint. One engine per page: every hold
// reuses its worker and the one model in it.

import { toWhisperRate } from "./audio";
import type { Backend, FromWorker, ToWorker } from "./protocol";

export type Heard = { text: string; ms: number; seconds: number; backend: Backend; made: number };
export type Loaded = { backend: Backend; made: number };
export type Engine = {
  load(onProgress: (loaded: number, total: number) => void): Promise<Loaded>;
  // Decode a recording (any format the browser plays: MP4/AAC, WebM/Opus, WAV) and turn it into text, all here.
  transcribe(recording: ArrayBuffer, decoder: BaseAudioContext): Promise<Heard>;
  dispose(): void;
};

// A worker that stops answering (iOS can kill it on its own) or has no model left: the page throws this engine away and
// starts a fresh one on the next press. 30 s is well past tiny.en's slowest (WebAssembly, a 10 s hold: ~4 s).
const ANSWER_MS = 30_000;
const dead = (message: string) => Object.assign(new Error(message), { name: "EngineDead" });

export function startEngine(backend?: Backend): Engine {
  const worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
  const send = (m: ToWorker, transfer: Transferable[] = []) => worker.postMessage(m, transfer);
  let nextId = 1;
  const waiting = new Map<number, { resolve: (v: Omit<Heard, "seconds">) => void; reject: (e: Error) => void }>();
  let onReady: { resolve: (b: Loaded) => void; reject: (e: Error) => void; progress: (l: number, t: number) => void } | null = null;
  let ready: Promise<Loaded> | null = null;

  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const m = e.data;
    if (m.type === "progress") onReady?.progress(m.loaded, m.total);
    else if (m.type === "ready") onReady?.resolve({ backend: m.backend, made: m.made });
    else if (m.type === "text") { waiting.get(m.id)?.resolve({ text: m.text, ms: m.ms, backend: m.backend, made: m.made }); waiting.delete(m.id); }
    else if (m.type === "error") {
      const err = m.fatal ? dead(m.message) : new Error(m.message);
      if (m.id === undefined) { onReady?.reject(err); ready = null; }
      else { waiting.get(m.id)?.reject(err); waiting.delete(m.id); }
    }
  };
  // The worker's script itself failing (a bad deploy, a blocked file) must end in a message, not a spinner.
  worker.onerror = (e) => {
    const err = dead(e.message || "the speech worker didn't start");
    onReady?.reject(err);
    ready = null;
    for (const w of waiting.values()) w.reject(err);
    waiting.clear();
  };

  return {
    load(onProgress) {
      ready ??= new Promise<Loaded>((resolve, reject) => {
        onReady = { resolve, reject, progress: onProgress };
        send({ type: "load", backend });
      });
      return ready;
    },
    // The deadline covers the whole hold, decode included, so no step can leave the button on "Turning it into text…".
    async transcribe(recording, decoder) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(dead("the speech worker stopped answering")), ANSWER_MS); });
      try { return await Promise.race([hear(recording, decoder), late]); } finally { clearTimeout(timer); }
    },
    dispose() { worker.terminate(); },
  };

  async function hear(recording: ArrayBuffer, decoder: BaseAudioContext): Promise<Heard> {
    const decoded = await decoder.decodeAudioData(recording);
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
    const audio = toWhisperRate(channels, decoded.sampleRate);
    const id = nextId++;
    const out = await new Promise<Omit<Heard, "seconds">>((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      send({ type: "transcribe", id, audio }, [audio.buffer]); // transferred, not copied: the page keeps no samples
    });
    return { ...out, seconds: decoded.duration };
  }
}

// Track V (029): speech to text on the device, the parts that aren't the speech library. Pure, so they're tested here
// and shared by the test page (/voice-test-2) and, later, the Desk's mic.
//
// iPhone, Oct 30 (Joshua): tiny.en on WebGPU read "find me a toaster that fits my kitchen" exactly, 0.42 s after he let
// go, but after a few holds Safari ran out of memory and reloaded the tab; base.en (205 MB) crashed it outright. So:
// tiny.en only; the model is made once per page and every hold reuses it; a WebGPU failure falls back to WebAssembly
// once; and a reload in the middle of a test starts the next visit on WebAssembly.

export type Backend = "webgpu" | "wasm";

// Messages between the page and the worker. Audio goes in and text comes out, both inside this browser tab.
export type ToWorker =
  | { type: "load"; backend?: Backend | undefined }
  | { type: "transcribe"; id: number; audio: Float32Array };

export type FromWorker =
  | { type: "progress"; loaded: number; total: number }
  | { type: "ready"; backend: Backend; made: number }
  | { type: "text"; id: number; text: string; ms: number; backend: Backend; made: number }
  // `fatal`: the worker has no model left, so the page starts a fresh one on the next press.
  | { type: "error"; id?: number; message: string; fatal?: boolean };

/** A loaded model: turn 16 kHz mono samples into text; free what it holds. */
export type Asr = { run(audio: Float32Array): Promise<string>; dispose(): Promise<void> };

export type AsrDeps = {
  /** Load the model on a backend (warm-up included). Called once per page, plus once more on a WebGPU failure. */
  make(backend: Backend): Promise<Asr>;
  hasGpu(): Promise<boolean>;
  post(m: FromWorker): void;
  now(): number;
};

/** The worker's message handler. Every hold reuses the one model; nothing here can send anything off the device. */
export function asrWorker(deps: AsrDeps): (m: ToWorker) => Promise<void> {
  let current: Promise<{ asr: Asr; backend: Backend }> | null = null;
  let fellBack = false;
  // How many models this worker has built: the page shows it, so "loaded once" is the worker's count, not a guess.
  let made = 0;
  const make = (b: Backend) => { made++; return deps.make(b); };

  async function load(force?: Backend) {
    const backend: Backend = force ?? ((await deps.hasGpu()) ? "webgpu" : "wasm");
    try { return { asr: await make(backend), backend }; } catch (e) {
      if (backend === "wasm") throw e;
      fellBack = true; // a GPU that can't load or warm the model falls back, rather than leaving the mic dead
      return { asr: await make("wasm"), backend: "wasm" as const };
    }
  }

  return async (m) => {
    if (m.type === "load") {
      current ??= load(m.backend);
      try { deps.post({ type: "ready", backend: (await current).backend, made }); }
      catch (err) { current = null; deps.post({ type: "error", message: (err as Error).message }); }
      return;
    }
    try {
      if (!current) { deps.post({ type: "error", id: m.id, message: "the model isn't loaded", fatal: true }); return; }
      let loaded = await current;
      const t0 = deps.now();
      let text: string;
      try { text = await loaded.asr.run(m.audio); } catch (e) {
        if (loaded.backend === "wasm" || fellBack) throw e;
        // WebGPU failed mid-run (device lost, out of memory): free it, load on WebAssembly once, and retry this hold.
        fellBack = true;
        const gpu = loaded.asr;
        current = (async () => { await gpu.dispose().catch(() => undefined); return { asr: await make("wasm"), backend: "wasm" as const }; })();
        try { loaded = await current; } catch (e2) {
          current = null; // no model left: say so, and the page starts a fresh worker on the next press
          deps.post({ type: "error", id: m.id, message: (e2 as Error).message, fatal: true });
          return;
        }
        text = await loaded.asr.run(m.audio);
      }
      deps.post({ type: "text", id: m.id, text, ms: Math.round(deps.now() - t0), backend: loaded.backend, made });
    } catch (err) { deps.post({ type: "error", id: m.id, message: (err as Error).message }); }
  };
}

/** Whisper keeps at most this many prompt tokens (half its 448-token window, less one): the worker trims the word list
 *  (core/src/ask/voice-words.ts) to it, counting <|startofprev|>. */
export const PROMPT_TOKENS_MAX = 223;

/** Whisper's words, tidied for the Ask box: its "[BLANK_AUDIO]" / "(upbeat music)" tags dropped, spaces collapsed. */
export function cleanHeard(text: string): string {
  const words = text.replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*|[♪♫]/g, " ").replace(/\s+/g, " ").trim();
  // What Whisper "hears" in silence or noise, alone (a lone "you", "The", "Uh."): nobody asks a shopping box only that,
  // so it counts as nothing heard.
  return /^(you|thank you|thanks for watching|the|a|uh|um)[.!]?$/i.test(words) ? "" : words;
}

/**
 * The words as they land in the Desk's Ask box (Track V 042, after Joshua's iPhone put "Air plane tickets." there):
 * Whisper ends nearly every line with a period, and sometimes a "!", which nobody types into a search box, so one trailing
 * run of "." / "!" / "…" goes. A "?" stays: a shopper asking "is this a scam?" asked a question. "air plane" is joined
 * the way the catalog spells it. /voice-test-2 keeps Whisper's raw words (cleanHeard) so the test log shows what it heard.
 */
export function askWords(text: string): string {
  return cleanHeard(text).replace(/\b([Aa])ir plane(s?)\b/g, "$1irplane$2").replace(/\s*(?:[.!]+|…)$/u, "");
}

// The test page's log, so Joshua's results survive Safari reloading the tab (/voice-test-2 only; the Desk keeps
// nothing). It holds the words and timings of each try, in this browser only. Storage is injected and every call is
// guarded: Safari's private windows and a full disk throw, and the page must still work without its log.

export type StoreLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type VoiceRun = { at: number; text: string; lagMs: number; whisperMs: number; seconds: number; backend: Backend };
export type VoiceLog = {
  runs: VoiceRun[];
  /** How many times this page has been opened since the log was cleared: one per hold means Safari is reloading it. */
  opens: number;
  /** Set from a press (or the first load) until its text arrives: still set on the next open = the tab died mid-test. */
  busy: Backend | "loading" | null;
};

export const VOICE_LOG_KEY = "goose.voice-test-2";
export const MAX_RUNS = 50;
const EMPTY: VoiceLog = { runs: [], opens: 0, busy: null };

export function readLog(store: StoreLike | null): VoiceLog {
  try {
    const v = JSON.parse(store?.getItem(VOICE_LOG_KEY) ?? "null") as Partial<VoiceLog> | null;
    if (!v || !Array.isArray(v.runs)) return { ...EMPTY };
    // A saved try from an older page, or edited by hand, is dropped rather than breaking the list.
    const runs = v.runs.filter((r: VoiceRun) => r && typeof r.text === "string" && typeof r.lagMs === "number" && typeof r.seconds === "number");
    return { runs, opens: Number(v.opens) || 0, busy: v.busy ?? null };
  } catch { return { ...EMPTY }; }
}

function write(store: StoreLike | null, log: VoiceLog): VoiceLog {
  try { store?.setItem(VOICE_LOG_KEY, JSON.stringify(log)); } catch { /* private window or full: the page goes on */ }
  return log;
}

/** The page opened: count it, and say whether the last visit died mid-test (and on what). */
export function pageOpened(store: StoreLike | null): { log: VoiceLog; diedDuring: VoiceLog["busy"] } {
  const before = readLog(store);
  return { log: write(store, { ...before, opens: before.opens + 1, busy: null }), diedDuring: before.busy };
}

/** A visit after the tab died on WebGPU (or while loading, where WebGPU is the likely culprit) starts on WebAssembly. */
export function startBackend(diedDuring: VoiceLog["busy"]): Backend | undefined {
  return diedDuring === "webgpu" || diedDuring === "loading" ? "wasm" : undefined;
}

/** What the browser says about itself: enough to tell an iPhone or iPad. */
export type NavLike = { userAgent: string; platform?: string; maxTouchPoints?: number };

/** iOS or iPadOS, including an iPad in desktop mode, which reports itself as a Mac ("MacIntel") but has touch points. */
export function isIOS(n: NavLike): boolean {
  return /\b(iPhone|iPad|iPod)\b/.test(n.userAgent) || (n.platform === "MacIntel" && (n.maxTouchPoints ?? 0) > 1);
}

/**
 * Which backend Whisper starts on (Joshua's iPhone re-test, Oct 30): on iOS always WebAssembly, never WebGPU, which
 * Safari killed for memory after 2 or 3 holds (WASM: 10 of 10). Elsewhere WebGPU first with the WASM fallback (undefined),
 * or WASM after a visit that died on WebGPU.
 */
export function speechBackend(n: NavLike, diedDuring: VoiceLog["busy"] = null): Backend | undefined {
  return isIOS(n) ? "wasm" : startBackend(diedDuring);
}

export const markBusy = (store: StoreLike | null, busy: VoiceLog["busy"]) => write(store, { ...readLog(store), busy });

export function addRun(store: StoreLike | null, run: VoiceRun): VoiceLog {
  const log = readLog(store);
  return write(store, { ...log, runs: [...log.runs, run].slice(-MAX_RUNS), busy: null });
}

export function clearLog(store: StoreLike | null): VoiceLog {
  try { store?.removeItem(VOICE_LOG_KEY); } catch { /* as above */ }
  return { ...EMPTY };
}

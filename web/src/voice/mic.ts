// Track V phase 2 (029): Goose's mic, for the Desk's "Ask for anything" box. Hold to talk, let go, and the words come
// back to the page like typed ones; Whisper (tiny.en) turns them into text inside this browser tab, with ONNX Runtime
// from our own origin. A quick tap works too (tap to start, tap again to stop), for VoiceOver and switch users, whose
// double-tap is shorter than any hold. No framework here: `HoldToTalk.tsx` is the React face of it.
//
// What it can do is only this: record, hand the recording to the worker on this page, and give the words to `onText`.
// It fetches nothing itself, keeps nothing, and can't press anything on the page (core/test/voice-privacy).
// The speech library and the model load on the first press only (dynamic import), never in a page's first paint.

import { askWords, speechBackend } from "@goose/core/ondevice";
import { pickMimeType } from "./audio";
import { showVoiceDebug } from "./debug";
import type { Engine } from "./engine";

export type MicState =
  | { kind: "off" } // not pressed yet on this page: the first press gets it ready
  | { kind: "loading"; pct: number | null }
  | { kind: "ready" }
  | { kind: "starting" }
  | { kind: "listening"; tap: boolean } // tap: started by a quick tap, so the next tap stops it
  | { kind: "working" }
  | { kind: "error"; why: "blocked" | "short" | "empty" | "slow" | "failed"; message: string };

/** An Ask is a sentence: a recording stops itself here. */
export const MAX_HOLD_MS = 10_000;
/** A press let go sooner than this is a tap: it keeps recording until the next tap. */
const TAP_MS = 300;
/** The model download may take minutes on a phone network; only this long with no progress at all is "stuck". */
const STALL_MS = 30_000;
/** The mic permission prompt left open, or a mic that never answers. */
const START_MS = 15_000;

/** Everything the mic needs. Where any is missing, show no mic: the keyboard's own dictation stays the way to talk. */
export function canHear(): boolean {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined"
    && typeof Worker !== "undefined" && typeof WebAssembly !== "undefined" && typeof AudioContext !== "undefined";
}

/** The line to show (or read out) for a state. */
export function micWords(s: MicState): string {
  switch (s.kind) {
    // Each a whole sentence (042, item B): the Desk shows the privacy line right after it, and the two must read apart.
    case "off": return "Hold to talk.";
    case "loading": return `Getting the mic ready…${s.pct === null ? "" : ` ${s.pct}%`}`;
    case "ready": return "Hold to talk, or tap to start.";
    case "starting": return "Starting the mic…";
    case "listening": return s.tap ? "Listening… tap again when you're done." : "Listening… let go when you're done.";
    case "working": return "Turning it into text…";
    case "error": return s.message;
  }
}

// One engine per page, shared by every mic on it: one model in memory (the iPhone's limit, 029).
let engine: Engine | null = null;
let loading: Promise<Engine> | null = null;
let decoder: AudioContext | null = null;
const progress = new Set<(pct: number) => void>();

function getReady(): Promise<Engine> {
  loading ??= (async () => {
    decoder ??= new AudioContext();
    const { startEngine } = await import("./engine");
    // iOS: WebAssembly only, the path /voice-test-2 proved on Joshua's iPhone. Decided by default (042): no `diedDuring`
    // here. That fallback needs a log in this browser's storage, which the Desk mic doesn't keep, and on iOS it changes
    // nothing (always WebAssembly); elsewhere a WebGPU failure mid-hold already falls back to WebAssembly in the worker.
    const e = startEngine(speechBackend(navigator));
    let loaded: Awaited<ReturnType<Engine["load"]>>;
    try { loaded = await e.load((got, total) => { if (total > 0) for (const f of progress) f(Math.floor((100 * got) / total)); }); }
    catch (err) { e.dispose(); throw err; }
    showVoiceDebug(loaded.backend); // ?debug=voice only: "wasm · tiny.en"
    engine = e;
    return e;
  })().catch((err: unknown) => { loading = null; throw err; });
  return loading;
}

function dropEngine() { engine?.dispose(); engine = null; loading = null; }

const mime = () => typeof MediaRecorder === "undefined" ? undefined : pickMimeType((t) => MediaRecorder.isTypeSupported(t));
const TRY_AGAIN = "You can still type, or use your keyboard's mic.";

/** One mic button's behaviour: `press`/`release` from the button, `attach` while it's on the page (returns detach). */
export function createMic(opts: { onState: (s: MicState) => void; onText: (words: string) => void; maxMs?: number }) {
  let state: MicState = { kind: engine ? "ready" : "off" };
  let gone = false; // detached: no more states or words for a page that's moved on
  const set = (s: MicState) => { state = s; if (!gone) opts.onState(s); };
  let pressNo = 0;
  let rec: MediaRecorder | null = null;
  let startedAt = 0;
  let stopRecording: (() => void) | null = null;

  async function readyUp() {
    set({ kind: "loading", pct: null });
    let stall = setTimeout(stalled, STALL_MS);
    function stalled() { if (state.kind === "loading") set({ kind: "error", why: "slow", message: "The speech model is slow to arrive. Press again to keep waiting, or type." }); }
    const onPct = (pct: number) => {
      clearTimeout(stall);
      stall = setTimeout(stalled, STALL_MS);
      if (state.kind === "loading") set({ kind: "loading", pct });
    };
    progress.add(onPct);
    // The permission prompt comes with the first press, not in the middle of the first thing you say.
    const mic = navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => s.getTracks().forEach((t) => t.stop()));
    try {
      await Promise.all([getReady(), mic]);
      if (state.kind === "loading" || state.kind === "error") set({ kind: "ready" });
    } catch (e) {
      set((e as Error).name === "NotAllowedError"
        ? { kind: "error", why: "blocked", message: `The mic is blocked for this site. ${TRY_AGAIN}` }
        : { kind: "error", why: "failed", message: `The mic couldn't get ready on this device. ${TRY_AGAIN}` });
    } finally { clearTimeout(stall); progress.delete(onPct); }
  }

  async function press() {
    if (state.kind === "listening" && state.tap) { stopRecording?.(); return; } // the second tap
    if (state.kind === "off" || state.kind === "loading" || (state.kind === "error" && !engine)) {
      if (state.kind !== "loading") void readyUp(); // a slow load resumes the same download, never a second one
      return;
    }
    if (state.kind !== "ready" && state.kind !== "error") return; // one recording at a time
    const mine = ++pressNo;
    set({ kind: "starting" });
    let tap = false;
    startedAt = performance.now();
    let stream: MediaStream;
    let late = false;
    const asked = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    // A mic allowed after we gave up must not stay on: stop it the moment it arrives.
    asked.then((s) => { if (late) s.getTracks().forEach((t) => t.stop()); }, () => {});
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      stream = await Promise.race([asked, new Promise<never>((_, reject) => { timer = setTimeout(() => { late = true; reject(new Error("slow")); }, START_MS); })]);
    } catch {
      if (mine === pressNo) { pressNo++; set({ kind: "error", why: "failed", message: `The mic didn't start. Try again, or type.` }); }
      return;
    } finally { clearTimeout(timer); }
    if (mine !== pressNo || gone) { stream.getTracks().forEach((t) => t.stop()); return; } // it came too late
    // Let go while the mic was starting: that press was a tap, so record until the next tap.
    tap = !held;
    let chunks: Blob[] = [];
    let r: MediaRecorder;
    const type = mime();
    try { r = new MediaRecorder(stream, type ? { mimeType: type } : undefined); r.start(); }
    catch { stream.getTracks().forEach((t) => t.stop()); set({ kind: "error", why: "failed", message: "The mic didn't start. Try again, or type." }); return; }
    const started = performance.now();
    let stopped = 0;
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop()); // the mic light goes off as soon as you're done
      const recording = new Blob(chunks, { type: r.mimeType });
      chunks = [];
      void finish(recording, stopped - started);
    };
    rec = r;
    set({ kind: "listening", tap });
    stopRecording = () => {
      if (rec !== r) return; // a stale timer, or a recording already stopped
      stopped = performance.now();
      rec = null;
      stopRecording = null;
      r.stop();
      set({ kind: "working" });
    };
    const stop = stopRecording;
    setTimeout(stop, opts.maxMs ?? MAX_HOLD_MS);
  }

  let held = false;
  function release() {
    held = false;
    if (state.kind !== "listening" || state.tap) return; // "starting": press() sees `held` and records as a tap
    if (performance.now() - startedAt < TAP_MS) { set({ kind: "listening", tap: true }); return; } // a quick tap
    stopRecording?.();
  }

  /** Stop everything now: leaving the page or the tab, or the button going away. */
  function stopAll() {
    held = false;
    pressNo++; // a stream still on its way is stopped when it arrives
    if (state.kind === "starting") set({ kind: engine ? "ready" : "off" }); // so the next press works
    stopRecording?.();
  }

  async function finish(recording: Blob, heldMs: number) {
    if (heldMs < TAP_MS) { set({ kind: "error", why: "short", message: "That was too short. Hold to talk, or tap to start and tap again to stop." }); return; }
    try {
      const out = await engine!.transcribe(await recording.arrayBuffer(), decoder!);
      showVoiceDebug(out.backend); // the backend only (it can switch to WebAssembly mid-hold off iOS), never the words
      const words = askWords(out.text);
      if (!words) { set({ kind: "error", why: "empty", message: "Didn't catch that. Try again, or type." }); return; }
      set({ kind: "ready" });
      if (!gone) opts.onText(words);
    } catch (e) {
      // A worker that died or has no model left is thrown away; the next press loads a fresh one.
      if ((e as Error).name === "EngineDead") dropEngine();
      set({ kind: "error", why: "failed", message: "Didn't catch that. Try again, or type." });
    }
  }

  return {
    state: () => state,
    press: () => { if (state.kind !== "starting") held = true; void press(); }, // a second tap while starting is ignored
    release,
    /** While the button is on the page: leaving the page or the tab mid-recording stops it (and the mic light). */
    attach() {
      gone = false;
      const away = () => { if (document.hidden) stopAll(); };
      addEventListener("pagehide", stopAll);
      document.addEventListener("visibilitychange", away);
      return () => {
        stopAll();
        gone = true;
        removeEventListener("pagehide", stopAll);
        document.removeEventListener("visibilitychange", away);
      };
    },
  };
}

// Track V (029): /voice-test-2, press and hold to talk, Whisper (tiny.en) on the device. This file is the page's first
// paint; the speech library and the model load only on the first press (engine.ts, by dynamic import), once per page.
// Each try's words and timings are kept in this browser (this test page only), so a test survives Safari reloading the
// tab, and a reload in the middle of a hold is shown and starts the next visit on WebAssembly (`@goose/core/ondevice`).

import { addRun, clearLog, markBusy, pageOpened, speechBackend, type Backend, type StoreLike, type VoiceLog } from "@goose/core/ondevice";
import { pickMimeType } from "./audio";
import type { Engine, Heard } from "./engine";

const $ = (id: string) => document.getElementById(id)!;
const hold = $("hold") as HTMLButtonElement;
const status = (s: string, bad = false) => { $("status").textContent = s; $("status").classList.toggle("bad", bad); };

const store: StoreLike | null = (() => { try { return window.localStorage; } catch { return null; } })();
const opened = pageOpened(store);
// `?backend=wasm` skips the GPU, to compare the two. iOS is always WebAssembly (`speechBackend`, Joshua's re-test).
const force: Backend | undefined = new URLSearchParams(location.search).get("backend") === "wasm" ? "wasm" : speechBackend(navigator, opened.diedDuring);
if (opened.diedDuring) {
  $("warn").hidden = false;
  $("warn").textContent = `The page reloaded in the middle of a test (${opened.diedDuring === "loading" ? "while the model loaded" : `on ${opened.diedDuring}`}); Safari probably ran out of memory.${force === "wasm" ? " This visit uses WebAssembly instead." : ""} The tries before it are kept below.`;
}
const showOpens = (n: number) => { $("opens").textContent = `${n} time${n === 1 ? "" : "s"} since the last Clear`; };
showOpens(opened.log.opens);

function show(log: VoiceLog) {
  $("runs").textContent = `${runs} on this page · ${log.runs.length} saved`;
  $("log").replaceChildren(...log.runs.slice().reverse().map((r) => {
    const li = document.createElement("li");
    li.textContent = `“${r.text}” · ${(r.lagMs / 1000).toFixed(2)} s for ${r.seconds.toFixed(1)} s of audio · ${r.backend}`;
    return li;
  }));
}
let runs = 0;
show(opened.log);
$("clear").onclick = () => { runs = 0; show(clearLog(store)); showOpens(0); status("Cleared."); };
// The worker's own count of models built, so "once" is what the worker did, not what the page assumes; a worker the
// page had to replace counts too.
let workers = 0;
const showMade = (made: number) => {
  $("loads").textContent = (made === 1 && workers === 1 ? "loaded once on this page" : `loaded ${made} time${made === 1 ? "" : "s"} by this worker`)
    + (workers > 1 ? ` (speech worker restarted ${workers - 1}×)` : "");
};

let engine: Engine | null = null;
let readying: Promise<void> | null = null;
let decoder: AudioContext | null = null;
let backend: Backend | null = null;
const mime = typeof MediaRecorder === "undefined" ? undefined : pickMimeType((t) => MediaRecorder.isTypeSupported(t));

// First press: fetch the library and the model (progress on the button), and ask for the mic at the same time, so the
// permission prompt doesn't land in the middle of the first thing you say. `ask` is false for the measuring harness.
function readyUp(ask = true): Promise<void> {
  readying ??= (async () => {
    const t0 = performance.now();
    hold.dataset.state = "loading";
    hold.setAttribute("aria-busy", "true");
    hold.textContent = "Getting the mic ready…";
    status("Getting the mic ready. The first time downloads the speech model; after that it's kept on this device.");
    markBusy(store, "loading");
    decoder ??= new AudioContext();
    const mic = ask ? navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => s.getTracks().forEach((t) => t.stop())) : Promise.resolve();
    const { startEngine } = await import("./engine");
    if (!engine) { engine = startEngine(force); workers++; }
    const [loaded] = await Promise.all([engine.load((got, total) => {
      if (total > 0) hold.textContent = `Getting the mic ready… ${Math.floor((100 * got) / total)}%`;
    }), mic]);
    backend = loaded.backend;
    markBusy(store, null);
    $("load").textContent = `${((performance.now() - t0) / 1000).toFixed(1)} s`;
    $("backend").textContent = `${backend} · tiny.en`;
    showMade(loaded.made);
    $("format").textContent = mime ?? "the browser's default";
    hold.dataset.state = "ready";
    hold.removeAttribute("aria-busy");
    hold.textContent = "Hold to talk";
    status("Ready. Hold the button, talk, and let go when you're done.");
  })().catch((e: Error) => {
    readying = null;
    markBusy(store, null);
    // Only a refused mic keeps the worker (it may have loaded the model meanwhile); any other failure starts fresh.
    if (e.name !== "NotAllowedError") { engine?.dispose(); engine = null; }
    hold.dataset.state = "";
    hold.removeAttribute("aria-busy");
    hold.textContent = "Hold to talk";
    status(e.name === "NotAllowedError" ? "The mic is blocked. Allow it for this site in Settings › Apps › Safari › Microphone, then reload." : `The mic couldn't get ready: ${e.message}`, true);
  });
  return readying;
}

// Each press gets a number: a stream that arrives after its own press ended (let go, or a newer press began) is
// stopped at once, so two quick presses can't leave a recorder, and the mic light, running.
let pressNo = 0;
let pressed = false;
let rec: MediaRecorder | null = null;
let releasedAt = 0;
// An Ask is a sentence; a hold that never ends (the page went to the background, focus moved mid-hold) stops itself.
const MAX_HOLD_MS = 10_000;

async function press() {
  if (!engine || hold.dataset.state !== "ready") { void readyUp(); return; }
  const mine = ++pressNo;
  pressed = true;
  hold.dataset.state = "starting";
  hold.textContent = "Starting the mic…";
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } }); }
  catch (e) { idle(); status(`The mic didn't start: ${(e as Error).message}`, true); return; }
  if (!pressed || mine !== pressNo) {
    stream.getTracks().forEach((t) => t.stop());
    if (mine === pressNo) { idle(); status("Keep holding the button while you talk."); }
    return;
  }
  let chunks: Blob[] = [];
  let r: MediaRecorder;
  try {
    r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    r.start();
  } catch (e) { // a recorder that won't start must not leave the mic on, or the button stuck on "Starting"
    stream.getTracks().forEach((t) => t.stop());
    idle();
    status(`The recorder didn't start: ${(e as Error).message}`, true);
    return;
  }
  r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const started = performance.now();
  r.onstop = () => {
    stream.getTracks().forEach((t) => t.stop()); // the mic light goes off as soon as you let go
    const recording = new Blob(chunks, { type: r.mimeType });
    chunks = [];
    void finish(recording, r.mimeType, releasedAt - started);
  };
  rec = r;
  hold.dataset.state = "listening";
  hold.textContent = "Listening… let go when you're done";
  status("Listening.");
  setTimeout(() => { if (rec === r) { release(); status("That's 10 seconds, the most one hold takes. Turning it into text…"); } }, MAX_HOLD_MS);
}

function idle() {
  hold.dataset.state = "ready";
  hold.textContent = "Hold to talk";
}

function release() {
  pressed = false;
  if (hold.dataset.state === "starting") idle();
  if (rec?.state !== "recording") return;
  releasedAt = performance.now();
  rec.stop();
  rec = null;
  // One recording at a time: the button takes no new hold until this one's text is back, so two runs never share
  // the phone's memory (press() ignores anything but "ready").
  hold.dataset.state = "working";
  hold.textContent = "Turning it into text…";
}

async function finish(recording: Blob, type: string, heldMs: number) {
  if (heldMs < 300) { idle(); status("That was too short. Hold the button the whole time you talk."); return; }
  $("format").textContent = type || "the browser's default";
  hold.setAttribute("aria-busy", "true");
  status("Turning it into text…");
  try {
    const out = await transcribe(await recording.arrayBuffer());
    status("Done. Hold again to try another.");
    $("transcript").textContent = out.text || "(heard nothing)";
  } catch (e) {
    markBusy(store, null);
    status(`Didn't catch that: ${(e as Error).message}`, true);
    // A worker that died or has no model left is thrown away; the next press loads a fresh one.
    if ((e as Error).name === "EngineDead") { engine?.dispose(); engine = null; readying = null; }
  } finally {
    hold.removeAttribute("aria-busy");
    if (hold.dataset.state === "working") idle();
  }
}

// Shared by the button and the harness: decode, turn into text, show and keep the numbers. Marked busy until the text
// is back, so a tab Safari kills in between is noticed on the next open.
async function transcribe(bytes: ArrayBuffer): Promise<Heard & { lagMs: number }> {
  markBusy(store, backend);
  const out = await engine!.transcribe(bytes, decoder!);
  const lagMs = Math.round(performance.now() - releasedAt);
  if (out.backend !== backend) { backend = out.backend; $("backend").textContent = `${backend} · tiny.en (WebGPU failed, so it switched)`; }
  showMade(out.made);
  $("lag").textContent = `${(lagMs / 1000).toFixed(2)} s (of which Whisper ${(out.ms / 1000).toFixed(2)} s, for ${out.seconds.toFixed(1)} s of audio)`;
  runs++;
  show(addRun(store, { at: Date.now(), text: out.text, lagMs, whisperMs: out.ms, seconds: Math.round(out.seconds * 10) / 10, backend: out.backend }));
  return { ...out, lagMs };
}

hold.addEventListener("pointerdown", (e) => { hold.setPointerCapture(e.pointerId); void press(); });
hold.addEventListener("pointerup", release);
hold.addEventListener("pointercancel", release);
hold.addEventListener("lostpointercapture", release);
hold.addEventListener("blur", release);
// Leaving the page on purpose (closing the tab, going elsewhere, even into the back/forward cache) isn't a crash:
// clear the busy mark so the next open doesn't warn. A tab Safari kills for memory gets no pagehide, so its mark stays.
addEventListener("pagehide", () => { release(); markBusy(store, null); });
document.addEventListener("visibilitychange", () => { if (document.hidden) release(); });
hold.addEventListener("contextmenu", (e) => e.preventDefault());
hold.addEventListener("keydown", (e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); void press(); } });
hold.addEventListener("keyup", (e) => { if (e.key === " " || e.key === "Enter") release(); });

// The measuring harness (spikes/v-voice-on-device/run.ts) feeds the s8 clips through the same decode and worker path.
// It hands the bytes in itself; the page fetches nothing.
(window as unknown as { __voiceTest2: unknown }).__voiceTest2 = {
  ready: () => readyUp(false),
  file: (bytes: ArrayBuffer) => { releasedAt = performance.now(); return transcribe(bytes); },
};

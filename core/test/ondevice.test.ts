import { describe, expect, it } from "vitest";
import { MAX_RUNS, addRun, asrWorker, cleanHeard, clearLog, isIOS, speechBackend, markBusy, pageOpened, readLog, startBackend, type Asr, type Backend, type FromWorker, type StoreLike, type VoiceRun } from "../src/ask/ondevice.ts";

/** A fake model factory: counts loads per backend; `fail` makes that backend's load or run throw. */
function rig(opts: { gpu?: boolean; failLoad?: Backend; failRun?: Backend } = {}) {
  const made: Backend[] = [], disposed: Backend[] = [], posted: FromWorker[] = [];
  const make = async (backend: Backend): Promise<Asr> => {
    made.push(backend);
    if (opts.failLoad === backend) throw new Error(`${backend} load failed`);
    return {
      async run(audio) { if (opts.failRun === backend) throw new Error(`${backend} run failed`); return `${audio.length} samples on ${backend}`; },
      async dispose() { disposed.push(backend); },
    };
  };
  const handle = asrWorker({ make, hasGpu: async () => opts.gpu ?? true, post: (m) => posted.push(m), now: () => 0 });
  return { made, disposed, posted, handle, texts: () => posted.filter((m) => m.type === "text") };
}
const hold = (id: number) => ({ type: "transcribe" as const, id, audio: new Float32Array(16000) });

describe("Track V: on-device speech, the worker's message path (029)", () => {
  it("model_made_once_for_every_hold: ten holds after one load call the model factory once", async () => {
    const r = rig();
    await r.handle({ type: "load" });
    await r.handle({ type: "load" }); // a second press while ready
    for (let i = 1; i <= 10; i++) await r.handle(hold(i));
    expect(r.made).toEqual(["webgpu"]);
    expect(r.texts()).toHaveLength(10);
    expect(r.texts().every((m) => m.type === "text" && m.backend === "webgpu" && m.made === 1)).toBe(true);
  });

  it("no GPU: WebAssembly from the start", async () => {
    const r = rig({ gpu: false });
    await r.handle({ type: "load" });
    expect(r.posted).toContainEqual({ type: "ready", backend: "wasm", made: 1 });
    expect(r.made).toEqual(["wasm"]);
  });

  it("a WebGPU load failure falls back to WebAssembly instead of a dead mic", async () => {
    const r = rig({ failLoad: "webgpu" });
    await r.handle({ type: "load" });
    expect(r.made).toEqual(["webgpu", "wasm"]);
    expect(r.posted).toContainEqual({ type: "ready", backend: "wasm", made: 2 }); // the page shows 2, not "once"
  });

  it("a WebGPU failure mid-run: the GPU model is freed, WebAssembly loads once, the same hold still gets its text", async () => {
    const r = rig({ failRun: "webgpu" });
    await r.handle({ type: "load" });
    await r.handle(hold(1));
    await r.handle(hold(2));
    expect(r.made).toEqual(["webgpu", "wasm"]);
    expect(r.disposed).toEqual(["webgpu"]);
    expect(r.texts().map((m) => m.type === "text" && [m.id, m.backend, m.made])).toEqual([[1, "wasm", 2], [2, "wasm", 2]]);
  });

  it("a WebGPU failure mid-run whose WebAssembly load also fails: a fatal error, so the page starts afresh", async () => {
    const r = rig({ failRun: "webgpu", failLoad: "wasm" });
    await r.handle({ type: "load" });
    await r.handle(hold(1));
    expect(r.posted.at(-1)).toEqual({ type: "error", id: 1, message: "wasm load failed", fatal: true });
    await r.handle(hold(2));
    expect(r.posted.at(-1)).toMatchObject({ type: "error", id: 2, fatal: true });
    expect(r.made).toEqual(["webgpu", "wasm"]); // never retried in a loop
  });

  it("a WebAssembly failure is reported on that hold, never retried in a loop", async () => {
    const r = rig({ gpu: false, failRun: "wasm" });
    await r.handle({ type: "load" });
    await r.handle(hold(7));
    expect(r.made).toEqual(["wasm"]);
    expect(r.posted.at(-1)).toEqual({ type: "error", id: 7, message: "wasm run failed" });
  });

  it("a load that fails everywhere is reported, and the next press tries again", async () => {
    const r = rig({ gpu: false, failLoad: "wasm" });
    await r.handle({ type: "load" });
    await r.handle({ type: "load" });
    expect(r.made).toEqual(["wasm", "wasm"]);
    expect(r.posted.filter((m) => m.type === "error")).toHaveLength(2);
  });

  it("a hold before any load gets an error, not a hang", async () => {
    const r = rig();
    await r.handle(hold(1));
    expect(r.posted).toEqual([{ type: "error", id: 1, message: "the model isn't loaded", fatal: true }]);
  });
});

/** A Storage stand-in; `broken` throws on every call, as Safari's private windows can. */
function store(broken = false): StoreLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  const guard = () => { if (broken) throw new Error("QuotaExceededError"); };
  return { data, getItem: (k) => (guard(), data.get(k) ?? null), setItem: (k, v) => { guard(); data.set(k, v); }, removeItem: (k) => { guard(); data.delete(k); } };
}
const RUN: VoiceRun = { at: 1, text: "Find me a toaster that fits my kitchen.", lagMs: 420, whisperMs: 400, seconds: 6.5, backend: "webgpu" };

describe("Track V: the test page's log survives a reload (029)", () => {
  it("runs survive a reload, and each open is counted", () => {
    const s = store();
    pageOpened(s);
    addRun(s, RUN);
    const { log, diedDuring } = pageOpened(s);
    expect(log.runs).toEqual([RUN]);
    expect(log.opens).toBe(2);
    expect(diedDuring).toBeNull();
  });

  it("a tab that died mid-hold on WebGPU is noticed, and the next visit starts on WebAssembly", () => {
    const s = store();
    pageOpened(s);
    markBusy(s, "webgpu");
    const { diedDuring } = pageOpened(s);
    expect(diedDuring).toBe("webgpu");
    expect(startBackend(diedDuring)).toBe("wasm");
    expect(readLog(s).busy).toBeNull(); // noticed once, not on every later open
    expect(startBackend(pageOpened(s).diedDuring)).toBeUndefined();
  });

  it("dying while the model loads also starts the next visit on WebAssembly; dying on WebAssembly changes nothing", () => {
    expect(startBackend("loading")).toBe("wasm");
    expect(startBackend("wasm")).toBeUndefined();
    expect(startBackend(null)).toBeUndefined();
  });

  it("a finished run clears the busy mark; the log keeps the last MAX_RUNS", () => {
    const s = store();
    markBusy(s, "webgpu");
    for (let i = 0; i < MAX_RUNS + 5; i++) addRun(s, { ...RUN, at: i });
    const log = readLog(s);
    expect(log.busy).toBeNull();
    expect(log.runs).toHaveLength(MAX_RUNS);
    expect(log.runs[0]!.at).toBe(5);
  });

  it("storage that throws (a private window) or holds junk never breaks the page", () => {
    const bad = store(true);
    expect(() => { pageOpened(bad); markBusy(bad, "webgpu"); addRun(bad, RUN); clearLog(bad); }).not.toThrow();
    expect(readLog(bad)).toEqual({ runs: [], opens: 0, busy: null });
    expect(readLog(null).runs).toEqual([]);
    const junk = store();
    junk.data.set("goose.voice-test-2", "{not json");
    expect(readLog(junk).runs).toEqual([]);
    junk.data.set("goose.voice-test-2", JSON.stringify({ runs: [RUN, null, { text: 3 }], opens: 2 }));
    expect(readLog(junk).runs).toEqual([RUN]);
  });

  it("Clear empties it", () => {
    const s = store();
    addRun(s, RUN);
    clearLog(s);
    expect(readLog(s).runs).toEqual([]);
  });
});

describe("Track V: the Desk mic's words (029)", () => {
  it("Whisper's tags are dropped, so silence gives no words and the box gets only what was said", () => {
    expect(cleanHeard(" [BLANK_AUDIO]")).toBe("");
    expect(cleanHeard("(upbeat music)")).toBe("");
    expect(cleanHeard(" *coughs* Find me a toaster  that fits my kitchen. ")).toBe("Find me a toaster that fits my kitchen.");
    expect(cleanHeard("♪ ♪")).toBe("");
    expect(cleanHeard(" you")).toBe("");
    expect(cleanHeard("Thank you.")).toBe("");
    expect(cleanHeard("Thank you, find me a kettle.")).toBe("Thank you, find me a kettle.");
    // White noise with no voice, with the word list (029): a lone filler word is nothing heard; in a sentence it stays.
    for (const lone of ["The", "the.", " A ", "Uh.", "um"]) expect(cleanHeard(lone), lone).toBe("");
    expect(cleanHeard("The Harbor jacket in black.")).toBe("The Harbor jacket in black.");
  });
});

describe("speechBackend: iOS is WebAssembly only (Joshua's iPhone re-test, Oct 30)", () => {
  const IPHONE = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1", platform: "iPhone", maxTouchPoints: 5 };
  const IPAD_DESKTOP = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15", platform: "MacIntel", maxTouchPoints: 5 };
  const MAC_SAFARI = { ...IPAD_DESKTOP, maxTouchPoints: 0 };
  const CHROME = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36", platform: "MacIntel", maxTouchPoints: 0 };
  const IPHONE_CHROME = { ...IPHONE, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1" };
  const IPHONE_FIREFOX = { ...IPHONE, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/144.0 Mobile/15E148 Safari/605.1.15" };
  const IPAD_CHROME_DESKTOP = { ...IPAD_DESKTOP, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Safari/605.1.15" };
  const WINDOWS_TOUCH = { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36", platform: "Win32", maxTouchPoints: 10 };
  const ANDROID = { userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36", platform: "Linux armv81", maxTouchPoints: 5 };

  it("iPhone Safari, Chrome and Firefox on iOS (WebKit too), and an iPad in desktop mode: WebAssembly, never WebGPU, whatever the last visit did", () => {
    for (const n of [IPHONE, IPHONE_CHROME, IPHONE_FIREFOX, IPAD_DESKTOP, IPAD_CHROME_DESKTOP]) {
      expect(isIOS(n)).toBe(true);
      for (const died of [null, "loading", "webgpu", "wasm"] as const) expect(speechBackend(n, died)).toBe("wasm");
    }
  });

  it("macOS Safari, Chrome, a Windows touch laptop and Android: WebGPU first with the WASM fallback; WASM after a visit that died on WebGPU", () => {
    for (const n of [MAC_SAFARI, CHROME, WINDOWS_TOUCH, ANDROID]) {
      expect(isIOS(n)).toBe(false);
      expect(speechBackend(n)).toBeUndefined();
      expect(speechBackend(n, "webgpu")).toBe("wasm");
    }
  });
});

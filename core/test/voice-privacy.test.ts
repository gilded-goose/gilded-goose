// Track V (029): what the claims line "Speech is turned into text on your device; your voice is never sent anywhere"
// rests on, read from the code the browser runs. The worker's message path is tested in ondevice.test.ts.

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = new URL("../../web/src/voice/", import.meta.url);
const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f));
const src = (f: string) => readFileSync(new URL(f, dir), "utf8");
/** The code alone: a comment saying what the mic can't do mustn't trip the check. */
const code = (f: string) => src(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("Track V: your voice never leaves the device (029)", () => {
  it("nothing in web/src/voice can send anything: no fetch, XHR, WebSocket, beacon or server path", () => {
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      expect(src(f), f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|["'`]\/api\//);
    }
  });

  it("every mic loads ONNX Runtime from our own origin, and the worker takes weights only from the model hub", () => {
    // Unconditionally, at the worker's top level: no flag, no page, no jsDelivr.
    expect(code("whisper.worker.ts")).toMatch(/^delete env\.backends\.onnx\.wasm!\.wasmPaths;$/m);
    for (const f of files) expect(code(f), f).not.toMatch(/jsdelivr|wasmPaths\s*=/i);
    expect(src("mic.ts")).toMatch(/startEngine\(speechBackend\(navigator\)\)/);
    expect(src("whisper.worker.ts")).toMatch(/env\.allowLocalModels = false/);
  });

  it("voice never approves: the mic's only way out is the words it hands to onText", () => {
    for (const f of ["mic.ts", "HoldToTalk.tsx"]) expect(code(f), f).not.toMatch(/approve|\/cart|location\.|\.click\(\)|requestSubmit|\.submit\(/i);
    expect(src("HoldToTalk.tsx")).toMatch(/onText: \(words: string\) => void;/);
  });
});

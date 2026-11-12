// 034 (review fix 4): web/src/speech.ts run for real against a fake Audio and a fake speechSynthesis (shared Lesson 19:
// the fake refuses play() the way a browser does, and fires onerror late, after a newer line started).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { TAP_TO_BUY } from "../src/ask/copy.ts";
import { VOICE_SHOPPING } from "../src/ask/voice.ts";

type Fake = { src: string; muted: boolean; onerror: (() => void) | null; play: () => Promise<void>; pause: () => void };
let made: Fake[];
let playResult: () => Promise<void>;
let spoken: string[];

beforeEach(() => {
  vi.resetModules();
  made = []; spoken = [];
  playResult = () => Promise.resolve();
  const g = globalThis as Record<string, unknown>;
  g.Audio = function FakeAudio(this: Fake) {
    this.src = ""; this.muted = false; this.onerror = null;
    this.play = () => playResult(); this.pause = () => {};
    made.push(this);
  };
  g.SpeechSynthesisUtterance = function U(this: { text: string }, t: string) { this.text = t; };
  g.window = { speechSynthesis: { cancel() {}, speak(u: { text: string }) { if (u.text) spoken.push(u.text); } } };
});

// A path in a variable: core's typecheck has no DOM types, so it mustn't follow this import into the page's code.
const SPEECH = "../../web/src/speech.ts";
const load = () => import(/* @vite-ignore */ SPEECH) as Promise<{ say(line: string): void; primeSpeech(): void }>;
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("034 speech.ts plays clips and falls back", () => {
  it("nothing is made at import; a fixed line plays its clip, with no browser voice", async () => {
    const sp = await load();
    expect(made).toHaveLength(0);
    sp.say(TAP_TO_BUY);
    await tick();
    expect(made).toHaveLength(1);
    expect(made[0]!.src).toBe("voice/tap-approve.m4a");
    expect(made[0]!.muted).toBe(false);
    expect(spoken).toEqual([]);
  });

  it("a refused play() falls back to the browser voice once", async () => {
    const sp = await load();
    playResult = () => Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" }));
    sp.say(VOICE_SHOPPING);
    await tick();
    made[0]!.onerror?.(); // and the element's own error after it: still only once
    expect(spoken).toEqual([VOICE_SHOPPING]);
  });

  it("a stale clip error after a newer line started is ignored", async () => {
    const sp = await load();
    sp.say(VOICE_SHOPPING);
    const staleError = made[0]!.onerror!;
    sp.say("$47.73 at Reedbank. Tap Approve to buy."); // not a fixed line: the browser's voice
    staleError();
    await tick();
    expect(spoken).toEqual(["$47.73 at Reedbank. Tap Approve to buy."]);
  });

  it("primeSpeech unlocks once, muted, even if say() made the player first", async () => {
    const sp = await load();
    sp.say(VOICE_SHOPPING); // player made outside a prime
    sp.primeSpeech();
    expect(made).toHaveLength(1);
    expect(made[0]!.muted).toBe(true); // the unlock ran on the same element
    sp.primeSpeech();
    await tick();
    expect(made).toHaveLength(1);
  });
});

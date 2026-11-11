// Speak-back (019 §5, item 10): Goose's fixed lines play from clips recorded offline with Kokoro (034, default 3:
// `CLIPS`, core/src/ask/clips.ts, served from web/public/voice/); any other line, and any clip that fails, uses the
// browser's own text-to-speech, silent where it's missing. Nothing loads before the shopper's first tap: the first
// `primeSpeech` or `say` makes the one audio element. The first line must come from a tap on an iPhone, so a tap primes
// both. Nothing here listens, and nothing here can press Approve.
//
// Track V (042, Joshua's mandate item 4): captions always and a mute toggle. Every line said shows its words while it
// plays (web/src/voice/captions.ts, its own chunk, loaded with the first line), muted or not. Muted, nothing plays and
// the caption still shows. The choice is kept in this browser only (`MUTE_KEY`), like the name; storage blocked, it
// lasts for this page.

import { CLIPS, clipFor } from "@goose/core/clips";

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

/** Where this browser keeps "Goose is muted": "1", or nothing. */
export const MUTE_KEY = "gg-voice-muted-v1";
let mutedHere: boolean | null = null;
// Who to tell when the choice changes on this page (the captions' Mute, the greeting's toggle). A plain list, not a
// page event: this module dispatches nothing (core/test/voice.test.ts holds it to that); other tabs hear `storage`.
const watchers = new Set<() => void>();
/** Calls `fn` whenever Goose is muted or unmuted on this page; returns the way to stop. */
export function onMuted(fn: () => void): () => void { watchers.add(fn); return () => { watchers.delete(fn); }; }

export function isMuted(): boolean {
  if (mutedHere !== null) return mutedHere;
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
}

/** Mutes or unmutes Goose, kept in this browser; muting stops the line playing now (its caption stays). */
export function setMuted(on: boolean): void {
  try {
    if (on) localStorage.setItem(MUTE_KEY, "1"); else localStorage.removeItem(MUTE_KEY);
    mutedHere = null;
  } catch { mutedHere = on; }
  if (on) hush();
  for (const fn of watchers) fn();
}

let player: HTMLAudioElement | null = null;
let primed = false;
/** Each `say` gets a turn; a clip that fails falls back only if no later line has started. */
let turn = 0;
const audio = (): HTMLAudioElement | null => {
  if (player) return player;
  try { player = typeof Audio === "undefined" ? null : new Audio(); } catch { player = null; }
  return player;
};

function hush(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
  player?.pause();
}

// ── Captions: their own chunk, loaded with the first line said (never at first paint) ──────────────────────────────
type Captions = { show(line: string): void; ended(): void; ready(): void };
let captions: Promise<Captions> | null = null;
const caption = (mine: number, act: (c: Captions) => void): void => {
  if (typeof document === "undefined") return;
  captions ??= import("./voice/captions.ts");
  captions.then((c) => { if (mine === turn) act(c); }, () => { captions = null; });
};
/** How long a caption stays when no end is heard (muted, or a voice that never says it ended): reading time. */
const readMs = (line: string) => Math.max(2500, line.split(/\s+/).length * 380 + 1200);

/** Inside the tap: an empty utterance and a muted clip, so Safari lets the line that comes back after the network call play. */
export function primeSpeech(): void {
  if (canSpeak()) {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
  }
  if (primed) return; // unlocked once per page, inside a tap (a player made by `say` alone isn't unlocked)
  primed = true;
  // The captions' live region goes on the page now, empty, so a screen reader is already watching it when the first
  // line arrives (a region filled right after it's added is often missed).
  caption(turn, (c) => c.ready());
  const a = audio();
  const first = clipFor(Object.keys(CLIPS)[0]!);
  if (!a || !first) return;
  a.muted = true;
  a.src = first;
  a.play().then(() => { if (a.muted) a.pause(); }, () => { /* blocked or replaced by a real line: nothing to undo */ });
}

/** The browser's own voice (the path before the clips, and the fallback). */
function speak(line: string, done: () => void): void {
  if (!canSpeak()) { done(); return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(line);
  u.lang = "en-US";
  u.rate = 1.05;
  u.onend = done;
  u.onerror = done;
  window.speechSynthesis.speak(u);
}

/** `after`: called once this line is over, heard to its end or, at the latest, after its reading time. */
export function say(line: string, after?: () => void): void {
  const mine = ++turn;
  if (canSpeak()) window.speechSynthesis.cancel();
  player?.pause();
  caption(mine, (c) => c.show(line));
  let over = false;
  const done = () => {
    if (over) return;
    over = true;
    if (mine === turn) caption(mine, (c) => c.ended());
    after?.();
  };
  // Whatever happens to the sound, the caption leaves after its reading time at the latest.
  setTimeout(done, readMs(line));
  if (isMuted()) return;
  const clip = clipFor(line);
  const a = clip ? audio() : null;
  if (!clip || !a) { speak(line, done); return; }
  let fellBack = false;
  const fallback = () => { if (!fellBack && mine === turn) { fellBack = true; speak(line, done); } };
  a.onerror = fallback;
  a.onended = done;
  a.muted = false;
  a.src = clip;
  a.play().catch(fallback);
}

// Desk-A (Joshua, Oct 30): the Desk's mic only fills the Ask box. "The transcript lands in the Ask box, editable, and
// is never sent on its own. The person reads it and taps Ask. Voice never approves." Track V's own tests cover the mic
// (voice-privacy.test.ts); these cover what the Desk does with its words.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ASK_MAX, VOICE_LINE, heard } from "../src/view/desk.ts";

const desk = readFileSync(new URL("../../web/src/desk/Desk.tsx", import.meta.url), "utf8");
/** The one <HoldToTalk …>…</HoldToTalk> element on the Desk (an arrow's "=>" holds a ">", so it runs to the closing tag). */
const mic = desk.match(/<HoldToTalk\b[\s\S]*?<\/HoldToTalk>/g) ?? [];

describe("the Desk's mic fills the Ask box and nothing else", () => {
  it("adds the heard words after what's typed, trimmed, and never past the box's length", () => {
    expect(heard("", "  a kettle under $60 ")).toBe("a kettle under $60");
    expect(heard("a kettle", "under $60")).toBe("a kettle under $60");
    expect(heard("  ", "")).toBe("");
    expect(heard("x".repeat(70), "y".repeat(30))).toHaveLength(ASK_MAX);
    expect(ASK_MAX).toBe(80);
  });

  it("onText only sets the box's words: it never asks, approves, submits, fetches or navigates", () => {
    expect(mic).toHaveLength(1);
    const onText = mic[0]?.match(/onText=\{(.*?)\}\s+onState=/)?.[1];
    expect(onText).toBe("(said) => setWords((w) => heard(w, said))");
    expect(mic[0] ?? "").not.toMatch(/\bask\(|approve|submit|fetch|location\.|\.click\(/i);
    expect(desk).toContain('maxLength={ASK_MAX}');
  });

  it("the old browser speech button, which asked as soon as it heard, is gone", () => {
    expect(desk).not.toMatch(/SpeechRecognition|webkitSpeechRecognition/);
  });

  it("says the one voice line word for word: no numbers, no comparisons", () => {
    expect(VOICE_LINE).not.toMatch(/phone/); // it shows on a laptop too
    expect(VOICE_LINE).toBe("Speech becomes text on your device, about a second after you let go; your voice is never sent anywhere.");
    expect(VOICE_LINE).not.toMatch(/\d|%|Siri|faster|accura/i);
    expect(desk).toContain("{VOICE_LINE}");
  });
});

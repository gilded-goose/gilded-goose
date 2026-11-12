// The two ways to ask without typing, shared by the home and Shop Ask boxes: hold the mic (Whisper in this browser, the
// audio never leaves the device) or show a photo (the phone's camera, a file picker on a desktop). Both only put words in
// the box; neither can send, ask, approve or pay. `onStatus` carries the line to show under the field.
import { useRef, useState } from "react";
import { HoldToTalk } from "../../voice/HoldToTalk.tsx";
import { micWords, type MicState } from "../../voice/mic.ts";
import { readPhoto } from "../live/photo.ts";
import { handleSaid } from "../live/said.ts";
import { CameraIcon, MicIcon } from "./icons.tsx";

export function AskTools({ onWords, onStatus, disabled }: { onWords(words: string): void; onStatus(line: string | null): void; disabled?: boolean }) {
  const file = useRef<HTMLInputElement>(null);
  const [looking, setLooking] = useState(false);

  // Words a tool wrote are not the shopper's own, word for word: this page load is marked, and Goose's suggestion
  // (shop/suggest.ts) keeps no ask from it.
  const put = (w: string) => {
    try { sessionStorage["gg-tool"] = performance.timeOrigin; } catch { /* storage blocked: nothing is kept anyway */ }
    onWords(w);
  };

  const heard = (s: MicState) => onStatus(s.kind === "off" ? null : micWords(s));

  const snapped = async (f: File | undefined) => {
    if (!f) return;
    setLooking(true);
    onStatus("Reading your photo…");
    const r = await readPhoto(f);
    setLooking(false);
    if ("note" in r) { onStatus(r.note); return; }
    onStatus(null);
    put(r.words);
  };

  return (
    <span className="ask-tools">
      <HoldToTalk className="ask-tool" onState={heard} onText={(w) => { if (!handleSaid(w, onStatus)) put(w); }}><MicIcon size={20} /></HoldToTalk>
      <button type="button" className="ask-tool" disabled={disabled || looking} aria-label="Show Goose a photo" onClick={() => file.current?.click()}>
        <CameraIcon size={20} />
      </button>
      <input
        ref={file}
        className="vh"
        type="file"
        accept="image/*"
        capture="environment"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void snapped(f); }}
      />
    </span>
  );
}

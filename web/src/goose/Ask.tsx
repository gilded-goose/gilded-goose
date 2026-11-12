// The ask: type it, hold the mic (Whisper in the browser: audio never leaves the device), or show a photo (one vision
// call on the server; with no live AI it says so and typing still works). A photo's reading becomes words in the box,
// built by code from catalog-checked chips, and goes through the same reading as typed words.
import { useRef, useState, type RefObject } from "react";
import type { PhotoAnswer } from "@goose/core/photo";
import { HoldToTalk } from "../voice/HoldToTalk.tsx";
import { micWords, type MicState } from "../voice/mic.ts";
import { Icon } from "./icons.tsx";

/** Three asks, each showing one thing Goose does, checked against the server's own markets. */
export const TRIES = [
  { words: "Marsh Lights ticket, $90 max", shows: "A price falls under your limit over a week" },
  { words: "A good kettle, $60 max", shows: "A seller's note tries to raise your budget" },
  { words: "Fernway mixer, used is fine", shows: "A seller wants paying outside PayPal" },
] as const;

const UNDER = /,? under your limit\.?$/i;

async function readPhoto(file: File): Promise<{ words: string } | { note: string }> {
  const photo = await import("../snap.ts").then((m) => m.photoData(file)).catch(() => null);
  if (!photo) return { note: "That file couldn't be read as a photo. Try another, or type it." };
  const r = await fetch("/api/runs/photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(photo) }).catch(() => null);
  if (!r) return { note: "Goose couldn't reach the server, so the camera can't read a photo. Typing still works." };
  const body = (await r.json().catch(() => null)) as (PhotoAnswer & { error?: string }) | null;
  if (!body || body.error || !r.ok) return { note: body?.error ?? "Goose couldn't read that photo just now. Nothing changed." };
  if (body.kind === "unavailable") return { note: body.say };
  if (body.miss || !UNDER.test(body.speak)) return { note: body.miss ?? body.speak };
  return { words: body.speak.replace(UNDER, "") };
}

export function Ask({ words, setWords, onAsk, busy, inputRef, error }: {
  words: string; setWords: (w: string) => void; onAsk: (w: string) => void; busy: boolean; inputRef: RefObject<HTMLInputElement | null>;
  /** The server's reason the last ask couldn't be read, shown under the field. */
  error?: string | null;
}) {
  const [mic, setMic] = useState<MicState>({ kind: "off" });
  const [note, setNote] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const submit = (e: { preventDefault: () => void }) => { e.preventDefault(); setNote(null); if (words.trim().length >= 2) onAsk(words); else inputRef.current?.focus(); };
  const hearing = mic.kind === "listening" || mic.kind === "working" || mic.kind === "loading" || mic.kind === "starting";

  async function snapped(f: File | undefined) {
    if (!f) return;
    setLooking(true); setNote(null);
    const r = await readPhoto(f);
    setLooking(false);
    if ("note" in r) { setNote(r.note); return; }
    setWords(r.words);
    inputRef.current?.focus();
  }

  return (
    <div className="gg-ask">
      <form className="gg-ask-form" onSubmit={submit} aria-busy={busy || looking || undefined} data-hearing={hearing || undefined} data-error={error ? true : undefined}>
        <label htmlFor="gg-words" className="gg-ask-label">What should Goose find, and the most you'll pay?</label>
        <div className="gg-ask-field">
          <input
            id="gg-words" ref={inputRef} value={words} onChange={(e) => setWords(e.target.value)} autoComplete="off" enterKeyHint="go"
            maxLength={200} placeholder="A ticket to Saturday's show, $90 max"
          />
          <HoldToTalk className="gg-tool" onState={setMic} onText={(w) => { setWords(w); onAsk(w); }}><Icon name="mic" size={20} /></HoldToTalk>
          <button type="button" className="gg-tool" onClick={() => file.current?.click()} disabled={busy || looking} aria-label="Show Goose a photo">
            <Icon name="camera" size={20} />
          </button>
          <input ref={file} className="gg-sr" type="file" accept="image/*" capture="environment" tabIndex={-1} aria-hidden="true"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void snapped(f); }} />
          <button type="submit" className="gg-btn gg-btn-ink" disabled={busy}>Find it<Icon name="arrow" /></button>
        </div>
        <p className="gg-ask-help" aria-live="polite" data-error={(!looking && !note && error) || undefined}>
          {looking ? "Reading your photo…" : note ?? error ?? (mic.kind === "off" ? "Hold the mic to talk. Your voice stays on this device." : micWords(mic))}
        </p>
      </form>
      <div className="gg-tries">
        <p className="gg-tries-k">Or try one</p>
        <ul>
          {TRIES.map((t) => (
            <li key={t.words}>
              <button type="button" onClick={() => { setWords(t.words); onAsk(t.words); }} disabled={busy}>
                <span className="gg-try-words">{t.words}</span>
                <span className="gg-try-shows">{t.shows}</span>
                <Icon name="arrow" size={16} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

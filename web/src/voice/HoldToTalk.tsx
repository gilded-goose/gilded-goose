// Track V phase 2 (029): the Desk's mic button. Hold to talk (or tap to start, tap again to stop); the words go to
// `onText`, like typed ones, and the page decides what to do with them (the Desk puts them in its box). Only the words
// come out: this button can't send, ask or approve anything. Where the browser can't record or run the model, it
// renders nothing, so the keyboard's own dictation stays the way to talk. The speech library and model load on the
// first press, not before.

import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { VOICE_LINE } from "@goose/core/desk";
import { canHear, createMic, micWords, type MicState } from "./mic";

const HIDDEN = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" } as const;
// Only the main finger, pen or left button holds the mic; a second finger or a right-click does nothing.
const primary = (e: PointerEvent) => e.isPrimary && e.button === 0;

export function HoldToTalk({ onText, onState, className, children }: {
  /** The words heard, cleaned up (no "[BLANK_AUDIO]"-style tags), never empty. */
  onText: (words: string) => void;
  /** Every state change, for a visible status line (`micWords(state)` is the line); optional. Not aria-live: the
   *  button reads its own status out. */
  onState?: (state: MicState) => void;
  className?: string;
  /** What the button shows, e.g. the page's mic icon. */
  children: ReactNode;
}) {
  const text = useRef(onText);
  const report = useRef(onState);
  text.current = onText;
  report.current = onState;
  const [mic] = useState(() => canHear() ? createMic({ onState: (s) => { setState(s); report.current?.(s); }, onText: (w) => text.current(w) }) : null);
  // A second mic on the page starts "ready" when the first one already loaded the model.
  const [state, setState] = useState<MicState>(() => mic?.state() ?? { kind: "off" });
  useEffect(() => mic?.attach(), [mic]);
  // A click with no mouse or finger behind it (detail 0) and no key held for it is a screen reader's or a switch's
  // activation: a tap. `keyed` covers the click Space sends after its own keyup.
  const keyed = useRef(false);
  const noteId = useId();
  if (!mic) return null;

  const words = micWords(state);
  return (
    <>
      <button
        type="button"
        className={className}
        data-mic={state.kind}
        aria-label="Hold to talk, or tap to start"
        aria-describedby={noteId}
        aria-pressed={state.kind === "listening"}
        aria-busy={state.kind === "loading" || state.kind === "working" || undefined}
        style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
        onPointerDown={(e) => { if (!primary(e)) return; e.currentTarget.setPointerCapture(e.pointerId); mic.press(); }}
        onPointerUp={(e) => { if (primary(e)) mic.release(); }}
        onPointerCancel={mic.release}
        onLostPointerCapture={mic.release}
        onBlur={mic.release}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => { if (e.detail === 0 && !keyed.current) { mic.press(); mic.release(); } }}
        onKeyDown={(e) => { keyed.current = true; if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); mic.press(); } }}
        onKeyUp={(e) => { setTimeout(() => { keyed.current = false; }); if (e.key === " " || e.key === "Enter") mic.release(); }}
      >
        {children}
      </button>
      {/* The privacy promise, read with the button (042): the Desk shows it as text a screen reader skips. */}
      <span id={noteId} style={HIDDEN}>{VOICE_LINE}</span>
      <span role="status" aria-live="polite" style={HIDDEN}>{state.kind === "off" ? "" : words}</span>
    </>
  );
}

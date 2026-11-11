// Track V (042, Lead-9): `?debug=voice` on any page with the mic shows which backend and model Whisper runs on
// ("wasm · tiny.en"), so Joshua can confirm on his iPhone that the Desk mic takes the same WebAssembly-only path as
// /voice-test-2. It is handed the backend name only, never the words heard, shows nothing without the param, and sends
// nothing (core/test/voice-privacy reads every file here for a way out).

import { MODEL, type Backend } from "./protocol";

const ID = "gv-debug";

/** True only when the page's address asks for it: `?debug=voice` (alone or among other debug words). */
export function voiceDebugOn(search: string): boolean {
  return new URLSearchParams(search).getAll("debug").some((v) => v.split(",").includes("voice"));
}

/** The line itself: the backend and the model's short name. */
export const debugLine = (backend: Backend): string => `${backend} · ${MODEL.replace(/^.*whisper-/, "")}`;

/** Shows or updates the small line, bottom left, only under `?debug=voice`. */
export function showVoiceDebug(backend: Backend): void {
  if (typeof document === "undefined" || !voiceDebugOn(window.location.search)) return;
  let el = document.getElementById(ID);
  if (!el) {
    el = document.createElement("p");
    el.id = ID;
    el.setAttribute("aria-hidden", "true"); // a developer's note, not part of the page
    el.style.cssText = "position:fixed;left:8px;bottom:calc(8px + env(safe-area-inset-bottom));margin:0;padding:2px 6px;border-radius:4px;background:rgba(44,21,32,.82);color:#f4eadc;font:11px/1.4 ui-monospace,Menlo,monospace;z-index:2147483000;pointer-events:none";
    document.body.append(el);
  }
  el.textContent = debugLine(backend);
}

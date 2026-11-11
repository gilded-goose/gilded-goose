// The board's early answer (Track F; web/prerender.ts inlines it in the head, on Behind the scenes only). The counter's
// two lines need the record's fold, not the rows and not React, yet on a cold phone they waited 2.1 s for React, 0.5 s for
// the board's chunk and 0.2 s for this one answer: 2.8 s, with the space under the hero empty. Asked from the head, the
// answer beats the first paint, so the real words are on screen with the hero. The server sends the words (`words`,
// challengeWords on the server's own fold), so this carries no copy of them, and a failed answer leaves "Reading the
// record…", the board's own state. useThreatFeed adopts the answer (`__board.p`), so the page asks once, not twice.
// Plain ES5 in a string, so it runs before any module; core/test/early-board.test.ts runs it.

export interface EarlyBoard {
  /** The answer's body once it's here; null until then and after a failure. */
  v: unknown;
  /** The same answer, for the page to adopt; resolves null on a failure. */
  p?: Promise<unknown>;
  /** Writes the words into the first paint, once both are there. Safe to call any time. */
  f: () => void;
}
declare global { interface Window { __board?: EarlyBoard } }

/** The first paint's own mark. Only that copy is ever written to: React owns the one it draws. */
export const BOARD_PAINT = "paint";

export const EARLY_BOARD =
  `var b=window.__board={v:null};b.f=function(){var w=b.v&&b.v.words,s=document.querySelector('[data-board="${BOARD_PAINT}"]');if(!w||!s)return;` +
  `var h=s.querySelector("#tb-h"),c=h.children;c[0].textContent=w.tries+(w.outcome?" ":"");c[1].textContent=w.outcome||"";if(w.alarm)h.classList.add("alarm");` +
  `s.querySelector(".tb-second").textContent=w.second};` +
  `b.p=fetch("/api/challenge",{headers:{accept:"application/json"}}).then(function(r){return r.ok?r.json():null}).then(function(j){b.v=j;b.f();return j}).catch(function(){return null});`;

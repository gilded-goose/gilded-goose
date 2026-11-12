// #wants's head start (Track F, Nov 6; Lead-12's order after #challenge's). A cold phone that opened `?desk=1#wants` waited
// about 2 s for its largest paint, the list's closing line (`p.dk-watch-said`, 41,000 px² at 390), because the pane asked
// for its two answers only once the Desk's code and the pane's chunk had come. Now the page's head asks for both while
// that code downloads (EARLY_WANTS, deskGate in prerender.ts), and the room's cover draws a new visitor's whole empty
// list from the build (first-paint.tsx) and shows it once those answers say that is what the room will draw (WANTS_FILL).
// The pane then starts from the same answers (Panes.tsx useGet), so the page asks once and the lift changes nothing.
//
// GET only, with this browser's own cookie (fetch's default, as the pane's own read): a returning visitor's answer has
// wants or real rows, so the cover keeps to the head and the pane draws them as before. Nothing here can spend.

/** One answer the head asked for: `v` once it's in, `p` the asking. A failed or refused one is null. */
export interface EarlyGet { v: unknown; p: Promise<unknown> }
declare global { interface Window { __wants?: Record<string, EarlyGet | undefined> | undefined } }

/** The scene a new visitor's empty list shows (Panes.tsx WantsPane, the cover in first-paint.tsx). */
export const WANTS_HERO = "marsh-lights-ticket";

/** The two reads the wants pane makes, in its order. */
export const WANTS_READS = ["/api/runs/wants", "/api/runs/shelf"] as const;

/** In the head's room branch, where `N` is the room: asks only on #wants. */
export const EARLY_WANTS =
  `if(N==="wants"){var g=function(u){var e={v:null};e.p=fetch(u).then(function(r){return r.ok?r.json():null}).then(function(j){return e.v=j},function(){return null});return e};` +
  `window.__wants={${WANTS_READS.map((u) => `"${u}":g("${u}")`).join(",")}}}`;

/**
 * After the cover is placed: the empty list shows once both answers are in, the room's sheets have loaded, and the
 * answers are the ones the cover drew (no wants, no real rows, the same hero card at the same price, the same closing
 * words). Anything else leaves the cover as the head alone, as before.
 */
// It opens with ";": the placer joins it straight after the Challenge's fill, which ends in a call, and the two ran
// together into one statement the build's minifier refused (Track F, Nov 6; early-wants.test.ts parses the pair).
export const WANTS_FILL =
  `;var E=window.__wants,c=document.getElementById("dk-room-first");if(E&&c){Promise.all([E["${WANTS_READS[0]}"].p,E["${WANTS_READS[1]}"].p].concat([].map.call(document.querySelectorAll("link[data-room-sheet]"),function(l){return l.sheet||new Promise(function(y){l.onload=l.onerror=y})}))).then(function(a){` +
  `var w=a[0],s=a[1],f=c.querySelector(".dk-watch-first"),h=f&&s&&s.cards&&s.cards.filter(function(k){return k.catalogId===f.getAttribute("data-id")})[0],t=c.querySelector(".dk-watch-said");` +
  `if(w&&w.wants&&!w.wants.length&&!(w.real||[]).length&&h&&h.title===f.firstChild.textContent&&h.max/100==f.querySelector("input").value&&t&&t.textContent.slice(-s.said.length)===s.said)c.setAttribute("data-empty","")})}`;

const early = () => (globalThis as { __wants?: Record<string, EarlyGet | undefined> | undefined }).__wants; // the page's window; the tests have none

/**
 * The head's answer for this read, looked at, never taken: React may render the pane more than once and keep only the
 * last (a first render it throws away when a child waits for its code), so a render that took the answer left the kept
 * one without it and the page asked twice (Track F, Nov 6). The pane drops it with `dropEarlyGet` once it's mounted.
 */
export function earlyGet(path: string): EarlyGet | undefined {
  return early()?.[path];
}

/** In the pane's effect, once it's mounted: a later mount (the room opened again) asks for itself. */
export function dropEarlyGet(path: string): void {
  const all = early();
  if (all) all[path] = undefined;
}

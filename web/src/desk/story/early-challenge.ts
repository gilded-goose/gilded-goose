// The Challenge's early answer (Track F, Nov 6). Arriving at `?desk=1#challenge` on a cold phone, the room's head was on its
// cover at 0.55 s but the counter's two lines waited for the story's chunk, the Challenge's chunk and then its own read:
// 2.9 s on live, and those lines are the largest thing on the screen. The counts are the public record's fold, keyed to
// nobody, so the head asks for them (`GET /api/challenge`, the same read the feed makes) and the cover draws the server's
// own words (`words`, challengeWords on its fold). The Challenge then starts from the same counts, so its counter draws
// the same words in the same box when the cover lifts, and the feed adopts the answer, so the page asks once, not twice.
// Plain ES5 in strings, so they run before any module: web/prerender.ts puts the ask in the room's gate (a #challenge
// arrival only) and the fill where the cover goes in. core/test/early-challenge.test.ts runs both.

export interface EarlyChallenge {
  /** The answer's body once it's here; null until then and after a failure. */
  v: unknown;
  /** The same answer, for the feed to adopt once; resolves null on a failure. */
  p?: Promise<unknown> | undefined;
}
declare global { interface Window { __chal?: EarlyChallenge | undefined } }

/** The ask, in the gate's room branch (`N` is the hash's room). */
export const EARLY_CHALLENGE =
  `if(N==="challenge"){var c=window.__chal={v:null};c.p=fetch("/api/challenge").then(function(r){return r.ok?r.json():null}).then(function(j){return c.v=j},function(){return null})}`;

/** The fill, once the cover is in: the server's words in the cover's counter. A cover already lifted is left alone. */
export const CHALLENGE_FILL =
  `var c=window.__chal;c&&c.p&&c.p.then(function(j){var w=j&&j.words,s=document.querySelector("#dk-room-first .ds-ch-count");if(!w||!s)return;` +
  `var l=s.firstChild.childNodes;l[0].textContent=w.tries;l[1].textContent=w.outcome||"";s.lastChild.textContent=w.second;if(w.alarm)s.setAttribute("data-alarm","")})`;

/** The answer for the feed's first read, given once: after that the feed asks for itself. */
export function takeEarlyChallenge(): Promise<unknown> | undefined {
  const c = (globalThis as { __chal?: EarlyChallenge | undefined }).__chal; // the page's window; the tests have none
  const p = c?.p;
  if (c) c.p = undefined;
  return p;
}

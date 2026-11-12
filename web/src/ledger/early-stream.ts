// The ledger's early stream (Track B session 6; web/prerender.ts inlines it into the first paint): an inline script
// opens the page's stream while SessionLedger.tsx's chunk is still on its way, and keeps what it sees on
// `window.__ledgerStream` (the EventSource while open, the rows it buffered, the end once known); the page adopts it on
// mount and never opens a second stream (the server allows two per browser).
//
// Track R (AS-15's finding, stack 75): it once ignored every error until the EventSource was CLOSED. An unreachable
// server leaves an EventSource CONNECTING and retrying, so the page learned "didn't answer" one EventSource retry late
// (~3 s). The rule is ledger/follow.ts's: a stream that never opened is not a dropped one, so its first error closes it
// and asks once why; only a stream that opened and then dropped is left to EventSource's own retry.
// AS-15 slice 2: a refusal's Retry-After rides along as `ra` (the page's <RateLimited> waits it out), only when sent.
// Plain ES5 in a string, so it runs before any module; core/test/r-deploy.test.ts runs it against a fake EventSource.

export const EARLY_STREAM =
  `var g=window.__ledgerStream={src:null,rows:[],end:null};try{var s=g.src=new EventSource("/api/runs/session/events"),op=false;` +
  `s.addEventListener("open",function(){op=true});` +
  `s.addEventListener("row",function(m){if(g.src===s)g.rows.push(m.data)});s.onerror=function(){if(g.src!==s||op&&s.readyState!==2)return;s.close();g.src=null;` +
  `fetch("/api/runs/session/events",{headers:{accept:"application/json"}}).then(function(r){return r.status===204?{status:204}:r.ok?{status:r.status}:` +
  `r.json().then(function(b){var o={status:r.status,body:b},h=r.headers&&r.headers.get&&r.headers.get("retry-after");if(h)o.ra=h;return o},function(){return{status:r.status}})},function(){return{status:0}}).then(function(o){g.end=o;if(g.wait)g.wait(o)})}}` +
  `catch(e){g.src=null;g.end={status:0}}`;

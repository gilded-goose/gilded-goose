// Track F (Joshua, Nov 3: "verify every route loads cold in under 1 s"). Six pages painted nothing of their own until 120
// to 180 KB of JS had landed and run (phone drill: ?desk=proof 1700 ms, ?desk=tour 1632, ?desk=how 1032; the market's
// h1 2192). Here the build draws each page's real component to HTML, once, into its own file, `first/<page>.html`.
//
// Why a file of its own and not a <template> in index.html, as the wallet, the ledger and the landing have: index.html
// is one file every route downloads, so six more pages there would cost every route ~9 KB of Brotli (~45 ms on the
// drill) for pages it isn't. The head gate below fetches only the address's own file, in the same wave as main.css, so
// no route pays for another's page and the page's paint waits on no JS.
//
// Why hydrate and not draw over it: a redraw makes new text nodes, and when the web face has landed by then they can be
// a few px wider, so the browser reports a second, later "largest paint" of the same words (measured on the wallet:
// the h1 at 680 ms, again at 2800 ms). main.tsx hydrates what's here, so nothing is drawn twice. If the first render
// ever differs, React falls back to drawing it on the client (web/src/hydrate.ts records that; the probe fails on it).
//
// The gate fires only on the exact address the file was drawn for. Any other query, any hash, and a tour with ticks in
// this browser take today's path: main.tsx draws the page when its chunk lands. A failed fetch takes it too.

import { LOCAL_HOST } from "../core/src/view/studio-gate.ts";

/**
 * One page the build draws to its own file. `chunk` finds its entry in Vite's manifest (by output file, never `src`).
 * `phone`: its first render differs by this query, so it has a second file, `first/<id>-phone.html` (as safe.html has).
 */
/** A line break between two tags is index.html's source layout, and every route downloads it (about 400 B, Nov 5). A lone space can be a word gap, so it stays. */
export const dropLayout = (html: string): string => html.replace(/>[^\S\n]*\n\s*</g, "><");

export type FirstRoute = { id: string; address: string; src: string; chunk: RegExp; phone?: string };

/** The Studio page's phone query (web/src/studio/words.ts PHONE), the one Shell.tsx lays its frames out by. */
export const STUDIO_PHONE = "(max-width: 767px)";
/** Studio's own first paint answers this address on a developer's machine, so the drill and the probe can walk it with no key, and anywhere on a good licence. */
export const STUDIO_FORCED = "?desk=studio&studio=force";
/** What it also answers once Studio is the page's default (`studioUntil` in core/src/view/studio-gate.ts). */
export const STUDIO_PLAIN = ["?desk=studio", "?desk=ledger"] as const;

export const FIRST_ROUTES: readonly FirstRoute[] = [
  { id: "how", address: "?desk=how", src: "/src/how/How.tsx", chunk: /^assets\/How-[\w-]+\.js$/ },
  { id: "builders", address: "?desk=builders", src: "/src/builders/Builders.tsx", chunk: /^assets\/Builders-[\w-]+\.js$/ },
  { id: "system", address: "?desk=system", src: "/src/system/System.tsx", chunk: /^assets\/System-[\w-]+\.js$/ },
  { id: "proof", address: "?desk=proof", src: "/src/Proof.tsx", chunk: /^assets\/Proof-[\w-]+\.js$/ },
  { id: "tour", address: "?desk=tour", src: "/src/tour/Tour.tsx", chunk: /^assets\/Tour-[\w-]+\.js$/ },
  { id: "haggle", address: "?desk=haggle", src: "/src/Haggle.tsx", chunk: /^assets\/Haggle-[\w-]+\.js$/ },
  { id: "market", address: "?market=1", src: "/src/StoreSync.tsx", chunk: /^assets\/StoreSync-[\w-]+\.js$/ },
  { id: "list", address: "?desk=list", src: "/src/list/List.tsx", chunk: /^assets\/List-[\w-]+\.js$/ },
  { id: "studio", address: STUDIO_FORCED, src: "/src/studio/Shell.tsx", chunk: /^assets\/Shell-[\w-]+\.js$/, phone: STUDIO_PHONE },
];

/** The address each page answers, as the gate's table: one page's stylesheets, in the order Vite would add them. */
export type GateRow = { id: string; address: string; css: string[]; phone?: string };

/**
 * The head's first decision about Behind the scenes, in a script's `q`: not Studio, so the ledger's own first paint. Run once,
 * by the ledger's gate, which leaves its answer in `data-first-ledger`; the route gate and the ledger's preload read that
 * attribute instead of repeating it (Q's (a), Round 5: both repeats were on every route). So the ledger's gate must stay
 * ahead of them in the page. No good licence: none of the host's or the clock's bytes are here.
 */
export function ledgerTest(studioUntil = 0, forcedUntil = 0): string {
  const notForced = `q.get("studio")!=="force"`, notHere = `!${LOCAL_HOST}.test(location.hostname)`;
  if (!forcedUntil) return notForced + (studioUntil ? `&&Date.now()>${studioUntil}` : "");
  // Both set means the same moment (`studioUntil` of the same facts), so it is written once.
  return studioUntil ? `(${notForced}||${notHere})&&Date.now()>${studioUntil}` : `(${notForced}||${notHere}&&Date.now()>${forcedUntil})`;
}

/** One click to Studio (`dk-see`, desk/story/index.tsx) stands only while Studio does, by the same clock. In the ledger's gate, with the page's only other clock. None of its bytes on a build with no flip. */
export const studioLive = (studioUntil = 0): string => (studioUntil ? `if(Date.now()<=${studioUntil})$h.setAttribute("data-st","");` : "");

/**
 * In <head>, before main.css: decides, starts the page's file and its sheets. `window.__first` is the file's text, or
 * "" when there is none, so the placing script needs no second copy of the test. A judge part-way through the tour
 * (`tourTicksKey`, follow.ts's) opens on their own stop, which only the page can draw.
 * `studioUntil` (0 on today's builds, and then none of its bytes are here): with Studio the page's default, the plain
 * addresses take Studio's file too, until that moment by the visitor's clock, and the ledger's own paint after it.
 * `forcedUntil` is the same moment with the flip left out (`studioUntil(facts, true)`): the forced address takes Studio's
 * file on a public host only until then, so the head and pick.ts answer it alike. 0 (no good licence): the forced address
 * has no file at all, on any host, and the page pays nothing for it; `GOOSE_FLIP_REHEARSAL=1` is how a keyless build walks it.
 */
export function routeGate(rows: readonly GateRow[], base: string, tourTicksKey: string, studioUntil = 0, forcedUntil = 0): string {
  // No good licence: no visitor can reach Studio's file (a public host's forced address is the ledger), and index.html is
  // what every route downloads, so none of its bytes are here. A licensed build, or a flip rehearsal, carries them.
  const lit = forcedUntil || studioUntil ? rows : rows.filter((r) => r.address !== STUDIO_FORCED);
  const table: Record<string, string> = Object.fromEntries(lit.map((r) => [r.address, r.id]));
  if (studioUntil) for (const a of STUDIO_PLAIN) table[a] = "studio";
  const css = Object.fromEntries(lit.map((r) => [r.id, r.css.map((f) => base + f)]));
  const twins = Object.fromEntries(lit.filter((r) => r.phone).map((r) => [r.id, r.phone!]));
  // The ledger's gate ran first and answered for every Studio address, host and clock included (`ledgerTest`). One copy, on every route.
  const clock = forcedUntil || studioUntil ? `if($h.hasAttribute("data-first-ledger"))p=0;` : "";
  const phone = Object.keys(twins).length ? `(o.call(W,p)&&matchMedia(W[p]).matches?"-phone":"")+` : "";
  return `<script>(function(){var T=${JSON.stringify(table)},C=${JSON.stringify(css)},${phone ? `W=${JSON.stringify(twins)},` : ""}a=location.search,o=Object.prototype.hasOwnProperty,p=o.call(T,a)&&!location.hash&&T[a],s;` +
    `if(p==="tour"){try{s=localStorage.getItem(${JSON.stringify(tourTicksKey)})}catch(e){}if(s&&s!=="[]")p=0}${clock}` +
    `if(!p)return;$h.setAttribute("data-first-route",p);` +
    `window.__first=fetch(${JSON.stringify(base)}+"first/"+p+${phone}".html").then(function(r){return r.ok?r.text():""},function(){return""});` +
    (lit.some((r) => r.id === "list") ? LIST_EARLY : "") +
    `document.write(C[p].map(function(f){return'<link rel="preload" as="style" href="'+f+'">'}).join(""));window.__firstCss=C[p]})()</script>`;
}

/**
 * The list's answer, started with its file (Lead-12, Nov 6: list was 1.9 s on a cold phone, waiting on React's chunk to ask).
 * The same request, by the same path, that List.tsx makes: same document, same cookie, and List adopts this promise instead
 * of asking again, so one request answers both and no other visitor's list can be the one drawn. An empty list (no total,
 * no gifts: every new visitor's) shows the file's own empty view at once (`data-list-empty`, list.css); any other answer
 * keeps "Reading your list…" until React draws it. Anything that fails is null, and List asks again itself.
 */
export const LIST_EARLY = `if(p==="list")window.__list=fetch("/api/runs/wants").then(function(r){return r.ok?r.json():null}).then(function(j){var l=j&&j.list;if(l&&!l.total&&l.gifts&&!l.gifts.length)$h.setAttribute("data-list-empty","");return j}).catch(function(){return null});`;

/** After main.css: the page's sheets as blocking links, in Vite's order after main.css, so the first paint is styled. */
export const routeSheets = `<script>if(window.__firstCss)document.write(window.__firstCss.map(function(f){return'<link rel="stylesheet" href="'+f+'">'}).join(""))</script>`;

/** After #root: the file goes in, unless the page's own chunk already drew it (a slow file on a fast chunk). Studio's file
 * carries the board's first lines, so the head's early answer (early-board.ts), if it came first, is written in now. */
export const routePlace = `<script>if(window.__first)window.__first.then(function(h){var r=document.getElementById("root");if(h&&r&&!r.firstChild){r.innerHTML=h;window.__firstIn=1;if(window.__board)window.__board.f()}})</script>`;

/**
 * safe.html's own: its first render differs by the phone query (Safe.tsx folds its chapters there), so it has two files
 * and asks for the one this screen draws. It has no gate for sheets: its head links them. Only the bare address: a
 * query or a hash can open it elsewhere, and only the page knows where.
 */
export const safeGate = (base: string, phoneQuery: string): string =>
  `<script>if(!location.search&&!location.hash){var h=document.documentElement;h.setAttribute("data-first-fit-display","");document.fonts.load('300 1em "Hanken Goose"').then(function(l){if(l.length)h.removeAttribute("data-first-fit-display")},function(){});window.__first=fetch(${JSON.stringify(base)}+"first/safe-"+(matchMedia(${JSON.stringify(phoneQuery)}).matches?"phone":"wide")+".html").then(function(r){return r.ok?r.text():""},function(){return""})}</script>`;

/** Just enough of a browser for a page's first render, whose effects never run here. Only for the draw below. */
export function stubBrowser(address: string, phone = false): void {
  const g = globalThis as unknown as Record<string, unknown>;
  const list = { add() {}, remove() {}, toggle() {}, contains: () => false };
  const el = { classList: list, setAttribute() {}, removeAttribute() {}, hasAttribute: () => false, addEventListener() {}, removeEventListener() {}, append() {} };
  g.location = new URL(`http://first.invalid/${address}`);
  g.innerWidth = 390;
  g.matchMedia = () => ({ matches: phone, addEventListener() {}, removeEventListener() {} });
  g.addEventListener = () => {};
  g.removeEventListener = () => {};
  g.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  g.sessionStorage = g.localStorage;
  g.document = { ...el, documentElement: el, body: el, head: el, title: "", cookie: "", querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => el };
  g.window = globalThis;
  Object.defineProperty(globalThis, "navigator", { value: { onLine: true, userAgent: "first-paint", languages: ["en"] }, configurable: true });
}

/** Undoes stubBrowser, so nothing after the pages' draw sees a browser that isn't there. */
export function unstubBrowser(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  for (const k of ["location", "innerWidth", "matchMedia", "addEventListener", "removeEventListener", "localStorage", "sessionStorage", "document", "window"]) delete g[k];
}

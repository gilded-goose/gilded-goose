// W64b: after `vite build`, write the wallet's first paint into dist/index.html, so a phone sees the deal waiting
// before any JS arrives (the phone drill: PROFILE=mobile pnpm budget:first-screen). The classic home already passes on
// its static nav and headline; the wallet needed ~140 KB of gzipped JS first.
//
// What it adds, all inert unless the page opens on the wallet:
// - first in <head> (after the viewport meta), a small inline script that decides, as walletMode does (the build's VITE_WALLET, then ?wallet=), whether
//   this visit opens on the wallet. It skips the market (`?market=1`, as main.tsx decides; Track W), the Desk (any `?desk=`, and the bare address at the root path, as main.tsx decides,
//   Joshua Oct 30), and any visit
//   whose first screen differs from a deal waiting for your tap:
//   PayPal's return (?run=), and a browser with a wallet cookie (paid or held). Only then it preloads the wallet's
//   stylesheet, and a second script after main.css loads it as a blocking <link>, so the first paint is styled;
// - after the practice line (.gn-foot, after #root), the first paint in a <template> and a script that puts it in #root,
//   sets that line's wallet wording and the wallet's body class. React draws the same components over it (web/src/first-paint.tsx).
// - after main.css, where the page opens on the Desk, preloads of the Desk chunk's own files (commit 7, below).

import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { PRACTICE } from "@goose/core/wallet-flag";
import { DESK_PAGES, LANDING_HASHES, ROUTE_PARAMS } from "@goose/core/menu-hash";
import { studioUntil, type StudioLicenceFacts } from "@goose/core/studio-gate";
import { GLIDE_BY } from "./src/desk/opening-clock.ts";
import { ROOM_HEADS, roomFirstCss, roomHeadsChanged } from "./src/desk/room-heads.ts";
import { CHALLENGE_FILL, EARLY_CHALLENGE } from "./src/desk/story/early-challenge.ts";
import { EARLY_WANTS, WANTS_FILL } from "./src/desk/early-wants.ts";
import { FILL_PLACED, ROOM_FILL_FILE, fillAsk, roomFillFile } from "./src/desk/room-fill.ts";
import { FIT_WALLET, SOURCE_PATH, fitCss, fitWordsChanged, FIT_SAFE, fitSafeCss } from "./first-fit.ts";
import { EARLY_STREAM } from "./src/ledger/early-stream.ts";
import { BOARD_PAINT, EARLY_BOARD } from "./src/studio/early-board.ts";
import { TICKS } from "./src/tour/follow.ts";
import { leanScripts } from "./lean-html.ts";
import { FIRST_ROUTES, ledgerTest, routeGate, routePlace, routeSheets, safeGate, stubBrowser, unstubBrowser, studioLive, dropLayout } from "./prerender-routes.ts";

const web = fileURLToPath(new URL(".", import.meta.url));
const dist = join(web, "dist");
const base = process.env.GOOSE_BASE ?? "/";
const build = process.env.VITE_WALLET === "1";

const vite = await createServer({ root: web, server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
const licenceFacts = JSON.parse(String(vite.config.define!.__AG_STUDIO_LICENCE__)) as StudioLicenceFacts;
const byDefault = vite.config.define!.__STUDIO_BY_DEFAULT__ === "true";
let paint: string;
let ledgerPaint: string;
let deskPaint: string;
let deskRoomPaint: Record<string, string>;
const routePaints = new Map<string, string>();
let safePhoneQuery = "";
try {
  paint = await (await vite.ssrLoadModule("/src/prerender.tsx") as { firstPaintHtml: () => Promise<string> }).firstPaintHtml();
  ledgerPaint = (await vite.ssrLoadModule("/src/ledger/first-paint.tsx") as { ledgerFirstPaintHtml: () => string }).ledgerFirstPaintHtml();
  const firstPaint = await vite.ssrLoadModule("/src/desk/first-paint.tsx") as { deskFirstPaintHtml: () => string; deskRoomFirstHtml: () => string };
  deskPaint = firstPaint.deskFirstPaintHtml();
  deskRoomPaint = Object.fromEntries((Object.keys(ROOM_HEADS) as (keyof typeof ROOM_HEADS)[]).map((room) => [room, firstPaint.deskRoomFirstHtml(room)]));
  // Track F: each page's own first render, its real component (prerender-routes.ts says why a file of its own).
  const { routeHtml } = await vite.ssrLoadModule("/src/route-paint.tsx") as { routeHtml: (p: unknown) => string };
  for (const r of FIRST_ROUTES) {
    stubBrowser(r.address);
    routePaints.set(r.id, routeHtml((await vite.ssrLoadModule(r.src) as { default: unknown }).default));
    unstubBrowser();
    if (!r.phone) continue;
    stubBrowser(r.address, true);
    routePaints.set(`${r.id}-phone`, routeHtml((await vite.ssrLoadModule(r.src) as { default: unknown }).default));
    unstubBrowser();
  }
  for (const form of ["phone", "wide"] as const) {
    stubBrowser("", form === "phone");
    const { Safe, phoneQuery: q } = await vite.ssrLoadModule("/src/Safe.tsx") as { Safe: unknown; phoneQuery: string };
    routePaints.set(`safe-${form}`, routeHtml(Safe));
    safePhoneQuery = q;
    unstubBrowser();
  }
} finally { await vite.close(); }

const css = readdirSync(join(dist, "assets")).find((f) => /^Wallet-[\w-]+\.css$/.test(f));
if (!css) throw new Error("prerender: no Wallet-*.css in dist/assets");
// The desk's one face (Archivo, wallet.css), fetched beside the stylesheet so the headline isn't drawn twice.
const font = readdirSync(join(dist, "assets")).find((f) => /^archivo-latin-wdth-normal-[\w-]+\.woff2$/.test(f));
if (!font) throw new Error("prerender: no archivo-latin-wdth-normal-*.woff2 in dist/assets");
const viewport = /<meta name="viewport"[^>]*>/;
const file = join(dist, "index.html");
let html = readFileSync(file, "utf8");
if (html.includes('id="wallet-first"')) throw new Error("prerender: dist/index.html already has a first paint");
// vite.config.ts keeps JS modulepreloads out of the head: on a 1.6 Mbps phone they shared the link with the blocking
// stylesheets the first paint waits for. Fail the build if one comes back.
if (html.includes('rel="modulepreload"')) throw new Error("prerender: dist/index.html modulepreloads JS in its head (see vite.config.ts)");

// The gate runs first in <head>, right after the viewport meta, before Vite's blocking main.css: it decides, starts the
// wallet's stylesheet downloading as a preload (beside main.css, not after it), and marks the page. A second script
// where the gate used to sit, after main.css, adds the stylesheet itself, so the cascade order is unchanged (Wallet.css
// after main.css, as when the wallet's chunk injects it) and its bytes are already on their way (Track B, slice 2: the
// phone wallet waited for main.css to land before asking, ~1.1 s). The font (90 KB) starts there too, after main.css:
// started in the gate it took the link from main.css (measured: 1042 -> 972 ms p95 by moving it).
// S1-4 (Round 1): the bare root means any query that names no page (`deskByDefault`: `/?utm_source=devpost` is the
// Desk), so the gate asks the same question with the same list (ROUTE_PARAMS) rather than "is there any query".
// Every inline script here reads $q, $h, $P and $R from the first script in web/index.html, one copy instead of each
// carrying its own (raw bytes on every route; gzip barely moves, so it is not a speed gain). Nothing may change $q:
// the router in index.html's body keeps its own URLSearchParams because it rewrites the address.
const gate = `<script>(function(){var q=$q,w=q.get("wallet"),R=$R;` +
  `if(!q.has("desk")&&q.get("market")!=="1"&&(location.pathname!=="/"||R.some(function(k){return q.has(k)}))&&(w==="1"||(${build}&&w!=="0"&&w!=="empty"))&&!q.has("run")&&!/(?:^|;\\s*)goose_wallet_(?:paid|held)=/.test(document.cookie)){` +
  `document.write('<link rel="preload" as="style" href="${base}assets/${css}">');$h.setAttribute("data-first","");$h.setAttribute("data-first-fit-display","")}})()</script>`;
const sheet = `<script>if($h.hasAttribute("data-first"))document.write('<link rel="stylesheet" href="${base}assets/${css}"><link rel="preload" as="font" type="font/woff2" crossorigin href="${base}assets/${font}">')</script>`;

// Commit 7 (Track B's phone trace): the Desk asked for its chunk only when main.js ran, at DOMContentLoaded (~1.39 s),
// and the hero waited for it (~1.8 s). Where main.tsx opens the Desk, a script after main.css (an inline script after a
// stylesheet runs only once that sheet has landed, so nothing here races the blocking CSS) starts the Desk's own files:
// its chunk and the chunks it imports as modulepreloads, its two stylesheets as style preloads (not sheets, so the
// cascade order stays Vite's, which adds them when the chunk loads, from cache). The list is Vite's manifest: the Desk's
// static graph less what main.js already loads, the same files Vite's own preload asks for at that import.
type Chunk = { file: string; imports?: string[]; css?: string[]; isEntry?: boolean; isDynamicEntry?: boolean };
const manifestFile = join(dist, ".vite", "manifest.json");
const manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as Record<string, Chunk>;
// The manifest only feeds this script; it isn't served (dist is the site).
// scripts/ratchet.ts reads it next to the build, from outside dist, for each route's first-load bytes.
mkdirSync(join(import.meta.dirname, "node_modules/.ratchet"), { recursive: true });
copyFileSync(manifestFile, join(import.meta.dirname, "node_modules/.ratchet/manifest.json"));
rmSync(join(dist, ".vite"), { recursive: true, force: true });
const graph = (key: string, seen = new Set<string>()): Set<string> => {
  const c = manifest[key];
  if (!c || seen.has(key)) return seen;
  seen.add(key);
  for (const k of c.imports ?? []) graph(k, seen);
  return seen;
};
const files = (keys: Set<string>) => new Set([...keys].flatMap((k) => [manifest[k]!.file, ...(manifest[k]!.css ?? [])]));
const mainKey = Object.keys(manifest).find((k) => manifest[k]!.isEntry && k.endsWith("index.html"));
// main.tsx imports the Desk through a facade (`.then((s) => s.D)`), so its chunk has a generated key: find it by file.
const deskKey = Object.keys(manifest).find((k) => /^assets\/Desk-[\w-]+\.js$/.test(manifest[k]!.file));
if (!mainKey || !deskKey) throw new Error("prerender: the manifest has no index.html entry or no Desk-*.js chunk");
const already = files(graph(mainKey));
const desk = [...files(graph(deskKey))].filter((f) => !already.has(f));
if (!desk.some((f) => /^assets\/Desk-[\w-]+\.js$/.test(f)) || !desk.some((f) => f.endsWith(".css"))) throw new Error(`prerender: the Desk's preload list looks wrong: ${desk.join(", ")}`);
// Track F: a room named in the address has its own chunks start beside the Desk's, from the room's file (below). main.tsx
// can't ask for them any sooner than React's chunk lands (about 1.2 s on the drill: its first line runs after its static
// imports), and the room's lazy imports wait for the Desk to render. Vite's manifest again; the rooms with no chunk of
// their own add nothing.
const roomFiles = (...sources: string[]) => {
  const keys = sources.map((k) => { if (!manifest[k]) throw new Error(`prerender: the manifest has no ${k}, a room's chunk`); return k; });
  return [...new Set(keys.flatMap((k) => [...files(graph(k))]))].filter((f) => !already.has(f) && !desk.includes(f));
};
// The story's chunk can lose its source key as the Desk's did: since the promises lead (Nov 5), ChallengeStart.tsx is
// shared only by the story and the Challenge, Rollup moves it into the story's chunk and Vite keys that chunk by its file.
// So it's found by file too, its source key first.
const storyKey = manifest["src/desk/story/Story.tsx"] ? "src/desk/story/Story.tsx" : Object.keys(manifest).find((k) => manifest[k]!.isDynamicEntry && /^assets\/Story-[\w-]+\.js$/.test(manifest[k]!.file));
if (!storyKey) throw new Error("prerender: the manifest has no Story-*.js chunk, the challenge room's");
// The panes' chunk too: the Desk and its rooms share it, so Vite keys it by its file ("_Panes-….js"), not its source.
const panesKey = manifest["src/desk/Panes.tsx"] ? "src/desk/Panes.tsx" : Object.keys(manifest).find((k) => manifest[k]!.isDynamicEntry && /^assets\/Panes-[\w-]+\.js$/.test(manifest[k]!.file));
if (!panesKey) throw new Error("prerender: the manifest has no Panes-*.js chunk, Your wants' room");
const ROOM_CHUNKS: Record<string, string[]> = { after: roomFiles("src/after/AfterPay.tsx"), challenge: roomFiles(storyKey, "src/desk/story/Challenge.tsx"), wants: roomFiles(panesKey, "src/desk/DeskState.tsx") };
// The preload lists' one loader. index.html is what every route downloads, and the five scripts below each carried their
// own copy of this: 630 bytes on all eleven routes, for one function (Track P, Wed Nov 4; the ratchet read it).
const preloader = `<script>function __pl(a){a.forEach(function(f){var l=document.createElement("link"),c=/\\.css$/.test(f);` +
  `l.rel=c?"preload":"module"+"preload";if(c)l.as="style";l.crossOrigin="";l.href=${JSON.stringify(base)}+f;document.head.appendChild(l)})}</script>`;
// Where main.tsx opens the Desk after its canonical rewrite (deskCanonical: an unknown `?desk=` is the Desk, a bare
// `?studio=force` is Behind the scenes) and deskByDefault (no parameter names another page). This runs in <head>,
// before index.html's first script rewrites the address, so it reads the address as it arrived; the test runs it
// against main.tsx's own predicate on the rewritten one.
const deskPreload = `<script>(function(){var q=$q,d=q.get("desk"),P=$P,R=$R;` +
  `if(q.get("market")!=="1"&&(d==="1"||location.pathname==="/"&&(d!==null&&P.indexOf(d)<0&&!q.has("wallet")||q.get("studio")!=="force"&&!R.some(function(k){return q.has(k)})))){` +
  `__pl(${JSON.stringify(desk)})}})()</script>`;
// Track B session 6 (Round 0 finding 8): Behind the scenes asked for its code in three serial waves after main.css
// (main.js and the shared React chunk; then studio/pick.ts; then SessionLedger.tsx with its graph), each wave one round
// trip the phone paid before the h1 could paint. The same script shape as the Desk's starts the ledger's own files
// after main.css where the address is `?desk=ledger` or `?desk=studio` without `studio=force`: pick.ts's chunk, the
// SessionLedger chunk and its static imports (less what main.js loads), its stylesheets as style preloads. AG Grid is
// not in that graph any more (SessionLedger.tsx loads it lazily behind the shell table), so the list stays small.
// While `STUDIO_DEFAULT` is off, or the build has no good key, pick.ts always lands on the Community ledger for those
// addresses. Once it flips with a key, the page is Studio until the key's last day by the visitor's clock
// (`studioUntil`), so the head answers the same question pick.ts will: Studio's own file before that, this ledger paint
// after it. A flip never leaves a visitor without a first paint, and an expired key puts this one back with no rebuild.
// With the code, the page's first paint (web/src/ledger/first-paint.tsx: the bar and the hero, drawn "reading", the
// same components the page renders): its stylesheets are preloaded by a gate in the head (beside main.css, as the
// wallet's), added as blocking sheets after main.css (the cascade order Vite would give them), and the markup is put in
// #root from a <template> after the practice line, so a phone shows the h1 and the status line before main.js is
// requested. React draws the same markup over it. Its own attribute (`data-first-ledger`), so the wallet's scripts,
// which test `data-first`, never fire for it.
// By output file, never `src`, as the route table's are: which chunks Rollup keys by source changes with what's in the build, a real key included.
const byFile = (file: RegExp) => Object.keys(manifest).find((k) => file.test(manifest[k]!.file));
const pickKey = byFile(/^assets\/pick-[\w-]+\.js$/);
const ledgerKey = byFile(/^assets\/SessionLedger-[\w-]+\.js$/);
if (!pickKey || !ledgerKey) throw new Error("prerender: the manifest has no studio/pick.ts or SessionLedger.tsx chunk");
const ledger = [...files(new Set([...graph(pickKey), ...graph(ledgerKey)]))].filter((f) => !already.has(f));
const ledgerJs = ledger.filter((f) => !f.endsWith(".css"));
const ledgerCss = ledger.filter((f) => f.endsWith(".css"));
if (!ledgerJs.some((f) => /^assets\/SessionLedger-[\w-]+\.js$/.test(f)) || ledgerCss.length === 0) throw new Error(`prerender: the ledger's preload list looks wrong: ${ledger.join(", ")}`);
if (ledgerJs.some((f) => /^assets\/index\.esm-[\w-]+\.js$/.test(f) && statSync(join(dist, f)).size > 200_000)) throw new Error("prerender: the ledger's preload list carries an AG chunk again (SessionLedger.tsx must load the grid lazily)");
// Track B session 10 (Round 4 a11y-perf, fix 5): the haggle's h1 waited for main.js to run (~1.35 s on the phone drill)
// before its chunk and then its three stylesheets were asked for, two more waves: h1 at ~1.8 s. The same script shape as
// the Desk's and the ledger's starts the haggle's own files after main.css where the address is `?desk=haggle`: its
// chunk and its static imports as modulepreloads (less what main.js loads), its stylesheets as style preloads (Vite adds
// them as sheets when the chunk loads, from cache, so the cascade order is unchanged). The ladder's AG Charts chunk is a
// lazy import of its own and stays out: 1.4 MB that would share the link with the h1's bytes.
const haggleKey = byFile(/^assets\/Haggle-[\w-]+\.js$/);
if (!haggleKey) throw new Error("prerender: the manifest has no Haggle.tsx chunk");
const haggle = [...files(graph(haggleKey))].filter((f) => !already.has(f));
if (!haggle.some((f) => /^assets\/Haggle-[\w-]+\.js$/.test(f)) || !haggle.some((f) => f.endsWith(".css"))) throw new Error(`prerender: the haggle's preload list looks wrong: ${haggle.join(", ")}`);
if (haggle.some((f) => /^assets\/index\.esm-[\w-]+\.js$/.test(f) || (f.endsWith(".js") && statSync(join(dist, f)).size > 200_000))) throw new Error("prerender: the haggle's preload list carries an AG chunk or a JS file over 200 KB (the ladder must stay a lazy import)");
const hagglePreload = `<script>(function(){var q=$q;if(q.get("market")!=="1"&&q.get("desk")==="haggle"){` +
  `__pl(${JSON.stringify(haggle)})}})()</script>`;
// W7: App.tsx (the classic page) is a lazy chunk now, so no other route parses it before its own chunk. On the classic
// page that put one more wave after main.js (its React content: 1906 -> 2265 ms on the phone drill), so the same script
// shape starts App's chunk and its static imports (less what main.js loads) after main.css where the address is
// `?wallet=0` (no `?desk=`, not the market), the classic page's own link. Its sheet too, run-cv.css (gate seat 7). A wrong
// guess costs bytes, never the page: main.tsx alone decides what renders.
const appKey = byFile(/^assets\/App-[\w-]+\.js$/);
if (!appKey) throw new Error("prerender: the manifest has no App.tsx chunk (main.tsx must import it lazily)");
const classic = [...files(graph(appKey))].filter((f) => !already.has(f));
if (!classic.some((f) => /^assets\/App-[\w-]+\.js$/.test(f))) throw new Error(`prerender: the classic page's preload list looks wrong: ${classic.join(", ")}`);
if (classic.some((f) => /^assets\/index\.esm-[\w-]+\.js$/.test(f) || statSync(join(dist, f)).size > 200_000)) throw new Error("prerender: the classic page's preload list carries an AG chunk or a JS file over 200 KB");
const classicPreload = `<script>(function(){var q=$q;if(q.get("market")!=="1"&&!q.has("desk")&&q.get("wallet")==="0"){` +
  `__pl(${JSON.stringify(classic)})}})()</script>`;
// Track R (SYS's phone drill: system 1319 ms, how 1412 ms, the 1000 ms budget MISSED): How it works and the design system
// asked for their chunk only when main.js ran, one wave after main.css. The same script shape as the haggle's starts each
// page's own files after main.css where the address is `?desk=how` or `?desk=system`: its chunk and its static imports as
// modulepreloads (less what main.js loads), its stylesheets as style preloads (Vite adds them as sheets when the chunk
// loads, from cache, so the cascade order is unchanged). Same guards: no AG chunk, no JS file over 200 KB.
// The chunk is found by its file (`assets/System-*.js`, a lazy entry), not its source path: Specimens.tsx imports back
// from System.tsx, and that cycle gives System a synthetic `_System-*.js` key with no `src` (the first build here threw).
const sysPages = (["how", "system"] as const).map((d) => {
  const name = d === "how" ? "How" : "System";
  const chunk = new RegExp(`^assets/${name}-[\\w-]+\\.js$`);
  const key = Object.keys(manifest).find((k) => manifest[k]!.isDynamicEntry && chunk.test(manifest[k]!.file));
  if (!key) throw new Error(`prerender: the manifest has no lazy ${name}-*.js chunk (main.tsx must import it lazily)`);
  const list = [...files(graph(key))].filter((f) => !already.has(f));
  if (!list.some((f) => chunk.test(f))) throw new Error(`prerender: ?desk=${d}'s preload list looks wrong: ${list.join(", ")}`);
  if (list.some((f) => /^assets\/index\.esm-[\w-]+\.js$/.test(f) || (f.endsWith(".js") && statSync(join(dist, f)).size > 200_000))) throw new Error(`prerender: ?desk=${d}'s preload list carries an AG chunk or a JS file over 200 KB`);
  return [d, list] as const;
});
const sysPreload = `<script>(function(){var q=$q,P=${JSON.stringify(Object.fromEntries(sysPages))},d=q.get("desk");` +
  `if(q.get("market")!=="1"&&d!==null&&Object.prototype.hasOwnProperty.call(P,d)){` + // never `?desk=constructor`'s
  `__pl(P[d])}})()</script>`;
// The nav's egg: Vite's SSR gives the source path; the page serves the built asset.
const eggKey = Object.keys(manifest).find((k) => k.endsWith("src/desk/egg.webp"));
if (!eggKey) throw new Error("prerender: the manifest has no desk/egg.webp asset");
// The bar's egg mark is an <img> with its width and height in the first paint, but inside the <template> it is inert:
// its fetch began only when the template was placed, at the body's end, and on the phone drill it landed ~0.7 s after
// the h1 (DD, B-6: "pops in with React"). The gate starts it from the head, beside the stylesheets (12 KB; it does not
// block the h1). Track B session 7.
const eggHref = `${base}${manifest[eggKey]!.file}`;
// S1-13: the bar's mark is B-11's lockup now (SiteNav), a vector egg from the page's #ggEgg symbol: no image to fetch.
if (!ledgerPaint.includes('class="gg gg-bar"') || !ledgerPaint.includes('id="sl-h"') || !ledgerPaint.includes("Reading your ledger")) throw new Error("prerender: the ledger's first paint lost its bar, h1 or status line");
if (!ledgerPaint.includes(`data-board="${BOARD_PAINT}"`) || !ledgerPaint.includes("Reading the record")) throw new Error("prerender: the ledger's first paint lost the board's first lines");;
// The <img> and the preload React's server renderer adds for it.
ledgerPaint = ledgerPaint.replaceAll("/src/desk/egg.webp", eggHref);
// The facts the page's own gate reads (vite.config.ts's define), so the head and pick.ts can't disagree; 0 on today's builds.
const studioEnds = studioUntil(licenceFacts, byDefault);
const forcedEnds = studioUntil(licenceFacts, true);
const onBack = `q.get("market")!=="1"&&(d==="ledger"||d==="studio")`;
// No good licence: the forced address has no first paint of either kind, and none of the host's or the clock's bytes are here (every route downloads this page).
const notStudio = ledgerTest(studioEnds, forcedEnds);
// The board's one early request is for both pages of Behind the scenes: the ledger's first paint and Studio's light board read it.
const ledgerGate = `<script>${studioLive(studioEnds)}(function(){var q=$q,d=q.get("desk");if(${onBack}){${EARLY_BOARD}if(${notStudio}){$h.setAttribute("data-first-ledger","");` +
  `document.write(${JSON.stringify(ledgerCss.map((f) => `<link rel="preload" as="style" href="${base}${f}">`).join("") + (ledgerPaint.includes(eggHref) ? `<link rel="preload" as="image" href="${eggHref}" fetchpriority="high">` : ""))})}}})()</script>`;
const ledgerSheets = `<script>if($h.hasAttribute("data-first-ledger"))document.write(${JSON.stringify(ledgerCss.map((f) => `<link rel="stylesheet" href="${base}${f}">`).join(""))})</script>`;
const ledgerPreload = `<script>if($h.hasAttribute("data-first-ledger"))__pl(${JSON.stringify(ledgerJs)})</script>`;
// With the first paint in place, the same script opens the page's stream (the handshake SessionLedger.tsx makes on
// mount: the EventSource, and when it ends, one fetch for the reason) and keeps what it sees on `window.__ledgerStream`
// (the EventSource while open, the rows it buffered, the end once known); the page adopts it on mount and never opens a
// second stream (the server allows two per browser). Measured: the handshake's two round trips began at ~2.0 s on the
// phone drill, after React mounted; from here they begin at ~0.3 s. The script is web/src/ledger/early-stream.ts (Track R:
// a stream that never opened ends at its first error, as follow.ts's; it once waited for CLOSED, one retry late).
const earlyStream = EARLY_STREAM;
const ledgerPlace = `<template id="ledger-first">${ledgerPaint}</template><script>if($h.hasAttribute("data-first-ledger")){` +
  `document.getElementById("root").replaceChildren(document.getElementById("ledger-first").content.cloneNode(true));window.__board.f();${earlyStream}}</script>`;
// Track B session 8 (Round 3's design judge, fix 2): the landing's words in the HTML first paint, as the ledger's. Where
// the page opens on the Desk's landing (deskPreload's address, less PayPal's return `?run=` and a link into a room by
// its hash, which never draw the hero), the bar and the headline (web/src/desk/first-paint.tsx, the same SiteNav and
// Landing the Desk renders) are put in #root from a <template>, and the Desk's stylesheet (Desk-*.css; its tokens are in
// main.css already, once: Track F, Nov 5) lands as a blocking sheet after main.css, preloaded from the head gate beside it; so the headline is
// on screen once those sheets are in, before main.js is asked for, and React draws the same markup over it. The words
// wear the tuned fallback faces (`data-first-face`) until the Desk mounts, so the web faces are asked for when they were
// before (a word set in them is what asks), never in the first wave. Each fallback's fit (B-9, below) stays until its
// own web face is in, and only then: `data-first-fit` (Archivo: the bar and the lede) and `data-first-fit-display`
// (Hanken 300: the headline), so neither is lifted while its fallback is still drawn. `data-first-desk` stays for the page's life and keeps the Desk from
// fading in again the words already on screen (deskFirstCss).
const deskCss = desk.filter((f) => f.endsWith(".css"));
if (deskCss.length !== 1 || !deskCss[0]!.includes("Desk-")) throw new Error(`prerender: the Desk's stylesheets changed (${deskCss.join(", ")}); check their order against Vite's preload of the Desk chunk, and that tokens.css still comes once, in main.css`);
if (!deskPaint.includes("dk-egg-still") || !deskPaint.includes("Nothing is paid") || !deskPaint.includes("dk-nav-in")) throw new Error("prerender: the landing's first paint lost its bar or headline");
// The bar's egg mark (SiteNav's <img> and the preload React's server renderer adds for it), as the ledger's: Vite's SSR
// gives the source path, which the built site doesn't serve (Round 4: three 404s and a broken-image icon in the bar
// for ~0.5 s on every cold load of the landing). Track B session 9.
deskPaint = deskPaint.replaceAll("/src/desk/egg.webp", eggHref);
// The fits below hold only for the words they were measured on (DD, B-9 ruling 2a): fail the build, never ship a wrong fit.
const drift = fitWordsChanged(deskPaint, readFileSync(join(web, "src", "desk", "Desk.tsx"), "utf8"));
if (drift) throw new Error(`prerender: ${drift}`);
// A room's painted head says what its own head says, or the build stops (the head is drawn twice: here and by the room).
const roomDrift = roomHeadsChanged((f) => readFileSync(join(web, "src", f), "utf8"));
if (roomDrift) throw new Error(`prerender: ${roomDrift}`);
// Track F (Round 5's a11y-perf seat): a room named in the address (`?desk=1#wants`) never draws the hero, so it had no
// first paint: nothing on a phone until the Desk's code ran, the hero then, and the room after its own chunks (2.9 s on
// the drill for #challenge, 2.6 s for #after). Now the bar and the room's head are painted here, as the landing's words
// are, in a cover over the page; the Desk lifts it when the room's own head is on screen (desk/room-first.ts). The cover
// is only ever those words: nothing in it can be tapped, and it hides itself after 8 s if the Desk never comes.
// Its own file per room (first/room-<name>.html, written below), as prerender-routes.ts's pages: index.html is what every
// route downloads, and the ratchet read the cover in it as 3.6 KB on all eleven, for five addresses most never open.
const ROOM_NAMES = JSON.stringify(Object.keys(ROOM_HEADS));
const onDesk = `var q=$q,d=q.get("desk"),P=$P,R=$R,N=location.hash.slice(1);` +
  `if(q.get("market")!=="1"&&!q.has("run")&&(d==="1"||location.pathname==="/"&&(d!==null&&P.indexOf(d)<0&&!q.has("wallet")||q.get("studio")!=="force"&&!R.some(function(k){return q.has(k)}))))`;
const deskSheetPreloads = deskCss.map((f) => `<link rel="preload" as="style" href="${base}${f}">`).join("");
const deskGate = `<script>(function(){${onDesk}{var h=$h,S=${JSON.stringify(deskSheetPreloads)},a=function(n,v){h.setAttribute("data-first-"+n,v||"")};` +
  `if(${ROOM_NAMES}.indexOf(N)>=0){a("room",N);a("fit");window.__room=fetch(${JSON.stringify(base)}+"first/room-"+N+".html").then(function(r){return r.ok?r.text():""},function(){return""});${EARLY_CHALLENGE}${EARLY_WANTS}${fillAsk(JSON.stringify(base + ROOM_FILL_FILE))}}` +
  // Track F: the egg's still starts here, ahead of every sheet, not after them. A script below the sheets waits for them,
  // which put the egg in the same wave as the Desk's 15 scripts: 15.5 KB took 500 ms and it landed about 1060 ms on live.
  // R: a hash that opens the landing itself (`#ask`, `#talk`, `#watcher`, `#mixer`) gets the landing's paint, as `/` does.
  `else if(!N||${JSON.stringify(LANDING_HASHES)}.indexOf(N)>=0){a("desk");a("face");a("fit");a("fit-display");S+=${JSON.stringify(`<link rel="preload" as="image" fetchpriority="high" href="${eggHref}">`)}}else return;document.write(S)}})()</script>`;
// Round 3's a11y-perf judge asked for the two faces to be preloaded here (the words waited on them, 676-835 ms on the
// live site). They aren't: the words no longer wait on them (they paint in the fallbacks), and the faces are 125 KB
// (Archivo 90, Hanken 35) that on the 1.6 Mbps drill land in the Desk's first wave and put its mount ~680 ms later
// (measured, B-8 packet). They are asked for when the Desk mounts, as before.
// Written after deskPreload: an inline script waits for every sheet above it, so the Desk's code is still asked for once
// main.css is in (W's commit 7), not once these two are as well (~80 ms later on the drill, measured).
const deskSheets = `<script>if($h.hasAttribute("data-first-desk")||$h.hasAttribute("data-first-room"))document.write(${JSON.stringify(deskCss.map((f) => `<link rel="stylesheet" href="${base}${f}">`).join(""))})</script>`;
// The rules the first paint needs, before any sheet that could carry them (a few hundred bytes on every page; inert
// without the attributes). The template's own root (`.dk[data-first]`) shows the words alone: the line, the Ask box,
// the chips and the egg hold their boxes, hidden, as the opening holds them. The rest outrank desk.css's opening rules
// for the page's life: the headline and the bar's contents (and the phone's rail) stay as they were painted (no second
// fade when React draws them; the sheen still crosses), and the bar's hairline stands rather than drawing in again.
// On a phone the egg rises through the headline's place (desk.css), so there the case stands its egg where the hero's
// egg is (the placing script measures it): it lights in place above the words, and the hairline leaves from under it.
const deskFirstCss = `<style>` +
  `.dk[data-first] .dk-hero-copy>:not(h1),.dk[data-first] .dk-hero-egg{visibility:hidden;animation:none}` +
  `html[data-first-desk] .dk-hero .dk-hero-copy>h1{animation:none}` +
  // Joshua (Wed Nov 4, 3d): under 430 px the headline is small and the line under it is the first screen's largest words,
  // so it is in the first paint with the headline, and stays put through the opening (the case's egg stands above both).
  `@media (max-width:430px){.dk[data-first] .dk-hero-copy>.dk-sub{visibility:visible}html[data-first-desk] .dk-hero .dk-sub{animation:none}}` +
  `html[data-first-desk]:not(.dk-sheen) .dk-hero .dk-mask>span{animation:none}` +
  `html[data-first-desk].dk-sheen .dk-hero .dk-mask>span{animation:dk-sheen 1100ms var(--spring) calc(var(--i,0)*40ms) both}` +
  `@media (max-width:720px){html[data-first-desk].dk-sheen .dk-hero .dk-mask>span{animation-delay:calc(240ms + var(--i,0)*40ms)}}` +
  `html[data-first-desk].dk-opening .dk-nav-in{opacity:1;transition:none}` +
  `html[data-first-desk] .dk-intro{animation:none}` +
  `html[data-first-face] body,html[data-first-face] body *{font-family:"Archivo Fallback",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif!important}` +
  `html[data-first-face] .dk-hero h1,html[data-first-face] .dk-hero h1 *,html[data-first-face] .ds-h2,html[data-first-face] .ds-h2 *{font-family:"Hanken Fallback",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif!important}` +
  `html[data-first-fit] .dk .gn .dk-practice-ph{letter-spacing:.0056em}html[data-first-fit] .dk .gn :is(.dk-menu,.dk-layer a,.dk-judge){letter-spacing:.0065em}` +
  // B-9 (DD, §5 Stand-ins: every line end within 2 px of the web face's). One size-adjust can't hold these: Hanken 300
  // against Helvetica Neue Light runs 1.008 to 1.035 wide line by line ("Nothing is paid" vs "until you tap."), Archivo
  // against Arial 0.98 to 1.02 word by word, and tokens.css's fallbacks are tuned to Behind the scenes' words (B-7). So
  // each of the landing's runs gets its own fit, measured against the web face's line ends at 1440 and 390 (brand.md §7).
  // The values and the words they were measured on live together in first-fit.ts (pinned above: B-10).
  fitCss() +
  `html[data-first-egg] .dk[data-first] .dk-hero-egg{visibility:visible}` +
  `#dk-case[style*="--cy"] svg{left:var(--cx);top:var(--cy)}#dk-case[style*="--cy"] i{left:var(--cx);top:calc(var(--cy) + var(--cw)*.548 + 18px)}` +
  `</style>`;
// Placed after the practice line, as the ledger's. On a phone during the opening it stands the case's egg on the hero's
// own (its centre and width), so opening.ts's hand-off is in place. When React replaces the template's root (the Desk
// mounted) it lifts the forced fallbacks, which asks for the faces, and each fit once its own face is in. A face that
// never loads (blocked, offline) keeps its fit, as its fallback stays: B-8 lifted the bar's on failure too, and on the
// woff2-blocked drill the bar's words then stepped 6.3 px with no face to swap to.
// Joshua (Wed Nov 4, 3d): on a phone the first section's start is on the first screen, so the first paint has to draw it.
// Since his Fri Nov 6 9:35 AM decision 1a that section is 01, the challenge, right under the ask (ChallengeStart.tsx),
// numbered by hero.css's counter.
if (!deskPaint.includes('id="ds-ch-h"') || !deskPaint.includes('class="dk-eyebrow ds-eyebrow ds-n"')) throw new Error("prerender: the landing's first paint lost section 01's start (ChallengeStart.tsx); on a phone it is on the first screen");
const EGG_BY = GLIDE_BY + 50;
const deskPlace = `<template id="desk-first">${deskPaint}</template><script>(function(){var h=$h,r=document.getElementById("root"),n=h.getAttribute("data-first-room"),T=document.getElementById("desk-first").content;` +
  // A room: its file, with the same bar the landing's first paint carries, unless the room got here first (roomArrived).
  `if(n){window.__room.then(function(t){if(t&&h.hasAttribute("data-first-room")){var x=document.createElement("template");x.innerHTML=t;x.content.querySelector(".dk").prepend(T.querySelector(".gn").cloneNode(true));[].forEach.call(x.content.querySelectorAll("link[data-room-sheet]"),function(l){document.head.append(l)});document.body.append(x.content);${FILL_PLACED}}});return}` +
  `if(!h.hasAttribute("data-first-desk"))return;` +
  `r.replaceChildren(T.cloneNode(true));` +
  `var c=document.getElementById("dk-case"),e=r.querySelector(".dk-hero .dk-egg-body");if(c&&e&&h.classList.contains("dk-opening")&&matchMedia("(max-width: 720px)").matches){var b=e.getBoundingClientRect();` +
  `if(b.width>0){c.style.setProperty("--cw",b.width.toFixed(1)+"px");c.style.setProperty("--cx",(b.left+b.width/2).toFixed(1)+"px");c.style.setProperty("--cy",(b.top+b.height/2).toFixed(1)+"px")}}` +
  `var fit=function(a,f){Promise.all(f.map(function(x){return document.fonts.load(x)})).then(function(l){if(l.every(function(s){return s.length}))h.removeAttribute(a)},function(){})},` +
  `lift=function(){h.removeAttribute("data-first-face");fit("data-first-fit",['400 1em "Archivo Goose"','560 1em "Archivo Goose"']);fit("data-first-fit-display",['300 1em "Hanken Goose"'])},` +
  `m=new MutationObserver(function(){if(!r.querySelector(".dk[data-first]")){m.disconnect();lift()}});m.observe(r,{childList:true});` +
  // Track F: the Desk isn't here by EGG_BY, so the opening won't play (it needs a Desk by its GLIDE_BY: opening-clock.ts):
  // what opening.ts's finish() does, now rather than when the code lands, and the egg shows where it stands. `dk-fade`, only
  // if the dark egg was up: it fades as the gold one comes (web/index.html), rather than going in one frame.
  `setTimeout(function(){if(r.querySelector(".dk[data-first]")){if(h.classList.contains("dk-opening"))h.classList.add("dk-fade");h.classList.remove("dk-opening");h.classList.add("dk-opened","dk-skip");h.setAttribute("data-first-egg","")}},Math.max(0,${EGG_BY}-performance.now()))})()</script>`;
if (!paint.includes(`>${FIT_WALLET.h1.split(" 1 ")[0]} <span class="dnum">1</span> ${FIT_WALLET.h1.split(" 1 ")[1]}<`)) throw new Error(`prerender: the wallet's h1 no longer reads "${FIT_WALLET.h1}", the words its fit was measured on (first-fit.ts)`);
const place = `<template id="wallet-first">${paint}</template><script>(function(){if(!$h.hasAttribute("data-first"))return;` +
  `document.body.classList.add("wallet-on");var b=document.querySelector(".gn-foot");if(b)b.textContent=${JSON.stringify(PRACTICE)};` +
  `document.getElementById("root").replaceChildren(document.getElementById("wallet-first").content.cloneNode(true));` +
  // Track F: the h1's fit stays until its own web face is in, as the landing's does; a face that never loads keeps it.
  `document.fonts.load('300 1em "Hanken Goose"').then(function(l){if(l.length)$h.removeAttribute("data-first-fit-display")},function(){})})()</script>`;

// Track F: the pages drawn to their own files, and the gate that fetches only the address's own one.
const routeRows = FIRST_ROUTES.map((r) => {
  const key = Object.keys(manifest).find((k) => manifest[k]!.isDynamicEntry && r.chunk.test(manifest[k]!.file));
  if (!key) throw new Error(`prerender: the manifest has no lazy chunk for ${r.address} (main.tsx must import it lazily)`);
  const list = [...files(graph(key))].filter((f) => !already.has(f));
  return { id: r.id, address: r.address, css: list.filter((f) => f.endsWith(".css")), ...(r.phone ? { phone: r.phone } : {}) };
});
mkdirSync(join(dist, "first"), { recursive: true });
for (const [id, html] of routePaints) {
  const page = html.replaceAll("/src/desk/egg.webp", eggHref);
  const left = page.match(SOURCE_PATH);
  if (left) throw new Error(`prerender: first/${id}.html carries a source path, which the built site doesn't serve: ${left[0]}`);
  writeFileSync(join(dist, "first", `${id}.html`), page);
}
// A room's file: the cover, with its rules and its chunks inside it, so they all leave together. The links start the
// chunks when the file goes in; a preload in the body is as good as one in the head.
for (const [room, paint] of Object.entries(deskRoomPaint)) {
  // Your wants' sheets are applied, not only fetched: its cover draws the empty list with them (early-wants.ts). The placer
  // moves them to the head, where Vite finds them by href when the pane's chunk comes and adds no second copy; inside the
  // cover they'd leave with it and take the room's styles along.
  const links = (ROOM_CHUNKS[room] ?? []).map((f) => (f.endsWith(".css") ? (room === "wants" ? `<link rel="stylesheet" crossorigin data-room-sheet href="${base}${f}">` : `<link rel="preload" as="style" crossorigin href="${base}${f}">`) : `<link rel="modulepreload" crossorigin href="${base}${f}">`)).join("");
  const page = paint.replace(/^<div[^>]*>/, (m) => `${m}<style>${roomFirstCss()}</style>${links}`);
  if (!page.includes("<style>#dk-room-first{") || page.match(SOURCE_PATH)) throw new Error(`prerender: first/room-${room}.html lost its rules or carries a source path`);
  writeFileSync(join(dist, "first", `room-${room}.html`), page);
}
// The two covers' fills, in their own file: inline in the placer they were 1,007 B on every route's first load (room-fill.ts).
writeFileSync(join(dist, ROOM_FILL_FILE), roomFillFile(CHALLENGE_FILL + WANTS_FILL));
// The Challenge's cover carries its counter's boxes, which the head's early answer fills: without them a cold phone waited
// 2.9 s for the counter, the largest thing on its screen (Track F, Nov 6; story/early-challenge.ts).
if (!["ds-lede", '<div class="ds-ch-count"><p class="ds-ch-line"><span></span><span class="ds-ch-outcome"></span></p><p class="ds-ch-second"></p></div>'].every((w) => deskRoomPaint.challenge?.includes(w))) throw new Error("prerender: first/room-challenge.html lost its counter's boxes, which the early answer fills");
// Your wants' cover carries a new visitor's empty list and the two sheets that draw it (early-wants.ts).
const wantsRoom = readFileSync(join(dist, "first", "room-wants.html"), "utf8"), wantsSheets = (ROOM_CHUNKS.wants ?? []).filter((f) => f.endsWith(".css"));
if (!["dk-room-empty", "dk-watch-first", "dk-watch-said", "st-note"].every((w) => wantsRoom.includes(w)) || !wantsSheets.length || !wantsSheets.every((f) => wantsRoom.includes(`<link rel="stylesheet" crossorigin data-room-sheet href="${base}${f}">`)))
  throw new Error("prerender: first/room-wants.html lost its empty list or the sheets that draw it");
const safeFile = join(dist, "safe.html");
const safeHtml = readFileSync(safeFile, "utf8");
if (!viewport.test(safeHtml) || !safeHtml.includes('<div id="root" style="display: contents"></div>')) throw new Error("prerender: safe.html has no viewport meta or no #root");
// Studio's two files carry the counter's first lines (Shell.tsx FirstCounter), which the head's early answer fills: without
// them a cold phone waits 2.4 s for React and the board's chunk before the count (Track F, Nov 5).
// The list's file carries its empty view, hidden, for the head's early answer to reveal (LIST_EARLY); and "Reading" for every other answer.
if (!["data-list-first", "No gifts yet.", "xl-reading"].every((w) => routePaints.get("list")?.includes(w))) throw new Error("prerender: first/list.html lost its empty view or its reading line");
for (const id of ["studio", "studio-phone"]) if (!routePaints.get(id)?.includes(`data-board="${BOARD_PAINT}"`) || !routePaints.get(id)!.includes("Reading the record")) throw new Error(`prerender: first/${id}.html lost the board's first lines`);
if (!routePaints.get("safe-phone")?.includes(FIT_SAFE.line)) throw new Error(`prerender: safe.html's "if" line no longer reads ${JSON.stringify(FIT_SAFE.line)}, so FIT_SAFE (web/first-fit.ts) was measured on other words and the face swap would step again`);
writeFileSync(safeFile, await leanScripts(safeHtml.replace(viewport, (m) => m + safeGate(base, safePhoneQuery) + fitSafeCss()).replace('<div id="root" style="display: contents"></div>', (m) => m + routePlace)));
const routeFirstGate = routeGate(routeRows, base, TICKS, studioEnds, forcedEnds);

const root = '<div id="root"></div>';
if (!html.includes("</head>") || html.split(root).length !== 2) throw new Error("prerender: dist/index.html has no single #root");
// S1b: the practice line is the page's last line now (.gn-foot, right after #root), so the script goes after it: it sets
// that line's words, which must be parsed first. Commit 6: after its <footer> landmark too, so the script sits outside it.
const foot = /<p class="gn-foot"[^>]*>[\s\S]*?<\/p>(?:<\/footer>)?/;
const after = html.split(root)[1]!.match(foot);
if (!after) throw new Error("prerender: dist/index.html has no practice line (.gn-foot) after #root");
if (!viewport.test(html)) throw new Error("prerender: dist/index.html has no viewport meta to put the gate after");
html = html.replace(viewport, (m) => m + gate + ledgerGate + deskGate + routeFirstGate + deskFirstCss).replace("</head>", `${sheet}${ledgerSheets}${routeSheets}${preloader}${deskPreload}${deskSheets}${ledgerPreload}${hagglePreload}${sysPreload}${classicPreload}</head>`).replace(after[0], () => after[0] + place + ledgerPlace + deskPlace + routePlace);
// No source path may reach the built page: the server serves dist, never web/src (Round 4's egg 404 came from one).
// Every first paint is SSR'd from source, so check the emitted HTML as a whole, not each template.
// Any quoting or context a path can sit in: "/src/, '/src/, url(/src/, href=/src/ (DD, B-9 nit; B-10).
const leak = html.match(SOURCE_PATH);
if (leak) throw new Error(`prerender: dist/index.html carries a source path (/src/...), which the built site doesn't serve: ${leak[0]}`);
writeFileSync(file, await leanScripts(dropLayout(html)));
console.log(`prerender: wallet first paint written (${paint.length} chars, ${build ? "wallet build" : "?wallet=1 only"})`);

// The white site's first paint (the Nov 11 speed gate, Lead-13's RED 1: goose.html drew only a "Loading" splash until its
// JS had run, 1.8 s on the phone drill against the old root's 0.52 s). After `vite build` and prerender.ts, this writes
// the home's own first render (web/src/site/first-paint.tsx) into dist/goose.html:
// - in a <template> after #root, with a small inline script that puts it in #root only when the visit opens on the home
//   (no hash or "#/", and no PayPal return ?run=, which opens Shop's receipt); any other visit keeps the splash;
// - where the visit opens off the home (a hash route, or PayPal's return), modulepreloads of the entry's own imports
//   (React DOM's chunk first), plus Shop's chunks for #/shop and a return, so they come in parallel with the entry, not
//   after it. The home gets none: its first screen is this HTML, and preloads there share the phone's link with the
//   blocking stylesheet (phone drill: home 606 ms with none, 635 ms with them; a cold #/shop 1967 -> 1752 ms with them).
// - the splash is the goose the header draws (goose-96.webp, 3 KB; 192 on a dense screen): no file of its own.
// main.tsx mounts with createRoot, which replaces the paint with the same components: no hydration, so no mismatch.
//   node site-paint.ts            (the build runs it)      node site-paint.ts --dry   (prints, writes nothing)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { stubBrowser, unstubBrowser } from "./prerender-routes.ts";

const web = fileURLToPath(new URL(".", import.meta.url));
const dist = join(web, "dist");
const dry = process.argv.includes("--dry");
const MARK = "<!-- site-paint -->";
// The build's base: "/" on our server, "/gilded-goose/" on the Pages mirror (vite.config.ts and prerender.ts read the same).
const base = process.env.GOOSE_BASE ?? "/";

const vite = await createServer({ root: web, server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
let paint: string;
try {
  stubBrowser("goose.html");
  paint = (await vite.ssrLoadModule("/src/site/first-paint.tsx") as { siteFirstPaintHtml: () => string }).siteFirstPaintHtml();
} finally {
  unstubBrowser();
  await vite.close();
}
if (!paint.includes('id="hero-title"') || !paint.includes("hx-fine")) throw new Error("site-paint: the home's first render has no headline or practice line");
if (paint.includes("</template>") || paint.includes("<script")) throw new Error("site-paint: the paint would break out of its <template>");

const file = join(dist, "goose.html");
let html = readFileSync(file, "utf8");
if (html.includes(MARK)) throw new Error("site-paint: dist/goose.html is painted already (run the build again)");

// The entry and its static imports, from the build's manifest (prerender.ts reads it the same way).
const manifest = JSON.parse(readFileSync(join(web, "node_modules/.ratchet/manifest.json"), "utf8")) as Record<string, { file: string; imports?: string[]; isEntry?: boolean }>;
const entry = manifest["goose.html"];
if (!entry?.isEntry) throw new Error("site-paint: the manifest has no goose.html entry");
const seen = new Set<string>();
const walk = (k: string) => { if (seen.has(k)) return; seen.add(k); for (const i of manifest[k]?.imports ?? []) walk(i); };
for (const i of entry.imports ?? []) walk(i);
const preloads = [...seen].map((k) => manifest[k]!.file).sort((a, b) => (b.startsWith("assets/client-") ? 1 : 0) - (a.startsWith("assets/client-") ? 1 : 0));
const shopKey = Object.keys(manifest).find((k) => /^assets\/Shop-[\w-]+\.js$/.test(manifest[k]!.file));
if (!shopKey) throw new Error("site-paint: the build has no Shop-*.js chunk");
const shopSeen = new Set<string>(seen);
const before = new Set(shopSeen);
const walkShop = (k: string) => { if (shopSeen.has(k)) return; shopSeen.add(k); for (const i of manifest[k]?.imports ?? []) walkShop(i); };
walkShop(shopKey);
const shopFiles = [...shopSeen].filter((k) => !before.has(k)).map((k) => manifest[k]!.file);
const ROUTE = `var h=location.hash,home=(h===""||h==="#/"||h.indexOf("#/#")===0)&&!/[?&]run=/.test(location.search)`;
const links = `<script>(function(){${ROUTE};if(home)return;var u=${JSON.stringify(preloads.map((f) => `${base}${f}`))};if(h.indexOf("#/shop")===0||/[?&]run=/.test(location.search))u=u.concat(${JSON.stringify(shopFiles.map((f) => `${base}${f}`))});u.forEach(function(x){var l=document.createElement("link");l.rel="modulepreload";l.crossOrigin="";l.href=x;document.head.appendChild(l);});})()</script>`;

// The splash is the header's own goose (the same two files, picked the same way), so a visit off the home asks for no splash file.
const splash = `<img src="${base}site/goose-96.webp" srcset="${base}site/goose-96.webp 1x, ${base}site/goose-192.webp 2x" alt="" width="60" height="88" />`;
if (!html.includes(splash)) throw new Error("site-paint: the splash goose moved; update site-paint.ts");
// The paint goes in only where the visit opens on the home, before the first frame.
const put = `<script>(function(){${ROUTE};if(home){var t=document.getElementById("gg-first"),r=document.getElementById("root");if(t&&r){r.replaceChildren(t.content.cloneNode(true));}}})()</script>`;
const after = '<div id="root">';
const close = html.indexOf("</div></div>", html.indexOf(after));
if (html.indexOf(after) < 0 || close < 0) throw new Error("site-paint: no #root splash in dist/goose.html");
const at = close + "</div></div>".length;
html = `${html.slice(0, at)}${MARK}<template id="gg-first">${paint}</template>${put}${html.slice(at)}`;
html = html.replace("</head>", `${links}</head>`);

const said = `${paint.length} B of first paint; off the home ${preloads.length} preloads, ${shopFiles.length} more for Shop`;
if (dry) console.log(`site-paint (dry): ${said}`);
else { writeFileSync(file, html); console.log(`site-paint: dist/goose.html carries the home's ${said}`); }

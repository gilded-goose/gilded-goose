// Track R (launch program): what a page of ours asks the network for, read from its HTML and, recursively, from the
// scripts and stylesheets it loads. Shared by scripts/postdeploy-check.ts (every reference must answer 200) and
// scripts/carry-assets.ts (the previous release's chunks are copied into the new build). Node builtins only: the
// carry step runs in Render's build before anything else is guaranteed.

/** File types a page fetches as an asset. */
const EXT = "js|mjs|css|woff2?|ttf|otf|webp|png|jpe?g|gif|svg|avif|ico|wasm|json|webmanifest|m4a|mp3|mp4|webm";
/** A Vite output name, `<name>-<8-char hash>.<ext>`, where code names a file: after `./`, `/assets/`, `assets/`, a quote or `(`. */
const HASHED_IN_CODE = new RegExp(`(?:\\./|/assets/|\\bassets/|["'\`(])([\\w.-]+-[A-Za-z0-9_-]{8}\\.(?:${EXT}))(?=["'\`)?#\\s,]|$)`, "g");
/** An absolute same-origin path to a public file, in quotes or `url(…)`: "/favicon.svg", url(/brand/egg.webp). */
const PUBLIC_IN_CODE = new RegExp(`["'\`(](/(?!/)(?!api/)[\\w./-]+\\.(?:${EXT}))(?=["'\`)?#])`, "g");
const LINK_RELS = new Set(["stylesheet", "modulepreload", "preload", "icon", "shortcut", "apple-touch-icon", "manifest", "mask-icon", "prefetch"]);
const IMAGE_METAS = new Set(["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"]);

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? (m[2] ?? m[3] ?? m[4] ?? "") : null;
};

/** Resolve a reference against the file that made it; null for data:, blob:, a fragment, or not a URL. */
function resolve(ref: string, from: string): string | null {
  const r = ref.trim().replace(/&amp;/g, "&");
  if (!r || /^(?:data|blob|javascript|mailto|about):/i.test(r) || r.startsWith("#")) return null;
  try { return new URL(r, from).href.replace(/#.*$/, ""); } catch { return null; }
}

/** Every asset a script or stylesheet names, as absolute URLs. Hashed names resolve to the origin's /assets/ (Vite puts
 *  every hashed file there), public paths to the origin. */
export function refsInCode(text: string, fileUrl: string): string[] {
  const origin = new URL(fileUrl).origin;
  const out = new Set<string>();
  for (const m of text.matchAll(HASHED_IN_CODE)) out.add(`${origin}/assets/${m[1]}`);
  for (const m of text.matchAll(PUBLIC_IN_CODE)) if (!m[1]!.startsWith("/assets/")) out.add(`${origin}${m[1]}`);
  return [...out];
}

/** Every asset an HTML page loads: scripts, stylesheets, preloads, icons, the manifest, images, the share image, and
 *  whatever its inline scripts and styles name. Links to other pages (`<a href>`) are not assets. */
export function refsInHtml(html: string, pageUrl: string): string[] {
  const out = new Set<string>();
  const add = (ref: string | null) => { if (ref === null) return; const u = resolve(ref, pageUrl); if (u) out.add(u); };
  // Tags are read with inline script bodies emptied: a `<link href="'+f+'">` a script writes isn't a tag of this page
  // (the loop below reads those bodies as code, so a file they name literally still counts).
  const tagsOnly = html.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, "$1</script>");
  for (const m of tagsOnly.matchAll(/<(script|link|img|source|meta|video|audio|image|use)\b[^>]*>/gi)) {
    const tag = m[0];
    const name = m[1]!.toLowerCase();
    if (name === "script") add(attr(tag, "src"));
    else if (name === "link") {
      const rels = (attr(tag, "rel") ?? "").toLowerCase().split(/\s+/);
      if (rels.some((r) => LINK_RELS.has(r))) add(attr(tag, "href"));
    } else if (name === "meta") {
      const key = (attr(tag, "property") ?? attr(tag, "name") ?? "").toLowerCase();
      if (IMAGE_METAS.has(key)) add(attr(tag, "content"));
    } else {
      add(attr(tag, "src"));
      add(attr(tag, "poster"));
      add(attr(tag, "href"));
      for (const part of (attr(tag, "srcset") ?? "").split(",")) add(part.trim().split(/\s+/)[0] || null);
    }
  }
  // Inline <script> and <style> bodies name chunks too (the first-paint script starts the Desk's files).
  for (const m of html.matchAll(/<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/gi)) for (const u of refsInCode(m[2]!, pageUrl)) out.add(u);
  return [...out];
}

/** True when a fetched file can name further assets (so the walk reads its body). */
export const isCode = (url: string): boolean => /\.(?:m?js|css|webmanifest|json)(?:$|\?)/.test(new URL(url).pathname);

export interface Fetched { url: string; status: number; body?: string; bytes?: number; from: string; error?: string }

/**
 * Walk a set of pages: fetch each page's HTML from `htmlBase`, then every asset it references and, recursively, every
 * asset those scripts and stylesheets reference, from `assetBase` (the same origin normally; another one to ask whether
 * an older release's HTML still finds its files). Code is read with GET; everything else with HEAD. `concurrency`
 * bounds parallel requests; `timeoutMs` bounds each. Only same-origin assets are followed; a cross-origin share image
 * is still checked (it is what a link preview fetches).
 */
export async function walk(o: { htmlBase: string; assetBase?: string; routes: string[]; concurrency?: number; timeoutMs?: number; headers?: Record<string, string> }): Promise<{ pages: Fetched[]; assets: Fetched[] }> {
  const assetBase = new URL(o.assetBase ?? o.htmlBase).origin;
  const htmlOrigin = new URL(o.htmlBase).origin;
  const timeout = o.timeoutMs ?? 20_000;
  const get = async (url: string, method: "GET" | "HEAD", accept: string): Promise<{ status: number; body?: string; bytes?: number; error?: string }> => {
    try {
      const r = await fetch(url, { method, headers: { accept, "user-agent": "gilded-goose-postdeploy/1", ...o.headers }, redirect: "follow", signal: AbortSignal.timeout(timeout) });
      if (method === "HEAD") return { status: r.status, bytes: Number(r.headers.get("content-length") ?? 0) };
      const body = await r.text();
      return { status: r.status, body, bytes: body.length };
    } catch (e) { return { status: 0, error: e instanceof Error ? e.message : String(e) }; }
  };
  const pages: Fetched[] = [];
  for (const route of o.routes) {
    const url = new URL(route, o.htmlBase).href;
    const r = await get(url, "GET", "text/html,application/xhtml+xml");
    pages.push({ url, from: "route", ...r });
  }
  const seen = new Map<string, Fetched>();
  const queue: { url: string; from: string }[] = [];
  const enqueue = (url: string, from: string) => {
    // An older release's HTML is read from htmlBase, but its assets are asked of assetBase.
    const u = new URL(url);
    const target = u.origin === htmlOrigin ? `${assetBase}${u.pathname}${u.search}` : url;
    if (seen.has(target) || queue.some((q) => q.url === target)) return;
    queue.push({ url: target, from });
  };
  for (const p of pages) if (p.body) for (const ref of refsInHtml(p.body, p.url)) enqueue(ref, p.url);
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      if (seen.has(next.url)) continue;
      const entry: Fetched = { url: next.url, from: next.from, status: -1 };
      seen.set(next.url, entry);
      const code = isCode(next.url);
      const r = await get(next.url, code ? "GET" : "HEAD", "*/*");
      Object.assign(entry, r);
      if (code && r.status === 200 && r.body && new URL(next.url).origin === assetBase) for (const ref of refsInCode(r.body, next.url)) enqueue(ref, next.url);
      delete entry.body;
    }
  };
  // Workers drain the queue together; a worker that finds it empty while others still fetch comes back for more.
  while (queue.length) await Promise.all(Array.from({ length: o.concurrency ?? 8 }, worker));
  return { pages, assets: [...seen.values()] };
}

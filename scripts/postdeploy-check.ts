// Track R (launch program, checklist §6): no asset ever 404s, and deploys are cache-safe. Run after every push, once
// Render shows the new deploy live:
//
//   node scripts/postdeploy-check.ts https://gilded-goose.onrender.com      (or: corepack pnpm postdeploy:assets <url>)
//
// For every route in docs/guild/launch-checklist.md it fetches the HTML, collects every asset the page references
// (scripts, styles, modulepreloads, images, icons, the manifest, the share image, inline scripts' and styles' files) and
// what those scripts and stylesheets name in turn (static and dynamic imports, fonts, images), recursively, and requires
// a 200 for each. It also checks the cache rules (HTML `no-cache`, hashed assets `immutable`), that an unknown page and
// an unknown /assets/ file are real 404s, and, when the build published one, every file in /release.json (this
// release's own files and the previous release's carried ones: the voice clips and other files no HTML names).
//
//   --old <url>   also read each route's HTML from <url> (an older release, e.g. a saved copy) and ask THIS base for its
//                 assets: the cached-old-page case. Every one must still be 200.
//   --json        print the result as JSON too.
//
// Exits 1 and lists every failure; 0 when all pass. Node builtins only (scripts/asset-refs.ts).

import { pathToFileURL } from "node:url";
import { walk, type Fetched } from "./asset-refs.ts";

/** The checklist's routes (launch-checklist.md, "Routes"), as the server is asked for them. The 404 probe is deliberate. */
export const ROUTES = [
  "/", "/?wallet=1", "/?wallet=0", "/?desk=1", "/?market=1", "/?desk=haggle", "/?desk=ledger", "/?desk=studio",
  "/?desk=proof", "/?desk=tour", "/safe.html", "/?desk=system", "/?desk=how", "/?desk=builders", "/?desk=list",
];
export const NOT_FOUND_PROBE = "/r-postdeploy-404-probe";
const HASHED_ASSET = /^\/assets\/[\w.-]+-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/;

interface Failure { kind: "status" | "cache" | "404" | "carry";url: string; detail: string; from?: string }

async function main() {
  const args = process.argv.slice(2);
  const base = args.find((a) => /^https?:\/\//.test(a) && args[args.indexOf(a) - 1] !== "--old");
  const oldIdx = args.indexOf("--old");
  const old = oldIdx >= 0 ? args[oldIdx + 1] : undefined;
  if (!base) { console.error("usage: node scripts/postdeploy-check.ts <baseUrl> [--old <url>] [--json]"); process.exit(2); }
  const failures: Failure[] = [];
  const started = Date.now();

  // 1. Every route and the 404 probe, with every asset they load, recursively.
  const { pages, assets } = await walk({ htmlBase: base, routes: [...ROUTES, NOT_FOUND_PROBE], timeoutMs: 90_000 });
  for (const p of pages) {
    const want = p.url.endsWith(NOT_FOUND_PROBE) ? 404 : 200;
    if (p.status !== want) failures.push({ kind: "status", url: p.url, detail: `page ${p.status || p.error} (want ${want})` });
  }
  for (const a of assets) if (a.status !== 200) failures.push({ kind: "status", url: a.url, detail: `${a.status || a.error}`, from: a.from });

  // 2. Cache rules: each page `no-cache` (or no-store), each hashed asset `immutable`.
  const heads = async (url: string) => {
    try { const r = await fetch(url, { method: "HEAD", headers: { accept: "text/html" }, signal: AbortSignal.timeout(30_000) }); return { status: r.status, cc: r.headers.get("cache-control") ?? "", type: r.headers.get("content-type") ?? "" }; }
    catch (e) { return { status: 0, cc: "", type: String(e) }; }
  };
  for (const route of ["/", "/safe.html"]) {
    const h = await heads(new URL(route, base).href);
    if (!/no-cache|no-store/.test(h.cc)) failures.push({ kind: "cache", url: new URL(route, base).href, detail: `HTML cache-control "${h.cc}" (want no-cache)` });
  }
  const hashed = assets.filter((a) => a.status === 200 && new URL(a.url).origin === new URL(base).origin && HASHED_ASSET.test(new URL(a.url).pathname));
  for (const a of hashed.slice(0, 12)) {
    const h = await heads(a.url);
    if (!/immutable/.test(h.cc) || !/max-age=31536000/.test(h.cc)) failures.push({ kind: "cache", url: a.url, detail: `asset cache-control "${h.cc}" (want public, max-age=31536000, immutable)` });
  }

  // 3. Real 404s: an unknown /assets/ file is a plain 404 even for a browser asking for HTML, never a page with 200.
  const probe = await heads(new URL("/assets/r-postdeploy-probe-AbCd1234.js", base).href);
  if (probe.status !== 404 || probe.type.includes("text/html")) failures.push({ kind: "404", url: "/assets/r-postdeploy-probe-AbCd1234.js", detail: `${probe.status} ${probe.type} (want a plain 404)` });

  // 4. The release manifest (scripts/carry-assets.ts writes it on Render): every file this release has or carried.
  type Manifest = { files?: string[]; carried?: { file: string }[] };
  const manifest: Manifest | null = await fetch(new URL("/release.json", base), { signal: AbortSignal.timeout(30_000) })
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null)).catch(() => null); // absent: a build without the carry step
  // No manifest means the build's carry step didn't run (render.yaml's buildCommand isn't the one Render used), so the
  // next deploy can't keep this one's chunks: a failure, with the fix named.
  if (!manifest) failures.push({ kind: "carry", url: new URL("/release.json", base).href, detail: "missing: the carry step didn't run in this build (check Render's build command matches render.yaml; docs/ops/uptime.md)" });
  const listed = manifest ? [...(manifest.files ?? []), ...(manifest.carried ?? []).map((c) => c.file)] : [];
  const checkedAlready = new Set(assets.map((a) => new URL(a.url).pathname));
  const fromManifest = listed.filter((f) => !checkedAlready.has(f));
  const manifestResults: Fetched[] = [];
  for (let i = 0; i < fromManifest.length; i += 8) {
    await Promise.all(fromManifest.slice(i, i + 8).map(async (f) => {
      const h = await heads(new URL(f, base).href);
      manifestResults.push({ url: new URL(f, base).href, status: h.status, from: "/release.json" });
      if (h.status !== 200) failures.push({ kind: "status", url: new URL(f, base).href, detail: String(h.status || h.type), from: "/release.json" });
    }));
  }

  // 5. An older release's HTML against this deploy (--old): the page a browser kept must still find every file.
  let oldCount = 0;
  if (old) {
    const o = await walk({ htmlBase: old, assetBase: base, routes: ROUTES, timeoutMs: 90_000 });
    oldCount = o.assets.length;
    for (const a of o.assets) if (a.status !== 200) failures.push({ kind: "status", url: a.url, detail: `old HTML's asset: ${a.status || a.error}`, from: `${old} → ${a.from}` });
  }

  const s = (n: number) => (n === 1 ? "" : "s");
  const notFound = failures.filter((f) => f.kind === "status").length;
  console.log(`postdeploy-check ${base}: ${pages.length} pages, ${assets.length} referenced assets${manifest ? `, ${fromManifest.length} more from /release.json (${(manifest.carried ?? []).length} carried)` : ", no /release.json"}${old ? `, ${oldCount} assets of ${old}'s HTML` : ""}; ${notFound} missing, ${failures.length - notFound} rule failure${s(failures.length - notFound)} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  for (const f of failures) console.log(`  FAIL [${f.kind}] ${f.url}: ${f.detail}${f.from ? `  (named by ${f.from})` : ""}`);
  if (args.includes("--json")) console.log(JSON.stringify({ base, pages: pages.length, assets: assets.length, manifest: fromManifest.length, old: oldCount, failures }, null, 2));
  if (failures.length) process.exit(1);
  console.log("PASS: every asset 200, HTML no-cache, hashed assets immutable, unknown paths 404.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

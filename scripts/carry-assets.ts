// Track R (launch program, checklist §6): cache-safe deploys. Render builds every deploy from scratch, so the new
// web/dist has only the new release's hashed chunks. A tab opened before the deploy (or a page a browser kept) still
// asks for the old ones: the signature moment's Case-*.css and Round 4's egg 404'd that way. This step runs in Render's
// build, after the web build and while the previous release is still the one serving, and copies the previous
// release's hashed files that the new build lacks into web/dist/assets. It then writes web/dist/release.json, the list
// of this release's files and what it carried, which the next deploy reads (and scripts/postdeploy-check.ts checks).
//
//   node scripts/carry-assets.ts [--from <url>] [--dist <dir>]
//
// The previous release is read from --from, else CARRY_FROM, else PUBLIC_URL, else the hosted address. With its
// release.json, it carries every hashed file that release had, plus what it carried less than KEEP_DAYS ago; without
// one (the first deploy with this step), it walks the checklist's routes and their imports. Bounded: FILE_CAP per file,
// TOTAL_CAP in all, DEADLINE_MS overall. It never fails the build: any error, a sleeping or unreachable site, or the
// deadline ends the carry with what it has, and the manifest is written either way. Node builtins only.

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { walk } from "./asset-refs.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HOSTED = "https://gilded-goose.onrender.com";
/** A carried file is kept this long after it was first carried (a deploy every few hours keeps a tab's chunks ~a week). */
export const KEEP_DAYS = 7;
export const FILE_CAP = 12 * 1024 * 1024;
export const TOTAL_CAP = 60 * 1024 * 1024;
const DEADLINE_MS = 150_000;
/** Only Vite's flat, content-hashed output is ever carried; a precompressed copy (.br, .gz) is not (its raw file isn't). */
export const CARRYABLE = /^[\w.-]+-[A-Za-z0-9_-]{8}\.(?:js|mjs|css|woff2?|ttf|otf|webp|png|jpe?g|gif|svg|avif|ico|json|m4a|mp3|mp4|webm|wasm)$/;

export interface Release { built: string; files: string[]; carried: { file: string; at: string }[]; commit?: string | null }

/** The commit this build is (Lead-12, Nov 5): Render sets RENDER_GIT_COMMIT in the build, as it does for the server (main.ts's
 *  COMMIT, which /api/health names). With it in /release.json, "live is X" is read off the site instead of timed. A full
 *  40-hex SHA or null: never a branch name, never anything else from the environment. */
export const commitOf = (env: Record<string, string | undefined>): string | null => (/^[0-9a-f]{40}$/.test(env.RENDER_GIT_COMMIT ?? "") ? env.RENDER_GIT_COMMIT! : null);

const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const log = (s: string) => console.log(`carry-assets: ${s}`);

/** Every file of the build, as served paths (`/assets/x-1234abcd.js`, `/voice/hello.m4a`), except pages, their compressed
 *  twins (the server sends those as the page itself; they have no address of their own) and the manifest. */
export function buildFiles(dist: string): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) visit(p);
      else if (!/\.html(?:\.br|\.gz)?$/.test(name) && name !== "release.json") out.push(`/${relative(dist, p).split(sep).join("/")}`);
    }
  };
  if (existsSync(dist)) visit(dist);
  return out.sort();
}

/** Which of the previous release's files to carry: its own hashed files, and what it carried within KEEP_DAYS, that this
 *  build lacks. Names are checked against CARRYABLE, so nothing from the network can write outside dist/assets. */
export function toCarry(prev: Release, have: Set<string>, now: number): { file: string; at: string }[] {
  const nowIso = new Date(now).toISOString();
  const keep = (at: string) => now - Date.parse(at) < KEEP_DAYS * 86_400_000;
  const picked = new Map<string, string>();
  for (const f of prev.files) picked.set(f, nowIso);
  for (const c of prev.carried) if (keep(c.at) && !picked.has(c.file)) picked.set(c.file, c.at);
  return [...picked].filter(([f]) => f.startsWith("/assets/") && CARRYABLE.test(f.slice("/assets/".length)) && !have.has(f)).map(([file, at]) => ({ file, at }));
}

async function previousRelease(from: string): Promise<Release | null> {
  try {
    const r = await fetch(new URL("/release.json", from), { signal: AbortSignal.timeout(90_000) }); // a sleeping free instance takes ~1 min to wake
    if (r.ok) {
      const j = (await r.json()) as Partial<Release>;
      if (Array.isArray(j.files)) return { built: String(j.built ?? ""), files: j.files.filter((f) => typeof f === "string"), carried: Array.isArray(j.carried) ? j.carried.filter((c) => c && typeof c.file === "string" && typeof c.at === "string") : [] };
    }
  } catch (e) { log(`no release.json from ${from} (${e instanceof Error ? e.message : e})`); }
  // The first deploy with this step: the previous release has no manifest, so read what its pages load.
  const { ROUTES } = await import("./postdeploy-check.ts");
  const { assets } = await walk({ htmlBase: from, routes: ROUTES, timeoutMs: 30_000 });
  const origin = new URL(from).origin;
  const files = assets.filter((a) => a.status === 200 && new URL(a.url).origin === origin).map((a) => new URL(a.url).pathname);
  log(`walked ${from}: ${files.length} files its pages load`);
  return files.length ? { built: "", files, carried: [] } : null;
}

export async function carry(o: { from: string; dist: string; now?: number; deadlineMs?: number; commit?: string | null }): Promise<Release> {
  const now = o.now ?? Date.now();
  const own = buildFiles(o.dist);
  const release: Release = { built: new Date(now).toISOString(), files: own, carried: [], commit: o.commit ?? null };
  const deadline = Date.now() + (o.deadlineMs ?? DEADLINE_MS);
  try {
    const prev = await previousRelease(o.from);
    if (!prev) { log("nothing to carry"); return release; }
    const list = toCarry(prev, new Set(own), now);
    log(`${list.length} of the previous release's files are missing from this build`);
    let total = 0;
    mkdirSync(join(o.dist, "assets"), { recursive: true });
    for (const item of list) {
      if (Date.now() > deadline) { log(`deadline reached; ${list.length - release.carried.length} not carried`); break; }
      const dest = join(o.dist, "assets", item.file.slice("/assets/".length));
      if (existsSync(dest)) continue;
      try {
        const r = await fetch(new URL(item.file, o.from), { signal: AbortSignal.timeout(Math.max(1000, Math.min(30_000, deadline - Date.now()))) });
        if (r.status !== 200) { log(`skip ${item.file}: ${r.status}`); continue; }
        // A host's waiting page or an HTML 404 answered 200 would be cached immutable for a year under a .js name.
        if ((r.headers.get("content-type") ?? "").includes("text/html")) { await r.body?.cancel(); log(`skip ${item.file}: an HTML page, not the file`); continue; }
        const size = Number(r.headers.get("content-length") ?? 0);
        if (size > FILE_CAP) { await r.body?.cancel(); log(`skip ${item.file}: ${size} bytes, over the per-file cap`); continue; }
        const bytes = Buffer.from(await r.arrayBuffer());
        if (bytes.length > FILE_CAP) { log(`skip ${item.file}: over the per-file cap`); continue; }
        if (total + bytes.length > TOTAL_CAP) { log(`total cap reached; ${item.file} and later not carried`); break; }
        writeFileSync(dest, bytes);
        total += bytes.length;
        release.carried.push(item);
      } catch (e) { log(`skip ${item.file}: ${e instanceof Error ? e.message : e}`); }
    }
    log(`carried ${release.carried.length} files, ${(total / 1024).toFixed(0)} KB`);
  } catch (e) {
    log(`stopped early, the build goes on: ${e instanceof Error ? e.message : e}`);
  }
  return release;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dist = arg("--dist") ?? join(ROOT, "web", "dist");
  const from = arg("--from") ?? process.env.CARRY_FROM ?? process.env.PUBLIC_URL ?? HOSTED;
  const commit = commitOf(process.env);
  const release = await Promise.race([
    carry({ from, dist, commit }),
    new Promise<Release>((r) => setTimeout(() => r({ built: new Date().toISOString(), files: buildFiles(dist), carried: [], commit }), DEADLINE_MS + 20_000).unref()),
  ]).catch(() => ({ built: new Date().toISOString(), files: buildFiles(dist), carried: [], commit }));
  // The carried files are this release's files too, for the next deploy's walk; `carried` keeps when each first came.
  try { if (existsSync(dist)) writeFileSync(join(dist, "release.json"), JSON.stringify(release)); } catch (e) { log(`release.json not written: ${e}`); }
  process.exit(0);
}

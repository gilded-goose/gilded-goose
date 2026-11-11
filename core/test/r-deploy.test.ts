// Track R (launch program, checklist §6): cache-safe deploys and real 404s. An egg and Case-*.css 404'd after deploys
// because a page kept from the last deploy asked for hashed chunks the new build didn't have. These tests pin the four
// parts of the fix: the cache rules (HTML revalidates, hashed assets are immutable, 304 when current), a missing asset is
// a plain 404, the asset walk finds what a page loads, and the carry step copies the previous release's files.

import { createServer, type Server } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { bootServer, type Booted } from "./boot.ts";
import vm from "node:vm";
import { cacheControlFor, notModifiedSince, robotsFor, IMMUTABLE, REVALIDATE } from "../../server/src/static-cache.ts";
import { EARLY_STREAM } from "../../web/src/ledger/early-stream.ts";
import { refsInCode, refsInHtml } from "../../scripts/asset-refs.ts";
import { buildFiles, carry, commitOf, toCarry, KEEP_DAYS } from "../../scripts/carry-assets.ts";
import { WakeWatch, WAKE_AFTER_MS, QUIET_MS } from "../../web/src/states/waking.ts";
import * as W from "../../web/src/states/words.ts";
import { ASK_LABEL } from "../src/ask/ask.ts";
import { PHOTO_OFF } from "../src/ask/copy.ts";
import { WANT_OFFLINE } from "../src/ask/wants.ts";
import { capWords } from "../src/buyer/plan.ts";
import { PAIR_WORDS } from "../src/live.ts";
import { retryAfterMs, limitedAction, LONG_WAIT_MS } from "../../web/src/states/retry.ts";
import { chunkNote, lostChunk, stripKind } from "../../web/src/states/strip.ts";

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const tmp = (): string => { const d = mkdtempSync(join(tmpdir(), "goose-r-")); dirs.push(d); return d; };

describe("cache rules (server/src/static-cache.ts)", () => {
  it("hashed /assets/ files are immutable; pages and unhashed files revalidate", () => {
    expect(cacheControlFor("/assets/Case-2Y6r2UqN.css")).toBe(IMMUTABLE);
    expect(cacheControlFor("/assets/ort-wasm-simd-threaded.asyncify-CxOG5pUO.wasm.br")).toBe(IMMUTABLE);
    for (const p of ["/", "/index.html", "/safe.html", "/favicon.svg", "/voice/no-deal.m4a", "/release.json", "/assets/unhashed.js"]) expect(cacheControlFor(p), p).toBe(REVALIDATE);
  });
  it("304 only when the browser's copy is as new as the file, to the second", () => {
    const lm = "Sat, 31 Oct 2026 10:19:26 GMT";
    expect(notModifiedSince(lm, lm)).toBe(true);
    expect(notModifiedSince("Sat, 31 Oct 2026 10:20:00 GMT", lm)).toBe(true);
    expect(notModifiedSince("Sat, 31 Oct 2026 10:19:25 GMT", lm)).toBe(false);
    expect(notModifiedSince("not a date", lm)).toBe(false);
    expect(notModifiedSince(undefined, lm)).toBe(false);
    expect(notModifiedSince(lm, null)).toBe(false);
  });
  it("only ?desk=system's page is noindex; ?desk=how, other pages and files are not", () => {
    expect(robotsFor("/", "?desk=system")).toBe("noindex, nofollow");
    expect(robotsFor("/index.html", "?market=0&desk=system")).toBe("noindex, nofollow");
    for (const [p, q] of [["/", "?desk=how"], ["/", "?desk=1"], ["/", ""], ["/assets/System-AbCd1234.js", "?desk=system"], ["/safe.html", "?desk=system"]] as const) expect(robotsFor(p, q), `${p}${q}`).toBeNull();
  });
});

describe("the ledger's early stream (web/src/ledger/early-stream.ts, inlined by web/prerender.ts)", () => {
  /** Runs the real inline script in a sandbox with a fake EventSource and fetch; returns the stream and the page's global. */
  function boot(fetchAnswer: () => Promise<unknown>) {
    const asked: string[] = [];
    class FakeSource {
      readyState = 0;
      closed = false;
      onerror: (() => void) | null = null;
      private on: Record<string, Array<(m?: unknown) => void>> = {};
      addEventListener(t: string, f: (m?: unknown) => void) { (this.on[t] ??= []).push(f); }
      fire(t: string, m?: unknown) { for (const f of this.on[t] ?? []) f(m); }
      close() { this.closed = true; this.readyState = 2; }
    }
    let src: FakeSource | undefined;
    const window: Record<string, unknown> = {};
    const sandbox = {
      window,
      EventSource: class extends FakeSource { constructor() { super(); src = this; } },
      fetch: (u: string) => { asked.push(u); return fetchAnswer(); },
    };
    vm.runInNewContext(EARLY_STREAM, sandbox);
    const g = window.__ledgerStream as { src: unknown; rows: string[]; end: unknown };
    return { g, src: src!, asked };
  }
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it("a stream that never opened ends on its first error and asks once why (it once waited for CLOSED: one retry late)", async () => {
    const { g, src, asked } = boot(() => Promise.reject(new Error("unreachable")));
    src.onerror!(); // CONNECTING (readyState 0): EventSource would retry, but this is not a dropped stream
    expect(src.closed).toBe(true);
    expect(g.src).toBeNull();
    await settle(); await settle();
    expect(asked).toEqual(["/api/runs/session/events"]);
    expect(g.end).toEqual({ status: 0 });
  });

  it("a stream that opened and then dropped is left to EventSource's own retry; its rows are kept", async () => {
    const { g, src, asked } = boot(() => Promise.resolve({ status: 204 }));
    src.fire("open");
    src.fire("row", { data: "r1" });
    src.onerror!(); // dropped while open: readyState back to CONNECTING, EventSource reconnects on its own
    expect(src.closed).toBe(false);
    expect(g.src).toBe(src);
    expect(g.rows).toEqual(["r1"]);
    await settle();
    expect(asked).toEqual([]);
    src.readyState = 2; src.onerror!(); // the browser gave up (CLOSED): now it asks why
    await settle(); await settle();
    expect(asked).toHaveLength(1);
    expect(g.end).toEqual({ status: 204 });
  });

  it("a 429's words come through for the page (the server's sentence), and a second error never asks twice", async () => {
    const { g, src, asked } = boot(() => Promise.resolve({ status: 429, ok: false, json: () => Promise.resolve({ error: "Too many ledgers are open." }) }));
    src.onerror!();
    src.onerror!();
    await settle(); await settle(); await settle();
    expect(asked).toHaveLength(1);
    expect(g.end).toEqual({ status: 429, body: { error: "Too many ledgers are open." } });
  });
});

describe("the asset walk (scripts/asset-refs.ts)", () => {
  const page = "https://goose.test/?desk=1";
  it("an HTML page's scripts, styles, icons, manifest, share image and inline files; never its links", () => {
    const html = `<html><head>
      <link rel="stylesheet" href="/assets/main-AbCd1234.css"><link rel="modulepreload" href="/assets/Desk-AbCd1234.js">
      <link rel="icon" href="/favicon.svg"><link rel="manifest" href="/site.webmanifest"><link rel="canonical" href="/elsewhere">
      <meta property="og:image" content="https://goose.test/og/egg.png"><meta name="twitter:image" content="/og/egg.png">
      <script type="module" src="/assets/main-AbCd1234.js"></script>
      <script>const files = ["/assets/Case-2Y6r2UqN.css"];</script>
      <style>.egg { background: url(/assets/egg-DdwZ4i0B.webp) }</style></head>
      <body><a href="/safe.html">Safe</a><img src="/brand/lockup.svg" srcset="/brand/lockup.svg 1x, /brand/lockup@2x.png 2x"></body></html>`;
    expect(refsInHtml(html, page).sort()).toEqual([
      "https://goose.test/assets/Case-2Y6r2UqN.css", "https://goose.test/assets/Desk-AbCd1234.js", "https://goose.test/assets/egg-DdwZ4i0B.webp",
      "https://goose.test/assets/main-AbCd1234.css", "https://goose.test/assets/main-AbCd1234.js", "https://goose.test/brand/lockup.svg",
      "https://goose.test/brand/lockup@2x.png", "https://goose.test/favicon.svg", "https://goose.test/og/egg.png", "https://goose.test/site.webmanifest",
    ].sort());
  });
  it("a tag an inline script writes is not a tag of the page, and a file that script names literally still counts", () => {
    const html = `<!doctype html><script src="/assets/main-AbCd1234.js"></script><script>document.write(C.map(function(f){return'<link rel="preload" as="style" href="'+f+'">'}).join(""));var C=["/assets/route-AbCd1234.css"]</script><link rel="icon" href="/favicon.svg">`;
    expect(refsInHtml(html, "https://goose.test/").sort()).toEqual(["https://goose.test/assets/main-AbCd1234.js", "https://goose.test/assets/route-AbCd1234.css", "https://goose.test/favicon.svg"]);
  });
  it("a chunk's static and dynamic imports, Vite's preload list, fonts in CSS, and quoted public files", () => {
    const code = `import{a}from"./index-kW4F25iv.js";const m=()=>import("./Case-D-lUVcxR.js");
      const deps=["assets/Case-2Y6r2UqN.css","assets/Egg-BfiCKqDY.js"];@font-face{src:url(/assets/archivo-latin-wdth-normal-DY7AcnAa.woff2)}
      const icon="/favicon.svg";fetch("/api/health.json");const notAFile="hello-world.js is great";`;
    expect(refsInCode(code, "https://goose.test/assets/main-AbCd1234.js").sort()).toEqual([
      "https://goose.test/assets/Case-2Y6r2UqN.css", "https://goose.test/assets/Case-D-lUVcxR.js", "https://goose.test/assets/Egg-BfiCKqDY.js",
      "https://goose.test/assets/archivo-latin-wdth-normal-DY7AcnAa.woff2", "https://goose.test/assets/index-kW4F25iv.js", "https://goose.test/favicon.svg",
    ]);
  });
});

describe("the carry step (scripts/carry-assets.ts)", () => {
  const now = Date.parse("2026-10-31T12:00:00Z");
  it("the manifest lists no page and no page's compressed twin: those have no address, so the live walk would call them missing", () => {
    const dist = join(tmp(), "dist-twins");
    mkdirSync(join(dist, "first"), { recursive: true });
    mkdirSync(join(dist, "assets"), { recursive: true });
    for (const f of ["index.html", "index.html.br", "index.html.gz", "first/safe.html.br", "first/safe.html.gz", "release.json", "assets/main-AbCd1234.js", "assets/main-AbCd1234.js.br"]) writeFileSync(join(dist, f), "x");
    expect(buildFiles(dist)).toEqual(["/assets/main-AbCd1234.js", "/assets/main-AbCd1234.js.br"]);
  });
  it("names the commit it was built from, a full SHA or null, so live is read off /release.json, not timed (Lead-12)", async () => {
    const sha = "7f4d95d2" + "0".repeat(32);
    expect(commitOf({ RENDER_GIT_COMMIT: sha })).toBe(sha);
    for (const bad of [undefined, "", "main", "7f4d95d2", sha.toUpperCase(), `${sha}\n`, `${sha}; rm -rf /`]) expect([bad, commitOf({ RENDER_GIT_COMMIT: bad })]).toEqual([bad, null]);
    expect(commitOf({ RENDER_GIT_BRANCH: "main", GOOSE_SECRET: sha })).toBeNull(); // only that one variable
    const dist = join(tmp(), "dist-commit");
    mkdirSync(join(dist, "assets"), { recursive: true });
    expect((await carry({ from: "http://127.0.0.1:9", dist, now, deadlineMs: 500, commit: sha })).commit).toBe(sha); // even when the carry can't reach anything
    expect((await carry({ from: "http://127.0.0.1:9", dist, now, deadlineMs: 500 })).commit).toBeNull();
    // Every release the build writes carries it: the carry's, the deadline's and the error's.
    const main = readFileSync(new URL("../../scripts/carry-assets.ts", import.meta.url), "utf8").split("if (process.argv[1]")[1]!;
    expect(main).toContain("const commit = commitOf(process.env);");
    expect(main.match(/carried: \[\], commit \}/g)).toHaveLength(2);
    expect(main).toContain("carry({ from, dist, commit })");
  });
  it("carries the previous release's hashed files this build lacks, and what it carried within KEEP_DAYS; nothing else", () => {
    const old = new Date(now - (KEEP_DAYS + 1) * 86_400_000).toISOString();
    const recent = new Date(now - 86_400_000).toISOString();
    const picked = toCarry({ built: "", files: ["/assets/Case-2Y6r2UqN.css", "/assets/main-AbCd1234.js", "/voice/no-deal.m4a", "/assets/../../server/src/main.ts", "/assets/x-AbCd1234.wasm.br"], carried: [{ file: "/assets/egg-DdwZ4i0B.webp", at: recent }, { file: "/assets/Stale-AbCd1234.js", at: old }] }, new Set(["/assets/main-AbCd1234.js"]), now);
    expect(picked.map((p) => p.file).sort()).toEqual(["/assets/Case-2Y6r2UqN.css", "/assets/egg-DdwZ4i0B.webp"]);
    expect(picked.find((p) => p.file.includes("egg"))!.at).toBe(recent); // keeps when it was first carried
  });

  async function serve(files: Record<string, string>): Promise<{ base: string; server: Server }> {
    const server = createServer((req, res) => {
      const body = files[req.url ?? ""];
      if (body === undefined) { res.writeHead(404).end(); return; }
      res.writeHead(200, { "content-length": Buffer.byteLength(body) }).end(body);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const a = server.address();
    return { base: `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`, server };
  }

  it("end to end: the previous release's chunk lands in the new build and in its release.json; a page with no manifest is walked", async () => {
    const prev = await serve({
      "/release.json": JSON.stringify({ built: "x", files: ["/assets/Case-2Y6r2UqN.css", "/assets/main-New12345.js"], carried: [] }),
      "/assets/Case-2Y6r2UqN.css": ".case{}",
    });
    const dist = join(tmp(), "dist");
    mkdirSync(join(dist, "assets"), { recursive: true });
    writeFileSync(join(dist, "assets", "main-New12345.js"), "new");
    writeFileSync(join(dist, "index.html"), "<!doctype html>");
    try {
      const release = await carry({ from: prev.base, dist, now });
      expect(readFileSync(join(dist, "assets", "Case-2Y6r2UqN.css"), "utf8")).toBe(".case{}");
      expect(readFileSync(join(dist, "assets", "main-New12345.js"), "utf8")).toBe("new"); // never overwrites the new build
      expect(release.files).toEqual(["/assets/main-New12345.js"]);
      expect(release.carried.map((c) => c.file)).toEqual(["/assets/Case-2Y6r2UqN.css"]);
    } finally { prev.server.close(); }

    const walked = await serve({ "/": `<script type="module" src="/assets/main-Old12345.js"></script>`, "/assets/main-Old12345.js": `import("./Egg-Old12345.js")`, "/assets/Egg-Old12345.js": "egg" });
    const dist2 = join(tmp(), "dist");
    mkdirSync(dist2);
    try {
      const release = await carry({ from: walked.base, dist: dist2, now });
      expect(release.carried.map((c) => c.file).sort()).toEqual(["/assets/Egg-Old12345.js", "/assets/main-Old12345.js"]);
      expect(existsSync(join(dist2, "assets", "Egg-Old12345.js"))).toBe(true);
    } finally { walked.server.close(); }
  });

  it("an unreachable previous release never fails the build: nothing carried, this release's files listed", async () => {
    const dist = join(tmp(), "dist");
    mkdirSync(join(dist, "assets"), { recursive: true });
    writeFileSync(join(dist, "assets", "main-New12345.js"), "new");
    const release = await carry({ from: "http://127.0.0.1:9", dist, now, deadlineMs: 5_000 });
    expect(release.carried).toEqual([]);
    expect(release.files).toEqual(["/assets/main-New12345.js"]);
  });
});

describe("the server's static rules (main.ts)", () => {
  let s: Booted | undefined;
  afterAll(async () => { await s?.stop(); });
  it("HTML no-cache with a 304 when current; hashed assets immutable; a missing asset a plain 404 even for a browser; an unknown page the 404 page", async () => {
    const dist = join(tmp(), "dist");
    mkdirSync(join(dist, "assets"), { recursive: true });
    writeFileSync(join(dist, "index.html"), "<!doctype html><title>goose</title>");
    writeFileSync(join(dist, "404.html"), "<!doctype html><title>Nothing here</title>");
    writeFileSync(join(dist, "assets", "Case-2Y6r2UqN.css"), ".case{}");
    const dir = tmp();
    s = await bootServer((port, base) => {
      const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port), HOST: "127.0.0.1", PUBLIC_URL: base, GOOSE_DIR: dir, RUN_LIBRARY_DIR: join(dir, "runs"), PAYMENT: "fake", BUYER: "rule", WEB_DIST: dist };
      delete env.ANTHROPIC_API_KEY; delete env.TURSO_DATABASE_URL; delete env.TURSO_AUTH_TOKEN; delete env.RENDER;
      return env;
    });
    const html = { accept: "text/html" };
    const page = await fetch(`${s.base}/?desk=1`, { headers: html });
    expect(page.status).toBe(200);
    expect(page.headers.get("cache-control")).toBe("no-cache");
    const again = await fetch(`${s.base}/?desk=1`, { headers: { ...html, "if-modified-since": page.headers.get("last-modified")! } });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
    expect(again.headers.get("cache-control")).toBe("no-cache");
    const older = await fetch(`${s.base}/`, { headers: { ...html, "if-modified-since": "Thu, 01 Jan 2026 00:00:00 GMT" } });
    expect(older.status).toBe(200); // control: an older copy gets the page
    expect(page.headers.get("x-robots-tag")).toBeNull(); // the desk is a public page
    const sys = await fetch(`${s.base}/?desk=system`, { headers: html });
    expect(sys.status).toBe(200);
    expect(sys.headers.get("x-robots-tag")).toBe("noindex, nofollow"); // said before any script runs

    const asset = await fetch(`${s.base}/assets/Case-2Y6r2UqN.css`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");

    const missing = await fetch(`${s.base}/assets/Case-Gone1234.css`, { headers: html });
    expect(missing.status).toBe(404);
    expect(missing.headers.get("content-type")).not.toContain("text/html");
    expect(missing.headers.get("cache-control")).toBe("no-store");

    const unknown = await fetch(`${s.base}/no-such-page`, { headers: html });
    expect(unknown.status).toBe(404);
    expect(await unknown.text()).toContain("Nothing here");
    const api = await fetch(`${s.base}/api/health`, { headers: { "if-modified-since": "Sat, 31 Oct 2099 00:00:00 GMT" } });
    expect(api.status).toBe(200); // the API is never answered 304
    // the uptime monitor's URL: its keyword, never cached, no cookie, and asking it twice changes nothing
    const body = await api.text();
    expect(body).toContain(`"ok":true`);
    expect(api.headers.get("cache-control")).toBe("no-store");
    expect(api.headers.get("set-cookie")).toBeNull();
    expect(await (await fetch(`${s.base}/api/health`)).text()).toBe(body);
  }, 60_000);
});

// Lead-13 (Nov 11): the bare domain opens the white site; every address naming an old page keeps the old index.
describe("root_serves_white_site: what / serves (main.ts rootPage)", () => {
  let s: Booted | undefined;
  afterAll(async () => { await s?.stop(); });
  it("a bare / (or one with only tracking tags: utm, fbclid, si) is goose.html; any old route parameter, index.html and goose.html themselves are unchanged", async () => {
    const dist = join(tmp(), "dist");
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, "index.html"), "<!doctype html><title>old desk</title>");
    writeFileSync(join(dist, "goose.html"), "<!doctype html><title>white site</title>");
    const dir = tmp();
    s = await bootServer((port, base) => {
      const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port), HOST: "127.0.0.1", PUBLIC_URL: base, GOOSE_DIR: dir, RUN_LIBRARY_DIR: join(dir, "runs"), PAYMENT: "fake", BUYER: "rule", WEB_DIST: dist };
      delete env.ANTHROPIC_API_KEY; delete env.TURSO_DATABASE_URL; delete env.TURSO_AUTH_TOKEN; delete env.RENDER;
      return env;
    });
    const title = async (path: string) => {
      const r = await fetch(`${s!.base}${path}`, { headers: { accept: "text/html" }, redirect: "manual" });
      expect(r.status, path).toBe(200);
      expect(r.headers.get("location"), path).toBeNull(); // served in place: the address bar keeps the bare domain
      return (await r.text()).match(/<title>(.*)<\/title>/)?.[1];
    };
    // Tracking tags a share adds (a fresh Q, Nov 11): Facebook's fbclid and YouTube/Spotify's si open the white site too.
    for (const path of ["/", "/?", "/?utm_source=devpost", "/?fbclid=IwAR0abc123", "/?si=Xy12AbCd", "/?utm_source=devpost&fbclid=IwAR0abc123", "/goose.html", "/goose.html?run=0123456789ab"]) expect(await title(path), path).toBe("white site");
    for (const path of ["/?desk=1", "/?desk=ledger", "/?wallet=0", "/?wallet=1", "/?market=1", "/?run=0123456789ab", "/?desk=1&run=0123456789ab",
      "/?ledger=1", "/?row=3", "/?seed=1", "/?studio=force", "/?utm_source=devpost&desk=1", "/?fbclid=IwAR0abc123&desk=1", "/index.html"]) expect(await title(path), path).toBe("old desk");
  }, 60_000);

  it("with no goose.html in the build, / stays the old index", async () => {
    const dist = join(tmp(), "dist");
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, "index.html"), "<!doctype html><title>old desk</title>");
    const dir = tmp();
    const t = await bootServer((port, base) => {
      const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port), HOST: "127.0.0.1", PUBLIC_URL: base, GOOSE_DIR: dir, RUN_LIBRARY_DIR: join(dir, "runs"), PAYMENT: "fake", BUYER: "rule", WEB_DIST: dist };
      delete env.ANTHROPIC_API_KEY; delete env.TURSO_DATABASE_URL; delete env.TURSO_AUTH_TOKEN; delete env.RENDER;
      return env;
    });
    try { expect(await (await fetch(`${t.base}/`)).text()).toContain("old desk"); } finally { await t.stop(); }
  }, 60_000);
});

describe("the shared states (web/src/states)", () => {
  const statesCss = () => readFileSync(join(import.meta.dirname, "../../web/src/states/states.css"), "utf8");

  it("hidden beats every display rule in states.css (an empty toast drew on every page without it)", () => {
    const rule = /([^{}]*)\{\s*display:\s*none\s*!important;?\s*\}/.exec(statesCss().replace(/\/\*[\s\S]*?\*\//g, ""));
    const sel = rule?.[1]?.split(",").map((s) => s.trim()) ?? [];
    for (const s of [".st-note[hidden]", ".st-note [hidden]", ".st-strip[hidden]"]) expect(sel).toContain(s);
  });

  it("the block is no card (brand.md §10.9: no card, no box, no glass) and waits 400 ms before it enters", () => {
    const block = /\n\.st-note \{([^}]*)\}/.exec(statesCss())?.[1] ?? "";
    expect(block).not.toMatch(/background|border|box-shadow|backdrop-filter/);
    expect(block).toMatch(/max-width:\s*32em/);
    expect(block).toMatch(/animation:\s*st-in var\(--d-3[^;]*\)[^;]*400ms both/);
  });

  it("every motion fallback in states.css is the token's own value (the DD found `--spring, ease-out` and `--ease, ease`)", () => {
    const tokens = readFileSync(join(import.meta.dirname, "../../web/src/desk/tokens.css"), "utf8");
    const value = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(tokens)?.[1]?.trim();
    const css = statesCss().replace(/\/\*[\s\S]*?\*\//g, "");
    const uses = [...css.matchAll(/var\((--(?:ease|spring|d-\d)),\s*((?:[^()]|\([^()]*\))+)\)/g)];
    expect(uses.length).toBeGreaterThan(5);
    for (const [, name, fallback] of uses) expect(fallback!.trim(), name).toBe(value(name!));
  });

  it("a state's line is balanced like its title: \"pretty\" left \"by itself.\" alone on the waking line at 390", () => {
    expect(/\n\.st-note-line \{[^}]*text-wrap:\s*balance/.test(statesCss())).toBe(true);
  });

  it("a 429 draws no Try again for a daily cap or a wait over a minute (it sat disabled for hours, or retried into the cap)", () => {
    expect(limitedAction({ canRetry: true })).toBe("now");
    expect(limitedAction({ canRetry: true, retryAfterMs: 30_000 })).toBe("wait");
    expect(limitedAction({ canRetry: true, retryAfterMs: LONG_WAIT_MS })).toBe("wait"); // a minute: still worth the pill
    expect(limitedAction({ canRetry: true, retryAfterMs: LONG_WAIT_MS + 1 })).toBe("none");
    expect(limitedAction({ canRetry: true, retryAfterMs: 6 * 3_600_000 })).toBe("none");
    expect(limitedAction({ canRetry: true, daily: true })).toBe("none");
    expect(limitedAction({ canRetry: false })).toBe("none");
  });

  it("every state's words keep §10.9's rules: what happened ≤ 8 words, ≤ 24 in all, none of the banned words", () => {
    const n = (s: string) => s.split(/\s+/).filter(Boolean).length;
    const states: [string, string, (string | undefined)?, (string | undefined)?][] = [
      ["loading", W.LOADING.sellers], ["loading", W.LOADING.other],
      ["empty", W.EMPTY.title, W.EMPTY.line, W.EMPTY.action],
      ["error", W.ERROR.title, W.ERROR.network, W.ERROR.action],
      ["offline", W.OFFLINE.title, W.OFFLINE.back], ["offline (page-wide)", W.OFFLINE.title, W.OFFLINE.line],
      ["limited", W.LIMITED.title, W.LIMITED.line, W.LIMITED.action],
      ["limited (daily cap)", W.LIMITED_DAILY.title, W.LIMITED_DAILY.line], ["limited (long wait)", W.LIMITED_LATER.title, W.LIMITED_LATER.line],
      ["404", W.NOT_FOUND.title, undefined, W.NOT_FOUND.action],
      ["waking", W.WAKING.title, W.WAKING.line], ["waking (failed)", W.WAKING_FAILED.title, W.WAKING_FAILED.line, W.WAKING_FAILED.action],
      ["updated", W.UPDATED.title, undefined, W.UPDATED.action],
      ["lost (a chunk failed)", W.LOST.title, undefined, W.LOST.action],
      ["was offline (a step failed offline, she's back)", W.WAS_OFFLINE.title, "Nothing was bought.", W.WAS_OFFLINE.action],
      // R-12: what each live-state reader says after "You're offline." (one line each, the surface's own fact).
      ...Object.entries(W.OFFLINE_SAYS).map(([k, line]): [string, string, string] => [`offline (${k})`, W.OFFLINE.title, line]),
      ["back from PayPal, the read failed", W.BACK_UNREAD.title, W.BACK_UNREAD.line, W.BACK_UNREAD.action],
      // R-13: core's round labels while she is offline, "You're offline, so …" (the clause before "so" is the head).
      ...([["Go's run note", `${capWords("offline", 0)}, so this is a recorded run.`], ["the ask's label", ASK_LABEL.offline], ["the photo", PHOTO_OFF.offline], ["a want", WANT_OFFLINE], ["the judge's saved order", PAIR_WORDS.offline]] as const)
        .map(([k, s]): [string, string, string] => [`offline (${k})`, s.slice(0, s.indexOf(", so ") + 1), s.slice(s.indexOf(", so ") + 2)]),
    ];
    expect("line" in W.UPDATED, "the DD: the headline plus [Reload] is enough").toBe(false);
    for (const [name, title, line = "", action = ""] of states) {
      expect(n(title), name).toBeLessThanOrEqual(8);
      expect(n(`${title} ${line} ${action}`), name).toBeLessThanOrEqual(24);
      expect(`${title} ${line} ${action}`, name).not.toMatch(/oops|sorry|!|nothing here yet|\d|%/i);
    }
    // the table's own words, so a drift from the spec is a failing test
    expect([W.EMPTY.title, W.ERROR.title, W.LIMITED.title, W.NOT_FOUND.title, W.WAKING.title]).toEqual(["No rows yet.", "Goose couldn't load this.", "Goose needs a minute.", "Nothing here.", "Goose's server is waking up."]);
  });

  it("the 404 page says the kit's words in at most 8 (brand.md 10.3) and carries no lockup in its body", () => {
    const html = readFileSync(join(import.meta.dirname, "../../web/404.html"), "utf8");
    const main = /<main id="main" class="nh">([\s\S]*?)<\/main>/.exec(html)?.[1] ?? "";
    const words = main.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/›/g, " ").split(/\s+/).filter(Boolean);
    expect(words.join(" ")).toBe("Nothing here. Back to Goose");
    expect(words.length).toBeLessThanOrEqual(8);
    expect(main).toMatch(/class="nh-egg"/);
    expect(main).not.toMatch(/dk-brand|dk-mark|class="gg/);
    // B-11: the bar is the one lockup (vector egg as the o), and the still is the brand's gold egg at 1x and 2x
    const bar = /<header[\s\S]*?<\/header>/.exec(html)?.[0] ?? "";
    expect(bar).toContain(`<a class="gg gg-bar" href="%BASE_URL%?desk=1" aria-label="Gilded Goose">Gilded<span class="sp"> </span>G<span class="o"><span class="oc">o</span><svg aria-hidden="true"><use href="#ggEgg"/></svg></span>ose</a>`);
    expect(html).not.toMatch(/dk-brand|dk-mark|src\/desk\/egg\.webp/);
    expect(main).toMatch(/src="\/brand\/egg-600\.webp" srcset="\/brand\/egg-600\.webp 1x, \/brand\/egg-1200\.webp 2x"/);
  });

  it("a 429's Retry-After: seconds or an HTTP date; absent or unreadable is no wait", () => {
    expect(retryAfterMs("30")).toBe(30_000);
    expect(retryAfterMs(new Date(2_000_000_000_000 + 5_000).toUTCString(), 2_000_000_000_000)).toBe(5_000);
    expect(retryAfterMs(new Date(1_000).toUTCString(), 2_000_000_000_000)).toBe(0);
    expect(retryAfterMs(null)).toBe(0);
    expect(retryAfterMs("soon")).toBe(0);
  });

  // A fake clock: timers fire only when the test moves time.
  const fakeClock = () => {
    let t = 1_000_000;
    const timers = new Map<number, { at: number; fn: () => void }>();
    let id = 0;
    return {
      now: () => t,
      setTimeout: (fn: () => void, ms: number) => { timers.set(++id, { at: t + ms, fn }); return id; },
      clearTimeout: (h: unknown) => { timers.delete(h as number); },
      advance(ms: number) { t += ms; for (const [k, v] of [...timers]) if (v.at <= t) { timers.delete(k); v.fn(); } },
    };
  };

  it("waking: a first /api call unanswered past 2 s shows it; the answer ends it; a slow call from an awake server never does", () => {
    const clock = fakeClock();
    const w = new WakeWatch(clock);
    const seen: (string | null)[] = [];
    w.subscribe((v) => seen.push(v));
    const a = w.started();
    clock.advance(WAKE_AFTER_MS - 1);
    expect(w.isWaking).toBe(false);
    clock.advance(1);
    expect(w.isWaking).toBe(true);
    w.answered(a, 200, true);
    expect(w.isWaking).toBe(false);
    // awake now: an AI ask that takes 8 s is just slow
    const b = w.started();
    clock.advance(8_000);
    expect(w.isWaking).toBe(false);
    w.answered(b, 200, true);
    // after a quiet spell the server may have slept: a slow call is a wake again
    clock.advance(QUIET_MS);
    const c = w.started();
    clock.advance(WAKE_AFTER_MS);
    expect(w.isWaking).toBe(true);
    // a host's own waiting page (a non-JSON 503) ended that call with nothing to fill in: failed (the DD, ~07:20);
    // a new call (Try again) is pending again; the real answer ends it
    w.answered(c, 503, false);
    expect(w.state).toBe("failed");
    w.answered(w.started(), 200, true);
    expect(seen).toEqual(["pending", null, "pending", "failed", "pending", null]);
  });

  it("waking: \"pending\" only while a request is out; failed once the last one ends with no real answer (503, error, timeout)", () => {
    const clock = fakeClock();
    const w = new WakeWatch(clock);
    const a = w.started();
    const b = w.started();
    clock.advance(WAKE_AFTER_MS);
    expect(w.state).toBe("pending");
    w.answered(a, 503, false); // one ended, the other is still out: it will still fill in
    expect(w.state).toBe("pending");
    w.failed(b); // the last one failed at the network (or the page timed it out): nothing will fill in by itself
    expect(w.state).toBe("failed");
    clock.advance(WAKE_AFTER_MS * 5);
    expect(w.state).toBe("failed"); // no request, no flip back to "fills in"
    const c = w.started(); // Try again
    expect(w.state).toBe("pending");
    w.answered(c, 200, true);
    expect(w.state).toBeNull();
  });

  it("waking words follow the request: \"fills in\" only while pending; failed drops it and offers Try again", () => {
    expect(W.WAKING.line).toBe("This fills in when it answers.");
    expect(W.WAKING_FAILED).toEqual({ title: W.WAKING.title, line: "Give it a moment, then try again.", action: "Try again" });
    expect(W.WAKING_FAILED.line).not.toMatch(/fills in/i);
    expect(W.LIMITED_DAILY).toEqual({ title: "That's today's limit from here.", line: "Today's made-up markets are used up." });
  });

  it("waking: two calls start together, one answers fast, the other is slow: the server is awake, so no wake", () => {
    const clock = fakeClock();
    const w = new WakeWatch(clock);
    const health = w.started();
    const slow = w.started();
    clock.advance(100);
    w.answered(health, 200, true);
    clock.advance(WAKE_AFTER_MS * 2);
    expect(w.isWaking).toBe(false);
    w.answered(slow, 200, true);
    expect(w.isWaking).toBe(false);
  });

  it("waking: a call that fails at the network (offline) neither starts nor keeps a wake", () => {
    const clock = fakeClock();
    const w = new WakeWatch(clock);
    w.failed(w.started());
    clock.advance(WAKE_AFTER_MS * 2);
    expect(w.isWaking).toBe(false);
  });
});

// R-11 (the DD gate, Sat Oct 31): offline wins. A chunk that failed offline showed "Goose was just updated. [Reload]"
// over the offline frame: a false claim, and a Reload that can't work offline. The browser half is
// scripts/offline-strip-probe.ts (red on 49e4f05e).
describe("the strip and the boundary after a failed chunk (web/src/states/strip.ts)", () => {
  const WAKES = [null, "pending", "failed"] as const;
  const LOSTS = [null, "updated", "lost"] as const;
  it("offline beats every other state: no action that needs the network shows while offline", () => {
    for (const wake of WAKES) for (const lost of LOSTS) expect(stripKind({ online: false, lost, wake }), `${lost}/${wake}`).toBe("offline");
    for (const lost of ["updated", "lost"] as const) expect(chunkNote(lost, false), lost).toBe("offline");
  });
  it("a failed chunk, online or offline, is never called an update (DD 09:29: onLine is true on wifi with no internet)", () => {
    // Fail one chunk, or several, with the browser saying online or offline: with no release check, always "lost".
    let lost: ReturnType<typeof lostChunk> | null = null;
    for (const onLine of [true, false, true]) {
      vi.stubGlobal("navigator", { onLine });
      try { lost = lostChunk(lost); } finally { vi.unstubAllGlobals(); }
      expect(lost, `onLine ${onLine}`).toBe("lost");
    }
    expect(stripKind({ online: false, lost, wake: null })).toBe("offline");
    expect(stripKind({ online: true, lost, wake: null })).toBe("lost");
    expect(chunkNote("lost", true)).toBe("lost");
    for (const wake of WAKES) expect(stripKind({ online: true, lost, wake }), String(wake)).not.toBe("updated");
  });
  it("nothing but a confirmed release reaches UPDATED (no caller passes one until a /release.json check exists)", () => {
    expect(lostChunk(null)).toBe("lost");
    expect(lostChunk("lost")).toBe("lost");
    expect(lostChunk(null, false)).toBe("lost");
    expect(lostChunk(null, true)).toBe("updated"); // control: the one door, a confirmed newer release
    expect(lostChunk("updated")).toBe("updated"); // once confirmed, it stays confirmed
    expect(stripKind({ online: true, lost: "updated", wake: "failed" })).toBe("updated"); // her tap first, as before
    expect(chunkNote("updated", true)).toBe("updated");
    // The two callers pass no release answer: an argument added there is a claim this test makes someone look at.
    for (const f of ["web/src/states/mount.ts", "web/src/states/ErrorBoundary.tsx"]) {
      const src = readFileSync(join(import.meta.dirname, "../..", f), "utf8");
      expect(src.match(/lostChunk\(([^)]*)\)/g), f).toEqual([f.endsWith("mount.ts") ? "lostChunk(lost)" : "lostChunk(null)"]);
    }
  });
  it("control: with no failed chunk, online, the waking states draw as before", () => {
    expect(stripKind({ online: true, lost: null, wake: "failed" })).toBe("waking-failed");
    expect(stripKind({ online: true, lost: null, wake: "pending" })).toBe("waking");
    expect(stripKind({ online: true, lost: null, wake: null })).toBe(null);
  });
  it("the lost words never claim an update, and Reload is her tap", () => {
    expect(W.LOST.title).not.toMatch(/updat|new version|deploy/i);
    expect(W.LOST.action).toBe(W.UPDATED.action);
  });
});

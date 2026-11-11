// P-5 leftover, "script-src CSP after voice": a page runs only our own scripts (this origin's files, and our HTML's own
// inline scripts by their exact hash), so a script slipped into a page doesn't run. Proved in a real Chrome by
// scripts/csp-smoke.ts (every route, the mic pages with a real hold, PayPal's return, Pay Later with --paypal); here,
// on the booted server: which policy each response carries, and that it holds what the browser test relies on.

import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NOTHING_POLICY, WORKER_POLICY, inlineScriptHashes, pagePolicy, policyFor } from "../../server/src/csp.ts";
import { bootServer } from "./boot.ts";
import { leanScripts } from "../../web/lean-html.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const hashOf = (js: string) => `'sha256-${createHash("sha256").update(js, "utf8").digest("base64")}'`;
/** One directive's sources, or null when the policy has none. */
const directive = (policy: string, name: string) => policy.split("; ").find((d) => d.startsWith(`${name} `))?.split(" ").slice(1) ?? null;

describe("csp: the policies", () => {
  it("inline_scripts_are_hashed_exactly: each inline script by its own bytes; a script with src, or an empty one, by none", () => {
    const html = `<head><script>(function(){var a=1})()</script><script type="module" src="/x.js"></script><script></script></head>`
      + `<body><script>\n  document.body.className = "ünï";\n</script></body>`;
    expect(inlineScriptHashes(html)).toEqual([hashOf("(function(){var a=1})()"), hashOf(`\n  document.body.className = "ünï";\n`)]);
  });

  it("no_unsafe_script_sources: no page, the worker or anything else allows inline or eval'd scripts", () => {
    for (const p of [pagePolicy(["'sha256-x'"]), WORKER_POLICY, NOTHING_POLICY]) {
      const scripts = directive(p, "script-src") ?? directive(p, "default-src")!;
      expect(scripts, p).not.toContain("'unsafe-inline'");
      expect(scripts, p).not.toContain("'unsafe-eval'");
      expect(scripts, p).not.toContain("*");
      expect(scripts, p).not.toContain("https:");
      expect(scripts, p).not.toContain("blob:"); // ONNX Runtime is ours: no patched loader imported from a blob: URL
      expect(p, p).not.toMatch(/jsdelivr/i);
    }
    // The page's last word on anything else: plugins never, <base> never, framing never.
    for (const d of ["object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'"]) expect(pagePolicy([]).split("; ")).toContain(d);
  });

  it("one_policy_per_kind: every page the same (the voice test too), the speech worker its own, the rest nothing", () => {
    const hashes = ["'sha256-abc'"];
    const home = policyFor("/", "text/html; charset=UTF-8", hashes);
    const voice = policyFor("/voice-test-2", "text/html; charset=UTF-8", hashes);
    expect(voice).toBe(home);
    expect(directive(home, "script-src")).toContain("'sha256-abc'");
    expect(policyFor("/assets/whisper.worker-a47BbE-H.js", "text/javascript", hashes)).toBe(WORKER_POLICY);
    // Everything that isn't a page or the worker runs nothing.
    for (const [path, type] of [["/api/health", "application/json"], ["/assets/main-x.js", "text/javascript"], ["/x.wasm", "application/wasm"], ["/nope", "text/plain"]] as const) {
      expect(policyFor(path, type, hashes), path).toBe(NOTHING_POLICY);
    }
    // The model's host and WebAssembly on every page: a browser that gives a worker its page's policy must still hear.
    for (const p of [home, voice]) {
      expect(directive(p, "connect-src")).toEqual(expect.arrayContaining(["https://huggingface.co", "https://*.huggingface.co", "https://*.hf.co"]));
      expect(directive(p, "script-src")).toContain("'wasm-unsafe-eval'");
    }
  });

  it("our_html_has_no_inline_handlers: no on*= attribute or javascript: URL, which a hash can't allow", () => {
    const pages = ["web/index.html", "web/safe.html", "web/404.html", "web/voice-test-2.html", "spikes/s8-voice/voice.html"];
    for (const p of pages) expect(readFileSync(join(ROOT, p), "utf8"), p).not.toMatch(/\son[a-z]+\s*=|javascript:/i);
    // The wallet's first paint (web/prerender.ts) writes its scripts with no handler or javascript: URL either.
    const prerender = readFileSync(join(ROOT, "web/prerender.ts"), "utf8");
    expect(prerender).not.toMatch(/\son[a-z]+=|javascript:/i);
  });
});

describe("csp: on the booted server", () => {
  function webBuild(): string {
    const d = mkdtempSync(join(tmpdir(), "goose-csp-"));
    writeFileSync(join(d, "index.html"), "<!doctype html><title>Goose</title><script>document.title='first paint'</script><script type=\"module\" src=\"/app.js\"></script>");
    writeFileSync(join(d, "404.html"), "<!doctype html><title>Nothing here</title><h1>Nothing here. Back to Goose</h1>");
    writeFileSync(join(d, "voice-test-2.html"), "<!doctype html><title>mic</title><script type=\"module\" src=\"/v.js\"></script>");
    writeFileSync(join(d, "app.js"), "console.log('goose');");
    mkdirSync(join(d, "assets"));
    writeFileSync(join(d, "assets", "whisper.worker-abc123.js"), "self.onmessage = () => {};");
    return d;
  }

  it("csp_per_response: the page by its own inline script's hash, the voice test the same, the worker its own, the API nothing", async () => {
    const dist = webBuild();
    const dir = mkdtempSync(join(tmpdir(), "goose-csp-run-"));
    const s = await bootServer((port, base) => {
      const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port), HOST: "127.0.0.1", PUBLIC_URL: base, GOOSE_DIR: dir, RUN_LIBRARY_DIR: join(dir, "runs"), PAYMENT: "fake", BUYER: "rule", WEB_DIST: dist };
      delete env.ANTHROPIC_API_KEY; delete env.TURSO_DATABASE_URL; delete env.TURSO_AUTH_TOKEN; delete env.RENDER;
      return env;
    });
    try {
      const csp = async (path: string) => (await fetch(`${s.base}${path}`)).headers.get("content-security-policy") ?? "";
      const home = await csp("/");
      const scripts = directive(home, "script-src")!;
      expect(scripts).toContain(hashOf("document.title='first paint'"));
      expect(scripts).not.toContain(hashOf("document.title='injected'"));
      expect(scripts).not.toContain("'unsafe-inline'");
      expect(home).not.toMatch(/jsdelivr/);
      expect(await csp("/voice-test-2")).toBe(home);
      expect(await csp("/assets/whisper.worker-abc123.js")).toBe(WORKER_POLICY);
      for (const p of ["/api/health", "/app.js", "/no-such-file.js"]) expect(await csp(p), p).toBe(NOTHING_POLICY);
      // W4: a browser asking for an unknown page gets the 404 shell (a page, so the page policy), still a 404; an API
      // path or a client that doesn't ask for HTML keeps the plain 404 and runs nothing.
      const html = { headers: { accept: "text/html,application/xhtml+xml" } };
      const lost = await fetch(`${s.base}/nothing-here`, html);
      expect([lost.status, await lost.text()]).toEqual([404, expect.stringContaining("Nothing here. Back to Goose")]);
      expect(lost.headers.get("content-security-policy")).toBe(home);
      const api = await fetch(`${s.base}/api/no-such-route`, html);
      expect([api.status, api.headers.get("content-security-policy")]).toEqual([404, NOTHING_POLICY]);
      const plain = await fetch(`${s.base}/nothing-here`);
      expect([plain.status, await plain.text()]).toEqual([404, "404 Not Found"]);
    } finally { await s.stop(); }
  }, 30_000);

  // Nov 5: the build minifies the page's inline scripts (web/lean-html.ts leanScripts). The server hashes the file it
  // serves, so the hash it sends is the minified script's, and the readable one, which the browser never sees, is not in it.
  it("csp_follows_minified_scripts: the policy carries each served script's own hash, never its readable source's", async () => {
    const dist = webBuild();
    const readable = `(function () { var title = "first paint"; document.title = title; })();`;
    writeFileSync(join(dist, "index.html"), await leanScripts(`<!doctype html><title>Goose</title><script>${readable}</script><script type="module" src="/app.js"></script>`));
    const served = inlineScriptHashes(readFileSync(join(dist, "index.html"), "utf8"));
    expect(served).toHaveLength(1);
    expect(served[0]).not.toBe(hashOf(readable));
    const dir = mkdtempSync(join(tmpdir(), "goose-csp-run-"));
    const s = await bootServer((port, base) => {
      const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port), HOST: "127.0.0.1", PUBLIC_URL: base, GOOSE_DIR: dir, RUN_LIBRARY_DIR: join(dir, "runs"), PAYMENT: "fake", BUYER: "rule", WEB_DIST: dist };
      delete env.ANTHROPIC_API_KEY; delete env.TURSO_DATABASE_URL; delete env.TURSO_AUTH_TOKEN; delete env.RENDER;
      return env;
    });
    try {
      const res = await fetch(`${s.base}/`);
      const page = await res.text();
      const script = page.match(/<script>([\s\S]*?)<\/script>/)![1]!;
      const scripts = directive(res.headers.get("content-security-policy") ?? "", "script-src")!;
      expect(scripts).toContain(hashOf(script));
      expect(scripts).not.toContain(hashOf(readable));
    } finally { await s.stop(); }
  }, 30_000);
});

// W85: a booted server counts as up only when it is our own child (./boot.ts). The flake this pins: another process on
// the port answered /api/health, the test called the server up, and that other process went away mid-test.

import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { bootServer, boundPort } from "./boot.ts";

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

/** The keyless env every booted test uses, on `port`. */
function keyless(port: number): NodeJS.ProcessEnv {
  const dir = mkdtempSync(join(tmpdir(), "goose-boot-"));
  dirs.push(dir);
  const base = `http://127.0.0.1:${port}`;
  const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port), HOST: "127.0.0.1", PUBLIC_URL: base, GOOSE_DIR: dir, RUN_LIBRARY_DIR: join(dir, "runs"), PAYMENT: "fake", BUYER: "rule" };
  for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "RENDER"]) delete env[k];
  return env;
}

describe("W85: a test's server is up only when its own child says so", () => {
  it("reads the port from the child's own listening line, nothing else", () => {
    expect(boundPort("gilded-goose server on http://127.0.0.1:51234, listening on 127.0.0.1:51234 (buyer: rule)")).toBe(51234);
    expect(boundPort("gilded-goose server on http://[::1]:4000, listening on ::1:4000 (buyer: rule)")).toBe(4000);
    expect(boundPort("gilded-goose server on http://127.0.0.1:51234, listening on 127.0.0.1 (buyer: rule)")).toBeNull(); // the old line
    expect(boundPort("")).toBeNull();
  });

  it("boots on a free port, the child names that port, health answers, and stop() waits for its exit", async () => {
    const s = await bootServer((port) => keyless(port));
    try {
      expect(s.log()).toContain(`listening on 127.0.0.1:${s.port} (`);
      expect((await fetch(`${s.base}/api/health`)).ok).toBe(true);
    } finally { await s.stop(); }
    expect(s.child.exitCode !== null || s.child.signalCode !== null).toBe(true);
    expect(await fetch(`${s.base}/api/health`).then(() => "answered", () => "refused")).toBe("refused");
  }, 30_000);

  it("a stranger answering health on the port never counts as our server: the child's EADDRINUSE is retried, then said", async () => {
    // A process that is not ours holds a port and answers every GET with { ok: true }, as a dev server would.
    const stranger: Server = createServer((_q, r) => { r.writeHead(200, { "content-type": "application/json" }); r.end('{"ok":true}'); });
    await new Promise<void>((r) => stranger.listen(0, "127.0.0.1", () => r()));
    const held = (stranger.address() as { port: number }).port;
    try {
      // Control: the old readiness check (any ok health GET on the port) would have called this "up".
      expect((await fetch(`http://127.0.0.1:${held}/api/health`)).ok).toBe(true);
      // Every try is forced onto the held port, so every child loses the bind: never "up", and the reason is said.
      const tries: number[] = [];
      const said = await bootServer(() => { tries.push(held); return keyless(held); }).then(async (s) => { await s.stop(); return "up"; }, (e: Error) => e.message);
      expect(said).toMatch(/^no free port after 5 tries[\s\S]*EADDRINUSE/);
      expect(tries).toHaveLength(5);
    } finally { await new Promise((r) => stranger.close(r)); }
  }, 60_000);
});

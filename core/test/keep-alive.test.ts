// DK part 7 (Lead-10): a first tap's market ask got a 502 from the host's proxy (q/round1/consumer.md). Node closes an
// idle kept connection after 5 s by default, under a proxy's ~60 s idle timeout, so the proxy can send on a socket Node
// is closing. The server outlasts it, and its headers timeout outlasts keep-alive. The values are the ones read back off
// the running server object (main.ts logs them from the object, after the listen), not the source's literals.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { bootServer, type Booted } from "./boot.ts";

const dir = mkdtempSync(join(tmpdir(), "goose-keepalive-"));
let s: Booted | null = null;
afterAll(async () => { await s?.stop(); rmSync(dir, { recursive: true, force: true }); });

describe("the server's kept connections outlast the host's proxy", () => {
  it("keeps an idle connection past 60 s, and waits for headers longer than that", async () => {
    s = await bootServer((port, base) => {
      const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port), HOST: "127.0.0.1", PUBLIC_URL: base, GOOSE_DIR: dir, RUN_LIBRARY_DIR: join(dir, "runs"), PAYMENT: "fake", BUYER: "rule" };
      delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_BASE_URL; delete env.TURSO_DATABASE_URL; delete env.TURSO_AUTH_TOKEN; delete env.RENDER;
      return env;
    });
    const m = /keep-alive: (\d+) ms, headers: (\d+) ms/.exec(s.log());
    expect(m, s.log()).not.toBeNull();
    const keepAlive = Number(m![1]), headers = Number(m![2]);
    expect(keepAlive).toBeGreaterThan(60_000);
    expect(headers).toBeGreaterThan(keepAlive);
  }, 60_000);
});

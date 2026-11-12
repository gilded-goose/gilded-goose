// B1 (openings, RANKED.md): /api/health names the commit live runs, so "check us" can point at it. Render sets RENDER_GIT_COMMIT
// on each deploy; health whitelists that one variable, only as a full 40-hex SHA, and says no other env value.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { bootServer } from "./boot.ts";

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

const SHA = "9c80d8950123456789abcdef0123456789abcdef";
const CANARY = "health-must-never-say-this-0d7e"; // stands in for any other env value, a key included

function env(port: number, commit: string): NodeJS.ProcessEnv {
  const dir = mkdtempSync(join(tmpdir(), "goose-health-"));
  dirs.push(dir);
  const e: NodeJS.ProcessEnv = { ...process.env, PORT: String(port), HOST: "127.0.0.1", PUBLIC_URL: `http://127.0.0.1:${port}`, GOOSE_DIR: dir, RUN_LIBRARY_DIR: join(dir, "runs"), PAYMENT: "fake", BUYER: "rule", RENDER_GIT_COMMIT: commit, GOOSE_HEALTH_CANARY: CANARY };
  for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "RENDER"]) delete e[k];
  return e;
}

async function health(commit: string) {
  let sent: NodeJS.ProcessEnv = {};
  const s = await bootServer((port) => (sent = env(port, commit)));
  try {
    const r = await fetch(`${s.base}/api/health`);
    return { status: r.status, cache: r.headers.get("cache-control"), text: await r.text(), sent };
  } finally { await s.stop(); }
}

describe("B1: /api/health names its own commit and no other env value", () => {
  it("says Render's commit, uncached, in a fixed set of fields, and none of the server's other env values", async () => {
    const h = await health(SHA);
    expect(h.status).toBe(200);
    expect(h.cache).toBe("no-store"); // a deploy's new SHA is never hidden behind a cached old one
    const body = JSON.parse(h.text) as Record<string, unknown>;
    expect(body.commit).toBe(SHA);
    // The whole answer, pinned: a new field here is a choice someone makes on purpose, never an env value slipping out.
    expect(Object.keys(body).sort()).toEqual(["buyer", "commit", "db", "intent", "ok", "paused", "payment", "paypal", "runs", "sandbox", "store"]);
    expect(h.text).not.toContain(CANARY);
    for (const [k, v] of Object.entries(h.sent)) if (k !== "RENDER_GIT_COMMIT" && v && v.length >= 12) expect(h.text, k).not.toContain(v);
  }, 30_000);

  it("anything but a full 40-hex SHA reads null, so a set variable can't put its own words in health", async () => {
    const h = await health(`${SHA}<script>${CANARY}</script>`);
    expect(JSON.parse(h.text).commit).toBeNull();
    expect(h.text).not.toContain(CANARY);
  }, 30_000);
});

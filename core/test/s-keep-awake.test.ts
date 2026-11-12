// Track S (Lead-12, Thu Nov 5): health's keep-alive read against Turso's 10-day archive (server/src/store.ts keepAwake).
// What it must never do: make health wait (Render restarts an instance whose check takes over 5 s for 60 s), write
// anything, or pause or un-pause live mode. The boot tests in abuse.test.ts check health's "db" field end to end.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it, vi } from "vitest";
import { keepAwake, livePaused, openTurso } from "../../server/src/store.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "goose-awake-")); dirs.push(d); return d; };
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const settle = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe("keepAwake: health's read of the store", () => {
  it("answers at once with the last result, and starts at most one read per window", async () => {
    let t = 0;
    let reads = 0;
    const check = keepAwake(async () => { reads++; }, { everyMs: 60_000, timeoutMs: 50, now: () => t });
    expect(check()).toBe("checking"); // the first check starts a read and doesn't wait for it
    await settle(); // the read starts on the next tick, after health has answered
    expect(reads).toBe(1);
    for (let i = 0; i < 20; i++) expect(check()).toBe("ok"); // Render's checks every few seconds: still one read
    expect(reads).toBe(1);
    t = 59_999;
    check();
    await settle();
    expect(reads).toBe(1);
    t = 60_000;
    check();
    await settle();
    expect(reads).toBe(2);
  });

  it("a read that hangs is 'failed' after its timeout, health never waited for it, and no second read starts while it hangs (Q, LOW 1)", async () => {
    let t = 0;
    let reads = 0;
    let answer: () => void = () => {};
    const check = keepAwake(() => { reads++; return new Promise<void>((r) => { answer = r; }); }, { everyMs: 1000, timeoutMs: 30, now: () => t });
    const start = performance.now();
    expect(check()).toBe("checking");
    expect(performance.now() - start).toBeLessThan(20);
    await settle();
    expect(reads).toBe(1);
    await settle(60);
    expect(check()).toBe("failed"); // said at the timeout
    // Five windows pass with the read still hung: libsql sets no timeout, so each would be one more stuck request.
    for (t = 1000; t <= 5000; t += 1000) { expect(check()).toBe("failed"); await settle(); }
    expect(reads).toBe(1);
    answer(); // it ends at last (Node's fetch gives up after 300 s)
    await settle();
    check();
    await settle();
    expect(reads).toBe(2); // free again, and its window long passed: the next check reads
    answer();
    await settle();
    expect(check()).toBe("ok");
  });

  it("a read that throws, even before it returns a promise, is 'failed', never a thrown health check; one that answers again is 'ok'", async () => {
    let t = 0;
    let mode: "sync" | "async" | "fine" = "sync";
    const check = keepAwake(() => {
      if (mode === "sync") throw new Error("no store");
      return mode === "async" ? Promise.reject(new Error("archived")) : Promise.resolve();
    }, { everyMs: 10, timeoutMs: 50, now: () => t });
    expect(() => check()).not.toThrow();
    await settle();
    expect(check()).toBe("failed");
    mode = "async"; t = 10; check(); await settle();
    expect(check()).toBe("failed");
    mode = "fine"; t = 20; check(); await settle();
    expect(check()).toBe("ok");
  });

  it("a real store: the read changes no row and leaves retrying() alone", async () => {
    const path = `file:${join(tmp(), "goose.db")}`;
    const kv = await openTurso(path, undefined);
    kv.set("cap:day", "{\"n\":2}");
    await kv.flush();
    for (let i = 0; i < 5; i++) await kv.ping();
    expect(kv.retrying()).toBe(false);
    const again = await openTurso(path, undefined);
    expect(again.keys("")).toEqual(["cap:day"]);
    expect(again.get("cap:day")).toBe("{\"n\":2}");
  });

  it("with a write waiting to be retried, a good read neither lands it nor lifts the pause; the write's own retry does (Q, LOW 3)", async () => {
    const path = join(tmp(), "goose.db");
    const kv = await openTurso(`file:${path}`, undefined);
    const raw = new DatabaseSync(path);
    try {
      raw.exec("DROP TABLE goose_kv"); // the store stops answering writes, and SELECT 1 still answers
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      kv.set("cap:day", "{\"n\":3}");
      await kv.flush();
      warn.mockRestore();
      expect(kv.retrying()).toBe(true);
      expect(livePaused(false, kv)).toBe(true);
      const check = keepAwake(() => kv.ping(), { everyMs: 1000, timeoutMs: 500 });
      check();
      await settle(20);
      expect(check()).toBe("ok"); // the read answered...
      expect(kv.retrying()).toBe(true); // ...and the write still waits: live mode stays paused
      expect(livePaused(false, kv)).toBe(true);
      raw.exec("CREATE TABLE goose_kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
      expect(raw.prepare("SELECT count(*) AS n FROM goose_kv").get()).toEqual({ n: 0 }); // the read wrote nothing
      await kv.flush();
      expect(livePaused(false, kv)).toBe(false);
      expect(raw.prepare("SELECT v FROM goose_kv WHERE k = ?").get("cap:day")).toEqual({ v: "{\"n\":3}" });
    } finally { raw.close(); }
  });

  it("a failed or hung read never pauses live mode and touches nothing but ping (Q, LOW 2: behaviour, not source text)", async () => {
    const kv = await openTurso(`file:${join(tmp(), "goose.db")}`, undefined);
    const used: string[] = [];
    // Every call the keep-alive makes on the store is recorded; a hidden write, drop or flush would show here.
    const spy = new Proxy(kv, { get: (k, name) => { const v = Reflect.get(k, name); return typeof v === "function" ? (...a: unknown[]) => { used.push(String(name)); return v.apply(k, a); } : v; } });
    let t = 0;
    let mode: "fail" | "hang" = "fail";
    const check = keepAwake(() => (used.push("ping"), mode === "fail" ? Promise.reject(new Error("archived")) : new Promise(() => {})), { everyMs: 10, timeoutMs: 20, now: () => t });
    check(); await settle();
    expect(check()).toBe("failed");
    mode = "hang"; t = 10; check(); await settle(40);
    expect(check()).toBe("failed");
    expect(used).toEqual(["ping", "ping"]);
    expect(livePaused(false, spy)).toBe(false);
    expect(livePaused(false, null)).toBe(false);
    expect(used).toEqual(["ping", "ping", "retrying"]); // the pause asks the writes, never the read
    expect(livePaused(true, null)).toBe(true); // control: a store unreachable at boot still pauses
  });

  it("main.ts wires it: the read is SELECT 1, the pause is livePaused, and health is the only caller", () => {
    const store = read("server/src/store.ts");
    expect(store).toContain('async ping() { await db.execute("SELECT 1"); },');
    const main = read("server/src/main.ts");
    expect(main).toContain("const paused = (): boolean => livePaused(STORE_DOWN, KV);");
    expect(main).toContain("keepAwake(() => KV.ping(), { everyMs: KEEP_AWAKE_MS, timeoutMs: DB_READ_MS })");
    expect(main.match(/dbCheck/g)).toHaveLength(3); // made, tested for, called: health reads it, nothing else does
    // Well under Render's 5 s health check, and the check never awaits it anyway.
    expect(Number(/const DB_READ_MS = ([\d_]+);/.exec(main)![1]!.replace(/_/g, ""))).toBeLessThanOrEqual(2000);
    expect(main).toMatch(/app\.get\("\/api\/health", \(c\) => c\.json\(\{[^\n]*db: db\(\)/);
  });
});

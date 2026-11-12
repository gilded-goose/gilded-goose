// DK part 7 (Lead-10): a cold start's first market ask failed at the host's proxy (a non-JSON 502, q/round1/consumer.md)
// though /api/health had answered. The Desk asks again quietly, about 1 s then 3 s later, showing the waking state, and
// shows the error only when every try failed. Only the two reads that spend nothing are ever asked again.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Away, QUIET_READS, QUIET_WAITS_MS, quietRetry, readJson } from "../../web/src/desk/api.ts";

const root = new URL("../../", import.meta.url).pathname;
const market = { kind: "market", marketId: "m1", results: [] };
const ok = () => new Response(JSON.stringify(market), { status: 200, headers: { "content-type": "application/json" } });
const proxy502 = () => new Response("<html>Bad gateway</html>", { status: 502, headers: { "content-type": "text/html" } });
const dropped = () => { throw new TypeError("fetch failed"); };

/** A fake fetch answering each call in turn; returns what readJson did. */
async function run(path: string, answers: (() => Response)[]) {
  const seen: string[] = [];
  let calls = 0;
  vi.stubGlobal("fetch", async () => { const a = answers[Math.min(calls, answers.length - 1)]!; calls++; return a(); });
  const waits: number[] = [];
  let out: unknown, err: unknown;
  try { out = await readJson(path, { words: "A kettle" }, (on) => seen.push(on ? "waking" : "settled"), async (ms) => { waits.push(ms); }); }
  catch (e) { err = e; }
  return { out, err, seen, waits, calls };
}
afterEach(() => { vi.unstubAllGlobals(); });

describe("the Desk's quiet read on a cold start", () => {
  it("fails once, then answers: the waking state, then the market, with no error", async () => {
    const r = await run("/api/runs/market/ask", [dropped, ok]);
    expect(r.err).toBeUndefined();
    expect((r.out as { data: unknown }).data).toEqual(market);
    expect(r.seen).toEqual(["waking", "settled"]);
    expect(r.waits).toEqual([1_000]);
  });
  it("the host's own 502 counts as no answer, and so does a dropped connection", async () => {
    const r = await run("/api/runs/market/understand", [proxy502, dropped, ok]);
    expect(r.err).toBeUndefined();
    expect(r.waits).toEqual([1_000, 3_000]);
    expect(r.calls).toBe(3);
  });
  it("fails every try: the error, after about 1 s and 3 s", async () => {
    const r = await run("/api/runs/market/ask", [dropped]);
    expect(r.err).toBeInstanceOf(Away);
    expect((r.err as Away).status).toBe(0);
    expect(r.calls).toBe(1 + QUIET_WAITS_MS.length);
    expect(r.waits).toEqual([1_000, 3_000]);
    expect(r.seen).toEqual(["waking", "settled"]);
  });
  it("never asks again after the server's own answer (a JSON 500 or 429 may have used a try)", async () => {
    for (const status of [500, 429]) {
      const r = await run("/api/runs/market/ask", [() => new Response("{oops", { status, headers: { "content-type": "application/json" } }), ok]);
      expect(r.err, String(status)).toBeInstanceOf(Away);
      expect(r.calls).toBe(1);
      expect(r.seen).toEqual([]);
    }
  });
});

describe("only reads are asked again", () => {
  it("the quiet reads are exactly understand and the market ask", () => {
    expect([...QUIET_READS].sort()).toEqual(["/api/runs/market/ask", "/api/runs/market/understand"]);
  });
  it("a cart, Approve, PayPal or a want is never quiet, whatever the failure", async () => {
    for (const path of ["/api/runs/store/cart", "/api/runs/store/complete_payment", "/api/runs/wants", "/api/runs/abc/approve"]) {
      expect(quietRetry(path, new Away(0, false)), path).toBe(false);
      expect(quietRetry(path, new Away(502, false)), path).toBe(false);
      await expect(readJson(path, {})).rejects.toThrow(/not a quiet read/);
    }
  });
  it("in Desk.tsx, readJson carries only the quiet reads, and every other call is a plain json", () => {
    const desk = readFileSync(root + "web/src/desk/Desk.tsx", "utf8");
    const quiet = [...desk.matchAll(/\breadJson<[\s\S]*?>\(\s*["`]([^"`]+)/g)].map((m) => m[1]);
    expect(quiet.sort()).toEqual(["/api/runs/market/ask", "/api/runs/market/understand"]);
    const plain = [...desk.matchAll(/(?<![\w.])json<[\s\S]*?>\(\s*["`]([^"`]+)/g)].map((m) => m[1]!);
    expect(plain.length).toBeGreaterThan(3);
    for (const p of plain) expect(QUIET_READS.includes(p), p).toBe(false);
  });
});

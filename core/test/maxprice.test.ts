// Round 0 red team A13 (Fri Oct 30): POST /api/runs with a maxPrice that isn't a dollar amount ("abc", "-500.00", {})
// answered an unhandled 500 (toCents threw). Nothing spent or changed, but the public API shouldn't 500 on junk. Now the
// run route checks maxPrice with the judge box's own price check (parsePrice) and answers 400 { error }, like the other
// 400s. Control: a good "60.00" still starts a run at $60.00; left out, null or "" (the classic page's cleared Max box,
// Lead-9's call) still runs at the demo's own limit.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_JUDGE_PRICE, demoWant, fromCents, parseJudgeRequest, parsePrice, toCents } from "../src/index.ts";
import { bootServer, type Booted } from "./boot.ts";

const JUNK: readonly unknown[] = ["abc", "-500.00", {}, "  ", "999999999.99", "0.00", 60, ["60.00"], true];

describe("maxprice: the price check", () => {
  it("parse_price_refuses_junk_and_keeps_good: a plain error for each, never a throw; good text is cents", () => {
    for (const raw of [...JUNK, ""]) { // "" is junk to the check itself; only the run route reads it as "left out"
      const r = parsePrice(raw, "maxPrice");
      expect(r.ok, JSON.stringify(raw)).toBe(false);
      expect(!r.ok && r.error, JSON.stringify(raw)).toMatch(/^maxPrice must be /);
    }
    expect(parsePrice("60.00", "maxPrice")).toEqual({ ok: true, value: toCents("60.00") });
    expect(parsePrice(fromCents(MAX_JUDGE_PRICE))).toEqual({ ok: true, value: MAX_JUDGE_PRICE }); // the ceiling itself is in
  });

  // Word for word but the ceiling's comma (C's panel, Nov 6: every shown price goes through the one formatter).
  it("judge_box_unchanged: the judge's price errors are word for word what they were", () => {
    const judge = (price: unknown) => parseJudgeRequest({ note: "hi", price });
    expect(judge("abc")).toEqual({ ok: false, error: "price must be a dollar amount like 500.00" });
    expect(judge(500)).toEqual({ ok: false, error: "price must be a dollar amount like 500.00" });
    expect(judge("-10.00")).toEqual({ ok: false, error: "price must be a dollar amount like 500.00" });
    expect(judge("0.00")).toEqual({ ok: false, error: "price must be between $0.01 and $100,000.00" });
    expect(judge("100000.01")).toEqual({ ok: false, error: "price must be between $0.01 and $100,000.00" });
    expect(judge("500.00")).toEqual({ ok: true, value: { note: "hi", price: toCents("500.00"), mode: "rule" } });
  });
});

describe("maxprice: POST /api/runs on the booted server", () => {
  let s: Booted;
  let dir: string;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "goose-maxprice-"));
    s = await bootServer((port, base) => {
      const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port), HOST: "127.0.0.1", PUBLIC_URL: base, GOOSE_DIR: dir, RUN_LIBRARY_DIR: join(dir, "runs"), PAYMENT: "fake", BUYER: "rule" };
      for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "RENDER"]) delete env[k];
      return env;
    });
  }, 60_000);
  afterAll(async () => { await s?.stop(); rmSync(dir, { recursive: true, force: true }); });

  const start = (body: Record<string, unknown>) =>
    fetch(`${s.base}/api/runs`, { method: "POST", headers: { "Content-Type": "application/json", Origin: s.base }, body: JSON.stringify(body) });

  it("junk_max_price_is_400: each answers 400 with a plain { error }, never a 500 or a run", async () => {
    for (const maxPrice of JUNK) {
      const r = await start({ maxPrice, pace: false });
      expect(r.status, JSON.stringify(maxPrice)).toBe(400);
      const body = await r.json() as Record<string, unknown>;
      expect(Object.keys(body), JSON.stringify(maxPrice)).toEqual(["error"]);
      expect(body.error, JSON.stringify(maxPrice)).toMatch(/^maxPrice must be /);
    }
    expect(s.log()).not.toMatch(/Internal Server Error|toCents/);
  });

  it("good_max_price_still_runs: 70.00 starts a run at $70.00; left out, null or \"\" runs at the demo's own limit", async () => {
    const wantOf = async (r: Response) => {
      expect(r.status).toBe(200);
      const { runId } = await r.json() as { runId: string };
      return (await (await fetch(`${s.base}/api/runs/${runId}`)).json() as { want: { maxPrice: string } }).want.maxPrice;
    };
    expect(await wantOf(await start({ maxPrice: "70.00", pace: false }))).toBe("70.00");
    const demo = fromCents(demoWant().maxPrice);
    expect(demo).not.toBe("70.00"); // control: the typed max really reaches the run
    for (const body of [{ pace: false }, { maxPrice: null, pace: false }, { maxPrice: "", pace: false }]) {
      expect(await wantOf(await start(body)), JSON.stringify(body)).toBe(demo);
    }
  });
});

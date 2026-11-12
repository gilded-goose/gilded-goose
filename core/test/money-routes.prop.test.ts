// The money routes on the real server (Joshua, Nov 3, 1(d)): the property file next door runs the Guard alone, and this
// one runs the HTTP routes around it, on a real boot with the fake payment port. Random attack sequences by a stranger, a
// holder of a leaked link and the owner in the wrong order: no captured row without the owner's tap at PayPal, never more
// than the limit, never a second capture, whatever came first. Local only, on a free port: this file never talks to live.

import fc from "fast-check";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toCents, type LedgerEvent } from "../src/index.ts";
import { bootServer, type Booted } from "./boot.ts";
import { wording } from "./note-words.ts";

const SEED = Number(process.env.PROP_SEED ?? 20261103);
const RUNS = Number(process.env.PROP_ROUTE_RUNS ?? 24);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface View {
  done: boolean; limit: string;
  bound: { orderId: string | null; total: string; spent: boolean } | null;
  settled: { ok: boolean; captureId?: string } | null;
  events: LedgerEvent[];
}

let s: Booted;
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "goose-money-routes-"));
  s = await bootServer((port, base) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env, PORT: String(port), HOST: "127.0.0.1", PUBLIC_URL: base, GOOSE_DIR: dir, RUN_LIBRARY_DIR: join(dir, "runs"), PAYMENT: "fake", BUYER: "rule",
      RUN_PER_BROWSER: "100000", RUN_PER_IP: "100000", RUN_DAY_CAP: "100000",
      TRY_PER_BROWSER_MINUTE: "100000", TRY_PER_IP_MINUTE: "100000", JUDGE_RULE_PER_BROWSER: "100000", JUDGE_RULE_PER_IP: "100000", JUDGE_RULE_DAY_CAP: "100000", TRY_COUNTED_PER_IP: "100000",
    };
    for (const key of ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "RENDER"]) delete env[key];
    return env;
  });
}, 60_000);

afterAll(async () => {
  await s?.stop();
  rmSync(dir, { recursive: true, force: true });
});

function browser() {
  let cookie = "";
  const req = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(path.startsWith("http") ? path : `${s.base}${path}`, { redirect: "manual", ...init, headers: { ...(init.headers as Record<string, string>), ...(cookie ? { Cookie: cookie } : {}) } });
    const set = r.headers.get("set-cookie");
    if (set && !set.startsWith("goose_wallet_")) cookie = set.split(";")[0]!; // the session only: these flows never come back with the week's stop
    return r;
  };
  const post = (path: string, body: unknown) => req(path, { method: "POST", headers: { "Content-Type": "application/json", Origin: s.base }, body: JSON.stringify(body) });
  return { req, post };
}
type Browser = ReturnType<typeof browser>;

async function finished(me: Browser, runId: string): Promise<View> {
  let v = await (await me.req(`/api/runs/${runId}`)).json() as View;
  for (let i = 0; i < 200 && !v.done; i++) { await sleep(25); v = await (await me.req(`/api/runs/${runId}`)).json() as View; }
  expect(v.done).toBe(true);
  return v;
}

const orders = async (): Promise<Record<string, number>> => ((await (await fetch(`${s.base}/api/fake-paypal/orders`)).json()) as { orders: Record<string, number> }).orders;
const paidAtBank = (counts: Record<string, number>) => (counts.COMPLETED ?? 0) + (counts.CAPTURED ?? 0);

/** The steps anyone can try against one bound cart. Each answers with what it may and may not have done. */
const STEPS = ["stranger-approve", "stranger-tap", "no-key-return", "wrong-key-return", "wrong-token-return", "no-token-return", "other-run-return", "cancel", "early-return", "body-injection", "approve", "tap", "return", "double-return", "stranger-undo"] as const;
type Step = (typeof STEPS)[number];

const ATTACKS: Step[] = STEPS.filter((x) => !["approve", "tap", "return"].includes(x));
const between = fc.array(fc.constantFrom(...ATTACKS), { maxLength: 2 });
/** The owner's way through (Approve, the tap, the return) as far as `reach` goes, with attacks in every gap: pure chance rarely walks all three. */
const steps: fc.Arbitrary<Step[]> = fc.tuple(fc.nat({ max: 3 }), between, between, between, between).map(([reach, a, b, c, d]) => [
  ...a, ...(reach >= 1 ? ["approve" as const] : []), ...b, ...(reach >= 2 ? ["tap" as const] : []), ...c, ...(reach >= 3 ? ["return" as const] : []), ...d,
]);

const refusals = new Set<number>([400, 401, 403, 404, 405, 409, 410, 429]);

describe("the money routes, on a real server", () => {
  it("no attack order gets a capture without the tap, over the limit, or twice", async () => {
    const owner = browser();
    const other = await owner.post("/api/runs", { seed: 1, pace: false }).then((r) => r.json()) as { runId: string };
    const otherRun = other.runId;
    await finished(owner, otherRun);
    let tapsEver = 0;
    let earlyTried = 0, paidCases = 0, closedUnpaid = 0;

    await fc.assert(fc.asyncProperty(steps, fc.constantFrom("47.73", "60.00", "59.00", "150.00"), async (script, maxPrice) => {
      const me = browser();
      const stranger = browser();
      const started = await me.post("/api/runs", { seed: 1, pace: false, maxPrice });
      expect(started.status).toBe(200);
      const { runId } = await started.json() as { runId: string };
      const first = await finished(me, runId);
      if (!first.bound) return; // nothing to pay at this max: the run ended with no cart, and the checks below are about carts

      let approveUrl: string | null = null;
      let tappedBack: string | null = null; // what PayPal's page redirects to after the owner's tap
      // The return link as a leak would hand it to a stranger, before any tap: the owner's browser reads it, the stranger uses it.
      const leaked = async (): Promise<URL | null> => {
        if (tappedBack) return new URL(tappedBack);
        const orderId = (await (await me.req(`/api/runs/${runId}`)).json() as View).bound?.orderId;
        if (!orderId) return null;
        const { url } = await (await me.req(`/api/runs/fake-paypal/${orderId}/return-link`)).json() as { url: string | null };
        return url ? new URL(url) : null;
      };

      const doStep = async (step: Step): Promise<void> => {
        const before = await (await me.req(`/api/runs/${runId}`)).json() as View;
        switch (step) {
          case "stranger-approve":
            expect((await stranger.post(`/api/runs/${runId}/approve`, {})).status).toBe(404);
            return;
          case "stranger-tap": {
            if (!before.bound?.orderId) return;
            const r = await stranger.req(`/api/runs/fake-paypal/${before.bound.orderId}/approve`);
            expect(r.status).toBe(404); // the fake PayPal page asks for this run's cookie, as a sign-in would
            return;
          }
          case "no-key-return":
            expect((await stranger.req(`/api/runs/${runId}/return`)).status).toBe(403);
            return;
          case "wrong-key-return":
            expect((await stranger.req(`/api/runs/${runId}/return?k=${"0".repeat(32)}&token=${before.bound?.orderId ?? "x"}`)).status).toBe(403);
            return;
          case "wrong-token-return": {
            const u = await leaked();
            const k = u?.searchParams.get("k");
            if (!k) return;
            const r = await stranger.req(`/api/runs/${runId}/return?k=${k}&token=ORDER-NOT-THIS-ONE`);
            if (!before.settled) expect(r.status).toBe(403);
            return;
          }
          case "no-token-return": {
            const u = await leaked();
            const k = u?.searchParams.get("k");
            if (!k) return;
            const r = await stranger.req(`/api/runs/${runId}/return?k=${k}`);
            if (!before.settled) expect(r.status).toBe(403);
            return;
          }
          case "other-run-return": {
            // This run's token under another run's id: the other run's secret isn't this one's.
            const u = await leaked();
            const k = u?.searchParams.get("k");
            if (!k) return;
            expect((await stranger.req(`/api/runs/${otherRun}/return?k=${k}&token=${before.bound?.orderId ?? "x"}`)).status).toBe(403);
            return;
          }
          case "cancel": {
            const u = await leaked();
            const k = u?.searchParams.get("k");
            if (!k || !before.bound?.orderId) return;
            await stranger.req(`/api/runs/${runId}/return?k=${k}&token=${before.bound.orderId}&cancel=1`);
            return;
          }
          case "early-return": {
            // The return link, called by someone with the link, before any tap: it reads the order, and an unapproved order is never captured.
            if (tappedBack || !before.bound?.orderId) return;
            const u = await leaked();
            const k = u?.searchParams.get("k");
            if (!k) return;
            earlyTried++;
            await stranger.req(`/api/runs/${runId}/return?k=${k}&token=${before.bound.orderId}`);
            return;
          }
          case "body-injection": {
            // Anything a request carries about money is ignored: the amount comes from the bound cart alone.
            const r = await me.post(`/api/runs/${runId}/approve`, { amount: "0.01", price: 1, total: "9999.00", maxPrice: "9999.00", cart: { price: 999_999 } });
            if (r.status === 200) approveUrl = (await r.json() as { approveUrl: string }).approveUrl;
            else expect(refusals.has(r.status)).toBe(true);
            return;
          }
          case "approve": {
            const r = await me.post(`/api/runs/${runId}/approve`, {});
            if (r.status === 200) approveUrl = (await r.json() as { approveUrl: string }).approveUrl;
            else expect(refusals.has(r.status)).toBe(true);
            return;
          }
          case "tap": {
            if (!approveUrl || tappedBack) return;
            const r = await me.req(approveUrl);
            if (r.status === 302) { tappedBack = r.headers.get("location"); tapsEver++; }
            return;
          }
          case "return":
            if (tappedBack) await fetch(tappedBack, { redirect: "manual" });
            return;
          case "double-return":
            if (tappedBack) await Promise.all([fetch(tappedBack, { redirect: "manual" }), fetch(tappedBack, { redirect: "manual" })]);
            return;
          case "stranger-undo":
            expect(refusals.has((await stranger.post(`/api/runs/${runId}/undo`, { key: "0".repeat(32) })).status)).toBe(true);
            return;
        }
      };

      for (const step of script) await doStep(step);
      const end = await (await me.req(`/api/runs/${runId}`)).json() as View;
      const captured = end.events.filter((e) => e.actor === "paypal" && e.action === "captured");
      const holds = end.events.filter((e) => e.actor === "guard" && e.action === "capturing");

      if (end.settled?.ok) paidCases++;
      if (end.settled && !end.settled.ok) closedUnpaid++;
      // Without the owner's tap at PayPal: no row calls it paid, whatever came before, and the server never says so.
      if (!tappedBack) { expect(captured).toEqual([]); expect(end.settled?.ok ?? false).toBe(false); }
      // What happened stays what happened: a replay never overwrites a paid run with a refusal.
      if (captured.length) expect(end.settled?.ok).toBe(true);
      // Never a second capture, however many returns came in.
      expect(captured.length).toBeLessThanOrEqual(1);
      expect(holds.length).toBeLessThanOrEqual(1);
      // Never more than the bound cart, the max asked for, or the limit, whatever the body said.
      for (const row of captured) {
        expect(row.price).toBe(end.bound!.total);
        expect(toCents(row.price!)).toBeLessThanOrEqual(toCents(maxPrice));
        expect(toCents(row.price!)).toBeLessThanOrEqual(toCents(end.limit.replace(/[^0-9.]/g, "") || "0"));
      }
      // The bank agrees: it never took more payments than the owner tapped.
      expect(paidAtBank(await orders())).toBeLessThanOrEqual(tapsEver);
    }), { seed: SEED, numRuns: RUNS, endOnFailure: true });
    // Not vacuous: this seed really reached an untapped return, a closed cart and a paid one. A new seed may not, so only the fixed one is pinned.
    if (process.env.PROP_SEED === undefined) { expect(earlyTried).toBeGreaterThan(0); expect(paidCases).toBeGreaterThan(0); expect(closedUnpaid).toBeGreaterThan(0); }
  }, 120_000);

  it("the honest path still pays: the property above can't pass by refusing everything", async () => {
    const me = browser();
    const started = await me.post("/api/runs", { seed: 1, pace: false });
    const { runId } = await started.json() as { runId: string };
    const v = await finished(me, runId);
    expect(v.bound).not.toBeNull();
    const { approveUrl } = await (await me.post(`/api/runs/${runId}/approve`, { price: 1 })).json() as { approveUrl: string };
    // The fake port's return link carries the run's secret, so a stranger's browser gets nothing from it.
    const placed = await (await me.req(`/api/runs/${runId}`)).json() as View;
    expect((await browser().req(`/api/runs/fake-paypal/${placed.bound!.orderId}/return-link`)).status).toBe(404);
    const tap = await me.req(approveUrl);
    expect(tap.status).toBe(302);
    await fetch(tap.headers.get("location")!, { redirect: "manual" });
    const paid = await (await me.req(`/api/runs/${runId}`)).json() as View;
    expect(paid.settled?.ok).toBe(true);
    // A replayed return settles nothing and writes nothing: the run reads exactly as it did.
    await fetch(tap.headers.get("location")!, { redirect: "manual" });
    const again = await (await me.req(`/api/runs/${runId}`)).json() as View;
    expect(again.settled).toEqual(paid.settled);
    expect(again.events).toEqual(paid.events);
    expect(paid.events.filter((e) => e.actor === "paypal" && e.action === "captured").map((e) => e.price)).toEqual([v.bound!.total]);
  }, 30_000);

  it("the list's total, through the real routes: a tap sets it, a cart bound before it was lowered can't pay past it, and a stranger's tap sets only their own", async () => {
    const me = browser();
    const started = await me.post("/api/runs", { seed: 1, pace: false });
    const { runId } = await started.json() as { runId: string };
    const v = await finished(me, runId);
    expect(v.bound).not.toBeNull();
    const { approveUrl } = await (await me.post(`/api/runs/${runId}/approve`, { price: 1 })).json() as { approveUrl: string };
    // Only the fixed picks, only from our own page.
    expect((await me.post("/api/runs/list", { total: 1 })).status).toBe(400);
    expect((await me.post("/api/runs/list", { total: "2500" })).status).toBe(400);
    expect((await me.post("/api/runs/list", {})).status).toBe(400);
    expect((await me.req("/api/runs/list", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://elsewhere.test" }, body: JSON.stringify({ total: 2500 }) })).ok).toBe(false);
    // A stranger's total is the stranger's: it doesn't touch my list.
    await browser().post("/api/runs/list", { total: 500_00 });
    const mine = await (await me.req("/api/runs/wants")).json() as { list: { total: unknown } };
    expect(mine.list.total).toBeNull();
    // Bound under no total, then the total drops below the cart: the tap can't pay it.
    const set = await (await me.post("/api/runs/list", { total: 2500 })).json() as { list: { total: { cents: number } } };
    expect(set.list.total.cents).toBe(2500);
    const tap = await me.req(approveUrl);
    await fetch(tap.headers.get("location")!, { redirect: "manual" });
    const after = await (await me.req(`/api/runs/${runId}`)).json() as View;
    expect(after.settled?.ok).not.toBe(true);
    expect(after.events.some((e) => e.actor === "paypal" && e.action === "captured")).toBe(false);
    // And a new run under it binds nothing over it.
    const second = await (await me.post("/api/runs", { seed: 1, pace: false })).json() as { runId: string };
    const w = await finished(me, second.runId);
    expect(w.bound).toBeNull();
    expect(w.events.some((e) => e.actor === "guard" && e.action === "refuse" && e.data?.rule === "total")).toBe(true);
  }, 30_000);

  it("a note through the real trick route, however worded, moves no limit, opens no dial and places no order", async () => {
    const me = browser();
    const read = async () => { const w = await (await me.req("/api/runs/wants")).json() as { limits: unknown; dial: unknown }; return { limits: w.limits, dial: w.dial }; };
    const first = await me.post("/api/runs", { seed: 1, pace: false }).then((r) => r.json()) as { runId: string };
    const limitBefore = (await finished(me, first.runId)).limit;
    const before = await read();
    const placed = await orders();
    await fc.assert(fc.asyncProperty(wording.map((n) => n.slice(0, 500)), fc.constantFrom("5.00", "49.99", "60.00", "4000.00"), async (note, price) => {
      const r = await me.post("/api/runs/trick", { note, price, mode: "rule" });
      expect([note, r.status]).toEqual([note, 200]);
      await r.text();
      expect(await read()).toEqual(before);
      expect(await orders()).toEqual(placed);
    }), { seed: SEED, numRuns: RUNS });
    // And the shopper's next real run still meets the limit it had.
    const again = await me.post("/api/runs", { seed: 2, pace: false }).then((r) => r.json()) as { runId: string };
    expect((await finished(me, again.runId)).limit).toBe(limitBefore);
  }, 120_000);

  it("no answer under /api/runs can sit in a cache: one shopper's gifts never reach another", async () => {
    const me = browser();
    const run = await (await me.post("/api/runs/list", { demo: true })).json() as object;
    expect(run).toBeTypeOf("object");
    for (const path of ["/api/runs/wants", "/api/runs/list/year", "/api/runs/shelf", "/api/runs/session/tried", "/api/runs/session/events", "/api/runs/trick", "/api/runs/no-such-run", "/api/runs/no-such-run/events"]) {
      expect((await me.req(path)).headers.get("cache-control"), path).toBe("no-store");
    }
  }, 30_000);

  it("Goose's Read and the year plan come from the server, for this browser's own list; reading them pays nothing and makes no session", async () => {
    const me = browser();
    const year0 = await (await me.req("/api/runs/list/year")).json() as { label: string; gifts: unknown[] };
    expect(year0.label).toBe("Goose's plan, not a prediction");
    expect(year0.gifts).toEqual([]);
    expect((await me.post("/api/runs/list", { demo: true })).status).toBe(200);
    const body = await (await me.req("/api/runs/wants")).json() as { reads: Record<string, { call: string; because: string; lines: { name: string; said: string }[] }> };
    expect(Object.keys(body.reads).sort()).toEqual(["harbor-jacket", "kettle", "marsh-lights-ticket", "mossbell-night"]);
    expect(body.reads.kettle!.lines.find((l) => l.name === "Trend")!.said).toContain("No price history");
    const year = await (await me.req("/api/runs/list/year")).json() as { gifts: { catalogId: string; status: string; said: string }[]; leftCents: number };
    expect(year.gifts.find((g) => g.catalogId === "marsh-lights-ticket")!.said).toContain("Buy now");
    // The total has work to do: the demo's maxes add up past it, and the plan says what doesn't fit.
    expect(year.gifts.find((g) => g.catalogId === "mossbell-night")!.status).toBe("over-total");
    expect(year.leftCents).toBeGreaterThanOrEqual(0);
    // Someone else's browser reads none of it.
    expect((await (await browser().req("/api/runs/list/year")).json() as { gifts: unknown[] }).gifts).toEqual([]);
    // The deal's Read rides with the market, and its trend ends at the deal's own price.
    const market = await (await me.post("/api/runs/market/ask", { words: "a ticket to The Marsh Lights" })).json() as { read: { call: string; lines: { name: string; said: string }[] }; results: { price: string }[] };
    expect(market.read.lines.find((l) => l.name === "Price")!.said).toContain("$84.00");
    expect(market.read.lines.find((l) => l.name === "Trend")!.said).toContain("$84.00");
    expect(market.read.lines.find((l) => l.name === "Priority")!.said).toBe("4 of 5.");
  }, 30_000);
});

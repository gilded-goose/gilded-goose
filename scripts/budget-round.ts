// Budget: a haggle round event arrives within 2 s (PROFILE). Starts a run on a
// running server, reads the SSE stream, and measures the gap from each round's
// first seller offer to that round's buyer move. Also checks the return route is
// idempotent (project lesson 6) and that only this machine's own pages can start a
// paid run (red team, M1). Exits 1 if any gap > budget or a check misbehaves.
//
//   pnpm budget:round [serverUrl]      default http://localhost:8787 (start it with pnpm dev)

import { networkInterfaces } from "node:os";
import { localOnly } from "./not-live.ts";

const base = localOnly(process.argv[2] ?? "http://localhost:8787");
const BUDGET_MS = 2000;
function fail(m: string): never { console.error(`BUDGET FAIL: ${m}`); process.exit(1); }

// Who may start a paid run. None of these refusals starts one, so they cost nothing.
const runs = `${base}/api/runs`;
const asText = await fetch(runs, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" });
if (asText.status !== 415) fail(`a text/plain POST (a cross-site form) gave ${asText.status}, not 415`);
const foreign = await fetch(runs, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" }, body: "{}" });
if (foreign.status !== 403) fail(`a foreign Origin gave ${foreign.status}, not 403`);
const lan = Object.values(networkInterfaces()).flat().find((n) => n && n.family === "IPv4" && !n.internal)?.address;
if (lan) {
  const reached = await fetch(`http://${lan}:${new URL(base).port}/api/health`, { signal: AbortSignal.timeout(2000) }).then(() => true, () => false);
  if (reached) fail(`the API answers on the LAN address ${lan}; it should listen on 127.0.0.1 only`);
}
console.log(`who can start a run: text/plain 415, foreign origin 403, LAN ${lan ? "refused" : "(no LAN address)"}`);

// Control: the server's own single-service page (its own origin) may start one.
const start = await fetch(runs, { method: "POST", headers: { "Content-Type": "application/json", Origin: new URL(base).origin }, body: JSON.stringify({ maxPrice: "60.00", seed: 1, pace: false }) });
if (!start.ok) fail(`our own page could not start a run: ${start.status}`);
// `buyer` is the screen's label; `source` is what the ledger rows say made each move ("rule", a model id, or "recorded").
// Pacing off: a recorded run would otherwise wait its recorded ~1 s per move, and this gate measures the engine.
const { runId, buyer, source } = (await start.json()) as { runId: string; buyer: string; source: string };
// This browser's runs cookie: only the run's own browser may press Approve (H2).
const cookie = (start.headers.get("set-cookie") ?? "").split(";")[0]!;

const t0 = performance.now(); // before the request, so "whole stream read in" times the stream, not the parse
const res = await fetch(`${base}/api/runs/${runId}/events`);
const text = await res.text();
let roundStart: number | null = null;
let rounds = 0;
const gaps: number[] = [];
// Events arrive in order; timestamps are taken as the stream is parsed, so this measures
// the server's pace as the client sees it (the whole stream is read before parsing, which
// is fine here only because the state event ends it; a live client would time each chunk).
let state: any = null;
// Which port made each move. The engine's 1.5 s timeout turns a slow model call into a
// rule move at ~1.5 s, which still passes the 2 s gate, so the gate alone can't see the
// 1.5 s move budget break: only the move's source can. Fallbacks are printed with their why.
const sources: string[] = [];
const fallbacks: string[] = [];
for (const chunk of text.split("\n\n")) {
  const ev = /^event: (.*)$/m.exec(chunk)?.[1];
  const data = /^data: (.*)$/m.exec(chunk)?.[1];
  if (!ev || !data) continue;
  if (ev === "state") state = JSON.parse(data);
  if (ev !== "ledger") continue;
  const e = JSON.parse(data) as { actor: string; round?: number; t: number; why: string; data?: { source?: string } };
  if (e.actor === "seller" && roundStart === null) roundStart = e.t;
  if (e.actor === "buyer" && roundStart !== null) {
    gaps.push(e.t - roundStart); rounds++; roundStart = null;
    const src = e.data?.source ?? "unknown";
    sources.push(src);
    if (src === "rule-fallback") fallbacks.push(`round ${e.round}: ${e.why}`);
  }
}
const wall = Math.round(performance.now() - t0);
if (rounds === 0) fail("no rounds observed");
const max = Math.max(...gaps);
console.log(`buyer=${buyer} rounds=${rounds} round gaps (ms, ledger clock): ${gaps.join(", ")} | max ${max} | whole stream read in ${wall} ms`);
console.log(`moves by: ${sources.join(", ")} | fallbacks ${fallbacks.length} of ${sources.length}`);
for (const f of fallbacks) console.warn(`warn fell back, ${f}`);
if (max > BUDGET_MS) fail(`a round took ${max} ms`);
// Reached-state check (Lesson 3): a model buyer whose every move fell back did not run the AI at all.
if (source !== "rule" && !sources.includes(source)) fail(`buyer ${buyer} made none of the ${sources.length} moves (all fell back)`);
// H2 (018 N11): a bound cart and no order until Approve is pressed; the press makes it.
if (!state?.bound) fail("run did not end in a bound cart");
if (state.bound.orderId) fail(`an order (${state.bound.orderId}) existed before anyone pressed Approve`);
const approve = (headers: Record<string, string>) => fetch(`${base}/api/runs/${runId}/approve`, { method: "POST", headers: { "Content-Type": "application/json", Origin: new URL(base).origin, ...headers }, body: "{}" });
const stranger = await approve({});
// W87: a stranger gets the missing run's 404, so a run's existence isn't told apart.
if (stranger.status !== 404) fail(`Approve from another browser gave ${stranger.status}, not 404`);
const pressed = await approve({ Cookie: cookie });
if (!pressed.ok) fail(`Approve from the run's own browser gave ${pressed.status}`);
// AS-8: the order id is the owner's alone (a stranger reading the run gets null), so read it as the run's own browser.
state = (await (await fetch(`${base}/api/runs/${runId}`, { headers: { Cookie: cookie } })).json()) as any;
if (!state?.bound?.orderId) fail("Approve did not place the order");
// Which payment port ran (shared Lesson 32): the health label and the order id must agree.
const payment = ((await (await fetch(`${base}/api/health`)).json()) as { payment?: string }).payment;
const fakeId = String(state.bound.orderId).startsWith("FAKE-");
if ((payment === "fake") !== fakeId || state.payment !== payment) fail(`payment port mismatch: health says ${payment}, run says ${state.payment}, order ${state.bound.orderId}`);
console.log(`payment port: ${payment} (order ${state.bound.orderId})`);

// Idempotent return route: without the secret → 403 and nothing changes.
const r1 = await fetch(`${base}/api/runs/${runId}/return?token=${state.bound.orderId}`, { redirect: "manual" });
if (r1.status !== 403) fail(`return without secret gave ${r1.status}`);
const after = (await (await fetch(`${base}/api/runs/${runId}`)).json()) as any;
if (after.settled !== null || after.bound.spent !== false) fail("a rejected return changed the run");
console.log("return route: 403 without secret, run unchanged");
console.log("BUDGET PASS (round < 2 s)");

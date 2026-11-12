// Track L (Round 1's data review): an ask alone writes this browser's session rows, so Behind the scenes' empty state
// may never tell a shopper to wait for Approve. Boots the real server (PAYMENT=fake, a free port, a temp GOOSE_DIR so
// nothing lands in the repo, and an environment with no key, so the ask is the fixed sellers' and costs no AI call),
// then: session/events with no cookie is 204 (the empty state's case); the Desk's chip "A Marsh Lights ticket under $90"
// is asked once; session/events with that ask's cookie is 200 and streams its rows. Prints one JSON line for
// check-claims (`l-ask-rows`), and exits 1 on any failure.
//
//   node scripts/session-ask-probe.ts

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ASK = "A Marsh Lights ticket under $90"; // the Desk's first chip (web/src/desk/Desk.tsx CHIPS)

const port = await new Promise<number>((done) => { const s = createServer().listen(0, "127.0.0.1", () => { const p = (s.address() as { port: number }).port; s.close(() => done(p)); }); });
const base = `http://127.0.0.1:${port}`;
const dir = mkdtempSync(join(tmpdir(), "goose-ask-probe-"));
const server = spawn(process.execPath, [new URL("../server/src/main.ts", import.meta.url).pathname], {
  env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", PAYMENT: "fake", PORT: String(port), HOST: "127.0.0.1", PUBLIC_URL: base, WEB_URL: base, GOOSE_DIR: dir, RUN_LIBRARY_DIR: join(dir, "runs") },
  stdio: ["ignore", "ignore", "pipe"],
});
let err = "";
server.stderr.on("data", (d: Buffer) => { err += d.toString(); });
const done = (code: number, out: unknown) => { server.kill(); rmSync(dir, { recursive: true, force: true }); console.log(JSON.stringify(out)); process.exit(code); };
const fail = (why: string) => done(1, { error: why, server: err.slice(-400) });

// Up within 30 s, or fail.
const until = Date.now() + 30_000;
for (;;) {
  const r = await fetch(`${base}/api/runs/session/events`, { headers: { accept: "application/json" } }).catch(() => null);
  if (r) { if (r.status !== 204) fail(`a fresh browser's session/events is ${r.status}, not 204`); break; }
  if (Date.now() > until) fail("the server didn't answer within 30 s");
  await new Promise((w) => setTimeout(w, 250));
}

const ask = await fetch(`${base}/api/runs/market/ask`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ words: ASK }) });
if (!ask.ok) fail(`market/ask is ${ask.status}`);
const cookie = (ask.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
if (!cookie) fail("market/ask set no session cookie");
const sellers = ((await ask.json()) as { results?: unknown[] }).results?.length ?? 0;

// Read the stream for up to 4 s (the rows replay at once on connect). A fresh session opens with the seeded week's one
// row ("Seeded week (simulated, no money moved)", the page's "seeded week not counted"); every other row is the ask's.
const ctl = new AbortController();
const ev = await fetch(`${base}/api/runs/session/events`, { headers: { cookie, accept: "text/event-stream" }, signal: ctl.signal });
if (ev.status !== 200) fail(`session/events after the ask is ${ev.status}, not 200`);
let text = "";
const stop = setTimeout(() => ctl.abort(), 4000);
const reader = ev.body!.getReader(), dec = new TextDecoder();
try { for (;;) { const { done: end, value } = await reader.read(); if (end) break; text += dec.decode(value, { stream: true }); } } catch { /* aborted: the read is over */ }
clearTimeout(stop);
type Row = { actor?: string; action?: string; why?: string };
const all = text.split("\n").filter((l) => l.startsWith("data: ")).map((l) => JSON.parse(l.slice(6)) as Row);
const asked = all.filter((e) => !(e.why ?? "").startsWith("Seeded week"));
const offers = asked.filter((e) => e.actor === "seller").length, watcher = asked.filter((e) => e.actor === "watcher").length;
if (asked.length === 0) fail("the ask's session streamed no rows of its own");
if (asked.some((e) => e.actor === "paypal")) fail("an ask alone wrote a PayPal row: PayPal's rows must wait for the shopper's tap");
done(0, { status: ev.status, rows: asked.length, offers, watcher, sellers });

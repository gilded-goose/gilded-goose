// One way for a test to boot the real server (W85). Tonight abuse.test.ts failed once with "fetch failed, other side
// closed" and passed on a re-run. The old boots picked a free port, closed it, spawned the server on it, and called the
// server "up" as soon as *anything* on that port answered /api/health. If another process took the port in between
// (another test file's server, a dev server), our child failed to bind and exited, but the health GET could still be
// answered by the other server, which then went away mid-test.
//
// The server can't listen on port 0 itself: its PUBLIC_URL (PayPal's return URL, the allowed Origins, the fake PayPal
// page) is fixed before it binds. So a boot here is "ours" only when *our own child* prints its listening line with the
// port it really bound (main.ts reads it back from the server address); then a health GET must answer, with a bounded
// retry. A child that lost the port (EADDRINUSE) is retried on a fresh port, at most BOOT_TRIES times.

import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BOOT_TRIES = 5;

/** A port the OS calls free right now (port 0, read back from the address). Only a hint: someone may take it next. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => { const a = s.address(); const p = typeof a === "object" && a ? a.port : 0; s.close(() => resolve(p)); });
  });
}

export interface Booted {
  base: string; port: number; child: ChildProcess;
  log: () => string;
  /** Kill the child (if it still runs) and wait for "close": the process has exited and its output is drained. */
  stop: () => Promise<void>;
}

/** The port the child says it bound, from its own boot line, or null before that line. */
export function boundPort(log: string): number | null {
  const m = /listening on [^ ]+:(\d+) \(/.exec(log);
  return m ? Number(m[1]) : null;
}

/**
 * Spawn `server/src/main.ts` with `envFor(port, base)` and wait until it is ours and answering. The env is the test's
 * whole env (this adds nothing). Throws with the server's log if the child exits for any reason but a taken port, or
 * never answers.
 */
export async function bootServer(envFor: (port: number, base: string) => NodeJS.ProcessEnv): Promise<Booted> {
  let last = "";
  for (let attempt = 0; attempt < BOOT_TRIES; attempt++) {
    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ["src/main.ts"], { cwd: join(ROOT, "server"), env: envFor(port, base), stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.once("error", (e) => { log += `spawn failed: ${e.message}\n`; }); // said in the thrown log, never an unhandled error
    child.stdout!.on("data", (b) => { log += String(b); });
    child.stderr!.on("data", (b) => { log += String(b); });
    const closed = new Promise<void>((r) => child.once("close", () => r()));
    const stop = () => { if (child.exitCode === null && child.signalCode === null) child.kill(); return closed; };
    const gone = () => child.exitCode !== null || child.signalCode !== null;

    // 1. Our own child says it is listening, on the port we gave it (10 s).
    let bound: number | null = null;
    for (let i = 0; i < 200 && bound === null && !gone(); i++) { bound = boundPort(log); if (bound === null) await sleep(50); }
    if (bound === null) {
      await stop();
      if (/EADDRINUSE/.test(log)) { last = log; continue; } // someone took the port between freePort and the bind: try another
      throw new Error(gone() ? `server exited (${child.exitCode ?? child.signalCode}):\n${log}` : `server never said it was listening:\n${log}`);
    }
    if (bound !== port) { await stop(); throw new Error(`server bound ${bound}, not the ${port} it was given:\n${log}`); }

    // 2. It answers health (bounded: 50 tries, 100 ms apart). Only our child can be on this port now.
    for (let i = 0; i < 50; i++) {
      if (gone()) break;
      const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) }).catch(() => null); // a hung socket can't stall the loop
      if (r?.ok) return { base, port, child, log: () => log, stop };
      await sleep(100);
    }
    await stop();
    throw new Error(`server never answered /api/health:\n${log}`);
  }
  throw new Error(`no free port after ${BOOT_TRIES} tries; last log:\n${last}`);
}

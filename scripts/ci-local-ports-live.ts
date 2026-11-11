// node scripts/ci-local-ports-live.ts: ci-local's port guards against real listeners, as a ci-local step (scripts/ci-local.sh,
// "== ports-live"). It used to live in core/test/ci-local-ports.test.ts, skipped unless realListeners. On GitHub's ubuntu
// those 5 cases skipped, and the ratchet allows 0 skipped, so push 10's check went red (Lead-12, Fri Nov 6, run 42216561756).
// They need macOS and lsof, as ci-local does, so they run where ci-local runs. Off macOS or without lsof this fails; it
// never skips. The script-reading tests stay in core and run everywhere.
// It runs the script's own helpers in sh. Their worktree root is a temp folder, so even the real free() can stop only
// what this script started. Prints "ports-live ok: …" or one "PORTS LIVE FAIL <check>: <why>" per failure, and exits 1.
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = readFileSync(new URL("./ci-local.sh", import.meta.url), "utf8");
const lines = SCRIPT.split("\n");
const helper = (name: string) => {
  const l = lines.find((x) => x.startsWith(`${name}() {`));
  if (!l) throw new Error(`ci-local.sh has no ${name}() helper`);
  return l;
};
const HELPER_NAMES = ["fail", "who", "leftovers", "stop", "free", "clear_port", "ours"];
const HELPERS = HELPER_NAMES.map(helper).join("\n");
const ROOT = realpathSync(mkdtempSync(join(tmpdir(), "ci-root-")));
const WT = join(ROOT, "this-run");
const TEST_SH = process.env.CI_TEST_SH ?? "sh";
const sh = (cmd: string) => {
  const r = spawnSync(TEST_SH, ["-c", `WT=${WT}; SHA=abc; ${HELPERS}\n${cmd}`], { encoding: "utf8" });
  if (r.error) throw new Error(`${TEST_SH} didn't run: ${r.error.message}`);
  return r;
};

const children: ChildProcess[] = [];
const freePort = () => new Promise<number>((done) => { const s = createServer().listen(0, "127.0.0.1", () => { const p = (s.address() as { port: number }).port; s.close(() => done(p)); }); });
/** A listener on `port`, started from `cwd`; `stubborn` ignores SIGTERM; `tag` lands on its command line. */
async function listener(port: number, cwd: string, { stubborn = false, tag = "" } = {}): Promise<ChildProcess> {
  mkdirSync(cwd, { recursive: true });
  const code = `${stubborn ? "process.on('SIGTERM',()=>{});" : ""}require('net').createServer().listen(${port},'127.0.0.1',()=>console.log('up'))`;
  const child = spawn(process.execPath, ["-e", code, ...(tag ? [tag] : [])], { cwd, stdio: ["ignore", "pipe", "ignore"] });
  children.push(child);
  await new Promise<void>((up, down) => { child.stdout!.once("data", () => up()); child.once("exit", () => down(new Error(`listener on ${port} exited before it was up`))); });
  return child;
}
const foreignDir = () => realpathSync(mkdtempSync(join(tmpdir(), "foreign-")));
const ownLeftover = join(ROOT, "an-earlier-run", "server");
const exited = (c: ChildProcess) => new Promise<void>((r) => (c.exitCode !== null || c.signalCode !== null ? r() : c.once("exit", () => r())));
const alive = (c: ChildProcess) => c.exitCode === null && c.signalCode === null;
const lastLine = (s: string) => s.trim().split("\n").at(-1);

function expect(ok: boolean, why: string): void { if (!ok) throw new Error(why); }
function has(text: string, part: string, what: string): void { expect(text.includes(part), `${what} lacks ${JSON.stringify(part)}; got ${JSON.stringify(text.slice(-300))}`); }

/** The five checks, each against a real listener on a port the OS handed out (never one of ci-local's own). */
const CHECKS: { name: string; run: () => Promise<void> }[] = [
  { name: "ours names a foreign listener's pid, command and cwd, then fails", run: async () => {
    const port = await freePort();
    const cwd = foreignDir();
    const c = await listener(port, cwd);
    const r = sh(`ours ${port}`);
    expect(r.status === 1, `ours exited ${r.status}, not 1`);
    has(r.stdout, `port ${port} held by pid ${c.pid}: `, "ours");
    has(r.stdout, `(cwd ${cwd})`, "ours");
    has(r.stdout, "createServer", "ours");
    expect(lastLine(r.stdout) === `LOCAL-CI FAIL abc port ${port} not served from ${WT}`, `ours's last line: ${lastLine(r.stdout)}`);
  } },
  { name: "a foreign listener survives free() and clear_port, and the run fails naming it", run: async () => {
    const port = await freePort();
    const c = await listener(port, foreignDir());
    const r = sh(`free; CLEAR_TRIES=2 clear_port ${port}`);
    expect(r.status === 1, `clear_port exited ${r.status}, not 1`);
    has(r.stdout, `port ${port} held by pid ${c.pid}: `, "clear_port");
    expect(lastLine(r.stdout) === `LOCAL-CI FAIL abc port ${port} still held`, `clear_port's last line: ${lastLine(r.stdout)}`);
    expect(alive(c), "the foreign listener was stopped");
  } },
  { name: "our own leftover is stopped, and clear_port returns once the port is quiet", run: async () => {
    const port = await freePort();
    const c = await listener(port, ownLeftover);
    const out = sh(`clear_port ${port} && echo clear`).stdout.trim();
    expect(out === "clear", `clear_port printed ${JSON.stringify(out)}`);
    await exited(c);
    expect(c.signalCode === "SIGTERM", `our leftover ended by ${c.signalCode ?? `exit ${c.exitCode}`}, not SIGTERM`);
  } },
  { name: "our own leftover that won't stop is named and fails", run: async () => {
    const port = await freePort();
    const c = await listener(port, ownLeftover, { stubborn: true });
    const r = sh(`CLEAR_TRIES=2 clear_port ${port}`);
    expect(r.status === 1, `clear_port exited ${r.status}, not 1`);
    has(r.stdout, `port ${port} held by pid ${c.pid}: `, "clear_port");
    expect(lastLine(r.stdout) === `LOCAL-CI FAIL abc port ${port} still held`, `clear_port's last line: ${lastLine(r.stdout)}`);
  } },
  { name: "a Playwright or MCP process is never stopped, even from inside a ci-local worktree", run: async () => {
    for (const tag of ["playwright-driver", "mcp-server"]) {
      const port = await freePort();
      const c = await listener(port, ownLeftover, { tag });
      const left = sh(`leftovers ${port}`).stdout.trim();
      expect(left === "", `${tag}: leftovers named ${left}`);
      expect(sh(`CLEAR_TRIES=2 clear_port ${port}`).status === 1, `${tag}: clear_port didn't fail`);
      expect(alive(c), `${tag} was stopped`);
    }
  } },
];

async function main(): Promise<number> {
  const lsof = spawnSync("sh", ["-c", "command -v lsof"]).status === 0;
  if (process.platform !== "darwin" || !lsof) {
    console.log(`PORTS LIVE FAIL setup: needs macOS and lsof, as ci-local does (platform ${process.platform}, lsof ${lsof ? "yes" : "no"})`);
    return 1;
  }
  let failed = 0;
  for (const c of CHECKS) {
    try { await c.run(); console.log(`ok   ${c.name}`); }
    catch (e) { failed++; console.log(`PORTS LIVE FAIL ${c.name}: ${(e as Error).message}`); }
    finally { for (const k of children.splice(0)) k.kill("SIGKILL"); }
  }
  console.log(failed ? `ports-live: ${failed} of ${CHECKS.length} failed` : `ports-live ok: ${CHECKS.length} checks against real listeners`);
  return failed ? 1 : 0;
}

const code = await main().catch((e: Error) => { console.log(`PORTS LIVE FAIL setup: ${e.message}`); return 1; })
  .finally(() => { for (const k of children.splice(0)) k.kill("SIGKILL"); rmSync(ROOT, { recursive: true, force: true }); });
process.exit(code);

// node scripts/heavy-lock-live.ts: the heavy lock's waits, order and line against real lockf, as a ci-local step
// (scripts/ci-local.sh, "== heavy-lock-live"). These 9 cases lived in core/test/heavy-lock.test.ts, each opening with
// `if (!hasLockf) return;`. On GitHub's ubuntu there is no lockf, so they passed there while proving nothing: the same
// hole as push 10's skips (Lead-12, Fri Nov 6). lockf is macOS's, as ci-local is, so they run where ci-local runs. Without
// lockf this fails; it never passes empty. Each check uses its own lock file in a temp folder, so it never touches the
// real queue, even when ci-local, which holds the real lock, runs it.
// Prints "heavy-lock-live ok: …" or one "HEAVY LOCK LIVE FAIL <check>: <why>" per failure, and exits 1.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

const HEAVY = join(import.meta.dirname, "heavy-lock.sh");
let dir = "", lock = "";
const env = (wait = 1) => ({ ...process.env, GOOSE_HEAVY_LOCK: lock, GOOSE_HEAVY_WAIT: String(wait) });
const run = (args: string[], wait = 1) => spawnSync("sh", [HEAVY, ...args], { encoding: "utf8", env: env(wait) });
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
/** Holds the lock for `ms`, or until a file appears when one is named. `held` resolves once it really has it, `done` once it has let go. */
const hold = (ms: number, until?: string) => {
  const mark = join(dir, "held");
  // Bounded: a check that fails before it releases must not leave this waiting for good, with its folder gone.
  const wait = until ? `i=0; until [ -e ${until} ] || [ $i -ge 600 ]; do sleep 0.05; i=$((i+1)); done` : `sleep ${ms / 1000}`;
  const p = spawn("lockf", ["-k", lock, "sh", "-c", `: > ${mark}; ${wait}`], { stdio: "ignore" });
  const done = new Promise<void>((ok) => p.once("exit", () => ok()));
  const held = (async () => { for (let i = 0; i < 400 && !existsSync(mark); i++) await sleep(25); })();
  return { held, done };
};
const queue = () => `${lock}.queue`;
const left = () => readdirSync(queue());
/** Tickets in line: a job's half-written one starts with a dot, and it isn't in line yet. */
const inLine = () => (existsSync(queue()) ? left().filter((f) => !f.startsWith(".")).length : 0);
/** A ticket in line for a process, as the wrapper writes one. Older than anything a job takes now. */
const ticket = (pid: number, started: string, at = 1000000000) => {
  mkdirSync(queue(), { recursive: true });
  writeFileSync(join(queue(), `${at}.${pid}`), `${started}\nsome older job\n`);
};
const startOf = (pid: number) => spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8", env: { ...process.env, LC_ALL: "C" } }).stdout.trim().replace(/\s+/g, " ");

/** The few matchers these checks use, with vitest's names, so each line reads as it did in the test. */
const expect = (got: unknown) => {
  const show = (v: unknown) => JSON.stringify(v)?.slice(0, 300);
  const check = (ok: boolean, want: string) => { if (!ok) throw new Error(`expected ${show(got)} ${want}`); };
  return {
    toBe: (want: unknown) => check(Object.is(got, want), `to be ${show(want)}`),
    toEqual: (want: unknown) => check(isDeepStrictEqual(got, want), `to equal ${show(want)}`),
    toContain: (part: string) => check(typeof got === "string" && got.includes(part), `to contain ${show(part)}`),
    toBeGreaterThan: (n: number) => check(typeof got === "number" && got > n, `to be greater than ${n}`),
    toHaveLength: (n: number) => check((got as { length?: number })?.length === n, `to have length ${n}`),
  };
};

const CHECKS: { name: string; run: () => void | Promise<void> }[] = [
  { name: "never deadlocks on itself: a job inside the lock, by the wrapper or typed by hand, just runs", run: () => {
    expect(run(["sh", HEAVY, "sh", "-c", "echo inner"]).stdout).toBe("inner\n");
    const byHand = spawnSync("lockf", ["-k", "-t", "1", lock, "sh", HEAVY, "sh", "-c", "echo inner"], { encoding: "utf8", env: env() });
    expect(byHand.stdout).toBe("inner\n");
    expect(byHand.status).toBe(0);
  } },
  { name: "a second job waits its turn, then runs", run: async () => {
    const first = hold(600);
    await first.held;
    const started = Date.now();
    const second = await new Promise<string>((ok) => {
      const p = spawn("sh", [HEAVY, "sh", "-c", "echo second"], { env: env(30) });
      let out = "";
      p.stdout.on("data", (d) => { out += d; });
      p.once("exit", () => ok(out));
    });
    await first.done;
    expect(second).toBe("second\n");
    expect(Date.now() - started).toBeGreaterThan(100);
  } },
  { name: "a hung holder can't stall anyone in silence: past the wait it fails loudly, names the lock and doesn't run the job", run: async () => {
    const release = join(dir, "release"), held = hold(0, release);
    await held.held;
    const r = run(["sh", "-c", `: > ${join(dir, "ran")}`]);
    writeFileSync(release, "");
    await held.done;
    expect(r.status).toBe(75);
    expect(r.stderr).toContain("HEAVY LOCK TIMEOUT");
    expect(r.stderr).toContain(lock);
    expect(existsSync(join(dir, "ran"))).toBe(false);
  } },
  { name: "a shell whose line only mentions the lock holds nothing", run: async () => {
    const release = join(dir, "release"), held = hold(0, release);
    await held.held;
    const r = spawnSync("sh", ["-c", `: lockf -k ${lock} x ; sh ${HEAVY} sh -c 'echo ran'; exit $?`], { encoding: "utf8", env: env() });
    writeFileSync(release, "");
    await held.done;
    expect(r.status).toBe(75);
    expect(r.stdout).toBe("");
  } },
  { name: "first come: jobs run in the order they arrived, not the order lockf wakes them", run: async () => {
    const release = join(dir, "release"), order = join(dir, "order");
    const holder = hold(0, release);
    await holder.held;
    const jobs: Promise<unknown>[] = [];
    for (const name of ["a", "b", "c"]) {
      const before = inLine();
      const p = spawn("sh", [HEAVY, "sh", "-c", `echo ${name} >> ${order}`], { env: env(30), stdio: "ignore" });
      jobs.push(new Promise((ok) => p.once("exit", ok)));
      for (let i = 0; i < 400 && inLine() <= before; i++) await sleep(25);
      await sleep(1050); // a ticket is named by the second it came in
    }
    writeFileSync(release, "");
    await holder.done;
    await Promise.all(jobs);
    expect(readFileSync(order, "utf8")).toBe("a\nb\nc\n");
    expect(left()).toEqual([]);
  } },
  { name: "first come: a live job ahead in line holds a later one back with the lock free, then fails loudly and says who's ahead", run: () => {
    const ahead = spawn("sleep", ["10"], { stdio: "ignore" });
    try {
      ticket(ahead.pid!, startOf(ahead.pid!));
      const r = run(["sh", "-c", `: > ${join(dir, "ran")}`]);
      expect(r.status).toBe(75);
      expect(r.stderr).toContain("HEAVY LOCK TIMEOUT");
      expect(r.stderr).toContain(`pid ${ahead.pid}: some older job`);
      expect(existsSync(join(dir, "ran"))).toBe(false);
      expect(left()).toEqual([`1000000000.${ahead.pid}`]); // its own ticket is gone, and the other's stays
    } finally { ahead.kill(); }
  } },
  { name: "first come: a line that's moving never times out, as the wait counts from when it last moved", run: async () => {
    // Three jobs ahead, over 6.6 s, with a wait of 6 s: counted from arrival, this fails with nothing wrong. The lock's clock is whole
    // seconds and it looks once a second, so a wait can run a second short and a step can be seen a second late: a step of 2.2 s has
    // room. It was 2 s against a wait of 2 s, which timed out about once in 60 on a busy machine with nothing wrong (Nov 5, ci-local).
    const a = spawn("sleep", ["2.2"], { stdio: "ignore" }), b = spawn("sleep", ["4.4"], { stdio: "ignore" }), c = spawn("sleep", ["6.6"], { stdio: "ignore" });
    ticket(a.pid!, startOf(a.pid!), 1000000000);
    ticket(b.pid!, startOf(b.pid!), 1000000001);
    ticket(c.pid!, startOf(c.pid!), 1000000002);
    const job = spawn("sh", [HEAVY, "sh", "-c", "echo ran"], { env: env(6) });
    let out = "";
    job.stdout.on("data", (d) => { out += d; });
    const status = await new Promise((ok) => job.once("exit", ok));
    expect(status).toBe(0);
    expect(out).toBe("ran\n");
  } },
  { name: "first come: a job that died in line holds no one back, nor does a dead job's pid in someone else's hands", run: () => {
    const dead = spawnSync("sh", ["-c", "echo $$"], { encoding: "utf8" }).stdout.trim();
    ticket(Number(dead), "Thu Jan  1 00:00:00 1970");
    const reused = spawn("sleep", ["10"], { stdio: "ignore" });
    try {
      ticket(reused.pid!, "Thu Jan  1 00:00:00 1970");
      const r = run(["sh", "-c", "echo ran"]);
      expect(r.stdout).toBe("ran\n");
      expect(r.status).toBe(0);
      expect(left()).toEqual([]);
    } finally { reused.kill(); }
  } },
  { name: "first come: the job's own ticket goes when it's stopped in line, and a queue it can't write never stops it", run: async () => {
    const ahead = spawn("sleep", ["10"], { stdio: "ignore" });
    try {
      ticket(ahead.pid!, startOf(ahead.pid!));
      const waiter = spawn("sh", [HEAVY, "sh", "-c", "echo ran"], { env: env(30), stdio: "ignore" });
      for (let i = 0; i < 400 && inLine() < 2; i++) await sleep(25);
      expect(left()).toHaveLength(2);
      waiter.kill("SIGTERM");
      await new Promise((ok) => waiter.once("exit", ok));
      expect(left()).toEqual([`1000000000.${ahead.pid}`]);
    } finally { ahead.kill(); }
    rmSync(queue(), { recursive: true });
    writeFileSync(queue(), ""); // a file where the folder goes, so no ticket can be taken
    expect(run(["sh", "-c", "echo ran"]).stdout).toBe("ran\n");
  } },
];

async function main(): Promise<number> {
  if (spawnSync("sh", ["-c", "command -v lockf"]).status !== 0) {
    console.log("HEAVY LOCK LIVE FAIL setup: needs lockf (macOS), as ci-local does");
    return 1;
  }
  let failed = 0;
  for (const c of CHECKS) {
    dir = mkdtempSync(join(tmpdir(), "heavy-")); lock = join(dir, "l.lock");
    try { await c.run(); console.log(`ok   ${c.name}`); }
    catch (e) { failed++; console.log(`HEAVY LOCK LIVE FAIL ${c.name}: ${(e as Error).message}`); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  }
  console.log(failed ? `heavy-lock-live: ${failed} of ${CHECKS.length} failed` : `heavy-lock-live ok: ${CHECKS.length} checks against real lockf`);
  return failed ? 1 : 0;
}

process.exit(await main().catch((e: Error) => { console.log(`HEAVY LOCK LIVE FAIL setup: ${e.message}`); return 1; }));

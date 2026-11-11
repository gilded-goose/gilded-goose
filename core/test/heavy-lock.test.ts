// The heavy lock (scripts/heavy-lock.sh; the gate, DD seat 4, Nov 4): one full check, ci-local or mutant run at a time across the
// Mac. A CI runner has no lockf, and there the wrapper just runs the job, so that is the only case here that means anything
// everywhere. The waits, the order and the line need real lockf: they are ci-local's "heavy-lock-live" step
// (scripts/heavy-lock-live.ts). Here each one opened with `if (!hasLockf) return;` and passed on GitHub's ubuntu proving
// nothing (Lead-12, Fri Nov 6; no-skip.test.ts holds the rule).
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const HEAVY = join(import.meta.dirname, "../../scripts/heavy-lock.sh");
let dir = "", lock = "";
const env = (wait = 1) => ({ ...process.env, GOOSE_HEAVY_LOCK: lock, GOOSE_HEAVY_WAIT: String(wait) });
const run = (args: string[], wait = 1) => spawnSync("sh", [HEAVY, ...args], { encoding: "utf8", env: env(wait) });

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "heavy-")); lock = join(dir, "l.lock"); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("the heavy lock", () => {
  it("runs the job and hands back its own exit, lockf or not", () => {
    const r = run(["sh", "-c", "echo ran; exit 7"]);
    expect(r.stdout).toBe("ran\n");
    expect(r.status).toBe(7);
  });

  it("the checks against real lockf run as ci-local's heavy-lock-live step, which fails without lockf", () => {
    const ci = readFileSync(new URL("../../scripts/ci-local.sh", import.meta.url), "utf8").split("\n");
    const at = ci.indexOf('echo "== heavy-lock-live"');
    expect(at).toBeGreaterThan(ci.indexOf('echo "== ports-live"'));
    expect(at).toBeLessThan(ci.findIndex((l) => l.startsWith("clear_port ")));
    expect(ci[at + 1]).toBe("node scripts/heavy-lock-live.ts > heavy-lock-live.log 2>&1 || { tail -20 heavy-lock-live.log; fail heavy-lock-live; }");
    const live = readFileSync(new URL("../../scripts/heavy-lock-live.ts", import.meta.url), "utf8");
    expect(live.match(/^  \{ name: "/gm)).toHaveLength(9);
    for (const name of ["never deadlocks on itself", "a second job waits its turn", "a hung holder can't stall anyone", "a shell whose line only mentions the lock", "jobs run in the order they arrived", "a live job ahead in line holds a later one back", "a line that's moving never times out", "a job that died in line holds no one back", "the job's own ticket goes when it's stopped in line"]) expect(live).toContain(name);
    expect(live).toContain('if (spawnSync("sh", ["-c", "command -v lockf"]).status !== 0) {');
    const code = live.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n"); // its header names the old form
    expect(code).not.toMatch(/\bskip\w*\(|if \(!\w+\) return\b/); // no skip, no empty pass
    expect(`${code}\n  if (!hasLockf) return;`).toMatch(/\bskip\w*\(|if \(!\w+\) return\b/); // and it would see one
    expect(live).toContain("GOOSE_HEAVY_LOCK: lock"); // its own lock file, never the real queue
  });

  it("the three heavy entries take it, and what stays light stays out", () => {
    const root = join(import.meta.dirname, "../..");
    const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts as Record<string, string>;
    expect(scripts.check).toBe("sh scripts/heavy-lock.sh corepack pnpm run check:run");
    expect(readFileSync(join(root, "scripts/ci-local.sh"), "utf8")).toContain("heavy-lock.sh");
    const mutants = readFileSync(join(root, "scripts/mutants.ts"), "utf8");
    expect(mutants.indexOf("heavy-lock.sh")).toBeGreaterThan(mutants.indexOf('process.argv[2] === "--stale"')); // a blink, inside a check
    expect(scripts.build ?? "").not.toContain("heavy-lock");
    const wrapper = readFileSync(HEAVY, "utf8");
    expect(wrapper).toContain('WAIT=${GOOSE_HEAVY_WAIT:-2400}');
    expect(wrapper).toContain('LOCK=${GOOSE_HEAVY_LOCK:-/private/tmp/goose-heavy.lock}');
    expect(wrapper).toContain('lockf -k -t "$left" "$LOCK" "$@"');
  });
  it("a stopped mutant run puts the source back: TERM and HUP as well as Ctrl-C, for whichever set is live", () => {
    const mutants = readFileSync(new URL("../../scripts/mutants.ts", import.meta.url), "utf8");
    expect(mutants).toContain('for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(sig, () => { restoreLive?.(); process.exit(130); });');
    expect(mutants).toContain("  restoreLive = restore;\n");
    expect(mutants).not.toMatch(/process\.once\("SIG/);
    expect(mutants.indexOf("process.on(sig")).toBeLessThan(mutants.indexOf("for (const [setName, set] of Object.entries(sets)"));
  });
  it("a green says what it opened: ci-local walks 1440 as well as the phones, and tour-pill's OK line names a partial run", () => {
    const ci = readFileSync(new URL("../../scripts/ci-local.sh", import.meta.url), "utf8");
    expect(ci).toContain("TOUR_ONLY=ink node scripts/tour-pill.ts");
    expect(ci).toContain("TOUR_ONLY=wide node scripts/tour-pill.ts");
    const tour = readFileSync(new URL("../../scripts/tour-pill.ts", import.meta.url), "utf8");
    expect(tour).toMatch(/only \? RAN\[only\]/);
    expect(tour).toMatch(/ink: `[^`]*NOT 1440`/);
  });
});

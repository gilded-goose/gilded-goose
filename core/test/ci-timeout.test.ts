import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Push 12's GitHub check was cancelled, not failed (Lead-12, Fri Nov 6, run 42231157612): "playwright install --with-deps
// chromium" took 11m34s on the runner's apt mirror, against 21 s the run before, and the job hit timeout-minutes: 25 in the
// walks, with every step green. Green runs already took 23 of the 25 minutes. A job's time limit must outlast both its
// slowest green run times 1.5 and its slowest green run plus one slow apt (12 min, that run's 11m34s rounded up).
const DIR = new URL("../../.github/workflows/", import.meta.url);
/** Each workflow's slowest green run in minutes, start to finish (`gh run list --status success`, last 15, Fri Nov 6 06:37 PT).
 *  Raise one when a slower green run shows up; the limit follows. Track S reads each push's green run time after it lands
 *  (push 13, Fri Nov 6: 29.2 min, apt 9 min and the walks 12.3, past the 23.2 pinned an hour before, so 40 was short). */
export const SLOWEST_GREEN: Record<string, { minutes: number; run: number }> = {
  "check.yml": { minutes: 29.2, run: 42252951401 },
  "pages.yml": { minutes: 2.0, run: 42216561520 }, // 15 runs, 1.6 to 2.0 min; it installs chromium with apt too
};
export const SLOW_APT = 12;
/** check.yml carries the walks and every browser step: its floor stays at 40 whatever the numbers say (Lead-12). */
const FLOOR: Record<string, number> = { "check.yml": 40 };

/** The job-level time limits in a workflow, by job name. A job with none gets GitHub's 360. */
export function limits(yml: string): Record<string, number> {
  const out: Record<string, number> = {};
  let inJobs = false, job = "";
  for (const line of yml.split("\n")) {
    if (/^jobs:\s*$/.test(line)) { inJobs = true; continue; }
    if (/^\S/.test(line)) inJobs = false;
    if (!inJobs) continue;
    const j = /^  ([\w-]+):\s*$/.exec(line);
    if (j) { job = j[1]!; out[job] = 360; continue; }
    const t = /^    timeout-minutes:\s*(\d+)\s*$/.exec(line);
    if (t && job) out[job] = Number(t[1]);
  }
  return out;
}
export function needed(file: string): number {
  const s = SLOWEST_GREEN[file];
  if (!s) throw new Error(`${file} has no slowest green run pinned in ci-timeout.test.ts`);
  return Math.max(FLOOR[file] ?? 0, Math.ceil(1.5 * s.minutes), Math.ceil(s.minutes + SLOW_APT));
}

describe("a CI job's time limit outlasts its slowest green run and a slow apt", () => {
  const files = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f));

  it("every workflow has its slowest green run pinned, and every job's limit is at least what that needs", () => {
    expect(files.sort()).toEqual(Object.keys(SLOWEST_GREEN).sort());
    for (const f of files) {
      const jobs = limits(readFileSync(new URL(f, DIR), "utf8"));
      expect(Object.keys(jobs).length, f).toBeGreaterThan(0);
      for (const [job, min] of Object.entries(jobs)) expect(min, `${f} ${job}`).toBeGreaterThanOrEqual(needed(f));
    }
  });

  it("check.yml needs 44 (1.5 x push 13's 29.2), so the 25 that cancelled push 12 and the 40 that followed both fail", () => {
    expect(needed("check.yml")).toBe(44);
    expect(limits("jobs:\n  check:\n    runs-on: ubuntu-latest\n    timeout-minutes: 25\n").check).toBe(25);
    expect(25).toBeLessThan(needed("check.yml"));
    expect(40).toBeLessThan(needed("check.yml"));
    expect(limits("on:\n  push:\njobs:\n  a:\n    timeout-minutes: 7\n    steps:\n      - run: x\n        timeout-minutes: 1\n  b:\n    runs-on: x\n")).toEqual({ a: 7, b: 360 });
  });
});

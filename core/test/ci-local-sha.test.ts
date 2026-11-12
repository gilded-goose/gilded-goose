import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Lead-12 (Fri Nov 6 01:40): the push gate matched LOCAL-CI's short SHA by prefix. ci-local now turns whatever it is given
// into the full commit before anything else, so its PASS/FAIL line names all 40 hex. This runs that very line.
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCRIPT = readFileSync(new URL("../../scripts/ci-local.sh", import.meta.url), "utf8");
const lines = SCRIPT.split("\n");
const RESOLVE = lines.find((l) => l.startsWith("SHA=$(git -C $REPO rev-parse --verify"))!;
// sh, not zsh: the resolve line is plain POSIX, and GitHub's ubuntu runner has no zsh, so spawning it failed with ENOENT and
// the test read .trim() of an undefined stdout (push 9's check, run 42204910795). no-zsh-spawn.test.ts holds the rule.
const resolve = (given: string) => {
  const r = spawnSync("sh", ["-c", `REPO=${JSON.stringify(ROOT)}; ${RESOLVE}; echo "$SHA"`, "ci-local", given], { encoding: "utf8" });
  expect(r.error?.message).toBeUndefined();
  return r;
};

describe("ci-local names the full SHA", () => {
  it("a short SHA becomes the full 40-hex commit", () => {
    const head = execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const r = resolve(head.slice(0, 8));
    expect([r.status, r.stdout.trim()]).toEqual([0, head]);
    expect(head).toMatch(/^[0-9a-f]{40}$/);
  });

  it("anything that isn't one commit fails before a worktree is made", () => {
    const r = resolve("not-a-sha");
    expect([r.status, r.stdout.trim()]).toEqual([1, "LOCAL-CI FAIL not-a-sha not-a-commit"]);
  });

  it("the resolve comes before the worktree, and both result lines print it", () => {
    const at = (re: RegExp) => lines.findIndex((l) => re.test(l));
    expect(at(/^SHA=\$\(git -C \$REPO rev-parse --verify/)).toBeGreaterThan(at(/^REPO=/));
    expect(at(/^SHA=\$\(git -C \$REPO rev-parse --verify/)).toBeLessThan(at(/worktree add -q --detach \$WT \$SHA/));
    expect(lines.filter((l) => /^SHA=/.test(l))).toHaveLength(1);
    expect(SCRIPT).toContain('echo "LOCAL-CI PASS $SHA"');
    expect(SCRIPT).toContain('echo "LOCAL-CI FAIL $SHA $1"');
  });
});

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Push 9's GitHub check failed: ci-local-sha.test.ts spawned "zsh", which macOS has and GitHub's ubuntu runner doesn't,
// so it passed in ci-local (macOS) and failed only on GitHub. No test spawns zsh: a script's line under test runs in sh or
// bash. A check that needs zsh or macOS is a ci-local step, never a skipping test (no-skip.test.ts).
const ZSH_SPAWN = /\b(?:spawn|spawnSync|execFile|execFileSync|exec|execSync)\(\s*["'`](?:\/bin\/|\/usr\/bin\/)?zsh\b/;
const DIRS = ["../../core/test/", "../../trust/test/"];
/** This file holds the bad forms as examples, so it reads every file but itself. */
const SELF = "no-zsh-spawn.test.ts";

export function zshSpawns(name: string, text: string): string[] {
  return text.split("\n").flatMap((l, i) => (ZSH_SPAWN.test(l) ? [`${name}:${i + 1}`] : []));
}

describe("no test spawns zsh, which GitHub's runner doesn't have", () => {
  it("every test file in core and trust", () => {
    const found = DIRS.flatMap((d) => {
      const dir = new URL(d, import.meta.url);
      return readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== SELF).flatMap((f) => zshSpawns(`${d}${f}`, readFileSync(new URL(f, dir), "utf8")));
    });
    expect(found).toEqual([]);
  });

  it("catches the forms push 9 used and their cousins, and not sh or a word in a comment", () => {
    for (const bad of ['spawnSync("zsh", ["-c", x])', "execFileSync('/bin/zsh', [])", "execSync(`zsh -c 'x'`)", 'spawn("/usr/bin/zsh")']) {
      expect(zshSpawns("x", bad), bad).toHaveLength(1);
    }
    for (const ok of ['spawnSync("sh", ["-c", x])', 'spawnSync("bash", [])', "// spawning zsh fails on ubuntu", 'spawnSync("sh", ["-c", "command -v zsh"])']) {
      expect(zshSpawns("x", ok), ok).toEqual([]);
    }
  });
});

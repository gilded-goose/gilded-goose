import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Push 8's ci-local failed on "port 8797 not served from" its worktree: something else answered the round server's health
// check, and it was gone before anyone looked (Lead-12, Fri Nov 6 01:55). Now every server start clears its port first and
// a tripped guard prints who held it. A run stops only its own leftovers (a listener started from a ci-local worktree),
// never another session's process, a browser, Playwright or MCP (Lead-12, 02:05). These read the script and run everywhere.
// The guards against real listeners need macOS and lsof, so they are ci-local's "ports-live" step
// (scripts/ci-local-ports-live.ts): here behind skipIf they skipped on GitHub's ubuntu, and the ratchet allows 0 skipped
// (push 10's check, Lead-12 Fri Nov 6; no-skip.test.ts holds the rule).
const ROOT_DIR = new URL("../../", import.meta.url);
const SCRIPT = readFileSync(new URL("../../scripts/ci-local.sh", import.meta.url), "utf8");
const lines = SCRIPT.split("\n");
const helper = (name: string) => lines.find((l) => l.startsWith(`${name}() {`))!;

describe("ci-local clears each port before its server, and stops only its own leftovers", () => {
  it("every server start is right after clear_port and before ours, on its own port", () => {
    const starts = lines.flatMap((l, i) => {
      const m = /^\(.*(?:--port (\d+)|PORT=(\d+)|http\.server (\d+)).*&\)$/.exec(l);
      return m ? [{ i, port: m[1] ?? m[2] ?? m[3] }] : [];
    });
    expect(starts.length).toBe(6);
    for (const { i, port } of starts) {
      expect(lines[i - 1], `line ${i + 1}`).toBe(`clear_port ${port}`);
      expect(lines.slice(i + 1, i + 4), `line ${i + 1}`).toContain(`ours ${port}`);
    }
  });

  it("the only kill is stop()'s, of leftovers(); free() goes through it; the guards are there", () => {
    expect(lines.filter((l) => /\bkill\b/.test(l) && !l.startsWith("#"))).toEqual([helper("stop")]);
    expect(helper("stop")).toContain("leftovers $port | xargs kill");
    expect(helper("free")).toBe("free() { stop 4193 4196 8796 8797 8798; sleep 1; }");
    expect(helper("leftovers")).toContain('[ "$p" = 28968 ] && continue');
    expect(helper("leftovers")).toContain('grep -qiE "playwright|mcp|chrome|chromium" && continue');
    expect(helper("leftovers")).toContain("-sTCP:LISTEN");
    expect(helper("leftovers")).toContain('lsof -a -p $p -d cwd -Fn 2>/dev/null | grep -q "^n${WT%/*}/" && echo $p');
  });

  it("ci-local's five ports are listed once, printed in its header, used by free(), and named by no other code file", () => {
    const listed = /^CI_PORTS="([\d ]+)"$/m.exec(SCRIPT)![1]!.split(" ");
    expect(listed).toEqual(["4193", "4196", "8796", "8797", "8798"]);
    expect(helper("free")).toBe(`free() { stop ${listed.join(" ")}; sleep 1; }`);
    const used = new Set(lines.flatMap((l) => /^(?:clear_port|ours|stop) (\d+)/.exec(l)?.[1] ?? []));
    expect([...used].sort()).toEqual(listed);
    expect(SCRIPT).toContain(`echo "== ports $CI_PORTS: ci-local's own, never a track server's"`);
    // -w, not \\b: git's extended regex on macOS has no \\b, so a \\b pattern matched nothing and passed (my first sweep).
    const g = spawnSync("git", ["grep", "-nwE", `(${listed.join("|")})`, "--", ".", ":!docs", ":!*.md", ":!*.png"], { cwd: ROOT_DIR, encoding: "utf8" });
    expect(g.error?.message).toBeUndefined();
    // A test that reads ci-local.sh names its ports, and a comment may say to keep off them; any other line that names one
    // starts or reaches a server there (.claude/launch.json's built-hosted server and a red-team script did, on 8797 and 8798).
    const hits = g.stdout.split("\n").filter(Boolean).map((l) => /^([^:]+):\d+:(.*)$/.exec(l)!);
    const others = hits.filter(([, f, text]) => f !== "scripts/ci-local.sh" && !/^\s*(#|\/\/)/.test(text!) && !readFileSync(new URL(f!, ROOT_DIR), "utf8").includes("ci-local.sh"));
    expect(others.map(([line]) => line.slice(0, 120))).toEqual([]);
    expect(g.stdout).toContain("core/test/tour-edges.test.ts"); // the grep finds a real use, so a pattern that matches nothing fails
  });

  it("the guards against real listeners run as ci-local's ports-live step, which fails off macOS and never skips", () => {
    const at = lines.findIndex((l) => l === 'echo "== ports-live"');
    expect(at).toBeGreaterThan(lines.findIndex((l) => l === 'grep -q "^ratchet ok" check.log || fail ratchet'));
    expect(at).toBeLessThan(lines.findIndex((l) => l.startsWith("clear_port ")));
    expect(lines[at + 1]).toBe("node scripts/ci-local-ports-live.ts > ports-live.log 2>&1 || { tail -20 ports-live.log; fail ports-live; }");
    const live = readFileSync(new URL("../../scripts/ci-local-ports-live.ts", import.meta.url), "utf8");
    expect(live).toContain('const HELPER_NAMES = ["fail", "who", "leftovers", "stop", "free", "clear_port", "ours"];');
    expect(live.match(/^  \{ name: "/gm)).toHaveLength(5);
    for (const name of ["ours names a foreign listener's", "a foreign listener survives free() and clear_port", "our own leftover is stopped", "our own leftover that won't stop", "a Playwright or MCP process is never stopped"]) expect(live).toContain(`{ name: "${name}`);
    expect(live).toContain('if (process.platform !== "darwin" || !lsof) {');
    expect(live).toContain("return 1;");
    expect(live).not.toMatch(/\bskip\w*\(|console\.log\([^\n]*\bskip/i); // no skip call, and no line it prints says skipped
  });
});

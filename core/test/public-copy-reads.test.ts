import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inPublicCopy, privateText } from "./public-copy.ts";

// T's Nov 9 dry run (Fri Nov 6): a stranger's pnpm check went red in the public copy because lessons-placement.test.ts
// read docs/guild/LESSONS.md at describe time, and the copy leaves that file out. A test that reads a path the copy leaves
// out checks that it's there first (existsSync) and uses a stand-in when it isn't, as brief.test.ts does for the inbox.
// It never skips (no-skip.test.ts). This runs in the private tree, where every file is present, so it fails before the copy does.
// Read by read, not file by file (Lead-12, Fri Nov 6): one existsSync in a file used to pass the whole file, so a guarded read
// could hide a bare one. Each read of a left-out path now goes through privateText (public-copy.ts) on its own line. A path held
// in a constant (brief.ts's BRIEF_SOURCE) is out of a line scan's sight; T's clean-clone run of the copy is the check for those.
const READ = /\b(?:readFileSync|readdirSync|statSync|existsSync|createReadStream|new URL|join|resolve)\s*\(/;
const LIT = /["'`](?:\.\.\/)*((?:docs|spikes|\.claude|CLAUDE\.md|PROFILE\.md)(?:\/[^"'`$\s]*)?)["'`]/g;
const DIRS = ["../../core/test/", "../../trust/test/"];
const SELF = "public-copy-reads.test.ts";

/** Each line that reads a path the public copy leaves out other than through privateText. */
export function bareReads(name: string, text: string): string[] {
  return text.split("\n").flatMap((l, i) => (!READ.test(l) || /^\s*(\/\/|\*|\/\*)/.test(l) || l.includes("privateText(") ? [] : [...l.matchAll(LIT)].filter((m) => !inPublicCopy(m[1]!)).map((m) => `${name}:${i + 1} ${m[1]}`)));
}

describe("a test that reads a file the public copy leaves out still passes there", () => {
  it("every test file in core and trust", () => {
    let read = 0;
    const found = DIRS.flatMap((d) => {
      const dir = new URL(d, import.meta.url);
      return (readdirSync(dir, { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f) && !f.endsWith(SELF)).flatMap((f) => {
        read++;
        return bareReads(`${d}${f}`, readFileSync(new URL(f, dir), "utf8"));
      });
    });
    expect(found).toEqual([]);
    expect(read).toBeGreaterThan(190);
  });

  it("knows what the copy keeps: LESSONS and the inbox are out; the ratchet files, the board stub and claims are in", () => {
    for (const out of ["docs/guild/LESSONS.md", "docs/inbox", "docs/QUEUE.md", "PROFILE.md", "CLAUDE.md", "docs/adr/0001.md"]) expect(inPublicCopy(out), out).toBe(false);
    for (const kept of ["docs/guild/ratchet.json", "docs/guild/board.md", "docs/claims.md", "docs/launch/faq.md", "docs/guild/", "../../docs/fixtures/tape-seed-1.json"]) expect(inPublicCopy(kept), kept).toBe(true);
  });

  it("privateText refuses a path the copy keeps, and hands back the stand-in for one that's absent", () => {
    expect(() => privateText("docs/claims.md", () => "")).toThrow("is in the public copy");
    expect(privateText("docs/inbox/no-such-file.md", () => "stand-in")).toEqual({ here: false, text: "stand-in" });
  });

  it("catches the read that broke the copy, and not a guarded one, a kept path or a comment", () => {
    const bad = 'const FILE = new URL("../../docs/guild/LESSONS.md", import.meta.url);';
    expect(bareReads("x", bad)).toEqual(["x:1 docs/guild/LESSONS.md"]);
    expect(bareReads("x", 'readFileSync(join(root, "docs/inbox/a.md"))')).toHaveLength(1);
    expect(bareReads("x", 'const { text } = privateText("docs/guild/LESSONS.md", () => STAND_IN);')).toEqual([]);
    // One guarded read no longer passes the file: the bare one beside it is still caught (the hole Lead-12 named).
    expect(bareReads("x", `const ok = existsSync(A) ? readFileSync(A, "utf8") : "";\n${bad}`)).toEqual(["x:2 docs/guild/LESSONS.md"]);
    expect(bareReads("x", 'readFileSync(new URL("../../docs/claims.md", import.meta.url))')).toEqual([]);
    expect(bareReads("x", '// reads "docs/guild/LESSONS.md" via new URL(')).toEqual([]);
  });
});

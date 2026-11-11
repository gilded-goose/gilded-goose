import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Push 10's GitHub check went red: ci-local-ports.test.ts had 5 cases behind skipIf(!realListeners), which ran on
// ci-local's macOS and skipped on GitHub's ubuntu, and the ratchet allows 0 skipped (Lead-12, Fri Nov 6, run 42216561756).
// No test in core or trust skips, or makes others skip (.only): a check that needs macOS is a ci-local step, as
// scripts/ci-local-ports-live.ts and tour-pill are. ci-local runs on macOS, so this catches a skip before GitHub does.
// Nor does one open with `if (…) return`: heavy-lock.test.ts's 9 `if (!hasLockf) return;` passed on ubuntu proving nothing,
// a skip the ratchet can't see (Lead-12, Fri Nov 6). They are scripts/heavy-lock-live.ts now.
const SKIP = /\.(?:skip|skipIf|runIf|todo|only)\s*\(/;
/** A test's opening line, then a return on its first line: an empty pass. */
const OPEN = /\b(?:it|test)(?:\.\w+)*\(.*=>\s*\{\s*$/;
const EARLY = /^\s*if\s*\(.*\)\s*return\b/;
const DIRS = ["../../core/test/", "../../trust/test/"];
/** This file holds the bad forms as examples, so it reads every file but itself. */
const SELF = "no-skip.test.ts";

export function skips(name: string, text: string): string[] {
  const lines = text.split("\n");
  return lines.flatMap((l, i) => (SKIP.test(l) || (EARLY.test(l) && i > 0 && OPEN.test(lines[i - 1]!)) ? [`${name}:${i + 1}`] : []));
}

describe("no test skips or passes empty, so GitHub's ratchet sees 0 skipped and every pass ran", () => {
  it("every test file in core and trust, subfolders included", () => {
    let read = 0;
    const found = DIRS.flatMap((d) => {
      const dir = new URL(d, import.meta.url);
      return (readdirSync(dir, { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f) && !f.endsWith(SELF)).flatMap((f) => {
        read++;
        return skips(`${d}${f}`, readFileSync(new URL(f, dir), "utf8"));
      });
    });
    expect(found).toEqual([]);
    expect(read).toBeGreaterThan(190); // it read the folders, so an empty list means something
  });

  it("catches push 10's form and its cousins, and not a word in a comment or a skipped seller", () => {
    for (const bad of ["it.skipIf(!realListeners)(\"x\", () => {})", "describe.skip(\"x\", () => {})", "test.todo(\"x\")", "it.only(\"x\", f)", "it.runIf(isMac)(\"x\", f)", "ctx.skip()", "describe.skipIf (x)(\"y\", f)"]) {
      expect(skips("x", bad), bad).toHaveLength(1);
    }
    for (const ok of ["// the 5 cases skipped on ubuntu", 'expect(row.kind).toBe("skipped")', "const skipped = rows.filter(isSkip);", "seller.skipReason"]) {
      expect(skips("x", ok), ok).toEqual([]);
    }
  });

  it("catches heavy-lock's empty pass at a test's top, and not a return further in or outside a test", () => {
    expect(skips("x", 'it("waits", async () => {\n    if (!hasLockf) return;\n    hold();\n});')).toEqual(["x:2"]);
    expect(skips("x", 'test("x", () => {\n  if (process.platform !== "darwin") return;\n});')).toEqual(["x:2"]);
    expect(skips("x", '  it("x", () => {\n    const r = run();\n    if (!r) return;\n  });')).toEqual([]);
    expect(skips("x", "const pick = (x?: string) => {\n  if (!x) return \"\";\n};")).toEqual([]);
  });
});

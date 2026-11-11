// The rehearsal's licence date (R's clock sweep and Lead-12, Fri Nov 6). ci-local built the rehearsal with a fixed
// "20 December 2026", so from 4 PM PT on Dec 19 its gate shut and every Studio walk went red on the calendar alone: a hotfix in
// the judging weeks blocked under "nothing deploys on a red check". ci-local now builds the date from today + 30 days. This runs
// ci-local's own line in a shell, so the date it checks is the date the build gets, and holds it more than 7 days out.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { licenceEnds } from "../src/view/studio-gate.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const ci = read("scripts/ci-local.sh");
const DAY = 86_400_000;
const line = /^STUDIO_EXPIRY=\$\(node -e .*\)$/m.exec(ci)?.[0];

describe("ci-local builds the rehearsal's licence from today, not a fixed date", () => {
  it("one line sets it, the build and the served-page check both read it, and no fixed date is left on a command line", () => {
    expect(line).toBeTruthy();
    expect(ci).toMatch(/^GOOSE_FLIP_REHEARSAL=1 VITE_WALLET=1 GOOSE_STUDIO_EXPIRY="\$STUDIO_EXPIRY" corepack/m);
    expect(ci.match(/expiry:\\"\$STUDIO_EXPIRY\\"/g)?.length).toBe(2); // flip-dist: on disk, then as served
    expect(ci.split("\n").filter((l) => !l.trimStart().startsWith("#")).join("\n")).not.toMatch(/\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}/);
  });

  it("the date that line builds is more than 7 days after today, in the words AG prints and the gate reads", () => {
    const out = execSync(`${line}; printf %s "$STUDIO_EXPIRY"`, { shell: "/bin/sh", encoding: "utf8", env: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}` } });
    expect(out).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4}$/); // keys-landed's and AG's shape
    const ends = licenceEnds(out);
    expect(ends, out).not.toBeNull();
    expect(ends! - Date.now(), out).toBeGreaterThan(7 * DAY);
  });

  it("the mutant: the old fixed date fails this bound a week before it shut the gate", () => {
    const ends = licenceEnds("20 December 2026")!;
    expect(ends - Date.UTC(2026, 11, 13, 12)).toBeLessThanOrEqual(7 * DAY);
  });

  it("licence-expiry-walk keeps its own fixed clock: the cut-over is what it walks", () => {
    expect(read("scripts/licence-expiry-walk.ts")).toContain("const ENDS = Date.UTC(2026, 11, 20);");
  });
});

// The rehearsal-bytes hard check (Lead-12, Nov 5): a tree that fit its lines keyless was 569 B over on the rehearsal build,
// which routes as the keyed live build does, and ci-local passed it. ci-local now builds the rehearsal and holds every route
// to its line less the licence's own bytes. The step reads web/dist, which this suite runs before, so these read the source:
// the step exists, fails the run, is the one rehearsal build and comes last (after every keyless walk and pages-smoke's own
// build), and --keyed only tightens. The behaviour was proven by hand (the commit's message): plain 3 B of room passes, keyed fails.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("rehearsal_bytes_fail_local_ci", () => {
  const ci = read("scripts/ci-local.sh");
  const at = ci.indexOf('echo "== rehearsal: the build live ships"');
  const step = ci.slice(at);

  it("ci-local builds what live ships (Render's flags plus the rehearsal) and fails on a route over its keyed line", () => {
    expect(at).toBeGreaterThan(0);
    expect(step).toMatch(/^GOOSE_FLIP_REHEARSAL=1 VITE_WALLET=1 GOOSE_STUDIO_EXPIRY="[^"]+" corepack pnpm --filter @goose\/web build > rehearsal-build\.log 2>&1 \|\| \{[^}]*fail rehearsal-build; \}$/m);
    expect(step).toMatch(/^node scripts\/bundle-read\.ts --keyed > rehearsal\.log 2>&1 \|\| \{[^}]*fail rehearsal-bytes; \}$/m);
  });

  it("it is the one rehearsal build, last: every keyless walk and pages-smoke's own build come before it", () => {
    for (const walk of ["approve-check", "tour-pill", "axe-routes.ts", "live-walks.ts", "desk-walk.ts", 'echo "== pages-smoke"']) expect(ci.lastIndexOf(walk), walk).toBeLessThan(at);
    // One build: a walk that reads the rehearsal (T's Studio gate) follows on this web/dist and never builds again.
    expect(ci.match(/^GOOSE_FLIP_REHEARSAL=1 /gm)?.length).toBe(1); // command lines only, not this comment's words
    expect(step.match(/--filter @goose\/web build/g)?.length).toBe(1);
    // Its bytes are read before anything walks it.
    const walks = step.search(/node src\/main\.ts|node scripts\/(?!bundle-read)/);
    if (walks !== -1) expect(step.indexOf("bundle-read.ts --keyed")).toBeLessThan(walks);
  });

  it("--keyed holds each route to its line less the licence's bytes, and moves no line", () => {
    const br = read("scripts/bundle-read.ts");
    expect(br).toMatch(/^const KEYED_EXTRA = 6;$/m); // Track F, Nov 5: keyed live reads exactly 6 B above rehearsal
    expect(br).toMatch(/const line = limit \+ file\.bundleToleranceBytes - \(keyed \? KEYED_EXTRA : 0\);/);
    expect(br).toMatch(/process\.exit\(over \? 1 : 0\);/);
    expect(br).not.toMatch(/writeFileSync/); // a reader: ratchet.json is never written from here
  });
});

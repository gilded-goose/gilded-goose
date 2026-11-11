import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { closedMidRoute } from "../../scripts/route-closed.ts";

// LOCAL-CI f8e9164b (Nov 5): desk-walk died on "apiResponse.json: Response has been disposed", a /api/health route still
// fetching when its page closed. scripts/route-closed.ts lets exactly that end quietly; everything else still fails the walk.
const SCRIPTS = join(import.meta.dirname, "..", "..", "scripts");
const GUARD = join(SCRIPTS, "route-closed.ts");

/** A node child that imports the guard (or not) and leaves one rejection unhandled; its exit code. */
function child(message: string, guard = true): number {
  const dir = mkdtempSync(join(tmpdir(), "goose-route-closed-"));
  const file = join(dir, "walk.ts");
  writeFileSync(file, `${guard ? `import ${JSON.stringify(GUARD)};\n` : ""}Promise.reject(new Error(${JSON.stringify(message)}));\nsetTimeout(() => {}, 50);\n`);
  return spawnSync(process.execPath, [file], { encoding: "utf8" }).status ?? -1;
}

describe("a walk's route that loses its page ends quietly; nothing else does", () => {
  it("names only a route's own call on a page that's gone", () => {
    expect(closedMidRoute(new Error("apiResponse.json: Response has been disposed"))).toBe(true); // the one LOCAL-CI hit
    expect(closedMidRoute(new Error("apiResponse.text: Response has been disposed"))).toBe(true);
    expect(closedMidRoute(new Error("route.fulfill: Target page, context or browser has been closed"))).toBe(true);
    expect(closedMidRoute(new Error("route.continue: Target page, context or browser has been closed"))).toBe(true);
    // Not a route's call, or not a closed page: a real failure.
    expect(closedMidRoute(new Error("page.goto: Target page, context or browser has been closed"))).toBe(false);
    expect(closedMidRoute(new Error("locator.click: Response has been disposed"))).toBe(false);
    expect(closedMidRoute(new Error("route.fulfill: Cannot fulfill with redirect status"))).toBe(false);
    expect(closedMidRoute(new Error("the price-swap button has no practice-site line"))).toBe(false);
    expect(closedMidRoute("apiResponse.json: Response has been disposed")).toBe(false); // a bare string isn't Playwright's
  });

  it("a process with the guard lives through the disposed answer, and still dies on any other", () => {
    expect(child("apiResponse.json: Response has been disposed")).toBe(0);
    expect(child("page.goto: Target page, context or browser has been closed")).not.toBe(0);
    expect(child("desk: a real failure")).not.toBe(0);
    // Control: without the guard, the disposed answer kills the walk, as it did on f8e9164b.
    expect(child("apiResponse.json: Response has been disposed", false)).not.toBe(0);
  });

  it("every script with a route that fetches the real answer imports the guard", () => {
    const fetching = readdirSync(SCRIPTS).filter((f) => f.endsWith(".ts") && f !== "route-closed.ts" && /\b(r|route)\.fetch\(\)/.test(readFileSync(join(SCRIPTS, f), "utf8")));
    expect(fetching.length).toBeGreaterThanOrEqual(4); // control: the sweep finds the walks it was written for
    for (const f of fetching) expect(readFileSync(join(SCRIPTS, f), "utf8"), f).toMatch(/^import "\.\/route-closed\.ts";/m);
  });
});

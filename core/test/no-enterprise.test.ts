// No AG Grid or AG Charts Enterprise of our own, anywhere (Joshua, Nov 5 2:36 AM: "NO AG GRID ENTERPRISE, FINAL"). AG's Studio licence
// covers Studio and its built-in widgets only: every custom widget, and every grid or chart outside Studio, is Community.
// AG Studio's own package brings its Enterprise code with it, inside its own chunks; that's the one place it may be.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ENTERPRISE = /(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)["']ag-(?:grid|charts)-enterprise[^"']*["']/;
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  if (f === "node_modules" || f === "dist") return [];
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|jsx?|mjs|cjs)$/.test(f) ? [p] : [];
});

describe("no AG Enterprise of our own", () => {
  it("no source imports it", () => {
    const hits = ["web", "core", "server", "scripts"].flatMap((d) => walk(join(ROOT, d))).filter((f) => !f.endsWith("no-enterprise.test.ts") && ENTERPRISE.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
  it("the check itself catches each way of importing it", () => {
    for (const line of [`import { X } from "ag-grid-enterprise";`, `import "ag-charts-enterprise";`, `const m = import("ag-grid-enterprise");`]) expect(ENTERPRISE.test(line), line).toBe(true);
    expect(ENTERPRISE.test(`import { X } from "ag-grid-community";`)).toBe(false);
  });
  it("no package of ours depends on it", () => {
    for (const p of ["package.json", "web/package.json", "core/package.json", "server/package.json"]) {
      const j = JSON.parse(readFileSync(join(ROOT, p), "utf8")) as Record<string, Record<string, string> | undefined>;
      for (const deps of [j.dependencies, j.devDependencies]) expect(Object.keys(deps ?? {}).filter((d) => /^ag-(grid|charts)-enterprise/.test(d)), p).toEqual([]);
    }
  });
  it("no build reads a Grid key", () => {
    expect(readFileSync(join(ROOT, "web/vite.config.ts"), "utf8")).not.toContain("VITE_AG_GRID_LICENSE");
    expect(readFileSync(join(ROOT, "render.yaml"), "utf8")).not.toContain("VITE_AG_GRID_LICENSE");
  });
});

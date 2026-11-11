// THE PING's bytes (Joshua, Nov 5 6:40 PM: "within bundle limits"; Track F owns the ping's bundle check). The notification
// and the real watcher are their own chunks: no page's first load may carry them, because most visitors never set a price.
// Static imports from the page's entry are what land in a first load (dynamic `import()` makes a chunk of its own), so this
// walks them from web/src/main.tsx the way the route-weight pins do. The bytes themselves are bundle-read's lines.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const text = (p: string) => readFileSync(join(ROOT, p), "utf8");
const exists = (p: string) => existsSync(join(ROOT, p)) && statSync(join(ROOT, p)).isFile();

/** Every web module a file loads up front: static value imports, relative and `@goose/core/*`, followed. */
function reach(start: string): Set<string> {
  const core = JSON.parse(text("core/package.json")) as { exports: Record<string, string> };
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const m of text(file).matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/gm)) {
      const spec = m[1]!;
      const next = spec.startsWith(".") ? join(dirname(file), spec) : spec.startsWith("@goose/core/") ? join("core", core.exports[`./${spec.slice(12)}`] ?? "") : null;
      if (next && exists(next)) walk(next);
    }
  };
  walk(start);
  return seen;
}

const files = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []));

const PING = ["web/src/desk/ping-notify.ts", "web/src/desk/real-watcher.ts", "core/src/ask/real-ping.ts"];

describe("the ping costs no page its first load", () => {
  it("no route's first load reaches the ping's files: the entry, and each route's own page file", () => {
    // A route's first load is the entry plus the page file it fetches at once: every `import("./…")` in main.tsx (the
    // Desk, the classic page, the wallet, the ledger's pick, the menu…) and every `src` the head fetches (prerender-routes.ts).
    const pages = [
      ...[...text("web/src/main.tsx").matchAll(/import\("\.\/([^"]+)"\)/g)].map((m) => `web/src/${m[1]}`),
      ...[...text("web/prerender-routes.ts").matchAll(/src: "\/(src\/[^"]+)"/g)].map((m) => `web/${m[1]}`),
    ].filter((f, i, all) => all.indexOf(f) === i && exists(f));
    expect(pages).toContain("web/src/desk/Desk.tsx");
    expect(pages.length).toBeGreaterThan(12);
    expect(reach("web/src/desk/Desk.tsx").size).toBeGreaterThan(20); // the walk really follows imports
    for (const start of ["web/src/main.tsx", ...pages]) {
      const first = reach(start);
      expect(PING.filter((f) => first.has(f)), start).toEqual([]);
    }
  });

  it("the real watcher is only ever loaded on demand, never imported up front", () => {
    const up = files("web/src").filter((f) => /^\s*import\s+(?!type\b)[^;]*["']\.{1,2}\/[^"']*real-watcher(\.ts)?["']/m.test(text(f)));
    expect(up).toEqual([]);
    expect(files("web/src").some((f) => /import\(\s*["'][^"']*real-watcher\.ts["']\s*\)/.test(text(f)))).toBe(true);
  });

  it("a tap waits for the room's heading the Desk really focuses, so her row keeps the focus", () => {
    const head = /export const ROOM_HEAD = "([^"]+)"/.exec(text("web/src/desk/real-watcher.ts"))?.[1];
    expect(head).toBeTruthy();
    expect(text("web/src/desk/Desk.tsx")).toContain(`"${head}"`);
  });
});

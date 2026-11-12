// The class sweep after S1-13's appHref (Lead-10, stack 119): an app address written raw ("?desk=proof") resolves against
// the page it sits on, so on /safe.html, the 404 or a sub-path it reloads that page. Every renderer in web/src roots it
// through web/src/menu/href.ts `appHref`. This finds the ones that don't, by reading the source: used by
// core/test/app-href.test.ts, and runnable on any tree (`node core/test/raw-href.ts <web/src dir>`), so the test's red
// on an older commit can be shown.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Files allowed to keep raw app addresses for now, each with its reason. */
export const ALLOW: Record<string, string> = {}; // empty since stack 122 (DK 47d1bd17 converted Desk.tsx); an entry needs a reason

const STRIP_APPHREF = /appHref\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/g; // appHref(...), two levels of parens inside

/** The raw app addresses in one file's source: `href="?…"`, `xHref="?…"`, and any `href={…}` / `xHref={…}` whose
 *  expression, with every appHref(…) taken out, still holds a "?…" literal, a `…Href(…)` helper's result, or a single
 *  letter's `.href` (a data item's address); and a `…Href = (…) => "?…"` helper that returns one raw. */
export function rawIn(src: string): string[] {
  const hits: string[] = [];
  const lines = src.split("\n");
  // A helper this file defines as `xHref = (…) => appHref(…)` is rooted: calls to it are fine.
  const rooted = new Set([...src.matchAll(/\b(\w*Href)\s*=\s*\([^)]*\)\s*(?::\s*string\s*)?=>\s*appHref\(/g)].map((m) => m[1]!));
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/\b([a-zA-Z]*[hH]ref)=(?:"([^"]*)"|\{)/g)) {
      if (m[2] !== undefined) { if (m[2].startsWith("?")) hits.push(`${i + 1}: ${m[0]}`); continue; }
      // The braced expression, to its matching close (on this line: every href in web/src fits one).
      let depth = 1, j = m.index! + m[0].length;
      for (; j < line.length && depth > 0; j++) depth += line[j] === "{" ? 1 : line[j] === "}" ? -1 : 0;
      const expr = line.slice(m.index! + m[0].length, j - 1), rest = expr.replace(STRIP_APPHREF, "");
      const helper = [...rest.matchAll(/\b(\w*Href)\(/g)].some((c) => !rooted.has(c[1]!));
      if (/["'`]\?/.test(rest) || helper ||/^[a-z]\.href$/.test(rest.trim())) hits.push(`${i + 1}: ${m[1]}={${expr}}`);
    }
    if (/\b\w*Href\s*=\s*\([^)]*\)\s*(?::\s*string\s*)?=>\s*["'`]\?/.test(line)) hits.push(`${i + 1}: ${line.trim()}`);
  });
  return hits;
}

/** Every raw app address in a web/src tree, as "file:line: …", outside href.ts, tests and ALLOW. */
export function rawHrefs(srcDir: string, allow: Record<string, string> = ALLOW): string[] {
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
  return walk(srcDir).flatMap((p) => {
    const f = relative(srcDir, p);
    if (f === "menu/href.ts" || f in allow) return [];
    return rawIn(readFileSync(p, "utf8")).map((h) => `${f}:${h}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const hits = rawHrefs(process.argv[2] ?? "web/src");
  console.log(hits.join("\n") || "none");
  console.log(`${hits.length} raw app address(es)`);
}

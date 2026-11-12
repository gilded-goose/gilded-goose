// The site's 4px rule (plan, Global Constraints: Spacing). Every margin, padding, gap, inset, offset and fixed size in
// web/src/site/**/*.css is a token (var(--s*) or any var()) or a px value that is a multiple of 4. Allowed besides: 0,
// a 1px hairline (or -1px), and 2px inside a rule block marked /* control */. Type (line-height, letter-spacing),
// borders, outlines, radii, shadows and custom properties are not spacing and are not read.
// Exits 1 and prints file:line for each break. `node scripts/check-site-spacing.ts`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SITE = join(ROOT, "web", "src", "site");
const SPACING = /^(?:-webkit-)?(?:margin|padding|gap|row-gap|column-gap|inset|top|right|bottom|left|width|height|min-width|max-width|min-height|max-height|scroll-padding|scroll-margin|block-size|inline-size|min-block-size|min-inline-size|max-block-size|max-inline-size)(?:-(?:top|right|bottom|left|block|inline|start|end|block-start|block-end|inline-start|inline-end))*$/;

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith(".css") ? [p] : [];
  });
}

/** One finding per bad px value: `file:line  prop: value  (Npx)`. */
export function spacingFaults(file: string, text: string): string[] {
  const out: string[] = [];
  const lines = text.split(/\r?\n/);
  // A rule block is "control" when its own lines carry the marker; track blocks by brace depth.
  const blockStart: number[] = [];
  const controlBlocks = new Set<number>();
  const blockOf: number[] = [];
  let depth = 0;
  lines.forEach((line, i) => {
    blockOf[i] = blockStart[depth - 1] ?? -1;
    if (/\/\*\s*control\s*\*\//.test(line)) controlBlocks.add(blockOf[i]!);
    for (const ch of line.replace(/\/\*.*?\*\//g, "")) {
      if (ch === "{") { blockStart[depth] = i; depth++; }
      else if (ch === "}") depth = Math.max(0, depth - 1);
    }
  });
  lines.forEach((raw, i) => {
    const line = raw.replace(/\/\*.*?\*\//g, "");
    for (const m of line.matchAll(/(?:^|[;{\s])([a-z-]+)\s*:\s*([^;{}]+)/g)) {
      const prop = m[1]!, value = m[2]!;
      if (prop.startsWith("--") || !SPACING.test(prop)) continue;
      for (const px of value.matchAll(/(-?\d*\.?\d+)px/g)) {
        const n = Math.abs(Number(px[1]));
        if (n === 0 || n === 1 || n % 4 === 0) continue;
        if (n === 2 && controlBlocks.has(blockOf[i]!)) continue;
        out.push(`${file}:${i + 1}  ${prop}: ${value.trim()}  (${px[1]}px)`);
      }
    }
  });
  return out;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const files = cssFiles(SITE);
  const faults = files.flatMap((f) => spacingFaults(relative(ROOT, f).replace(/\\/g, "/"), readFileSync(f, "utf8")));
  if (faults.length) {
    console.error(`check-site-spacing FAIL: ${faults.length} value(s) off the 4px scale:`);
    for (const f of faults) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`check-site-spacing ok: ${files.length} stylesheet(s) in web/src/site on the 4px scale`);
}

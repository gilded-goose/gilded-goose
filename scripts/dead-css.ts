// Declarations that can never apply: a later rule in the same file, under the same at-rule conditions, with the same
// selector, sets the same property, so the earlier one always loses (equal specificity, later wins). Removing one
// changes nothing on screen, only bytes. A declaration in a selector list is dead only when every selector in the list
// is set again later. Conservative on purpose (T, Nov 5, finding room on Desk): it skips a rule's own repeats (often a
// fallback pair), anything !important, nested rules, keyframes, and a later value that a browser might drop as unknown.
//   node scripts/dead-css.ts web/src/desk/desk.css ...    (no files: every CSS file under web/src)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export type Dead = { file: string; line: number; selector: string; prop: string; at: string };

// A later value with one of these may be dropped by a browser that doesn't know it, and then the earlier one applies.
const MODERN = /(?:\d|\b)(?:dvh|svh|lvh|dvw|svw|lvw|cqi|cqw|cqh|cqb)\b|color-mix\(|oklch\(|oklab\(|\blab\(|\blch\(|light-dark\(|round\(|anchor|text-wrap|@supports/;

const norm = (s: string) => s.replace(/\s+/g, " ").replace(/\s*([>+~,])\s*/g, "$1").trim();

/** Split on `sep` at depth 0, outside strings and parentheses. */
function split(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0, quote = "", from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quote) { if (c === "\\") i++; else if (c === quote) quote = ""; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === sep && depth === 0) { out.push(text.slice(from, i)); from = i + 1; }
  }
  out.push(text.slice(from));
  return out;
}

type Rule = { at: string; selectors: string[]; decls: { prop: string; value: string; line: number }[]; index: number };

/** Every plain style rule with the chain of at-rules it sits in. Comments become spaces, so line numbers hold. */
export function rules(css: string): Rule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const lineAt = (i: number) => text.slice(0, i).split("\n").length;
  const out: Rule[] = [];
  const walk = (from: number, to: number, at: string, skip: boolean) => {
    let i = from, head = from, quote = "";
    while (i < to) {
      const c = text[i]!;
      if (quote) { if (c === "\\") i++; else if (c === quote) quote = ""; i++; continue; }
      if (c === '"' || c === "'") { quote = c; i++; continue; }
      if (c === ";") { head = i + 1; i++; continue; } // a statement at-rule (@import, @charset)
      if (c === "{") {
        let depth = 1, j = i + 1, q = "";
        for (; j < to && depth; j++) {
          const d = text[j]!;
          if (q) { if (d === "\\") j++; else if (d === q) q = ""; continue; }
          if (d === '"' || d === "'") q = d; else if (d === "{") depth++; else if (d === "}") depth--;
        }
        const prelude = text.slice(head, i).trim(), body = [i + 1, j - 1] as const;
        if (prelude.startsWith("@")) {
          const name = prelude.slice(1).split(/[\s(]/)[0]!;
          // keyframes and font faces are lists of their own, not the cascade's
          const own = /keyframes$|^font-face$|^page$|^property$|^counter-style$/.test(name);
          walk(body[0], body[1], `${at}${norm(prelude)}|`, skip || own);
        } else if (!skip) {
          const inner = text.slice(body[0], body[1]);
          if (inner.includes("{")) walk(body[0], body[1], `${at}${norm(prelude)}>`, true); // nesting: never compared
          else {
            let offset = body[0];
            const decls = split(inner, ";").map((d) => {
              const start = offset; offset += d.length + 1;
              const k = d.indexOf(":");
              if (k < 0) return null;
              const lead = d.length - d.trimStart().length;
              return { prop: d.slice(0, k).trim().toLowerCase(), value: d.slice(k + 1).trim(), line: lineAt(start + lead) };
            }).filter((d): d is NonNullable<typeof d> => !!d && !!d.prop);
            out.push({ at, selectors: split(prelude, ",").map(norm), decls, index: out.length });
          }
        }
        i = j; head = j;
        continue;
      }
      i++;
    }
  };
  walk(0, text.length, "", false);
  return out;
}

export function deadIn(css: string, file = "css"): Dead[] {
  const all = rules(css);
  const dead: Dead[] = [];
  for (const r of all) {
    for (const d of r.decls) {
      if (/!important/.test(d.value)) continue;
      const later = r.selectors.map((s) => all.find((o) => o.index > r.index && o.at === r.at && o.selectors.includes(s)
        && o.decls.some((x) => x.prop === d.prop && !MODERN.test(x.value))));
      if (later.every(Boolean)) dead.push({ file, line: d.line, selector: r.selectors.join(","), prop: d.prop, at: r.at });
    }
  }
  return dead;
}

const cssFiles = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? cssFiles(p) : n.endsWith(".css") ? [p] : [];
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = new URL("..", import.meta.url).pathname;
  const files = process.argv.length > 2 ? process.argv.slice(2) : cssFiles(join(root, "web/src"));
  let n = 0;
  for (const f of files) for (const d of deadIn(readFileSync(f, "utf8"), relative(root, f))) {
    n++;
    console.log(`${d.file}:${d.line}  ${d.prop}  ${d.selector}${d.at ? `  (${d.at.replace(/\|$/, "")})` : ""}`);
  }
  console.log(n ? `dead-css: ${n} declarations a later rule always overrides` : "dead-css: none");
}

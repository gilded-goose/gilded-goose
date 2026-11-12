import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KEPT } from "./public-copy.ts";

// Round 6b's B2B seat (Fri Nov 6, on live 69624fd4): the builders' ten lines called `guard.decide(want, cart)` with no
// seller evidence, so a store that copied them got the limits and the tap but never the Watcher on the seller's note,
// while the page beside them said the Watcher reads the seller's words. A SYSTEM gift-card note came back `ask`. The class
// rule: every code sample on a public page is a file in trust/examples/, shown byte for byte, and a test imports that
// file and calls what it exports, so a sample can't drift from what its card says. Shell blocks (```bash, ```sh) are
// commands, not code that calls the library, and stay outside this rule (decided by default; Lead-12's round 6b fix).
const ROOT = new URL("../../", import.meta.url);
const read = (rel: string) => readFileSync(new URL(rel, ROOT), "utf8");
const CODE = /^```(ts|tsx|js|jsx|typescript|javascript|mjs)\n([\s\S]*?)^```/gm;
const SKIP = new Set(["node_modules", "dist", ".git", "test-results", "playwright-report"]);

/** Every markdown file the public copy keeps, by its path from the repo root. */
function publicMarkdown(): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    const url = new URL(rel, ROOT);
    if (!existsSync(url)) return;
    if (statSync(url).isFile()) { if (rel.endsWith(".md")) out.push(rel); return; }
    for (const name of readdirSync(url)) if (!SKIP.has(name)) walk(`${rel.replace(/\/$/, "")}/${name}`);
  };
  for (const k of KEPT) walk(k);
  return out;
}

const EXAMPLES = readdirSync(new URL("trust/examples/", ROOT)).filter((f) => f.endsWith(".ts")).map((f) => `trust/examples/${f}`);

/** Each code block in `text` that isn't an examples file byte for byte, named by its first line. */
export function retyped(name: string, text: string, files: Readonly<Record<string, string>>): string[] {
  const bodies = new Set(Object.values(files));
  return [...text.matchAll(CODE)].filter((m) => !bodies.has(m[2]!)).map((m) => `${name}: \`\`\`${m[1]} ${m[2]!.split("\n")[0]}`);
}

/** The examples files `text` shows: a markdown block equal to one, or a page's `?raw` import of one. */
export function shown(text: string, files: Readonly<Record<string, string>>): string[] {
  const bodies = [...text.matchAll(CODE)].map((m) => m[2]!);
  const raw = [...text.matchAll(/from "(?:\.\.\/)+(trust\/examples\/[\w-]+\.ts)\?raw"/g)].map((m) => m[1]!);
  return Object.entries(files).filter(([f, body]) => bodies.includes(body) || raw.includes(f)).map(([f]) => f);
}

describe("every code sample on a public page is a file that a test runs", () => {
  const files = Object.fromEntries(EXAMPLES.map((f) => [f, read(f)]));
  const tests = readdirSync(new URL("trust/test/", ROOT)).filter((f) => f.endsWith(".ts")).map((f) => read(`trust/test/${f}`));

  it("no public markdown carries a code block that isn't an examples file byte for byte", () => {
    const md = publicMarkdown();
    expect(md).toContain("trust/README.md");
    expect(md.length).toBeGreaterThan(20);
    expect(md.flatMap((f) => retyped(f, read(f), files))).toEqual([]);
  });

  it("the site draws code only from the examples files, through Builders.tsx's one <pre>", () => {
    const page = read("web/src/builders/Builders.tsx");
    expect(page.match(/<pre\b/g)).toHaveLength(1);
    for (const m of page.matchAll(/<Code file="([^"]+)" text=\{(\w+)\} \/>/g)) {
      expect(page, m[1]).toContain(`import ${m[2]} from "../../../${m[1]}?raw"`);
      expect(EXAMPLES, m[1]).toContain(m[1]);
    }
    expect([...page.matchAll(/<Code /g)].length).toBe([...page.matchAll(/<Code file="[^"]+" text=\{\w+\} \/>/g)].length);
  });

  it("each file a public page shows is imported by a trust test that calls what it exports", () => {
    const pages = [...publicMarkdown().map(read), read("web/src/builders/Builders.tsx")];
    const onPages = [...new Set(pages.flatMap((t) => shown(t, files)))].sort();
    expect(onPages).toEqual(["trust/examples/read-seller.ts", "trust/examples/ten-lines.ts"]);
    for (const f of onPages) {
      const base = f.replace("trust/", "../");
      const exported = [...files[f]!.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]!);
      expect(exported.length, f).toBeGreaterThan(0);
      const runner = tests.find((t) => t.includes(`from "${base}"`));
      expect(runner, `${f} is shown but no trust test imports it`).toBeDefined();
      for (const name of exported) expect(runner!, `${f}'s ${name}`).toMatch(new RegExp(`\\b${name}\\(`));
    }
  });

  it("the ten lines are still ten code lines, so the name stays true", () => {
    const code = files["trust/examples/ten-lines.ts"]!.split("\n").filter((l) => l.trim() !== "" && !l.trim().startsWith("//"));
    expect(code).toHaveLength(10);
  });

  it("catches a retyped block and the sample that started it, and passes the file itself", () => {
    const file = files["trust/examples/ten-lines.ts"]!;
    expect(retyped("x", `\`\`\`ts\n${file}\`\`\``, files)).toEqual([]);
    // The round 6b sample: the old decide call, retyped beside the file.
    const old = file.replace(/guard\.decide\(want, cart, .*\);/, "guard.decide(want, cart);");
    expect(old).not.toBe(file);
    expect(retyped("x", `\`\`\`ts\n${old}\`\`\``, files)).toHaveLength(1);
    expect(retyped("x", "```bash\npnpm check\n```", files)).toEqual([]);
    expect(shown('import a from "../../../trust/examples/read-seller.ts?raw";', files)).toEqual(["trust/examples/read-seller.ts"]);
  });
});

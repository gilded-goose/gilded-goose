import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KEPT } from "./public-copy.ts";

// Words that never go public (Lead-12, Fri Nov 6): a private plan's name sat in docs/guild/board.md, and nothing read the
// public copy for it. This walks exactly what public-copy.ts keeps, so a path added to the keep list later is read too, and
// .env.example is written fresh by the build, so it isn't read here. board.md is read whole, though the build writes only
// its ratchet section (scripts/public-allow.txt): the builder isn't in this repo, so that promise can't be tested here
// (Lead-12, Fri Nov 6), and the board says the plan's name nowhere. This file is in
// the public copy too, so it builds the plan's name from parts and never spells it.
const ROOT = new URL("../../", import.meta.url);
const SKIP = new Set(["node_modules", "dist", ".git", "test-results", "playwright-report", ".ratchet"]);
const WRITTEN = new Set([".env.example"]);
const PLAN = ["api", "matic"].join("");

type Word = { word: RegExp; where: (path: string) => boolean };
export const WORDS: Word[] = [
  { word: new RegExp(PLAN, "i"), where: () => true },
  { word: /\bproven\b/i, where: (path) => /^docs\/launch\/[^/]+\.md$/.test(path) },
];
// PayPal's own server SDK (@paypal/paypal-server-sdk) depends on that vendor's packages, so the lockfile names them in
// quotes: a package name, not the plan. Those quoted names are taken out before the line is read, and nothing else is
// (decided by default; flip if Joshua says even the package names must go).
const PACKAGE = new RegExp(String.raw`'@${PLAN}/[^']*'`, "gi");

/** Each banned word in `text` (the file at `path`), as path:line: word. */
export function bannedIn(path: string, text: string): string[] {
  const out: string[] = [];
  text.split("\n").forEach((raw, i) => {
    const line = path === "pnpm-lock.yaml" ? raw.replace(PACKAGE, "''") : raw;
    for (const w of WORDS) {
      const m = w.where(path) ? line.match(w.word) : null;
      if (m) out.push(`${path}:${i + 1}: ${m[0]}`);
    }
  });
  return out;
}

/** Every file the public copy keeps, by its path from the repo root. */
function keptFiles(): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    const url = new URL(rel, ROOT);
    if (!existsSync(url)) return;
    if (statSync(url).isFile()) { out.push(rel); return; }
    for (const name of readdirSync(url)) if (!SKIP.has(name)) walk(`${rel.replace(/\/$/, "")}/${name}`);
  };
  for (const k of KEPT) if (!WRITTEN.has(k)) walk(k);
  return out;
}

describe("no word that never goes public is in the public copy", () => {
  it("the public copy has none, read file by file", () => {
    const files = keptFiles();
    expect(files).toContain("docs/guild/board.md");
    expect(files).toContain("pnpm-lock.yaml");
    expect(files).toContain("core/test/public-words.test.ts");
    expect(files.some((f) => f.startsWith("docs/launch/"))).toBe(true);
    expect(files).not.toContain(".env.example");
    const hits = files.flatMap((f) => {
      const buf = readFileSync(new URL(f, ROOT));
      return buf.includes(0) ? [] : bannedIn(f, buf.toString("utf8"));
    });
    expect(hits).toEqual([]);
  });

  it("catches a planted word with its file and line, reads board.md whole, and the lockfile less its quoted package names", () => {
    const Plan = PLAN.toUpperCase();
    expect(bannedIn("README.md", `a\nthe ${Plan} plan\n`)).toEqual([`README.md:2: ${Plan}`]);
    expect(bannedIn("docs/launch/post.md", "It is proven.")).toEqual(["docs/launch/post.md:1: proven"]);
    expect(bannedIn("README.md", "It is proven.")).toEqual([]);
    const board = `# Board\nAP ${Plan} row\n<!-- ratchet:start -->\nok\n<!-- ratchet:end -->\n`;
    expect(bannedIn("docs/guild/board.md", board)).toEqual([`docs/guild/board.md:2: ${Plan}`]);
    expect(bannedIn("pnpm-lock.yaml", `  '@${PLAN}/core@0.10.30':\n      '@${PLAN}/proxy': 0.1.4(supports-color@7.2.0)\n`)).toEqual([]);
    expect(bannedIn("pnpm-lock.yaml", `a\n# our ${Plan} plan\n`)).toEqual([`pnpm-lock.yaml:2: ${Plan}`]);
    expect(bannedIn("README.md", `  '@${PLAN}/core@0.10.30':`)).toHaveLength(1);
  });
});

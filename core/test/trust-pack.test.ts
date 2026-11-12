// npm-ready (Joshua, Nov 4, 2c). The running proof is scripts/trust-pack.ts, in CI; this holds what must never change.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUILDERS_WORDS, NPM_PUBLISHED } from "../../web/src/builders/builders.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const pack = read("scripts/trust-pack.ts");
const ci = read(".github/workflows/check.yml");

describe("the npm package", () => {
  it("can't be published by accident: the source's package.json stays private, and only Joshua publishes", () => {
    expect(JSON.parse(read("trust/package.json")).private).toBe(true);
    const commands = [...pack.matchAll(/execFileSync\("npm", \[([^\]]*)\]/g)].map((m) => m[1]!);
    // Two npm commands, both dry runs: the publish dry run, and (once this version is on npm, when npm refuses to dry-run a
    // publish over it) the pack dry run that lists the same tarball. Neither can send anything.
    expect(commands.length).toBe(2);
    expect(commands[0]).toContain('"publish", "--dry-run"');
    expect(commands[1]).toContain('"pack", "--dry-run"');
    for (const c of commands) expect(c).toContain('"--dry-run"');
    // The fallback is for npm's own "already published" refusal only: any other publish failure still fails the check.
    expect(pack).toContain("cannot publish over the previously published versions");
    expect(pack).toMatch(/if \(!\/cannot publish over[^\n]*\) throw e;/);
    expect(ci).not.toMatch(/npm publish(?! --dry-run)/);
    expect(ci).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN/);
    // The page can't promise an install before he publishes: what it draws says no `npm install`/`npm i` while NPM_PUBLISHED is
    // false, and the one line in the source that says it is the gated GET_INSTALL, drawn only behind that flag (runbook step 12).
    const install = /npm (?:install|i)\b/;
    if (!NPM_PUBLISHED) expect(BUILDERS_WORDS.filter((w) => install.test(w))).toEqual([]);
    const code = read("web/src/builders/builders.ts").split("\n").filter((l) => !/^\s*(\/\/|\/\*\*|\*)/.test(l));
    expect(code.filter((l) => install.test(l))).toEqual(['export const GET_INSTALL = "npm install @gilded-goose/trust";']);
    expect(read("web/src/builders/Builders.tsx").match(/\bGET_INSTALL\b/g)).toEqual(["GET_INSTALL", "GET_INSTALL"]);
    expect(read("web/src/builders/Builders.tsx")).toContain("{NPM_PUBLISHED ? <code>{GET_INSTALL}</code> : GET_NOT_YET}");
  });
  it("runs its dry run in CI, after the full check", () => {
    expect(ci.indexOf("node scripts/trust-pack.ts")).toBeGreaterThan(ci.indexOf("corepack pnpm check"));
    // And in ci-local, so a red on this step is seen before a push, not after (Nov 11: the first push after publishing 0.1.0
    // went red on GitHub at this step, which ci-local did not run).
    const local = read("scripts/ci-local.sh");
    expect(local.indexOf("node scripts/trust-pack.ts")).toBeGreaterThan(local.indexOf("corepack pnpm check"));
  });
  it("ships MIT, by default, until Joshua says otherwise", () => {
    expect(JSON.parse(read("trust/package.json")).license).toBe("MIT");
    expect(read("LICENSE")).toMatch(/^MIT License/);
  });
  it("lets no test, source file or config into the package", () => {
    const allowed = new RegExp(/const ALLOWED = \/(.+)\/;/.exec(pack)![1]!);
    for (const bad of ["test/guard.test.ts", "src/guard.ts", "tsconfig.json", ".env", "dist/guard.js.map"]) expect(allowed.test(bad), bad).toBe(false);
    for (const good of ["dist/guard.js", "dist/guard.d.ts", "examples/ten-lines.ts", "README.md", "LICENSE", "package.json"]) expect(allowed.test(good), good).toBe(true);
  });
  it("keeps the build out of the repo", () => {
    expect(read(".gitignore")).toContain("trust/.pack/");
  });
});

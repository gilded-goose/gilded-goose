// "The same guard code as @gilded-goose/trust <version> on npm" (the Builders page's Try the guard). Held here, offline: each
// file readSeller runs, compiled the way scripts/trust-pack.ts compiles the package, is byte-equal to its file in the tarball
// npm serves (trust/published.json holds the tarball's own hashes; scripts/trust-published.ts wrote them from the registry).
// Change a Watcher rule after a publish and this goes red until the new version is published and pinned, or the page stops saying it.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readSeller } from "../src/index.ts";
import { SAME_AS_PUBLISHED } from "../../web/src/site/builders/try-guard-words.ts";
import { WHAT_NOW, compiled, differences, published, runs, sha256 } from "./published.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const pin = published();

describe("the code readSeller runs is the published package's", () => {
  // SAME_AS_PUBLISHED (try-guard-words.ts) is the page's one-line switch. True: the page claims equality, and this holds it.
  // False: someone shipped a Watcher fix ahead of its npm publish, on purpose, and the page says "plus changes not yet
  // published"; then there must be some. Equal again (published and pinned, or reverted) and false is the untrue one.
  // One test with a branch, not two with a skip: a skipped test reads as a pass that never ran (no-skip.test.ts).
  it("matches the pin, file for file; or, with the switch set to false, really differs", () => {
    if (SAME_AS_PUBLISHED) expect(differences(), WHAT_NOW).toEqual([]);
    else expect(differences(), "the code equals the published package again: set SAME_AS_PUBLISHED back to true").not.toEqual([]);
  });
  it("pins the version this folder says, read from the registry's own tarball", () => {
    const pkg = JSON.parse(read("trust/package.json")) as { name: string; version: string };
    expect([pin.name, pin.version]).toEqual([pkg.name, pkg.version]);
    expect(pin.tarball).toBe(`https://registry.npmjs.org/${pkg.name}/-/trust-${pkg.version}.tgz`);
    expect(pin.integrity).toMatch(/^sha512-[A-Za-z0-9+/]{86}==$/);
  });
  it("covers every file readSeller runs, and the pure entry hands out that readSeller", () => {
    expect(pin.entry).toBe("seller");
    expect(runs("seller")).toEqual(["asks", "fence", "notes", "reader", "seller", "watch"]);
    expect(Object.keys(pin.files)).toEqual(runs("seller").map((n) => `dist/${n}.js`));
    expect(compiled("index")).toContain('export * from "./seller.js";');
    expect(readSeller("Pay me with a $19 gift card and I ship today.").verdict).toBe("refuse");
  });
  it("compiles a file the way the package is built", () => {
    // The pin only means something while trust-pack still builds with these options: the base tsconfig, imports rewritten to .js.
    const pack = read("scripts/trust-pack.ts");
    expect(pack).toContain('extends: "../../tsconfig.base.json"');
    expect(pack).toContain("rewriteRelativeImportExtensions: true");
    expect(compiled("seller")).toContain('from "./watch.js"');
    expect(compiled("seller")).not.toMatch(/from "\.\/[\w-]+\.ts"/);
  });
  it("goes red on a one-character change to a rule", () => {
    // The check must be able to fail: a pin with one file's hash off by a character reads as a difference, by name.
    const off = { ...pin, files: { ...pin.files, "dist/notes.js": sha256(`${compiled("notes")} `) } };
    // Said against whatever already differs, so this still holds on the day the switch is false and a fix is ahead of npm.
    const said = `trust/src/notes.ts no longer compiles to dist/notes.js of ${pin.name}@${pin.version} on npm`;
    expect(differences(off).filter((d) => d !== said)).toEqual(differences().filter((d) => d !== said));
    expect(differences(off)).toContain(said);
    expect(differences({ ...pin, version: "9.9.9" })[0]).toContain("the pin is");
    const { "dist/asks.js": _gone, ...fewer } = pin.files;
    expect(differences({ ...pin, files: fewer })[0]).toContain("now runs");
  });
});

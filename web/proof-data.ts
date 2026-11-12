// The Proof panel's numbers, read when the page is built (Joshua, Fri Oct 30: "Each number links to its source in
// docs/claims.md"). A Vite plugin serves `virtual:goose-proof`: the claims rows the panel shows, as written in
// docs/claims.md, and the test cases counted from the test files. Only the rows the panel shows go into the bundle,
// never the whole file. A missing row throws here, so the build fails rather than the page.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { claimRows, countTestCases, proofGroups } from "../core/src/proof.ts";

const ID = "virtual:goose-proof";
const root = new URL("../", import.meta.url);
const at = (p: string) => new URL(p, root);
const TEST_DIRS = ["core/test", "trust/test"];

function data() {
  const groups = proofGroups(claimRows(readFileSync(at("docs/claims.md"), "utf8")));
  const files = TEST_DIRS.flatMap((d) => readdirSync(at(`${d}/`)).filter((f) => f.endsWith(".test.ts")).map((f) => `${d}/${f}`));
  const tests = { cases: countTestCases(files.map((f) => readFileSync(at(f), "utf8"))), files: files.length };
  return { groups, tests };
}

export function proofData(): Plugin {
  return {
    name: "goose-proof",
    resolveId: (id) => (id === ID ? `\0${ID}` : null),
    load(id) {
      if (id !== `\0${ID}`) return null;
      this.addWatchFile(fileURLToPath(at("docs/claims.md")));
      return `export default ${JSON.stringify(data())};`;
    },
  };
}

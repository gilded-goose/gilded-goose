// The cart fingerprint's recipe and its test vectors, on the site itself: the build emits docs/fingerprint-v0.md (as
// plain text, so every browser shows it in the tab) and trust/test/vectors.json into web/dist, byte for byte. So the two
// links under "Recompute it yourself" are true the moment the site deploys, whether or not the public repo's copy holds
// the files yet, and there is no second copy to drift. No page imports them: they add nothing to any route's first load.

import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import { RECIPE_FILE, VECTORS_FILE } from "./src/verify/words.ts";

export function fingerprintRecipe(): Plugin {
  return {
    name: "goose-fingerprint-recipe",
    apply: "build",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: RECIPE_FILE, source: readFileSync(new URL("../docs/fingerprint-v0.md", import.meta.url)) });
      this.emitFile({ type: "asset", fileName: VECTORS_FILE, source: readFileSync(new URL("../trust/test/vectors.json", import.meta.url)) });
    },
  };
}

// The Postman collection on the site (For builders' "Get it"; Lead-12, Nov 5): the build emits docs/builders' one file into
// web/dist, byte for byte, so there's no second copy in web/public to drift from the one the README and newman run. No page
// imports it, so it adds nothing to any route's first load; compress.ts gives it a Brotli and a gzip copy like any .json.

import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

export const POSTMAN_FILE = "gilded-goose.postman_collection.json";

export function postman(): Plugin {
  return {
    name: "goose-postman",
    apply: "build",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: POSTMAN_FILE, source: readFileSync(new URL(`../docs/builders/${POSTMAN_FILE}`, import.meta.url)) });
    },
  };
}

// A part's own copy of @gilded-goose/trust (Try the guard, the white site's Builders page, Nov 11). An import marked `?own`
// gets the package's source under ids of its own, so Rollup puts it in the importer's chunk and nowhere else.
// Why: the Watcher's rules already ride in a chunk other routes share with code the part doesn't use. A plain import from
// the part made Rollup split that chunk in two for every route (one more file to fetch, 60 to 243 B on each first load),
// and that put the keyed ledger route 47 B over its line. With its own copy no other route's files change by a byte; the
// part pays for it (the rules a second time, in a chunk fetched only when its room nears the screen).
// The source is the same files either way: trust/test/published.test.ts holds them equal to the published package's.
import type { Plugin } from "vite";

const MARK = "?own";
/** Only the package's own source is copied. It imports nothing else; anything it did would be shared as usual. */
const COPIED = /\/trust\/src\/[\w-]+\.ts$/;

export function ownCopy(): Plugin {
  return {
    name: "goose-own-copy",
    enforce: "pre",
    async resolveId(source, importer, options) {
      const marked = source.endsWith(MARK);
      const inside = importer?.endsWith(MARK) ?? false;
      if (!marked && !inside) return null;
      const found = await this.resolve(marked ? source.slice(0, -MARK.length) : source, inside ? importer!.slice(0, -MARK.length) : importer, { ...options, skipSelf: true });
      return found && !found.external && COPIED.test(found.id) ? { ...found, id: `${found.id}${MARK}` } : found;
    },
  };
}

// Every route's first-load bytes against its line, off the web build that's on disk, by the ratchet's own reading. It runs
// no tests, so it answers "is this build over?" in a second, before a commit. A licensed build's bytes never reach CI (CI
// has no key), and Q ruled that the same line holds for them: GOOSE_FLIP_REHEARSAL=1 carries the same routing, with no key.
//   corepack pnpm --filter @goose/web build && node scripts/bundle-read.ts
//   GOOSE_FLIP_REHEARSAL=1 corepack pnpm --filter @goose/web build && node scripts/bundle-read.ts
//   ... && node scripts/bundle-read.ts --keyed   (ci-local's rehearsal step: the line less KEYED_EXTRA, see below)
import { readFileSync } from "node:fs";
import { bundles } from "./ratchet.ts";

const file = JSON.parse(readFileSync(new URL("../docs/guild/ratchet.json", import.meta.url), "utf8")) as { limits: Record<string, number>; bundleToleranceBytes: number };
// A rehearsal build stands in for the keyed live one, which reads exactly this many bytes more on every route (Track F,
// Nov 5: the licence's own bytes; F's rehearsal had no VITE_WALLET=1, which adds 4 B, so built with it as ci-local does, this
// errs up to 4 B on the safe side). `--keyed` holds the rehearsal to the line less that, so a route that fits on rehearsal
// also fits once the key is in. It only tightens: no line moves.
const KEYED_EXTRA = 6;
const keyed = process.argv.includes("--keyed");
const { raw } = bundles();
let over = 0;
for (const [metric, limit] of Object.entries(file.limits).filter(([k]) => k.startsWith("bundle."))) {
  const value = raw[metric];
  if (value === undefined) throw new Error(`bundle-read: nothing measured for ${metric}`);
  const line = limit + file.bundleToleranceBytes - (keyed ? KEYED_EXTRA : 0);
  const room = line - value;
  if (room < 0) over++;
  console.log(`${room < 0 ? "OVER" : "ok  "} ${metric} ${value}, line ${line}, ${room < 0 ? `${-room} B over` : `${room} B of room`}`);
}
const as = keyed ? ` (keyed: ${KEYED_EXTRA} B held back for the licence)` : "";
console.log(over ? `bundle-read: ${over} routes over their line${as}` : `bundle-read: every route is under its line${as}`);
process.exit(over ? 1 : 0);

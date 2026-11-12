// Track C3: record Channel3's real answer for every generic query, so the panel has an honest fallback when the live call
// fails. One live call per query (QUERIES), through the same adapter and checks the server uses; the file keeps only the
// checked reference items and when Channel3 answered. Never writes by hand, never prints the key.
//
//   node --env-file=.env scripts/record-channel3.ts
//
// Exits 1 without writing if the key is missing, or any query doesn't get a live answer or gets no products.

import { writeFileSync } from "node:fs";
import { QUERIES, ReferencePrices, type Recorded } from "../server/src/adapters/channel3.ts";

const key = process.env.CHANNEL3_API_KEY;
if (!key) { console.error("record-channel3: CHANNEL3_API_KEY isn't set (it lives in .env)"); process.exit(1); }

// A recording is one run, so it waits longer than a shopper would: an answer of 30 products is worth 20 s here.
const prices = new ReferencePrices({ key, fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(20_000) }), now: () => Date.now(), recorded: null, warn: (l) => console.error(l) });
const out: Recorded & { about: string } = {
  about: "Channel3 reference prices as a real /v1/search call returned them, one entry per generic query in server/src/adapters/channel3.ts QUERIES. Written only by scripts/record-channel3.ts from a live call; never by hand.",
  queries: {},
};
let bad = 0;
for (const [, query] of QUERIES) {
  const r = await prices.forWords(query);
  if (r.source !== "channel3" || !r.fetchedAt) { console.error(`record-channel3: "${query}" got no live answer (${r.source})`); bad++; continue; }
  // An empty capture is not a recording: "recorded" needs prices behind it.
  if (r.items.length === 0) { console.error(`record-channel3: "${query}": Channel3 answered with no products`); bad++; continue; }
  out.queries[query] = { fetchedAt: r.fetchedAt, items: r.items, flagged: r.flagged };
  console.log(`record-channel3: "${query}": ${r.items.length} items, ${r.flagged.length} flagged`);
}
if (bad) { console.error(`record-channel3 FAIL: ${bad} of ${QUERIES.length} queries without a live answer; nothing written`); process.exit(1); }
writeFileSync(new URL("../docs/fixtures/channel3-recorded.json", import.meta.url), `${JSON.stringify(out, null, 2)}\n`);
console.log(`record-channel3 ok: ${QUERIES.length} queries recorded to docs/fixtures/channel3-recorded.json`);

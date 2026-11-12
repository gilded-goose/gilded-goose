// M2 step 1 diagnosis: is a run's first move slow because it is first (cold
// connection) or because of what round 1 asks (its content)? Same warm, raced
// buyer the server runs; a round-1 and a round-2 input from a real haggle, in
// alternating order, 10 pairs. Writes results-first-move.json.
//
//   node --env-file=.env spikes/s3-claude/first-move.ts [pairs=10]

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Guard, MemoryLedger, RuleBuyer, demoDeps, demoPolicy, demoSellers, demoWant, runHaggle, DEMO_SHOPPER, type BuyerInput, type LlmPort } from "@goose/core";
import { makeClaudeBuyer } from "../../server/src/adapters/claude.ts";

const here = dirname(fileURLToPath(import.meta.url));
const PAIRS = Number(process.argv[2] ?? 10);
const key = process.env.ANTHROPIC_API_KEY;
if (!key) { console.error("ANTHROPIC_API_KEY is not set in .env"); process.exit(1); }
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const prompt = readFileSync(join(here, "..", "..", "server", "prompts", "buyer.honest.md"), "utf8");

const seen: BuyerInput[] = [];
const rule = new RuleBuyer();
const rec: LlmPort = { name: "rule", decide: (i) => { seen.push(structuredClone(i)); return rule.decide(i); } };
const deps = demoDeps(1, sha256);
const ledger = new MemoryLedger();
await runHaggle({ want: demoWant(), sellers: demoSellers(), buyer: rec, guard: new Guard(deps, ledger, demoPolicy()), deps, ledger, shopperId: DEMO_SHOPPER });
const r1 = seen.find((i) => i.round === 1)!, r2 = seen.find((i) => i.round === 2)!;

const buyer = makeClaudeBuyer(key, prompt);
await buyer.warm?.();
const time = async (i: BuyerInput) => { const t0 = performance.now(); const m = await buyer.decide(i); return { ms: Math.round(performance.now() - t0), type: m.type, whyChars: m.why.length }; };
const out: { order: string; round1: object; round2: object }[] = [];
for (let k = 0; k < PAIRS; k++) {
  await buyer.warm?.();
  if (k % 2 === 0) { const a = await time(r1); const b = await time(r2); out.push({ order: "1 then 2", round1: a, round2: b }); }
  else { const b = await time(r2); const a = await time(r1); out.push({ order: "2 then 1", round1: a, round2: b }); }
}
const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
const ms = (o: string, r: "round1" | "round2") => out.filter((x) => x.order === o).map((x) => (x[r] as { ms: number }).ms);
const summary = { r1First: avg(ms("1 then 2", "round1")), r2Second: avg(ms("1 then 2", "round2")), r2First: avg(ms("2 then 1", "round2")), r1Second: avg(ms("2 then 1", "round1")) };
writeFileSync(join(here, "results-first-move.json"), JSON.stringify({ at: new Date().toISOString(), pairs: PAIRS, summary, out }, null, 2) + "\n");
console.log(JSON.stringify(summary), "\n", out.map((x) => `${x.order}: r1 ${JSON.stringify(x.round1)} r2 ${JSON.stringify(x.round2)}`).join("\n "));

// S3 follow-up: does racing two identical buyer calls (first answer wins, the other
// is aborted) cut the tail under 1.5 s? Same 30 recorded inputs as s3.ts. Also
// prints the key's request rate limit, since racing doubles requests.
//   node --env-file=.env spikes/s3-claude/race.ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import Anthropic from "../../server/node_modules/@anthropic-ai/sdk/index.js";
import { Guard, MemoryLedger, RuleBuyer, demoDeps, demoPolicy, demoSellers, demoWant, runHaggle, DEMO_SHOPPER, type BuyerInput, type LlmPort } from "@goose/core";
import { ClaudeBuyer } from "../../server/src/adapters/claude.ts";
const key = process.env.ANTHROPIC_API_KEY!;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!; };
const sum = (name: string, xs: number[]) => console.log(name, { n: xs.length, p50: pct(xs, 50), p95: pct(xs, 95), max: Math.max(...xs), over1500: xs.filter((x) => x >= 1500).length });
const inputs: BuyerInput[] = [];
for (let seed = 1; inputs.length < 30; seed++) {
  const rule = new RuleBuyer();
  const rec: LlmPort = { name: "rule", decide: (i) => { inputs.push(structuredClone(i)); return rule.decide(i); } };
  const deps = demoDeps(seed, sha256); const ledger = new MemoryLedger();
  await runHaggle({ want: demoWant(), sellers: demoSellers(), buyer: rec, guard: new Guard(deps, ledger, demoPolicy()), deps, ledger, shopperId: DEMO_SHOPPER });
}
inputs.length = 30;
const raw = new Anthropic({ apiKey: key, maxRetries: 0 });
const { response } = await raw.messages.create({ model: "claude-haiku-5-5", max_tokens: 5, thinking: { type: "disabled" }, messages: [{ role: "user", content: "ok" }] }).withResponse();
console.log("rate limit (requests/min):", response.headers.get("anthropic-ratelimit-requests-limit"), "output tokens/min:", response.headers.get("anthropic-ratelimit-output-tokens-limit"));
const prompt = readFileSync("server/prompts/buyer.honest.md", "utf8");
const a = new ClaudeBuyer(key, prompt), b = new ClaudeBuyer(key, prompt);
const raced: number[] = [];
for (const input of inputs) {
  const ca = new AbortController(), cb = new AbortController();
  const t0 = performance.now();
  await Promise.any([a.decide(input, ca.signal), b.decide(input, cb.signal)]);
  raced.push(Math.round(performance.now() - t0));
  ca.abort(); cb.abort();
}
sum("race of 2", raced);

// What one live haggle costs (M2 step 4 planning): replays the three tapes and, for every move,
// asks the free count_tokens endpoint how big the exact request the buyer sends would be.
// Output tokens can't be counted ahead, so they're estimated from the tape's tool input.
//
//   node --env-file=.env spikes/s3-claude/tokens.ts      (no Messages calls; count_tokens is free)

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import Anthropic from "../../server/node_modules/@anthropic-ai/sdk/index.js";
import { Guard, MemoryLedger, RecordedPort, demoDeps, demoPolicy, demoWant, marketFor, marketSellers, runHaggle, DEMO_SHOPPER, type Tape, type BuyerInput, type LlmPort } from "@goose/core";
import { BUYER_MODEL } from "../../server/src/adapters/claude.ts";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const key = process.env.ANTHROPIC_API_KEY;
if (!key) { console.error("ANTHROPIC_API_KEY is not set (.env)"); process.exit(2); }
const client = new Anthropic({ apiKey: key });
const prompt = readFileSync(new URL("../../server/prompts/buyer.honest.md", import.meta.url), "utf8");
const MOVE_TOOL: Anthropic.Tool = {
  name: "move",
  description: "Your one move this round. Prices are integer cents. You may only propose; a code guard enforces the shopper's limits.",
  input_schema: { type: "object", properties: { type: { type: "string", enum: ["counter", "accept", "wait", "walk"] }, sellerId: { type: "string", description: "Required for counter and accept." }, price: { type: "integer", description: "Integer cents. Required for counter and accept." }, why: { type: "string", description: "One short sentence the shopper will read." } }, required: ["type", "why"] },
};

const runs: Array<{ seed: number; moves: number; input: number[]; outEst: number[] }> = [];
for (const seed of [1, 2, 3]) {
  const tape = JSON.parse(readFileSync(new URL(`../../docs/fixtures/tape-seed-${seed}.json`, import.meta.url), "utf8")) as Tape;
  const rec = new RecordedPort(tape, sha256);
  const input: number[] = [];
  const outEst: number[] = [];
  const counting: LlmPort = {
    name: "counting",
    async decide(i: BuyerInput, signal?: AbortSignal) {
      const c = await client.messages.countTokens({ model: BUYER_MODEL, system: prompt, tools: [MOVE_TOOL], tool_choice: { type: "tool", name: "move", disable_parallel_tool_use: true }, thinking: { type: "disabled" }, messages: [{ role: "user", content: JSON.stringify(i) }] });
      input.push(c.input_tokens);
      const move = await rec.decide(i, signal);
      // ~4 chars per token for the JSON tool input, plus the tool_use block's own framing (~20).
      outEst.push(Math.ceil(JSON.stringify(move).length / 4) + 20);
      return move;
    },
  };
  const deps = demoDeps(seed, sha256);
  const ledger = new MemoryLedger();
  await runHaggle({ want: demoWant(), sellers: marketSellers(tape.meta.market ?? marketFor(tape.meta.week ?? seed), demoWant().item), buyer: counting, guard: new Guard(deps, ledger, demoPolicy()), deps, ledger, shopperId: DEMO_SHOPPER });
  runs.push({ seed, moves: input.length, input, outEst });
}
console.log(JSON.stringify(runs));

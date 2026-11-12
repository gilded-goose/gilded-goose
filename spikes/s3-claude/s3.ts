// Spike S3: is Claude Haiku fast and well-behaved enough to be the buyer?
//
//   node --env-file=.env spikes/s3-claude/s3.ts [moves=30] [race=BUYER_RACE]
//
// Pass: p95 < 1500 ms over N sequential moves of the shipping buyer (race
// identical ClaudeBuyer calls per move, first good answer wins, the rest
// aborted; race=1 is a single call), cold first move included; zero malformed
// answers counted per call, losers included; zero adherence breaks. Inputs are
// the exact BuyerInputs real haggles produce (recorded from the rule buyer,
// seeds 1..), so the spike measures the payloads the engine sends. Also probes
// the thinking settings, measures Sonnet for the Auditor's 6 s budget, and runs
// whole haggles through the engine's 1.5 s timeout. Exit 1 on fail.
// Writes spikes/s3-claude/results-race<N>.json. The key is read from .env, never printed.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "../../server/node_modules/@anthropic-ai/sdk/index.js";
import {
  Guard, MemoryLedger, RuleBuyer, demoDeps, demoPolicy, demoSellers, demoWant, runHaggle, isBuyerMove, DEMO_SHOPPER,
  type BuyerInput, type BuyerMove, type LlmPort,
} from "@goose/core";
import { ClaudeBuyer, makeClaudeBuyer, BUYER_MODEL, BUYER_RACE } from "../../server/src/adapters/claude.ts";

const here = dirname(fileURLToPath(import.meta.url));
const N = Number(process.argv[2] ?? 30);
const RACE_ARG = process.argv[3] ? Number(process.argv[3]) : undefined;
const BUDGET_MS = 1500;
const AUDITOR_MODEL = "claude-sonnet-5-5";
const AUDITOR_BUDGET_MS = 6000;
const key = process.env.ANTHROPIC_API_KEY;
if (!key) { console.error("S3 FAIL: ANTHROPIC_API_KEY is not set in .env"); process.exit(1); }
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const prompt = readFileSync(join(here, "..", "..", "server", "prompts", "buyer.honest.md"), "utf8");
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!; };
const ms = (t0: number) => Math.round(performance.now() - t0);

// 1. Record real engine inputs.
async function recordInputs(count: number): Promise<BuyerInput[]> {
  const out: BuyerInput[] = [];
  for (let seed = 1; out.length < count && seed < 100; seed++) {
    const rule = new RuleBuyer();
    const rec: LlmPort = { name: "rule", decide: (i) => { out.push(structuredClone(i)); return rule.decide(i); } };
    const deps = demoDeps(seed, sha256);
    const ledger = new MemoryLedger();
    await runHaggle({ want: demoWant(), sellers: demoSellers(), buyer: rec, guard: new Guard(deps, ledger, demoPolicy()), deps, ledger, shopperId: DEMO_SHOPPER });
  }
  return out.slice(0, count);
}

/** What the honest prompt asks for, checked per move. The guard enforces the money rules regardless; this is adherence, not safety. */
function violations(i: BuyerInput, m: BuyerMove): string[] {
  const v: string[] = [];
  if (m.type === "counter" || m.type === "accept") {
    if (m.price > i.want.maxPrice) v.push(`${m.type} over max`);
    const off = i.offers.find((o) => o.sellerId === m.sellerId);
    if (!off) v.push(`${m.type} names a seller with no offer`);
    if (m.type === "accept" && off && off.history === 0) v.push("accept from history 0");
    if (m.type === "accept" && off && off.shape !== "one-off") v.push(`accept of ${off.shape}`);
  }
  // The shopper reads `why`: any price from the input written as bare cents ("4773") is a leak of our internal format.
  const cents = new Set([i.want.maxPrice, ...i.offers.map((o) => o.price), ...("price" in m ? [m.price] : [])].map(String));
  for (const n of m.why.match(/(?<![$.\d])\d{4,}(?![.\d])/g) ?? []) if (cents.has(n)) v.push(`cents in why: "${n}"`);
  // ...and a seller id ("pondside") is an internal name; the shopper sees merchant names on the row (M1 critique, note 7).
  for (const o of i.offers) if (m.why.toLowerCase().includes(o.sellerId.toLowerCase())) v.push(`seller id in why: "${o.sellerId}"`);
  return v;
}

const inputs = await recordInputs(N);
console.log(`recorded ${inputs.length} real buyer inputs`);

// 2. Probe the thinking settings once each (the adapter forces the move tool).
const probes: Record<string, { ok: boolean; ms: number; note: string }> = {};
for (const thinking of ["off", "adaptive"] as const) {
  const b = new ClaudeBuyer(key, prompt, { thinking });
  const t0 = performance.now();
  try { const m = await b.decide(inputs[0]!); probes[`haiku thinking=${thinking}`] = { ok: true, ms: ms(t0), note: m.type }; }
  catch (e) { probes[`haiku thinking=${thinking}`] = { ok: false, ms: ms(t0), note: (e as Error).message.slice(0, 160) }; }
}
console.log("probes:", probes);

// 3. N sequential moves of the shipping configuration (BUYER_RACE calls raced per move).
const RACE = RACE_ARG ?? BUYER_RACE;
let racerErrors = 0;
const racerNotes: string[] = [];
const buyer = makeClaudeBuyer(key, prompt, { race: RACE, onRacerError: (e) => { racerErrors++; racerNotes.push(e.message.slice(0, 120)); } });
const lat: number[] = [];
let malformed = 0;
const adherence: string[] = [];
const moves: Record<string, number> = {};
for (const [k, input] of inputs.entries()) {
  const t0 = performance.now();
  try {
    const m = await buyer.decide(input);
    lat.push(ms(t0));
    if (!isBuyerMove(m)) malformed++;
    moves[m.type] = (moves[m.type] ?? 0) + 1;
    for (const v of violations(input, m)) adherence.push(`call ${k + 1} (round ${input.round}): ${v}`);
  } catch (e) {
    lat.push(ms(t0));
    malformed++;
    console.log(`call ${k + 1} error: ${(e as Error).message.slice(0, 160)}`);
  }
}
const haiku = { model: BUYER_MODEL, race: RACE, calls: lat.length, p50: pct(lat, 50), p95: pct(lat, 95), max: Math.max(...lat), first: lat[0], overBudget: lat.filter((x) => x >= BUDGET_MS).length, malformed, racerErrors, racerNotes, moves, adherence };
console.log("haiku:", haiku);

// 4. Sonnet for the Auditor: forced tool_choice is not accepted on Sonnet 5.5, so auto + strict tool; low effort.
const auditor = new Anthropic({ apiKey: key, maxRetries: 0 });
const VERDICT: Anthropic.Tool = {
  name: "verdict", strict: true, description: "Your verdict on the cart.",
  input_schema: { type: "object", additionalProperties: false, required: ["ok", "flagged", "why"], properties: { ok: { type: "boolean" }, flagged: { type: "integer" }, why: { type: "string" } } },
};
const sLat: number[] = [];
const sNotes: string[] = [];
for (let k = 0; k < 5; k++) {
  const t0 = performance.now();
  try {
    const res = await auditor.messages.create({
      model: AUDITOR_MODEL, max_tokens: 1024, system: "You audit one shopping cart against the shopper's want. Answer by calling the verdict tool once.",
      tools: [VERDICT], tool_choice: { type: "auto" }, output_config: { effort: "low" },
      messages: [{ role: "user", content: JSON.stringify({ want: inputs[0]!.want, cart: { item: inputs[0]!.want.item, price: 5012, qty: 1, shape: k % 2 ? "subscription" : "one-off", merchantHistory: 87 } }) }],
    });
    sLat.push(ms(t0));
    sNotes.push(res.content.some((c) => c.type === "tool_use") ? "tool_use" : `no tool (${res.stop_reason})`);
  } catch (e) { sLat.push(ms(t0)); sNotes.push(`error: ${(e as Error).message.slice(0, 160)}`); }
}
const sonnet = { model: AUDITOR_MODEL, calls: sLat.length, p50: pct(sLat, 50), max: Math.max(...sLat), budget: AUDITOR_BUDGET_MS, notes: sNotes };
console.log("sonnet:", sonnet);

// 5. Whole haggles through the engine, with its 1.5 s timeout and rule fallback.
const haggles: { seed: number; outcome: string; claudeMoves: number; fallbacks: number; price?: string }[] = [];
for (const seed of [1, 2, 3]) {
  const deps = { ...demoDeps(seed, sha256), clock: { now: () => Date.now() } };
  const ledger = new MemoryLedger();
  const want = demoWant({ deadline: Date.now() + 86_400_000 });
  const r = await runHaggle({ want, sellers: demoSellers(), buyer, guard: new Guard(deps, ledger, demoPolicy()), deps, ledger, shopperId: DEMO_SHOPPER });
  const buyerRows = ledger.read().filter((e) => e.actor === "buyer" && e.data && "source" in e.data);
  haggles.push({
    seed, outcome: r.outcome,
    claudeMoves: buyerRows.filter((e) => (e.data as { source: string }).source === BUYER_MODEL).length,
    fallbacks: buyerRows.filter((e) => (e.data as { source: string }).source === "rule-fallback").length,
    ...(r.outcome === "cart" ? { price: (r.cart.price / 100).toFixed(2) } : {}),
  });
}
console.log("haggles:", haggles);

const pass = inputs.length === N && haiku.p95 < BUDGET_MS && malformed === 0 && racerErrors === 0 && adherence.length === 0;
writeFileSync(join(here, `results-race${RACE}.json`), JSON.stringify({ at: new Date().toISOString(), pass, budgetMs: BUDGET_MS, probes, haiku, sonnet, haggles }, null, 2) + "\n");
console.log(pass ? `S3 PASS: p95 ${haiku.p95} ms < ${BUDGET_MS} ms over ${N} calls, 0 malformed` : `S3 FAIL: p95 ${haiku.p95} ms, malformed ${malformed}, racer errors ${racerErrors}, adherence ${adherence.length}, inputs ${inputs.length}/${N}`);
process.exit(pass ? 0 : 1);

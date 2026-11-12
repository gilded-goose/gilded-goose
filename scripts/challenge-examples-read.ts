// The Challenge's three examples on real reads (Joshua, Nov 4, 3a): each round is the real `demoJudgeRound`, with the real AI
// reader under its real time limit and a buyer that makes no model call, so what's measured is what the verdict says. It costs
// about a cent, so it isn't in `pnpm check`; the test reads what it wrote, and a changed note fails until it's read again.
//
//   node --env-file=<path to .env> scripts/challenge-examples-read.ts [runs]
//
// The key is read from the environment and never printed.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CHALLENGE_CHIPS } from "../core/src/view/layers.ts";
import { answerOf } from "../core/src/judge/challenge.ts";
import { demoJudgeRound, parseJudgeRequest } from "../core/src/judge/judge.ts";
import { BUYER_MODEL, ClaudeReader } from "../server/src/adapters/claude.ts";

const ROOT = join(import.meta.dirname, "..");
const key = process.env.ANTHROPIC_API_KEY;
if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
const runs = Number(process.argv[2] ?? 30);
const reader = new ClaudeReader(key, readFileSync(join(ROOT, "server", "prompts", "reader.md"), "utf8"));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const buyer = { name: "no call", async decide() { return { type: "walk" as const, why: "No model call here." }; } };

const out = [];
for (const chip of CHALLENGE_CHIPS) {
  const asked = parseJudgeRequest({ note: chip.note, price: chip.price, mode: "ai" });
  if (!asked.ok) throw new Error(asked.error);
  const req = asked.value;
  const rounds = [];
  for (let i = 0; i < runs; i += 5) {
    rounds.push(...await Promise.all(Array.from({ length: Math.min(5, runs - i) }, async (_, j) => {
      const { events, reader: read } = await demoJudgeRound({ req, hash: sha, now: () => Date.now(), seed: i + j + 1, runId: `read-${i + j}`, ai: buyer, reader, aiState: "on", aiName: "none", where: "server" });
      const a = answerOf(events, req.note, req.price);
      return `${a.verdict}/${a.rule}/${a.type}/${read}`;
    })));
  }
  const tally: Record<string, number> = {};
  for (const r of rounds) tally[r] = (tally[r] ?? 0) + 1;
  console.log(chip.layer, JSON.stringify(tally));
  out.push({ layer: chip.layer, note: chip.note, price: chip.price, runs, tally });
}
writeFileSync(join(ROOT, "docs/fixtures/challenge-examples-read.json"), JSON.stringify({ about: "The Challenge's three examples, each a real demoJudgeRound with the real AI reader. Key: verdict/rule/kind/reader.", model: BUYER_MODEL, read: new Date().toISOString().slice(0, 10), examples: out }, null, 2) + "\n");

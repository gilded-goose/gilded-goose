// Record one tape (M2 step 3, ADR 0011): a real haggle with live Claude Haiku (the same raced
// buyer and honest prompt the server runs), every move saved with its input hash and how long
// it took, plus the run's ledger as the replay's expected output. A run with a fallback or a
// why-line the shopper must not read is not saved; it tries again, at most 3 times. Every live
// move, kept or not, goes to the move log, so the fallback count stays honest.
//
//   node --env-file=.env scripts/record-tape.ts --seed N [--week W]     (pnpm record:tape --seed N; week defaults to N)
//   writes docs/fixtures/tape-seed-N.json; ~15 Haiku calls × 3 racers, about a cent

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import {
  MemoryLedger, MOVE_TIMEOUT_MS, DEMO_WEEKS, isDemoWeek, demoDeps, demoGuard, demoSellers, demoWant, recordPort, runHaggle, whyProblems, DEMO_ENTRY, DEMO_SHOPPER, PATIENCE_RULE, OVER_ASK_RULE,
  type Tape, type TapeMove, type BuyerInput,
} from "@goose/core";
import { BUYER_MODEL, makeClaudeBuyer } from "../server/src/adapters/claude.ts";
import { appendMoves, type MoveRow } from "../server/src/move-log.ts";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const i = process.argv.indexOf("--seed");
const seed = Number(process.argv[i + 1]);
if (i === -1 || !Number.isInteger(seed) || seed < 1) { console.error("usage: record-tape.ts --seed N [--week W]"); process.exit(2); }
const wi = process.argv.indexOf("--week");
const week = wi === -1 ? seed : Number(process.argv[wi + 1]);
if (!isDemoWeek(week)) { console.error(`--week must be one of ${Object.keys(DEMO_WEEKS).join(", ")}`); process.exit(2); }
const key = process.env.ANTHROPIC_API_KEY;
if (!key) { console.error("ANTHROPIC_API_KEY is not set (.env)"); process.exit(2); }

const promptPath = new URL("../server/prompts/buyer.honest.md", import.meta.url);
const prompt = readFileSync(promptPath, "utf8");
const live = makeClaudeBuyer(key, prompt, { onRacerError: (e, p) => console.warn(`racer ${p} failed: ${e.message}`) });
await live.warm?.();
// One session per day of recording: back-to-back recordings are one sitting, not separate evidence for move-log.ts's 3+ sessions.
const SESSION = `record-tape-${new Date().toISOString().slice(0, 10)}`;
// Tries that failed in earlier runs of this script carry over (gitignored), so "kept 1 of N" counts every live try, not just this run's.
const pendingPath = new URL(`../.goose/tape-tries-seed-${seed}-week-${week}.json`, import.meta.url).pathname;
const discarded: string[] = existsSync(pendingPath) ? (JSON.parse(readFileSync(pendingPath, "utf8")) as string[]) : [];
const earlier = discarded.length;

for (let attempt = 1; attempt <= 3; attempt++) {
  // The same deterministic world the replay test builds (sim clock, seeded RNG, the shipped guard), so the stored ledger is what a replay must give.
  const deps = demoDeps(seed, sha256);
  const ledger = new MemoryLedger();
  const guard = demoGuard(deps, ledger);
  const moves: Array<TapeMove & { input: BuyerInput; at: string }> = [];
  await runHaggle({ want: demoWant(), sellers: demoSellers(week), buyer: recordPort(live, sha256, (m) => moves.push({ ...m, at: new Date().toISOString() })), guard, deps, ledger, shopperId: DEMO_SHOPPER, catalogId: DEMO_ENTRY });

  const buyerRows = ledger.read().filter((e) => e.actor === "buyer" && typeof e.data?.source === "string");
  const fellBack = buyerRows.filter((e) => e.data?.source === "rule-fallback");
  // Every live move to the move log, kept or not; the sim clock can't time them, so an answered move's time is its recorded dtMs and a fallback's is the budget it ran out of.
  const run = `${SESSION}-seed${seed}-try${attempt}-${randomBytes(3).toString("hex")}`;
  const rows: MoveRow[] = buyerRows.map((e) => {
    const fb = e.data?.source === "rule-fallback";
    // Matched by round: a malformed answer also reaches the sink, so counting entries could pair a row with the wrong move.
    const m = fb ? undefined : [...moves].reverse().find((x) => x.input.round === e.round);
    return { at: m?.at ?? new Date().toISOString(), session: SESSION, run, round: e.round ?? 0, source: String(e.data?.source), ...(fb ? { reason: String(e.data?.reason) } : {}), ms: m?.dtMs ?? MOVE_TIMEOUT_MS };
  });
  appendMoves(new URL("../.goose/moves.jsonl", import.meta.url).pathname, rows);

  const problems = moves.flatMap((m) => whyProblems(m.input, m.move).map((p) => `round ${m.input.round}: ${p}`));
  const dts = moves.map((m) => m.dtMs);
  // How often code had to hold an early accept: the prompt's own patience, measured (Joshua, 2026-10-23). Kept, never a reason to discard.
  const holds = ledger.read().filter((e) => e.data?.rule === PATIENCE_RULE || e.data?.rule === OVER_ASK_RULE).length;
  console.log(`seed ${seed} week ${week} try ${attempt}: ${moves.length} moves, dt ${dts.join("/")} ms, ${fellBack.length} fallbacks, ${problems.length} why problems, ${holds} code adjustments`);
  if (fellBack.length > 0 || problems.length > 0 || moves.length !== buyerRows.length) {
    for (const p of problems) console.log(`  ${p}`);
    discarded.push(fellBack.length > 0 ? "a move fell back to the plain rule" : problems.length > 0 ? `a why-line was wrong (${problems[0]})` : "an answer was unusable");
    // Saved after every failed try, so a crash or Ctrl-C later in this run can't drop it from the next "kept 1 of N".
    mkdirSync(new URL("../.goose/", import.meta.url).pathname, { recursive: true });
    writeFileSync(pendingPath, JSON.stringify(discarded));
    continue;
  }
  const tape: Tape = {
    v: 1,
    meta: { model: BUYER_MODEL, modelLabel: "Claude Haiku 5.5", recordedOn: new Date().toISOString().slice(0, 10), promptSha256: sha256(prompt), seed, week, item: demoWant().item, maxPrice: demoWant().maxPrice, tries: earlier + attempt, discarded },
    moves: moves.map(({ inputHash, move, dtMs }) => ({ inputHash, move, dtMs })),
    ledger: ledger.read().map(({ t: _t, ...rest }) => rest),
  };
  const out = new URL(`../docs/fixtures/tape-seed-${seed}.json`, import.meta.url).pathname;
  writeFileSync(out, JSON.stringify(tape, null, 1) + "\n");
  rmSync(pendingPath, { force: true });
  // The server reads tapes once at start, and `node --watch` doesn't watch JSON: a running dev server keeps the old one.
  console.log(`TAPE SAVED ${out} (kept 1 of ${earlier + attempt} live tries); restart the server to serve it`);
  process.exit(0);
}
console.error(`TAPE FAIL: seed ${seed} had a fallback or a bad why-line in 3 tries; nothing saved (the next run counts these ${discarded.length} tries too)`);
process.exit(1);

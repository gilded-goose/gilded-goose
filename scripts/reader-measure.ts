// W41 part 3: what the AI reader adds on a corpus of seller notes, measured live (it costs a few cents, so it is not in
// `pnpm check`). Each note is read as the judge box reads it: code's Watcher at history 50, then the same with the
// reader's reading folded in by `escalate`, under the judge box's own time limit. Prints both tallies, the reader's
// misses, and every ask still clear; writes the per-note verdicts to the out file.
//
//   node --env-file=.env scripts/reader-measure.ts <corpus.json> <out.json>
//
// The corpus is {"asks": [...], "fair": [...]}. The key is read from the environment and never printed.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { JUDGE_NOTE_TIMEOUT_MS, quoteNote, askReader, verdictOf, watch } from "@goose/core";
import { BUYER_MODEL, ClaudeReader } from "../server/src/adapters/claude.ts";

const [corpusPath, outPath] = process.argv.slice(2);
if (!corpusPath || !outPath) throw new Error("usage: reader-measure.ts <corpus.json> <out.json>");
const key = process.env.ANTHROPIC_API_KEY;
if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
const corpus = JSON.parse(readFileSync(corpusPath, "utf8")) as { asks: string[]; fair: string[] };
const reader = new ClaudeReader(key, readFileSync(join(import.meta.dirname, "..", "server", "prompts", "reader.md"), "utf8"));

type Row = { set: "asks" | "fair"; note: string; code: string; withReader: string; reading: unknown; miss?: string };
const rows: Row[] = [];
const jobs = [...corpus.asks.map((n) => ["asks", n] as const), ...corpus.fair.map((n) => ["fair", n] as const)];
const AT_ONCE = 5;
for (let i = 0; i < jobs.length; i += AT_ONCE) {
  await Promise.all(jobs.slice(i, i + AT_ONCE).map(async ([set, note]) => {
    const ev = { quoted: quoteNote(note), history: 50 };
    const { reading, miss } = await askReader(reader, { note, merchant: "Test shop", item: "Kettle" }, JUDGE_NOTE_TIMEOUT_MS);
    rows.push({ set, note, code: verdictOf(watch(ev)), withReader: verdictOf(watch({ ...ev, reading })), reading, ...(miss ? { miss } : {}) });
  }));
}

const tally = (set: Row["set"], k: "code" | "withReader") => {
  const t: Record<string, number> = { clear: 0, hold: 0, refuse: 0 };
  for (const r of rows) if (r.set === set) t[r[k]] = (t[r[k]] ?? 0) + 1;
  return `${t.clear} clear · ${t.hold} hold · ${t.refuse} refuse`;
};
const misses = rows.filter((r) => r.miss).reduce((m, r) => ({ ...m, [r.miss!]: (m[r.miss!] ?? 0) + 1 }), {} as Record<string, number>);
console.log(`reader ${BUYER_MODEL}, ${JUDGE_NOTE_TIMEOUT_MS} ms, history 50`);
console.log(`asks (${corpus.asks.length}): code ${tally("asks", "code")} | with reader ${tally("asks", "withReader")}`);
console.log(`fair (${corpus.fair.length}): code ${tally("fair", "code")} | with reader ${tally("fair", "withReader")}`);
console.log(`reader misses: ${JSON.stringify(misses)}`);
for (const r of rows) if (r.set === "asks" && r.withReader === "clear") console.log(`  still clear: ${r.note}`);
const RANK: Record<string, number> = { clear: 0, hold: 1, refuse: 2 };
const lowered = rows.filter((r) => RANK[r.withReader]! < RANK[r.code]!);
if (lowered.length) { console.error(`LOWERED ${lowered.length}: the reader must never lower a verdict`); process.exitCode = 1; }
writeFileSync(outPath, JSON.stringify({ model: BUYER_MODEL, timeoutMs: JUDGE_NOTE_TIMEOUT_MS, history: 50, corpus: corpusPath, rows }, null, 2) + "\n");
